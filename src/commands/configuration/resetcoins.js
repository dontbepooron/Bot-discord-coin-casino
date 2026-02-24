import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { formatCoinsBackticks } from '../../utils/format.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'resetcoins',
  aliases: ['coinsreset'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    if (!target) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +resetcoins {@/id/reply}') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const before = client.store.getUser(message.guild.id, target.id)
    const beforeCoins = Math.max(0, Number.parseInt(before?.coins, 10) || 0)

    if (beforeCoins <= 0) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, `${target} a déjà 0 coin.`) })],
        allowedMentions: { users: [target.id], parse: [] },
      })
    }

    client.store.addBalance(message.guild.id, target.id, { coinsDelta: -beforeCoins }, {
      source: 'admin:reset_coins_user',
      reason: `Reset coins utilisateur par ${message.author.id}`,
      actorId: message.author.id,
      metadata: {
        resetAmount: beforeCoins,
      },
    })

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(true, `${target} a été reset de ${formatCoinsBackticks(client.config, beforeCoins)}.`),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})

