import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetMember } from '../../utils/discordTargets.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'
import { formatCoins, formatCoinsBackticks } from '../../utils/format.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'don',
  aliases: ['give'],
  profileRequired: true,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetMember(message, args[0])
    const max = client.config.limits?.maxDonation || 250000
    const amount = parseIntInRange(args[1], 1, max)

    if (!target || !amount) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Usage: +don {@/id/reply} {montant<=${max}}`) })],
      })
    }

    if (target.id === message.author.id || target.user.bot) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Cible invalide pour un don.') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target.user, { embed, status })
    if (!targetHasProfile) return null

    const donor = client.store.getUser(message.guild.id, message.author.id)
    if (donor.coins < amount) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Solde insuffisant.') })],
      })
    }

    const tax = Math.floor(amount * 0.1)
    const received = amount - tax

    client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: -amount })
    client.store.addBalance(message.guild.id, target.id, { coinsDelta: received })

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: [
            status(true, `Don envoyé à ${target}.`),
            `Montant: ${formatCoins(client.config, amount)}`,
            `Taxe (10%): ${formatCoins(client.config, tax)}`,
            `Reçu par ${target}: ${formatCoinsBackticks(client.config, received)}`,
          ].join('\n'),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
