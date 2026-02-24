import { defineCommand } from '../../utils/commandHelpers.js'
import { parseRoleId } from '../../utils/commandToolkit.js'
import { formatShopItemAdminLine } from '../../utils/setupPanelManager.js'

export default defineCommand({
  name: 'shopadd',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const category = String(args[0] || '').toLowerCase()
    const price = Number.parseInt(args[1] || '', 10)
    const rewardType = String(args[2] || '').toLowerCase()
    const rewardValueRaw = String(args[3] || '')
    const name = args.slice(4).join(' ').trim()

    if (!category || !Number.isInteger(price) || price < 0 || !rewardType || !name) {
      return message.reply({
        embeds: [
          embed({
            variant: 'error',
            description: status(false, 'Usage: +shopadd {categorie} {prix} {rewardType} {rewardValue} {nom...}'),
          }),
        ],
      })
    }

    const roleId = rewardType === 'role' ? (parseRoleId(rewardValueRaw) || null) : null
    const rewardValue = rewardType === 'role' ? (roleId || rewardValueRaw) : rewardValueRaw

    const created = client.store.addCasinoShopItem(
      message.guild.id,
      {
        name,
        category,
        price,
        rewardType,
        rewardValue,
        roleId,
      },
      message.author.id
    )

    if (!created.ok) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Impossible d’ajouter l’item (${created.reason || 'unknown'}).`) })],
      })
    }

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: [
            status(true, 'Item boutique ajouté.'),
            formatShopItemAdminLine(created.item, client.config),
          ].join('\n'),
        }),
      ],
    })
  },
})
