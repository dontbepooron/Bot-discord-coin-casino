export async function runSuspenseEdit(message, frames = [], totalMs = 3000, intervalMs = 400) {
  if (!message || !Array.isArray(frames) || frames.length === 0) return

  const safeTotalMs = Math.max(0, Math.min(1200, Number.parseInt(totalMs, 10) || 0))
  const safeIntervalMs = Math.max(120, Math.min(450, Number.parseInt(intervalMs, 10) || 120))
  if (safeTotalMs <= 0) return

  const startedAt = Date.now()
  let idx = 0

  while (Date.now() - startedAt < safeTotalMs) {
    const payload = frames[idx % frames.length]
    idx += 1

    // eslint-disable-next-line no-await-in-loop
    await message.edit(payload).catch(() => null)
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, safeIntervalMs))
  }
}
