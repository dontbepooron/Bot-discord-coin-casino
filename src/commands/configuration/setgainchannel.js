import { defineCommand } from '../../utils/commandHelpers.js'
import { parseChannelId } from '../../utils/commandToolkit.js'
import { setGainChannel } from '../../utils/gainSystem.js'
import { setLogChannel } from '../../utils/logSystem.js'

export default defineCommand({
  name: 'setgainchannel',
  aliases: ['gainchannel'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const channelId = parseChannelId(args[0] || '')
    if (!channelId) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +setgainchannel {#salon}') })],
      })
    }

    const channel = message.guild.channels.cache.get(channelId)
    if (!channel?.isTextBased?.()) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Salon invalide ou non textuel.') })],
      })
    }

    setGainChannel(client, message.guild.id, channelId)
    setLogChannel(client, message.guild.id, 'gains', channelId, message.author.id)

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(true, `Salon de logs de gains défini sur ${channel}.`),
        }),
      ],
      allowedMentions: { roles: [], users: [], parse: [] },
    })
  },
})
