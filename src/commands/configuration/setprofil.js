import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { safeTrim } from '../../utils/commandToolkit.js'
import { applyCreditedActivity } from '../../utils/creditBranding.js'

async function deleteQuietly(message) {
  if (!message?.deletable) return
  await message.delete().catch(() => null)
}

async function askInput(channel, userId, prompt, { maxLen = 300, timeoutMs = 90_000 } = {}) {
  const promptMsg = await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#3498db')
        .setDescription(prompt)
        .setTimestamp(new Date()),
    ],
  }).catch(() => null)
  if (!promptMsg) return { ok: false, reason: 'send_failed' }

  const collected = await channel.awaitMessages({
    filter: (m) => m.author.id === userId && !m.author.bot,
    max: 1,
    time: timeoutMs,
    errors: ['time'],
  }).catch(() => null)

  const answer = collected?.first?.() || null
  if (!answer) {
    await deleteQuietly(promptMsg)
    return { ok: false, reason: 'timeout' }
  }

  const value = safeTrim(answer.content, maxLen)
  await Promise.allSettled([deleteQuietly(promptMsg), deleteQuietly(answer)])
  return { ok: true, value }
}

function buildGlobalEmbed(embed, profile) {
  return embed({
    variant: 'info',
    title: 'Global Bot Profile',
    description: [
      `Pseudo: ${profile?.username || 'Non défini'}`,
      `Avatar URL: ${profile?.avatar || 'Non défini'}`,
      `Activité: ${profile?.activity || 'Non définie'}`,
    ].join('\n'),
  })
}

export default defineCommand({
  name: 'setprofil',
  aliases: ['setprofile'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const customId = `setprofil:${message.author.id}`
    let profile = client.store.getGlobalBotProfile()

    const panel = await message.reply({
      embeds: [buildGlobalEmbed(embed, profile)],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder('Modifier le profil global')
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel('Pseudo').setValue('username').setEmoji('📝'),
              new StringSelectMenuOptionBuilder().setLabel('Avatar URL').setValue('avatar').setEmoji('🖼️'),
              new StringSelectMenuOptionBuilder().setLabel('Activité').setValue('activity').setEmoji('🎮')
            )
        ),
      ],
    })

    const collector = panel.createMessageComponentCollector({ time: 10 * 60 * 1000 })

    collector.on('collect', async (interaction) => {
      if (!interaction.isStringSelectMenu() || interaction.customId !== customId) return

      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Seul l’auteur peut utiliser ce panel.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      await interaction.deferUpdate().catch(() => null)
      const selected = interaction.values[0]
      const answer = await askInput(
        message.channel,
        message.author.id,
        `Nouvelle valeur pour ${selected} ? (\`clear\` pour vider)`
      )

      if (!answer.ok) {
        await interaction.followUp({
          embeds: [embed({ variant: 'warning', description: status(false, 'Temps écoulé.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      const value = ['clear', 'none', 'off'].includes(answer.value.toLowerCase()) ? null : answer.value
      const current = client.store.getGlobalBotProfile() || {}
      const patch = {
        username: current.username || null,
        avatar: current.avatar || null,
        activity: current.activity || null,
      }
      patch[selected] = value

      client.store.setGlobalBotProfile(patch)

      if (selected === 'username' && value) {
        await client.user.setUsername(value).catch(() => null)
      }

      if (selected === 'avatar') {
        await client.user.setAvatar(value).catch(() => null)
      }

      if (selected === 'activity') {
        await applyCreditedActivity(client)
      }

      profile = client.store.getGlobalBotProfile()
      await panel.edit({ embeds: [buildGlobalEmbed(embed, profile)] }).catch(() => null)
    })

    collector.on('end', async () => {
      await panel.edit({ components: [] }).catch(() => null)
    })
  },
})
