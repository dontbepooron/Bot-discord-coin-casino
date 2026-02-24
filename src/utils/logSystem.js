import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js'

const LOG_TYPES = Object.freeze([
  { key: 'commands', label: 'Commandes', channelName: 'logs-commandes', description: 'Exécution et refus des commandes.' },
  { key: 'economy', label: 'Economie', channelName: 'logs-economie', description: 'Transactions coins/xp et remboursements.' },
  { key: 'gains', label: 'Gains', channelName: 'logs-gains', description: 'Gains status/vocal/texte.' },
  { key: 'draws', label: 'Tirages', channelName: 'logs-tirages', description: 'Résultats de tirages setup.' },
  { key: 'moderation', label: 'Moderation', channelName: 'logs-moderation', description: 'BL, warns, sanctions et actions staff.' },
  { key: 'security', label: 'Securite', channelName: 'logs-securite', description: 'Accès refusés, checks et actions sensibles.' },
  { key: 'anticheat', label: 'AntiCheat', channelName: 'logs-anticheat', description: 'Détections d’activité suspecte.' },
  { key: 'setup', label: 'Setup', channelName: 'logs-setup', description: 'Setup panel, shop/inventaire/equips.' },
  { key: 'giveaway', label: 'Giveaway', channelName: 'logs-giveaway', description: 'Giveaways, participations et paiements.' },
  { key: 'errors', label: 'Erreurs', channelName: 'logs-erreurs', description: 'Erreurs runtime et exceptions.' },
])

const LOG_TYPE_SET = new Set(LOG_TYPES.map((item) => item.key))

const SEVERITY_COLORS = Object.freeze({
  info: '#3498db',
  success: '#2ecc71',
  warning: '#f39c12',
  error: '#e74c3c',
  critical: '#8e1e1e',
})

function normalizeLogType(input) {
  const safe = String(input || '').trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '')
  if (!safe) return null
  return safe
}

function resolveServerName(config) {
  const value = String(config?.servername || '').trim()
  return value || 'casino'
}

function safeNumber(input, fallback = 0) {
  const n = Number.parseInt(input, 10)
  return Number.isFinite(n) ? n : fallback
}

function ensureCache(client) {
  if (!client.logChannelCache) {
    client.logChannelCache = new Map()
  }
}

export function listLogTypes() {
  return LOG_TYPES.slice()
}

export function isValidLogType(input) {
  const safe = normalizeLogType(input)
  return Boolean(safe && LOG_TYPE_SET.has(safe))
}

export function getLogTypeMeta(input) {
  const safe = normalizeLogType(input)
  if (!safe) return null
  return LOG_TYPES.find((item) => item.key === safe) || null
}

export function getLogChannelMap(client, guildId, { force = false } = {}) {
  ensureCache(client)
  const key = String(guildId)
  const cached = client.logChannelCache.get(key)
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.map
  }

  const rows = client.store.listLogChannels(guildId)
  const map = new Map()
  for (const row of rows) {
    const safe = normalizeLogType(row.log_type)
    if (!safe) continue
    map.set(safe, String(row.channel_id))
  }
  client.logChannelCache.set(key, {
    map,
    expiresAt: Date.now() + 30_000,
  })
  return map
}

export function setLogChannel(client, guildId, logType, channelId, updatedBy = 'system') {
  const safeType = normalizeLogType(logType)
  if (!safeType || !LOG_TYPE_SET.has(safeType)) return { ok: false, reason: 'invalid_type' }
  const result = client.store.setLogChannel(guildId, safeType, channelId, updatedBy)
  ensureCache(client)
  client.logChannelCache.delete(String(guildId))
  return result
}

export function clearLogChannel(client, guildId, logType) {
  const safeType = normalizeLogType(logType)
  if (!safeType || !LOG_TYPE_SET.has(safeType)) return false
  const result = client.store.clearLogChannel(guildId, safeType)
  ensureCache(client)
  client.logChannelCache.delete(String(guildId))
  return result
}

async function resolveTextChannel(guild, channelId) {
  if (!guild?.id || !channelId) return null
  const cached = guild.channels.cache.get(channelId)
  if (cached?.isTextBased?.()) return cached
  const fetched = await guild.channels.fetch(channelId).catch(() => null)
  if (fetched?.isTextBased?.()) return fetched
  return null
}

export async function writeLog(client, {
  guild,
  logType,
  severity = 'info',
  actorId = null,
  targetUserId = null,
  commandName = null,
  description = '',
  data = null,
  title = null,
  fields = [],
  thumbnail = null,
}) {
  if (!guild?.id) return { ok: false, reason: 'invalid_guild' }
  const safeType = normalizeLogType(logType)
  if (!safeType || !LOG_TYPE_SET.has(safeType)) return { ok: false, reason: 'invalid_type' }

  const event = client.store.addAuditEvent({
    guildId: guild.id,
    logType: safeType,
    severity,
    actorId,
    targetUserId,
    commandName,
    description,
    data,
  })

  const eventId = safeNumber(event?.id, 0)
  const channels = getLogChannelMap(client, guild.id)
  const channelId = channels.get(safeType) || null
  if (!channelId) return { ok: true, eventId, sent: false }

  const channel = await resolveTextChannel(guild, channelId)
  if (!channel) return { ok: true, eventId, sent: false }

  const severityKey = String(severity || 'info').toLowerCase()
  const color = SEVERITY_COLORS[severityKey] || SEVERITY_COLORS.info
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(String(title || getLogTypeMeta(safeType)?.label || 'Log').slice(0, 256))
    .setDescription(String(description || '').slice(0, 4096))
    .setFooter({ text: eventId > 0 ? `event #${eventId}` : 'event' })
    .setTimestamp(new Date())

  if (thumbnail) {
    embed.setThumbnail(thumbnail)
  }

  const builtFields = []
  if (actorId) builtFields.push({ name: 'Acteur', value: `<@${actorId}>`, inline: true })
  if (targetUserId) builtFields.push({ name: 'Cible', value: `<@${targetUserId}>`, inline: true })
  if (commandName) builtFields.push({ name: 'Commande', value: `\`${commandName}\``, inline: true })

  if (Array.isArray(fields) && fields.length) {
    for (const field of fields.slice(0, 22)) {
      builtFields.push({
        name: String(field.name || 'Info').slice(0, 256),
        value: String(field.value || '-').slice(0, 1024),
        inline: Boolean(field.inline),
      })
    }
  }

  if (builtFields.length) {
    embed.setFields(builtFields.slice(0, 25))
  }

  await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [], users: [], roles: [] },
  }).catch(() => null)

  return { ok: true, eventId, sent: true, channelId: channel.id }
}

export async function createAutoLogs(client, guild, actorId = 'system') {
  if (!guild?.id) return { ok: false, reason: 'invalid_guild' }
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null)
  if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, reason: 'missing_manage_channels' }
  }

  await guild.channels.fetch().catch(() => null)

  const categoryName = `${resolveServerName(client.config).toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'casino'}-logs`
  let category = guild.channels.cache.find((ch) => (
    ch.type === ChannelType.GuildCategory
    && String(ch.name).toLowerCase() === categoryName
  )) || null

  if (!category) {
    category = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      reason: 'Auto logs setup',
    }).catch(() => null)
  }

  if (!category) return { ok: false, reason: 'category_create_failed' }

  let created = 0
  let mapped = 0

  for (const meta of LOG_TYPES) {
    let channel = guild.channels.cache.find((ch) => (
      ch.type === ChannelType.GuildText
      && ch.parentId === category.id
      && String(ch.name).toLowerCase() === meta.channelName
    )) || null

    if (!channel) {
      channel = await guild.channels.create({
        name: meta.channelName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.CreatePublicThreads,
              PermissionFlagsBits.CreatePrivateThreads,
            ],
          },
        ],
        reason: 'Auto logs setup',
      }).catch(() => null)

      if (channel) created += 1
    }

    if (!channel) continue
    const set = setLogChannel(client, guild.id, meta.key, channel.id, actorId)
    if (set.ok) mapped += 1
  }

  return {
    ok: true,
    categoryId: category.id,
    created,
    mapped,
    total: LOG_TYPES.length,
  }
}
