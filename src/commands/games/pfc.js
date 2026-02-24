import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetMember } from '../../utils/discordTargets.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'
import { formatCoins, formatCoinsBackticks } from '../../utils/format.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

function challengeButtons(nonce, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pfc:req:${nonce}:accept`).setLabel('Accepter').setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`pfc:req:${nonce}:decline`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setDisabled(disabled)
    ),
  ]
}

function choiceButtons(nonce, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pfc:play:${nonce}:rock`).setLabel('Pierre').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`pfc:play:${nonce}:paper`).setLabel('Feuille').setStyle(ButtonStyle.Primary).setDisabled(disabled),
      new ButtonBuilder().setCustomId(`pfc:play:${nonce}:scissors`).setLabel('Ciseaux').setStyle(ButtonStyle.Primary).setDisabled(disabled)
    ),
  ]
}

function getWinner(a, b) {
  if (a === b) return 'tie'
  if ((a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock')) {
    return 'a'
  }
  return 'b'
}

function toLabel(choice) {
  if (choice === 'rock') return 'Pierre'
  if (choice === 'paper') return 'Feuille'
  if (choice === 'scissors') return 'Ciseaux'
  return choice
}

function resolveMinGameBet(config) {
  const raw = Number.parseInt(config?.limits?.minGameBet, 10)
  if (!Number.isInteger(raw) || raw < 1) return 100
  return raw
}

export default defineCommand({
  name: 'pfc',
  aliases: ['rps'],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config.cooldowns.pfcMs,
  async execute({ client, message, args, embed, status }) {
    const opponent = await resolveTargetMember(message, args[0])
    const minBet = resolveMinGameBet(client.config)
    const bet = parseIntInRange(args[1], minBet, Number.MAX_SAFE_INTEGER)

    if (!opponent || !bet) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Usage: +pfc {@/id/reply} {mise>=${minBet}}`) })],
      })
    }

    if (opponent.id === message.author.id || opponent.user.bot) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Adversaire invalide.') })],
      })
    }

    const opponentHasProfile = await ensureMessageTargetHasProfile(client, message, opponent.user, { embed, status })
    if (!opponentHasProfile) return null

    const challenger = client.store.getUser(message.guild.id, message.author.id)
    if (challenger.coins < bet) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Solde insuffisant pour lancer le défi.') })],
      })
    }

    const nonce = `${message.author.id}:${opponent.id}:${Date.now()}`

    const requestMsg = await message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: 'Défi PFC',
          description: `${opponent}, ${message.author} vous défie pour ${formatCoins(client.config, bet)}.`,
        }),
      ],
      components: challengeButtons(nonce, false),
      allowedMentions: { users: [opponent.id, message.author.id], parse: [] },
    })

    const requestCollector = requestMsg.createMessageComponentCollector({ time: 45_000 })

    requestCollector.on('collect', async (interaction) => {
      if (!interaction.isButton()) return
      if (!interaction.customId.startsWith(`pfc:req:${nonce}:`)) return

      if (interaction.user.id !== opponent.id) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Seul l’adversaire peut répondre.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      const action = interaction.customId.split(':')[3]
      if (action === 'decline') {
        requestCollector.stop('declined')
        await interaction.update({
          embeds: [embed({ variant: 'warning', description: status(false, `${opponent} a refusé le défi.`) })],
          components: challengeButtons(nonce, true),
        }).catch(() => null)
        return
      }

      if (action !== 'accept') return

      if (!client.store.hasProfile(opponent.id)) {
        requestCollector.stop('no_profile')
        await interaction.update({
          embeds: [
            embed({
              variant: 'error',
              description: status(false, `${opponent} n’a pas de profil. Défi annulé.`),
            }),
          ],
          components: challengeButtons(nonce, true),
          allowedMentions: { users: [opponent.id], parse: [] },
        }).catch(() => null)
        return
      }

      const challengerNow = client.store.getUser(message.guild.id, message.author.id)
      const opponentNow = client.store.getUser(message.guild.id, opponent.id)

      if (challengerNow.coins < bet || opponentNow.coins < bet) {
        requestCollector.stop('insufficient')
        await interaction.update({
          embeds: [embed({ variant: 'error', description: status(false, 'Un des joueurs n’a plus la mise nécessaire.') })],
          components: challengeButtons(nonce, true),
        }).catch(() => null)
        return
      }

      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: -bet })
      client.store.addBalance(message.guild.id, opponent.id, { coinsDelta: -bet })

      requestCollector.stop('accepted')

      await interaction.update({
        embeds: [
          embed({
            variant: 'info',
            title: 'PFC en cours',
            description: [
              `${message.author} vs ${opponent}`,
              `Mise: ${formatCoins(client.config, bet)} chacun`,
              'Choisissez Pierre, Feuille ou Ciseaux sur ce message.',
            ].join('\n'),
          }),
        ],
        components: choiceButtons(nonce, false),
        allowedMentions: { users: [message.author.id, opponent.id], parse: [] },
      }).catch(() => null)

      const choices = new Map()
      const playCollector = requestMsg.createMessageComponentCollector({ time: 60_000 })

      const finishGame = async (timedOut = false) => {
        if (choices.size < 2 || timedOut) {
          client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: bet })
          client.store.addBalance(message.guild.id, opponent.id, { coinsDelta: bet })

          await requestMsg.edit({
            embeds: [embed({ variant: 'warning', description: status(false, 'PFC expiré: mises remboursées.') })],
            components: choiceButtons(nonce, true),
          }).catch(() => null)
          return
        }

        const aChoice = choices.get(message.author.id)
        const bChoice = choices.get(opponent.id)
        const winner = getWinner(aChoice, bChoice)

        if (winner === 'tie') {
          client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: bet })
          client.store.addBalance(message.guild.id, opponent.id, { coinsDelta: bet })

          await requestMsg.edit({
            embeds: [
              embed({
                variant: 'info',
                title: 'PFC - Égalité',
                description: [
                  `${message.author}: ${toLabel(aChoice)}`,
                  `${opponent}: ${toLabel(bChoice)}`,
                  'Égalité, mises remboursées.',
                ].join('\n'),
              }),
            ],
            components: choiceButtons(nonce, true),
          }).catch(() => null)
          return
        }

        const winnerId = winner === 'a' ? message.author.id : opponent.id
        client.store.addBalance(message.guild.id, winnerId, { coinsDelta: bet * 2 })

        await requestMsg.edit({
          embeds: [
            embed({
              variant: 'success',
              title: 'PFC - Résultat',
              description: [
                `${message.author}: ${toLabel(aChoice)}`,
                `${opponent}: ${toLabel(bChoice)}`,
                `Gagnant: <@${winnerId}>`,
                `Gain: ${formatCoinsBackticks(client.config, bet * 2)}`,
              ].join('\n'),
            }),
          ],
          components: choiceButtons(nonce, true),
          allowedMentions: { users: [winnerId], parse: [] },
        }).catch(() => null)
      }

      playCollector.on('collect', async (choiceInteraction) => {
        if (!choiceInteraction.isButton()) return
        if (!choiceInteraction.customId.startsWith(`pfc:play:${nonce}:`)) return

        const playerId = choiceInteraction.user.id
        if (playerId !== message.author.id && playerId !== opponent.id) {
          await choiceInteraction.reply({
            embeds: [embed({ variant: 'error', description: status(false, 'Vous ne participez pas à cette partie.') })],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null)
          return
        }

        const choice = choiceInteraction.customId.split(':')[3]
        choices.set(playerId, choice)

        await choiceInteraction.reply({
          embeds: [embed({ variant: 'info', description: `Choix enregistré: **${toLabel(choice)}**.` })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)

        if (choices.size >= 2) {
          playCollector.stop('done')
        }
      })

      playCollector.on('end', async (_, reason) => {
        await finishGame(reason !== 'done')
      })
    })

    requestCollector.on('end', async (_, reason) => {
      if (['accepted', 'declined', 'insufficient'].includes(reason)) return
      await requestMsg.edit({
        embeds: [embed({ variant: 'warning', description: status(false, 'Défi PFC expiré.') })],
        components: challengeButtons(nonce, true),
      }).catch(() => null)
    })
  },
})
