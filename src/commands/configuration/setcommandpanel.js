import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'

function getBlockableCommands(client) {
  return [...client.commands.values()]
    .filter((cmd) => cmd.blockable)
    .map((cmd) => cmd.name)
    .sort((a, b) => a.localeCompare(b))
}

function panelEmbed(embed, blocked) {
  return embed({
    variant: 'info',
    title: 'Set Command Panel',
    description: blocked.length
      ? `Commandes bloquées: ${blocked.join(', ')}`
      : 'Aucune commande de jeu bloquée.',
  })
}

export default defineCommand({
  name: 'setcommandpanel',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const commandList = getBlockableCommands(client)
    if (!commandList.length) {
      return message.reply({ embeds: [embed({ variant: 'warning', description: 'Aucune commande blockable définie.' })] })
    }

    const customId = `setcommandpanel:${message.author.id}`

    const build = () => {
      const blocked = client.store.listBlockedCommands(message.guild.id).map((row) => row.command_name)
      return {
        embeds: [panelEmbed(embed, blocked)],
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(customId)
              .setPlaceholder('Bloquer / débloquer une commande')
              .addOptions(
                commandList.slice(0, 25).map((name) =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(name)
                    .setDescription(blocked.includes(name) ? 'Actuellement bloquée' : 'Actuellement autorisée')
                    .setValue(name)
                )
              )
          ),
        ],
      }
    }

    const panel = await message.reply(build())
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

      const name = interaction.values[0]
      const blocked = client.store.isCommandBlocked(message.guild.id, name)
      client.store.setCommandBlocked(message.guild.id, name, !blocked, message.author.id)

      await interaction.update(build()).catch(() => null)
    })

    collector.on('end', async () => {
      await panel.edit({ components: [] }).catch(() => null)
    })
  },
})
