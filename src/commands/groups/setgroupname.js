import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange, safeTrim } from '../../utils/commandToolkit.js'

export default defineCommand({
  name: 'setgroupname',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const maxGroups = client.config.groups?.maxGroups || 9
    const groupNumber = parseIntInRange(args[0], 1, maxGroups)
    const name = safeTrim(args.slice(1).join(' '), 60)

    if (!groupNumber || !name) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +setgroupname {numéro} {nom}') })],
      })
    }

    client.store.setGroupName(message.guild.id, groupNumber, name)
    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, `Nom du groupe ${groupNumber} défini sur **${name}**.`) })],
    })
  },
})
