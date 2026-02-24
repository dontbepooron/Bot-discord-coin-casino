import { defineCommand } from '../../utils/commandHelpers.js'
import { parseChannelId } from '../../utils/commandToolkit.js'
import { isValidLogType, listLogTypes, setLogChannel } from '../../utils/logSystem.js'

export default defineCommand({
  name: 'setlogchannel',
  aliases: ['logchannel'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const logType = String(args[0] || '').trim().toLowerCase()
    const channelId = parseChannelId(args[1] || '')
    if (!isValidLogType(logType) || !channelId) {
      const allowed = listLogTypes().map((item) => `\`${item.key}\``).join(', ')
      return message.reply({
        embeds: [
          embed({
            variant: 'error',
            description: [
              status(false, `Usage: +setlogchannel {type} {#salon}`),
              `Types: ${allowed}`,
            ].join('\n'),
          }),
        ],
      })
    }

    const channel = message.guild.channels.cache.get(channelId)
    if (!channel?.isTextBased?.()) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Salon invalide ou non textuel.') })],
      })
    }

    const set = setLogChannel(client, message.guild.id, logType, channel.id, message.author.id)
    if (!set.ok) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Impossible de sauvegarder ce mapping log.') })],
      })
    }

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(true, `Type \`${logType}\` associé à ${channel}.`),
        }),
      ],
      allowedMentions: { parse: [], users: [], roles: [] },
    })
  },
})
