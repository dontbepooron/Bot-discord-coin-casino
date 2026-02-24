import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { formatDrawItemAdminLine } from '../../utils/setupPanelManager.js'
import { ensureDrawSystemRolesForGuild } from '../../utils/drawRoleManager.js'

const WEIGHT_PRESETS = ['20', '15', '10', '5', '4', '2', '1', '0.5', '0.25', '0.1', '0.05', '0.02', '0.01', '0.001']

async function deleteQuietly(message) {
  if (!message?.deletable) return
  await message.delete().catch(() => null)
}

async function askInput(channel, userId, prompt, { timeoutMs = 120_000, maxLen = 400 } = {}) {
  const promptMessage = await channel.send({
    embeds: [new EmbedBuilder().setColor('#3498db').setDescription(prompt)],
  }).catch(() => null)

  if (!promptMessage) return { ok: false, reason: 'send_failed' }

  const collected = await channel.awaitMessages({
    filter: (m) => m.author.id === userId && !m.author.bot,
    max: 1,
    time: timeoutMs,
    errors: ['time'],
  }).catch(() => null)

  const answer = collected?.first?.() || null
  if (!answer) {
    await deleteQuietly(promptMessage)
    return { ok: false, reason: 'timeout' }
  }

  const value = String(answer.content || '').trim().slice(0, maxLen)
  await Promise.allSettled([deleteQuietly(promptMessage), deleteQuietly(answer)])
  return { ok: true, value }
}

function parseAddRewardInput(input) {
  const parts = String(input || '').split('|').map((part) => part.trim())
  if (parts.length < 4) return null

  const [name, rewardTypeRaw, rewardValueRaw, weightRaw, emojiRaw] = parts
  if (!name) return null

  const rewardType = rewardTypeRaw.toLowerCase()
  const allowedTypes = new Set(['coins', 'xp', 'draws', 'none', 'cosmetic', 'role'])
  if (!allowedTypes.has(rewardType)) return null

  const weight = Number.parseFloat(weightRaw)
  if (!Number.isFinite(weight) || weight <= 0) return null

  let rewardValue = rewardValueRaw
  if (rewardType === 'none') rewardValue = '0'

  return {
    name,
    rewardType,
    rewardValue,
    weight,
    emoji: emojiRaw || null,
  }
}

function buildPanelData(client, guildId, selectedId) {
  const all = client.store.listCasinoDrawItems(guildId, { enabledOnly: false })
  const items = all.filter((item) => String(item.category || '').toLowerCase() === 'autre')

  const selected = selectedId
    ? items.find((item) => Number(item.id) === Number(selectedId)) || null
    : null

  return { items, selected }
}

function buildPanelPayload({ client, embed, guildId, selectedId }) {
  const { items, selected } = buildPanelData(client, guildId, selectedId)

  const lines = [
    'Configure les récompenses de tirage catégorie **Autres**.',
    '',
    `Sélection actuelle: ${selected ? `#${selected.id} ${selected.name}` : 'Aucune'}`,
    '',
  ]

  if (!items.length) {
    lines.push('Aucune récompense Autres configurée.')
  } else {
    for (const item of items.slice(0, 25)) {
      lines.push(formatDrawItemAdminLine(item))
    }
    if (items.length > 25) {
      lines.push(`+${items.length - 25} item(s)`)
    }
  }

  const itemOptions = items.slice(0, 25).map((item) => new StringSelectMenuOptionBuilder()
    .setLabel(String(item.name).slice(0, 100))
    .setDescription(`id:${item.id} • ${item.enabled ? 'ON' : 'OFF'} • ${item.weight}%`.slice(0, 100))
    .setValue(`item:${item.id}`)
    .setDefault(selected ? Number(selected.id) === Number(item.id) : false)
  )

  const weightOptions = WEIGHT_PRESETS.map((value) => new StringSelectMenuOptionBuilder()
    .setLabel(`Chance ${value}%`)
    .setValue(`weight:${value}`)
  )

  return {
    embeds: [
      embed({
        variant: 'info',
        title: 'SetReward Panel',
        description: lines.join('\n').slice(0, 4000),
      }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`setreward:pick:${guildId}`)
          .setPlaceholder('Choisir une récompense "Autres"')
          .setDisabled(!itemOptions.length)
          .addOptions(itemOptions.length ? itemOptions : [
            new StringSelectMenuOptionBuilder()
              .setLabel('Aucune récompense')
              .setValue('item:none'),
          ])
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`setreward:weight:${guildId}`)
          .setPlaceholder('Définir un taux de chance')
          .setDisabled(!selected)
          .addOptions(weightOptions)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setreward:add:${guildId}`).setLabel('Ajouter').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`setreward:toggle:${guildId}`).setLabel('Activer/Désactiver').setStyle(ButtonStyle.Secondary).setDisabled(!selected),
        new ButtonBuilder().setCustomId(`setreward:delete:${guildId}`).setLabel('Supprimer').setStyle(ButtonStyle.Danger).setDisabled(!selected)
      ),
    ],
  }
}

export default defineCommand({
  name: 'setreward',
  aliases: ['rewardpanel'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const guildId = message.guild.id
    let selectedId = null

    const panel = await message.reply(buildPanelPayload({ client, embed, guildId, selectedId }))
    const collector = panel.createMessageComponentCollector({ time: 15 * 60 * 1000 })

    collector.on('collect', async (interaction) => {
      const allowedIds = [
        `setreward:pick:${guildId}`,
        `setreward:weight:${guildId}`,
        `setreward:add:${guildId}`,
        `setreward:toggle:${guildId}`,
        `setreward:delete:${guildId}`,
      ]

      if (!allowedIds.includes(interaction.customId)) return

      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Seul l’auteur peut utiliser ce panel.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      if (interaction.isStringSelectMenu() && interaction.customId === `setreward:pick:${guildId}`) {
        const value = interaction.values[0] || ''
        const itemId = Number.parseInt(value.split(':')[1] || '', 10)
        selectedId = Number.isInteger(itemId) && itemId > 0 ? itemId : null
        await interaction.update(buildPanelPayload({ client, embed, guildId, selectedId })).catch(() => null)
        return
      }

      if (interaction.isStringSelectMenu() && interaction.customId === `setreward:weight:${guildId}`) {
        if (!selectedId) {
          await interaction.reply({
            embeds: [embed({ variant: 'error', description: status(false, 'Sélectionne d’abord une récompense.') })],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null)
          return
        }

        const value = interaction.values[0] || ''
        const weight = Number.parseFloat(value.split(':')[1] || '')
        if (!Number.isFinite(weight) || weight <= 0) {
          await interaction.reply({
            embeds: [embed({ variant: 'error', description: status(false, 'Poids invalide.') })],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null)
          return
        }

        const updated = client.store.updateCasinoDrawItem(guildId, selectedId, { weight })
        if (!updated.ok) {
          await interaction.reply({
            embeds: [embed({ variant: 'error', description: status(false, 'Modification impossible.') })],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null)
          return
        }

        await interaction.update(buildPanelPayload({ client, embed, guildId, selectedId })).catch(() => null)
        return
      }

      await interaction.deferUpdate().catch(() => null)

      if (interaction.isButton() && interaction.customId === `setreward:add:${guildId}`) {
        const answer = await askInput(
          message.channel,
          message.author.id,
          'Nouveau reward: `nom | type | value | chance | emoji(optionnel)`\nExemple: `Blossom | cosmetic | blossom | 0.02 | 🌸`'
        )

        if (!answer.ok) return

        const parsed = parseAddRewardInput(answer.value)
        if (!parsed) {
          await message.reply({
            embeds: [embed({ variant: 'error', description: status(false, 'Format invalide.') })],
          }).catch(() => null)
          return
        }

        const created = client.store.addCasinoDrawItem(guildId, {
          name: parsed.name,
          category: 'autre',
          weight: parsed.weight,
          rewardType: parsed.rewardType,
          rewardValue: parsed.rewardValue,
          emoji: parsed.emoji,
        }, message.author.id)

        if (!created.ok) {
          await message.reply({
            embeds: [embed({ variant: 'error', description: status(false, 'Ajout impossible.') })],
          }).catch(() => null)
          return
        }

        selectedId = created.item?.id || selectedId
        await ensureDrawSystemRolesForGuild(client, message.guild).catch(() => null)
      }

      if (interaction.isButton() && interaction.customId === `setreward:toggle:${guildId}`) {
        if (!selectedId) return
        const item = client.store.getCasinoDrawItem(guildId, selectedId)
        if (!item) return
        client.store.updateCasinoDrawItem(guildId, selectedId, { enabled: !item.enabled })
      }

      if (interaction.isButton() && interaction.customId === `setreward:delete:${guildId}`) {
        if (!selectedId) return
        client.store.removeCasinoDrawItem(guildId, selectedId)
        selectedId = null
      }

      await panel.edit(buildPanelPayload({ client, embed, guildId, selectedId })).catch(() => null)
    })

    collector.on('end', async () => {
      await panel.edit({ components: [] }).catch(() => null)
    })
  },
})
