import { defineCommand } from '../../utils/commandHelpers.js'
import { EmbedBuilder } from 'discord.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

const NUMBER = new Intl.NumberFormat('en-US')

function resolveCoinName(config) {
  const fromNameCoin = String(config?.namecoin || '').trim()
  if (fromNameCoin) return fromNameCoin
  const fromCurrency = String(config?.currency?.name || '').trim()
  if (fromCurrency) return fromCurrency
  return 'Coins'
}

export default defineCommand({
  name: 'bal',
  aliases: ['balance'],
  profileRequired: true,
  async execute({ client, message, args, embed, status }) {
    let targetUser = message.author
    const wantTarget = Boolean(args[0]) || Boolean(message.reference?.messageId)
    if (wantTarget) {
      targetUser = await resolveTargetUser(message, args[0])
      if (!targetUser) {
        return message.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Usage: +bal {@/id/reply}') })],
        })
      }
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, targetUser, { embed, status })
    if (!targetHasProfile) return null

    const user = client.store.getUser(message.guild.id, targetUser.id)
    const coinEmoji = client.config?.currency?.coinEmoji || '🪙'
    const xpEmoji = client.config?.currency?.xpFlaskEmoji || '🧪'
    const coinName = resolveCoinName(client.config)

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#ffff00')
          .setAuthor({
            name: targetUser.username,
            iconURL: targetUser.displayAvatarURL({ size: 256 }),
          })
          .setDescription([
            `**${targetUser.username} a**`,
            `${coinEmoji} ${NUMBER.format(user.coins)} ${coinName}`,
            `${xpEmoji} ${NUMBER.format(user.xp_flasks)} fioles`,
          ].join('\n')),
      ],
      allowedMentions: { users: [targetUser.id], parse: [] },
    })
  },
})
