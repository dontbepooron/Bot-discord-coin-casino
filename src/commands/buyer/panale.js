import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { parseUserId } from '../../utils/commandToolkit.js'
import { formatCoinsBackticks } from '../../utils/format.js'
import { getBotMode, setBotMode } from '../../utils/botMode.js'
import { ensureDrawSystemRolesForGuild } from '../../utils/drawRoleManager.js'

const FR = new Intl.NumberFormat('fr-FR')

const VIEWS = {
  home: 'home',
  coins: 'coins',
  commands: 'commands',
  system: 'system',
}

const CONFIRM_ACTIONS = {
  coins_resetall: 'Reset global des coins',
  clear_sanctions: 'Suppression de toutes les sanctions',
  reset_db: 'Reset complet de la base',
}

function parseCoinsAmount(raw) {
  const n = Number.parseInt(String(raw || '').replace(/[\s,_]/g, ''), 10)
  if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null
  return n
}

function getBlockableCommands(client) {
  return [...client.commands.values()]
    .filter((cmd) => cmd.blockable)
    .map((cmd) => cmd.name)
    .sort((a, b) => a.localeCompare(b))
}

function makeNavButton(nonce, key, label, currentView) {
  return new ButtonBuilder()
    .setCustomId(`panale:${nonce}:nav:${key}`)
    .setLabel(label)
    .setStyle(currentView === key ? ButtonStyle.Secondary : ButtonStyle.Primary)
}

function buildPanelPayload({
  client,
  message,
  embed,
  status,
  nonce,
  view,
  note,
  confirmAction,
}) {
  const blockedRows = client.store.listBlockedCommands(message.guild.id)
  const blockedCount = blockedRows.length
  const ownerCount = client.store.listOwners().length
  const profilesWithCoins = client.store.listGuildUsersWithProfile(message.guild.id, { minCoins: 1 }).length
  const mode = getBotMode(client).toUpperCase()

  const overviewLines = [
    `Vue active: **${view}**`,
    `Mode bot: **${mode}**`,
    `Owners: **${ownerCount}**`,
    `Commandes bloquées: **${blockedCount}**`,
    `Profils avec coins > 0: **${profilesWithCoins}**`,
    '',
    note || status(true, 'Panel prêt.'),
  ]

  if (confirmAction && CONFIRM_ACTIONS[confirmAction]) {
    overviewLines.push('')
    overviewLines.push(status(false, `Confirmation requise: ${CONFIRM_ACTIONS[confirmAction]}.`))
    overviewLines.push('Cliquez sur **Confirmer** ou **Annuler** ci-dessous.')
  }

  const panelEmbed = embed({
    variant: 'info',
    title: 'Panale Buyer',
    description: overviewLines.join('\n'),
  })

  const rows = [
    new ActionRowBuilder().addComponents(
      makeNavButton(nonce, VIEWS.home, 'Accueil', view),
      makeNavButton(nonce, VIEWS.coins, 'Coins', view),
      makeNavButton(nonce, VIEWS.commands, 'Commandes', view),
      makeNavButton(nonce, VIEWS.system, 'Système', view),
      new ButtonBuilder().setCustomId(`panale:${nonce}:nav:close`).setLabel('Fermer').setStyle(ButtonStyle.Danger)
    ),
  ]

  if (view === VIEWS.coins) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`panale:${nonce}:coin:add`).setLabel('Ajouter').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`panale:${nonce}:coin:remove`).setLabel('Retirer').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`panale:${nonce}:coin:resetuser`).setLabel('Reset user').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`panale:${nonce}:coin:resetall`).setLabel('Reset all').setStyle(ButtonStyle.Danger)
      )
    )
  }

  if (view === VIEWS.commands) {
    const names = getBlockableCommands(client)
    const blocked = new Set(blockedRows.map((row) => row.command_name))

    if (names.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`panale:${nonce}:cmd:toggle`)
            .setPlaceholder('Bloquer / débloquer une commande de jeu')
            .addOptions(
              names.slice(0, 25).map((name) => (
                new StringSelectMenuOptionBuilder()
                  .setLabel(name)
                  .setValue(name)
                  .setDescription((blocked.has(name) ? 'Bloquée' : 'Autorisée').slice(0, 100))
              ))
            )
        )
      )
    }

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`panale:${nonce}:cmd:unblockall`).setLabel('Tout débloquer').setStyle(ButtonStyle.Secondary)
      )
    )
  }

  if (view === VIEWS.system) {
    const modeButtonLabel = getBotMode(client) === 'test' ? 'Passer PROD' : 'Passer TEST'

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`panale:${nonce}:sys:mode`).setLabel(modeButtonLabel).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`panale:${nonce}:sys:seedroles`).setLabel('Sync rôles setup').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`panale:${nonce}:sys:createprofile`).setLabel('Créer profil').setStyle(ButtonStyle.Success)
      )
    )

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`panale:${nonce}:sys:clearsanctions`).setLabel('Clear sanctions').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`panale:${nonce}:sys:resetdb`).setLabel('Reset DB').setStyle(ButtonStyle.Danger)
      )
    )
  }

  if (confirmAction) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`panale:${nonce}:confirm:ok`).setLabel('Confirmer').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`panale:${nonce}:confirm:cancel`).setLabel('Annuler').setStyle(ButtonStyle.Secondary)
      )
    )
  }

  return {
    embeds: [panelEmbed],
    components: rows,
  }
}

function buildUserAndAmountModal(nonce, action, title) {
  return new ModalBuilder()
    .setCustomId(`panale:${nonce}:modal:${action}`)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user')
          .setLabel('Utilisateur (ID ou mention)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Montant')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
      )
    )
}

function buildUserOnlyModal(nonce, action, title) {
  return new ModalBuilder()
    .setCustomId(`panale:${nonce}:modal:${action}`)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('user')
          .setLabel('Utilisateur (ID ou mention)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
      )
    )
}

async function awaitPanelModal(interaction, nonce, action) {
  const customId = `panale:${nonce}:modal:${action}`
  return interaction.awaitModalSubmit({
    time: 120_000,
    filter: (submitted) => submitted.user.id === interaction.user.id && submitted.customId === customId,
  }).catch(() => null)
}

export default defineCommand({
  name: 'panale',
  aliases: ['panelbuyer'],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const nonce = `${message.author.id}-${Date.now()}`
    let view = VIEWS.home
    let note = status(true, 'Panel initialisé.')
    let confirmAction = null

    const render = () => buildPanelPayload({
      client,
      message,
      embed,
      status,
      nonce,
      view,
      note,
      confirmAction,
    })

    const panel = await message.reply(render())
    const collector = panel.createMessageComponentCollector({ time: 30 * 60 * 1000 })

    collector.on('collect', async (interaction) => {
      if (!interaction.customId.startsWith(`panale:${nonce}:`)) return

      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Seul le buyer ayant ouvert ce panel peut l’utiliser.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      const [, , scope, action] = interaction.customId.split(':')

      if (scope === 'nav') {
        if (action === 'close') {
          collector.stop('closed')
          await interaction.update({
            embeds: [embed({ variant: 'info', description: status(true, 'Panale fermé.') })],
            components: [],
          }).catch(() => null)
          return
        }

        if (Object.values(VIEWS).includes(action)) {
          view = action
          confirmAction = null
          note = status(true, `Navigation: ${action}.`)
          await interaction.update(render()).catch(() => null)
        }
        return
      }

      if (scope === 'confirm') {
        if (action === 'cancel') {
          confirmAction = null
          note = status(false, 'Action sensible annulée.')
          await interaction.update(render()).catch(() => null)
          return
        }

        if (action === 'ok') {
          if (!confirmAction) {
            await interaction.update(render()).catch(() => null)
            return
          }

          await interaction.deferUpdate().catch(() => null)

          if (confirmAction === 'coins_resetall') {
            const rows = client.store.listGuildUsersWithProfile(message.guild.id, { minCoins: 1 })
            let totalReset = 0
            let usersReset = 0

            for (const row of rows) {
              const userId = String(row.user_id || '').trim()
              const coins = Math.max(0, Number.parseInt(row.coins, 10) || 0)
              if (!userId || coins <= 0) continue

              client.store.addBalance(message.guild.id, userId, { coinsDelta: -coins }, {
                source: 'buyer:panale:reset_all_coins',
                reason: `Reset global via panale par ${message.author.id}`,
                actorId: message.author.id,
                metadata: { resetAmount: coins },
              })

              usersReset += 1
              totalReset += coins
            }

            note = status(true, `Reset coins global effectué: ${usersReset} utilisateur(s), ${formatCoinsBackticks(client.config, totalReset)} retirés.`)
          }

          if (confirmAction === 'clear_sanctions') {
            const cleared = client.store.clearAllSanctions()
            note = status(true, `Sanctions globales supprimées (${FR.format(cleared)} entrée(s)).`)
          }

          if (confirmAction === 'reset_db') {
            client.store.resetAllData()
            note = status(true, 'Base complète réinitialisée.')
          }

          confirmAction = null
          await panel.edit(render()).catch(() => null)
          return
        }
      }

      if (scope === 'coin') {
        if (action === 'resetall') {
          confirmAction = 'coins_resetall'
          note = status(false, 'Action sensible demandée: reset global des coins.')
          await interaction.update(render()).catch(() => null)
          return
        }

        if (action === 'add' || action === 'remove') {
          const modal = buildUserAndAmountModal(nonce, action, action === 'add' ? 'Ajouter des coins' : 'Retirer des coins')
          await interaction.showModal(modal).catch(() => null)

          const submitted = await awaitPanelModal(interaction, nonce, action)
          if (!submitted) return

          const rawUser = submitted.fields.getTextInputValue('user')
          const rawAmount = submitted.fields.getTextInputValue('amount')
          const userId = parseUserId(rawUser)
          const amount = parseCoinsAmount(rawAmount)

          if (!userId || !amount) {
            await submitted.reply({
              embeds: [embed({ variant: 'error', description: status(false, 'Entrées invalides (user/montant).') })],
              flags: MessageFlags.Ephemeral,
            }).catch(() => null)
            return
          }

          if (!client.store.hasProfile(userId)) {
            await submitted.reply({
              embeds: [embed({ variant: 'error', description: status(false, `<@${userId}> n’a pas de profil. Action refusée.`) })],
              allowedMentions: { users: [userId], parse: [] },
              flags: MessageFlags.Ephemeral,
            }).catch(() => null)
            return
          }

          if (action === 'add') {
            client.store.addBalance(message.guild.id, userId, { coinsDelta: amount }, {
              source: 'buyer:panale:add_coins',
              reason: `Ajout coins via panale par ${message.author.id}`,
              actorId: message.author.id,
              metadata: { askedAmount: amount },
            })

            note = status(true, `<@${userId}> reçoit ${formatCoinsBackticks(client.config, amount)}.`)
          } else {
            const before = client.store.getUser(message.guild.id, userId)
            client.store.addBalance(message.guild.id, userId, { coinsDelta: -amount }, {
              source: 'buyer:panale:remove_coins',
              reason: `Retrait coins via panale par ${message.author.id}`,
              actorId: message.author.id,
              metadata: { askedAmount: amount },
            })
            const after = client.store.getUser(message.guild.id, userId)
            const removed = Math.max(0, (Number.parseInt(before?.coins, 10) || 0) - (Number.parseInt(after?.coins, 10) || 0))
            note = removed > 0
              ? status(true, `<@${userId}> perd ${formatCoinsBackticks(client.config, removed)}.`)
              : status(false, `<@${userId}> n’avait aucun coin à retirer.`)
          }

          await submitted.reply({
            embeds: [embed({ variant: 'success', description: note })],
            allowedMentions: { users: [userId], parse: [] },
            flags: MessageFlags.Ephemeral,
          }).catch(() => null)

          await panel.edit(render()).catch(() => null)
          return
        }

        if (action === 'resetuser') {
          const modal = buildUserOnlyModal(nonce, action, 'Reset coins utilisateur')
          await interaction.showModal(modal).catch(() => null)

          const submitted = await awaitPanelModal(interaction, nonce, action)
          if (!submitted) return

          const rawUser = submitted.fields.getTextInputValue('user')
          const userId = parseUserId(rawUser)
          if (!userId) {
            await submitted.reply({
              embeds: [embed({ variant: 'error', description: status(false, 'Utilisateur invalide.') })],
              flags: MessageFlags.Ephemeral,
            }).catch(() => null)
            return
          }

          if (!client.store.hasProfile(userId)) {
            await submitted.reply({
              embeds: [embed({ variant: 'error', description: status(false, `<@${userId}> n’a pas de profil. Action refusée.`) })],
              allowedMentions: { users: [userId], parse: [] },
              flags: MessageFlags.Ephemeral,
            }).catch(() => null)
            return
          }

          const before = client.store.getUser(message.guild.id, userId)
          const beforeCoins = Math.max(0, Number.parseInt(before?.coins, 10) || 0)

          if (beforeCoins > 0) {
            client.store.addBalance(message.guild.id, userId, { coinsDelta: -beforeCoins }, {
              source: 'buyer:panale:reset_user_coins',
              reason: `Reset user coins via panale par ${message.author.id}`,
              actorId: message.author.id,
              metadata: { resetAmount: beforeCoins },
            })
            note = status(true, `<@${userId}> a été reset de ${formatCoinsBackticks(client.config, beforeCoins)}.`)
          } else {
            note = status(false, `<@${userId}> a déjà 0 coin.`)
          }

          await submitted.reply({
            embeds: [embed({ variant: beforeCoins > 0 ? 'success' : 'warning', description: note })],
            allowedMentions: { users: [userId], parse: [] },
            flags: MessageFlags.Ephemeral,
          }).catch(() => null)

          await panel.edit(render()).catch(() => null)
          return
        }
      }

      if (scope === 'cmd') {
        if (action === 'toggle' && interaction.isStringSelectMenu()) {
          const name = interaction.values[0]
          const blocked = client.store.isCommandBlocked(message.guild.id, name)
          client.store.setCommandBlocked(message.guild.id, name, !blocked, message.author.id)
          confirmAction = null
          note = status(true, `Commande **${name}** ${blocked ? 'débloquée' : 'bloquée'}.`)
          await interaction.update(render()).catch(() => null)
          return
        }

        if (action === 'unblockall') {
          await interaction.deferUpdate().catch(() => null)
          const rows = client.store.listBlockedCommands(message.guild.id)
          for (const row of rows) {
            client.store.setCommandBlocked(message.guild.id, row.command_name, false, message.author.id)
          }
          confirmAction = null
          note = status(true, `${rows.length} commande(s) débloquée(s).`)
          await panel.edit(render()).catch(() => null)
          return
        }
      }

      if (scope === 'sys') {
        if (action === 'mode') {
          await interaction.deferUpdate().catch(() => null)
          const current = getBotMode(client)
          const next = current === 'test' ? 'prod' : 'test'
          setBotMode(client, next)
          confirmAction = null
          note = status(true, `Mode bot: **${next.toUpperCase()}**.`)
          await panel.edit(render()).catch(() => null)
          return
        }

        if (action === 'seedroles') {
          await interaction.deferUpdate().catch(() => null)
          client.store.seedCasinoSetupDefaults(message.guild.id, message.author.id)
          const result = await ensureDrawSystemRolesForGuild(client, message.guild).catch(() => null)
          if (result?.ok) {
            note = status(true, `Roles setup sync: +${result.created} créé(s), ${result.linked} lié(s), ${result.unresolved} non résolu(s).`)
          } else {
            note = status(false, `Sync roles setup échouée (${result?.reason || 'unknown'}).`)
          }
          confirmAction = null
          await panel.edit(render()).catch(() => null)
          return
        }

        if (action === 'createprofile') {
          const modal = buildUserOnlyModal(nonce, action, 'Créer un profil utilisateur')
          await interaction.showModal(modal).catch(() => null)

          const submitted = await awaitPanelModal(interaction, nonce, action)
          if (!submitted) return

          const rawUser = submitted.fields.getTextInputValue('user')
          const userId = parseUserId(rawUser)
          if (!userId) {
            await submitted.reply({
              embeds: [embed({ variant: 'error', description: status(false, 'Utilisateur invalide.') })],
              flags: MessageFlags.Ephemeral,
            }).catch(() => null)
            return
          }

          const already = client.store.hasProfile(userId)
          if (!already) {
            client.store.createProfile(userId)
            client.store.ensureUser(message.guild.id, userId)
            client.store.ensureCasinoProfile(message.guild.id, userId)
            note = status(true, `Profil créé pour <@${userId}>.`)
          } else {
            note = status(false, `<@${userId}> possède déjà un profil.`)
          }

          await submitted.reply({
            embeds: [embed({ variant: already ? 'warning' : 'success', description: note })],
            allowedMentions: { users: [userId], parse: [] },
            flags: MessageFlags.Ephemeral,
          }).catch(() => null)

          await panel.edit(render()).catch(() => null)
          return
        }

        if (action === 'clearsanctions') {
          confirmAction = 'clear_sanctions'
          note = status(false, 'Action sensible demandée: clear sanctions globales.')
          await interaction.update(render()).catch(() => null)
          return
        }

        if (action === 'resetdb') {
          confirmAction = 'reset_db'
          note = status(false, 'Action critique demandée: reset total de la base.')
          await interaction.update(render()).catch(() => null)
        }
      }
    })

    collector.on('end', async (_, reason) => {
      if (reason === 'closed') return
      await panel.edit({ components: [] }).catch(() => null)
    })
  },
})
