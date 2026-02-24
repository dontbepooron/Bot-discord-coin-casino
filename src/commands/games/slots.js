import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'
import { randomInt } from '../../utils/random.js'
import { formatCoins, formatCoinsBackticks } from '../../utils/format.js'
import { runSuspenseEdit } from '../../utils/suspense.js'

const SYMBOLS = ['🍒', '🍋', '🔔', '💎', '🍀', '7️⃣']

function resolveMinGameBet(config) {
  const raw = Number.parseInt(config?.limits?.minGameBet, 10)
  if (!Number.isInteger(raw) || raw < 1) return 100
  return raw
}

function pickSymbol() {
  return SYMBOLS[randomInt(0, SYMBOLS.length - 1)]
}

function spinReels() {
  return [pickSymbol(), pickSymbol(), pickSymbol()]
}

function reelsText(reels) {
  return `| ${reels.join(' | ')} |`
}

function resolveMultiplier(reels) {
  const [a, b, c] = reels
  if (a === b && b === c) {
    if (a === '7️⃣') return 10
    if (a === '💎') return 8
    if (a === '🍀') return 7
    return 5
  }

  if (a === b || a === c || b === c) return 2
  if (a === '🍒' && b === '🍋' && c === '🍒') return 3
  return 0
}

export default defineCommand({
  name: 'slots',
  aliases: ['machine', 'slot'],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config?.cooldowns?.slotsMs || 30000,
  async execute({ client, message, args, embed, status }) {
    const minBet = resolveMinGameBet(client.config)
    const bet = parseIntInRange(args[0], minBet, Number.MAX_SAFE_INTEGER)
    if (!bet) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Usage: +slots {mise>=${minBet}}`) })],
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
      embeds: [embed({ variant: 'info', description: `Machine en cours...\n${reelsText(spinReels())}` })],
    })

    const frames = Array.from({ length: 9 }).map(() => ({
      embeds: [embed({ variant: 'info', description: `Machine en cours...\n${reelsText(spinReels())}` })],
    }))

    await runSuspenseEdit(suspense, frames, 3000, 300)

    const reels = spinReels()
    const multiplier = resolveMultiplier(reels)
    const payout = bet * multiplier

    if (payout > 0) {
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: payout })
    }

    const resultLines = [
      `Mise: ${formatCoins(client.config, bet)}`,
      `Résultat: ${reelsText(reels)}`,
      multiplier > 0
        ? `${status(true, `Multiplicateur x${multiplier}`)}\nGain: ${formatCoinsBackticks(client.config, payout)}`
        : status(false, 'Aucune combinaison gagnante.'),
    ]

    await suspense.edit({
      embeds: [embed({
        variant: multiplier > 0 ? 'success' : 'warning',
        title: 'Slots Casino',
        description: resultLines.join('\n'),
      })],
    }).catch(() => null)
  },
})
