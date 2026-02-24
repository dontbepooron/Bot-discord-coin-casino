import { resolveAccess } from './access.js'
import { buildEmbed, withStatusEmoji } from './embedBuilder.js'

export function ensureCommandAccess(client, message, command) {
  const check = resolveAccess(client, message, command)
  if (check.ok) return { ok: true }

  let reason = 'Accès refusé.'
  if (check.reason === 'buyer_only') reason = 'Commande réservée au buyer.'
  if (check.reason === 'owner_only') reason = 'Commande réservée aux owners.'
  if (check.reason === 'group_role_required') reason = `Rôle de groupe requis (groupe ${check.requiredGroup}).`
  if (check.reason === 'group_too_low') reason = `Permissions insuffisantes. Groupe requis: ${check.requiredGroup}.`

  return {
    ok: false,
    reply: message.reply({
      embeds: [
        buildEmbed(client.config, {
          variant: 'error',
          description: withStatusEmoji(client.config, false, reason),
        }),
      ],
    }),
  }
}
