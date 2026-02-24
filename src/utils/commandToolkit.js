export function safeTrim(value, max = 2000) {
  if (value == null) return ''
  return String(value).trim().slice(0, max)
}

export function parseIntInRange(value, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isInteger(parsed)) return null
  if (parsed < min || parsed > max) return null
  return parsed
}

export function parseUserId(input) {
  const raw = safeTrim(input, 100)
  if (!raw) return null
  const mention = raw.match(/^<@!?(\d{17,20})>$/)
  if (mention?.[1]) return mention[1]
  const id = raw.match(/^(\d{17,20})$/)
  if (id?.[1]) return id[1]
  return null
}

export function parseRoleId(input) {
  const raw = safeTrim(input, 100)
  if (!raw) return null
  const mention = raw.match(/^<@&(\d{17,20})>$/)
  if (mention?.[1]) return mention[1]
  const id = raw.match(/^(\d{17,20})$/)
  if (id?.[1]) return id[1]
  return null
}

export function parseChannelId(input) {
  const raw = safeTrim(input, 120)
  if (!raw) return null
  const mention = raw.match(/^<#(\d{17,20})>$/)
  if (mention?.[1]) return mention[1]
  const id = raw.match(/^(\d{17,20})$/)
  if (id?.[1]) return id[1]
  return null
}

export function ensureGuild({ message = null, interaction = null } = {}) {
  const guild = message?.guild || interaction?.guild || null
  if (!guild) return { ok: false }
  return { ok: true, guild }
}

export function safeDbRun(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql)
    const info = stmt.run(params)
    return { ok: true, info }
  } catch (error) {
    return { ok: false, error }
  }
}

export function safeDbGet(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql)
    const row = stmt.get(params)
    return { ok: true, row }
  } catch (error) {
    return { ok: false, error }
  }
}

export function safeDbAll(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql)
    const rows = stmt.all(params)
    return { ok: true, rows }
  } catch (error) {
    return { ok: false, error }
  }
}
