import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'

const SUITS = ['♠', '♣', '♦', '❤️']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const FR = new Intl.NumberFormat('fr-FR')
const CARD_LINK = 'https://google.com'
const BLACKJACK_WIN_XP = 20

function drawCard() {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)]
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)]
  return { rank, suit }
}

function cardValue(rank) {
  if (['J', 'Q', 'K'].includes(rank)) return 10
  if (rank === 'A') return 11
  return Number.parseInt(rank, 10)
}

function handValue(cards) {
  let total = cards.reduce((sum, card) => sum + cardValue(card.rank), 0)
  let aces = cards.filter((card) => card.rank === 'A').length

  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }

  return total
}

function renderCard(card) {
  const label = `\`${card.rank} ${card.suit}\``
  return `[${label}](${CARD_LINK})`
}

function renderHand(cards) {
  return cards.map((card) => renderCard(card)).join(' ')
}

function renderDealerPreview(cards) {
  const first = cards[0]
  if (!first) return '?'
  return renderCard(first)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveMinGameBet(config) {
  const raw = Number.parseInt(config?.limits?.minGameBet, 10)
  if (!Number.isInteger(raw) || raw < 1) return 100
  return raw
}

function controls(nonce, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bj:${nonce}:hit`).setLabel('Tirer').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`bj:${nonce}:stand`).setLabel('Rester').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`bj:${nonce}:surrender`).setLabel('Abandonner').setStyle(ButtonStyle.Danger).setDisabled(disabled)
    ),
  ]
}

function buildGameEmbed(client, user, session) {
  const playerTotal = handValue(session.player)
  const dealerVisible = session.dealer[0] ? [session.dealer[0]] : []
  const dealerVisibleTotal = handValue(dealerVisible)

  return new EmbedBuilder()
    .setColor('#ffee58')
    .setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL({ size: 256 }),
    })
    .setTitle('BlackJack 🎲')
    .addFields(
      {
        name: 'Votre Main',
        value: `${renderHand(session.player)}\nTotal : ${playerTotal}`,
        inline: true,
      },
      {
        name: 'Main du Croupier',
        value: `${renderDealerPreview(session.dealer)}\nTotal : ${dealerVisibleTotal}`,
        inline: true,
      }
    )
    .setDescription(`${user}, si vous abandonnez la partie, seulement 50% de vos coins vous seront remboursés !`)
}

function buildFinalEmbed(client, user, { result, playerTotal, dealerTotal, amount = 0, xpAmount = 0 }) {
  const coinEmoji = client.config?.currency?.coinEmoji || '🪙'
  const xpEmoji = client.config?.currency?.xpFlaskEmoji || '🧪'
  const amountText = FR.format(Math.max(0, Number.parseInt(amount, 10) || 0))
  const xpText = FR.format(Math.max(0, Number.parseInt(xpAmount, 10) || 0))

  if (result === 'win') {
    return new EmbedBuilder()
      .setColor('#ffee58')
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 256 }),
      })
      .setDescription([
        '**Vous avez gagné !**',
        '',
        `Vous avez un total de ${playerTotal} et moi ${dealerTotal} points.`,
        `Vous venez de gagner \`${amountText}\` ${coinEmoji} ainsi que \`${xpText}\` ${xpEmoji}.`,
      ].join('\n'))
  }

  if (result === 'tie') {
    return new EmbedBuilder()
      .setColor('#ffee58')
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 256 }),
      })
      .setDescription([
        '**Égalité !**',
        '',
        `Vous avez un total de ${playerTotal} et moi ${dealerTotal} points.`,
        `Votre mise \`${amountText}\` ${coinEmoji} vous est rendue.`,
      ].join('\n'))
  }

  if (result === 'surrender') {
    return new EmbedBuilder()
      .setColor('#ffee58')
      .setAuthor({
        name: user.username,
        iconURL: user.displayAvatarURL({ size: 256 }),
      })
      .setDescription([
        '**Vous avez abandonné.**',
        '',
        `Remboursement: \`${amountText}\` ${coinEmoji} (50%).`,
      ].join('\n'))
  }

  return new EmbedBuilder()
    .setColor('#ffee58')
    .setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL({ size: 256 }),
    })
    .setDescription([
      '**Vous avez perdu !**',
      '',
      `Vous avez un total de ${playerTotal} et moi ${dealerTotal} points.`,
      `Vous venez de perdre \`${amountText}\` ${coinEmoji}.`,
    ].join('\n'))
}

export default defineCommand({
  name: 'blackjack',
  aliases: ['bj'],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config.cooldowns.blackjackMs,
  async execute({ client, message, args, embed, status }) {
    const minBet = resolveMinGameBet(client.config)
    const bet = parseIntInRange(args[0], minBet, Number.MAX_SAFE_INTEGER)
    if (!bet) {
      return message.reply({ embeds: [embed({ variant: 'error', description: status(false, `Usage: +blackjack {mise>=${minBet}}`) })] })
    }

    const userData = client.store.getUser(message.guild.id, message.author.id)
    if (userData.coins < bet) {
      return message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Solde insuffisant.') })] })
    }

    client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: -bet })

    const nonce = `${message.author.id}-${Date.now()}`
    const session = {
      bet,
      player: [drawCard(), drawCard()],
      dealer: [drawCard(), drawCard()],
      finished: false,
    }

    const panel = await message.reply({
      embeds: [buildGameEmbed(client, message.author, session)],
      components: controls(nonce, false),
    })

    const settleStand = async () => {
      if (session.finished) return
      session.finished = true

      await panel.edit({ components: controls(nonce, true) }).catch(() => null)
      await sleep(350)

      while (handValue(session.dealer) < 17) {
        session.dealer.push(drawCard())
      }

      const p = handValue(session.player)
      const d = handValue(session.dealer)

      if (p > 21) {
        await panel.edit({
          embeds: [buildFinalEmbed(client, message.author, { result: 'lose', playerTotal: p, dealerTotal: d, amount: session.bet })],
          components: [],
        }).catch(() => null)
        return
      }

      if (d > 21 || p > d) {
        const payout = session.bet * 2
        client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: payout, xpDelta: BLACKJACK_WIN_XP })
        await panel.edit({
          embeds: [buildFinalEmbed(client, message.author, { result: 'win', playerTotal: p, dealerTotal: d, amount: payout, xpAmount: BLACKJACK_WIN_XP })],
          components: [],
        }).catch(() => null)
        return
      }

      if (p === d) {
        client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: session.bet })
        await panel.edit({
          embeds: [buildFinalEmbed(client, message.author, { result: 'tie', playerTotal: p, dealerTotal: d, amount: session.bet })],
          components: [],
        }).catch(() => null)
        return
      }

      await panel.edit({
        embeds: [buildFinalEmbed(client, message.author, { result: 'lose', playerTotal: p, dealerTotal: d, amount: session.bet })],
        components: [],
      }).catch(() => null)
    }

    const settleSurrender = async () => {
      if (session.finished) return
      session.finished = true

      const refund = Math.floor(session.bet / 2)
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: refund })

      await panel.edit({
        embeds: [buildFinalEmbed(client, message.author, { result: 'surrender', playerTotal: handValue(session.player), dealerTotal: handValue(session.dealer), amount: refund })],
        components: [],
      }).catch(() => null)
    }

    const collector = panel.createMessageComponentCollector({ time: 120_000 })

    collector.on('collect', async (interaction) => {
      if (!interaction.isButton()) return
      if (!interaction.customId.startsWith(`bj:${nonce}:`)) return

      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Cette partie ne vous appartient pas.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      if (session.finished) {
        await interaction.reply({
          embeds: [embed({ variant: 'warning', description: status(false, 'Partie terminée.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      const action = interaction.customId.split(':').at(-1)

      if (action === 'hit') {
        session.player.push(drawCard())
        await interaction.update({
          embeds: [buildGameEmbed(client, message.author, session)],
          components: controls(nonce, false),
        }).catch(() => null)

        if (handValue(session.player) > 21) {
          collector.stop('bust')
          await settleStand()
        }
        return
      }

      if (action === 'stand') {
        await interaction.update({
          embeds: [buildGameEmbed(client, message.author, session)],
          components: controls(nonce, true),
        }).catch(() => null)
        collector.stop('stand')
        await settleStand()
        return
      }

      if (action === 'surrender') {
        await interaction.update({
          embeds: [buildGameEmbed(client, message.author, session)],
          components: controls(nonce, true),
        }).catch(() => null)
        collector.stop('surrender')
        await settleSurrender()
      }
    })

    collector.on('end', async (_, reason) => {
      if (session.finished) return
      if (reason === 'surrender') return
      await settleStand()
    })
  },
})
