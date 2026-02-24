import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} from 'discord.js'

import { loadConfig } from './core/loadConfig.js'
import { logger } from './core/logger.js'
import { initDatabase } from './db/database.js'
import { loadCommands } from './handlers/commandHandler.js'
import { loadEvents } from './handlers/eventHandler.js'
import { getBotMode } from './utils/botMode.js'
import { installCreditBranding } from './utils/creditBranding.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const config = loadConfig(rootDir)

const token = process.env.DISCORD_TOKEN
if (!token) {
  throw new Error('DISCORD_TOKEN manquant dans .env')
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
  allowedMentions: {
    parse: [],
    repliedUser: false,
  },
  failIfNotExists: false,
})

client.config = config
client.rootDir = rootDir
client.cooldowns = new Collection()
client.giftSessions = new Map()
client.pfcSessions = new Map()
client.blackjackSessions = new Map()
client.gainTextStats = new Map()
client.gainVoiceSessions = new Map()
client.gainVoiceInterval = null
client.logChannelCache = new Map()

const { db, store } = initDatabase(rootDir, config)
client.db = db
client.store = store
client.runtime = { botMode: getBotMode(client) }
installCreditBranding(client)

async function bootstrap() {
  await loadCommands(client, rootDir)

  // Giveaway manager is optional during bootstrap, but loaded when available.
  try {
    const giveawayManager = await import('./utils/giveawayManager.js')

    giveawayManager.ensureGiveawayTables(client.db)

    client.startGiveawayScheduler = () => giveawayManager.startGiveawayScheduler(client)
    client.handleGiveawayButtonInteraction = (interaction) => giveawayManager.handleGiveawayButtonInteraction(client, interaction)
    client.handleGiveawayReactionAdd = (reaction, user) => giveawayManager.handleGiveawayReactionAdd(client, reaction, user)
    client.handleGiveawayReactionRemove = (reaction, user) => giveawayManager.handleGiveawayReactionRemove(client, reaction, user)
  } catch (error) {
    logger.warn('Giveaway manager non chargé au bootstrap:', error?.message || error)
  }

  await loadEvents(client, rootDir)
  await client.login(token)
}

bootstrap().catch((error) => {
  logger.error('Bootstrap failed', error)
  process.exit(1)
})
