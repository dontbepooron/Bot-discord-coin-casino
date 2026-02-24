import { defineCommand } from '../../utils/commandHelpers.js'
import { resolveTargetUser } from '../../utils/discordTargets.js'
import { parseUserId } from '../../utils/commandToolkit.js'
import { ensureMessageTargetHasProfile } from '../../utils/profileGuard.js'

const FR = new Intl.NumberFormat('fr-FR')
const MAX_COINS = BigInt(Number.MAX_SAFE_INTEGER)

function resolveAmountArg(args, message) {
  const first = String(args[0] || '').trim()
  const firstIsUser = Boolean(parseUserId(first)) || Boolean(message.mentions?.users?.first?.())
  if (firstIsUser) return String(args[1] || '').trim()
  return first
}

function parseCoins(raw) {
  const safe = String(raw || '').replace(/[,_\s]/g, '')
  if (!/^\d+$/.test(safe)) return null

  try {
    const parsed = BigInt(safe)
    if (parsed <= 0n) return null
    return parsed
  } catch {
    return null
  }
}

function toBigIntSafeInt(value) {
  const parsed = Number.parseInt(value ?? 0, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return 0n
  return BigInt(parsed)
}

export default defineCommand({
  name: 'give',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const target = await resolveTargetUser(message, args[0])
    const requested = parseCoins(resolveAmountArg(args, message))

    if (!target || !requested) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +give {@/id/reply} {montant}') })],
      })
    }

    const targetHasProfile = await ensureMessageTargetHasProfile(client, message, target, { embed, status })
    if (!targetHasProfile) return null

    const targetUser = client.store.getUser(message.guild.id, target.id)
    const currentCoins = toBigIntSafeInt(targetUser?.coins)

    if (currentCoins >= MAX_COINS) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `${target} a déjà atteint la limite maximale de coins.`) })],
        allowedMentions: { users: [target.id], parse: [] },
      })
    }

    const room = MAX_COINS - currentCoins
    const granted = requested > room ? room : requested
    const grantedNumber = Number.parseInt(granted.toString(), 10)

    client.store.addBalance(message.guild.id, target.id, { coinsDelta: grantedNumber })
    const coinEmoji = client.config?.currency?.coinEmoji || '🪙'
    const limited = granted < requested

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: [
            status(true, `${target} a reçu \`${FR.format(grantedNumber)}\` ${coinEmoji}.`),
            limited ? `Montant demandé trop grand, plafond appliqué automatiquement.` : null,
          ].filter(Boolean).join('\n'),
        }),
      ],
      allowedMentions: { users: [target.id], parse: [] },
    })
  },
})
