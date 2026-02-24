import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { parseIntInRange } from '../../utils/commandToolkit.js'
import { formatCoinsBackticks } from '../../utils/format.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'removecoins',
  aliases: ['takecoins'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    const amount = parseIntInRange(args[1], 1, Number.MAX_SAFE_INTEGER)

    if (!target || !amount) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +removecoins {@/id/reply} {montant}') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const before = client.store.getUser(message.guild.id, target.id)
    client.store.addBalance(message.guild.id, target.id, { coinsDelta: -amount }, {
      source: 'admin:remove_coins',
      reason: `Retrait admin par ${message.author.id}`,
      actorId: message.author.id,
      metadata: {
        askedAmount: amount,
      },
    })
    const after = client.store.getUser(message.guild.id, target.id)
    const removed = Math.max(0, (Number.parseInt(before?.coins, 10) || 0) - (Number.parseInt(after?.coins, 10) || 0))

    return message.reply({
      embeds: [
        embed({
          variant: removed > 0 ? 'success' : 'warning',
          description: removed > 0
            ? status(true, `${target} a perdu ${formatCoinsBackticks(client.config, removed)}.`)
            : status(false, `${target} n’avait aucun coin à retirer.`),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})

