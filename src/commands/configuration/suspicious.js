import { defineCommand } from '../../utils/commandHelpers.js'
import { unixNow } from '../../utils/time.js'
import { writeLog } from '../../utils/logSystem.js'

const FR = new Intl.NumberFormat('fr-FR')

function parsePositive(input, fallback, min, max) {
  const n = Number.parseInt(input, 10)
  if (!Number.isInteger(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

export default defineCommand({
  name: 'suspicious',
  aliases: ['anticheat', 'suspects'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const windowMinutes = parsePositive(args[0], 1440, 5, 10080)
    const coinsThreshold = parsePositive(args[1], 250000, 1, 500000000)
    const limit = parsePositive(args[2], 20, 1, 80)
    const sinceSec = unixNow() - (windowMinutes * 60)

    const rows = client.store.listEconomyTransactions(message.guild.id, {
      sinceSec,
      includeReverted: false,
      limit: 2000,
    })

    const high = rows
      .filter((row) => Math.abs(Number.parseInt(row.coins_delta, 10) || 0) >= coinsThreshold)
      .slice(0, limit)

    const byUser = new Map()
    for (const row of rows) {
      const key = row.user_id
      const current = byUser.get(key) || { count: 0, absCoins: 0 }
      current.count += 1
      current.absCoins += Math.abs(Number.parseInt(row.coins_delta, 10) || 0)
      byUser.set(key, current)
    }

    const bursts = [...byUser.entries()]
      .filter(([, value]) => value.count >= 25)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)

    if (!high.length && !bursts.length) {
      return message.reply({
        embeds: [embed({ variant: 'success', description: status(true, 'Aucune activité suspecte détectée sur la fenêtre demandée.') })],
      })
    }

    const lines = []
    if (high.length) {
      lines.push(`**Transactions >= ${FR.format(coinsThreshold)} coins**`)
      for (const row of high) {
        const delta = Number.parseInt(row.coins_delta, 10) || 0
        lines.push(`• \`#${row.id}\` <t:${row.created_at}:R> <@${row.user_id}> ${delta > 0 ? '+' : ''}${FR.format(delta)} (\`${row.source}\`)`)
      }
      lines.push('')
    }
    if (bursts.length) {
      lines.push('**Utilisateurs très actifs (>=25 tx)**')
      for (const [userId, data] of bursts) {
        lines.push(`• <@${userId}>: ${data.count} tx, volume ${FR.format(data.absCoins)} coins`)
      }
    }

    await writeLog(client, {
      guild: message.guild,
      logType: 'anticheat',
      severity: high.length ? 'warning' : 'info',
      actorId: message.author.id,
      commandName: 'suspicious',
      description: `Scan anti-cheat exécuté: fenêtre ${windowMinutes} min, seuil ${FR.format(coinsThreshold)}.`,
      data: {
        windowMinutes,
        coinsThreshold,
        highCount: high.length,
        burstCount: bursts.length,
      },
    }).catch(() => null)

    return message.reply({
      embeds: [
        embed({
          variant: high.length ? 'warning' : 'info',
          title: 'Rapport Anti-Cheat',
          description: lines.join('\n').slice(0, 4096),
          footer: `Fenêtre: ${windowMinutes} min • Transactions scannées: ${rows.length}`,
        }),
      ],
      allowedMentions: { parse: [], users: [], roles: [] },
    })
  },
})
