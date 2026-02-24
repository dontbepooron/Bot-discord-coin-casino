import { defineCommand } from '../../utils/commandHelpers.js'
import { randomInt } from '../../utils/random.js'
import { formatCoins, formatCoinsBackticks } from '../../utils/format.js'
import { runSuspenseEdit } from '../../utils/suspense.js'

export default defineCommand({
  name: 'jackpot',
  aliases: [],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config.cooldowns.jackpotMs,
  async execute({ client, message, embed, status }) {
    const cost = 5000
    const user = client.store.getUser(message.guild.id, message.author.id)
    if (user.coins < cost) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Il faut ${formatCoins(client.config, cost)} pour jouer.`) })],
      })
    }

    const startPot = client.config.gamePots?.jackpotStart || 5000
    client.store.getPot(message.guild.id, 'jackpot', startPot)
    client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: -cost })
    const potAfterBet = client.store.addPot(message.guild.id, 'jackpot', cost, startPot)

    const suspenseMsg = await message.reply({
      embeds: [embed({ variant: 'info', description: `Jackpot en cours... Pot: ${formatCoins(client.config, potAfterBet)}` })],
    })

    const frames = Array.from({ length: 8 }).map(() => ({
      embeds: [embed({ variant: 'info', description: `Tirage du numéro... **${randomInt(100, 999)}**` })],
    }))

    await runSuspenseEdit(suspenseMsg, frames, 3000, 350)
    const roll = randomInt(100, 999)

    if (roll === 777) {
      const won = potAfterBet
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: won })
      client.store.setPot(message.guild.id, 'jackpot', startPot)

      await suspenseMsg.edit({
        embeds: [
          embed({
            variant: 'success',
            title: 'Jackpot gagné',
            description: [
              status(true, `Numéro tiré: **${roll}**`),
              `Vous remportez ${formatCoinsBackticks(client.config, won)}.`,
              `Pot réinitialisé à ${formatCoins(client.config, startPot)}.`,
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
          title: 'Jackpot perdu',
          description: [
            status(false, `Numéro tiré: **${roll}** (objectif: 777)`),
            `Pot actuel: ${formatCoins(client.config, potAfterBet)}`,
          ].join('\n'),
        }),
      ],
    }).catch(() => null)
  },
})
