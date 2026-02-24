import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange, parseRoleId } from '../../utils/commandToolkit.js'

export default defineCommand({
  name: 'setgroup',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const maxGroups = client.config.groups?.maxGroups || 9
    const groupNumber = parseIntInRange(args[0], 1, maxGroups)
    const roleId = parseRoleId(args[1] || '') || message.mentions.roles.first()?.id || null

    if (!groupNumber || !roleId) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +setgroup {numéro} {@role}') })],
      })
    }

    const applied = client.store.setGroupRole(message.guild.id, groupNumber, roleId)
    if (!applied.ok) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Limite atteinte: maximum 3 rôles par groupe.') })],
      })
    }

    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, `Rôle <@&${roleId}> associé au groupe ${groupNumber}.`) })],
      allowedMentions: { roles: [roleId], users: [], parse: [] },
    })
  },
})
