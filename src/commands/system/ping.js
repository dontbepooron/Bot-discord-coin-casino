import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'ping',
  aliases: [],
  profileRequired: false,
  async execute({ client, message, embed }) {
    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          description: `Pong: **${client.ws.ping}ms**`,
        }),
      ],
    })
  },
})
