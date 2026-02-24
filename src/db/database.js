import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { getRequestContext } from '../utils/requestContext.js'

function nowMs() {
  return Date.now()
}

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

function randomTraceId() {
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

const DEFAULT_SETUP_DRAW_CREDITS = 3
const NAMECOIN_PLACEHOLDER = '__NAMECOIN__'

function resolveConfiguredCoinName(config) {
  const explicit = String(config?.namecoin || '').trim()
  if (explicit) return explicit
  return 'Coins'
}

const DEFAULT_CASINO_SHOP_ITEMS = [
  {
    name: 'Tirages x10',
    category: 'autre',
    price: 30000,
    rewardType: 'draws',
    rewardValue: '10',
    roleId: null,
    emoji: '🎰',
    sortOrder: 10,
  },
  {
    name: 'Pillage x3',
    category: 'autre',
    price: 30000,
    rewardType: 'draws',
    rewardValue: '3',
    roleId: null,
    emoji: '💰',
    sortOrder: 20,
  },
  {
    name: 'XP x100',
    category: 'autre',
    price: 20000,
    rewardType: 'xp',
    rewardValue: '100',
    roleId: null,
    emoji: '🧪',
    sortOrder: 30,
  },
  {
    name: 'Sabotage x1',
    category: 'autre',
    price: 15000,
    rewardType: 'draws',
    rewardValue: '1',
    roleId: null,
    emoji: '⚫',
    sortOrder: 40,
  },
  {
    name: '+snipe',
    category: 'decoratif',
    price: 450000,
    rewardType: 'cosmetic',
    rewardValue: '+snipe',
    roleId: null,
    emoji: '🔫',
    sortOrder: 50,
  },
  {
    name: 'Souverain des ombres',
    category: 'decoratif',
    price: 2000000,
    rewardType: 'cosmetic',
    rewardValue: 'souverain_des_ombres',
    roleId: null,
    emoji: '🌑',
    sortOrder: 60,
  },
]

const DEFAULT_CASINO_DRAW_ITEMS = [
  { name: 'Bleu', category: 'couleur', weight: 15, rewardType: 'cosmetic', rewardValue: 'bleu', emoji: '🔵', sortOrder: 10 },
  { name: 'Jaune', category: 'couleur', weight: 10, rewardType: 'cosmetic', rewardValue: 'jaune', emoji: '🟡', sortOrder: 20 },
  { name: 'Violet', category: 'couleur', weight: 5, rewardType: 'cosmetic', rewardValue: 'violet', emoji: '🟣', sortOrder: 30 },
  { name: 'Argent', category: 'couleur', weight: 1, rewardType: 'cosmetic', rewardValue: 'argent', emoji: '⚪', sortOrder: 40 },
  { name: 'Rouge', category: 'couleur', weight: 0.55, rewardType: 'cosmetic', rewardValue: 'rouge', emoji: '🔴', sortOrder: 50 },
  { name: 'Noir', category: 'couleur', weight: 0.33, rewardType: 'cosmetic', rewardValue: 'noir', emoji: '⚫', sortOrder: 60 },
  { name: 'Blanc', category: 'couleur', weight: 0.1, rewardType: 'cosmetic', rewardValue: 'blanc', emoji: '⚪', sortOrder: 70 },

  { name: 'Démons Errants', category: 'decoratif', weight: 10, rewardType: 'cosmetic', rewardValue: 'demons_errants', emoji: '🧬', sortOrder: 110 },
  { name: 'Marionnettiste', category: 'decoratif', weight: 1, rewardType: 'cosmetic', rewardValue: 'marionnettiste', emoji: '🎭', sortOrder: 120 },
  { name: 'Sabre du Soleil', category: 'decoratif', weight: 0.3, rewardType: 'cosmetic', rewardValue: 'sabre_du_soleil', emoji: '☀️', sortOrder: 130 },
  { name: 'Lune démoniaque', category: 'decoratif', weight: 0.1, rewardType: 'cosmetic', rewardValue: 'lune_demoniaque', emoji: '🌙', sortOrder: 140 },
  { name: 'Pourfendeur', category: 'decoratif', weight: 4, rewardType: 'cosmetic', rewardValue: 'pourfendeur', emoji: '🗡️', sortOrder: 150 },
  { name: 'Marque Maudite', category: 'decoratif', weight: 0.5, rewardType: 'cosmetic', rewardValue: 'marque_maudite', emoji: '☯️', sortOrder: 160 },
  { name: 'Rubis Écarlate', category: 'decoratif', weight: 0.15, rewardType: 'cosmetic', rewardValue: 'rubis_ecarlate', emoji: '🔥', sortOrder: 170 },
  { name: 'Pilier Suprême', category: 'decoratif', weight: 0.05, rewardType: 'cosmetic', rewardValue: 'pilier_supreme', emoji: '❌', sortOrder: 180 },

  { name: 'Insigne Brisé', category: 'badge', weight: 0.25, rewardType: 'cosmetic', rewardValue: 'insigne_brise', emoji: '🛞', sortOrder: 210 },
  { name: 'Corbeau Noir', category: 'badge', weight: 0.1, rewardType: 'cosmetic', rewardValue: 'corbeau_noir', emoji: '🦅', sortOrder: 220 },
  { name: 'Croix Cramoisie', category: 'badge', weight: 0.05, rewardType: 'cosmetic', rewardValue: 'croix_cramoisie', emoji: '❌', sortOrder: 230 },

  { name: NAMECOIN_PLACEHOLDER, category: 'autre', weight: 20, rewardType: 'coins', rewardValue: '420', emoji: '🪙', sortOrder: 310 },
  { name: 'Rien', category: 'autre', weight: 15, rewardType: 'none', rewardValue: '0', emoji: '🚫', sortOrder: 320 },
  { name: 'Pillage x1', category: 'autre', weight: 5, rewardType: 'draws', rewardValue: '1', emoji: '💰', sortOrder: 330 },
  { name: 'Tirages x5', category: 'autre', weight: 4, rewardType: 'draws', rewardValue: '5', emoji: '🎰', sortOrder: 340 },
  { name: 'Sabotage x1', category: 'autre', weight: 2, rewardType: 'draws', rewardValue: '1', emoji: '⚫', sortOrder: 350 },
  { name: 'XP x50', category: 'autre', weight: 5, rewardType: 'xp', rewardValue: '50', emoji: '🧪', sortOrder: 360 },
  { name: 'Nitro Boost', category: 'autre', weight: 0.001, rewardType: 'cosmetic', rewardValue: 'nitro_boost', emoji: '⚡', sortOrder: 370 },
  { name: 'Blossom', category: 'autre', weight: 0.02, rewardType: 'cosmetic', rewardValue: 'blossom', emoji: '🌸', sortOrder: 380 },
]

export class DataStore {
  constructor(db, config) {
    this.db = db
    this.config = config
    this.statements = new Map()
    this.groupRoleCache = new Map()
    this.profileCache = new Map()
    this.setupMessageCache = new Map()
  }

  stmt(key, sql) {
    const existing = this.statements.get(key)
    if (existing) return existing
    const prepared = this.db.prepare(sql)
    this.statements.set(key, prepared)
    return prepared
  }

  invalidateGroupRoleCache(guildId) {
    this.groupRoleCache.delete(guildId)
  }

  normalizeLogType(logType) {
    const safe = String(logType || '').trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '')
    if (!safe) return null
    return safe.slice(0, 40)
  }

  resolveAuditContext(meta = {}) {
    const ctx = getRequestContext() || {}
    return {
      actorId: meta.actorId ?? ctx.actorId ?? null,
      commandName: meta.commandName ?? ctx.commandName ?? null,
      channelId: meta.channelId ?? ctx.channelId ?? null,
      messageId: meta.messageId ?? ctx.messageId ?? null,
    }
  }

  ensureUser(guildId, userId) {
    this.stmt(
      'ensureUser',
      `INSERT OR IGNORE INTO users (guild_id, user_id, coins, xp_flasks, updated_at)
       VALUES (?, ?, 0, 0, ?)`
    ).run(guildId, userId, nowSec())
  }

  getUser(guildId, userId) {
    this.ensureUser(guildId, userId)
    return this.stmt('getUser', 'SELECT guild_id, user_id, coins, xp_flasks FROM users WHERE guild_id = ? AND user_id = ?')
      .get(guildId, userId)
  }

  listGuildUsersWithProfile(guildId, { minCoins = null } = {}) {
    const safeMinCoins = Number.parseInt(minCoins, 10)
    if (Number.isInteger(safeMinCoins) && safeMinCoins > 0) {
      return this.stmt(
        'listGuildUsersWithProfileMinCoins',
        `SELECT u.guild_id, u.user_id, u.coins, u.xp_flasks
         FROM users u
         INNER JOIN profiles p ON p.user_id = u.user_id
         WHERE u.guild_id = ? AND u.coins >= ?
         ORDER BY u.coins DESC, u.user_id ASC`
      ).all(guildId, safeMinCoins)
    }

    return this.stmt(
      'listGuildUsersWithProfile',
      `SELECT u.guild_id, u.user_id, u.coins, u.xp_flasks
       FROM users u
       INNER JOIN profiles p ON p.user_id = u.user_id
       WHERE u.guild_id = ?
       ORDER BY u.coins DESC, u.user_id ASC`
    ).all(guildId)
  }

  addBalance(guildId, userId, { coinsDelta = 0, xpDelta = 0 } = {}, meta = {}) {
    const askedCoinsDelta = Number.parseInt(coinsDelta, 10) || 0
    const askedXpDelta = Number.parseInt(xpDelta, 10) || 0
    const context = this.resolveAuditContext(meta)

    const tx = this.db.transaction(() => {
      this.ensureUser(guildId, userId)
      const before = this.getUser(guildId, userId)

      this.stmt(
        'addBalance',
        `UPDATE users
         SET coins = CASE WHEN coins + ? < 0 THEN 0 ELSE coins + ? END,
             xp_flasks = CASE WHEN xp_flasks + ? < 0 THEN 0 ELSE xp_flasks + ? END,
             updated_at = ?
         WHERE guild_id = ? AND user_id = ?`
      ).run(askedCoinsDelta, askedCoinsDelta, askedXpDelta, askedXpDelta, nowSec(), guildId, userId)

      const after = this.getUser(guildId, userId)
      const actualCoinsDelta = (Number.parseInt(after?.coins, 10) || 0) - (Number.parseInt(before?.coins, 10) || 0)
      const actualXpDelta = (Number.parseInt(after?.xp_flasks, 10) || 0) - (Number.parseInt(before?.xp_flasks, 10) || 0)
      const shouldLog = Boolean(meta?.forceLog) || actualCoinsDelta !== 0 || actualXpDelta !== 0

      if (shouldLog) {
        this.addEconomyTransaction({
          guildId,
          userId,
          actorId: context.actorId || userId,
          source: meta?.source || (context.commandName ? `cmd:${context.commandName}` : 'system'),
          reason: meta?.reason || null,
          commandName: context.commandName,
          channelId: context.channelId,
          messageId: context.messageId,
          coinsBefore: Number.parseInt(before?.coins, 10) || 0,
          coinsDelta: actualCoinsDelta,
          coinsAfter: Number.parseInt(after?.coins, 10) || 0,
          xpBefore: Number.parseInt(before?.xp_flasks, 10) || 0,
          xpDelta: actualXpDelta,
          xpAfter: Number.parseInt(after?.xp_flasks, 10) || 0,
          traceId: meta?.traceId || randomTraceId(),
          metadata: meta?.metadata || null,
        })
      }

      return after
    })

    return tx()
  }

  transferCoins(guildId, fromUserId, toUserId, amount, meta = {}) {
    const context = this.resolveAuditContext(meta)
    const safeTraceId = meta?.traceId || randomTraceId()

    const tx = this.db.transaction(() => {
      const safeAmount = Math.max(0, Number.parseInt(amount, 10) || 0)
      if (!safeAmount) return { ok: false, reason: 'invalid_amount' }

      this.ensureUser(guildId, fromUserId)
      this.ensureUser(guildId, toUserId)

      const fromBefore = this.getUser(guildId, fromUserId)
      const toBefore = this.getUser(guildId, toUserId)
      if (!fromBefore || fromBefore.coins < safeAmount) return { ok: false, reason: 'insufficient_funds' }

      this.stmt(
        'transferDebit',
        'UPDATE users SET coins = coins - ?, updated_at = ? WHERE guild_id = ? AND user_id = ?'
      ).run(safeAmount, nowSec(), guildId, fromUserId)

      this.stmt(
        'transferCredit',
        'UPDATE users SET coins = coins + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?'
      ).run(safeAmount, nowSec(), guildId, toUserId)

      const fromAfter = this.getUser(guildId, fromUserId)
      const toAfter = this.getUser(guildId, toUserId)

      this.addEconomyTransaction({
        guildId,
        userId: fromUserId,
        actorId: context.actorId || fromUserId,
        source: meta?.source || (context.commandName ? `cmd:${context.commandName}` : 'transfer'),
        reason: meta?.reason || `Transfert vers ${toUserId}`,
        commandName: context.commandName,
        channelId: context.channelId,
        messageId: context.messageId,
        coinsBefore: Number.parseInt(fromBefore?.coins, 10) || 0,
        coinsDelta: -safeAmount,
        coinsAfter: Number.parseInt(fromAfter?.coins, 10) || 0,
        xpBefore: Number.parseInt(fromBefore?.xp_flasks, 10) || 0,
        xpDelta: 0,
        xpAfter: Number.parseInt(fromAfter?.xp_flasks, 10) || 0,
        traceId: safeTraceId,
        metadata: meta?.metadata || { transferTo: toUserId },
      })

      this.addEconomyTransaction({
        guildId,
        userId: toUserId,
        actorId: context.actorId || fromUserId,
        source: meta?.source || (context.commandName ? `cmd:${context.commandName}` : 'transfer'),
        reason: meta?.reason || `Transfert depuis ${fromUserId}`,
        commandName: context.commandName,
        channelId: context.channelId,
        messageId: context.messageId,
        coinsBefore: Number.parseInt(toBefore?.coins, 10) || 0,
        coinsDelta: safeAmount,
        coinsAfter: Number.parseInt(toAfter?.coins, 10) || 0,
        xpBefore: Number.parseInt(toBefore?.xp_flasks, 10) || 0,
        xpDelta: 0,
        xpAfter: Number.parseInt(toAfter?.xp_flasks, 10) || 0,
        traceId: safeTraceId,
        metadata: meta?.metadata || { transferFrom: fromUserId },
      })

      return {
        ok: true,
        from: fromAfter,
        to: toAfter,
      }
    })

    return tx()
  }

  hasProfile(userId) {
    const safeUserId = String(userId || '')
    if (!safeUserId) return false

    if (this.profileCache.has(safeUserId)) {
      return this.profileCache.get(safeUserId)
    }

    const row = this.stmt('hasProfile', 'SELECT 1 FROM profiles WHERE user_id = ? LIMIT 1').get(safeUserId)
    const exists = Boolean(row)
    this.profileCache.set(safeUserId, exists)

    if (this.profileCache.size > 200_000) {
      this.profileCache.clear()
    }

    return exists
  }

  createProfile(userId) {
    const safeUserId = String(userId || '')
    if (!safeUserId) return false

    this.stmt('createProfile', 'INSERT OR IGNORE INTO profiles (user_id, created_at) VALUES (?, ?)').run(safeUserId, nowSec())
    this.profileCache.set(safeUserId, true)
    return true
  }

  setSetupMessage(guildId, channelId, messageId) {
    this.stmt(
      'setSetupMessage',
      `INSERT INTO guild_setup (guild_id, channel_id, message_id, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id)
       DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id, created_at = excluded.created_at`
    ).run(guildId, channelId, messageId, nowSec())
    this.setupMessageCache.set(String(guildId), {
      guild_id: String(guildId),
      channel_id: String(channelId),
      message_id: String(messageId),
    })
  }

  getSetupMessage(guildId) {
    const key = String(guildId || '')
    if (!key) return null
    const cached = this.setupMessageCache.get(key)
    if (cached) return cached

    const row = this.stmt('getSetupMessage', 'SELECT * FROM guild_setup WHERE guild_id = ?').get(guildId)
    if (row) this.setupMessageCache.set(key, row)
    return row || null
  }

  ensureCasinoProfile(guildId, userId) {
    const defaultDrawCredits = Math.max(0, Number.parseInt(this.config?.setup?.defaultDrawCredits, 10) || DEFAULT_SETUP_DRAW_CREDITS)
    this.stmt(
      'ensureCasinoProfile',
      `INSERT OR IGNORE INTO casino_setup_profiles (guild_id, user_id, draw_credits, draws_done, voice_minutes, created_at, updated_at)
       VALUES (?, ?, ?, 0, 0, ?, ?)`
    ).run(guildId, userId, defaultDrawCredits, nowSec(), nowSec())
  }

  getCasinoProfile(guildId, userId) {
    this.ensureCasinoProfile(guildId, userId)
    return this.stmt(
      'getCasinoProfile',
      `SELECT guild_id, user_id, draw_credits, draws_done, voice_minutes, created_at, updated_at
       FROM casino_setup_profiles
       WHERE guild_id = ? AND user_id = ?`
    ).get(guildId, userId)
  }

  addCasinoDrawCredits(guildId, userId, delta) {
    const safeDelta = Number.parseInt(delta, 10) || 0
    const tx = this.db.transaction(() => {
      this.ensureCasinoProfile(guildId, userId)
      this.stmt(
        'addCasinoDrawCredits',
        `UPDATE casino_setup_profiles
         SET draw_credits = CASE WHEN draw_credits + ? < 0 THEN 0 ELSE draw_credits + ? END,
             updated_at = ?
         WHERE guild_id = ? AND user_id = ?`
      ).run(safeDelta, safeDelta, nowSec(), guildId, userId)
      return this.getCasinoProfile(guildId, userId)
    })
    return tx()
  }

  consumeCasinoDrawCredits(guildId, userId, amount) {
    const safeAmount = Math.max(1, Number.parseInt(amount, 10) || 1)
    const tx = this.db.transaction(() => {
      const profile = this.getCasinoProfile(guildId, userId)
      if (!profile || profile.draw_credits < safeAmount) {
        return { ok: false, reason: 'not_enough_credits', profile }
      }

      this.stmt(
        'consumeCasinoDrawCredits',
        `UPDATE casino_setup_profiles
         SET draw_credits = draw_credits - ?,
             draws_done = draws_done + ?,
             updated_at = ?
         WHERE guild_id = ? AND user_id = ?`
      ).run(safeAmount, safeAmount, nowSec(), guildId, userId)

      return {
        ok: true,
        profile: this.getCasinoProfile(guildId, userId),
      }
    })
    return tx()
  }

  addCasinoVoiceMinutes(guildId, userId, deltaMinutes) {
    const safeDelta = Number.parseInt(deltaMinutes, 10) || 0
    const tx = this.db.transaction(() => {
      this.ensureCasinoProfile(guildId, userId)
      this.stmt(
        'addCasinoVoiceMinutes',
        `UPDATE casino_setup_profiles
         SET voice_minutes = CASE WHEN voice_minutes + ? < 0 THEN 0 ELSE voice_minutes + ? END,
             updated_at = ?
         WHERE guild_id = ? AND user_id = ?`
      ).run(safeDelta, safeDelta, nowSec(), guildId, userId)
      return this.getCasinoProfile(guildId, userId)
    })
    return tx()
  }

  listCasinoShopItems(guildId, { enabledOnly = false } = {}) {
    if (enabledOnly) {
      return this.stmt(
        'listCasinoShopItemsEnabled',
        `SELECT * FROM casino_shop_items
         WHERE guild_id = ? AND enabled = 1
         ORDER BY sort_order ASC, id ASC`
      ).all(guildId)
    }

    return this.stmt(
      'listCasinoShopItemsAll',
      `SELECT * FROM casino_shop_items
       WHERE guild_id = ?
       ORDER BY enabled DESC, sort_order ASC, id ASC`
    ).all(guildId)
  }

  getCasinoShopItem(guildId, itemId) {
    const safeId = Number.parseInt(itemId, 10) || 0
    if (safeId <= 0) return null
    return this.stmt(
      'getCasinoShopItem',
      'SELECT * FROM casino_shop_items WHERE guild_id = ? AND id = ?'
    ).get(guildId, safeId) || null
  }

  addCasinoShopItem(guildId, data = {}, createdBy = 'system') {
    const name = String(data.name || '').trim().slice(0, 100)
    if (!name) return { ok: false, reason: 'invalid_name' }

    const category = String(data.category || 'autre').trim().toLowerCase().slice(0, 30) || 'autre'
    const price = Math.max(0, Number.parseInt(data.price, 10) || 0)
    const rewardType = String(data.rewardType || 'cosmetic').trim().toLowerCase().slice(0, 30) || 'cosmetic'
    const rewardValue = String(data.rewardValue ?? '').trim().slice(0, 200)
    const roleId = data.roleId ? String(data.roleId).trim().slice(0, 30) : null
    const emoji = data.emoji ? String(data.emoji).trim().slice(0, 30) : null
    const sortOrder = Math.max(0, Number.parseInt(data.sortOrder, 10) || 100)
    const enabled = data.enabled == null ? 1 : (data.enabled ? 1 : 0)

    const info = this.stmt(
      'addCasinoShopItem',
      `INSERT INTO casino_shop_items
       (guild_id, name, category, price, reward_type, reward_value, role_id, emoji, enabled, sort_order, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(guildId, name, category, price, rewardType, rewardValue || null, roleId, emoji, enabled, sortOrder, createdBy, nowSec(), nowSec())

    const id = Number(info.lastInsertRowid)
    return { ok: true, item: this.getCasinoShopItem(guildId, id) }
  }

  updateCasinoShopItem(guildId, itemId, patch = {}) {
    const current = this.getCasinoShopItem(guildId, itemId)
    if (!current) return { ok: false, reason: 'not_found' }

    const next = {
      name: patch.name == null ? current.name : String(patch.name).trim().slice(0, 100),
      category: patch.category == null ? current.category : String(patch.category).trim().toLowerCase().slice(0, 30),
      price: patch.price == null ? current.price : Math.max(0, Number.parseInt(patch.price, 10) || 0),
      rewardType: patch.rewardType == null ? current.reward_type : String(patch.rewardType).trim().toLowerCase().slice(0, 30),
      rewardValue: patch.rewardValue == null ? current.reward_value : String(patch.rewardValue).trim().slice(0, 200),
      roleId: patch.roleId === undefined ? current.role_id : (patch.roleId ? String(patch.roleId).trim().slice(0, 30) : null),
      emoji: patch.emoji === undefined ? current.emoji : (patch.emoji ? String(patch.emoji).trim().slice(0, 30) : null),
      enabled: patch.enabled == null ? current.enabled : (patch.enabled ? 1 : 0),
      sortOrder: patch.sortOrder == null ? current.sort_order : Math.max(0, Number.parseInt(patch.sortOrder, 10) || 0),
    }

    if (!next.name) return { ok: false, reason: 'invalid_name' }

    this.stmt(
      'updateCasinoShopItem',
      `UPDATE casino_shop_items
       SET name = ?, category = ?, price = ?, reward_type = ?, reward_value = ?, role_id = ?, emoji = ?, enabled = ?, sort_order = ?, updated_at = ?
       WHERE guild_id = ? AND id = ?`
    ).run(
      next.name,
      next.category || 'autre',
      next.price,
      next.rewardType || 'cosmetic',
      next.rewardValue || null,
      next.roleId,
      next.emoji,
      next.enabled,
      next.sortOrder,
      nowSec(),
      guildId,
      Number.parseInt(itemId, 10)
    )

    return { ok: true, item: this.getCasinoShopItem(guildId, itemId) }
  }

  removeCasinoShopItem(guildId, itemId) {
    const safeId = Number.parseInt(itemId, 10) || 0
    if (safeId <= 0) return false

    const tx = this.db.transaction(() => {
      this.stmt('removeCasinoShopEquips', 'DELETE FROM casino_equips WHERE guild_id = ? AND source_type = ? AND source_id = ?')
        .run(guildId, 'shop', safeId)
      this.stmt('removeCasinoShopInventory', 'DELETE FROM casino_inventory WHERE guild_id = ? AND source_type = ? AND source_id = ?')
        .run(guildId, 'shop', safeId)
      const info = this.stmt('removeCasinoShopItem', 'DELETE FROM casino_shop_items WHERE guild_id = ? AND id = ?').run(guildId, safeId)
      return info.changes > 0
    })

    return tx()
  }

  listCasinoDrawItems(guildId, { enabledOnly = false } = {}) {
    if (enabledOnly) {
      return this.stmt(
        'listCasinoDrawItemsEnabled',
        `SELECT * FROM casino_draw_items
         WHERE guild_id = ? AND enabled = 1
         ORDER BY sort_order ASC, id ASC`
      ).all(guildId)
    }

    return this.stmt(
      'listCasinoDrawItemsAll',
      `SELECT * FROM casino_draw_items
       WHERE guild_id = ?
       ORDER BY enabled DESC, sort_order ASC, id ASC`
    ).all(guildId)
  }

  getCasinoDrawItem(guildId, drawId) {
    const safeId = Number.parseInt(drawId, 10) || 0
    if (safeId <= 0) return null
    return this.stmt(
      'getCasinoDrawItem',
      'SELECT * FROM casino_draw_items WHERE guild_id = ? AND id = ?'
    ).get(guildId, safeId) || null
  }

  addCasinoDrawItem(guildId, data = {}, createdBy = 'system') {
    const name = String(data.name || '').trim().slice(0, 100)
    if (!name) return { ok: false, reason: 'invalid_name' }

    const category = String(data.category || 'autre').trim().toLowerCase().slice(0, 30) || 'autre'
    const weight = Math.max(0.000001, Number.parseFloat(data.weight) || 1)
    const rewardType = String(data.rewardType || 'coins').trim().toLowerCase().slice(0, 30) || 'coins'
    const rewardValue = String(data.rewardValue ?? '').trim().slice(0, 200)
    const roleId = data.roleId ? String(data.roleId).trim().slice(0, 30) : null
    const emoji = data.emoji ? String(data.emoji).trim().slice(0, 30) : null
    const sortOrder = Math.max(0, Number.parseInt(data.sortOrder, 10) || 100)
    const enabled = data.enabled == null ? 1 : (data.enabled ? 1 : 0)

    const info = this.stmt(
      'addCasinoDrawItem',
      `INSERT INTO casino_draw_items
       (guild_id, name, category, weight, reward_type, reward_value, role_id, emoji, enabled, sort_order, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(guildId, name, category, weight, rewardType, rewardValue || null, roleId, emoji, enabled, sortOrder, createdBy, nowSec(), nowSec())

    const id = Number(info.lastInsertRowid)
    return { ok: true, item: this.getCasinoDrawItem(guildId, id) }
  }

  updateCasinoDrawItem(guildId, drawId, patch = {}) {
    const current = this.getCasinoDrawItem(guildId, drawId)
    if (!current) return { ok: false, reason: 'not_found' }

    const next = {
      name: patch.name == null ? current.name : String(patch.name).trim().slice(0, 100),
      category: patch.category == null ? current.category : String(patch.category).trim().toLowerCase().slice(0, 30),
      weight: patch.weight == null ? current.weight : Math.max(0.000001, Number.parseFloat(patch.weight) || 1),
      rewardType: patch.rewardType == null ? current.reward_type : String(patch.rewardType).trim().toLowerCase().slice(0, 30),
      rewardValue: patch.rewardValue == null ? current.reward_value : String(patch.rewardValue).trim().slice(0, 200),
      roleId: patch.roleId === undefined ? current.role_id : (patch.roleId ? String(patch.roleId).trim().slice(0, 30) : null),
      emoji: patch.emoji === undefined ? current.emoji : (patch.emoji ? String(patch.emoji).trim().slice(0, 30) : null),
      enabled: patch.enabled == null ? current.enabled : (patch.enabled ? 1 : 0),
      sortOrder: patch.sortOrder == null ? current.sort_order : Math.max(0, Number.parseInt(patch.sortOrder, 10) || 0),
    }

    if (!next.name) return { ok: false, reason: 'invalid_name' }

    this.stmt(
      'updateCasinoDrawItem',
      `UPDATE casino_draw_items
       SET name = ?, category = ?, weight = ?, reward_type = ?, reward_value = ?, role_id = ?, emoji = ?, enabled = ?, sort_order = ?, updated_at = ?
       WHERE guild_id = ? AND id = ?`
    ).run(
      next.name,
      next.category || 'autre',
      next.weight,
      next.rewardType || 'coins',
      next.rewardValue || null,
      next.roleId,
      next.emoji,
      next.enabled,
      next.sortOrder,
      nowSec(),
      guildId,
      Number.parseInt(drawId, 10)
    )

    return { ok: true, item: this.getCasinoDrawItem(guildId, drawId) }
  }

  removeCasinoDrawItem(guildId, drawId) {
    const safeId = Number.parseInt(drawId, 10) || 0
    if (safeId <= 0) return false

    const tx = this.db.transaction(() => {
      this.stmt('removeCasinoDrawEquips', 'DELETE FROM casino_equips WHERE guild_id = ? AND source_type = ? AND source_id = ?')
        .run(guildId, 'draw', safeId)
      this.stmt('removeCasinoDrawInventory', 'DELETE FROM casino_inventory WHERE guild_id = ? AND source_type = ? AND source_id = ?')
        .run(guildId, 'draw', safeId)
      const info = this.stmt('removeCasinoDrawItem', 'DELETE FROM casino_draw_items WHERE guild_id = ? AND id = ?').run(guildId, safeId)
      return info.changes > 0
    })

    return tx()
  }

  addCasinoInventoryItem(guildId, userId, sourceType, sourceId, quantity = 1) {
    const safeType = String(sourceType || '').trim().toLowerCase()
    const safeId = Number.parseInt(sourceId, 10) || 0
    const safeQty = Math.max(1, Number.parseInt(quantity, 10) || 1)
    if (!['shop', 'draw'].includes(safeType) || safeId <= 0) return null

    this.stmt(
      'addCasinoInventoryItem',
      `INSERT INTO casino_inventory (guild_id, user_id, source_type, source_id, quantity, acquired_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, user_id, source_type, source_id)
       DO UPDATE SET quantity = casino_inventory.quantity + excluded.quantity, updated_at = excluded.updated_at`
    ).run(guildId, userId, safeType, safeId, safeQty, nowSec(), nowSec())

    return this.stmt(
      'getCasinoInventoryItem',
      `SELECT *
       FROM casino_inventory
       WHERE guild_id = ? AND user_id = ? AND source_type = ? AND source_id = ?`
    ).get(guildId, userId, safeType, safeId) || null
  }

  hasCasinoInventoryItem(guildId, userId, sourceType, sourceId) {
    const safeType = String(sourceType || '').trim().toLowerCase()
    const safeId = Number.parseInt(sourceId, 10) || 0
    if (!['shop', 'draw'].includes(safeType) || safeId <= 0) return false
    const row = this.stmt(
      'hasCasinoInventoryItem',
      `SELECT quantity
       FROM casino_inventory
       WHERE guild_id = ? AND user_id = ? AND source_type = ? AND source_id = ? AND quantity > 0
       LIMIT 1`
    ).get(guildId, userId, safeType, safeId)
    return Boolean(row)
  }

  listCasinoInventory(guildId, userId) {
    return this.stmt(
      'listCasinoInventory',
      `SELECT
         i.guild_id, i.user_id, i.source_type, i.source_id, i.quantity,
         COALESCE(s.name, d.name) AS item_name,
         COALESCE(s.category, d.category, 'autre') AS item_category,
         COALESCE(s.role_id, d.role_id) AS role_id,
         COALESCE(s.emoji, d.emoji) AS emoji
       FROM casino_inventory i
       LEFT JOIN casino_shop_items s
         ON i.source_type = 'shop' AND s.guild_id = i.guild_id AND s.id = i.source_id
       LEFT JOIN casino_draw_items d
         ON i.source_type = 'draw' AND d.guild_id = i.guild_id AND d.id = i.source_id
       WHERE i.guild_id = ? AND i.user_id = ? AND i.quantity > 0
       ORDER BY item_category ASC, item_name ASC, i.source_type ASC, i.source_id ASC`
    ).all(guildId, userId)
  }

  getCasinoInventoryItemDetails(guildId, userId, sourceType, sourceId) {
    const safeType = String(sourceType || '').trim().toLowerCase()
    const safeId = Number.parseInt(sourceId, 10) || 0
    if (!['shop', 'draw'].includes(safeType) || safeId <= 0) return null

    return this.stmt(
      'getCasinoInventoryItemDetails',
      `SELECT
         i.guild_id, i.user_id, i.source_type, i.source_id, i.quantity,
         COALESCE(s.name, d.name) AS item_name,
         COALESCE(s.category, d.category, 'autre') AS item_category,
         COALESCE(s.role_id, d.role_id) AS role_id,
         COALESCE(s.emoji, d.emoji) AS emoji
       FROM casino_inventory i
       LEFT JOIN casino_shop_items s
         ON i.source_type = 'shop' AND s.guild_id = i.guild_id AND s.id = i.source_id
       LEFT JOIN casino_draw_items d
         ON i.source_type = 'draw' AND d.guild_id = i.guild_id AND d.id = i.source_id
       WHERE i.guild_id = ? AND i.user_id = ? AND i.source_type = ? AND i.source_id = ? AND i.quantity > 0
       LIMIT 1`
    ).get(guildId, userId, safeType, safeId) || null
  }

  setCasinoEquip(guildId, userId, slot, sourceType, sourceId) {
    const safeSlot = String(slot || '').trim().toLowerCase().slice(0, 32)
    const safeType = String(sourceType || '').trim().toLowerCase()
    const safeId = Number.parseInt(sourceId, 10) || 0
    if (!safeSlot || !['shop', 'draw'].includes(safeType) || safeId <= 0) {
      return { ok: false, reason: 'invalid_input' }
    }

    const tx = this.db.transaction(() => {
      if (!this.hasCasinoInventoryItem(guildId, userId, safeType, safeId)) {
        return { ok: false, reason: 'not_owned' }
      }

      this.stmt(
        'setCasinoEquip',
        `INSERT INTO casino_equips (guild_id, user_id, slot, source_type, source_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id, slot)
         DO UPDATE SET source_type = excluded.source_type, source_id = excluded.source_id, updated_at = excluded.updated_at`
      ).run(guildId, userId, safeSlot, safeType, safeId, nowSec())

      return { ok: true, equip: this.getCasinoEquip(guildId, userId, safeSlot) }
    })

    return tx()
  }

  clearCasinoEquip(guildId, userId, slot) {
    const safeSlot = String(slot || '').trim().toLowerCase().slice(0, 32)
    if (!safeSlot) return false
    const info = this.stmt(
      'clearCasinoEquip',
      'DELETE FROM casino_equips WHERE guild_id = ? AND user_id = ? AND slot = ?'
    ).run(guildId, userId, safeSlot)
    return info.changes > 0
  }

  getCasinoEquip(guildId, userId, slot) {
    const safeSlot = String(slot || '').trim().toLowerCase().slice(0, 32)
    if (!safeSlot) return null
    return this.stmt(
      'getCasinoEquip',
      `SELECT
         e.guild_id, e.user_id, e.slot, e.source_type, e.source_id, e.updated_at,
         COALESCE(s.name, d.name) AS item_name,
         COALESCE(s.category, d.category, 'autre') AS item_category,
         COALESCE(s.role_id, d.role_id) AS role_id,
         COALESCE(s.emoji, d.emoji) AS emoji
       FROM casino_equips e
       LEFT JOIN casino_shop_items s
         ON e.source_type = 'shop' AND s.guild_id = e.guild_id AND s.id = e.source_id
       LEFT JOIN casino_draw_items d
         ON e.source_type = 'draw' AND d.guild_id = e.guild_id AND d.id = e.source_id
       WHERE e.guild_id = ? AND e.user_id = ? AND e.slot = ?
       LIMIT 1`
    ).get(guildId, userId, safeSlot) || null
  }

  listCasinoEquips(guildId, userId) {
    return this.stmt(
      'listCasinoEquips',
      `SELECT
         e.guild_id, e.user_id, e.slot, e.source_type, e.source_id, e.updated_at,
         COALESCE(s.name, d.name) AS item_name,
         COALESCE(s.category, d.category, 'autre') AS item_category,
         COALESCE(s.role_id, d.role_id) AS role_id,
         COALESCE(s.emoji, d.emoji) AS emoji
       FROM casino_equips e
       LEFT JOIN casino_shop_items s
         ON e.source_type = 'shop' AND s.guild_id = e.guild_id AND s.id = e.source_id
       LEFT JOIN casino_draw_items d
         ON e.source_type = 'draw' AND d.guild_id = e.guild_id AND d.id = e.source_id
       WHERE e.guild_id = ? AND e.user_id = ?
       ORDER BY e.slot ASC`
    ).all(guildId, userId)
  }

  seedCasinoSetupDefaults(guildId, authorId = 'system') {
    const tx = this.db.transaction(() => {
      const shopCount = this.stmt(
        'countCasinoShopItems',
        'SELECT COUNT(*) AS n FROM casino_shop_items WHERE guild_id = ?'
      ).get(guildId)?.n || 0

      if (shopCount === 0) {
        const insertShop = this.stmt(
          'seedCasinoShopItem',
          `INSERT INTO casino_shop_items
           (guild_id, name, category, price, reward_type, reward_value, role_id, emoji, enabled, sort_order, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
        )

        for (const item of DEFAULT_CASINO_SHOP_ITEMS) {
          insertShop.run(
            guildId,
            item.name,
            item.category,
            item.price,
            item.rewardType,
            item.rewardValue,
            item.roleId,
            item.emoji,
            item.sortOrder,
            authorId,
            nowSec(),
            nowSec()
          )
        }
      }

      const drawCount = this.stmt(
        'countCasinoDrawItems',
        'SELECT COUNT(*) AS n FROM casino_draw_items WHERE guild_id = ?'
      ).get(guildId)?.n || 0

      if (drawCount === 0) {
        const insertDraw = this.stmt(
          'seedCasinoDrawItem',
          `INSERT INTO casino_draw_items
           (guild_id, name, category, weight, reward_type, reward_value, role_id, emoji, enabled, sort_order, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, ?, ?)`
        )

        for (const item of DEFAULT_CASINO_DRAW_ITEMS) {
          const drawItemName = item.name === NAMECOIN_PLACEHOLDER
            ? resolveConfiguredCoinName(this.config)
            : item.name

          insertDraw.run(
            guildId,
            drawItemName,
            item.category,
            item.weight,
            item.rewardType,
            item.rewardValue,
            item.emoji,
            item.sortOrder,
            authorId,
            nowSec(),
            nowSec()
          )
        }
      }
    })

    tx()
  }

  isOwner(userId) {
    const row = this.stmt('isOwner', 'SELECT 1 FROM owners WHERE user_id = ? LIMIT 1').get(userId)
    return Boolean(row)
  }

  addOwner(userId, addedBy) {
    this.stmt(
      'addOwner',
      'INSERT OR IGNORE INTO owners (user_id, added_by, added_at) VALUES (?, ?, ?)'
    ).run(userId, addedBy, nowSec())
    return this.isOwner(userId)
  }

  removeOwner(userId) {
    const info = this.stmt('removeOwner', 'DELETE FROM owners WHERE user_id = ?').run(userId)
    return info.changes > 0
  }

  listOwners() {
    return this.stmt('listOwners', 'SELECT * FROM owners ORDER BY added_at DESC').all()
  }

  setGroupRole(guildId, groupNumber, roleId) {
    const maxRoles = this.config?.groups?.maxRolesPerGroup || 3
    const count = this.stmt(
      'countGroupRoles',
      'SELECT COUNT(*) AS n FROM group_roles WHERE guild_id = ? AND group_number = ?'
    ).get(guildId, groupNumber)?.n || 0

    const exists = this.stmt(
      'hasGroupRole',
      'SELECT 1 FROM group_roles WHERE guild_id = ? AND group_number = ? AND role_id = ? LIMIT 1'
    ).get(guildId, groupNumber, roleId)

    if (!exists && count >= maxRoles) {
      return { ok: false, reason: 'max_roles_reached' }
    }

    this.stmt(
      'insertGroupRole',
      'INSERT OR IGNORE INTO group_roles (guild_id, group_number, role_id) VALUES (?, ?, ?)'
    ).run(guildId, groupNumber, roleId)

    this.invalidateGroupRoleCache(guildId)
    return { ok: true }
  }

  clearGroupRoles(guildId, groupNumber) {
    this.stmt('clearGroupRoles', 'DELETE FROM group_roles WHERE guild_id = ? AND group_number = ?').run(guildId, groupNumber)
    this.invalidateGroupRoleCache(guildId)
  }

  setGroupName(guildId, groupNumber, name) {
    this.stmt(
      'setGroupName',
      `INSERT INTO group_names (guild_id, group_number, name)
       VALUES (?, ?, ?)
       ON CONFLICT(guild_id, group_number)
       DO UPDATE SET name = excluded.name`
    ).run(guildId, groupNumber, String(name).slice(0, 60))
  }

  getGroupName(guildId, groupNumber) {
    return this.stmt('getGroupName', 'SELECT name FROM group_names WHERE guild_id = ? AND group_number = ?')
      .get(guildId, groupNumber)?.name || null
  }

  getAllGroupNames(guildId) {
    return this.stmt('getAllGroupNames', 'SELECT group_number, name FROM group_names WHERE guild_id = ?')
      .all(guildId)
  }

  getGroupRoles(guildId) {
    return this.stmt('getGroupRoles', 'SELECT group_number, role_id FROM group_roles WHERE guild_id = ? ORDER BY group_number ASC')
      .all(guildId)
  }

  getGroupRolesCached(guildId) {
    const cached = this.groupRoleCache.get(guildId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rows
    }

    const rows = this.getGroupRoles(guildId)
    this.groupRoleCache.set(guildId, {
      rows,
      expiresAt: Date.now() + 30_000,
    })
    return rows
  }

  getMemberBestGroupRank(guildId, roleIds = []) {
    if (!Array.isArray(roleIds) || roleIds.length === 0) return null
    const set = new Set(roleIds)
    const rows = this.getGroupRolesCached(guildId)

    let best = null
    for (const row of rows) {
      if (!set.has(row.role_id)) continue
      const rank = Number.parseInt(row.group_number, 10)
      if (!Number.isInteger(rank)) continue
      if (best == null || rank < best) best = rank
    }

    return best
  }

  setCommandGroup(guildId, commandName, groupNumber) {
    this.stmt(
      'setCommandGroup',
      `INSERT INTO command_groups (guild_id, command_name, group_number)
       VALUES (?, ?, ?)
       ON CONFLICT(guild_id, command_name)
       DO UPDATE SET group_number = excluded.group_number`
    ).run(guildId, commandName.toLowerCase(), groupNumber)
  }

  setAllCommandGroups(guildId, commandNames = [], groupNumber) {
    const tx = this.db.transaction(() => {
      const stmt = this.stmt(
        'setAllCommandGroupsStmt',
        `INSERT INTO command_groups (guild_id, command_name, group_number)
         VALUES (?, ?, ?)
         ON CONFLICT(guild_id, command_name)
         DO UPDATE SET group_number = excluded.group_number`
      )

      for (const name of commandNames) {
        stmt.run(guildId, String(name).toLowerCase(), groupNumber)
      }
    })

    tx()
  }

  transferGroupCommands(guildId, sourceGroup, targetGroup) {
    const info = this.stmt(
      'transferGroupCommands',
      'UPDATE command_groups SET group_number = ? WHERE guild_id = ? AND group_number = ?'
    ).run(targetGroup, guildId, sourceGroup)
    return info.changes
  }

  getCommandGroup(guildId, commandName) {
    const row = this.stmt(
      'getCommandGroup',
      'SELECT group_number FROM command_groups WHERE guild_id = ? AND command_name = ?'
    ).get(guildId, commandName.toLowerCase())

    if (!row) return null
    const parsed = Number.parseInt(row.group_number, 10)
    return Number.isInteger(parsed) ? parsed : null
  }

  getAllCommandGroups(guildId) {
    return this.stmt('getAllCommandGroups', 'SELECT command_name, group_number FROM command_groups WHERE guild_id = ?')
      .all(guildId)
  }

  setCommandBlocked(guildId, commandName, blocked, byUserId) {
    const safeName = String(commandName).toLowerCase()
    if (blocked) {
      this.stmt(
        'blockCommand',
        `INSERT INTO blocked_commands (guild_id, command_name, blocked_by, blocked_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, command_name)
         DO UPDATE SET blocked_by = excluded.blocked_by, blocked_at = excluded.blocked_at`
      ).run(guildId, safeName, byUserId, nowSec())
      return
    }

    this.stmt('unblockCommand', 'DELETE FROM blocked_commands WHERE guild_id = ? AND command_name = ?')
      .run(guildId, safeName)
  }

  isCommandBlocked(guildId, commandName) {
    const row = this.stmt(
      'isCommandBlocked',
      'SELECT 1 FROM blocked_commands WHERE guild_id = ? AND command_name = ? LIMIT 1'
    ).get(guildId, String(commandName).toLowerCase())

    return Boolean(row)
  }

  listBlockedCommands(guildId) {
    return this.stmt('listBlockedCommands', 'SELECT * FROM blocked_commands WHERE guild_id = ? ORDER BY command_name ASC')
      .all(guildId)
  }

  cleanupExpiredBlacklist() {
    this.stmt('cleanupExpiredBlacklist', 'DELETE FROM blacklist WHERE expires_at IS NOT NULL AND expires_at <= ?').run(nowSec())
  }

  setBlacklist(userId, { type = 'permanent', reason = '', authorId = 'system', durationMs = null } = {}) {
    const expiresAt = durationMs ? nowSec() + Math.floor(durationMs / 1000) : null

    this.stmt(
      'setBlacklist',
      `INSERT INTO blacklist (user_id, type, reason, author_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id)
       DO UPDATE SET type = excluded.type, reason = excluded.reason, author_id = excluded.author_id,
                     created_at = excluded.created_at, expires_at = excluded.expires_at`
    ).run(userId, type, String(reason).slice(0, 300), authorId, nowSec(), expiresAt)

    this.addSanction({
      userId,
      guildId: null,
      type: type === 'temporary' ? 'tempbl' : 'bl',
      authorId,
      reason,
      durationMs,
      expiresAt,
    })
  }

  removeBlacklist(userId, authorId = 'system') {
    const info = this.stmt('removeBlacklist', 'DELETE FROM blacklist WHERE user_id = ?').run(userId)
    if (info.changes > 0) {
      this.addSanction({
        userId,
        guildId: null,
        type: 'unbl',
        authorId,
        reason: 'Retrait blacklist',
      })
    }
    return info.changes > 0
  }

  getBlacklistEntry(userId) {
    this.cleanupExpiredBlacklist()
    return this.stmt('getBlacklistEntry', 'SELECT * FROM blacklist WHERE user_id = ?').get(userId) || null
  }

  isBlacklisted(userId) {
    const row = this.getBlacklistEntry(userId)
    if (!row) return { ok: false }

    const expiresAt = row.expires_at ? Number.parseInt(row.expires_at, 10) : null
    const remainingMs = expiresAt ? Math.max(0, (expiresAt - nowSec()) * 1000) : null

    return {
      ok: true,
      type: row.type,
      reason: row.reason,
      expiresAt,
      remainingMs,
    }
  }

  listBlacklist() {
    this.cleanupExpiredBlacklist()
    return this.stmt('listBlacklist', 'SELECT * FROM blacklist ORDER BY created_at DESC').all()
  }

  addWarn({ guildId, userId, authorId, reason = '' }) {
    const info = this.stmt(
      'addWarn',
      `INSERT INTO warns (user_id, guild_id, author_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(userId, guildId, authorId, String(reason).slice(0, 300), nowSec())

    this.addSanction({
      userId,
      guildId,
      type: 'warn',
      authorId,
      reason,
    })

    return info.lastInsertRowid
  }

  getWarns(guildId, userId) {
    return this.stmt(
      'getWarns',
      'SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC'
    ).all(guildId, userId)
  }

  countWarns(guildId, userId) {
    return this.stmt(
      'countWarns',
      'SELECT COUNT(*) AS n FROM warns WHERE guild_id = ? AND user_id = ?'
    ).get(guildId, userId)?.n || 0
  }

  deleteWarn(guildId, userId, warnId) {
    const info = this.stmt(
      'deleteWarn',
      'DELETE FROM warns WHERE id = ? AND guild_id = ? AND user_id = ?'
    ).run(warnId, guildId, userId)

    return info.changes > 0
  }

  clearWarns(guildId, userId) {
    const info = this.stmt('clearWarns', 'DELETE FROM warns WHERE guild_id = ? AND user_id = ?').run(guildId, userId)
    return info.changes
  }

  addSanction({ userId, guildId = null, type, authorId, reason = '', durationMs = null, expiresAt = null, meta = null }) {
    this.stmt(
      'addSanction',
      `INSERT INTO sanctions (user_id, guild_id, type, author_id, reason, duration_ms, expires_at, created_at, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      guildId,
      String(type).slice(0, 40),
      authorId,
      String(reason).slice(0, 300),
      durationMs == null ? null : Number.parseInt(durationMs, 10),
      expiresAt == null ? null : Number.parseInt(expiresAt, 10),
      nowSec(),
      meta ? JSON.stringify(meta).slice(0, 1500) : null
    )
  }

  listSanctions({ userId, guildId = null, limit = 100 }) {
    if (guildId) {
      return this.stmt(
        'listSanctionsGuild',
        `SELECT * FROM sanctions
         WHERE user_id = ? AND guild_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).all(userId, guildId, limit)
    }

    return this.stmt(
      'listSanctionsAll',
      `SELECT * FROM sanctions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(userId, limit)
  }

  clearSanctionsForUser(userId, guildId = null) {
    if (guildId) {
      const tx = this.db.transaction(() => {
        const n1 = this.stmt('clearWarnsGuildByUser', 'DELETE FROM warns WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes
        const n2 = this.stmt('clearSanctionsGuildByUser', 'DELETE FROM sanctions WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes
        return n1 + n2
      })
      return tx()
    }

    const tx = this.db.transaction(() => {
      const n1 = this.stmt('clearWarnsByUser', 'DELETE FROM warns WHERE user_id = ?').run(userId).changes
      const n2 = this.stmt('clearSanctionsByUser', 'DELETE FROM sanctions WHERE user_id = ?').run(userId).changes
      return n1 + n2
    })
    return tx()
  }

  clearAllSanctions() {
    const tx = this.db.transaction(() => {
      const n1 = this.stmt('clearAllWarns', 'DELETE FROM warns').run().changes
      const n2 = this.stmt('clearAllSanctions', 'DELETE FROM sanctions').run().changes
      const n3 = this.stmt('clearAllBlacklist', 'DELETE FROM blacklist').run().changes
      return n1 + n2 + n3
    })

    return tx()
  }

  getCooldown(guildId, userId, commandName) {
    const row = this.stmt(
      'getCooldown',
      'SELECT last_used FROM cooldowns WHERE guild_id = ? AND user_id = ? AND command_name = ?'
    ).get(guildId, userId, commandName)

    return row ? Number.parseInt(row.last_used, 10) : null
  }

  setCooldown(guildId, userId, commandName) {
    this.stmt(
      'setCooldown',
      `INSERT INTO cooldowns (guild_id, user_id, command_name, last_used)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, user_id, command_name)
       DO UPDATE SET last_used = excluded.last_used`
    ).run(guildId, userId, commandName, nowMs())
  }

  getCooldownRemaining(guildId, userId, commandName, cooldownMs) {
    const last = this.getCooldown(guildId, userId, commandName)
    if (!last) return 0
    const remain = last + cooldownMs - nowMs()
    return Math.max(0, remain)
  }

  getPot(guildId, potName, startAmount = 0) {
    this.stmt(
      'ensurePot',
      'INSERT OR IGNORE INTO pots (guild_id, pot_name, amount) VALUES (?, ?, ?)'
    ).run(guildId, potName, Math.max(0, Number.parseInt(startAmount, 10) || 0))

    const row = this.stmt('getPot', 'SELECT amount FROM pots WHERE guild_id = ? AND pot_name = ?').get(guildId, potName)
    return row ? Number.parseInt(row.amount, 10) : 0
  }

  addPot(guildId, potName, delta, startAmount = 0) {
    const tx = this.db.transaction(() => {
      const current = this.getPot(guildId, potName, startAmount)
      const next = Math.max(0, current + (Number.parseInt(delta, 10) || 0))
      this.stmt(
        'setPotInternal',
        `INSERT INTO pots (guild_id, pot_name, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(guild_id, pot_name)
         DO UPDATE SET amount = excluded.amount`
      ).run(guildId, potName, next)
      return next
    })
    return tx()
  }

  setPot(guildId, potName, amount) {
    const safe = Math.max(0, Number.parseInt(amount, 10) || 0)
    this.stmt(
      'setPot',
      `INSERT INTO pots (guild_id, pot_name, amount)
       VALUES (?, ?, ?)
       ON CONFLICT(guild_id, pot_name)
       DO UPDATE SET amount = excluded.amount`
    ).run(guildId, potName, safe)
    return safe
  }

  getState(guildId, key) {
    const row = this.stmt('getState', 'SELECT state_value FROM game_state WHERE guild_id = ? AND state_key = ?').get(guildId, key)
    return row?.state_value ?? null
  }

  setState(guildId, key, value) {
    this.stmt(
      'setState',
      `INSERT INTO game_state (guild_id, state_key, state_value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, state_key)
       DO UPDATE SET state_value = excluded.state_value, updated_at = excluded.updated_at`
    ).run(guildId, key, String(value).slice(0, 500), nowSec())
  }

  setGlobalBotProfile({ username = null, avatar = null, activity = null } = {}) {
    this.stmt(
      'setGlobalBotProfile',
      `INSERT INTO bot_profile_global (id, username, avatar, activity, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id)
       DO UPDATE SET username = excluded.username, avatar = excluded.avatar, activity = excluded.activity, updated_at = excluded.updated_at`
    ).run(username, avatar, activity, nowSec())
  }

  getGlobalBotProfile() {
    return this.stmt('getGlobalBotProfile', 'SELECT * FROM bot_profile_global WHERE id = 1').get() || null
  }

  setServerBotProfile(guildId, { nickname = null, avatar = null, banner = null, bio = null } = {}) {
    this.stmt(
      'setServerBotProfile',
      `INSERT INTO bot_profile_server (guild_id, nickname, avatar, banner, bio, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id)
       DO UPDATE SET nickname = excluded.nickname, avatar = excluded.avatar,
                     banner = excluded.banner, bio = excluded.bio, updated_at = excluded.updated_at`
    ).run(guildId, nickname, avatar, banner, bio, nowSec())
  }

  getServerBotProfile(guildId) {
    return this.stmt('getServerBotProfile', 'SELECT * FROM bot_profile_server WHERE guild_id = ?').get(guildId) || null
  }

  setLogChannel(guildId, logType, channelId, updatedBy = 'system') {
    const safeType = this.normalizeLogType(logType)
    const safeChannelId = String(channelId || '').trim()
    if (!safeType || !safeChannelId) return { ok: false, reason: 'invalid_input' }

    this.stmt(
      'setLogChannel',
      `INSERT INTO log_channels (guild_id, log_type, channel_id, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, log_type)
       DO UPDATE SET channel_id = excluded.channel_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
    ).run(guildId, safeType, safeChannelId, updatedBy, nowSec())

    return { ok: true }
  }

  clearLogChannel(guildId, logType) {
    const safeType = this.normalizeLogType(logType)
    if (!safeType) return false
    const info = this.stmt('clearLogChannel', 'DELETE FROM log_channels WHERE guild_id = ? AND log_type = ?').run(guildId, safeType)
    return info.changes > 0
  }

  getLogChannel(guildId, logType) {
    const safeType = this.normalizeLogType(logType)
    if (!safeType) return null
    return this.stmt('getLogChannel', 'SELECT * FROM log_channels WHERE guild_id = ? AND log_type = ?').get(guildId, safeType) || null
  }

  listLogChannels(guildId) {
    return this.stmt(
      'listLogChannels',
      'SELECT * FROM log_channels WHERE guild_id = ? ORDER BY log_type ASC'
    ).all(guildId)
  }

  addAuditEvent({
    guildId,
    logType,
    severity = 'info',
    actorId = null,
    targetUserId = null,
    commandName = null,
    channelId = null,
    messageId = null,
    description = '',
    data = null,
  }) {
    const safeType = this.normalizeLogType(logType)
    if (!guildId || !safeType) return { ok: false, reason: 'invalid_input' }

    const payload = data == null
      ? null
      : JSON.stringify(data).slice(0, 4000)

    const info = this.stmt(
      'addAuditEvent',
      `INSERT INTO audit_events
       (guild_id, log_type, severity, actor_id, target_user_id, command_name, channel_id, message_id, description, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      guildId,
      safeType,
      String(severity || 'info').slice(0, 16),
      actorId ? String(actorId).slice(0, 30) : null,
      targetUserId ? String(targetUserId).slice(0, 30) : null,
      commandName ? String(commandName).slice(0, 60) : null,
      channelId ? String(channelId).slice(0, 30) : null,
      messageId ? String(messageId).slice(0, 30) : null,
      String(description || '').slice(0, 1200),
      payload,
      nowSec()
    )

    return { ok: true, id: Number(info.lastInsertRowid || 0) }
  }

  getAuditEvent(guildId, eventId) {
    const safeId = Number.parseInt(eventId, 10) || 0
    if (!guildId || safeId <= 0) return null
    return this.stmt(
      'getAuditEvent',
      'SELECT * FROM audit_events WHERE guild_id = ? AND id = ? LIMIT 1'
    ).get(guildId, safeId) || null
  }

  listAuditEvents(guildId, {
    logType = null,
    actorId = null,
    targetUserId = null,
    commandName = null,
    contains = null,
    sinceSec = null,
    untilSec = null,
    limit = 50,
  } = {}) {
    const safeLimit = Math.max(1, Math.min(200, Number.parseInt(limit, 10) || 50))
    const where = ['guild_id = ?']
    const params = [guildId]

    const safeType = this.normalizeLogType(logType)
    if (safeType) {
      where.push('log_type = ?')
      params.push(safeType)
    }
    if (actorId) {
      where.push('actor_id = ?')
      params.push(String(actorId))
    }
    if (targetUserId) {
      where.push('target_user_id = ?')
      params.push(String(targetUserId))
    }
    if (commandName) {
      where.push('command_name = ?')
      params.push(String(commandName))
    }
    if (sinceSec != null) {
      where.push('created_at >= ?')
      params.push(Number.parseInt(sinceSec, 10) || 0)
    }
    if (untilSec != null) {
      where.push('created_at <= ?')
      params.push(Number.parseInt(untilSec, 10) || 0)
    }
    if (contains) {
      where.push('(description LIKE ? OR data LIKE ?)')
      const like = `%${String(contains).slice(0, 120)}%`
      params.push(like, like)
    }

    params.push(safeLimit)
    const sql = `
      SELECT *
      FROM audit_events
      WHERE ${where.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?
    `

    return this.db.prepare(sql).all(...params)
  }

  addEconomyTransaction({
    guildId,
    userId,
    actorId = null,
    source = 'system',
    reason = null,
    commandName = null,
    channelId = null,
    messageId = null,
    coinsBefore = 0,
    coinsDelta = 0,
    coinsAfter = 0,
    xpBefore = 0,
    xpDelta = 0,
    xpAfter = 0,
    traceId = null,
    metadata = null,
  }) {
    if (!guildId || !userId) return { ok: false, reason: 'invalid_input' }

    const payload = metadata == null
      ? null
      : JSON.stringify(metadata).slice(0, 4000)

    const info = this.stmt(
      'addEconomyTransaction',
      `INSERT INTO economy_transactions
       (guild_id, user_id, actor_id, source, reason, command_name, channel_id, message_id,
        coins_before, coins_delta, coins_after, xp_before, xp_delta, xp_after, trace_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      guildId,
      String(userId).slice(0, 30),
      actorId ? String(actorId).slice(0, 30) : null,
      String(source || 'system').slice(0, 60),
      reason ? String(reason).slice(0, 300) : null,
      commandName ? String(commandName).slice(0, 60) : null,
      channelId ? String(channelId).slice(0, 30) : null,
      messageId ? String(messageId).slice(0, 30) : null,
      Number.parseInt(coinsBefore, 10) || 0,
      Number.parseInt(coinsDelta, 10) || 0,
      Number.parseInt(coinsAfter, 10) || 0,
      Number.parseInt(xpBefore, 10) || 0,
      Number.parseInt(xpDelta, 10) || 0,
      Number.parseInt(xpAfter, 10) || 0,
      traceId ? String(traceId).slice(0, 80) : null,
      payload,
      nowSec()
    )

    return { ok: true, id: Number(info.lastInsertRowid || 0) }
  }

  getEconomyTransaction(guildId, txId) {
    const safeId = Number.parseInt(txId, 10) || 0
    if (!guildId || safeId <= 0) return null
    return this.stmt(
      'getEconomyTransaction',
      'SELECT * FROM economy_transactions WHERE guild_id = ? AND id = ? LIMIT 1'
    ).get(guildId, safeId) || null
  }

  listEconomyTransactions(guildId, {
    userId = null,
    actorId = null,
    source = null,
    traceId = null,
    includeReverted = true,
    minAbsCoins = 0,
    minAbsXp = 0,
    sinceSec = null,
    untilSec = null,
    limit = 50,
  } = {}) {
    const safeLimit = Math.max(1, Math.min(300, Number.parseInt(limit, 10) || 50))
    const where = ['guild_id = ?']
    const params = [guildId]

    if (userId) {
      where.push('user_id = ?')
      params.push(String(userId))
    }
    if (actorId) {
      where.push('actor_id = ?')
      params.push(String(actorId))
    }
    if (source) {
      where.push('source = ?')
      params.push(String(source))
    }
    if (traceId) {
      where.push('trace_id = ?')
      params.push(String(traceId))
    }
    if (!includeReverted) {
      where.push('reverted_at IS NULL')
    }
    if ((Number.parseInt(minAbsCoins, 10) || 0) > 0) {
      where.push('ABS(coins_delta) >= ?')
      params.push(Math.max(0, Number.parseInt(minAbsCoins, 10) || 0))
    }
    if ((Number.parseInt(minAbsXp, 10) || 0) > 0) {
      where.push('ABS(xp_delta) >= ?')
      params.push(Math.max(0, Number.parseInt(minAbsXp, 10) || 0))
    }
    if (sinceSec != null) {
      where.push('created_at >= ?')
      params.push(Number.parseInt(sinceSec, 10) || 0)
    }
    if (untilSec != null) {
      where.push('created_at <= ?')
      params.push(Number.parseInt(untilSec, 10) || 0)
    }

    params.push(safeLimit)
    const sql = `
      SELECT *
      FROM economy_transactions
      WHERE ${where.join(' AND ')}
      ORDER BY id DESC
      LIMIT ?
    `
    return this.db.prepare(sql).all(...params)
  }

  getUserEconomyStats(guildId, userId) {
    return this.stmt(
      'getUserEconomyStats',
      `SELECT
         COUNT(*) AS tx_count,
         COALESCE(SUM(CASE WHEN coins_delta > 0 THEN coins_delta ELSE 0 END), 0) AS coins_in,
         COALESCE(SUM(CASE WHEN coins_delta < 0 THEN -coins_delta ELSE 0 END), 0) AS coins_out,
         COALESCE(SUM(CASE WHEN xp_delta > 0 THEN xp_delta ELSE 0 END), 0) AS xp_in,
         COALESCE(SUM(CASE WHEN xp_delta < 0 THEN -xp_delta ELSE 0 END), 0) AS xp_out,
         COALESCE(SUM(CASE WHEN command_name = 'vol' AND coins_delta > 0 THEN coins_delta ELSE 0 END), 0) AS vol_coins_stolen,
         COALESCE(SUM(CASE WHEN command_name = 'vol' AND xp_delta > 0 THEN xp_delta ELSE 0 END), 0) AS vol_xp_stolen,
         COALESCE(SUM(CASE WHEN command_name IN ('roulette','blackjack','bingo','jackpot','pfc','vol') AND coins_delta > 0 THEN 1 ELSE 0 END), 0) AS game_wins,
         COALESCE(SUM(CASE WHEN command_name IN ('roulette','blackjack','bingo','jackpot','pfc','vol') THEN 1 ELSE 0 END), 0) AS game_rounds,
         COALESCE(SUM(CASE WHEN command_name = 'roulette' THEN 1 ELSE 0 END), 0) AS roulette_rounds,
         COALESCE(SUM(CASE WHEN command_name = 'blackjack' THEN 1 ELSE 0 END), 0) AS blackjack_rounds,
         COALESCE(SUM(CASE WHEN command_name = 'vol' THEN 1 ELSE 0 END), 0) AS vol_rounds
       FROM economy_transactions
       WHERE guild_id = ? AND user_id = ?`
    ).get(guildId, userId) || {
      tx_count: 0,
      coins_in: 0,
      coins_out: 0,
      xp_in: 0,
      xp_out: 0,
      vol_coins_stolen: 0,
      vol_xp_stolen: 0,
      game_wins: 0,
      game_rounds: 0,
      roulette_rounds: 0,
      blackjack_rounds: 0,
      vol_rounds: 0,
    }
  }

  listUserAchievements(guildId, userId) {
    return this.stmt(
      'listUserAchievements',
      `SELECT *
       FROM user_achievements
       WHERE guild_id = ? AND user_id = ?
       ORDER BY achievement_index ASC, unlocked_at ASC`
    ).all(guildId, userId)
  }

  getUserAchievement(guildId, userId, achievementKey) {
    const safeKey = String(achievementKey || '').trim().toLowerCase().slice(0, 60)
    if (!safeKey) return null
    return this.stmt(
      'getUserAchievement',
      `SELECT *
       FROM user_achievements
       WHERE guild_id = ? AND user_id = ? AND achievement_key = ?
       LIMIT 1`
    ).get(guildId, userId, safeKey) || null
  }

  unlockUserAchievement(guildId, userId, {
    achievementKey,
    achievementIndex,
    achievementName,
    rewardCoins = 0,
    rewardXp = 0,
    rewardDraws = 0,
  } = {}) {
    const safeKey = String(achievementKey || '').trim().toLowerCase().slice(0, 60)
    const safeName = String(achievementName || '').trim().slice(0, 120)
    const safeIndex = Math.max(1, Number.parseInt(achievementIndex, 10) || 1)
    if (!safeKey || !safeName) return { ok: false, reason: 'invalid_input' }

    const tx = this.db.transaction(() => {
      const existing = this.getUserAchievement(guildId, userId, safeKey)
      if (existing) {
        return {
          ok: true,
          created: false,
          row: existing,
        }
      }

      this.stmt(
        'unlockUserAchievement',
        `INSERT INTO user_achievements
         (guild_id, user_id, achievement_key, achievement_index, achievement_name, reward_coins, reward_xp, reward_draws, unlocked_at, claimed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        guildId,
        userId,
        safeKey,
        safeIndex,
        safeName,
        Math.max(0, Number.parseInt(rewardCoins, 10) || 0),
        Math.max(0, Number.parseInt(rewardXp, 10) || 0),
        Math.max(0, Number.parseInt(rewardDraws, 10) || 0),
        nowSec(),
        nowSec()
      )

      return {
        ok: true,
        created: true,
        row: this.getUserAchievement(guildId, userId, safeKey),
      }
    })

    return tx()
  }

  markEconomyTransactionReverted(guildId, txId, {
    revertedBy = null,
    revertedReason = null,
    revertedTxId = null,
  } = {}) {
    const safeId = Number.parseInt(txId, 10) || 0
    if (!guildId || safeId <= 0) return false
    const info = this.stmt(
      'markEconomyTransactionReverted',
      `UPDATE economy_transactions
       SET reverted_at = ?, reverted_by = ?, reverted_reason = ?, reverted_tx_id = ?
       WHERE guild_id = ? AND id = ?`
    ).run(
      nowSec(),
      revertedBy ? String(revertedBy).slice(0, 30) : null,
      revertedReason ? String(revertedReason).slice(0, 300) : null,
      revertedTxId == null ? null : Number.parseInt(revertedTxId, 10),
      guildId,
      safeId
    )
    return info.changes > 0
  }

  resetAllData() {
    const tx = this.db.transaction(() => {
      const tables = [
        'users',
        'profiles',
        'owners',
        'guild_setup',
        'casino_setup_profiles',
        'casino_shop_items',
        'casino_draw_items',
        'casino_inventory',
        'casino_equips',
        'group_roles',
        'group_names',
        'command_groups',
        'blocked_commands',
        'blacklist',
        'warns',
        'sanctions',
        'cooldowns',
        'pots',
        'game_state',
        'bot_profile_global',
        'bot_profile_server',
        'giveaways',
        'giveaway_entries',
        'giveaway_winners',
        'casino_coin_balances',
        'giveaway_coin_payouts',
        'log_channels',
        'audit_events',
        'economy_transactions',
        'user_achievements',
      ]

      for (const table of tables) {
        this.db.prepare(`DELETE FROM ${table}`).run()
      }
    })

    tx()
    this.profileCache.clear()
    this.groupRoleCache.clear()
    this.setupMessageCache.clear()
  }
}

function ensureBaseSchema(db, config) {
  const schema = [
    `CREATE TABLE IF NOT EXISTS users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      coins INTEGER NOT NULL DEFAULT 0,
      xp_flasks INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, user_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id)',

    `CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,

    `CREATE TABLE IF NOT EXISTS owners (
      user_id TEXT PRIMARY KEY,
      added_by TEXT,
      added_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,

    `CREATE TABLE IF NOT EXISTS guild_setup (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,

    `CREATE TABLE IF NOT EXISTS casino_setup_profiles (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      draw_credits INTEGER NOT NULL DEFAULT 3,
      draws_done INTEGER NOT NULL DEFAULT 0,
      voice_minutes INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, user_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_casino_setup_profiles_user ON casino_setup_profiles(user_id)',

    `CREATE TABLE IF NOT EXISTS casino_shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'autre',
      price INTEGER NOT NULL DEFAULT 0,
      reward_type TEXT NOT NULL DEFAULT 'cosmetic',
      reward_value TEXT,
      role_id TEXT,
      emoji TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_casino_shop_guild ON casino_shop_items(guild_id, enabled, sort_order, id)',

    `CREATE TABLE IF NOT EXISTS casino_draw_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'autre',
      weight REAL NOT NULL DEFAULT 1,
      reward_type TEXT NOT NULL DEFAULT 'coins',
      reward_value TEXT,
      role_id TEXT,
      emoji TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_casino_draw_guild ON casino_draw_items(guild_id, enabled, sort_order, id)',

    `CREATE TABLE IF NOT EXISTS casino_inventory (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      acquired_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, user_id, source_type, source_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_casino_inventory_user ON casino_inventory(guild_id, user_id)',

    `CREATE TABLE IF NOT EXISTS casino_equips (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, user_id, slot)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_casino_equips_user ON casino_equips(guild_id, user_id)',

    `CREATE TABLE IF NOT EXISTS group_roles (
      guild_id TEXT NOT NULL,
      group_number INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, group_number, role_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_group_roles_lookup ON group_roles(guild_id, group_number)',

    `CREATE TABLE IF NOT EXISTS group_names (
      guild_id TEXT NOT NULL,
      group_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (guild_id, group_number)
    )`,

    `CREATE TABLE IF NOT EXISTS command_groups (
      guild_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      group_number INTEGER NOT NULL,
      PRIMARY KEY (guild_id, command_name)
    )`,

    `CREATE TABLE IF NOT EXISTS blocked_commands (
      guild_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      blocked_by TEXT,
      blocked_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, command_name)
    )`,

    `CREATE TABLE IF NOT EXISTS blacklist (
      user_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      reason TEXT,
      author_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      expires_at INTEGER
    )`,

    `CREATE TABLE IF NOT EXISTS warns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      author_id TEXT,
      reason TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_warns_user ON warns(guild_id, user_id)',

    `CREATE TABLE IF NOT EXISTS sanctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      type TEXT NOT NULL,
      author_id TEXT,
      reason TEXT,
      duration_ms INTEGER,
      expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      meta TEXT
    )`,
    'CREATE INDEX IF NOT EXISTS idx_sanctions_user ON sanctions(user_id, guild_id, created_at DESC)',

    `CREATE TABLE IF NOT EXISTS cooldowns (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      last_used INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, command_name)
    )`,

    `CREATE TABLE IF NOT EXISTS pots (
      guild_id TEXT NOT NULL,
      pot_name TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, pot_name)
    )`,

    `CREATE TABLE IF NOT EXISTS game_state (
      guild_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      state_value TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, state_key)
    )`,

    `CREATE TABLE IF NOT EXISTS log_channels (
      guild_id TEXT NOT NULL,
      log_type TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      updated_by TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, log_type)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_log_channels_guild ON log_channels(guild_id, log_type)',

    `CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      log_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT \'info\',
      actor_id TEXT,
      target_user_id TEXT,
      command_name TEXT,
      channel_id TEXT,
      message_id TEXT,
      description TEXT,
      data TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_audit_events_lookup ON audit_events(guild_id, log_type, id DESC)',
    'CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(guild_id, target_user_id, id DESC)',

    `CREATE TABLE IF NOT EXISTS economy_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      actor_id TEXT,
      source TEXT NOT NULL DEFAULT \'system\',
      reason TEXT,
      command_name TEXT,
      channel_id TEXT,
      message_id TEXT,
      coins_before INTEGER NOT NULL DEFAULT 0,
      coins_delta INTEGER NOT NULL DEFAULT 0,
      coins_after INTEGER NOT NULL DEFAULT 0,
      xp_before INTEGER NOT NULL DEFAULT 0,
      xp_delta INTEGER NOT NULL DEFAULT 0,
      xp_after INTEGER NOT NULL DEFAULT 0,
      trace_id TEXT,
      metadata TEXT,
      reverted_at INTEGER,
      reverted_by TEXT,
      reverted_reason TEXT,
      reverted_tx_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_economy_tx_user ON economy_transactions(guild_id, user_id, id DESC)',
    'CREATE INDEX IF NOT EXISTS idx_economy_tx_actor ON economy_transactions(guild_id, actor_id, id DESC)',
    'CREATE INDEX IF NOT EXISTS idx_economy_tx_trace ON economy_transactions(guild_id, trace_id)',
    'CREATE INDEX IF NOT EXISTS idx_economy_tx_source ON economy_transactions(guild_id, source, id DESC)',

    `CREATE TABLE IF NOT EXISTS user_achievements (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      achievement_index INTEGER NOT NULL,
      achievement_name TEXT NOT NULL,
      reward_coins INTEGER NOT NULL DEFAULT 0,
      reward_xp INTEGER NOT NULL DEFAULT 0,
      reward_draws INTEGER NOT NULL DEFAULT 0,
      unlocked_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      claimed_at INTEGER,
      PRIMARY KEY (guild_id, user_id, achievement_key)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(guild_id, user_id, achievement_index ASC)',

    `CREATE TABLE IF NOT EXISTS bot_profile_global (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT,
      avatar TEXT,
      activity TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,

    `CREATE TABLE IF NOT EXISTS bot_profile_server (
      guild_id TEXT PRIMARY KEY,
      nickname TEXT,
      avatar TEXT,
      banner TEXT,
      bio TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`,
  ]

  for (const sql of schema) {
    db.prepare(sql).run()
  }

  const defaultPots = config?.gamePots || {}
  void defaultPots
  // Pots are seeded lazily per guild by gameplay commands.
}

export function initDatabase(rootDir, config) {
  const dataDir = path.join(rootDir, 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  const dbPath = path.join(dataDir, 'casino.sqlite')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -64000')
  db.pragma('mmap_size = 268435456')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  ensureBaseSchema(db, config)
  db.pragma('optimize')

  return {
    db,
    store: new DataStore(db, config),
  }
}
