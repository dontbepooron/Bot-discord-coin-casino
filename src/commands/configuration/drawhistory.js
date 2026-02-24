import { defineCommand } from '../../utils/commandHelpers.js'
import { parseUserId } from '../../utils/commandToolkit.js'

function parseLimit(input, fallback = 20) {
  const n = Number.parseInt(input, 10)
  if (!Number.isInteger(n)) return fallback
  return Math.max(1, Math.min(80, n))
}

export default defineCommand({
  name: 'drawhistory',
  aliases: ['tiragehistory', 'drawlogs'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const targetUserId = parseUserId(args[0] || '') || message.mentions.users.first()?.id || null
    const limit = parseLimit(targetUserId ? args[1] : args[0], 20)

    const rows = client.store.listAuditEvents(message.guild.id, {
      logType: 'draws',
      targetUserId,
      limit,
    })

    if (!rows.length) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Aucun log de tirage trouvé.') })],
      })
    }

    const lines = rows.map((row) => {
      const text = String(row.description || '').replace(/\s+/g, ' ').slice(0, 100)
      return `• \`#${row.id}\` <t:${row.created_at}:R> ${row.target_user_id ? `<@${row.target_user_id}>` : ''} ${text}`
    })

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: 'Historique Tirages',
          description: lines.join('\n').slice(0, 4096),
        }),
      ],
      allowedMentions: { parse: [], users: [], roles: [] },
    })
  },
})
