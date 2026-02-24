import { defineCommand } from '../../utils/commandHelpers.js'
import { formatShopItemAdminLine } from '../../utils/setupPanelManager.js'

export default defineCommand({
  name: 'shoplist',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const items = client.store.listCasinoShopItems(message.guild.id, { enabledOnly: false })
    if (!items.length) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Aucun item boutique configuré.') })],
      })
    }

    const lines = items.slice(0, 40).map((item) => formatShopItemAdminLine(item, client.config))
    if (items.length > lines.length) lines.push(`+${items.length - lines.length} item(s)`)

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: `Shop (${items.length})`,
          description: lines.join('\n').slice(0, 4000),
        }),
      ],
    })
  },
})
