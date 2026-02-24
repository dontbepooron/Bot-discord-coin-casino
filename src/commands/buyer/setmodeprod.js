import { defineCommand } from '../../utils/commandHelpers.js'
import { setBotMode } from '../../utils/botMode.js'

export default defineCommand({
  name: 'setmodeprod',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    setBotMode(client, 'prod')
    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(true, 'Mode PROD activé. Les cooldowns buyer sont rétablis.'),
        }),
      ],
    })
  },
})
