import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'warn',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    if (!target) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +warn {@/id/reply}') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const warnId = client.store.addWarn({
      guildId: message.guild.id,
      userId: target.id,
      authorId: message.author.id,
      reason: `Warn par ${message.author.id}`,
    })

    const count = client.store.countWarns(message.guild.id, target.id)
    const threshold = client.config.limits?.warnThreshold || 3

    let extra = ''
    if (count >= threshold) {
      const durationMs = client.config.limits?.autoTempblMs || (3 * 24 * 60 * 60 * 1000)
      client.store.setBlacklist(target.id, {
        type: 'temporary',
        authorId: message.author.id,
        reason: `Auto tempbl après ${count} warns`,
        durationMs,
      })
      extra = '\nTemp blacklist automatique appliquée (3 jours).'
    }

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(true, `${target} warn ajouté (#${warnId}). Total warns: ${count}.${extra}`),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
