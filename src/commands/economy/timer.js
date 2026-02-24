import { EmbedBuilder } from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { msToHuman } from '../../utils/time.js'
import { isTestMode } from '../../utils/botMode.js'

const GLOBAL_COMMAND_COOLDOWN_KEY = '__global_command__'

const DISPLAYED_COMMANDS = [
  { label: 'Global', name: GLOBAL_COMMAND_COOLDOWN_KEY, fallbackMs: (client) => client.config?.cooldowns?.globalCommandMs || 0 },
  { label: 'Collect', name: 'collect', fallbackMs: (client) => client.config?.cooldowns?.collectMs || 0 },
  { label: 'Daily', name: 'daily', fallbackMs: (client) => client.config?.cooldowns?.dailyMs || 0 },
  { label: 'Vol', name: 'vol', fallbackMs: (client) => client.config?.cooldowns?.volMs || 0 },
  { label: 'Roulette', name: 'roulette', fallbackMs: (client) => client.config?.cooldowns?.rouletteMs || 0 },
  { label: 'Slots', name: 'slots', fallbackMs: (client) => client.config?.cooldowns?.slotsMs || 0 },
  { label: 'Coinflip', name: 'coinflip', fallbackMs: (client) => client.config?.cooldowns?.coinflipMs || 0 },
  { label: 'Hi-Lo', name: 'hilo', fallbackMs: (client) => client.config?.cooldowns?.hiloMs || 0 },
  { label: 'Craps', name: 'craps', fallbackMs: (client) => client.config?.cooldowns?.crapsMs || 0 },
  { label: 'Jackpot', name: 'jackpot', fallbackMs: (client) => client.config?.cooldowns?.jackpotMs || 0 },
  { label: 'Bingo', name: 'bingo', fallbackMs: () => 0 },
  { label: 'Gift', name: 'gift', fallbackMs: (client) => client.config?.cooldowns?.giftMs || 0 },
  { label: 'BlackJack', name: 'blackjack', fallbackMs: (client) => client.config?.cooldowns?.blackjackMs || 0 },
  { label: 'Pierre-Feuille-Ciseaux', name: 'pfc', fallbackMs: (client) => client.config?.cooldowns?.pfcMs || 0 },
]

function resolveCooldownMs(client, commandName, fallbackMs) {
  const command = client.commands?.get(commandName)
  const raw = typeof command?.cooldownMs === 'function' ? command.cooldownMs(client) : command?.cooldownMs
  const parsed = Number.parseInt(raw ?? fallbackMs(client), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed
}

function resolveStatus({ client, guildId, userId, commandName, cooldownMs, isBuyer }) {
  if (isBuyer && isTestMode(client)) return 'Disponible'
  if (cooldownMs <= 0) return 'Disponible'

  const remaining = client.store.getCooldownRemaining(guildId, userId, commandName, cooldownMs)
  if (remaining <= 0) return 'Disponible'
  return msToHuman(remaining)
}

export default defineCommand({
  name: 'timer',
  aliases: ['timers'],
  profileRequired: true,
  async execute({ client, message, isBuyer }) {
    const lines = DISPLAYED_COMMANDS.map(({ label, name, fallbackMs }) => {
      const cooldownMs = resolveCooldownMs(client, name, fallbackMs)
      const status = resolveStatus({
        client,
        guildId: message.guild.id,
        userId: message.author.id,
        commandName: name,
        cooldownMs,
        isBuyer,
      })
      return `• **${label} :** ${status}`
    })

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#2b2d31')
          .setTitle('Temps restant des commandes')
          .setDescription(['**Casino :**', ...lines].join('\n')),
      ],
    })
  },
})
