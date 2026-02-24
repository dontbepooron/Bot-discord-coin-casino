import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'unbl',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    if (!target) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +unbl {@/id/reply}') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const removed = client.store.removeBlacklist(target.id, message.author.id)
    return message.reply({
      embeds: [
        embed({
          variant: removed ? 'success' : 'warning',
          description: removed
            ? status(true, `${target} retiré de la blacklist.`)
            : status(false, 'Cet utilisateur n’était pas blacklisté.'),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
