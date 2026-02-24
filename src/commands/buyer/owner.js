import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'owner',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    if (!target) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +owner {@/id/reply}') })],
      })
    }

    if (target.id === client.config.buyerId) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Le buyer possède déjà tous les accès.') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const added = client.store.addOwner(target.id, message.author.id)
    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, `${target} est maintenant owner.`) })],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
