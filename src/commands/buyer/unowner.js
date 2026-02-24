import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'unowner',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    if (!target) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +unowner {@/id/reply}') })],
      })
    }

    if (target.id === client.config.buyerId) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Impossible de retirer le buyer.') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const removed = client.store.removeOwner(target.id)
    return message.reply({
      embeds: [
        embed({
          variant: removed ? 'success' : 'warning',
          description: removed
            ? status(true, `${target} n'est plus owner.`)
            : status(false, 'Cet utilisateur n’était pas owner.'),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
