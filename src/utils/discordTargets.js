import { parseUserId } from './commandToolkit.js'

export function resolveTargetUserId(message, raw = null) {
  const fromArg = parseUserId(raw || '')
  if (fromArg) return fromArg

  const mention = message.mentions?.users?.first?.()
  if (mention?.id) return mention.id

  const replied = message.reference?.messageId
  if (replied && message.channel?.messages?.fetch) {
    return null
  }

  return null
}

export async function resolveTargetMember(message, raw = null) {
  const userId = parseUserId(raw || '')
    || message.mentions?.users?.first?.()?.id
    || null

  if (!userId) {
    if (message.reference?.messageId) {
      const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
      if (replied?.author?.id) {
        const member = await message.guild.members.fetch(replied.author.id).catch(() => null)
        if (member) return member
      }
    }
    return null
  }

  const member = message.guild.members.cache.get(userId)
    || await message.guild.members.fetch(userId).catch(() => null)
  return member || null
}

export async function resolveTargetUser(message, raw = null) {
  const userId = parseUserId(raw || '')
    || message.mentions?.users?.first?.()?.id
    || null

  if (!userId) {
    if (message.reference?.messageId) {
      const replied = await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
      return replied?.author || null
    }
    return null
  }

  return message.client.users.fetch(userId).catch(() => null)
}
