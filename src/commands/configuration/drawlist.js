import { defineCommand } from '../../utils/commandHelpers.js'
import { formatDrawItemAdminLine } from '../../utils/setupPanelManager.js'

export default defineCommand({
  name: 'drawlist',
  aliases: ['tiragelist'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const items = client.store.listCasinoDrawItems(message.guild.id, { enabledOnly: false })
    if (!items.length) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Aucun item de tirage configuré.') })],
      })
    }

    const lines = items.slice(0, 50).map((item) => formatDrawItemAdminLine(item))
    if (items.length > lines.length) lines.push(`+${items.length - lines.length} item(s)`)

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: `Tirages (${items.length})`,
          description: lines.join('\n').slice(0, 4000),
        }),
      ],
    })
  },
})
