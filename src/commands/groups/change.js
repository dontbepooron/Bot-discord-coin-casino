import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange, safeTrim } from '../../utils/commandToolkit.js'

export default defineCommand({
  name: 'change',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const maxGroups = client.config.groups?.maxGroups || 9
    const commandName = safeTrim(args[0], 50).toLowerCase()
    const groupNumber = parseIntInRange(args[1], 1, maxGroups)

    if (!commandName || !groupNumber) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +change {commande} {numéro groupe}') })],
      })
    }

    const cmd = client.commands.get(commandName) || client.commands.get(client.aliases.get(commandName) || '')
    if (!cmd) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Commande introuvable.') })],
      })
    }

    if (cmd.buyerOnly) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Commande buyer non modifiable par groupe.') })],
      })
    }

    client.store.setCommandGroup(message.guild.id, cmd.name, groupNumber)

    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, `Commande \`${cmd.name}\` déplacée vers groupe ${groupNumber}.`) })],
    })
  },
})
