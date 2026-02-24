import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function loadEvents(client, rootDir) {
  const eventsDir = path.join(rootDir, 'src', 'events')
  const entries = await fs.readdir(eventsDir)

  for (const entry of entries) {
    if (!entry.endsWith('.js')) continue
    const fullPath = path.join(eventsDir, entry)
    const mod = await import(pathToFileURL(fullPath).href)
    const event = mod.default
    if (!event?.name || typeof event.execute !== 'function') continue

    if (event.once) {
      client.once(event.name, (...args) => event.execute(client, ...args))
    } else {
      client.on(event.name, (...args) => event.execute(client, ...args))
    }
  }
}
