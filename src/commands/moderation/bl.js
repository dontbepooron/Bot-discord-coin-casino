import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'bl',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    if (!target) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +bl {@/id/reply}') })],
      })
    }

    if (target.id === client.config.buyerId) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Impossible de blacklist le buyer.') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    client.store.setBlacklist(target.id, {
      type: 'permanent',
      authorId: message.author.id,
      reason: `Blacklist par ${message.author.id}`,
    })

    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, `${target} blacklisté (permanent).`) })],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
