import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'drawremove',
  aliases: ['tirageremove'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const itemId = Number.parseInt(args[0] || '', 10)
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +drawremove {id}') })],
      })
    }

    const ok = client.store.removeCasinoDrawItem(message.guild.id, itemId)
    return message.reply({
      embeds: [
        embed({
          variant: ok ? 'success' : 'warning',
          description: ok
            ? status(true, `Item tirage #${itemId} supprimé.`)
            : status(false, `Item #${itemId} introuvable.`),
        }),
      ],
    })
  },
})
