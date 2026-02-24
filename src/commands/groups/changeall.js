import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'

export default defineCommand({
  name: 'changeall',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const maxGroups = client.config.groups?.maxGroups || 9
    const groupNumber = parseIntInRange(args[0], 1, maxGroups)

    if (!groupNumber) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +changeall {numéro groupe}') })],
      })
    }

    const names = [...client.commands.values()]
      .filter((cmd) => !cmd.buyerOnly)
      .map((cmd) => cmd.name)

    client.store.setAllCommandGroups(message.guild.id, names, groupNumber)

    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, `${names.length} commandes déplacées vers groupe ${groupNumber}.`) })],
    })
  },
})
