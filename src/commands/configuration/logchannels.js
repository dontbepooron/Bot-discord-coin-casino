import { defineCommand } from '../../utils/commandHelpers.js'
import { getLogChannelMap, listLogTypes } from '../../utils/logSystem.js'

export default defineCommand({
  name: 'logchannels',
  aliases: ['logsmap'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed }) {
    const mapping = getLogChannelMap(client, message.guild.id)
    const lines = listLogTypes().map((item) => {
      const channelId = mapping.get(item.key)
      return `• \`${item.key}\` -> ${channelId ? `<#${channelId}>` : 'Non défini'}`
    })

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: 'Mappings Logs',
          description: lines.join('\n').slice(0, 4096),
        }),
      ],
      allowedMentions: { parse: [], users: [], roles: [] },
    })
  },
})
