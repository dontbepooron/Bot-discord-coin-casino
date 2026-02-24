import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (!entry.isFile() || !entry.name.endsWith('.js')) return []
    return [full]
  }))

  return files.flat()
}

export async function loadCommands(client, rootDir) {
  const commandsDir = path.join(rootDir, 'src', 'commands')
  const files = await walk(commandsDir)

  client.commands = new Map()
  client.aliases = new Map()

  for (const file of files) {
    const module = await import(pathToFileURL(file).href)
    const command = module.default
    if (!command?.name) continue

    const relative = path.relative(commandsDir, file)
    const [categoryFolder] = relative.split(path.sep)
    if (categoryFolder) {
      command.category = String(command.category || categoryFolder).toLowerCase()
    }

    const safeName = String(command.name).toLowerCase()
    command.name = safeName

    client.commands.set(safeName, command)

    if (Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        client.aliases.set(String(alias).toLowerCase(), safeName)
      }
    }
  }

  client.commandNames = [...client.commands.keys()]
}
