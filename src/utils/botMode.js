const BOT_MODE_SCOPE = '__global__'
const BOT_MODE_KEY = 'bot_mode'

function normalizeMode(raw) {
  return String(raw || '').toLowerCase() === 'test' ? 'test' : 'prod'
}

export function getBotMode(client) {
  const runtime = client.runtime || (client.runtime = {})
  if (runtime.botMode) return runtime.botMode

  const stored = client.store.getState(BOT_MODE_SCOPE, BOT_MODE_KEY)
  const mode = normalizeMode(stored)
  runtime.botMode = mode
  return mode
}

export function isTestMode(client) {
  return getBotMode(client) === 'test'
}

export function setBotMode(client, mode) {
  const next = normalizeMode(mode)
  client.store.setState(BOT_MODE_SCOPE, BOT_MODE_KEY, next)
  const runtime = client.runtime || (client.runtime = {})
  runtime.botMode = next
  return next
}
