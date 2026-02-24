import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetMember } from '../../utils/discordTargets.js'
import { randomInt } from '../../utils/random.js'
import { formatCoins, formatCoinsBackticks, formatXp } from '../../utils/format.js'
import { runSuspenseEdit } from '../../utils/suspense.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

export default defineCommand({
  name: 'vol',
  aliases: ['steal'],
  profileRequired: true,
  blockable: true,
  cooldownMs: (client) => client.config.cooldowns.volMs,
  async execute({ client, message, args, embed, status }) {
    const targetMember = await resolveTargetMember(message, args[0])
    if (!targetMember) {
      return message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Usage: +vol {@/id}') })] })
    }

    if (targetMember.id === message.author.id || targetMember.user.bot) {
      return message.reply({ embeds: [embed({ variant: 'error', description: status(false, 'Cible invalide.') })] })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, targetMember.user, { embed, status })
    if (!targetHasProfile) return null

    const thief = client.store.getUser(message.guild.id, message.author.id)
    const victim = client.store.getUser(message.guild.id, targetMember.id)

    const maxCoins = Math.min(victim.coins, client.config.limits?.maxVolCoins || 60000)
    const maxXp = Math.min(victim.xp_flasks, client.config.limits?.maxVolXp || 100)

    if (maxCoins <= 0 && maxXp <= 0) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'La cible n’a rien à voler.') })],
      })
    }

    const stolenCoins = maxCoins > 0 ? randomInt(1, maxCoins) : 0
    const stolenXp = maxXp > 0 ? randomInt(1, maxXp) : 0

    const suspense = await message.reply({
      embeds: [embed({ variant: 'info', description: `Tentative de vol sur ${targetMember}...` })],
    })

    const frames = Array.from({ length: 9 }).map(() => ({
      embeds: [
        embed({
          variant: 'info',
          description: `Vous êtes en train de voler ${formatCoinsBackticks(client.config, randomInt(1, Math.max(1, maxCoins || 1)))} à ${targetMember}...`,
        }),
      ],
    }))

    await runSuspenseEdit(suspense, frames, 3000, 320)

    if (stolenCoins > 0) {
      client.store.addBalance(message.guild.id, targetMember.id, { coinsDelta: -stolenCoins })
      client.store.addBalance(message.guild.id, message.author.id, { coinsDelta: stolenCoins })
    }

    if (stolenXp > 0) {
      client.store.addBalance(message.guild.id, targetMember.id, { xpDelta: -stolenXp })
      client.store.addBalance(message.guild.id, message.author.id, { xpDelta: stolenXp })
    }

    const resultLines = [
      status(true, `Vol réussi sur ${targetMember}.`),
      `Coins volés: ${formatCoinsBackticks(client.config, stolenCoins)}`,
      `Fioles XP volées: ${formatXp(client.config, stolenXp)}`,
    ]

    await suspense.edit({
      embeds: [embed({ variant: 'success', title: 'Résultat du vol', description: resultLines.join('\n') })],
      allowedMentions: { users: [targetMember.id], parse: [] },
    }).catch(() => null)

    const dmSent = await targetMember.send({
      embeds: [
        embed({
          variant: 'warning',
          title: 'Vous avez été volé',
          description: [
            `Voleur: ${message.author} (${message.author.id})`,
            `Coins perdus: ${formatCoinsBackticks(client.config, stolenCoins)}`,
            `Fioles XP perdues: ${formatXp(client.config, stolenXp)}`,
          ].join('\n'),
        }),
      ],
    }).then(() => true).catch(() => false)

    if (!dmSent) {
      // Non-embed fallback explicitly required by spec.
      await message.channel.send(`${targetMember} vous avez été volé par ${message.author} (${message.author.id}).`).catch(() => null)
    }

    void thief
  },
})
