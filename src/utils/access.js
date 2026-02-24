import { msToHuman } from './time.js'

function getCommandAssignedGroup(store, guildId, command) {
  const assigned = store.getCommandGroup(guildId, command.name)
  if (assigned != null) return assigned
  if (command.groupControlled) return command.defaultGroup || 9
  return null
}

export function resolveAccess(client, message, command) {
  const { store, config } = client
  const userId = message.author.id

  const isBuyer = userId === config.buyerId
  if (isBuyer) return { ok: true, level: 'buyer' }

  const isOwner = store.isOwner(userId)
  if (command.buyerOnly) {
    return { ok: false, reason: 'buyer_only' }
  }

  if (isOwner) {
    return { ok: true, level: 'owner' }
  }

  const assignedGroup = getCommandAssignedGroup(store, message.guild.id, command)

  if (assignedGroup == null) {
    if (command.ownerOnly || command.requiredLevel === 2) {
      return { ok: false, reason: 'owner_only' }
    }

    return { ok: true, level: 'public' }
  }

  const roles = [...message.member.roles.cache.keys()]
  const memberRank = store.getMemberBestGroupRank(message.guild.id, roles)
  if (memberRank == null) {
    return { ok: false, reason: 'group_role_required', requiredGroup: assignedGroup }
  }

  if (memberRank <= assignedGroup) {
    return { ok: true, level: `group_${memberRank}`, requiredGroup: assignedGroup }
  }

  return { ok: false, reason: 'group_too_low', memberGroup: memberRank, requiredGroup: assignedGroup }
}

export function resolveBlacklist(client, userId) {
  const state = client.store.isBlacklisted(userId)
  if (!state.ok) return { ok: true }

  if (state.type === 'temporary' && state.remainingMs != null) {
    return {
      ok: false,
      message: `Vous êtes blacklist temporairement. Temps restant: ${msToHuman(state.remainingMs)}.`,
      details: state,
    }
  }

  return {
    ok: false,
    message: 'Vous êtes blacklisté de ce bot.',
    details: state,
  }
}
