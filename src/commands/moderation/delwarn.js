import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'delwarn',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ message, args, client, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    const warnId = parseIntInRange(args[1], 1, Number.MAX_SAFE_INTEGER)

    if (!target || !warnId) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +delwarn {@/id/reply} {id du warn}') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const ok = client.store.deleteWarn(message.guild.id, target.id, warnId)
    return message.reply({
      embeds: [
        embed({
          variant: ok ? 'success' : 'warning',
          description: ok
            ? status(true, `Warn #${warnId} supprimé pour ${target}.`)
            : status(false, 'Warn introuvable pour cet utilisateur.'),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
