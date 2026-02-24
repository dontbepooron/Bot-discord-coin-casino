import ms from 'ms'
import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { msToHuman } from '../../utils/time.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'tempbl',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    const durationRaw = args[1]
    const durationMs = ms(durationRaw || '')

    if (!target || !Number.isFinite(durationMs) || durationMs <= 0) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +tempbl {@/id/reply} {durée} (ex: 1d, 2w, 30m)') })],
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
      type: 'temporary',
      authorId: message.author.id,
      reason: `Blacklist temporaire (${durationRaw})`,
      durationMs,
    })

    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, `${target} blacklisté temporairement (${msToHuman(durationMs)}).`) })],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
