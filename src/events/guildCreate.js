import { ensureDrawSystemRolesForGuild } from '../utils/drawRoleManager.js'

export default {
  name: 'guildCreate',
  async execute(client, guild) {
    await ensureDrawSystemRolesForGuild(client, guild).catch(() => null)
  },
}
