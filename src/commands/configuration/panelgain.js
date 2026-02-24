import {
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import {
  buildGainPanelText,
  getGainSettings,
  resolveDefaultStatusKeyword,
  setGainSettings,
} from '../../utils/gainSystem.js'

async function deleteQuietly(message) {
  if (!message?.deletable) return
  await message.delete().catch(() => null)
}

async function askInput(channel, userId, prompt, { timeoutMs = 90_000, maxLen = 200 } = {}) {
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

function parseRewardsInput(input) {
  const parts = String(input || '').trim().split(/\s+/)
  if (parts.length < 3) return null

  const draws = Number.parseInt(parts[0], 10)
  const coins = Number.parseInt(parts[1], 10)
  const xp = Number.parseInt(parts[2], 10)

  if (![draws, coins, xp].every(Number.isInteger)) return null
  if (draws < 0 || coins < 0 || xp < 0) return null

  return { draws, coins, xp }
}

function buildPanelPayload(client, embed, guildId) {
  const settings = getGainSettings(client, guildId)

  return {
    embeds: [
      embed({
        variant: 'info',
        title: 'Panel Gains',
        description: buildGainPanelText(settings, client.config),
      }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`panelgain:${guildId}`)
          .setPlaceholder('Configurer le système de gains')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Toggle Status').setValue('toggle_status').setEmoji('🧩'),
            new StringSelectMenuOptionBuilder().setLabel('Toggle Vocal').setValue('toggle_voice').setEmoji('🎤'),
            new StringSelectMenuOptionBuilder().setLabel('Toggle Texte').setValue('toggle_text').setEmoji('💬'),
            new StringSelectMenuOptionBuilder().setLabel('Mot-clé Status').setValue('set_status_keyword').setEmoji('🏷️'),
            new StringSelectMenuOptionBuilder().setLabel('Rewards Status').setValue('set_status_rewards').setEmoji('🎁'),
            new StringSelectMenuOptionBuilder().setLabel('Interval Vocal').setValue('set_voice_interval').setEmoji('⏱️'),
            new StringSelectMenuOptionBuilder().setLabel('Rewards Vocal').setValue('set_voice_rewards').setEmoji('🎁'),
            new StringSelectMenuOptionBuilder().setLabel('Seuil Texte').setValue('set_text_threshold').setEmoji('📈'),
            new StringSelectMenuOptionBuilder().setLabel('Fenêtre Texte').setValue('set_text_window').setEmoji('🕒'),
            new StringSelectMenuOptionBuilder().setLabel('Rewards Texte').setValue('set_text_rewards').setEmoji('🎁'),
            new StringSelectMenuOptionBuilder().setLabel('Cooldown Texte').setValue('set_text_cooldown').setEmoji('⌛'),
            new StringSelectMenuOptionBuilder().setLabel('Cooldown Status').setValue('set_status_cooldown').setEmoji('⌛')
          )
      ),
    ],
  }
}

export default defineCommand({
  name: 'panelgain',
  aliases: ['gainspanel'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const guildId = message.guild.id
    const payload = buildPanelPayload(client, embed, guildId)
    const panel = await message.reply(payload)

    const collector = panel.createMessageComponentCollector({ time: 10 * 60 * 1000 })

    collector.on('collect', async (interaction) => {
      if (!interaction.isStringSelectMenu() || interaction.customId !== `panelgain:${guildId}`) return

      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Seul l’auteur peut utiliser ce panel.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      const selected = interaction.values[0]
      const current = getGainSettings(client, guildId)

      if (selected === 'toggle_status') {
        setGainSettings(client, guildId, { status: { enabled: !current.status.enabled } })
        await interaction.update(buildPanelPayload(client, embed, guildId)).catch(() => null)
        return
      }

      if (selected === 'toggle_voice') {
        setGainSettings(client, guildId, { voice: { enabled: !current.voice.enabled } })
        await interaction.update(buildPanelPayload(client, embed, guildId)).catch(() => null)
        return
      }

      if (selected === 'toggle_text') {
        setGainSettings(client, guildId, { text: { enabled: !current.text.enabled } })
        await interaction.update(buildPanelPayload(client, embed, guildId)).catch(() => null)
        return
      }

      await interaction.deferUpdate().catch(() => null)

      if (selected === 'set_status_keyword') {
        const answer = await askInput(
          message.channel,
          message.author.id,
          `Nouveau mot-clé status (ex: ${resolveDefaultStatusKeyword(client.config)}) ?`
        )
        if (!answer.ok) return
        setGainSettings(client, guildId, { status: { keyword: answer.value } })
      } else if (selected === 'set_status_rewards') {
        const answer = await askInput(message.channel, message.author.id, 'Rewards status: `draws coins xp` (ex: `1 400 10`)')
        if (!answer.ok) return
        const rewards = parseRewardsInput(answer.value)
        if (!rewards) {
          await message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Format invalide.') })] }).catch(() => null)
          return
        }
        setGainSettings(client, guildId, { status: { rewards } })
      } else if (selected === 'set_voice_interval') {
        const answer = await askInput(message.channel, message.author.id, 'Interval vocal en minutes ?')
        if (!answer.ok) return
        const n = Number.parseInt(answer.value, 10)
        if (!Number.isInteger(n) || n <= 0) {
          await message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Valeur invalide.') })] }).catch(() => null)
          return
        }
        setGainSettings(client, guildId, { voice: { intervalMinutes: n } })
      } else if (selected === 'set_voice_rewards') {
        const answer = await askInput(message.channel, message.author.id, 'Rewards vocal: `draws coins xp` (ex: `2 2000 30`)')
        if (!answer.ok) return
        const rewards = parseRewardsInput(answer.value)
        if (!rewards) {
          await message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Format invalide.') })] }).catch(() => null)
          return
        }
        setGainSettings(client, guildId, { voice: { rewards } })
      } else if (selected === 'set_text_threshold') {
        const answer = await askInput(message.channel, message.author.id, 'Seuil de messages texte ?')
        if (!answer.ok) return
        const n = Number.parseInt(answer.value, 10)
        if (!Number.isInteger(n) || n <= 0) {
          await message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Valeur invalide.') })] }).catch(() => null)
          return
        }
        setGainSettings(client, guildId, { text: { threshold: n } })
      } else if (selected === 'set_text_window') {
        const answer = await askInput(message.channel, message.author.id, 'Fenêtre texte en minutes ?')
        if (!answer.ok) return
        const n = Number.parseInt(answer.value, 10)
        if (!Number.isInteger(n) || n <= 0) {
          await message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Valeur invalide.') })] }).catch(() => null)
          return
        }
        setGainSettings(client, guildId, { text: { windowMinutes: n } })
      } else if (selected === 'set_text_rewards') {
        const answer = await askInput(message.channel, message.author.id, 'Rewards texte: `draws coins xp` (ex: `1 700 15`)')
        if (!answer.ok) return
        const rewards = parseRewardsInput(answer.value)
        if (!rewards) {
          await message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Format invalide.') })] }).catch(() => null)
          return
        }
        setGainSettings(client, guildId, { text: { rewards } })
      } else if (selected === 'set_text_cooldown') {
        const answer = await askInput(message.channel, message.author.id, 'Cooldown texte en minutes ?')
        if (!answer.ok) return
        const n = Number.parseInt(answer.value, 10)
        if (!Number.isInteger(n) || n <= 0) {
          await message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Valeur invalide.') })] }).catch(() => null)
          return
        }
        setGainSettings(client, guildId, { text: { cooldownMinutes: n } })
      } else if (selected === 'set_status_cooldown') {
        const answer = await askInput(message.channel, message.author.id, 'Cooldown status en minutes ?')
        if (!answer.ok) return
        const n = Number.parseInt(answer.value, 10)
        if (!Number.isInteger(n) || n <= 0) {
          await message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Valeur invalide.') })] }).catch(() => null)
          return
        }
        setGainSettings(client, guildId, { status: { cooldownMinutes: n } })
      }

      await panel.edit(buildPanelPayload(client, embed, guildId)).catch(() => null)
    })

    collector.on('end', async () => {
      await panel.edit({ components: [] }).catch(() => null)
    })
  },
})
