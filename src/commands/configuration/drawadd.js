import { defineCommand } from '../../utils/commandHelpers.js'
import { parseRoleId } from '../../utils/commandToolkit.js'
import { formatDrawItemAdminLine } from '../../utils/setupPanelManager.js'

export default defineCommand({
  name: 'drawadd',
  aliases: ['tirageadd'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const category = String(args[0] || '').toLowerCase()
    const weight = Number.parseFloat(args[1] || '')
    const rewardType = String(args[2] || '').toLowerCase()
    const rewardValueRaw = String(args[3] || '')
    const name = args.slice(4).join(' ').trim()

    if (!category || !Number.isFinite(weight) || weight <= 0 || !rewardType || !name) {
      return message.reply({
        embeds: [
          embed({
            variant: 'error',
            description: status(false, 'Usage: +drawadd {categorie} {weight} {rewardType} {rewardValue} {nom...}'),
          }),
        ],
      })
    }

    const roleId = rewardType === 'role' ? (parseRoleId(rewardValueRaw) || null) : null
    const rewardValue = rewardType === 'role' ? (roleId || rewardValueRaw) : rewardValueRaw

    const created = client.store.addCasinoDrawItem(
      message.guild.id,
      {
        name,
        category,
        weight,
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
            status(true, 'Item de tirage ajouté.'),
            formatDrawItemAdminLine(created.item),
          ].join('\n'),
        }),
      ],
    })
  },
})
