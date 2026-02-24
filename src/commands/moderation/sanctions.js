import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

function toSanctionLabel(sanction) {
  const date = `<t:${sanction.created_at}:d>`
  return `#${sanction.id} • ${sanction.type} • ${date}`.slice(0, 100)
}

export default defineCommand({
  name: 'sanctions',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    if (!target) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +sanctions {@/id/reply}') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const sanctions = client.store.listSanctions({
      userId: target.id,
      guildId: message.guild.id,
      limit: 25,
    })

    if (!sanctions.length) {
      return message.reply({
        embeds: [embed({ variant: 'info', description: `Aucune sanction pour ${target}.` })],
      })
    }

    const menuId = `sanctions:${message.id}:${target.id}`
    const panel = await message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: `Sanctions de ${target.tag || target.id}`,
          description: `${sanctions.length} sanction(s) trouvée(s). Sélectionnez une entrée pour le détail.`,
        }),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(menuId)
            .setPlaceholder('Choisir une sanction')
            .addOptions(
              sanctions.slice(0, 25).map((row) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(toSanctionLabel(row))
                  .setDescription((row.reason || 'Aucune raison').slice(0, 100))
                  .setValue(String(row.id))
              )
            )
        ),
      ],
    })

    const collector = panel.createMessageComponentCollector({ time: 120_000 })

    collector.on('collect', async (interaction) => {
      if (!interaction.isStringSelectMenu() || interaction.customId !== menuId) return

      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Seul l’auteur peut utiliser ce panel.') })],
          ephemeral: true,
        }).catch(() => null)
        return
      }

      const selectedId = Number.parseInt(interaction.values[0], 10)
      const selected = sanctions.find((row) => row.id === selectedId)
      if (!selected) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Sanction introuvable.') })],
          ephemeral: true,
        }).catch(() => null)
        return
      }

      const details = [
        `ID: **${selected.id}**`,
        `Type: **${selected.type}**`,
        `Auteur: <@${selected.author_id || '0'}>`,
        `Date: <t:${selected.created_at}:F>`,
        `Raison: ${selected.reason || 'Aucune'}`,
      ]

      if (selected.expires_at) details.push(`Expiration: <t:${selected.expires_at}:R>`)
      if (selected.duration_ms) details.push(`Durée: ${selected.duration_ms} ms`)

      await interaction.reply({
        embeds: [embed({ variant: 'info', title: 'Détail sanction', description: details.join('\n') })],
        ephemeral: true,
      }).catch(() => null)
    })

    collector.on('end', async () => {
      await panel.edit({ components: [] }).catch(() => null)
    })
  },
})
