import { logger } from '../core/logger.js'
import { ensureDrawSystemRolesForAllGuilds } from '../utils/drawRoleManager.js'
import { startGainVoiceScheduler } from '../utils/gainSystem.js'
import { startCreditStatusRotation } from '../utils/creditBranding.js'

export default {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`Connecté en tant que ${client.user.tag}`)
    startCreditStatusRotation(client)
    startGainVoiceScheduler(client)

    if (typeof client.startGiveawayScheduler === 'function') {
      client.startGiveawayScheduler()
    }

    void ensureDrawSystemRolesForAllGuilds(client).catch((error) => {
      logger.warn('Bootstrap roles tirage non complet:', error?.message || error)
    })
  },
}
