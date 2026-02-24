import { EmbedBuilder } from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange, safeTrim } from '../../utils/commandToolkit.js'
import { randomInt } from '../../utils/random.js'

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
const NUMBER = new Intl.NumberFormat('en-US')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveMinGameBet(config) {
  const raw = Number.parseInt(config?.limits?.minGameBet, 10)
  if (!Number.isInteger(raw) || raw < 1) return 100
  return raw
}

function getColor(number) {
  if (number === 0) return 'vert'
  return RED.has(number) ? 'rouge' : 'noir'
}

function getColorDot(color) {
  if (color === 'rouge') return '🔴'
  if (color === 'vert') return '🟢'
  return '⚫'
}

function normalizeChoice(rawChoice) {
  const raw = safeTrim(rawChoice, 50).toLowerCase()
  if (!raw) return null

  if (['rouge', 'red', 'r'].includes(raw)) return { type: 'color', value: 'rouge', multiplier: 2 }
  if (['noir', 'black', 'b'].includes(raw)) return { type: 'color', value: 'noir', multiplier: 2 }
  if (['vert', 'green', 'g'].includes(raw)) return { type: 'color', value: 'vert', multiplier: 2 }
  if (['pair', 'even'].includes(raw)) return { type: 'parity', value: 'pair', multiplier: 2 }
  if (['impair', 'odd'].includes(raw)) return { type: 'parity', value: 'impair', multiplier: 2 }
  if (raw === '1-12') return { type: 'range', value: [1, 12], multiplier: 3 }
  if (raw === '13-24') return { type: 'range', value: [13, 24], multiplier: 3 }
  if (raw === '25-36') return { type: 'range', value: [25, 36], multiplier: 3 }

  const exact = parseIntInRange(raw, 1, 36)
  if (exact) return { type: 'exact', value: exact, multiplier: 4 }

  return null
}

function describeChoice(choice) {
  if (!choice) return 'inconnu'
  if (choice.type === 'color') return choice.value
  if (choice.type === 'parity') return choice.value
  if (choice.type === 'range') return `${choice.value[0]}-${choice.value[1]}`
  if (choice.type === 'exact') return String(choice.value)
  return 'inconnu'
}

function isWinning(choice, number) {
  if (choice.type === 'color') return getColor(number) === choice.value
  if (choice.type === 'parity') {
    if (number === 0) return false
    if (choice.value === 'pair') return number % 2 === 0
    return number % 2 === 1
  }
  if (choice.type === 'range') {
    const [from, to] = choice.value
    return number >= from && number <= to
  }
  if (choice.type === 'exact') return number === choice.value
  return false
}

function buildSpinEmbed(user, number) {
  const color = getColor(number)
  return new EmbedBuilder()
    .setColor('#111111')
    .setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL({ size: 256 }),
    })
    .setDescription([
      'La roue tourne...',
      '**La roue tourne...**',
      `${color} ${number} ${getColorDot(color)}`,
    ].join('\n'))
}

function buildFinalEmbed(client, user, choice, resultNumber, win, bet) {
  const color = getColor(resultNumber)
  const coinEmoji = client.config?.currency?.coinEmoji || '🪙'
  const payout = bet * choice.multiplier

  const resultLine = win
    ? `Félicitations ! Vous avez gagné \`${NUMBER.format(payout)}\` ${coinEmoji} (x${choice.multiplier}).`
    : 'Désolé, vous avez perdu.'

  return new EmbedBuilder()
    .setColor('#111111')
    .setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL({ size: 256 }),
    })
    .addFields(
      {
        name: 'Choix',
        value: describeChoice(choice),
        inline: true,
      },
      {
        name: 'Numéro gagnant',
        value: `${color} ${resultNumber} ${getColorDot(color)}`,
        inline: true,
      },
      {
        name: 'Résultat',
        value: resultLine,
        inline: false,
      }
    )
}

export default defineCommand({
  name: 'roulette',
  aliases: [],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config.cooldowns.rouletteMs,
  async execute({ client, message, args, embed, status }) {
    const minBet = resolveMinGameBet(client.config)
    const bet = parseIntInRange(args[0], minBet, Number.MAX_SAFE_INTEGER)
    const choice = normalizeChoice(args[1])

    if (!bet || !choice) {
      return message.reply({
        embeds: [
          embed({
            variant: 'error',
            description: status(false, `Usage: +roulette {mise>=${minBet}} {rouge|noir|vert|pair|impair|1-12|13-24|25-36|1-36}`),
          }),
        ],
      })
    }

    const user = client.store.getUser(message.guild.id, message.author.id)
    if (user.coins < bet) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Solde insuffisant.') })],
      })
    }

    client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: -bet })

    const firstNumber = randomInt(0, 36)
    const spinMessage = await message.reply({
      content: `Les jeux sont faits, rien ne va plus ${message.author}`,
      embeds: [buildSpinEmbed(message.author, firstNumber)],
      allowedMentions: { users: [message.author.id], roles: [], parse: [] },
    })

    for (let step = 1; step <= 3; step += 1) {
      const n = randomInt(0, 36)
      // eslint-disable-next-line no-await-in-loop
      await sleep(850)
      // eslint-disable-next-line no-await-in-loop
      await spinMessage.edit({
        content: `Les jeux sont faits, rien ne va plus ${message.author}`,
        embeds: [buildSpinEmbed(message.author, n)],
        allowedMentions: { users: [message.author.id], roles: [], parse: [] },
      }).catch(() => null)
    }

    const result = randomInt(0, 36)
    const win = isWinning(choice, result)

    if (win) {
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: bet * choice.multiplier })
    }

    await sleep(600)

    await spinMessage.edit({
      content: `La roue a fini de tourner ${message.author}.`,
      embeds: [buildFinalEmbed(client, message.author, choice, result, win, bet)],
      allowedMentions: { users: [message.author.id], roles: [], parse: [] },
    }).catch(() => null)
  },
})
