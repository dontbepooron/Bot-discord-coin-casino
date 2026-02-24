import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { randomInt } from '../../utils/random.js'

const FR = new Intl.NumberFormat('fr-FR')
const GIFT_COLORS = [
  { label: 'rouge', dot: '🔴', style: ButtonStyle.Danger },
  { label: 'bleu', dot: '🔵', style: ButtonStyle.Primary },
  { label: 'vert', dot: '🟢', style: ButtonStyle.Success },
]

function buildButtons(nonce, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(...GIFT_COLORS.map((color, index) =>
      new ButtonBuilder()
        .setCustomId(`gift:${nonce}:${index}`)
        .setEmoji('🎁')
        .setStyle(color.style)
        .setDisabled(disabled)
    )),
  ]
}

export default defineCommand({
  name: 'gift',
  aliases: [],
  profileRequired: true,
  cooldownMs: (client) => client.config.cooldowns.giftMs,
  async execute({ client, message, embed, status }) {
    const nonce = `${message.author.id}-${Date.now()}`
    const winnerIndex = randomInt(0, 2)

    const sent = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#111111')
          .setTitle('Cadeau')
          .setDescription('Choisissez un bouton 🎁. Un seul est gagnant.')
          .setTimestamp(new Date()),
      ],
      components: buildButtons(nonce, false),
    })

    const collector = sent.createMessageComponentCollector({ time: 30_000 })

    collector.on('collect', async (interaction) => {
      if (!interaction.isButton()) return
      if (!interaction.customId.startsWith(`gift:${nonce}:`)) return

      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Ce gift ne vous appartient pas.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      const picked = Number.parseInt(interaction.customId.split(':').at(-1), 10)
      const won = picked === winnerIndex
      const winningColor = GIFT_COLORS[winnerIndex]
      collector.stop('picked')

      if (won) {
        const coins = randomInt(1000, 3000)
        const xp = randomInt(5, 20)
        client.store.addBalance(message.guild.id, message.author.id, {
          coinsDelta: coins,
          xpDelta: xp,
        })

        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor('#111111')
              .setTitle('Cadeau')
              .setDescription([
                `Félicitations, vous avez gagné \`${FR.format(coins)}\` ${client.config.currency?.coinEmoji || '🪙'} ainsi que \`${FR.format(xp)}\` ${client.config.currency?.xpFlaskEmoji || '🧪'}.`,
                `La couleur était ${winningColor.label} ${winningColor.dot}.`,
              ].join('\n'))
              .setTimestamp(new Date()),
          ],
          components: buildButtons(nonce, true),
        }).catch(() => null)
        return
      }

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor('#111111')
            .setTitle('Cadeau')
            .setDescription(`Désolé, vous n'avez rien gagné. La couleur était ${winningColor.label} ${winningColor.dot}.`)
            .setTimestamp(new Date()),
        ],
        components: buildButtons(nonce, true),
      }).catch(() => null)
    })

    collector.on('end', async (_, reason) => {
      if (reason === 'picked') return
      await sent.edit({
        embeds: [
          new EmbedBuilder()
            .setColor('#111111')
            .setTitle('Cadeau')
            .setDescription('Cadeau expiré.')
            .setTimestamp(new Date()),
        ],
        components: buildButtons(nonce, true),
      }).catch(() => null)
    })
  },
})
