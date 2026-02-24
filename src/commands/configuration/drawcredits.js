import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'drawcredits',
  aliases: ['tiragecredits'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    const amount = Number.parseInt(args[1] || '', 10)

    if (!target || !Number.isInteger(amount) || amount === 0) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +drawcredits {@/id/reply} {+/-montant}') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const profile = client.store.addCasinoDrawCredits(message.guild.id, target.id, amount)

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(
            true,
            `${target} a maintenant **${profile.draw_credits}** tirage(s) disponible(s).`
          ),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
