import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js'
import { buildEmbed, withStatusEmoji } from '../../utils/embedBuilder.js'
import { ensureCommandAccess } from '../../utils/accessGuards.js'
import {
  createGiveaway,
  ensureGiveawayTables,
  listActiveGiveaways,
  cancelGiveawayByMessageId,
  parseForcedWinnerInput,
  parseGiveawayGainInput,
  parseGiveawayDurationInput,
  startGiveawayScheduler,
} from '../../utils/giveawayManager.js'
import { parseGiveawayMessageRef } from '../../utils/giveawayUtils.js'
import {
  ensureGuild,
  parseChannelId,
  parseIntInRange,
  safeTrim,
} from '../../utils/commandToolkit.js'

import { defineUtilsCommand } from '../../utils/commandHelpers.js'

function buildUsageEmbed() {
  return buildEmbed({
    variant: 'info',
    title: 'Giveaway',
    description: [
      '`+giveaway` : ouvre le panel interactif',
      '`+giveaway list` : liste les giveaways actifs',
      '`+giveaway cancel <messageId|lien>` : annule un giveaway actif',
      '`+endgiveaway <messageId|lien>` : termine immédiatement',
      '`+reroll <messageId|lien> [gagnants]` : nouveau tirage',
    ].join('\n'),
  })
}

const COIN_NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR')

function resolveCurrencyConfig(client) {
  const maybeConfig = client?.config || {}
  const currencyName = safeTrim(
    maybeConfig?.currency?.name
      || maybeConfig?.currencyName
      || maybeConfig?.economy?.currencyName
      || 'Coins',
    40
  ) || 'Coins'
  const currencyEmoji = safeTrim(
    maybeConfig?.currency?.coinEmoji
      || maybeConfig?.currency?.emoji
      || maybeConfig?.coinEmoji
      || '',
    64
  )

  return { currencyName, currencyEmoji }
}

function formatCoins(amount, currencyName, currencyEmoji = '') {
  const value = Math.max(0, Number.parseInt(amount, 10) || 0)
  const formatted = COIN_NUMBER_FORMATTER.format(value)
  if (currencyEmoji) return `${formatted} ${currencyEmoji}`
  return `${formatted} 🪙`
}

function createDraft(message) {
  return {
    gainCoins: 10_000,
    durationMs: 60 * 60 * 1000,
    durationLabel: '1h',
    winnersCount: 1,
    targetChannelId: message.channelId,
    entryMode: 'button',
    entryEmoji: '💎',
    entryEmojiLabel: '💎',
    forcedWinnerIds: [],
  }
}

function formatEntryMode(mode, emoji) {
  if (mode === 'reaction') {
    return `Réaction ${emoji}`
  }
  return `Bouton ${emoji}`
}

function buildDraftEmbed(draft, authorId, currency) {
  const endAt = Math.floor((Date.now() + draft.durationMs) / 1000)
  const forcedPreview = draft.forcedWinnerIds.length
    ? draft.forcedWinnerIds.slice(0, 8).map((id) => `<@${id}>`).join(', ')
    : 'Aucun'
  const gainLine = formatCoins(draft.gainCoins, currency.currencyName, currency.currencyEmoji)

  return buildEmbed({
    variant: 'info',
    title: 'Panel Giveaway',
    description: [
      `Hôte: <@${authorId}>`,
      `Gain total: **${gainLine}**`,
      `Durée: **${draft.durationLabel}**`,
      `Fin estimée: <t:${endAt}:R>`,
      `Nombre de gagnants: **${draft.winnersCount}**`,
      `Salon cible: <#${draft.targetChannelId}>`,
      `Participation: **${formatEntryMode(draft.entryMode, draft.entryEmojiLabel || draft.entryEmoji)}**`,
      `Gagnants imposés: **${draft.forcedWinnerIds.length}**`,
      forcedPreview !== 'Aucun' ? `Liste: ${safeTrim(forcedPreview, 700)}` : 'Liste: Aucun',
    ].join('\n'),
  })
}

function buildPanelComponents(ownerId, { disabled = false } = {}) {
  const selectId = `gawpanel:${ownerId}:select`
  const startId = `gawpanel:${ownerId}:start`
  const cancelId = `gawpanel:${ownerId}:cancel`

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(selectId)
        .setDisabled(disabled)
        .setPlaceholder('Configurer le giveaway')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Gain (coins)').setValue('gain').setEmoji('💰'),
          new StringSelectMenuOptionBuilder().setLabel('Durée').setValue('duration').setEmoji('⏱️'),
          new StringSelectMenuOptionBuilder().setLabel('Nombre de gagnants').setValue('winners').setEmoji('🏆'),
          new StringSelectMenuOptionBuilder().setLabel('Salon cible').setValue('channel').setEmoji('📢'),
          new StringSelectMenuOptionBuilder().setLabel('Mode participation').setValue('entry_mode').setEmoji('🎮'),
          new StringSelectMenuOptionBuilder().setLabel('Emoji participation').setValue('entry_emoji').setEmoji('😀'),
          new StringSelectMenuOptionBuilder().setLabel('Gagnants imposés').setValue('forced_winners').setEmoji('🎯')
        )
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(startId)
        .setLabel('Lancer')
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Annuler')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled)
    ),
  ]
}

async function deleteQuietly(message) {
  if (!message?.deletable) return
  await message.delete().catch(() => null)
}

async function askInput(channel, userId, prompt, { maxLen = 350, timeoutMs = 90_000 } = {}) {
  const promptMsg = await channel.send({
    embeds: [buildEmbed({ variant: 'info', description: prompt })],
  }).catch(() => null)
  if (!promptMsg) return { ok: false, reason: 'send_failed' }

  const filter = (m) => m.author?.id === userId && !m.author.bot
  const collected = await channel
    .awaitMessages({ filter, max: 1, time: timeoutMs, errors: ['time'] })
    .catch(() => null)
  const answer = collected?.first?.() || null

  if (!answer) {
    await deleteQuietly(promptMsg)
    return { ok: false, reason: 'timeout' }
  }

  const value = safeTrim(answer.content, maxLen)
  await Promise.allSettled([deleteQuietly(promptMsg), deleteQuietly(answer)])
  return { ok: true, value }
}

function resolveTextChannel(guild, input) {
  const raw = safeTrim(input, 120)
  if (!raw || !guild?.channels?.cache) return null

  const parsedId = parseChannelId(raw)
  if (parsedId) {
    const byId = guild.channels.cache.get(parsedId)
    if (byId?.isTextBased?.()) return byId
  }

  const bySnowflake = guild.channels.cache.get(raw)
  if (bySnowflake?.isTextBased?.()) return bySnowflake

  const byName = guild.channels.cache.find(
    (channel) =>
      channel.isTextBased?.() &&
      channel.name?.toLowerCase?.() === raw.toLowerCase()
  )
  return byName || null
}

function parseEntryModeInput(input) {
  const raw = safeTrim(input, 40).toLowerCase()
  if (['button', 'bouton', 'btn'].includes(raw)) return { ok: true, mode: 'button' }
  if (['reaction', 'réaction', 'react', 'emoji'].includes(raw)) return { ok: true, mode: 'reaction' }
  return { ok: false, error: 'Choix invalide. Réponds `button` ou `reaction`.' }
}

function parseEntryEmojiInput(input) {
  const raw = safeTrim(input, 120)
  if (!raw) {
    return { ok: false, error: 'Emoji vide.' }
  }

  const lowered = raw.toLowerCase()
  if (['default', 'defaut', 'défaut', 'reset'].includes(lowered)) {
    return { ok: true, emoji: '💎', display: '💎', customId: null }
  }

  const custom = /^<a?:[\w-]{2,32}:(\d{17,20})>$/.exec(raw)
  if (custom?.[1]) {
    return { ok: true, emoji: raw, display: raw, customId: custom[1] }
  }

  if (/^\d{17,20}$/.test(raw)) {
    return { ok: true, emoji: raw, display: `<:emoji:${raw}>`, customId: raw }
  }

  try {
    const test = new ButtonBuilder()
      .setCustomId('emoji:test')
      .setLabel('test')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(raw)

    if (test) {
      return { ok: true, emoji: raw, display: raw, customId: null }
    }
  } catch {
    return { ok: false, error: 'Emoji invalide. Utilise un emoji unicode ou un emoji custom du serveur.' }
  }

  return { ok: false, error: 'Emoji invalide.' }
}

async function resolveEntryEmojiForGuild(guild, parsed) {
  if (!parsed?.ok) return parsed
  if (!parsed.customId) return parsed

  const emoji = guild.emojis.cache.get(parsed.customId)
    || await guild.emojis.fetch(parsed.customId).catch(() => null)

  if (!emoji) {
    return { ok: false, error: 'Emoji custom introuvable dans ce serveur.' }
  }

  return {
    ok: true,
    emoji: emoji.toString(),
    display: emoji.toString(),
    customId: emoji.id,
  }
}

async function resolveForcedWinners(guild, rawInput) {
  const parsed = parseForcedWinnerInput(rawInput)
  if (!parsed.ok) return parsed

  if (!parsed.ids.length) {
    return { ok: true, ids: [] }
  }

  const valid = []
  const seen = new Set()

  for (const id of parsed.ids) {
    if (seen.has(id)) continue
    seen.add(id)

    const member = guild.members.cache.get(id)
      || await guild.members.fetch(id).catch(() => null)

    if (!member || member.user?.bot) continue
    valid.push(member.id)
  }

  if (!valid.length) {
    return { ok: false, error: 'Aucun gagnant imposé valide dans ce serveur.' }
  }

  return { ok: true, ids: valid }
}

async function handleListGiveaways(client, message, guild) {
  const rows = listActiveGiveaways(client.db, guild.id, 20)
  if (!rows.length) {
    return message.reply({
      embeds: [buildEmbed({ variant: 'info', description: withStatusEmoji(false, 'Aucun giveaway actif.') })],
    })
  }

  const lines = rows.map((row, index) => {
    const reward = formatCoins(row.reward_coins, row.currency_name || 'Coins', row.currency_emoji || '')
    return `${index + 1}. [jump](https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}) • <#${row.channel_id}> • <t:${row.end_at}:R> • ${row.entries_count} participants • mode ${row.entry_mode === 'reaction' ? 'réaction' : 'bouton'} • **${reward}**`
  })

  return message.reply({
    embeds: [
      buildEmbed({
        variant: 'info',
        title: 'Giveaways actifs',
        description: safeTrim(lines.join('\n'), 3900),
      }),
    ],
  })
}

async function handleCancelGiveaway(client, message, guild, args) {
  const reference = parseGiveawayMessageRef(args[1] || '')
  if (!reference?.messageId) {
    return message.reply({
      embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Usage: +giveaway cancel <messageId|lien>') })],
    })
  }
  if (reference.guildId && reference.guildId !== guild.id) {
    return message.reply({
      embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Le lien ne correspond pas à ce serveur.') })],
    })
  }

  const cancelled = await cancelGiveawayByMessageId(client, reference.messageId, message.author.id)
  if (!cancelled.ok) {
    const map = {
      not_found: 'Giveaway introuvable.',
      not_active: 'Ce giveaway n’est pas actif.',
      update_failed: 'Impossible d’annuler le giveaway.',
    }
    return message.reply({
      embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, map[cancelled.reason] || 'Annulation impossible.') })],
    })
  }

  return message.reply({
    embeds: [buildEmbed({ variant: 'success', description: withStatusEmoji(true, `Giveaway annulé: ${cancelled.giveaway.message_id}`) })],
  })
}

export default defineUtilsCommand({
  name: 'giveaway',
  aliases: ['gaw'],
  requiredLevel: 2,
  async run(client, message, args) {
    const access = ensureCommandAccess(client, message, this)
    if (!access.ok) return access.reply

    const guildGuard = ensureGuild({ message })
    if (!guildGuard.ok) {
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Commande serveur uniquement.') })],
      })
    }

    if (!client?.db?.prepare) {
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Service indisponible (DB).') })],
      })
    }

    const setup = ensureGiveawayTables(client.db)
    if (!setup.ok) {
      console.error('[giveaway] ensure tables error', setup.error)
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Impossible d’initialiser le système giveaway.') })],
      })
    }

    startGiveawayScheduler(client)

    const sub = safeTrim(args[0], 30).toLowerCase()
    if (sub === 'help') {
      return message.reply({ embeds: [buildUsageEmbed()] })
    }
    if (sub === 'list') {
      return handleListGiveaways(client, message, guildGuard.guild)
    }
    if (sub === 'cancel') {
      return handleCancelGiveaway(client, message, guildGuard.guild, args)
    }

    const me = guildGuard.guild.members?.me
    const perms = message.channel.permissionsFor(me)
    if (
      !perms?.has(PermissionFlagsBits.ViewChannel) ||
      !perms?.has(PermissionFlagsBits.SendMessages) ||
      !perms?.has(PermissionFlagsBits.EmbedLinks) ||
      !perms?.has(PermissionFlagsBits.ReadMessageHistory)
    ) {
      return message.reply({
        embeds: [
          buildEmbed({
            variant: 'error',
            description: withStatusEmoji(false, 'Permissions bot manquantes ici: ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory.'),
          }),
        ],
      })
    }

    const ownerId = message.author.id
    const draft = createDraft(message)
    const currency = resolveCurrencyConfig(client)
    const panel = await message.reply({
      embeds: [buildDraftEmbed(draft, ownerId, currency)],
      components: buildPanelComponents(ownerId),
    })

    const selectId = `gawpanel:${ownerId}:select`
    const startId = `gawpanel:${ownerId}:start`
    const cancelId = `gawpanel:${ownerId}:cancel`

    let closed = false
    let awaiting = false

    const collector = panel.createMessageComponentCollector({ time: 15 * 60 * 1000 })

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== ownerId) {
        return interaction
          .reply({ content: 'Seul l’auteur de la commande peut utiliser ce panel.', flags: MessageFlags.Ephemeral })
          .catch(() => null)
      }

      if (closed) {
        return interaction
          .reply({ content: 'Ce panel est fermé.', flags: MessageFlags.Ephemeral })
          .catch(() => null)
      }

      if (interaction.customId === cancelId) {
        closed = true
        collector.stop('cancelled')
        return interaction
          .update({
            embeds: [buildEmbed({ variant: 'warn', description: withStatusEmoji(false, 'Création giveaway annulée.') })],
            components: [],
          })
          .catch(() => null)
      }

      if (interaction.customId === startId) {
        if (awaiting) {
          return interaction
            .reply({ content: 'Une configuration est déjà en cours.', flags: MessageFlags.Ephemeral })
            .catch(() => null)
        }

        await interaction.deferUpdate().catch(() => null)

        const targetChannel = guildGuard.guild.channels.cache.get(draft.targetChannelId)
        if (!targetChannel?.isTextBased?.()) {
          return interaction
            .followUp({ content: 'Salon cible invalide.', flags: MessageFlags.Ephemeral })
            .catch(() => null)
        }

        if (!Number.isSafeInteger(draft.gainCoins) || draft.gainCoins <= 0) {
          return interaction
            .followUp({ content: 'Configure d’abord un gain valide en coins.', flags: MessageFlags.Ephemeral })
            .catch(() => null)
        }

        const targetPerms = targetChannel.permissionsFor(me)
        if (
          !targetPerms?.has(PermissionFlagsBits.ViewChannel) ||
          !targetPerms?.has(PermissionFlagsBits.SendMessages) ||
          !targetPerms?.has(PermissionFlagsBits.EmbedLinks) ||
          !targetPerms?.has(PermissionFlagsBits.ReadMessageHistory) ||
          (draft.entryMode === 'reaction' && !targetPerms?.has(PermissionFlagsBits.AddReactions))
        ) {
          return interaction
            .followUp({
              content: draft.entryMode === 'reaction'
                ? 'Je n’ai pas les permissions nécessaires dans le salon cible (incluant AddReactions).'
                : 'Je n’ai pas les permissions nécessaires dans le salon cible.',
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => null)
        }

        const created = await createGiveaway(client, {
          guild: guildGuard.guild,
          channel: targetChannel,
          hostId: ownerId,
          rewardCoins: draft.gainCoins,
          currencyName: currency.currencyName,
          currencyEmoji: currency.currencyEmoji,
          durationMs: draft.durationMs,
          winnersCount: draft.winnersCount,
          entryMode: draft.entryMode,
          entryEmoji: draft.entryEmoji,
          forcedWinnerIds: draft.forcedWinnerIds,
        })

        if (!created.ok) {
          const reasonMap = {
            invalid_gain: 'Gain invalide (coins).',
            gain_lower_than_winners: 'Le gain total doit être au moins égal au nombre de gagnants.',
          }
          return interaction
            .followUp({
              content: reasonMap[created.error] || `Erreur création giveaway (${created.error || 'unknown_error'}).`,
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => null)
        }

        closed = true
        collector.stop('started')

        await panel
          .edit({
            embeds: [
              buildEmbed({
                variant: 'success',
                description:
                  withStatusEmoji(true, `Giveaway lancé dans <#${created.giveaway.channel_id}>.`)
                  + `\nMessage: https://discord.com/channels/${created.giveaway.guild_id}/${created.giveaway.channel_id}/${created.giveaway.message_id}`,
              }),
            ],
            components: [],
          })
          .catch(() => null)
        return
      }

      if (interaction.customId !== selectId || !interaction.isStringSelectMenu()) return

      if (awaiting) {
        return interaction
          .reply({ content: 'Une configuration est déjà en cours.', flags: MessageFlags.Ephemeral })
          .catch(() => null)
      }

      awaiting = true
      await interaction.deferUpdate().catch(() => null)
      const option = interaction.values?.[0]

      const fail = async (content) => {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => null)
      }

      try {
        if (option === 'gain') {
          const answer = await askInput(
            message.channel,
            ownerId,
            `Gain total en coins ? (ex: 25000)`,
            { maxLen: 80 }
          )
          if (!answer.ok) return fail('Temps écoulé.')
          const parsed = parseGiveawayGainInput(answer.value)
          if (!parsed.ok) return fail(parsed.error || 'Gain invalide.')
          draft.gainCoins = parsed.coins
        } else if (option === 'duration') {
          const answer = await askInput(message.channel, ownerId, 'Durée ? (ex: 30m, 2h, 1d)', { maxLen: 40 })
          if (!answer.ok) return fail('Temps écoulé.')
          const parsed = parseGiveawayDurationInput(answer.value)
          if (!parsed.ok) return fail(parsed.error || 'Durée invalide.')
          draft.durationMs = parsed.durationMs
          draft.durationLabel = parsed.normalized
        } else if (option === 'winners') {
          const answer = await askInput(message.channel, ownerId, 'Nombre de gagnants ? (1-50)', { maxLen: 3 })
          if (!answer.ok) return fail('Temps écoulé.')
          const winners = parseIntInRange(answer.value, 1, 50)
          if (!Number.isInteger(winners)) return fail('Nombre invalide (1-50).')
          draft.winnersCount = winners
        } else if (option === 'channel') {
          const answer = await askInput(message.channel, ownerId, 'Salon cible ? (mention, ID, ou nom)', { maxLen: 120 })
          if (!answer.ok) return fail('Temps écoulé.')
          const channel = resolveTextChannel(guildGuard.guild, answer.value)
          if (!channel) return fail('Salon introuvable ou non textuel.')
          draft.targetChannelId = channel.id
        } else if (option === 'entry_mode') {
          const answer = await askInput(message.channel, ownerId, 'Mode de participation ? (`button` ou `reaction`)', { maxLen: 30 })
          if (!answer.ok) return fail('Temps écoulé.')
          const parsed = parseEntryModeInput(answer.value)
          if (!parsed.ok) return fail(parsed.error)
          draft.entryMode = parsed.mode
        } else if (option === 'entry_emoji') {
          const answer = await askInput(
            message.channel,
            ownerId,
            'Emoji de participation ? (unicode ou emoji custom du serveur, `default` pour 💎)',
            { maxLen: 120 }
          )
          if (!answer.ok) return fail('Temps écoulé.')

          const parsedEmoji = parseEntryEmojiInput(answer.value)
          if (!parsedEmoji.ok) return fail(parsedEmoji.error || 'Emoji invalide.')

          const resolvedEmoji = await resolveEntryEmojiForGuild(guildGuard.guild, parsedEmoji)
          if (!resolvedEmoji.ok) return fail(resolvedEmoji.error || 'Emoji invalide.')

          draft.entryEmoji = resolvedEmoji.emoji
          draft.entryEmojiLabel = resolvedEmoji.display
        } else if (option === 'forced_winners') {
          const answer = await askInput(
            message.channel,
            ownerId,
            'Gagnants imposés ? (mentions/IDs séparés par espaces, ou `off` pour vider)',
            { maxLen: 1900 }
          )
          if (!answer.ok) return fail('Temps écoulé.')

          const resolved = await resolveForcedWinners(guildGuard.guild, answer.value)
          if (!resolved.ok) return fail(resolved.error || 'Entrée invalide.')
          draft.forcedWinnerIds = resolved.ids
        }

        await panel
          .edit({
            embeds: [buildDraftEmbed(draft, ownerId, currency)],
            components: buildPanelComponents(ownerId),
          })
          .catch(() => null)
      } finally {
        awaiting = false
      }
    })

    collector.on('end', async () => {
      if (closed) return
      await panel
        .edit({
          embeds: [buildEmbed({ variant: 'warn', description: withStatusEmoji(false, 'Panel giveaway expiré.') })],
          components: [],
        })
        .catch(() => null)
    })
  },
})
