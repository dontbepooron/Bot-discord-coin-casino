import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'
import { randomInt } from '../../utils/random.js'
import { formatCoins, formatCoinsBackticks } from '../../utils/format.js'
import { runSuspenseEdit } from '../../utils/suspense.js'

const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

function resolveMinGameBet(config) {
  const raw = Number.parseInt(config?.limits?.minGameBet, 10)
  if (!Number.isInteger(raw) || raw < 1) return 100
  return raw
}

function rollDie() {
  return randomInt(1, 6)
}

function dieFace(value) {
  const idx = Math.max(1, Math.min(6, Number.parseInt(value, 10) || 1))
  return DICE[idx - 1]
}

function resolveMultiplier(d1, d2) {
  const sum = d1 + d2
  if (sum === 2 || sum === 12) return 4
  if (sum === 7 || sum === 11) return 3
  if (d1 === d2) return 2
  return 0
}

export default defineCommand({
  name: 'craps',
  aliases: ['des'],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config?.cooldowns?.crapsMs || 5000,
  async execute({ client, message, args, embed, status }) {
    const minBet = resolveMinGameBet(client.config)
    const bet = parseIntInRange(args[0], minBet, Number.MAX_SAFE_INTEGER)
    if (!bet) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Usage: +craps {mise>=${minBet}}`) })],
      })
    }

    const user = client.store.getUser(message.guild.id, message.author.id)
    if (user.coins < bet) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Solde insuffisant.') })],
      })
    }

    client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: -bet })

    const suspense = await message.reply({
      embeds: [embed({ variant: 'info', description: 'Lancer des dés en cours...' })],
    })

    const frames = Array.from({ length: 8 }).map(() => {
      const a = rollDie()
      const b = rollDie()
      return {
        embeds: [embed({
          variant: 'info',
          description: `Lancer des dés en cours...\n${dieFace(a)} ${dieFace(b)} • Somme **${a + b}**`,
        })],
      }
    })

    await runSuspenseEdit(suspense, frames, 2600, 280)

    const d1 = rollDie()
    const d2 = rollDie()
    const sum = d1 + d2
    const multiplier = resolveMultiplier(d1, d2)
    const payout = bet * multiplier

    if (payout > 0) {
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: payout })
    }

    await suspense.edit({
      embeds: [embed({
        variant: multiplier > 0 ? 'success' : 'warning',
        title: 'Craps',
        description: [
          `Dés: ${dieFace(d1)} ${dieFace(d2)} • Somme **${sum}**`,
          `Mise: ${formatCoins(client.config, bet)}`,
          multiplier > 0
            ? `${status(true, `Multiplicateur x${multiplier}`)}\nGain: ${formatCoinsBackticks(client.config, payout)}`
            : status(false, 'Perdu.'),
          'Règles: 2/12 = x4, 7/11 = x3, double = x2.',
        ].join('\n'),
      })],
    }).catch(() => null)
  },
})
