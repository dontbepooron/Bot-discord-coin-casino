import { defineCommand } from '../../utils/commandHelpers.js'
import { parseUserId } from '../../utils/commandToolkit.js'

const FR = new Intl.NumberFormat('fr-FR')

function parseLimit(input, fallback = 20) {
  const n = Number.parseInt(input, 10)
  if (!Number.isInteger(n)) return fallback
  return Math.max(1, Math.min(80, n))
}

function signed(value) {
  const n = Number.parseInt(value, 10) || 0
  return `${n > 0 ? '+' : ''}${FR.format(n)}`
}

export default defineCommand({
  name: 'txhistory',
  aliases: ['transactions', 'txs'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const maybeUser = parseUserId(args[0] || '') || message.mentions.users.first()?.id || null
    const limit = parseLimit(maybeUser ? args[1] : args[0], 20)

    const rows = client.store.listEconomyTransactions(message.guild.id, {
      userId: maybeUser,
      limit,
    })

    if (!rows.length) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Aucune transaction trouvée.') })],
      })
    }

    const lines = rows.map((row) => {
      const marker = row.reverted_at ? ' ↩️' : ''
      const who = `<@${row.user_id}>`
      return `• \`#${row.id}\` <t:${row.created_at}:R> ${who} | coins ${signed(row.coins_delta)} | xp ${signed(row.xp_delta)} | \`${row.source}\`${marker}`
    })

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: maybeUser ? `Transactions de ${maybeUser}` : 'Transactions récentes',
          description: lines.join('\n').slice(0, 4096),
        }),
      ],
      allowedMentions: { parse: [], users: [], roles: [] },
    })
  },
})
