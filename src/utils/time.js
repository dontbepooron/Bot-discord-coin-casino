export function msToHuman(ms) {
  const totalSeconds = Math.max(1, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts = []
  if (days) parts.push(`${days}j`)
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (seconds && parts.length === 0) parts.push(`${seconds}s`)

  return parts.join(' ') || '1s'
}

export function unixNow() {
  return Math.floor(Date.now() / 1000)
}
