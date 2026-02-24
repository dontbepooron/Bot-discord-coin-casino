import { EmbedBuilder } from 'discord.js'
import { writeLog } from './logSystem.js'

const SETTINGS_KEY = 'gain:settings:v1'

function getServerName(config) {
  const value = String(config?.servername || '').trim()
  return value || 'casino'
}

export function resolveDefaultStatusKeyword(config) {
  const slug = getServerName(config)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 32)
  return `/${slug || 'casino'}`
}

const DEFAULT_GAIN_SETTINGS = Object.freeze({
  channelId: null,
  status: {
    enabled: true,
    keyword: '/casino',
    cooldownMinutes: 120,
    rewards: { draws: 1, coins: 400, xp: 10 },
  },
  voice: {
    enabled: true,
    intervalMinutes: 30,
    rewards: { draws: 2, coins: 2000, xp: 30 },
  },
  text: {
    enabled: true,
    threshold: 25,
    windowMinutes: 60,
    cooldownMinutes: 30,
    rewards: { draws: 1, coins: 700, xp: 15 },
  },
})

function cloneDefaults(config = null) {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_GAIN_SETTINGS))
  defaults.status.keyword = resolveDefaultStatusKeyword(config)
  return defaults
}

function toInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

function sanitizeRewards(input, fallback) {
  return {
    draws: toInt(input?.draws, fallback.draws, 0, 1000),
    coins: toInt(input?.coins, fallback.coins, 0, 2_000_000_000),
    xp: toInt(input?.xp, fallback.xp, 0, 2_000_000_000),
  }
}

function sanitizeGainSettings(raw = {}, config = null) {
  const base = cloneDefaults(config)

  return {
    channelId: raw?.channelId ? String(raw.channelId) : null,
    status: {
      enabled: raw?.status?.enabled == null ? base.status.enabled : Boolean(raw.status.enabled),
      keyword: String(raw?.status?.keyword || base.status.keyword).slice(0, 100),
      cooldownMinutes: toInt(raw?.status?.cooldownMinutes, base.status.cooldownMinutes, 1, 1440),
      rewards: sanitizeRewards(raw?.status?.rewards, base.status.rewards),
    },
    voice: {
      enabled: raw?.voice?.enabled == null ? base.voice.enabled : Boolean(raw.voice.enabled),
      intervalMinutes: toInt(raw?.voice?.intervalMinutes, base.voice.intervalMinutes, 1, 720),
      rewards: sanitizeRewards(raw?.voice?.rewards, base.voice.rewards),
    },
    text: {
      enabled: raw?.text?.enabled == null ? base.text.enabled : Boolean(raw.text.enabled),
      threshold: toInt(raw?.text?.threshold, base.text.threshold, 1, 10_000),
      windowMinutes: toInt(raw?.text?.windowMinutes, base.text.windowMinutes, 1, 1440),
      cooldownMinutes: toInt(raw?.text?.cooldownMinutes, base.text.cooldownMinutes, 1, 1440),
      rewards: sanitizeRewards(raw?.text?.rewards, base.text.rewards),
    },
  }
}

export function getGainSettings(client, guildId) {
  const raw = client.store.getState(guildId, SETTINGS_KEY)
  if (!raw) return cloneDefaults(client?.config)

  try {
    const parsed = JSON.parse(raw)
    return sanitizeGainSettings(parsed, client?.config)
  } catch {
    return cloneDefaults(client?.config)
  }
}

export function setGainSettings(client, guildId, patch = {}) {
  const current = getGainSettings(client, guildId)
  const merged = {
    ...current,
    ...patch,
    status: { ...current.status, ...(patch.status || {}) },
    voice: { ...current.voice, ...(patch.voice || {}) },
    text: { ...current.text, ...(patch.text || {}) },
  }

  if (patch.status?.rewards) merged.status.rewards = { ...current.status.rewards, ...patch.status.rewards }
  if (patch.voice?.rewards) merged.voice.rewards = { ...current.voice.rewards, ...patch.voice.rewards }
  if (patch.text?.rewards) merged.text.rewards = { ...current.text.rewards, ...patch.text.rewards }

  const safe = sanitizeGainSettings(merged, client?.config)
  client.store.setState(guildId, SETTINGS_KEY, JSON.stringify(safe))
  return safe
}

export function setGainChannel(client, guildId, channelId) {
  return setGainSettings(client, guildId, { channelId: channelId || null })
}

function getCoinName(config) {
  const explicit = String(config?.namecoin || '').trim()
  if (explicit) return explicit
  return 'Coins'
}

function getCoinEmoji(config) {
  return String(config?.currency?.coinEmoji || '').trim() || '🪙'
}

function getXpEmoji(config) {
  return String(config?.currency?.xpFlaskEmoji || '').trim() || '🧪'
}

function formatRewardSummary(config, rewards) {
  const chunks = []
  if ((rewards?.draws || 0) > 0) chunks.push(`${rewards.draws} tirage(s)`)
  if ((rewards?.coins || 0) > 0) chunks.push(`${rewards.coins} ${getCoinEmoji(config)}`)
  if ((rewards?.xp || 0) > 0) chunks.push(`${rewards.xp} ${getXpEmoji(config)}`)
  if (!chunks.length) return 'rien'
  return chunks.join(' et ')
}

export async function postGainLog(client, guild, payload = {}) {
  const settings = getGainSettings(client, guild.id)
  if (!settings.channelId) return false

  const channel = guild.channels.cache.get(settings.channelId)
    || await guild.channels.fetch(settings.channelId).catch(() => null)
  if (!channel?.isTextBased?.()) return false

  const embed = new EmbedBuilder()
    .setColor('#111111')
    .setAuthor({
      name: payload.authorName || payload.userTag || payload.username || 'Gain',
      iconURL: payload.authorIcon || payload.avatarURL || null,
    })
    .setDescription(payload.description || '')

  if (payload.thumbnailURL) {
    embed.setThumbnail(payload.thumbnailURL)
  }

  await channel.send({ embeds: [embed] }).catch(() => null)
  return true
}

export async function awardGainForMember(client, {
  guild,
  member = null,
  userId,
  source,
  reason,
  rewards,
  customLogDescription = null,
}) {
  const targetId = userId || member?.id
  if (!guild?.id || !targetId) return { ok: false, reason: 'invalid_target' }
  if (!client.store.hasProfile(targetId)) return { ok: false, reason: 'profile_required' }

  const safeRewards = sanitizeRewards(rewards || {}, { draws: 0, coins: 0, xp: 0 })

  client.store.ensureUser(guild.id, targetId)
  client.store.ensureCasinoProfile(guild.id, targetId)

  if (safeRewards.coins > 0 || safeRewards.xp > 0) {
    client.store.addBalance(guild.id, targetId, {
      coinsDelta: safeRewards.coins,
      xpDelta: safeRewards.xp,
    }, {
      source: `gain:${String(source || 'unknown').slice(0, 40)}`,
      actorId: 'system',
      reason: reason || source || 'gain',
      metadata: {
        gainSource: source || null,
        gainReason: reason || null,
      },
    })
  }

  if (safeRewards.draws > 0) {
    client.store.addCasinoDrawCredits(guild.id, targetId, safeRewards.draws)
  }

  const user = member?.user || await client.users.fetch(targetId).catch(() => null)
  const summary = formatRewardSummary(client.config, safeRewards)
  const gainReason = reason || source || 'gain'

  const description = customLogDescription
    || `Gg à toi ! Tu viens de gagner ${summary} car ${gainReason} !`

  await postGainLog(client, guild, {
    authorName: user?.tag || member?.displayName || targetId,
    authorIcon: user?.displayAvatarURL?.({ size: 128 }) || null,
    thumbnailURL: user?.displayAvatarURL?.({ size: 256 }) || null,
    description,
  })

  await writeLog(client, {
    guild,
    logType: 'gains',
    severity: 'info',
    actorId: null,
    targetUserId: targetId,
    commandName: source ? `gain:${source}` : 'gain',
    description,
    data: {
      source,
      reason,
      rewards: safeRewards,
    },
    thumbnail: user?.displayAvatarURL?.({ size: 256 }) || null,
  }).catch(() => null)

  return { ok: true, rewards: safeRewards }
}

function memberHasStatusKeyword(member, keyword) {
  const needle = String(keyword || '').trim().toLowerCase()
  if (!needle) return false

  const activities = member?.presence?.activities || []
  for (const activity of activities) {
    const state = String(activity?.state || '').toLowerCase()
    const name = String(activity?.name || '').toLowerCase()
    if (state.includes(needle) || name.includes(needle)) {
      return true
    }
  }

  return false
}

export async function processMessageGains(client, message) {
  if (!message?.guild || !message?.author || message.author.bot) return

  const guildId = message.guild.id
  const userId = message.author.id
  const settings = getGainSettings(client, guildId)
  const member = message.member || null

  if (!member) return

  if (settings.status.enabled && memberHasStatusKeyword(member, settings.status.keyword)) {
    const cooldownMs = settings.status.cooldownMinutes * 60_000
    const remain = client.store.getCooldownRemaining(guildId, userId, 'gain_status', cooldownMs)
    if (remain <= 0) {
      const awarded = await awardGainForMember(client, {
        guild: message.guild,
        member,
        source: 'status',
        reason: `tu as le mot-clé \`${settings.status.keyword}\` en statut`,
        rewards: settings.status.rewards,
      })
      if (awarded.ok) {
        client.store.setCooldown(guildId, userId, 'gain_status')
      }
    }
  }

  if (!settings.text.enabled) return
  const content = String(message.content || '').trim()
  const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim()
  if (normalized.length < 8) return
  if ((normalized.match(/[a-z0-9]/gi) || []).length < 4) return

  const key = `${guildId}:${userId}`
  const now = Date.now()
  const windowMs = settings.text.windowMinutes * 60_000

  const current = client.gainTextStats.get(key) || {
    count: 0,
    windowStartedAt: now,
    lastContent: '',
    repeatCount: 0,
    spamNotifiedAt: 0,
  }
  if (now - current.windowStartedAt > windowMs) {
    current.count = 0
    current.windowStartedAt = now
    current.lastContent = ''
    current.repeatCount = 0
    current.spamNotifiedAt = 0
  }

  if (current.lastContent === normalized) {
    current.repeatCount += 1
    if (current.repeatCount >= 4 && now - current.spamNotifiedAt > 15 * 60_000) {
      await writeLog(client, {
        guild: message.guild,
        logType: 'anticheat',
        severity: 'warning',
        actorId: userId,
        targetUserId: userId,
        commandName: 'gain_text',
        description: 'Suspicion de farm texte: messages répétitifs détectés.',
        data: {
          repeatCount: current.repeatCount,
          sample: normalized.slice(0, 120),
          channelId: message.channel.id,
        },
      }).catch(() => null)
      current.spamNotifiedAt = now
    }
    client.gainTextStats.set(key, current)
    return
  }

  current.lastContent = normalized
  current.repeatCount = 0
  current.count += 1

  if (current.count >= settings.text.threshold) {
    const cooldownMs = settings.text.cooldownMinutes * 60_000
    const remain = client.store.getCooldownRemaining(guildId, userId, 'gain_text', cooldownMs)
    if (remain <= 0) {
      const awarded = await awardGainForMember(client, {
        guild: message.guild,
        member,
        source: 'text',
        reason: 'tu es actif dans les salons textuels',
        rewards: settings.text.rewards,
      })
      if (awarded.ok) {
        client.store.setCooldown(guildId, userId, 'gain_text')
        current.count = 0
        current.windowStartedAt = now
      }
    }
  }

  client.gainTextStats.set(key, current)
}

function isVoiceConnected(state) {
  return Boolean(state?.channelId && !state?.member?.user?.bot)
}

export function handleVoiceStateGain(client, oldState, newState) {
  const guildId = newState?.guild?.id || oldState?.guild?.id
  const userId = newState?.id || oldState?.id
  if (!guildId || !userId) return

  const key = `${guildId}:${userId}`
  const before = isVoiceConnected(oldState)
  const after = isVoiceConnected(newState)

  if (!before && after) {
    client.gainVoiceSessions.set(key, {
      guildId,
      userId,
      lastAwardAt: Date.now(),
      lastVoiceTrackAt: Date.now(),
    })
    return
  }

  if (before && !after) {
    client.gainVoiceSessions.delete(key)
  }
}

async function tickVoiceGains(client) {
  const now = Date.now()

  for (const [key, session] of client.gainVoiceSessions.entries()) {
    const guild = client.guilds.cache.get(session.guildId)
    if (!guild) {
      client.gainVoiceSessions.delete(key)
      continue
    }

    const member = guild.members.cache.get(session.userId)
      || await guild.members.fetch(session.userId).catch(() => null)

    if (!member?.voice?.channelId) {
      client.gainVoiceSessions.delete(key)
      continue
    }

    const trackBase = Number.isFinite(session.lastVoiceTrackAt)
      ? session.lastVoiceTrackAt
      : (Number.isFinite(session.lastAwardAt) ? session.lastAwardAt : now)
    const elapsedMinutes = Math.floor((now - trackBase) / 60_000)
    if (elapsedMinutes > 0) {
      client.store.addCasinoVoiceMinutes(guild.id, session.userId, elapsedMinutes)
      session.lastVoiceTrackAt = trackBase + elapsedMinutes * 60_000
    } else if (!Number.isFinite(session.lastVoiceTrackAt)) {
      session.lastVoiceTrackAt = trackBase
    }

    const settings = getGainSettings(client, guild.id)
    if (!settings.voice.enabled) continue

    const intervalMs = settings.voice.intervalMinutes * 60_000
    if (intervalMs <= 0) continue

    const lastAwardAt = Number.isFinite(session.lastAwardAt) ? session.lastAwardAt : now
    if (now - lastAwardAt < intervalMs) continue

    const awarded = await awardGainForMember(client, {
      guild,
      member,
      source: 'vocal',
      reason: 'tu es en vocal',
      rewards: settings.voice.rewards,
    })

    if (awarded.ok) {
      session.lastAwardAt = now
      client.gainVoiceSessions.set(key, session)
    }
  }
}

export function startGainVoiceScheduler(client) {
  if (client.gainVoiceInterval) {
    clearInterval(client.gainVoiceInterval)
  }

  client.gainVoiceInterval = setInterval(() => {
    tickVoiceGains(client).catch(() => null)
  }, 60_000)

  for (const guild of client.guilds.cache.values()) {
    for (const [userId, voiceState] of guild.voiceStates.cache.entries()) {
      if (!voiceState?.channelId) continue
      if (voiceState?.member?.user?.bot) continue
      const key = `${guild.id}:${userId}`
      if (!client.gainVoiceSessions.has(key)) {
        client.gainVoiceSessions.set(key, {
          guildId: guild.id,
          userId,
          lastAwardAt: Date.now(),
          lastVoiceTrackAt: Date.now(),
        })
      }
    }
  }
}

export function buildGainPanelText(settings, config) {
  const coin = getCoinEmoji(config)
  const xp = getXpEmoji(config)
  return [
    `Salon de logs: ${settings.channelId ? `<#${settings.channelId}>` : 'Non défini'}`,
    '',
    `Status: ${settings.status.enabled ? 'ON' : 'OFF'} | mot-clé: ${settings.status.keyword}`,
    `Reward status: ${settings.status.rewards.draws} tirage(s), ${settings.status.rewards.coins} ${coin}, ${settings.status.rewards.xp} ${xp}`,
    `Cooldown status: ${settings.status.cooldownMinutes} min`,
    '',
    `Vocal: ${settings.voice.enabled ? 'ON' : 'OFF'} | interval: ${settings.voice.intervalMinutes} min`,
    `Reward vocal: ${settings.voice.rewards.draws} tirage(s), ${settings.voice.rewards.coins} ${coin}, ${settings.voice.rewards.xp} ${xp}`,
    '',
    `Texte: ${settings.text.enabled ? 'ON' : 'OFF'} | seuil: ${settings.text.threshold} msg / ${settings.text.windowMinutes} min`,
    `Reward texte: ${settings.text.rewards.draws} tirage(s), ${settings.text.rewards.coins} ${coin}, ${settings.text.rewards.xp} ${xp}`,
    `Cooldown texte: ${settings.text.cooldownMinutes} min`,
  ].join('\n')
}
