import { readFileSync } from 'node:fs'
import path from 'node:path'

export function loadConfig(rootDir) {
  const configPath = path.join(rootDir, 'config.json')
  const raw = readFileSync(configPath, 'utf8')
  const parsed = JSON.parse(raw)
  return parsed
}
