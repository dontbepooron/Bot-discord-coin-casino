import { defineCommand } from '../../utils/commandHelpers.js'
import { isValidLogType, listLogTypes } from '../../utils/logSystem.js'

function parseLimit(input, fallback = 20) {
  const n = Number.parseInt(input, 10)
  if (!Number.isInteger(n)) return fallback
  return Math.max(1, Math.min(80, n))
}

export default defineCommand({
  name: 'loghistory',
  aliases: ['auditlog', 'audithistory'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const requestedType = String(args[0] || 'all').trim().toLowerCase()
    const safeType = requestedType === 'all' ? null : requestedType
    const limit = parseLimit(args[1], 20)

    if (safeType && !isValidLogType(safeType)) {
      const available = listLogTypes().map((item) => `\`${item.key}\``).join(', ')
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Type invalide. Types: ${available}`) })],
      })
    }

    const rows = client.store.listAuditEvents(message.guild.id, {
      logType: safeType,
      limit,
    })

    if (!rows.length) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Aucun événement audit trouvé.') })],
      })
    }

    const lines = rows.map((row) => {
      const desc = String(row.description || '').replace(/\s+/g, ' ').slice(0, 90)
      const actor = row.actor_id ? `<@${row.actor_id}>` : 'system'
      return `• \`#${row.id}\` <t:${row.created_at}:R> [\`${row.log_type}\`] ${actor} → ${desc || '-'}`
    })

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: `Historique Audit (${safeType || 'all'})`,
          description: lines.join('\n').slice(0, 4096),
        }),
      ],
      allowedMentions: { parse: [], users: [], roles: [] },
    })
  },
})
