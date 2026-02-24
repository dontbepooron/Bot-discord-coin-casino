import { defineCommand } from '../../utils/commandHelpers.js'
import { EmbedBuilder } from 'discord.js'
import { randomInt } from '../../utils/random.js'

const NUMBER = new Intl.NumberFormat('en-US')

function resolveCoinName(config) {
  const fromNameCoin = String(config?.namecoin || '').trim()
  if (fromNameCoin) return fromNameCoin
  const fromCurrency = String(config?.currency?.name || '').trim()
  if (fromCurrency) return fromCurrency
  return 'Coins'
}

export default defineCommand({
  name: 'collect',
  aliases: [],
  profileRequired: true,
  cooldownMs: (client) => client.config.cooldowns.collectMs,
  async execute({ client, message }) {
    const coins = randomInt(200, 2000)
    const xp = randomInt(2, 10)

    client.store.addBalance(message.guild.id, message.author.id, {
      coinsDelta: coins,
      xpDelta: xp,
    })

    const coinEmoji = client.config?.currency?.coinEmoji || '🪙'
    const xpEmoji = client.config?.currency?.xpFlaskEmoji || '🧪'
    const coinName = resolveCoinName(client.config)
    const timeText = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2b2d31')
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL({ size: 256 }),
          })
          .setTitle(`Collecte de ${coinName}`)
          .setDescription([
            `Vous avez collecté \`${NUMBER.format(coins)}\` ${coinEmoji} ainsi que ${NUMBER.format(xp)} ${xpEmoji}.`,
            '',
            `Aujourd’hui à ${timeText}`,
          ].join('\n')),
      ],
    })
  },
})
