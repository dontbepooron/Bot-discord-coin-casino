import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange, safeTrim } from '../../utils/commandToolkit.js'
import { randomInt } from '../../utils/random.js'
import { formatCoins, formatCoinsBackticks } from '../../utils/format.js'
import { runSuspenseEdit } from '../../utils/suspense.js'

const CARD_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

function resolveMinGameBet(config) {
  const raw = Number.parseInt(config?.limits?.minGameBet, 10)
  if (!Number.isInteger(raw) || raw < 1) return 100
  return raw
}

function normalizeGuess(raw) {
  const value = safeTrim(raw, 20).toLowerCase()
  if (['haut', 'high', 'h', 'plus'].includes(value)) return 'high'
  if (['bas', 'low', 'l', 'moins'].includes(value)) return 'low'
  return null
}

function cardLabel(value) {
  const idx = Math.max(1, Math.min(13, Number.parseInt(value, 10) || 1))
  return CARD_LABELS[idx - 1]
}

export default defineCommand({
  name: 'hilo',
  aliases: ['highlow'],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config?.cooldowns?.hiloMs || 5000,
  async execute({ client, message, args, embed, status }) {
    const minBet = resolveMinGameBet(client.config)
    const bet = parseIntInRange(args[0], minBet, Number.MAX_SAFE_INTEGER)
    const guess = normalizeGuess(args[1])

    if (!bet || !guess) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Usage: +hilo {mise>=${minBet}} {haut|bas}`) })],
      })
    }

    const user = client.store.getUser(message.guild.id, message.author.id)
    if (user.coins < bet) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Solde insuffisant.') })],
      })
    }

    client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: -bet })

    const firstCard = randomInt(1, 13)
    const suspense = await message.reply({
      embeds: [embed({
        variant: 'info',
        description: `Carte de base: **${cardLabel(firstCard)}**\nRévélation de la 2e carte...`,
      })],
    })

    const frames = Array.from({ length: 8 }).map(() => ({
      embeds: [embed({
        variant: 'info',
        description: `Carte de base: **${cardLabel(firstCard)}**\nRévélation de la 2e carte... **${cardLabel(randomInt(1, 13))}**`,
      })],
    }))

    await runSuspenseEdit(suspense, frames, 2800, 300)

    const secondCard = randomInt(1, 13)
    let result = 'lose'
    let payout = 0

    if (secondCard === firstCard) {
      result = 'tie'
      payout = bet
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: bet })
    } else if ((guess === 'high' && secondCard > firstCard) || (guess === 'low' && secondCard < firstCard)) {
      result = 'win'
      payout = bet * 2
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: payout })
    }

    await suspense.edit({
      embeds: [embed({
        variant: result === 'win' ? 'success' : (result === 'tie' ? 'info' : 'warning'),
        title: 'Hi-Lo',
        description: [
          `Choix: **${guess === 'high' ? 'HAUT' : 'BAS'}**`,
          `Carte 1: **${cardLabel(firstCard)}**`,
          `Carte 2: **${cardLabel(secondCard)}**`,
          `Mise: ${formatCoins(client.config, bet)}`,
          result === 'win'
            ? `${status(true, 'Gagné.')} Gain: ${formatCoinsBackticks(client.config, payout)}`
            : (result === 'tie'
              ? `${status(true, 'Égalité.')} Mise remboursée: ${formatCoinsBackticks(client.config, payout)}`
              : status(false, 'Perdu.')),
        ].join('\n'),
      })],
    }).catch(() => null)
  },
})
