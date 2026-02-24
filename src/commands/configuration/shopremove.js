import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'shopremove',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const itemId = Number.parseInt(args[0] || '', 10)
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +shopremove {id}') })],
      })
    }

    const ok = client.store.removeCasinoShopItem(message.guild.id, itemId)
    return message.reply({
      embeds: [
        embed({
          variant: ok ? 'success' : 'warning',
          description: ok
            ? status(true, `Item boutique #${itemId} supprimé.`)
            : status(false, `Item #${itemId} introuvable.`),
        }),
      ],
    })
  },
})
