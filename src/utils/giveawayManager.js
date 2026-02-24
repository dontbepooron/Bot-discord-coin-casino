/**
 * Giveaway manager: persistence DB, scheduler, interactions, and reaction handlers.
 * Designed for high participation volume with minimal memory usage.
 */
import ms from 'ms'
import { randomInt } from 'node:crypto'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js'
import { buildEmbed } from './embedBuilder.js'
import {
  parseIntInRange,
  parseRoleId,
  parseUserId,
  safeDbAll,
  safeDbGet,
  safeDbRun,
  safeTrim,
} from './commandToolkit.js'

export const GIVEAWAY_MIN_DURATION_MS = 5_000
export const GIVEAWAY_MAX_DURATION_MS = 24 * 24 * 60 * 60 * 1000 // 24 jours
export const GIVEAWAY_BUTTON_JOIN_PREFIX = 'gaw2:join:'
export const GIVEAWAY_BUTTON_INFO_PREFIX = 'gaw2:info:' // legacy, conservé pour compat

const GIVEAWAY_TICK_MS = 15_000
const GIVEAWAY_REFRESH_DEBOUNCE_MS = 4_000
const DEFAULT_ENTRY_MODE = 'button'
const DEFAULT_ENTRY_EMOJI = '💎'
const CUSTOM_EMOJI_PATTERN = /^<a?:[\w-]{2,32}:\d{17,20}>$/
const CUSTOM_EMOJI_ID_PATTERN = /^\d{17,20}$/
const UNICODE_EMOJI_PATTERN = /\p{Extended_Pictographic}/u
const MAX_WINNERS_COUNT = 50
const MAX_FORCED_WINNERS = 50
const DEFAULT_CURRENCY_NAME = 'NozCoins'
const MAX_CURRENCY_NAME_LENGTH = 40
const MAX_CURRENCY_EMOJI_LENGTH = 64
const MIN_GIVEAWAY_GAIN_COINS = 1
const MAX_GIVEAWAY_GAIN_COINS = 2_000_000_000
const END_LOCKS = new Set()
const COIN_NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR')

const ENTRY_MODES = Object.freeze(new Set(['button', 'reaction']))

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseLegacyCoins(value, fallback = 0) {
  const raw = String(value ?? '')
  if (!raw) return fallback

  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return fallback

  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeRewardCoins(value, fallback = 0) {
  const parsed = parseIntInRange(value, MIN_GIVEAWAY_GAIN_COINS, MAX_GIVEAWAY_GAIN_COINS)
  if (parsed != null) return parsed

  const legacy = parseIntInRange(parseLegacyCoins(value, 0), MIN_GIVEAWAY_GAIN_COINS, MAX_GIVEAWAY_GAIN_COINS)
  if (legacy != null) return legacy

  return Math.max(0, fallback)
}

function normalizeCurrencyName(value) {
  return safeTrim(value, MAX_CURRENCY_NAME_LENGTH) || DEFAULT_CURRENCY_NAME
}

function normalizeCurrencyEmoji(value) {
  return safeTrim(value, MAX_CURRENCY_EMOJI_LENGTH)
}

function formatCoinAmount(giveaway, amount) {
  const safeAmount = Math.max(0, toInt(amount, 0))
  const formatted = COIN_NUMBER_FORMATTER.format(safeAmount)
  const emoji = normalizeCurrencyEmoji(giveaway?.currency_emoji)

  if (emoji) return `${formatted} ${emoji}`
  return `${formatted} 🪙`
}

function formatPayoutSummary(giveaway, payouts, { maxRows = 8 } = {}) {
  if (!Array.isArray(payouts) || payouts.length === 0) return null

  const lines = payouts
    .slice(0, Math.max(1, maxRows))
    .map((item) => `<@${item.user_id}>: ${formatCoinAmount(giveaway, item.amount)}`)

  if (payouts.length > lines.length) {
    lines.push(`+${payouts.length - lines.length} autre(s)`)
  }

  return lines.join(' • ')
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || ''))
}

function normalizeEntryMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  return ENTRY_MODES.has(mode) ? mode : DEFAULT_ENTRY_MODE
}

function normalizeEntryEmoji(value) {
  const emoji = safeTrim(value, 64)
  if (!emoji) return DEFAULT_ENTRY_EMOJI
  if (CUSTOM_EMOJI_PATTERN.test(emoji)) return emoji
  if (CUSTOM_EMOJI_ID_PATTERN.test(emoji)) return emoji
  if (UNICODE_EMOJI_PATTERN.test(emoji)) return emoji
  return DEFAULT_ENTRY_EMOJI
}

function normalizeForcedWinnerIds(input) {
  let source = input
  if (source == null) return []

  if (typeof source === 'string') {
    const raw = source.trim()
    if (!raw) return []

    try {
      source = JSON.parse(raw)
    } catch {
      source = raw.split(/[\s,;|\n]+/g)
    }
  }

  if (!Array.isArray(source)) {
    source = [source]
  }

  const out = []
  const seen = new Set()

  for (const token of source) {
    const userId = parseUserId(String(token || ''))
    if (!userId || !isSnowflake(userId)) continue
    if (seen.has(userId)) continue

    out.push(userId)
    seen.add(userId)
    if (out.length >= MAX_FORCED_WINNERS) break
  }

  return out
}

function requirementsToText(giveaway) {
  const lines = []
  if (giveaway.required_role_id) lines.push(`Role requis: <@&${giveaway.required_role_id}>`)
  if (giveaway.excluded_role_id) lines.push(`Role exclu: <@&${giveaway.excluded_role_id}>`)
  if (giveaway.min_account_age_ms > 0) lines.push(`Compte >= ${ms(giveaway.min_account_age_ms, { long: true })}`)
  if (giveaway.min_join_age_ms > 0) lines.push(`Serveur >= ${ms(giveaway.min_join_age_ms, { long: true })}`)
  return lines
}

function normalizeGiveawayRow(row) {
  if (!row) return null

  const forcedWinnerIds = normalizeForcedWinnerIds(row.forced_winner_ids)
  const rewardCoins = normalizeRewardCoins(row.reward_coins, parseLegacyCoins(row.prize, 0))
  const currencyName = normalizeCurrencyName(row.currency_name)
  const currencyEmoji = normalizeCurrencyEmoji(row.currency_emoji)

  return {
    ...row,
    prize: safeTrim(row.prize, 200),
    reward_coins: rewardCoins,
    currency_name: currencyName,
    currency_emoji: currencyEmoji,
    winners_count: toInt(row.winners_count, 1),
    min_account_age_ms: toInt(row.min_account_age_ms, 0),
    min_join_age_ms: toInt(row.min_join_age_ms, 0),
    created_at: toInt(row.created_at, 0),
    end_at: toInt(row.end_at, 0),
    ended_at: toInt(row.ended_at, 0),
    entries_count: Math.max(0, toInt(row.entries_count, 0)),
    entry_mode: normalizeEntryMode(row.entry_mode),
    entry_emoji: normalizeEntryEmoji(row.entry_emoji),
    forced_winner_ids: JSON.stringify(forcedWinnerIds),
    forcedWinnerIds,
  }
}

function clampWinnersCount(value, fallback = 1) {
  return parseIntInRange(value, 1, MAX_WINNERS_COUNT) ?? fallback
}

function serializeForcedWinners(ids) {
  return JSON.stringify(normalizeForcedWinnerIds(ids))
}

function parseEmojiKeyFromReaction(reaction) {
  const emoji = reaction?.emoji
  if (!emoji) return ''

  // unicode emoji
  if (emoji.id == null) {
    return String(emoji.name || '').trim()
  }

  // custom emoji id only (stable)
  return String(emoji.id)
}

function parseEmojiKeyFromStored(value) {
  const raw = safeTrim(value, 120)
  if (!raw) return DEFAULT_ENTRY_EMOJI

  // custom format <:name:id> or <a:name:id>
  const custom = raw.match(/^<a?:[\w-]{2,32}:(\d{17,20})>$/)
  if (custom?.[1]) return custom[1]

  if (/^\d{17,20}$/.test(raw)) return raw
  return raw
}

function buildGiveawayParticipationText(giveaway) {
  if (giveaway.entry_mode === 'reaction') {
    return `Réagissez avec ${giveaway.entry_emoji} pour participer`
  }
  return `Cliquez sur le bouton ${giveaway.entry_emoji} pour participer`
}

function buildGiveawayComponents(giveaway, { disabled = false } = {}) {
  if (!giveaway || giveaway.entry_mode === 'reaction') return []

  const entriesCount = Math.max(0, toInt(giveaway.entries_count, 0))
  const label = String(entriesCount)
  const button = new ButtonBuilder()
    .setCustomId(`${GIVEAWAY_BUTTON_JOIN_PREFIX}${giveaway.message_id}`)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled)

  try {
    button.setEmoji(giveaway.entry_emoji || DEFAULT_ENTRY_EMOJI)
  } catch {
    button.setEmoji(DEFAULT_ENTRY_EMOJI)
  }

  return [
    new ActionRowBuilder().addComponents(button),
  ]
}

function buildGiveawayEmbed(giveaway, { winners = [], payouts = [], cancelled = false } = {}) {
  const participantsLine = buildGiveawayParticipationText(giveaway)
  const forcedCount = giveaway.forcedWinnerIds?.length || 0
  const extraRequirements = requirementsToText(giveaway)
  const gainLine = `Gain total: ${formatCoinAmount(giveaway, giveaway.reward_coins)}`

  if (cancelled || giveaway.status === 'cancelled') {
    return buildEmbed({
      variant: 'warn',
      title: 'Giveaway Coins',
      description: [
        'Giveaway annulé.',
        gainLine,
        `Nombre de gagnants: ${giveaway.winners_count}`,
        'Fin du giveaway',
        `<t:${giveaway.end_at}:R>`,
      ].join('\n'),
    })
  }

  if (giveaway.status === 'ended') {
    const winnerMentions = winners.length ? winners.map((id) => `<@${id}>`).join(', ') : 'Aucun gagnant'
    const lines = [
      'Giveaway terminé.',
      gainLine,
      `Nombre de gagnants: ${giveaway.winners_count}`,
      'Fin du giveaway',
      `<t:${giveaway.end_at}:R>`,
      `Gagnant(s): ${winnerMentions}`,
    ]

    const payoutSummary = formatPayoutSummary(giveaway, payouts, { maxRows: 6 })
    if (payoutSummary) {
      lines.push(`Distribution: ${payoutSummary}`)
    }

    if (forcedCount > 0) {
      lines.push(`Gagnants imposés configurés: ${forcedCount}`)
    }

    return buildEmbed({
      variant: winners.length ? 'success' : 'info',
      title: 'Giveaway Coins',
      description: lines.join('\n'),
    })
  }

  const lines = [
    participantsLine,
    gainLine,
    `Nombre de gagnants: ${giveaway.winners_count}`,
    'Fin du giveaway',
    `<t:${giveaway.end_at}:R>`,
  ]

  if (forcedCount > 0) {
    lines.push(`Gagnants imposés: ${forcedCount}`)
  }

  if (extraRequirements.length > 0) {
    lines.push('Conditions:')
    lines.push(...extraRequirements)
  }

  return buildEmbed({
    variant: 'info',
    title: 'Giveaway Coins',
    description: lines.join('\n'),
  })
}

function getEndLockKey(guildId, messageId) {
  return `${guildId}:${messageId}`
}

function ensureGiveawayColumns(db) {
  const cols = db.prepare('PRAGMA table_info(giveaways)').all() || []
  const names = new Set(cols.map((col) => String(col?.name || '').toLowerCase()))

  const required = [
    { name: 'entry_mode', sql: "ALTER TABLE giveaways ADD COLUMN entry_mode TEXT NOT NULL DEFAULT 'button'" },
    { name: 'entry_emoji', sql: "ALTER TABLE giveaways ADD COLUMN entry_emoji TEXT NOT NULL DEFAULT '💎'" },
    { name: 'entries_count', sql: 'ALTER TABLE giveaways ADD COLUMN entries_count INTEGER NOT NULL DEFAULT 0' },
    { name: 'forced_winner_ids', sql: "ALTER TABLE giveaways ADD COLUMN forced_winner_ids TEXT NOT NULL DEFAULT '[]'" },
    { name: 'reward_coins', sql: 'ALTER TABLE giveaways ADD COLUMN reward_coins INTEGER NOT NULL DEFAULT 0' },
    { name: 'currency_name', sql: `ALTER TABLE giveaways ADD COLUMN currency_name TEXT NOT NULL DEFAULT '${DEFAULT_CURRENCY_NAME}'` },
    { name: 'currency_emoji', sql: "ALTER TABLE giveaways ADD COLUMN currency_emoji TEXT NOT NULL DEFAULT ''" },
  ]

  for (const item of required) {
    if (names.has(item.name)) continue
    const add = safeDbRun(db, item.sql)
    if (!add.ok) return add
    names.add(item.name)
  }

  return { ok: true }
}

function normalizeGiveawayData(db) {
  const updates = [
    "UPDATE giveaways SET entry_mode = 'button' WHERE entry_mode IS NULL OR lower(trim(entry_mode)) NOT IN ('button','reaction')",
    "UPDATE giveaways SET entry_emoji = '💎' WHERE entry_emoji IS NULL OR trim(entry_emoji) = ''",
    "UPDATE giveaways SET forced_winner_ids = '[]' WHERE forced_winner_ids IS NULL OR json_valid(forced_winner_ids) = 0",
    'UPDATE giveaways SET entries_count = 0 WHERE entries_count IS NULL OR entries_count < 0',
    "UPDATE giveaways SET reward_coins = CAST(prize AS INTEGER) WHERE (reward_coins IS NULL OR reward_coins = 0) AND trim(prize) GLOB '[0-9][0-9]*'",
    'UPDATE giveaways SET reward_coins = 0 WHERE reward_coins IS NULL OR reward_coins < 0',
    `UPDATE giveaways SET currency_name = '${DEFAULT_CURRENCY_NAME}' WHERE currency_name IS NULL OR trim(currency_name) = ''`,
    "UPDATE giveaways SET currency_emoji = '' WHERE currency_emoji IS NULL",
    `UPDATE giveaways
     SET entries_count = COALESCE((
       SELECT COUNT(*)
       FROM giveaway_entries ge
       WHERE ge.message_id = giveaways.message_id
     ), 0)`,
  ]

  for (const sql of updates) {
    const res = safeDbRun(db, sql)
    if (!res.ok) return res
  }

  return { ok: true }
}

export function ensureGiveawayTables(db) {
  if (!db?.prepare) return { ok: false, error: new Error('Database unavailable') }

  const queries = [
    `CREATE TABLE IF NOT EXISTS giveaways (
      message_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      prize TEXT NOT NULL DEFAULT '',
      reward_coins INTEGER NOT NULL DEFAULT 0,
      currency_name TEXT NOT NULL DEFAULT 'NozCoins',
      currency_emoji TEXT NOT NULL DEFAULT '',
      winners_count INTEGER NOT NULL DEFAULT 1,
      required_role_id TEXT,
      excluded_role_id TEXT,
      min_account_age_ms INTEGER NOT NULL DEFAULT 0,
      min_join_age_ms INTEGER NOT NULL DEFAULT 0,
      entry_mode TEXT NOT NULL DEFAULT 'button',
      entry_emoji TEXT NOT NULL DEFAULT '💎',
      forced_winner_ids TEXT NOT NULL DEFAULT '[]',
      entries_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      end_at INTEGER NOT NULL,
      ended_at INTEGER,
      ended_by TEXT,
      last_error TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_giveaways_guild_status_end ON giveaways(guild_id, status, end_at)',
    'CREATE INDEX IF NOT EXISTS idx_giveaways_channel_status ON giveaways(channel_id, status)',
    `CREATE TABLE IF NOT EXISTS giveaway_entries (
      message_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (message_id, user_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_giveaway_entries_message ON giveaway_entries(message_id)',
    `CREATE TABLE IF NOT EXISTS giveaway_winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      picked_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      round INTEGER NOT NULL DEFAULT 0
    )`,
    'CREATE INDEX IF NOT EXISTS idx_giveaway_winners_message_round ON giveaway_winners(message_id, round)',
    `CREATE TABLE IF NOT EXISTS casino_coin_balances (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      coins INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, user_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_casino_coin_balances_user ON casino_coin_balances(user_id)',
    `CREATE TABLE IF NOT EXISTS giveaway_coin_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      round INTEGER NOT NULL DEFAULT 0,
      paid_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(message_id, round, user_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_giveaway_coin_payouts_message_round ON giveaway_coin_payouts(message_id, round)',
  ]

  for (const sql of queries) {
    const res = safeDbRun(db, sql)
    if (!res.ok) return res
  }

  const columns = ensureGiveawayColumns(db)
  if (!columns.ok) return columns

  const normalized = normalizeGiveawayData(db)
  if (!normalized.ok) return normalized

  return { ok: true }
}

export function parseGiveawayDurationInput(input) {
  const raw = safeTrim(input, 40).toLowerCase()
  if (!raw) {
    return { ok: false, error: 'Durée manquante.' }
  }

  const parsed = ms(raw)
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: 'Durée invalide (ex: 30m, 2h, 1d).' }
  }
  if (parsed < GIVEAWAY_MIN_DURATION_MS) {
    return { ok: false, error: `Durée trop courte (min ${ms(GIVEAWAY_MIN_DURATION_MS, { long: true })}).` }
  }
  if (parsed > GIVEAWAY_MAX_DURATION_MS) {
    return { ok: false, error: `Durée trop longue (max ${ms(GIVEAWAY_MAX_DURATION_MS, { long: true })}).` }
  }
  return { ok: true, durationMs: Math.floor(parsed), normalized: raw }
}

export function parseGiveawayGainInput(
  input,
  {
    min = MIN_GIVEAWAY_GAIN_COINS,
    max = MAX_GIVEAWAY_GAIN_COINS,
  } = {}
) {
  const raw = safeTrim(input, 80)
  if (!raw) {
    return { ok: false, error: 'Gain manquant.' }
  }

  const normalized = raw.replace(/[,_\s.]/g, '')
  if (!/^\d+$/.test(normalized)) {
    return { ok: false, error: 'Le gain doit être un nombre entier de coins.' }
  }

  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isSafeInteger(parsed)) {
    return { ok: false, error: 'Montant invalide.' }
  }
  if (parsed < min) {
    return { ok: false, error: `Gain trop faible (min ${COIN_NUMBER_FORMATTER.format(min)}).` }
  }
  if (parsed > max) {
    return { ok: false, error: `Gain trop élevé (max ${COIN_NUMBER_FORMATTER.format(max)}).` }
  }

  return { ok: true, coins: parsed }
}

export function parseForcedWinnerInput(input, { limit = MAX_FORCED_WINNERS } = {}) {
  const raw = safeTrim(input, 2000)
  if (!raw || ['off', 'none', '0', 'no', 'clear'].includes(raw.toLowerCase())) {
    return { ok: true, ids: [] }
  }

  const parts = raw.split(/[\s,;|\n]+/g)
  const out = []
  const seen = new Set()

  for (const part of parts) {
    const userId = parseUserId(part)
    if (!userId || !isSnowflake(userId)) continue
    if (seen.has(userId)) continue
    seen.add(userId)
    out.push(userId)
    if (out.length >= limit) break
  }

  if (!out.length) {
    return { ok: false, error: 'Aucun utilisateur valide trouvé.' }
  }

  return { ok: true, ids: out }
}

export function getGiveawayByMessageId(db, messageId, guildId = null) {
  const id = safeTrim(messageId, 32)
  if (!id) return null
  const query = guildId
    ? ['SELECT * FROM giveaways WHERE message_id = ? AND guild_id = ? LIMIT 1', [id, guildId]]
    : ['SELECT * FROM giveaways WHERE message_id = ? LIMIT 1', [id]]
  const res = safeDbGet(db, query[0], query[1])
  if (!res.ok) return null
  return normalizeGiveawayRow(res.row)
}

export function getRecentGiveawayInChannel(db, guildId, channelId, status = 'active') {
  const statusSafe = ['active', 'ended', 'cancelled'].includes(status) ? status : 'active'
  const res = safeDbGet(
    db,
    'SELECT * FROM giveaways WHERE guild_id = ? AND channel_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
    [guildId, channelId, statusSafe]
  )
  if (!res.ok) return null
  return normalizeGiveawayRow(res.row)
}

export function listActiveGiveaways(db, guildId, limit = 10) {
  const safeLimit = parseIntInRange(limit, 1, 50) ?? 10
  const res = safeDbAll(
    db,
    'SELECT * FROM giveaways WHERE guild_id = ? AND status = ? ORDER BY end_at ASC LIMIT ?',
    [guildId, 'active', safeLimit]
  )
  if (!res.ok) return []
  return (res.rows || []).map(normalizeGiveawayRow).filter(Boolean)
}

export function countGiveawayEntries(db, messageId) {
  const giveaway = getGiveawayByMessageId(db, messageId)
  if (giveaway) return giveaway.entries_count

  const res = safeDbGet(
    db,
    'SELECT COUNT(*) AS n FROM giveaway_entries WHERE message_id = ?',
    [messageId]
  )
  if (!res.ok) return 0
  return toInt(res.row?.n, 0)
}

function getLatestWinnerRound(db, messageId) {
  const res = safeDbGet(db, 'SELECT MAX(round) AS max_round FROM giveaway_winners WHERE message_id = ?', [messageId])
  if (!res.ok) return null
  const n = res.row?.max_round
  if (n == null) return null
  return toInt(n, 0)
}

function listWinnerIds(db, messageId) {
  const res = safeDbAll(
    db,
    'SELECT DISTINCT user_id FROM giveaway_winners WHERE message_id = ?',
    [messageId]
  )
  if (!res.ok) return []
  return (res.rows || []).map((row) => String(row.user_id)).filter(isSnowflake)
}

function listWinnerIdsByRound(db, messageId, round) {
  const res = safeDbAll(
    db,
    'SELECT user_id FROM giveaway_winners WHERE message_id = ? AND round = ?',
    [messageId, round]
  )
  if (!res.ok) return []
  return (res.rows || []).map((row) => String(row.user_id)).filter(isSnowflake)
}

function listPayoutsByRound(db, messageId, round) {
  const res = safeDbAll(
    db,
    'SELECT user_id, amount FROM giveaway_coin_payouts WHERE message_id = ? AND round = ? ORDER BY amount DESC, user_id ASC',
    [messageId, round]
  )
  if (!res.ok) return []

  return (res.rows || [])
    .map((row) => ({
      user_id: String(row.user_id || ''),
      amount: Math.max(0, toInt(row.amount, 0)),
    }))
    .filter((row) => isSnowflake(row.user_id) && row.amount > 0)
}

function buildPayoutsForRound(giveaway, winnerIds) {
  const total = Math.max(0, toInt(giveaway.reward_coins, 0))
  if (total <= 0 || winnerIds.length === 0) return []

  const payouts = []
  const winnersCount = winnerIds.length
  const base = Math.floor(total / winnersCount)
  let remainder = total % winnersCount

  for (const userId of winnerIds) {
    const bonus = remainder > 0 ? 1 : 0
    if (remainder > 0) remainder -= 1
    const amount = base + bonus
    if (amount <= 0) continue

    payouts.push({
      user_id: userId,
      amount,
    })
  }

  return payouts
}

function persistWinnerRound(db, giveaway, winnerIds, round) {
  if (!winnerIds.length) return { ok: true, payouts: [] }

  const payouts = buildPayoutsForRound(giveaway, winnerIds)

  const tx = db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO giveaway_winners (message_id, guild_id, user_id, round) VALUES (?, ?, ?, ?)'
    )
    const upsertBalance = db.prepare(
      `INSERT INTO users (guild_id, user_id, coins, xp_flasks, updated_at)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(guild_id, user_id)
       DO UPDATE SET
         coins = users.coins + excluded.coins,
         updated_at = excluded.updated_at`
    )
    const selectUser = db.prepare(
      'SELECT coins, xp_flasks FROM users WHERE guild_id = ? AND user_id = ?'
    )
    const insertTx = db.prepare(
      `INSERT INTO economy_transactions
       (guild_id, user_id, actor_id, source, reason, command_name, channel_id, message_id,
        coins_before, coins_delta, coins_after, xp_before, xp_delta, xp_after, trace_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertPayout = db.prepare(
      'INSERT OR REPLACE INTO giveaway_coin_payouts (message_id, guild_id, user_id, amount, round, paid_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const now = nowSec()
    const traceId = `gwy_${giveaway.message_id}_${round}`

    for (const userId of winnerIds) {
      insert.run(giveaway.message_id, giveaway.guild_id, userId, round)
    }

    for (const payout of payouts) {
      const before = selectUser.get(giveaway.guild_id, payout.user_id)
      const beforeCoins = Math.max(0, toInt(before?.coins, 0))
      const beforeXp = Math.max(0, toInt(before?.xp_flasks, 0))
      upsertBalance.run(giveaway.guild_id, payout.user_id, payout.amount, now)
      insertPayout.run(giveaway.message_id, giveaway.guild_id, payout.user_id, payout.amount, round, now)
      insertTx.run(
        giveaway.guild_id,
        payout.user_id,
        'system',
        'giveaway:payout',
        `Giveaway ${giveaway.message_id} round ${round}`,
        'giveaway',
        null,
        giveaway.message_id,
        beforeCoins,
        payout.amount,
        beforeCoins + payout.amount,
        beforeXp,
        0,
        beforeXp,
        traceId,
        JSON.stringify({
          giveawayMessageId: giveaway.message_id,
          round,
          payout: payout.amount,
        }),
        now
      )
    }
  })

  try {
    tx()
    return { ok: true, payouts }
  } catch (error) {
    return { ok: false, error }
  }
}

function checkEntryEligibility(member, giveaway) {
  if (!member || member.user?.bot) {
    return { ok: false, reason: 'Les bots ne peuvent pas participer.' }
  }

  const requiredRoleId = parseRoleId(giveaway.required_role_id || '')
  if (requiredRoleId && !member.roles?.cache?.has(requiredRoleId)) {
    return { ok: false, reason: `Role requis manquant: <@&${requiredRoleId}>.` }
  }

  const excludedRoleId = parseRoleId(giveaway.excluded_role_id || '')
  if (excludedRoleId && member.roles?.cache?.has(excludedRoleId)) {
    return { ok: false, reason: `Acces refusé: role exclu <@&${excludedRoleId}>.` }
  }

  const nowMs = Date.now()
  if (giveaway.min_account_age_ms > 0) {
    const createdAt = member.user?.createdTimestamp || 0
    if (!createdAt || nowMs - createdAt < giveaway.min_account_age_ms) {
      return {
        ok: false,
        reason: `Compte trop récent (minimum ${ms(giveaway.min_account_age_ms, { long: true })}).`,
      }
    }
  }

  if (giveaway.min_join_age_ms > 0) {
    const joinedAt = member.joinedTimestamp || 0
    if (!joinedAt || nowMs - joinedAt < giveaway.min_join_age_ms) {
      return {
        ok: false,
        reason: `Présence serveur insuffisante (minimum ${ms(giveaway.min_join_age_ms, { long: true })}).`,
      }
    }
  }

  return { ok: true }
}

function adjustEntriesCount(db, messageId, delta) {
  if (!delta) return { ok: true }

  const res = safeDbRun(
    db,
    `UPDATE giveaways
     SET entries_count = CASE
       WHEN entries_count + ? < 0 THEN 0
       ELSE entries_count + ?
     END
     WHERE message_id = ?`,
    [delta, delta, messageId]
  )

  if (!res.ok) return res
  return { ok: true }
}

function scheduleGiveawayRefresh(client, messageId, delayMs = GIVEAWAY_REFRESH_DEBOUNCE_MS) {
  if (!client || !messageId) return

  if (!client.__giveawayRefreshQueue) {
    client.__giveawayRefreshQueue = new Map()
  }

  const queue = client.__giveawayRefreshQueue
  if (queue.has(messageId)) return

  const timer = setTimeout(async () => {
    queue.delete(messageId)

    const giveaway = getGiveawayByMessageId(client.db, messageId)
    if (!giveaway) return
    if (giveaway.entry_mode !== 'button') return
    if (giveaway.status !== 'active') return

    await refreshGiveawayMessage(client, giveaway).catch(() => null)
  }, Math.max(250, delayMs))

  if (typeof timer.unref === 'function') timer.unref()
  queue.set(messageId, timer)
}

async function resolveGiveawayMessage(client, giveaway) {
  const guild = client.guilds?.cache?.get(giveaway.guild_id) || null
  const channel = guild?.channels?.cache?.get(giveaway.channel_id)
    || (await client.channels?.fetch?.(giveaway.channel_id).catch(() => null))

  if (!channel?.isTextBased?.()) return null
  const message = await channel.messages.fetch(giveaway.message_id).catch(() => null)
  return message || null
}

async function ensureGiveawayReaction(message, emoji) {
  if (!message?.react) return
  await message.react(emoji).catch(() => null)
}

async function refreshGiveawayMessage(client, giveaway, { round = null } = {}) {
  const message = await resolveGiveawayMessage(client, giveaway)
  if (!message) return { ok: false, reason: 'message_unavailable' }

  const isEnded = giveaway.status === 'ended'
  const isCancelled = giveaway.status === 'cancelled'
  const winnerRound = round ?? (isEnded ? getLatestWinnerRound(client.db, giveaway.message_id) : null)
  const winners = winnerRound == null ? [] : listWinnerIdsByRound(client.db, giveaway.message_id, winnerRound)
  const payouts = winnerRound == null ? [] : listPayoutsByRound(client.db, giveaway.message_id, winnerRound)

  const embed = buildGiveawayEmbed(giveaway, {
    winners,
    payouts,
    cancelled: isCancelled,
  })

  const components = buildGiveawayComponents(giveaway, {
    disabled: isEnded || isCancelled,
  })

  await message.edit({ embeds: [embed], components }).catch(() => null)

  if (!isEnded && !isCancelled && giveaway.entry_mode === 'reaction') {
    await ensureGiveawayReaction(message, giveaway.entry_emoji).catch(() => null)
  }

  return { ok: true, winners, payouts, entriesCount: giveaway.entries_count }
}

export async function createGiveaway(client, payload) {
  if (!client?.db?.prepare) return { ok: false, error: 'database_unavailable' }

  const tables = ensureGiveawayTables(client.db)
  if (!tables.ok) {
    console.error('[giveaway] ensure tables error', tables.error)
    return { ok: false, error: 'database_setup_failed' }
  }

  const channel = payload?.channel
  const guild = payload?.guild
  if (!guild?.id || !channel?.id || !channel.isTextBased?.()) return { ok: false, error: 'invalid_channel' }

  const now = nowSec()
  const durationMs = Math.max(GIVEAWAY_MIN_DURATION_MS, Math.min(payload.durationMs, GIVEAWAY_MAX_DURATION_MS))

  const entryMode = normalizeEntryMode(payload.entryMode)
  const entryEmoji = normalizeEntryEmoji(payload.entryEmoji)
  const forcedWinnerIds = normalizeForcedWinnerIds(payload.forcedWinnerIds)
  const rewardCoins = normalizeRewardCoins(payload.rewardCoins ?? payload.gainCoins, 0)
  const currencyName = normalizeCurrencyName(payload.currencyName)
  const currencyEmoji = normalizeCurrencyEmoji(payload.currencyEmoji)
  const winnersCount = clampWinnersCount(payload.winnersCount, 1)

  if (rewardCoins < MIN_GIVEAWAY_GAIN_COINS) return { ok: false, error: 'invalid_gain' }
  if (rewardCoins < winnersCount) return { ok: false, error: 'gain_lower_than_winners' }

  const giveawayDraft = {
    message_id: '',
    guild_id: guild.id,
    channel_id: channel.id,
    host_id: payload.hostId,
    prize: String(rewardCoins),
    reward_coins: rewardCoins,
    currency_name: currencyName,
    currency_emoji: currencyEmoji,
    winners_count: winnersCount,
    required_role_id: parseRoleId(payload.requiredRoleId || '') || null,
    excluded_role_id: parseRoleId(payload.excludedRoleId || '') || null,
    min_account_age_ms: Math.max(0, toInt(payload.minAccountAgeMs, 0)),
    min_join_age_ms: Math.max(0, toInt(payload.minJoinAgeMs, 0)),
    entry_mode: entryMode,
    entry_emoji: entryEmoji,
    forced_winner_ids: serializeForcedWinners(forcedWinnerIds),
    forcedWinnerIds,
    entries_count: 0,
    status: 'active',
    created_at: now,
    end_at: now + Math.floor(durationMs / 1000),
  }

  const previewEmbed = buildGiveawayEmbed(giveawayDraft, { winners: [] })
  const previewComponents = buildGiveawayComponents(giveawayDraft)
  const sent = await channel.send({ embeds: [previewEmbed], components: previewComponents }).catch(() => null)
  if (!sent) return { ok: false, error: 'send_failed' }

  giveawayDraft.message_id = sent.id

  const insert = safeDbRun(
    client.db,
    `INSERT INTO giveaways (
      message_id, guild_id, channel_id, host_id, prize, reward_coins, currency_name, currency_emoji, winners_count,
      required_role_id, excluded_role_id, min_account_age_ms, min_join_age_ms,
      entry_mode, entry_emoji, forced_winner_ids, entries_count,
      status, created_at, end_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      giveawayDraft.message_id,
      giveawayDraft.guild_id,
      giveawayDraft.channel_id,
      giveawayDraft.host_id,
      giveawayDraft.prize,
      giveawayDraft.reward_coins,
      giveawayDraft.currency_name,
      giveawayDraft.currency_emoji,
      giveawayDraft.winners_count,
      giveawayDraft.required_role_id,
      giveawayDraft.excluded_role_id,
      giveawayDraft.min_account_age_ms,
      giveawayDraft.min_join_age_ms,
      giveawayDraft.entry_mode,
      giveawayDraft.entry_emoji,
      giveawayDraft.forced_winner_ids,
      giveawayDraft.entries_count,
      giveawayDraft.status,
      giveawayDraft.created_at,
      giveawayDraft.end_at,
    ]
  )

  if (!insert.ok) {
    await sent.delete().catch(() => null)
    console.error('[giveaway] insert failed', insert.error)
    return { ok: false, error: 'insert_failed' }
  }

  if (giveawayDraft.entry_mode === 'reaction') {
    await ensureGiveawayReaction(sent, giveawayDraft.entry_emoji).catch(() => null)
  }

  await sent.edit({
    embeds: [buildGiveawayEmbed(giveawayDraft, { winners: [] })],
    components: buildGiveawayComponents(giveawayDraft),
  }).catch(() => null)

  return { ok: true, giveaway: giveawayDraft, message: sent }
}

async function setGiveawayEntry(client, giveaway, member, join) {
  const db = client?.db
  if (!db?.prepare) return { ok: false, reason: 'database_unavailable' }

  if (!giveaway) return { ok: false, reason: 'giveaway_not_found' }
  if (giveaway.status !== 'active') return { ok: false, reason: 'giveaway_not_active' }
  if (giveaway.end_at <= nowSec()) return { ok: false, reason: 'giveaway_expired' }

  const userId = member?.id
  if (!isSnowflake(userId)) return { ok: false, reason: 'member_invalid' }

  if (join) {
    const eligibility = checkEntryEligibility(member, giveaway)
    if (!eligibility.ok) return { ok: false, reason: 'not_eligible', message: eligibility.reason }

    const ins = safeDbRun(
      db,
      'INSERT OR IGNORE INTO giveaway_entries (message_id, guild_id, user_id, joined_at) VALUES (?, ?, ?, ?)',
      [giveaway.message_id, giveaway.guild_id, userId, nowSec()]
    )
    if (!ins.ok) return { ok: false, reason: 'database_error' }

    if (toInt(ins.info?.changes, 0) > 0) {
      const adjusted = adjustEntriesCount(db, giveaway.message_id, +1)
      if (!adjusted.ok) return { ok: false, reason: 'database_error' }
    }

    const entriesCount = countGiveawayEntries(db, giveaway.message_id)
    return { ok: true, joined: true, changed: toInt(ins.info?.changes, 0) > 0, entriesCount }
  }

  const del = safeDbRun(
    db,
    'DELETE FROM giveaway_entries WHERE message_id = ? AND user_id = ?',
    [giveaway.message_id, userId]
  )
  if (!del.ok) return { ok: false, reason: 'database_error' }

  if (toInt(del.info?.changes, 0) > 0) {
    const adjusted = adjustEntriesCount(db, giveaway.message_id, -1)
    if (!adjusted.ok) return { ok: false, reason: 'database_error' }
  }

  const entriesCount = countGiveawayEntries(db, giveaway.message_id)
  return { ok: true, joined: false, changed: toInt(del.info?.changes, 0) > 0, entriesCount }
}

export async function toggleGiveawayEntry(client, giveaway, member) {
  const db = client?.db
  if (!db?.prepare) return { ok: false, reason: 'database_unavailable' }

  const existing = safeDbGet(
    db,
    'SELECT 1 FROM giveaway_entries WHERE message_id = ? AND user_id = ? LIMIT 1',
    [giveaway.message_id, member?.id]
  )
  if (!existing.ok) return { ok: false, reason: 'database_error' }

  const shouldJoin = !existing.row
  return setGiveawayEntry(client, giveaway, member, shouldJoin)
}

function reservoirSampleEntryIds(db, messageId, targetCount, excludedSet) {
  const count = Math.max(0, Math.floor(targetCount))
  if (count <= 0) return []

  const stmt = db.prepare('SELECT user_id FROM giveaway_entries WHERE message_id = ?')
  const reservoir = []
  let seen = 0

  for (const row of stmt.iterate(messageId)) {
    const userId = String(row?.user_id || '')
    if (!isSnowflake(userId)) continue
    if (excludedSet?.has(userId)) continue

    seen += 1
    if (reservoir.length < count) {
      reservoir.push(userId)
      continue
    }

    const j = randomInt(seen)
    if (j < count) {
      reservoir[j] = userId
    }
  }

  return reservoir
}

async function drawAndPersistWinners(client, giveaway, requestedCount, { excludeWinners = false } = {}) {
  const db = client?.db
  if (!db?.prepare) return { ok: false, error: new Error('database_unavailable') }

  const winnerCount = clampWinnersCount(requestedCount, giveaway.winners_count)
  const excluded = new Set()

  if (excludeWinners) {
    for (const previous of listWinnerIds(db, giveaway.message_id)) {
      excluded.add(previous)
    }
  }

  const forcedWinners = normalizeForcedWinnerIds(giveaway.forced_winner_ids)
    .filter((id) => !excluded.has(id))
    .slice(0, winnerCount)

  const selected = [...forcedWinners]
  const remaining = Math.max(0, winnerCount - selected.length)

  const reserved = new Set([...excluded, ...selected])
  if (remaining > 0) {
    const randomPicked = reservoirSampleEntryIds(db, giveaway.message_id, remaining, reserved)
    for (const winnerId of randomPicked) {
      if (reserved.has(winnerId)) continue
      selected.push(winnerId)
      reserved.add(winnerId)
      if (selected.length >= winnerCount) break
    }
  }

  const lastRound = getLatestWinnerRound(db, giveaway.message_id)
  const round = lastRound == null ? 0 : lastRound + 1
  const persist = persistWinnerRound(db, giveaway, selected, round)
  if (!persist.ok) return { ok: false, error: persist.error }

  return {
    ok: true,
    winners: selected,
    payouts: persist.payouts || [],
    round,
    entrantsCount: countGiveawayEntries(db, giveaway.message_id),
  }
}

async function postEndAnnouncement(client, giveaway, winners, payouts = [], { reroll = false } = {}) {
  const message = await resolveGiveawayMessage(client, giveaway)
  const channel = message?.channel
  if (!channel?.isTextBased?.()) return

  const payoutSummary = formatPayoutSummary(giveaway, payouts, { maxRows: 10 })

  const content = winners.length
    ? `${reroll ? '🔁' : '🎉'} Félicitations ${winners.map((id) => `<@${id}>`).join(', ')} !\n`
      + `Gain total: **${formatCoinAmount(giveaway, giveaway.reward_coins)}**\n`
      + (payoutSummary ? `Distribution: ${payoutSummary}` : 'Distribution en attente.')
    : `${reroll ? '🔁' : '🎉'} Giveaway terminé: aucun gagnant.`

  await channel.send({
    content,
    allowedMentions: { users: winners, roles: [], parse: [] },
  }).catch(() => null)
}

export async function endGiveawayByMessageId(client, messageId, endedBy = null, { force = false } = {}) {
  if (!client?.db?.prepare) return { ok: false, reason: 'database_unavailable' }

  const giveaway = getGiveawayByMessageId(client.db, messageId)
  if (!giveaway) return { ok: false, reason: 'not_found' }

  const lockKey = getEndLockKey(giveaway.guild_id, giveaway.message_id)
  if (END_LOCKS.has(lockKey)) return { ok: false, reason: 'locked' }
  END_LOCKS.add(lockKey)

  try {
    if (giveaway.status !== 'active' && !force) {
      return { ok: false, reason: 'already_finished', giveaway }
    }

    const draw = await drawAndPersistWinners(client, giveaway, giveaway.winners_count)
    if (!draw.ok) {
      console.error('[giveaway] draw winners failed', draw.error)
      safeDbRun(
        client.db,
        'UPDATE giveaways SET last_error = ? WHERE message_id = ?',
        [safeTrim(draw.error?.message || String(draw.error), 500), giveaway.message_id]
      )
      return { ok: false, reason: 'draw_failed', giveaway }
    }

    const updated = safeDbRun(
      client.db,
      'UPDATE giveaways SET status = ?, ended_at = ?, ended_by = ?, last_error = NULL WHERE message_id = ?',
      ['ended', nowSec(), safeTrim(endedBy || 'system', 40), giveaway.message_id]
    )

    if (!updated.ok) {
      console.error('[giveaway] update end status failed', updated.error)
      return { ok: false, reason: 'update_failed', giveaway }
    }

    const endedGiveaway = getGiveawayByMessageId(client.db, giveaway.message_id) || {
      ...giveaway,
      status: 'ended',
      ended_by: endedBy || 'system',
      ended_at: nowSec(),
    }

    await refreshGiveawayMessage(client, endedGiveaway, { round: draw.round }).catch(() => null)
    await postEndAnnouncement(client, endedGiveaway, draw.winners, draw.payouts, { reroll: false }).catch(() => null)

    return {
      ok: true,
      giveaway: endedGiveaway,
      winners: draw.winners,
      payouts: draw.payouts,
      entrantsCount: draw.entrantsCount,
      round: draw.round,
    }
  } finally {
    END_LOCKS.delete(lockKey)
  }
}

export async function rerollGiveawayByMessageId(client, messageId, requestedCount = null, byUserId = null) {
  if (!client?.db?.prepare) return { ok: false, reason: 'database_unavailable' }

  const giveaway = getGiveawayByMessageId(client.db, messageId)
  if (!giveaway) return { ok: false, reason: 'not_found' }
  if (giveaway.status !== 'ended') return { ok: false, reason: 'not_ended', giveaway }

  const draw = await drawAndPersistWinners(
    client,
    giveaway,
    requestedCount == null ? giveaway.winners_count : requestedCount,
    { excludeWinners: true }
  )
  if (!draw.ok) return { ok: false, reason: 'draw_failed', giveaway }

  if (byUserId) {
    safeDbRun(
      client.db,
      'UPDATE giveaways SET ended_by = ? WHERE message_id = ?',
      [safeTrim(byUserId, 40), giveaway.message_id]
    )
  }

  const refreshed = getGiveawayByMessageId(client.db, giveaway.message_id) || giveaway
  await refreshGiveawayMessage(client, refreshed, { round: draw.round }).catch(() => null)
  await postEndAnnouncement(client, refreshed, draw.winners, draw.payouts, { reroll: true }).catch(() => null)

  return {
    ok: true,
    giveaway: refreshed,
    winners: draw.winners,
    payouts: draw.payouts,
    entrantsCount: draw.entrantsCount,
    round: draw.round,
  }
}

export async function cancelGiveawayByMessageId(client, messageId, cancelledBy = null) {
  if (!client?.db?.prepare) return { ok: false, reason: 'database_unavailable' }

  const giveaway = getGiveawayByMessageId(client.db, messageId)
  if (!giveaway) return { ok: false, reason: 'not_found' }
  if (giveaway.status !== 'active') return { ok: false, reason: 'not_active', giveaway }

  const res = safeDbRun(
    client.db,
    'UPDATE giveaways SET status = ?, ended_at = ?, ended_by = ? WHERE message_id = ?',
    ['cancelled', nowSec(), safeTrim(cancelledBy || 'system', 40), giveaway.message_id]
  )
  if (!res.ok) return { ok: false, reason: 'update_failed', giveaway }

  const cancelledGiveaway = getGiveawayByMessageId(client.db, giveaway.message_id) || {
    ...giveaway,
    status: 'cancelled',
  }

  await refreshGiveawayMessage(client, cancelledGiveaway).catch(() => null)
  return { ok: true, giveaway: cancelledGiveaway }
}

export function startGiveawayScheduler(client) {
  if (!client?.db?.prepare) return
  if (client.__giveawayScheduler?.started) return

  const ensure = ensureGiveawayTables(client.db)
  if (!ensure.ok) {
    console.error('[giveaway] scheduler ensure table error', ensure.error)
    return
  }

  client.__giveawayScheduler = {
    started: true,
    busy: false,
    interval: null,
    lastTickAt: 0,
  }

  const tick = async () => {
    if (!client.__giveawayScheduler || client.__giveawayScheduler.busy) return
    client.__giveawayScheduler.busy = true
    client.__giveawayScheduler.lastTickAt = Date.now()

    try {
      const due = safeDbAll(
        client.db,
        'SELECT message_id FROM giveaways WHERE status = ? AND end_at <= ? ORDER BY end_at ASC LIMIT 25',
        ['active', nowSec()]
      )

      if (!due.ok) {
        console.error('[giveaway] scheduler due query failed', due.error)
        return
      }

      const ids = (due.rows || []).map((row) => row.message_id).filter(Boolean)
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        await endGiveawayByMessageId(client, id, 'scheduler').catch((error) => {
          console.error('[giveaway] scheduler end failed', { id, error: error?.message || error })
        })
      }
    } finally {
      if (client.__giveawayScheduler) {
        client.__giveawayScheduler.busy = false
      }
    }
  }

  const interval = setInterval(() => {
    tick().catch((error) => console.error('[giveaway] scheduler tick crash', error))
  }, GIVEAWAY_TICK_MS)

  if (typeof interval.unref === 'function') interval.unref()
  client.__giveawayScheduler.interval = interval
  void tick()
}

function parseGiveawayButtonCustomId(customId) {
  const raw = safeTrim(customId, 120)
  if (!raw) return null

  if (raw.startsWith(GIVEAWAY_BUTTON_JOIN_PREFIX)) {
    return { type: 'join', messageId: raw.slice(GIVEAWAY_BUTTON_JOIN_PREFIX.length) }
  }

  if (raw.startsWith(GIVEAWAY_BUTTON_INFO_PREFIX)) {
    return { type: 'info', messageId: raw.slice(GIVEAWAY_BUTTON_INFO_PREFIX.length) }
  }

  return null
}

function interactionReplyPayload(content) {
  return { content, flags: MessageFlags.Ephemeral }
}

export async function handleGiveawayButtonInteraction(client, interaction) {
  if (!interaction?.isButton?.() || !client?.db?.prepare) return false

  const parsed = parseGiveawayButtonCustomId(interaction.customId)
  if (!parsed?.messageId) return false

  ensureGiveawayTables(client.db)
  const giveaway = getGiveawayByMessageId(client.db, parsed.messageId, interaction.guildId || null)

  if (!giveaway) {
    await interaction.reply(interactionReplyPayload('Ce giveaway n’existe plus.')).catch(() => null)
    return true
  }

  if (parsed.type === 'info') {
    const lines = [
      `Gain total: **${formatCoinAmount(giveaway, giveaway.reward_coins)}**`,
      `Etat: **${giveaway.status}**`,
      `Gagnants: **${giveaway.winners_count}**`,
      `Participants: **${giveaway.entries_count}**`,
      `Fin: <t:${giveaway.end_at}:R>`,
      `Mode: **${giveaway.entry_mode === 'reaction' ? 'réaction' : 'bouton'}**`,
    ]

    await interaction
      .reply({
        embeds: [buildEmbed({ variant: 'info', title: 'Infos Giveaway', description: lines.join('\n') })],
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => null)

    return true
  }

  if (giveaway.entry_mode !== 'button') {
    await interaction
      .reply(interactionReplyPayload('Ce giveaway se participe avec une réaction, pas avec le bouton.'))
      .catch(() => null)
    return true
  }

  if (giveaway.status !== 'active') {
    await interaction.reply(interactionReplyPayload('Ce giveaway est déjà terminé.')).catch(() => null)
    return true
  }

  const member = interaction.member || (interaction.guild
    ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
    : null)

  if (!member) {
    await interaction.reply(interactionReplyPayload('Impossible de vérifier votre profil serveur.')).catch(() => null)
    return true
  }

  const toggle = await toggleGiveawayEntry(client, giveaway, member)
  if (!toggle.ok) {
    const reasonMap = {
      giveaway_not_active: 'Giveaway non actif.',
      giveaway_expired: 'Giveaway expiré, résultat imminent.',
      not_eligible: toggle.message || 'Vous ne remplissez pas les conditions.',
      database_error: 'Erreur interne (DB).',
      database_unavailable: 'Service indisponible.',
    }

    await interaction
      .reply(interactionReplyPayload(reasonMap[toggle.reason] || 'Participation impossible.'))
      .catch(() => null)
    return true
  }

  scheduleGiveawayRefresh(client, giveaway.message_id)

  await interaction
    .reply(
      interactionReplyPayload(
        toggle.joined
          ? `Participation enregistrée. Participants: ${toggle.entriesCount}.`
          : `Participation retirée. Participants: ${toggle.entriesCount}.`
      )
    )
    .catch(() => null)

  return true
}

async function resolveReactionPayload(reaction, user) {
  if (!reaction || !user || user.bot) return null

  let safeReaction = reaction
  if (safeReaction.partial) {
    safeReaction = await safeReaction.fetch().catch(() => null)
    if (!safeReaction) return null
  }

  let message = safeReaction.message
  if (!message) return null

  if (message.partial) {
    message = await message.fetch().catch(() => null)
    if (!message) return null
  }

  if (!message.guildId || !message.channelId) return null

  return {
    reaction: safeReaction,
    message,
    user,
  }
}

async function handleGiveawayReactionChange(client, reaction, user, join) {
  if (!client?.db?.prepare) return false

  const payload = await resolveReactionPayload(reaction, user)
  if (!payload) return false

  const giveaway = getGiveawayByMessageId(client.db, payload.message.id, payload.message.guildId)
  if (!giveaway) return false
  if (giveaway.entry_mode !== 'reaction') return false

  const reactionKey = parseEmojiKeyFromReaction(payload.reaction)
  const expectedKey = parseEmojiKeyFromStored(giveaway.entry_emoji)
  if (!reactionKey || reactionKey !== expectedKey) return false

  if (giveaway.status !== 'active') {
    if (join && payload.reaction.users?.remove) {
      await payload.reaction.users.remove(user.id).catch(() => null)
    }
    return true
  }

  const guild = payload.message.guild
  const member = guild?.members?.cache?.get(user.id) || await guild?.members?.fetch?.(user.id).catch(() => null)
  if (!member) return true

  const changed = await setGiveawayEntry(client, giveaway, member, join)
  if (!changed.ok && join && payload.reaction.users?.remove) {
    await payload.reaction.users.remove(user.id).catch(() => null)
  }

  return true
}

export async function handleGiveawayReactionAdd(client, reaction, user) {
  return handleGiveawayReactionChange(client, reaction, user, true)
}

export async function handleGiveawayReactionRemove(client, reaction, user) {
  return handleGiveawayReactionChange(client, reaction, user, false)
}
