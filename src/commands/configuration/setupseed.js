import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'setupseed',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    client.store.seedCasinoSetupDefaults(message.guild.id, message.author.id)
    return message.reply({
      embeds: [embed({ variant: 'success', description: status(true, 'Seed setup appliqué (shop + tirages par défaut).') })],
    })
  },
})
