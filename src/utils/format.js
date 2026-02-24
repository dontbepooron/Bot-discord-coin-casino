const FR_NUMBER = new Intl.NumberFormat('fr-FR')

export function formatCoins(config, amount) {
  const value = Math.max(0, Number.parseInt(amount, 10) || 0)
  const coinEmoji = config?.currency?.coinEmoji || '🪙'
  const formatted = FR_NUMBER.format(value)
  return `${formatted} ${coinEmoji}`
}

export function formatCoinsBackticks(config, amount) {
  const value = Math.max(0, Number.parseInt(amount, 10) || 0)
  const coinEmoji = config?.currency?.coinEmoji || '🪙'
  const formatted = FR_NUMBER.format(value)
  return `\`${formatted}\` ${coinEmoji}`
}

export function formatXp(config, amount) {
  const value = Math.max(0, Number.parseInt(amount, 10) || 0)
  const xpEmoji = config?.currency?.xpFlaskEmoji || '🧪'
  return `${xpEmoji} ${FR_NUMBER.format(value)}`
}
