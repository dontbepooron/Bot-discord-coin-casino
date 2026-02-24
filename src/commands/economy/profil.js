import { defineCommand } from '../../utils/commandHelpers.js'
import { buildProfileCardPayload } from '../../utils/profileSystem.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'profil',
  aliases: ['profile', 'proifl'],
  profileRequired: true,
  async execute({ client, message, args, embed, status }) {
    let targetUser = message.author
    const wantTarget = Boolean(args[0]) || Boolean(message.reference?.messageId)
    if (wantTarget) {
      targetUser = await resolveTargetUser(message, args[0])
      if (!targetUser) {
        return message.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Usage: +profil {@/id/reply}') })],
        })
      }
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, targetUser, { embed, status })
    if (!targetHasProfile) return null

    const payload = await buildProfileCardPayload(client, message.guild, targetUser, {
      ephemeral: false,
      includeEmbed: false,
    })

    return message.reply({
      content: payload.content || undefined,
      embeds: [],
      files: payload.files || [],
      components: payload.components || [],
      allowedMentions: { users: [targetUser.id], parse: [] },
    })
  },
})
