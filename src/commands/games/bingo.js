import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'
import { randomInt } from '../../utils/random.js'
import { formatCoins, formatCoinsBackticks } from '../../utils/format.js'
import { runSuspenseEdit } from '../../utils/suspense.js'

export default defineCommand({
  name: 'bingo',
  aliases: [],
  profileRequired: true,
  blockable: true,
  async execute({ client, message, args, embed, status }) {
    const guess = parseIntInRange(args[0], 1, 90)
    if (!guess) {
      return message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Usage: +bingo {nombre 1-90}') })] })
    }

    const cost = 1000
    const user = client.store.getUser(message.guild.id, message.author.id)
    if (user.coins < cost) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Il faut ${formatCoins(client.config, cost)} pour jouer.`) })],
      })
    }

    const startPot = client.config.gamePots?.bingoStart || 1000
    client.store.getPot(message.guild.id, 'bingo', startPot)
    client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: -cost })
    const potAfterBet = client.store.addPot(message.guild.id, 'bingo', cost, startPot)

    let target = Number.parseInt(client.store.getState(message.guild.id, 'bingo_target') || '', 10)
    if (!Number.isInteger(target) || target < 1 || target > 90) {
      target = randomInt(1, 90)
      client.store.setState(message.guild.id, 'bingo_target', String(target))
    }

    const suspenseMsg = await message.reply({
      embeds: [embed({ variant: 'info', description: `Tirage du bingo en cours... Pot actuel: ${formatCoins(client.config, potAfterBet)}` })],
    })

    const frames = Array.from({ length: 8 }).map(() => ({
      embeds: [embed({ variant: 'info', description: `Votre nombre: **${guess}**\nRecherche du numéro gagnant... **${randomInt(1, 90)}**` })],
    }))

    await runSuspenseEdit(suspenseMsg, frames, 3000, 350)

    if (guess === target) {
      const won = potAfterBet
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: won })
      client.store.setPot(message.guild.id, 'bingo', startPot)
      client.store.setState(message.guild.id, 'bingo_target', String(randomInt(1, 90)))

      await suspenseMsg.edit({
        embeds: [
          embed({
            variant: 'success',
            title: 'Bingo gagné',
            description: [
              status(true, `Nombre gagnant: **${target}**`),
              `Vous remportez ${formatCoinsBackticks(client.config, won)}.`,
              `Nouveau pot: ${formatCoins(client.config, startPot)}`,
            ].join('\n'),
          }),
        ],
      }).catch(() => null)
      return
    }

    await suspenseMsg.edit({
      embeds: [
        embed({
          variant: 'warning',
          title: 'Bingo perdu',
          description: [
            status(false, `Nombre gagnant: **${target}**`),
            `Votre nombre: **${guess}**`,
            `Pot conservé: ${formatCoins(client.config, potAfterBet)}`,
          ].join('\n'),
        }),
      ],
    }).catch(() => null)
  },
})
