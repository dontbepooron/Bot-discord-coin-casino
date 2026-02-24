import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { safeTrim } from '../../utils/commandToolkit.js'

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

function buildProfileEmbed(embed, profile, guildId) {
  return embed({
    variant: 'info',
    title: 'Server Profile Panel',
    description: [
      `Serveur: <#${guildId}>`,
      `Pseudo: ${profile?.nickname || 'Non défini'}`,
      `Avatar URL: ${profile?.avatar || 'Non défini'}`,
      `Bannière URL: ${profile?.banner || 'Non défini'}`,
      `Bio: ${profile?.bio || 'Non définie'}`,
    ].join('\n'),
  })
}

export default defineCommand({
  name: 'serverprofile',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const guildId = message.guild.id
    const customId = `serverprofile:${guildId}:${message.author.id}`
    let profile = client.store.getServerBotProfile(guildId)

    const panel = await message.reply({
      embeds: [buildProfileEmbed(embed, profile, guildId)],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder('Modifier le profil serveur')
            .addOptions(
              new StringSelectMenuOptionBuilder().setLabel('Pseudo').setValue('nickname').setEmoji('📝'),
              new StringSelectMenuOptionBuilder().setLabel('Avatar URL').setValue('avatar').setEmoji('🖼️'),
              new StringSelectMenuOptionBuilder().setLabel('Bannière URL').setValue('banner').setEmoji('🏳️'),
              new StringSelectMenuOptionBuilder().setLabel('Bio').setValue('bio').setEmoji('📚')
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
      const current = client.store.getServerBotProfile(guildId) || {}
      const patch = {
        nickname: current.nickname || null,
        avatar: current.avatar || null,
        banner: current.banner || null,
        bio: current.bio || null,
      }
      patch[selected] = value

      client.store.setServerBotProfile(guildId, patch)

      if (selected === 'nickname') {
        await message.guild.members.me?.setNickname(value).catch(() => null)
      }

      profile = client.store.getServerBotProfile(guildId)
      await panel.edit({ embeds: [buildProfileEmbed(embed, profile, guildId)] }).catch(() => null)
    })

    collector.on('end', async () => {
      await panel.edit({ components: [] }).catch(() => null)
    })
  },
})
