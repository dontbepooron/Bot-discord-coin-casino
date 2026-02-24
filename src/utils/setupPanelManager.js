import path from 'node:path'
import fs from 'node:fs'
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js'
import { postGainLog } from './gainSystem.js'
import { writeLog } from './logSystem.js'
import { buildProfileCardPayload, buildSuccessPagePayload } from './profileSystem.js'

const FR = new Intl.NumberFormat('fr-FR')
const DEFAULT_UPLOAD_LIMIT = 8 * 1024 * 1024
const SETUP_GIF_FILES = [
  'backgroundcasino.gif',
  'backgroundcasino.compressed.gif',
  'backgroundcasino.original.gif',
]

const MAIN_BUTTONS = [
  { key: 'profile', label: 'Profil' },
  { key: 'draw', label: 'Tirage' },
  { key: 'shop', label: 'Shop' },
  { key: 'inventory', label: 'Inventaire' },
  { key: 'success', label: 'Succès' },
]

const SLOT_BY_CATEGORY = {
  couleur: 'couleur',
  badge: 'badge',
  decoratif: 'decoratif',
  succes: 'succes',
}

function safeInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

function safeFloat(value, fallback = 0) {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

function writeLogAsync(client, payload) {
  void writeLog(client, payload).catch(() => null)
}

function postGainLogAsync(client, guild, payload) {
  void postGainLog(client, guild, payload).catch(() => null)
}

function resolveCoinName(config) {
  const explicit = String(config?.namecoin || '').trim()
  if (explicit) return explicit
  return 'Coins'
}

function resolveStatusKeyword(config) {
  const raw = String(config?.servername || '').trim().toLowerCase()
  const slug = raw.replace(/[^a-z0-9]+/g, '').slice(0, 32)
  return `/${slug || 'casino'}`
}

function resolveCoinEmoji(config) {
  return String(config?.currency?.coinEmoji || '').trim()
}

function resolveXpEmoji(config) {
  return String(config?.currency?.xpFlaskEmoji || '').trim()
}

function isDiscordCustomEmoji(emoji) {
  return /^<a?:[A-Za-z0-9_]+:\d+>$/.test(String(emoji || '').trim())
}

function extractDiscordEmojiId(emoji) {
  const match = String(emoji || '').trim().match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/)
  return match?.[1] || null
}

function resolveRenderableEmoji(emoji, { client = null, guild = null, fallback = '' } = {}) {
  const raw = String(emoji || '').trim()
  if (!raw) return fallback
  if (!isDiscordCustomEmoji(raw)) return raw

  const emojiId = extractDiscordEmojiId(raw)
  if (!emojiId) return fallback
  if (guild?.emojis?.cache?.has?.(emojiId)) return raw
  if (client?.emojis?.cache?.has?.(emojiId)) return raw

  // If custom emoji cannot render in current runtime context, fallback to Unicode.
  return fallback
}

function emojiInBackticks(value) {
  const emoji = String(value || '').trim()
  if (!emoji) return ''
  if (isDiscordCustomEmoji(emoji)) return emoji
  return `\`${emoji}\``
}

function formatNumberBackticks(value) {
  const safe = Math.max(0, Number.parseInt(value, 10) || 0)
  return `\`${FR.format(safe)}\``
}

function formatCoinsBackticksWithEmoji(config, amount, context = {}) {
  const coinEmoji = resolveCoinEmoji(config)
  return `${formatNumberBackticks(amount)} ${emojiInBackticks(coinEmoji)}`
}

function formatXpBackticksWithEmoji(config, amount, context = {}) {
  const xpEmoji = resolveXpEmoji(config)
  return `${formatNumberBackticks(amount)} ${emojiInBackticks(xpEmoji)}`
}

function resolveSetupThumbnail(config) {
  const url = String(config?.setup?.thumbnailUrl || '').trim()
  return url || null
}

function formatSize(bytes) {
  const safe = Math.max(0, Number.parseInt(bytes, 10) || 0)
  return `${(safe / (1024 * 1024)).toFixed(2)}MB`
}

function resolveUploadLimitBytes(guild) {
  const n = Number.parseInt(guild?.maximumUploadLimit || 0, 10)
  if (Number.isFinite(n) && n > 0) return n
  return DEFAULT_UPLOAD_LIMIT
}

function resolveSetupGifPath(client, guild) {
  const baseDir = path.join(client.rootDir, 'image')
  const candidates = SETUP_GIF_FILES
    .map((name) => ({ name, fullPath: path.join(baseDir, name) }))
    .filter((item) => fs.existsSync(item.fullPath))
    .map((item) => ({
      ...item,
      size: fs.statSync(item.fullPath).size,
    }))

  if (!candidates.length) {
    throw new Error('GIF introuvable: image/backgroundcasino.gif')
  }

  const byName = new Map(candidates.map((item) => [item.name, item]))
  const limit = resolveUploadLimitBytes(guild)

  const preferred = byName.get('backgroundcasino.gif')
  if (preferred && preferred.size <= limit) {
    return preferred
  }

  const compressed = byName.get('backgroundcasino.compressed.gif')
  if (compressed && compressed.size <= limit) {
    return compressed
  }

  const anyUnderLimit = candidates
    .slice()
    .sort((a, b) => a.size - b.size)
    .find((item) => item.size <= limit)

  if (anyUnderLimit) {
    return anyUnderLimit
  }

  const smallest = candidates.slice().sort((a, b) => a.size - b.size)[0]
  throw new Error(
    `Aucun GIF <= limite serveur (${formatSize(limit)}). Plus petit fichier: ${smallest.name} (${formatSize(smallest.size)}).`
  )
}

function getMainButtons(active = null, mode = 'main') {
  return new ActionRowBuilder().addComponents(
    MAIN_BUTTONS.map((btn) => (
      new ButtonBuilder()
        .setCustomId(`setup:${mode}:${btn.key}`)
        .setLabel(btn.label)
        .setStyle(active === btn.key ? ButtonStyle.Secondary : ButtonStyle.Primary)
    ))
  )
}

function buildMainSetupEmbed(client, guild = null) {
  const visibleCoinEmoji = resolveCoinEmoji(client.config)
  const drawCoinRange = resolveDrawBaseCoinRange(client.config)
  const drawCoinText = drawCoinRange.enabled
    ? `entre \`${FR.format(drawCoinRange.min)}\` et \`${FR.format(drawCoinRange.max)}\``
    : 'des'

  return new EmbedBuilder()
    .setColor('#2b2d31')
    .setAuthor({
      name: 'dvm #`🇵🇸`',
    })
    .setDescription([
      '`💜` **`Profil`**:',
      ' Vous pouvez consulter votre profil, c’est à dire votre nombre',
      '> d’heures de vocal ou votre nombre de tirage disponible...',
      '',
      '`☘️` **`Tirage`**:',
      '> Vous pouvez faire des tirages. Un tirage vous permet de gagner',
      '> des rôles, des nitros, des couleurs ou beaucoup d’autres',
      `> choses. Vous gagnez ${drawCoinText} ${emojiInBackticks(visibleCoinEmoji)} à chaque tirage.`,
      '',
      '`💎` **`Shop`**:',
      '> Vous permet d’acheter des rôles, des nitros ou autres avec vos',
      `> ${resolveCoinName(client.config)}.`,
      '',
      '`⭐` **`Inventaire`**:',
      '> Vous permet de consulter votre inventaire et modifier vos rôles',
      '',
      '`✧`  **`Succès`**:',
      '>  Vous permet de voir les succès que vous pouvez débloquer.',
      '',
    ].join('\n'))
    .setFooter({
      text: 'Rejoignez discord.gg/etQByzdvxr pour avoir du support !'
    })
}

function parseSetupMessageTarget(client, interaction) {
  if (!interaction.guildId) return false
  const setup = client.store.getSetupMessage(interaction.guildId)
  if (!setup) return false
  return String(setup.message_id) === String(interaction.message?.id || '')
}

function requireProfile(client, interaction) {
  if (client.store.hasProfile(interaction.user.id)) return true
  return false
}

function pickWeighted(items) {
  const enabled = items.filter((item) => safeFloat(item.weight, 0) > 0)
  if (!enabled.length) return null

  const total = enabled.reduce((sum, item) => sum + safeFloat(item.weight, 0), 0)
  if (total <= 0) return null

  let ticket = Math.random() * total
  for (const item of enabled) {
    ticket -= safeFloat(item.weight, 0)
    if (ticket <= 0) return item
  }
  return enabled.at(-1) || null
}

function toPct(weight) {
  const n = safeFloat(weight, 0)
  if (n >= 10) return `${n.toFixed(2)}%`
  if (n >= 1) return `${n.toFixed(2)}%`
  return `${n.toFixed(3)}%`
}

function parseRoleIdLike(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  const mention = raw.match(/^<@&(\d{17,20})>$/)
  if (mention?.[1]) return mention[1]
  const id = raw.match(/^(\d{17,20})$/)
  if (id?.[1]) return id[1]
  return null
}

function roleMentionById(roleId) {
  const safeId = parseRoleIdLike(roleId)
  return safeId ? `<@&${safeId}>` : null
}

function isRoleCategory(category) {
  return Boolean(SLOT_BY_CATEGORY[String(category || '').toLowerCase()])
}

function isRoleRewardItem(item) {
  if (!item) return false
  const rewardType = String(item.reward_type || '').toLowerCase()
  if (rewardType === 'role') return true
  return isRoleCategory(item.category)
}

function normalizeRoleName(value) {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
  return raw
}

function asRoleNameLike(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (parseRoleIdLike(raw)) return null
  if (/^\d+$/.test(raw)) return null
  return raw.replace(/^@+/, '').trim()
}

function roleNameCandidatesFromItem(item) {
  const candidates = new Map()
  const add = (value) => {
    const roleName = asRoleNameLike(value)
    if (!roleName) return
    const key = normalizeRoleName(roleName)
    if (!key) return
    candidates.set(key, roleName)
  }

  add(item?.name)

  const rewardType = String(item?.reward_type || '').toLowerCase()
  if (rewardType === 'role' || rewardType === 'cosmetic' || isRoleCategory(item?.category)) {
    add(item?.reward_value)
  }

  return [...candidates.values()]
}

function findGuildRoleByName(guild, roleName) {
  const safeName = normalizeRoleName(roleName)
  if (!safeName || !guild?.roles?.cache) return null
  return guild.roles.cache.find((role) => normalizeRoleName(role?.name) === safeName) || null
}

function findGuildRoleByCandidates(guild, candidates = []) {
  if (!Array.isArray(candidates) || !candidates.length) return null
  for (const candidate of candidates) {
    const found = findGuildRoleByName(guild, candidate)
    if (found?.id) return found
  }
  return null
}

function resolveItemRoleMention(guild, item, { fallbackToName = true } = {}) {
  const byId = roleMentionById(item?.role_id)
  if (byId) return byId

  if (String(item?.reward_type || '').toLowerCase() === 'role') {
    const fromRewardValue = roleMentionById(item?.reward_value)
    if (fromRewardValue) return fromRewardValue
  }

  if (isRoleRewardItem(item)) {
    const byName = findGuildRoleByCandidates(guild, roleNameCandidatesFromItem(item))
    if (byName?.id) return `<@&${byName.id}>`
  }

  if (!fallbackToName) return null
  const fallbackName = String(item?.name || '').trim()
  if (!fallbackName) return null
  return `@${fallbackName}`
}

function resolveDrawBaseCoinRange(config) {
  const enabled = config?.setup?.drawBaseCoinsEnabled == null
    ? true
    : Boolean(config.setup.drawBaseCoinsEnabled)
  const minRaw = safeInt(config?.setup?.drawBaseCoinsMin, 100)
  const maxRaw = safeInt(config?.setup?.drawBaseCoinsMax, 940)
  const min = Math.max(0, minRaw)
  const max = Math.max(min, maxRaw)
  return { enabled, min, max }
}

function rollDrawBaseCoins(config) {
  const range = resolveDrawBaseCoinRange(config)
  if (!range.enabled || range.max <= 0) return 0
  if (range.min === range.max) return range.min
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1))
}

function categoryLabel(category) {
  const key = String(category || '').toLowerCase()
  if (key === 'couleur') return '`☘️` - Couleurs'
  if (key === 'decoratif') return '`💎` - Décoratifs'
  if (key === 'badge') return '`⭐` - Badges'
  if (key === 'autre') return '`💜` - Autres'
  if (key === 'succes') return '`✧` - Succès'
  return key
}

function groupedByCategory(items = []) {
  const map = new Map()
  for (const item of items) {
    const key = String(item.category || 'autre').toLowerCase()
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return map
}

function summarizeReward(item, reward) {
  const coin = emojiInBackticks(reward.coinEmoji)
  const rewardType = String(item?.reward_type || '').toLowerCase()
  const itemCoins = Math.max(0, safeInt(reward?.itemCoins, reward?.coins))
  const itemXp = Math.max(0, safeInt(reward?.itemXp, reward?.xp))
  const itemDraws = Math.max(0, safeInt(reward?.itemDraws, reward?.draws))
  const baseCoins = Math.max(0, safeInt(reward?.baseCoins, 0))

  if (rewardType === 'coins') {
    const totalCoin = itemCoins + baseCoins
    return `${formatNumberBackticks(totalCoin)} ${coin}`
  }
  if (rewardType === 'xp') {
    const extraCoins = baseCoins > 0 ? ` + ${formatNumberBackticks(baseCoins)} ${coin}` : ''
    return `${formatNumberBackticks(itemXp)} ${emojiInBackticks(reward.xpEmoji)}${extraCoins}`
  }
  if (rewardType === 'draws') {
    const extraCoins = baseCoins > 0 ? ` + ${formatNumberBackticks(baseCoins)} ${coin}` : ''
    return `\`${FR.format(itemDraws)}\` tirage(s)${extraCoins}`
  }
  if (rewardType === 'none') {
    if (baseCoins > 0) return `${formatNumberBackticks(baseCoins)} ${coin}`
    return 'rien'
  }

  const roleMention = String(reward?.roleMention || '').trim()
  const roleState = reward?.roleAdded
    ? `rôle ${roleMention || `@${item.name}`}`
    : (reward?.roleExpected ? `objet ${roleMention || `@${item.name}`}` : item.name)

  const extras = []
  if (baseCoins > 0) extras.push(`${formatNumberBackticks(baseCoins)} ${coin}`)
  if (reward?.roleExpected && !reward?.roleAdded && reward?.roleResolved) extras.push('rôle non attribué')
  if (reward?.roleExpected && !reward?.roleResolved) extras.push('rôle introuvable')
  if (reward?.autoEquipped && reward?.equippedSlot) extras.push(`équipé (${reward.equippedSlot})`)

  return extras.length ? `${roleState} (${extras.join(' • ')})` : roleState
}

function buildDrawAnnouncementLine(client, item, reward) {
  const rewardType = String(item?.reward_type || '').toLowerCase()
  const chance = toPct(item?.weight)
  const coinName = resolveCoinName(client.config)
  const baseCoins = Math.max(0, safeInt(reward?.baseCoins, 0))
  const gainedRole = isRoleRewardItem(item) && !['coins', 'xp', 'draws', 'none'].includes(rewardType)

  if (rewardType === 'none') {
    if (baseCoins > 0) {
      return `Vous n’avez gagné aucun objet, mais vous recevez ${FR.format(baseCoins)} ${coinName}.`
    }
    return 'Vous n’avez rien gagné sur ce tirage.'
  }

  if (gainedRole) {
    const category = String(item?.category || '').toLowerCase()
    const roleKind = category === 'decoratif'
      ? 'le rôle décoratif'
      : category === 'couleur'
        ? 'le rôle couleur'
        : category === 'badge'
          ? 'le badge'
          : category === 'succes'
            ? 'le succès'
            : 'le rôle'

    const roleLabel = String(reward?.roleMention || '').trim() || `@${item.name}`
    const coinBonus = baseCoins > 0 ? ` (ainsi que ${FR.format(baseCoins)} ${coinName})` : ''

    if (reward?.roleAdded) {
      return `Vous avez gagné ${roleKind} ${roleLabel} - ${chance}${coinBonus} !`
    }
    if (reward?.roleResolved) {
      return `Vous avez gagné ${roleKind} ${roleLabel} - ${chance}${coinBonus} (attribution automatique impossible).`
    }
    return `Vous avez gagné ${roleKind} @${item.name} - ${chance}${coinBonus} (rôle introuvable).`
  }

  return `Vous avez obtenu **${item.name}** (${summarizeReward(item, reward)}) - ${chance}.`
}

function buildDrawGainLogDescription(client, interaction, item, reward) {
  const userMention = `<@${interaction.user.id}>`
  return `${userMention} • ${buildDrawAnnouncementLine(client, item, reward)}`
}

function buildDrawResultEmbed(client, interaction, {
  pulls,
  lines,
  totalCoins = 0,
  totalXp = 0,
  totalDraws = 0,
  roleAssignIssues = 0,
}) {
  const profile = client.store.getCasinoProfile(interaction.guildId, interaction.user.id)
  const remaining = Math.max(0, safeInt(profile?.draw_credits, 0))
  const summary = []

  if (totalCoins > 0) summary.push(`+${formatCoinsBackticksWithEmoji(client.config, totalCoins, { client, guild: interaction.guild })}`)
  if (totalXp > 0) summary.push(`+${formatXpBackticksWithEmoji(client.config, totalXp, { client, guild: interaction.guild })}`)
  if (totalDraws > 0) summary.push(`+\`${FR.format(totalDraws)}\` tirage(s)`)

  const body = []
  if (pulls === 1 && lines[0]) {
    body.push(lines[0])
  } else {
    body.push(`\`✅\` Tirage x${pulls} effectué.`)
    body.push(lines.slice(0, 12).map((line) => `• ${line}`).join('\n'))
  }

  if (summary.length) {
    body.push('')
    body.push(`Total: ${summary.join(' • ')}`)
  }

  body.push(`Tirages restants: **${FR.format(remaining)}**`)

  if (roleAssignIssues > 0) {
    body.push(`\`⚠️\` ${roleAssignIssues} rôle(s) gagné(s) non attribué(s) automatiquement (permissions/hierarchie).`)
  }

  return new EmbedBuilder()
    .setColor('#111111')
    .setDescription(body.filter(Boolean).join('\n').slice(0, 4000))
}

async function fetchRoleById(guild, roleId) {
  const safeId = parseRoleIdLike(roleId)
  if (!safeId || !guild?.roles) return null
  const cached = guild.roles.cache.get(safeId)
  if (cached) return cached
  if (!guild.roles.fetch) return null
  return guild.roles.fetch(safeId).catch(() => null)
}

async function fetchAllGuildRoles(guild) {
  if (!guild?.roles?.fetch) return
  await guild.roles.fetch().catch(() => null)
}

async function canManageGuildRoles(guild) {
  if (!guild?.members) return false
  const me = guild.members.me
    || (guild.members.fetchMe ? await guild.members.fetchMe().catch(() => null) : null)
  return Boolean(me?.permissions?.has?.('ManageRoles'))
}

function resolvePreferredRoleName(item) {
  const direct = asRoleNameLike(item?.name)
  if (direct) return direct.slice(0, 100)

  const candidates = roleNameCandidatesFromItem(item)
  if (!candidates.length) return null
  return String(candidates[0]).slice(0, 100)
}

async function createRoleForRewardItem(guild, item) {
  if (!guild?.roles?.create) return null
  const roleName = resolvePreferredRoleName(item)
  if (!roleName) return null

  const canManage = await canManageGuildRoles(guild)
  if (!canManage) return null

  return guild.roles.create({
    name: roleName,
    mentionable: false,
    reason: 'Auto-creation role setup reward',
  }).catch(() => null)
}

function persistResolvedRoleId(client, guildId, sourceType, itemId, roleId) {
  const safeRoleId = parseRoleIdLike(roleId)
  const safeItemId = safeInt(itemId, 0)
  if (!safeRoleId || safeItemId <= 0) return
  if (sourceType === 'draw') {
    client.store.updateCasinoDrawItem(guildId, safeItemId, { roleId: safeRoleId })
    return
  }
  if (sourceType === 'shop') {
    client.store.updateCasinoShopItem(guildId, safeItemId, { roleId: safeRoleId })
  }
}

async function resolveRewardRole({ client, interaction, item, sourceType, roleResolveCache = null }) {
  const guild = interaction.guild
  if (!guild) return null
  const cacheKey = `${sourceType}:${safeInt(item?.id, 0)}`
  if (roleResolveCache?.resolvedByItem?.has(cacheKey)) {
    return roleResolveCache.resolvedByItem.get(cacheKey)
  }

  const rewardType = String(item?.reward_type || '').toLowerCase()
  const explicitRoleId = parseRoleIdLike(item?.role_id)
    || (rewardType === 'role' ? parseRoleIdLike(item?.reward_value) : null)
  const resolvedById = await fetchRoleById(guild, explicitRoleId)
  if (resolvedById) {
    if (!parseRoleIdLike(item?.role_id)) {
      persistResolvedRoleId(client, interaction.guildId, sourceType, item?.id, resolvedById.id)
      item.role_id = resolvedById.id
    }
    if (roleResolveCache?.resolvedByItem) {
      roleResolveCache.resolvedByItem.set(cacheKey, resolvedById)
    }
    return resolvedById
  }

  if (!isRoleRewardItem(item)) {
    if (roleResolveCache?.resolvedByItem) {
      roleResolveCache.resolvedByItem.set(cacheKey, null)
    }
    return null
  }

  if (roleResolveCache) {
    if (!roleResolveCache.rolesFetched) {
      await fetchAllGuildRoles(guild)
      roleResolveCache.rolesFetched = true
    }
  } else {
    await fetchAllGuildRoles(guild)
  }

  const resolvedByName = findGuildRoleByCandidates(guild, roleNameCandidatesFromItem(item))
  if (resolvedByName?.id) {
    persistResolvedRoleId(client, interaction.guildId, sourceType, item?.id, resolvedByName.id)
    item.role_id = resolvedByName.id
    if (roleResolveCache?.resolvedByItem) {
      roleResolveCache.resolvedByItem.set(cacheKey, resolvedByName)
    }
    return resolvedByName
  }

  const createdRole = await createRoleForRewardItem(guild, item)
  if (!createdRole?.id) {
    if (roleResolveCache?.resolvedByItem) {
      roleResolveCache.resolvedByItem.set(cacheKey, null)
    }
    return null
  }

  persistResolvedRoleId(client, interaction.guildId, sourceType, item?.id, createdRole.id)
  item.role_id = createdRole.id
  if (roleResolveCache?.resolvedByItem) {
    roleResolveCache.resolvedByItem.set(cacheKey, createdRole)
  }
  return createdRole
}

async function applyReward({ client, interaction, member, item, sourceType, roleResolveCache = null }) {
  const guildId = interaction.guildId
  const userId = interaction.user.id
  const coinEmoji = resolveCoinEmoji(client.config)
  const xpEmoji = resolveXpEmoji(client.config)
  const reward = {
    coins: 0,
    xp: 0,
    draws: 0,
    itemCoins: 0,
    itemXp: 0,
    itemDraws: 0,
    baseCoins: 0,
    inventoryAdded: false,
    roleExpected: false,
    roleResolved: false,
    roleMention: null,
    roleId: null,
    roleAdded: false,
    roleAssignError: null,
    autoEquipped: false,
    equippedSlot: null,
    coinEmoji,
    xpEmoji,
  }

  const rewardType = String(item.reward_type || '').toLowerCase()
  const rewardValueRaw = String(item.reward_value ?? '').trim()
  const rewardValue = safeInt(rewardValueRaw, 0)

  if (rewardType === 'coins') {
    const value = Math.max(0, rewardValue)
    if (value > 0) {
      client.store.addBalance(guildId, userId, { coinsDelta: value }, {
        source: `${sourceType}:draw_reward`,
        reason: `Récompense ${sourceType} ${item.name}`,
        metadata: {
          rewardType,
          itemId: item.id,
          itemName: item.name,
        },
      })
      reward.coins = value
      reward.itemCoins = value
    }
    return reward
  }

  if (rewardType === 'xp') {
    const value = Math.max(0, rewardValue)
    if (value > 0) {
      client.store.addBalance(guildId, userId, { xpDelta: value }, {
        source: `${sourceType}:draw_reward`,
        reason: `Récompense ${sourceType} ${item.name}`,
        metadata: {
          rewardType,
          itemId: item.id,
          itemName: item.name,
        },
      })
      reward.xp = value
      reward.itemXp = value
    }
    return reward
  }

  if (rewardType === 'draws') {
    const value = Math.max(0, rewardValue)
    if (value > 0) {
      client.store.addCasinoDrawCredits(guildId, userId, value)
      reward.draws = value
      reward.itemDraws = value
    }
    return reward
  }

  if (rewardType === 'none') {
    return reward
  }

  // role / cosmetic fallback: add inventory
  client.store.addCasinoInventoryItem(guildId, userId, sourceType, item.id, 1)
  reward.inventoryAdded = true

  reward.roleExpected = isRoleRewardItem(item)
  const role = await resolveRewardRole({ client, interaction, item, sourceType, roleResolveCache })
  if (!role?.id) {
    reward.roleResolved = false
    reward.roleMention = resolveItemRoleMention(interaction.guild, item, { fallbackToName: true })
    return reward
  }

  reward.roleResolved = true
  reward.roleId = role.id
  reward.roleMention = `<@&${role.id}>`

  if (!member?.roles?.add) {
    reward.roleAssignError = 'member_unavailable'
    return reward
  }

  const slot = SLOT_BY_CATEGORY[String(item.category || '').toLowerCase()] || null
  if (!slot) {
    await member.roles.add(role.id).then(() => {
      reward.roleAdded = true
    }).catch(() => {
      reward.roleAssignError = 'add_failed'
    })
    return reward
  }

  const previous = client.store.getCasinoEquip(guildId, userId, slot)
  const setResult = client.store.setCasinoEquip(guildId, userId, slot, sourceType, item.id)
  if (!setResult.ok) {
    await member.roles.add(role.id).then(() => {
      reward.roleAdded = true
    }).catch(() => {
      reward.roleAssignError = 'add_failed'
    })
    return reward
  }

  reward.autoEquipped = true
  reward.equippedSlot = slot
  const sync = await syncRoleEquip(member, previous, setResult.equip)
  if (sync.errors.length) {
    reward.roleAssignError = sync.errors.join(',')
  }

  const hasRole = Boolean(member?.roles?.cache?.has?.(role.id))
  reward.roleAdded = sync.added || hasRole

  if (!reward.roleAdded && !reward.roleAssignError) {
    reward.roleAssignError = 'add_failed'
  }

  return reward
}

async function syncRoleEquip(member, previousEquip, nextEquip) {
  const result = {
    removed: false,
    added: false,
    errors: [],
  }

  if (!member?.roles?.add || !member?.roles?.remove) {
    result.errors.push('member_unavailable')
    return result
  }

  const oldRole = String(previousEquip?.role_id || '').trim()
  const newRole = String(nextEquip?.role_id || '').trim()

  if (oldRole && oldRole !== newRole) {
    await member.roles.remove(oldRole)
      .then(() => {
        result.removed = true
      })
      .catch(() => {
        result.errors.push('remove_failed')
      })
  }
  if (newRole && oldRole !== newRole) {
    await member.roles.add(newRole)
      .then(() => {
        result.added = true
      })
      .catch(() => {
        result.errors.push('add_failed')
      })
  }

  return result
}

function buildDrawEmbed(client, interaction, extraLine = null) {
  const drawItems = client.store.listCasinoDrawItems(interaction.guildId, { enabledOnly: true })
  const profile = client.store.getCasinoProfile(interaction.guildId, interaction.user.id)
  const grouped = groupedByCategory(drawItems)
  const thumbnail = resolveSetupThumbnail(client.config)

  const blocks = []
  for (const category of ['couleur', 'decoratif', 'badge', 'succes', 'autre']) {
    const items = grouped.get(category) || []
    if (!items.length) continue
    const rawLabel = categoryLabel(category)
    const [left, right] = rawLabel.split(' - ')
    const displayLabel = right ? `${left} - __${right}__` : rawLabel
    blocks.push(`**${displayLabel}**`)

    for (let i = 0; i < items.length; i += 2) {
      const itemA = items[i]
      const itemB = items[i + 1] || null
      const leftLabel = isRoleRewardItem(itemA)
        ? (resolveItemRoleMention(interaction.guild, itemA, { fallbackToName: true }) || `@${itemA.name}`)
        : `**${itemA.name}**`
      const rightLabel = itemB
        ? (isRoleRewardItem(itemB)
          ? (resolveItemRoleMention(interaction.guild, itemB, { fallbackToName: true }) || `@${itemB.name}`)
          : `**${itemB.name}**`)
        : null

      const leftPart = `· ${leftLabel} - ${toPct(itemA.weight)}`
      const rightPart = rightLabel ? ` // ${rightLabel} - ${toPct(itemB.weight)}` : ''
      blocks.push(`${leftPart}${rightPart}`)
    }
    blocks.push('')
  }

  blocks.push('Vous pouvez obtenir un rôle que vous avez déjà. Les pourcentages affichés sont les')
  blocks.push('pourcentages de chance d’obtenir le rôle, ils sont approximatifs. Il existe des rôles secrets que')
  blocks.push('vous pouvez obtenir.')
  blocks.push(`Tirages disponibles: **${FR.format(safeInt(profile?.draw_credits, 0))}**`)
  if (extraLine) blocks.push(extraLine)

  const embed = new EmbedBuilder()
    .setColor('#111111')
    .setTitle('Tirages')
    .setDescription(blocks.join('\n').slice(0, 4000))
  if (thumbnail) embed.setThumbnail(thumbnail)
  return embed
}

function buildDrawComponents(active = 'draw', { includeMain = true } = {}) {
  const rows = []
  if (includeMain) {
    rows.push(getMainButtons(active, 'view'))
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:draw:x1').setLabel('Tirage x1').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:draw:x5').setLabel('Tirage x5').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:draw:x10').setLabel('Tirage x10').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:draw:gift').setEmoji('🎁').setStyle(ButtonStyle.Primary)
    )
  )
  return rows
}

function buildShopEmbed(client, interaction, extraLine = null) {
  const items = client.store.listCasinoShopItems(interaction.guildId, { enabledOnly: true })
  const user = client.store.getUser(interaction.guildId, interaction.user.id)
  const coinName = resolveCoinName(client.config)
  const thumbnail = resolveSetupThumbnail(client.config)

  const lines = ['`💎` - **Boutique du Casino**']
  for (const item of items) {
    const emoji = item.emoji ? `${emojiInBackticks(item.emoji)} - ` : '• '
    lines.push(`${emoji}${item.name} ➠ ${formatCoinsBackticksWithEmoji(client.config, safeInt(item.price, 0), { client, guild: interaction.guild })}`)
  }
  lines.push('')
  lines.push(
    `${resolveStatusKeyword(client.config)} en statut vous permet de gagner plus de ${coinName}. Vous disposez de ${formatCoinsBackticksWithEmoji(client.config, safeInt(user?.coins, 0), { client, guild: interaction.guild })}.`
  )
  if (extraLine) {
    lines.push('')
    lines.push(extraLine)
  }

  const embed = new EmbedBuilder()
    .setColor('#111111')
    .setDescription(lines.join('\n').slice(0, 4000))
  if (thumbnail) embed.setThumbnail(thumbnail)
  return embed
}

function buildShopComponents(client, interaction, active = 'shop', { includeMain = true } = {}) {
  const items = client.store.listCasinoShopItems(interaction.guildId, { enabledOnly: true }).slice(0, 25)
  const options = items.map((item) => new StringSelectMenuOptionBuilder()
    .setLabel(String(item.name).slice(0, 100))
    .setValue(`buy:${item.id}`)
    .setDescription(`${FR.format(safeInt(item.price, 0))} ${resolveCoinName(client.config)}`.slice(0, 100)))

  const rows = []
  if (includeMain) {
    rows.push(getMainButtons(active, 'view'))
  }
  if (options.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('setup:shop:buy')
          .setPlaceholder('Choisissez un rôle/autre à acheter')
          .addOptions(options)
      )
    )
  }
  return rows
}

function ownedCategorySummary(items, category, guild = null) {
  const list = items.filter((item) => String(item.item_category || '').toLowerCase() === category)
  if (!list.length) return 'Aucun rôle'
  return list.map((item) => {
    const roleMention = resolveItemRoleMention(guild, {
      name: item.item_name,
      role_id: item.role_id,
      reward_type: 'role',
      reward_value: item.role_id,
      category: item.item_category,
    }, { fallbackToName: true })
    return `${item.emoji ? `${emojiInBackticks(item.emoji)} ` : ''}${roleMention || `@${item.item_name}`}`
  }).slice(0, 3).join(' / ')
}

function buildInventoryEmbed(client, interaction, extraLine = null) {
  const items = client.store.listCasinoInventory(interaction.guildId, interaction.user.id)
  const equips = client.store.listCasinoEquips(interaction.guildId, interaction.user.id)
  const equippedBySlot = new Map(equips.map((equip) => [equip.slot, equip]))
  const rightRaw = equippedBySlot.get('decoratif') || null
  const rightRole = rightRaw
    ? (resolveItemRoleMention(interaction.guild, {
      name: rightRaw.item_name,
      role_id: rightRaw.role_id,
      reward_type: 'role',
      reward_value: rightRaw.role_id,
      category: rightRaw.item_category,
    }, { fallbackToName: true }) || rightRaw.item_name)
    : 'Aucun rôle'
  const successRaw = equippedBySlot.get('succes') || null
  const successEquip = successRaw
    ? (resolveItemRoleMention(interaction.guild, {
      name: successRaw.item_name,
      role_id: successRaw.role_id,
      reward_type: 'role',
      reward_value: successRaw.role_id,
      category: successRaw.item_category,
    }, { fallbackToName: true }) || successRaw.item_name)
    : 'Base'

  const lines = [
    'Votre inventaire :',
    '',
    `Votre rôle à droite est actuellement : ${rightRole}`,
    '',
    `**Rôles couleur :** ${ownedCategorySummary(items, 'couleur', interaction.guild)}`,
    `**Rôles badge :** ${ownedCategorySummary(items, 'badge', interaction.guild)}`,
    `**Rôles décoratifs :** ${ownedCategorySummary(items, 'decoratif', interaction.guild)}`,
    '',
    '**Succès :**',
    successEquip,
    '',
    'Cliquez sur les boutons ci-dessous pour modifier vos rôles équipés.',
  ]
  if (extraLine) {
    lines.push('')
    lines.push(extraLine)
  }

  return new EmbedBuilder()
    .setColor('#111111')
    .setAuthor({
      name: interaction.user.username,
      iconURL: interaction.user.displayAvatarURL({ size: 256 }),
    })
    .setDescription(lines.join('\n').slice(0, 4000))
}

function buildInventoryComponents(active = 'inventory', { includeMain = true } = {}) {
  const rows = []
  if (includeMain) {
    rows.push(getMainButtons(active, 'view'))
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('setup:inv:slot:couleur').setLabel('Modifier sa couleur').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:inv:slot:badge').setLabel('Modifier son badge').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:inv:slot:decoratif').setLabel('Modifier son rôle décoratif').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('setup:inv:slot:succes').setLabel('Modifier son succès').setStyle(ButtonStyle.Primary)
    )
  )
  return rows
}

function buildInventorySelect(client, interaction, slot) {
  const items = client.store.listCasinoInventory(interaction.guildId, interaction.user.id)
  const filtered = items.filter((item) => String(item.item_category || '').toLowerCase() === slot)

  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('Aucun')
      .setValue('none')
      .setDescription('Retirer cet équipement'),
  ]

  for (const item of filtered.slice(0, 24)) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(String(item.item_name || 'Item').slice(0, 100))
        .setValue(`${item.source_type}:${item.source_id}`)
        .setDescription(`Qté ${FR.format(safeInt(item.quantity, 0))}`.slice(0, 100))
    )
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`setup:inv:equip:${slot}`)
      .setPlaceholder(`Choisissez un élément à équiper (${slot})`)
      .addOptions(options)
  )
}

async function openView(client, interaction, section, mode = 'reply') {
  if (!interaction.guildId) return

  if (!requireProfile(client, interaction)) {
    if (section === 'profile') {
      client.store.createProfile(interaction.user.id)
      client.store.ensureUser(interaction.guildId, interaction.user.id)
      client.store.ensureCasinoProfile(interaction.guildId, interaction.user.id)
    } else {
      const payload = {
        embeds: [
          new EmbedBuilder()
            .setColor('#e74c3c')
            .setDescription('`❌` Crée d’abord ton profil via le bouton **Profil**.'),
        ],
        flags: MessageFlags.Ephemeral,
      }
      if (mode === 'reply') {
        await interaction.reply(payload).catch(() => null)
      } else {
        await interaction.update({ embeds: payload.embeds, components: [] }).catch(() => null)
      }
      return
    }
  }

  const includeMain = mode === 'update'
  let embeds = []
  let files = []
  let components = includeMain ? [getMainButtons(section, 'view')] : []
  let cleanup = null

  if (section === 'profile') {
    const payload = await buildProfileCardPayload(client, interaction.guild, interaction.user, { ephemeral: mode === 'reply' })
    embeds = payload.embeds || []
    files = payload.files || []
    components = payload.components || []
    cleanup = payload.cleanup || null
  } else if (section === 'draw') {
    embeds = [buildDrawEmbed(client, interaction)]
    components = buildDrawComponents('draw', { includeMain })
  } else if (section === 'shop') {
    embeds = [buildShopEmbed(client, interaction)]
    components = buildShopComponents(client, interaction, 'shop', { includeMain })
  } else if (section === 'inventory') {
    embeds = [buildInventoryEmbed(client, interaction)]
    components = buildInventoryComponents('inventory', { includeMain })
  } else if (section === 'success') {
    const payload = await buildSuccessPagePayload(client, interaction.guild, interaction.user.id, 0, { ephemeral: mode === 'reply' })
    embeds = payload.embeds || []
    files = payload.files || []
    components = payload.components || []
  }

  try {
    if (mode === 'reply') {
      await interaction.reply({ embeds, files, components, flags: MessageFlags.Ephemeral }).catch(() => null)
      return
    }

    await interaction.update({ embeds, files, components }).catch(() => null)
  } finally {
    if (typeof cleanup === 'function') {
      await cleanup().catch(() => null)
    }
  }
}

async function handleDrawRoll(client, interaction, multiplier) {
  const pulls = Math.max(1, Math.min(10, safeInt(multiplier, 1)))
  const drawItems = client.store.listCasinoDrawItems(interaction.guildId, { enabledOnly: true })
  if (!drawItems.length) {
    await interaction.deferUpdate().catch(() => null)

    writeLogAsync(client, {
      guild: interaction.guild,
      logType: 'draws',
      severity: 'error',
      actorId: interaction.user.id,
      targetUserId: interaction.user.id,
      commandName: 'setup_draw',
      description: 'Tirage refusé: aucun item tirage configuré.',
      data: { pulls },
      thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    })

    await interaction.editReply({
      embeds: [buildDrawEmbed(client, interaction, '`❌` Aucun tirage configuré pour ce serveur.')],
      components: buildDrawComponents('draw', { includeMain: false }),
    }).catch(() => null)

    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor('#e74c3c')
          .setDescription('`❌` Aucun item de tirage actif n’est configuré sur ce serveur.'),
      ],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null)
    return
  }

  const hasAtLeastOneWeightedItem = drawItems.some((item) => safeFloat(item.weight, 0) > 0)
  if (!hasAtLeastOneWeightedItem) {
    await interaction.deferUpdate().catch(() => null)

    writeLogAsync(client, {
      guild: interaction.guild,
      logType: 'draws',
      severity: 'error',
      actorId: interaction.user.id,
      targetUserId: interaction.user.id,
      commandName: 'setup_draw',
      description: 'Tirage refusé: aucun item avec un poids > 0.',
      data: { pulls },
      thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    })

    await interaction.editReply({
      embeds: [buildDrawEmbed(client, interaction, '`❌` Configuration invalide: aucun item avec poids > 0.')],
      components: buildDrawComponents('draw', { includeMain: false }),
    }).catch(() => null)

    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor('#e74c3c')
          .setDescription('`❌` Les tirages sont mal configurés: aucun item n’a un poids valide (> 0).'),
      ],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null)
    return
  }

  const consume = client.store.consumeCasinoDrawCredits(interaction.guildId, interaction.user.id, pulls)
  if (!consume.ok) {
    await interaction.deferUpdate().catch(() => null)

    writeLogAsync(client, {
      guild: interaction.guild,
      logType: 'draws',
      severity: 'warning',
      actorId: interaction.user.id,
      targetUserId: interaction.user.id,
      commandName: 'setup_draw',
      description: `Tirage refusé: crédits insuffisants (x${pulls}).`,
      data: { pulls, reason: consume.reason || 'insufficient_credits' },
      thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    })

    await interaction.editReply({
      embeds: [buildDrawEmbed(client, interaction, '`❌` Pas assez de tirages disponibles.')],
      components: buildDrawComponents('draw', { includeMain: false }),
    }).catch(() => null)

    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor('#e74c3c')
          .setDescription(`\`❌\` Tirage impossible: il faut **${FR.format(pulls)}** crédit(s) tirage.`),
      ],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null)
    return
  }

  await interaction.deferUpdate().catch(() => null)

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
  const roleResolveCache = { rolesFetched: false, resolvedByItem: new Map() }
  const lines = []
  const drawAuditRows = []
  let totalCoins = 0
  let totalXp = 0
  let totalDraws = 0
  let roleAssignIssues = 0

  for (let i = 0; i < pulls; i += 1) {
    const item = pickWeighted(drawItems)
    if (!item) continue

    const reward = await applyReward({
      client,
      interaction,
      member,
      item,
      sourceType: 'draw',
      roleResolveCache,
    })
    const baseCoins = rollDrawBaseCoins(client.config)

    if (baseCoins > 0) {
      client.store.addBalance(interaction.guildId, interaction.user.id, { coinsDelta: baseCoins }, {
        source: 'setup:draw_base',
        reason: `Bonus tirage x${pulls}`,
        metadata: {
          pullNumber: i + 1,
          pulls,
          drawItemId: item.id,
          drawItemName: item.name,
          baseCoins,
        },
      })
      reward.baseCoins = baseCoins
      reward.coins += baseCoins
    }

    totalCoins += reward.coins
    totalXp += reward.xp
    totalDraws += reward.draws
    if (reward.roleExpected && !reward.roleAdded) roleAssignIssues += 1
    const line = buildDrawAnnouncementLine(client, item, reward)
    lines.push(line)

    const gainDescription = buildDrawGainLogDescription(client, interaction, item, reward)
    drawAuditRows.push({
      pullNumber: i + 1,
      drawItemId: item.id,
      drawItemName: item.name,
      rewardType: item.reward_type,
      rewardValue: item.reward_value,
      reward,
      description: gainDescription,
    })
  }

  if (!lines.length) {
    client.store.addCasinoDrawCredits(interaction.guildId, interaction.user.id, pulls)

    writeLogAsync(client, {
      guild: interaction.guild,
      logType: 'draws',
      severity: 'error',
      actorId: interaction.user.id,
      targetUserId: interaction.user.id,
      commandName: 'setup_draw',
      description: 'Tirage invalide: aucune récompense tirée, crédits remboursés.',
      data: { pulls, refunded: pulls },
      thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    })

    await interaction.editReply({
      embeds: [buildDrawEmbed(client, interaction, '`❌` Erreur interne de tirage, crédits remboursés.')],
      components: buildDrawComponents('draw', { includeMain: false }),
    }).catch(() => null)

    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor('#e74c3c')
          .setDescription('`❌` Aucune récompense valide n’a pu être tirée. Tes crédits ont été remboursés.'),
      ],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null)
    return
  }

  if (totalCoins >= 250000 || totalXp >= 5000) {
    writeLogAsync(client, {
      guild: interaction.guild,
      logType: 'anticheat',
      severity: 'warning',
      actorId: interaction.user.id,
      targetUserId: interaction.user.id,
      commandName: 'setup_draw',
      description: 'Volume de récompense tirage élevé détecté.',
      data: {
        pulls,
        totalCoins,
        totalXp,
        totalDraws,
      },
      thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    })
  }

  const summaryLines = lines.slice(0, 10).map((entry) => `• ${entry}`).join('\n')
  const summaryDescription = pulls > 1
    ? [`Tirage x${pulls} par <@${interaction.user.id}>`, summaryLines].filter(Boolean).join('\n')
    : `Tirage par <@${interaction.user.id}> • ${lines[0] || 'résultat inconnu'}`

  postGainLogAsync(client, interaction.guild, {
    authorName: interaction.user.tag,
    authorIcon: interaction.user.displayAvatarURL({ size: 128 }),
    thumbnailURL: interaction.user.displayAvatarURL({ size: 256 }),
    description: summaryDescription.slice(0, 3900),
  })

  writeLogAsync(client, {
    guild: interaction.guild,
    logType: 'draws',
    severity: 'success',
    actorId: interaction.user.id,
    targetUserId: interaction.user.id,
    commandName: 'setup_draw',
    description: summaryDescription.slice(0, 3900),
    data: {
      pulls,
      totalCoins,
      totalXp,
      totalDraws,
      roleAssignIssues,
      results: drawAuditRows.slice(0, 30),
    },
    thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
  })

  await interaction.editReply({
    embeds: [buildDrawEmbed(client, interaction, `\`✅\` Tirage x${pulls} effectué. Résultat envoyé ci-dessous.`)],
    components: buildDrawComponents('draw', { includeMain: false }),
  }).catch(() => null)

  const resultEmbed = buildDrawResultEmbed(client, interaction, {
    pulls,
    lines,
    totalCoins,
    totalXp,
    totalDraws,
    roleAssignIssues,
  })

  await interaction.followUp({
    embeds: [resultEmbed],
    flags: MessageFlags.Ephemeral,
  }).catch(() => null)
}

async function handleShopBuy(client, interaction) {
  const selected = interaction.values?.[0] || ''
  if (!selected.startsWith('buy:')) {
    await interaction.update({
      embeds: [buildShopEmbed(client, interaction, '`❌` Choix invalide.')],
      components: buildShopComponents(client, interaction, 'shop', { includeMain: false }),
    }).catch(() => null)
    return
  }

  const itemId = safeInt(selected.split(':')[1], 0)
  const item = client.store.getCasinoShopItem(interaction.guildId, itemId)
  if (!item || safeInt(item.enabled, 0) !== 1) {
    await interaction.update({
      embeds: [buildShopEmbed(client, interaction, '`❌` Objet introuvable ou désactivé.')],
      components: buildShopComponents(client, interaction, 'shop', { includeMain: false }),
    }).catch(() => null)
    return
  }

  const user = client.store.getUser(interaction.guildId, interaction.user.id)
  const price = safeInt(item.price, 0)
  if (safeInt(user?.coins, 0) < price) {
    await writeLog(client, {
      guild: interaction.guild,
      logType: 'setup',
      severity: 'warning',
      actorId: interaction.user.id,
      targetUserId: interaction.user.id,
      commandName: 'setup_shop_buy',
      description: `Achat refusé (solde insuffisant): ${item.name}`,
      data: { itemId: item.id, price },
      thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    }).catch(() => null)

    await interaction.update({
      embeds: [buildShopEmbed(client, interaction, `\`❌\` Solde insuffisant. Prix: ${formatCoinsBackticksWithEmoji(client.config, price, { client, guild: interaction.guild })}`)],
      components: buildShopComponents(client, interaction, 'shop', { includeMain: false }),
    }).catch(() => null)
    return
  }

  client.store.addBalance(interaction.guildId, interaction.user.id, { coinsDelta: -price }, {
    source: 'setup:shop_buy',
    reason: `Achat shop: ${item.name}`,
    metadata: {
      shopItemId: item.id,
      shopItemName: item.name,
      price,
    },
  })
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
  const reward = await applyReward({ client, interaction, member, item, sourceType: 'shop' })

  const rewardText = summarizeReward(item, reward)
  await writeLog(client, {
    guild: interaction.guild,
    logType: 'setup',
    severity: 'success',
    actorId: interaction.user.id,
    targetUserId: interaction.user.id,
    commandName: 'setup_shop_buy',
    description: `Achat setup: ${item.name} (${rewardText})`,
    data: {
      itemId: item.id,
      itemName: item.name,
      reward,
      price,
    },
    thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
  }).catch(() => null)

  await interaction.update({
    embeds: [buildShopEmbed(client, interaction, `\`✅\` Achat réussi: **${item.name}** (${rewardText})`)],
    components: buildShopComponents(client, interaction, 'shop', { includeMain: false }),
  }).catch(() => null)
}

async function handleInventorySlotPicker(client, interaction, slot) {
  await interaction.update({
    embeds: [buildInventoryEmbed(client, interaction, `Sélectionnez un équipement pour le slot **${slot}**.`)],
    components: [
      ...buildInventoryComponents('inventory', { includeMain: false }),
      buildInventorySelect(client, interaction, slot),
    ],
  }).catch(() => null)
}

async function handleInventoryEquip(client, interaction, slot) {
  const selected = interaction.values?.[0] || 'none'
  if (selected === 'none') {
    const previous = client.store.getCasinoEquip(interaction.guildId, interaction.user.id, slot)
    client.store.clearCasinoEquip(interaction.guildId, interaction.user.id, slot)
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
    await syncRoleEquip(member, previous, null)

    await writeLog(client, {
      guild: interaction.guild,
      logType: 'setup',
      severity: 'info',
      actorId: interaction.user.id,
      targetUserId: interaction.user.id,
      commandName: 'setup_inventory',
      description: `Déséquipement slot ${slot}.`,
      data: { slot },
      thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
    }).catch(() => null)

    await interaction.update({
      embeds: [buildInventoryEmbed(client, interaction, `\`✅\` Slot **${slot}** vidé.`)],
      components: buildInventoryComponents('inventory', { includeMain: false }),
    }).catch(() => null)
    return
  }

  const [sourceType, sourceIdRaw] = selected.split(':')
  const sourceId = safeInt(sourceIdRaw, 0)
  if (!['shop', 'draw'].includes(sourceType) || sourceId <= 0) {
    await interaction.update({
      embeds: [buildInventoryEmbed(client, interaction, '`❌` Sélection invalide.')],
      components: buildInventoryComponents('inventory', { includeMain: false }),
    }).catch(() => null)
    return
  }

  const details = client.store.getCasinoInventoryItemDetails(interaction.guildId, interaction.user.id, sourceType, sourceId)
  if (!details) {
    await interaction.update({
      embeds: [buildInventoryEmbed(client, interaction, '`❌` Objet non possédé.')],
      components: buildInventoryComponents('inventory', { includeMain: false }),
    }).catch(() => null)
    return
  }

  const itemCategory = String(details.item_category || '').toLowerCase()
  if (itemCategory !== slot) {
    await interaction.update({
      embeds: [buildInventoryEmbed(client, interaction, `\`❌\` Cet objet n’est pas compatible avec le slot **${slot}**.`)],
      components: buildInventoryComponents('inventory', { includeMain: false }),
    }).catch(() => null)
    return
  }

  const previous = client.store.getCasinoEquip(interaction.guildId, interaction.user.id, slot)
  const setResult = client.store.setCasinoEquip(interaction.guildId, interaction.user.id, slot, sourceType, sourceId)
  if (!setResult.ok) {
    await interaction.update({
      embeds: [buildInventoryEmbed(client, interaction, '`❌` Impossible d’équiper cet objet.')],
      components: buildInventoryComponents('inventory', { includeMain: false }),
    }).catch(() => null)
    return
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
  await syncRoleEquip(member, previous, setResult.equip)

  await writeLog(client, {
    guild: interaction.guild,
    logType: 'setup',
    severity: 'info',
    actorId: interaction.user.id,
    targetUserId: interaction.user.id,
    commandName: 'setup_inventory',
    description: `Equipement slot ${slot}: ${setResult.equip?.item_name || 'inconnu'}.`,
    data: {
      slot,
      sourceType,
      sourceId,
      itemName: setResult.equip?.item_name || null,
    },
    thumbnail: interaction.user.displayAvatarURL({ size: 256 }),
  }).catch(() => null)

  await interaction.update({
    embeds: [buildInventoryEmbed(client, interaction, `\`✅\` Équipé: **${setResult.equip?.item_name || 'Inconnu'}**.`)],
    components: buildInventoryComponents('inventory', { includeMain: false }),
  }).catch(() => null)
}

export async function sendSetupPanelMessage({ client, guild, channel, authorId }) {
  client.store.seedCasinoSetupDefaults(guild.id, authorId)

  const gifFile = resolveSetupGifPath(client, guild)

  const base = buildMainSetupEmbed(client, guild).setImage('attachment://backgroundcasino.gif')
  const panel = await channel.send({
    embeds: [base],
    files: [new AttachmentBuilder(gifFile.fullPath, { name: 'backgroundcasino.gif' })],
    components: [getMainButtons(null, 'main')],
  })

  client.store.setSetupMessage(guild.id, panel.channelId, panel.id)
  return panel
}

export async function handleSetupPanelInteraction(client, interaction) {
  if (!interaction.guildId) return false

  if (interaction.isButton() && interaction.customId === 'profile:create') {
    client.store.createProfile(interaction.user.id)
    client.store.ensureUser(interaction.guildId, interaction.user.id)
    client.store.ensureCasinoProfile(interaction.guildId, interaction.user.id)
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setDescription('`✅` Profil créé avec succès.'),
      ],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null)
    return true
  }

  if (interaction.isButton() && interaction.customId.startsWith('setup:main:')) {
    if (!parseSetupMessageTarget(client, interaction)) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#e74c3c')
            .setDescription('`❌` Ce panneau setup est obsolète. Relancez `+setup`.'),
        ],
        flags: MessageFlags.Ephemeral,
      }).catch(() => null)
      return true
    }
    const section = interaction.customId.split(':')[2]
    await openView(client, interaction, section, 'reply')
    return true
  }

  if (interaction.isButton() && interaction.customId.startsWith('setup:view:')) {
    const section = interaction.customId.split(':')[2]
    await openView(client, interaction, section, 'update')
    return true
  }

  if (interaction.isButton() && interaction.customId.startsWith('setup:draw:')) {
    if (!requireProfile(client, interaction)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setDescription('`❌` Crée d’abord ton profil.')],
        flags: MessageFlags.Ephemeral,
      }).catch(() => null)
      return true
    }

    const action = interaction.customId.split(':')[2]
    if (action === 'gift') {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#111111')
            .setDescription('`🎁` Utilise la commande `+gift` pour ouvrir un cadeau.'),
        ],
        flags: MessageFlags.Ephemeral,
      }).catch(() => null)
      return true
    }

    const pullCount = action === 'x10' ? 10 : action === 'x5' ? 5 : 1
    await handleDrawRoll(client, interaction, pullCount)
    return true
  }

  if (interaction.isButton() && interaction.customId.startsWith('setup:success:nav:')) {
    if (!requireProfile(client, interaction)) {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setDescription('`❌` Crée d’abord ton profil.')],
        components: [],
      }).catch(() => null)
      return true
    }

    const page = safeInt(interaction.customId.split(':')[3], 0)
    const payload = await buildSuccessPagePayload(client, interaction.guild, interaction.user.id, page, { ephemeral: false })
    await interaction.update({
      embeds: payload.embeds || [],
      files: payload.files || [],
      components: payload.components || [],
    }).catch(() => null)
    return true
  }

  if (interaction.isButton() && interaction.customId.startsWith('setup:inv:slot:')) {
    const slot = interaction.customId.split(':')[3]
    if (!SLOT_BY_CATEGORY[slot]) return true
    if (!requireProfile(client, interaction)) {
      await interaction.update({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setDescription('`❌` Crée d’abord ton profil.')],
        components: [],
      }).catch(() => null)
      return true
    }
    await handleInventorySlotPicker(client, interaction, slot)
    return true
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'setup:shop:buy') {
    if (!requireProfile(client, interaction)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setDescription('`❌` Crée d’abord ton profil.')],
        flags: MessageFlags.Ephemeral,
      }).catch(() => null)
      return true
    }
    await handleShopBuy(client, interaction)
    return true
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('setup:inv:equip:')) {
    const slot = interaction.customId.split(':')[3]
    if (!SLOT_BY_CATEGORY[slot]) return true
    if (!requireProfile(client, interaction)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#e74c3c').setDescription('`❌` Crée d’abord ton profil.')],
        flags: MessageFlags.Ephemeral,
      }).catch(() => null)
      return true
    }
    await handleInventoryEquip(client, interaction, slot)
    return true
  }

  return false
}

export function formatShopItemAdminLine(item, config) {
  const roleId = parseRoleIdLike(item?.role_id)
  const role = roleId ? `<@&${roleId}>` : '-'
  return `#${item.id} • ${item.enabled ? 'ON' : 'OFF'} • ${item.category} • ${item.name} • ${formatCoinsBackticksWithEmoji(config, safeInt(item.price, 0))} • role:${role} • ${item.reward_type}:${item.reward_value || ''}`
}

export function formatDrawItemAdminLine(item) {
  const roleId = parseRoleIdLike(item?.role_id)
  const role = roleId ? `<@&${roleId}>` : '-'
  return `#${item.id} • ${item.enabled ? 'ON' : 'OFF'} • ${item.category} • ${item.name} • ${toPct(item.weight)} • role:${role} • ${item.reward_type}:${item.reward_value || ''}`
}
