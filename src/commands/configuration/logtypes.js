import { defineCommand } from '../../utils/commandHelpers.js'
import { listLogTypes } from '../../utils/logSystem.js'

export default defineCommand({
  name: 'logtypes',
  aliases: ['typeslogs'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ message, embed }) {
    const lines = listLogTypes().map((item) => (
      `• \`${item.key}\` — ${item.description} (salon auto: \`${item.channelName}\`)`
    ))

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: 'Types de Logs',
          description: lines.join('\n').slice(0, 4096),
        }),
      ],
    })
  },
})
