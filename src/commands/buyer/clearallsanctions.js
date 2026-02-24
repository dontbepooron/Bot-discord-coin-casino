import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'clearallsanctions',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const count = client.store.clearAllSanctions()
    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(true, `Toutes les sanctions ont été supprimées (${count} entrées).`),
        }),
      ],
    })
  },
})
