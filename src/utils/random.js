export function randomInt(min, max) {
  const safeMin = Math.ceil(min)
  const safeMax = Math.floor(max)
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin
}

export function pickRandom(array) {
  if (!Array.isArray(array) || array.length === 0) return null
  return array[Math.floor(Math.random() * array.length)]
}

export function shuffle(array) {
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }
  return copy
}
