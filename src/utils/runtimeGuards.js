function toBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min) return min
  if (parsed > max) return max
  return parsed
}

function ensureGuardBucket(runtime, bucket) {
  if (!runtime.guardBuckets) runtime.guardBuckets = new Map()
  if (!runtime.guardBuckets.has(bucket)) {
    runtime.guardBuckets.set(bucket, new Map())
  }
  return runtime.guardBuckets.get(bucket)
}

function maybeGarbageCollect(runtime, now, gcIntervalMs) {
  const nextAt = Number.parseInt(runtime.guardBucketsGcAt, 10) || 0
  if (nextAt > now) return

  runtime.guardBucketsGcAt = now + gcIntervalMs
  const buckets = runtime.guardBuckets
  if (!buckets?.size) return

  for (const entries of buckets.values()) {
    for (const [key, entry] of entries.entries()) {
      const safeLastSeen = Number.parseInt(entry?.lastSeenAt, 10) || 0
      const safeBlockedUntil = Number.parseInt(entry?.blockedUntil, 10) || 0
      if (safeBlockedUntil > now) continue
      if (safeLastSeen > 0 && now - safeLastSeen > gcIntervalMs * 2) {
        entries.delete(key)
      }
    }
  }
}

export function takeBurstHit(client, {
  bucket,
  key,
  windowMs,
  maxHits,
  blockMs,
  notifyEveryMs = 4_000,
  gcIntervalMs = 60_000,
} = {}) {
  if (!client?.runtime || !bucket || !key) {
    return { allowed: true, retryAfterMs: 0, shouldNotify: false }
  }

  const safeWindowMs = toBoundedInt(windowMs, 5_000, 500, 300_000)
  const safeMaxHits = toBoundedInt(maxHits, 6, 1, 500)
  const safeBlockMs = toBoundedInt(blockMs, 8_000, 500, 600_000)
  const safeNotifyEveryMs = toBoundedInt(notifyEveryMs, 4_000, 500, 300_000)
  const safeGcIntervalMs = toBoundedInt(gcIntervalMs, 60_000, 5_000, 3_600_000)
  const now = Date.now()

  maybeGarbageCollect(client.runtime, now, safeGcIntervalMs)

  const bucketEntries = ensureGuardBucket(client.runtime, String(bucket))
  const entry = bucketEntries.get(key) || {
    hits: [],
    blockedUntil: 0,
    lastSeenAt: 0,
    lastNotifiedAt: 0,
  }

  entry.lastSeenAt = now
  entry.hits = Array.isArray(entry.hits)
    ? entry.hits.filter((ts) => now - ts <= safeWindowMs)
    : []

  if (entry.blockedUntil > now) {
    const shouldNotify = now - entry.lastNotifiedAt >= safeNotifyEveryMs
    if (shouldNotify) entry.lastNotifiedAt = now
    bucketEntries.set(key, entry)
    return {
      allowed: false,
      retryAfterMs: Math.max(0, entry.blockedUntil - now),
      shouldNotify,
    }
  }

  entry.hits.push(now)
  if (entry.hits.length > safeMaxHits) {
    entry.hits = []
    entry.blockedUntil = now + safeBlockMs
    entry.lastNotifiedAt = now
    bucketEntries.set(key, entry)
    return {
      allowed: false,
      retryAfterMs: safeBlockMs,
      shouldNotify: true,
    }
  }

  bucketEntries.set(key, entry)
  return { allowed: true, retryAfterMs: 0, shouldNotify: false }
}

