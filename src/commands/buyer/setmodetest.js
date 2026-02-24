import { defineCommand } from '../../utils/commandHelpers.js'
import { setBotMode } from '../../utils/botMode.js'

export default defineCommand({
  name: 'setmodetest',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    setBotMode(client, 'test')
    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(true, 'Mode TEST activé. Le buyer ignore désormais les cooldowns.'),
        }),
      ],
    })
  },
})
