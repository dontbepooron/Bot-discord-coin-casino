import { defineCommand } from '../../utils/commandHelpers.js'

function collectCommandsForGroup(client, guildId, targetGroup) {
  const out = []
  for (const cmd of client.commands.values()) {
    if (cmd.buyerOnly) continue

    const assigned = client.store.getCommandGroup(guildId, cmd.name)
    const effective = assigned != null ? assigned : (cmd.groupControlled ? (cmd.defaultGroup || 9) : null)
    if (effective === targetGroup) out.push(cmd.name)
  }

  return out.sort((a, b) => a.localeCompare(b))
}

export default defineCommand({
  name: 'grouplist',
  aliases: ['groups'],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed }) {
    const guildId = message.guild.id
    const maxGroups = client.config.groups?.maxGroups || 9

    const names = new Map(client.store.getAllGroupNames(guildId).map((row) => [Number(row.group_number), row.name]))
    const rolesByGroup = new Map()

    for (const row of client.store.getGroupRoles(guildId)) {
      const group = Number(row.group_number)
      if (!rolesByGroup.has(group)) rolesByGroup.set(group, [])
      rolesByGroup.get(group).push(row.role_id)
    }

    const lines = []
    for (let group = 1; group <= maxGroups; group += 1) {
      const groupName = names.get(group) || `Groupe ${group}`
      const roles = rolesByGroup.get(group) || []
      const commands = collectCommandsForGroup(client, guildId, group)

      lines.push(`**${group}. ${groupName}**`)
      lines.push(`Rôles: ${roles.length ? roles.map((id) => `<@&${id}>`).join(', ') : 'Aucun'}`)
      lines.push(`Commandes: ${commands.length ? commands.join(', ') : 'Aucune'}`)
      lines.push('')
    }

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: 'Liste des groupes',
          description: lines.join('\n').slice(0, 3900),
        }),
      ],
    })
  },
})
