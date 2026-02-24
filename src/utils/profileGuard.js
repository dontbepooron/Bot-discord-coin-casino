import { buildEmbed, withStatusEmoji } from './embedBuilder.js'

export function hasProfile(client, userId) {
  if (!client?.store || !userId) return false
  return client.store.hasProfile(String(userId))
}

function buildMissingProfileEmbed(client, { embed = null, status = null, description = '' } = {}) {
  if (typeof embed === 'function' && typeof status === 'function') {
    return embed({
      variant: 'warning',
      description: status(false, description),
    })
  }

  return buildEmbed(client.config, {
    variant: 'warning',
    description: [
      withStatusEmoji(client.config, false, description),
      'Utilisez le bouton **Profil** dans le message de setup.',
    ].join('\n'),
  })
}

export async function ensureMessageAuthorHasProfile(client, message, { embed = null, status = null } = {}) {
  if (hasProfile(client, message.author.id)) return true

  await message.reply({
    embeds: [
      buildMissingProfileEmbed(client, {
        embed,
        status,
        description: 'Vous devez créer votre profil avant d’utiliser cette commande.',
      }),
    ],
  }).catch(() => null)

  return false
}

export async function ensureMessageTargetHasProfile(client, message, targetUser, { embed = null, status = null } = {}) {
  const userId = targetUser?.id || null
  if (!userId) return false
  if (hasProfile(client, userId)) return true

  const mention = `<@${userId}>`
  await message.reply({
    embeds: [
      buildMissingProfileEmbed(client, {
        embed,
        status,
        description: `${mention} n’a pas de profil. Il doit d’abord créer son profil via le bouton **Profil**.`,
      }),
    ],
    allowedMentions: { users: [userId], parse: [] },
  }).catch(() => null)

  return false
}

export async function ensureHasProfile(client, message) {
  return ensureMessageAuthorHasProfile(client, message)
}
