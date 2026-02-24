import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'

export default defineCommand({
  name: 'transfer',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const maxGroups = client.config.groups?.maxGroups || 9
    const source = parseIntInRange(args[0], 1, maxGroups)
    const target = parseIntInRange(args[1], 1, maxGroups)

    if (!source || !target) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +transfer {groupe source} {groupe cible}') })],
      })
    }

    const moved = client.store.transferGroupCommands(message.guild.id, source, target)
    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, `${moved} commandes transférées du groupe ${source} vers ${target}.`) })],
    })
  },
})
