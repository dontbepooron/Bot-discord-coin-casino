import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'reset',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const confirmId = `reset:confirm:${message.author.id}`
    const cancelId = `reset:cancel:${message.author.id}`

    const panel = await message.reply({
      embeds: [
        embed({
          variant: 'warning',
          title: 'Confirmation reset total',
          description: 'Cette action va vider la base complète du bot. Confirmer ?',
        }),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(confirmId).setLabel('Confirmer').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(cancelId).setLabel('Annuler').setStyle(ButtonStyle.Secondary)
        ),
      ],
    })

    const collector = panel.createMessageComponentCollector({ time: 30_000 })

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Seul l’auteur peut répondre.') })],
          ephemeral: true,
        }).catch(() => null)
        return
      }

      if (interaction.customId === cancelId) {
        collector.stop('cancel')
        await interaction.update({
          embeds: [embed({ variant: 'info', description: status(false, 'Reset annulé.') })],
          components: [],
        }).catch(() => null)
        return
      }

      if (interaction.customId === confirmId) {
        collector.stop('confirm')
        client.store.resetAllData()
        await interaction.update({
          embeds: [embed({ variant: 'success', description: status(true, 'Base totalement réinitialisée.') })],
          components: [],
        }).catch(() => null)
      }
    })

    collector.on('end', async (_, reason) => {
      if (reason === 'confirm' || reason === 'cancel') return
      await panel.edit({
        embeds: [embed({ variant: 'warning', description: status(false, 'Confirmation expirée.') })],
        components: [],
      }).catch(() => null)
    })
  },
})
