import { logger } from '../core/logger.js'

const ROLE_CATEGORIES = new Set(['couleur', 'decoratif', 'badge', 'succes'])

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseRoleIdLike(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  const mention = raw.match(/^<@&(\d{17,20})>$/)
  if (mention?.[1]) return mention[1]
  const direct = raw.match(/^(\d{17,20})$/)
  if (direct?.[1]) return direct[1]
  return null
}

function asRoleNameLike(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (parseRoleIdLike(raw)) return null
  if (/^\d+$/.test(raw)) return null
  return raw.replace(/^@+/, '').trim()
}

function isRoleRewardItem(item) {
  if (!item) return false
  const rewardType = normalizeName(item.reward_type)
  if (rewardType === 'role') return true
  return ROLE_CATEGORIES.has(normalizeName(item.category))
}

function resolveRoleNameCandidates(item) {
  const candidates = new Map()
  const add = (value) => {
    const roleName = asRoleNameLike(value)
    if (!roleName) return
    const key = normalizeName(roleName)
    if (!key) return
    candidates.set(key, roleName)
  }

  add(item?.name)

  const rewardType = normalizeName(item?.reward_type)
  if (rewardType === 'role' || rewardType === 'cosmetic' || ROLE_CATEGORIES.has(normalizeName(item?.category))) {
    add(item?.reward_value)
  }

  return [...candidates.values()]
}

function findRoleByCandidates(guild, candidates = []) {
  if (!guild?.roles?.cache || !Array.isArray(candidates) || !candidates.length) return null
  for (const candidate of candidates) {
    const target = normalizeName(candidate)
    if (!target) continue
    const found = guild.roles.cache.find((role) => normalizeName(role?.name) === target)
    if (found?.id) return found
  }
  return null
}

async function getBotMember(guild) {
  if (!guild?.members) return null
  if (guild.members.me) return guild.members.me
  if (guild.members.fetchMe) {
    return guild.members.fetchMe().catch(() => null)
  }
  return null
}

async function findOrCreateRoleForItem(guild, item) {
  const candidates = resolveRoleNameCandidates(item)
  if (!candidates.length) return { role: null, created: false }

  const rewardType = normalizeName(item?.reward_type)
  const explicitRoleId = parseRoleIdLike(item?.role_id)
    || (rewardType === 'role' ? parseRoleIdLike(item?.reward_value) : null)

  if (explicitRoleId) {
    const explicit = guild.roles.cache.get(explicitRoleId) || await guild.roles.fetch(explicitRoleId).catch(() => null)
    if (explicit?.id) return { role: explicit, created: false }
  }

  const existing = findRoleByCandidates(guild, candidates)
  if (existing?.id) return { role: existing, created: false }

  const me = await getBotMember(guild)
  if (!me?.permissions?.has?.('ManageRoles')) {
    return { role: null, created: false }
  }

  const roleName = String(candidates[0]).slice(0, 100)
  if (!roleName) return { role: null, created: false }

  const created = await guild.roles.create({
    name: roleName,
    mentionable: false,
    reason: 'Bootstrap roles systeme setup',
  }).catch(() => null)

  return { role: created || null, created: Boolean(created) }
}

function updateItemRoleId(client, guildId, sourceType, itemId, roleId) {
  const safeRoleId = parseRoleIdLike(roleId)
  const safeItemId = Number.parseInt(itemId, 10) || 0
  if (!safeRoleId || safeItemId <= 0) return false

  if (sourceType === 'draw') {
    return Boolean(client.store.updateCasinoDrawItem(guildId, safeItemId, { roleId: safeRoleId })?.ok)
  }
  if (sourceType === 'shop') {
    return Boolean(client.store.updateCasinoShopItem(guildId, safeItemId, { roleId: safeRoleId })?.ok)
  }
  return false
}

export async function ensureDrawSystemRolesForGuild(client, guild) {
  if (!guild?.id) return { ok: false, reason: 'invalid_guild' }

  client.store.seedCasinoSetupDefaults(guild.id, 'system')
  await guild.roles.fetch().catch(() => null)

  const sources = [
    { sourceType: 'draw', items: client.store.listCasinoDrawItems(guild.id, { enabledOnly: false }) },
    { sourceType: 'shop', items: client.store.listCasinoShopItems(guild.id, { enabledOnly: false }) },
  ]

  let created = 0
  let linked = 0
  let unresolved = 0

  for (const source of sources) {
    for (const item of source.items) {
      if (!isRoleRewardItem(item)) continue

      const ensured = await findOrCreateRoleForItem(guild, item)
      const role = ensured.role
      if (!role?.id) {
        unresolved += 1
        continue
      }

      if (ensured.created) created += 1

      const currentRoleId = parseRoleIdLike(item?.role_id)
      if (currentRoleId !== role.id) {
        const updated = updateItemRoleId(client, guild.id, source.sourceType, item.id, role.id)
        if (updated) linked += 1
      }
    }
  }

  return { ok: true, created, linked, unresolved }
}

export async function ensureDrawSystemRolesForAllGuilds(client) {
  const guilds = [...client.guilds.cache.values()]
  for (const guild of guilds) {
    const result = await ensureDrawSystemRolesForGuild(client, guild).catch((error) => ({ ok: false, reason: error?.message || 'unknown' }))
    if (!result?.ok) {
      logger.warn(`[draw-role-bootstrap] ${guild.id} skipped: ${result?.reason || 'unknown'}`)
    }
  }
}
