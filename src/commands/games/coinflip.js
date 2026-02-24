import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange, safeTrim } from '../../utils/commandToolkit.js'
import { randomInt } from '../../utils/random.js'
import { formatCoins, formatCoinsBackticks } from '../../utils/format.js'
import { runSuspenseEdit } from '../../utils/suspense.js'

function resolveMinGameBet(config) {
  const raw = Number.parseInt(config?.limits?.minGameBet, 10)
  if (!Number.isInteger(raw) || raw < 1) return 100
  return raw
}

function normalizeSide(raw) {
  const value = safeTrim(raw, 24).toLowerCase()
  if (['pile', 'p', 'heads', 'head'].includes(value)) return 'pile'
  if (['face', 'f', 'tails', 'tail'].includes(value)) return 'face'
  return null
}

function sideEmoji(side) {
  return side === 'pile' ? '🪙' : '🥏'
}

function randomSide() {
  return randomInt(0, 1) === 0 ? 'pile' : 'face'
}

export default defineCommand({
  name: 'coinflip',
  aliases: ['cf', 'pileface'],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config?.cooldowns?.coinflipMs || 20000,
  async execute({ client, message, args, embed, status }) {
    const minBet = resolveMinGameBet(client.config)
    const bet = parseIntInRange(args[0], minBet, Number.MAX_SAFE_INTEGER)
    const choice = normalizeSide(args[1])

    if (!bet || !choice) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Usage: +coinflip {mise>=${minBet}} {pile|face}`) })],
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
      embeds: [embed({ variant: 'info', description: 'Lancement de la pièce...' })],
    })

    const frames = Array.from({ length: 8 }).map(() => {
      const side = randomSide()
      return {
        embeds: [embed({ variant: 'info', description: `La pièce tourne... ${sideEmoji(side)} **${side.toUpperCase()}**` })],
      }
    })

    await runSuspenseEdit(suspense, frames, 2500, 280)

    const result = randomSide()
    const win = result === choice
    const payout = win ? bet * 2 : 0

    if (win) {
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: payout })
    }

    await suspense.edit({
      embeds: [embed({
        variant: win ? 'success' : 'warning',
        title: 'Coinflip',
        description: [
          `Choix: **${choice.toUpperCase()}**`,
          `Résultat: ${sideEmoji(result)} **${result.toUpperCase()}**`,
          `Mise: ${formatCoins(client.config, bet)}`,
          win
            ? `${status(true, 'Gagné.')} Gain: ${formatCoinsBackticks(client.config, payout)}`
            : status(false, 'Perdu.'),
        ].join('\n'),
      })],
    }).catch(() => null)
  },
})
