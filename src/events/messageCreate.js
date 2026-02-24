import { buildEmbed, withStatusEmoji } from '../utils/embedBuilder.js'
import { resolveAccess, resolveBlacklist } from '../utils/access.js'
import { msToHuman } from '../utils/time.js'
import { isTestMode } from '../utils/botMode.js'
import { processMessageGains } from '../utils/gainSystem.js'
import { runWithRequestContext } from '../utils/requestContext.js'
import { writeLog } from '../utils/logSystem.js'
import { takeBurstHit } from '../utils/runtimeGuards.js'

const GLOBAL_COMMAND_COOLDOWN_KEY = '__global_command__'

function resolveCommand(client, inputName) {
  const name = String(inputName).toLowerCase()
  const direct = client.commands.get(name)
  if (direct) return direct

  const alias = client.aliases.get(name)
  if (!alias) return null
  return client.commands.get(alias) || null
}

function shouldRequireProfile(command) {
  if (command.profileRequired === false) return false
  return true
}

function buildAccessDeniedMessage(check) {
  if (check.reason === 'buyer_only') return 'Commande réservée au buyer.'
  if (check.reason === 'owner_only') return 'Commande réservée aux owners.'
  if (check.reason === 'group_role_required') return `Rôle requis: un rôle du groupe ${check.requiredGroup}.`
  if (check.reason === 'group_too_low') return `Permissions insuffisantes. Groupe requis: ${check.requiredGroup}.`
  return 'Accès refusé.'
}

function resolveCooldownMs(rawValue) {
  const parsed = Number.parseInt(rawValue ?? 0, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function resolveBoundedInt(rawValue, fallback, min, max) {
  const parsed = Number.parseInt(rawValue ?? fallback, 10)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

function shouldApplyGlobalCooldown(command) {
  return command?.globalCooldown !== false
}

function writeLogAsync(client, payload) {
  void writeLog(client, payload).catch(() => null)
}

export default {
  name: 'messageCreate',
  async execute(client, message) {
    if (!message?.content || message.author?.bot) return

    let shouldRunMessageGains = true
    const queueMessageGains = () => {
      if (!message.guild || !shouldRunMessageGains) return
      setImmediate(() => {
        void processMessageGains(client, message).catch(() => null)
      })
    }

    try {
      const configuredPrefix = client.config?.prefix || '+'
      const prefixes = Array.from(new Set([configuredPrefix, '.']))
      const usedPrefix = prefixes.find((prefix) => message.content.startsWith(prefix))
      if (!usedPrefix) return
      shouldRunMessageGains = false

      const raw = message.content.slice(usedPrefix.length).trim()
      if (!raw) return
      const maxCommandChars = resolveBoundedInt(client.config?.security?.maxCommandChars, 320, 24, 4000)
      if (raw.length > maxCommandChars) {
        await message.reply({
          embeds: [
            buildEmbed(client.config, {
              variant: 'warning',
              description: withStatusEmoji(client.config, false, `Commande trop longue. Limite: ${maxCommandChars} caractères.`),
            }),
          ],
        }).catch(() => null)
        return
      }

      const parts = raw.split(/\s+/)
      const commandInput = (parts.shift() || '').toLowerCase()
      if (!commandInput) return

      const command = resolveCommand(client, commandInput)
      if (!command) return

      const args = parts

      if (command.guildOnly !== false && !message.guild) {
        await message.reply({
          embeds: [
            buildEmbed(client.config, {
              variant: 'error',
              description: withStatusEmoji(client.config, false, 'Commande serveur uniquement.'),
            }),
          ],
        }).catch(() => null)
        return
      }

      const isBuyer = message.author.id === client.config.buyerId
      const isOwner = client.store.isOwner(message.author.id)

      if (message.guild && !isBuyer && !isOwner) {
        const burst = takeBurstHit(client, {
          bucket: 'commands',
          key: `${message.guild.id}:${message.author.id}`,
          windowMs: client.config?.security?.commandBurstWindowMs ?? 5000,
          maxHits: client.config?.security?.commandBurstMax ?? 7,
          blockMs: client.config?.security?.commandBurstBlockMs ?? 12_000,
          notifyEveryMs: client.config?.security?.commandBurstNotifyMs ?? 5_000,
        })

        if (!burst.allowed) {
          if (burst.shouldNotify) {
            writeLogAsync(client, {
              guild: message.guild,
              logType: 'anticheat',
              severity: 'warning',
              actorId: message.author.id,
              targetUserId: message.author.id,
              commandName: command.name,
              description: `Flood commandes détecté. Blocage temporaire (${burst.retryAfterMs}ms).`,
              data: {
                retryAfterMs: burst.retryAfterMs,
              },
            })

            await message.reply({
              embeds: [
                buildEmbed(client.config, {
                  variant: 'warning',
                  description: withStatusEmoji(client.config, false, `Trop de commandes envoyées trop vite. Réessayez dans ${msToHuman(burst.retryAfterMs)}.`),
                }),
              ],
            }).catch(() => null)
          }
          return
        }
      }

      if (message.guild && shouldRequireProfile(command) && !client.store.hasProfile(message.author.id)) {
        writeLogAsync(client, {
          guild: message.guild,
          logType: 'security',
          severity: 'warning',
          actorId: message.author.id,
          commandName: command.name,
          description: 'Commande bloquée: profil non créé.',
        })

        await message.reply({
          embeds: [
            buildEmbed(client.config, {
              variant: 'warning',
              description: [
                withStatusEmoji(client.config, false, 'Aucun profil trouvé.'),
                'Utilisez le bouton **Profil** envoyé par la commande `setup`.',
              ].join('\n'),
            }),
          ],
        }).catch(() => null)
        return
      }

      if (!isBuyer && !isOwner) {
        const blacklist = resolveBlacklist(client, message.author.id)
        if (!blacklist.ok) {
          writeLogAsync(client, {
            guild: message.guild,
            logType: 'security',
            severity: 'warning',
            actorId: message.author.id,
            commandName: command.name,
            description: `Commande refusée: utilisateur blacklisté (${blacklist.details?.type || 'unknown'}).`,
            data: blacklist.details || null,
          })

          await message.reply({
            embeds: [
              buildEmbed(client.config, {
                variant: 'error',
                description: withStatusEmoji(client.config, false, blacklist.message),
              }),
            ],
          }).catch(() => null)
          return
        }
      }

      if (message.guild && command.blockable && !isBuyer && !isOwner) {
        if (client.store.isCommandBlocked(message.guild.id, command.name)) {
          writeLogAsync(client, {
            guild: message.guild,
            logType: 'commands',
            severity: 'warning',
            actorId: message.author.id,
            commandName: command.name,
            description: 'Commande de jeu bloquée par la configuration serveur.',
          })

          await message.reply({
            embeds: [
              buildEmbed(client.config, {
                variant: 'warning',
                description: withStatusEmoji(client.config, false, 'Cette commande de jeu est actuellement bloquée.'),
              }),
            ],
          }).catch(() => null)
          return
        }
      }

      if (message.guild) {
        const access = resolveAccess(client, message, command)
        if (!access.ok) {
          writeLogAsync(client, {
            guild: message.guild,
            logType: 'security',
            severity: 'warning',
            actorId: message.author.id,
            commandName: command.name,
            description: `Refus d’accès commande: ${access.reason || 'unknown'}.`,
            data: access,
          })

          await message.reply({
            embeds: [
              buildEmbed(client.config, {
                variant: 'error',
                description: withStatusEmoji(client.config, false, buildAccessDeniedMessage(access)),
              }),
            ],
          }).catch(() => null)
          return
        }
      }

      const rawCooldown = typeof command.cooldownMs === 'function'
        ? command.cooldownMs(client)
        : command.cooldownMs
      const cooldownMs = resolveCooldownMs(rawCooldown)
      const globalCooldownMs = resolveCooldownMs(client.config?.cooldowns?.globalCommandMs)
      const buyerBypassCooldown = isBuyer && isTestMode(client)
      const shouldUseGlobalCooldown = shouldApplyGlobalCooldown(command)

      if (message.guild && !buyerBypassCooldown) {
        const guildId = message.guild.id
        const userId = message.author.id

        if (globalCooldownMs > 0 && shouldUseGlobalCooldown) {
          const globalRemaining = client.store.getCooldownRemaining(
            guildId,
            userId,
            GLOBAL_COMMAND_COOLDOWN_KEY,
            globalCooldownMs
          )
          if (globalRemaining > 0) {
            writeLogAsync(client, {
              guild: message.guild,
              logType: 'commands',
              severity: 'info',
              actorId: userId,
              commandName: command.name,
              description: `Cooldown global actif: ${globalRemaining}ms restants.`,
            })

            await message.reply({
              embeds: [
                buildEmbed(client.config, {
                  variant: 'warning',
                  description: withStatusEmoji(client.config, false, `Patientez ${msToHuman(globalRemaining)} avant d'utiliser une nouvelle commande.`),
                }),
              ],
            }).catch(() => null)
            return
          }
        }

        if (cooldownMs > 0) {
          const remaining = client.store.getCooldownRemaining(guildId, userId, command.name, cooldownMs)
          if (remaining > 0) {
            writeLogAsync(client, {
              guild: message.guild,
              logType: 'commands',
              severity: 'info',
              actorId: userId,
              commandName: command.name,
              description: `Cooldown actif: ${remaining}ms restants.`,
            })

            await message.reply({
              embeds: [
                buildEmbed(client.config, {
                  variant: 'warning',
                  description: withStatusEmoji(client.config, false, `Patientez ${msToHuman(remaining)} avant de réutiliser cette commande.`),
                }),
              ],
            }).catch(() => null)
            return
          }
        }

        if (globalCooldownMs > 0 && shouldUseGlobalCooldown) {
          client.store.setCooldown(guildId, userId, GLOBAL_COMMAND_COOLDOWN_KEY)
        }
        if (cooldownMs > 0) {
          client.store.setCooldown(guildId, userId, command.name)
        }
      }

      const context = {
        client,
        message,
        args,
        isBuyer,
        isOwner,
        prefix: usedPrefix,
        commandName: command.name,
        reply: (payload) => message.reply(payload),
        embed: (options) => buildEmbed(client.config, options),
        status: (ok, text) => withStatusEmoji(client.config, ok, text),
      }

      const requestContext = {
        guildId: message.guild?.id || null,
        channelId: message.channel?.id || null,
        messageId: message.id || null,
        actorId: message.author.id,
        commandName: command.name,
      }

      try {
        await runWithRequestContext(requestContext, async () => {
          if (typeof command.execute === 'function') {
            await command.execute(context)
            if (message.guild) {
              writeLogAsync(client, {
                guild: message.guild,
                logType: 'commands',
                severity: 'info',
                actorId: message.author.id,
                commandName: command.name,
                description: `Commande exécutée: ${command.name}`,
              })
            }
            return
          }

          if (typeof command.run === 'function') {
            await command.run(client, message, args)
            if (message.guild) {
              writeLogAsync(client, {
                guild: message.guild,
                logType: 'commands',
                severity: 'info',
                actorId: message.author.id,
                commandName: command.name,
                description: `Commande exécutée: ${command.name}`,
              })
            }
          }
        })
      } catch (error) {
        if (message.guild) {
          writeLogAsync(client, {
            guild: message.guild,
            logType: 'errors',
            severity: 'error',
            actorId: message.author.id,
            commandName: command.name,
            description: `Erreur commande: ${error?.message || 'unknown'}`,
            data: {
              stack: String(error?.stack || '').slice(0, 3000),
            },
          })
        }

        await message.reply({
          embeds: [
            buildEmbed(client.config, {
              variant: 'error',
              description: withStatusEmoji(client.config, false, `Erreur interne: ${error.message || 'unknown'}`),
            }),
          ],
        }).catch(() => null)
      }
    } finally {
      queueMessageGains()
    }
  },
}
