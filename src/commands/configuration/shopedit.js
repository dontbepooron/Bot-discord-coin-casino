import { defineCommand } from '../../utils/commandHelpers.js'
import { parseRoleId } from '../../utils/commandToolkit.js'
import { formatShopItemAdminLine } from '../../utils/setupPanelManager.js'

function parseBoolean(value) {
  const raw = String(value || '').toLowerCase()
  if (['1', 'true', 'on', 'yes', 'oui'].includes(raw)) return true
  if (['0', 'false', 'off', 'no', 'non'].includes(raw)) return false
  return null
}

export default defineCommand({
  name: 'shopedit',
  aliases: [],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const itemId = Number.parseInt(args[0] || '', 10)
    const field = String(args[1] || '').toLowerCase()
    const rawValue = args.slice(2).join(' ').trim()

    if (!Number.isInteger(itemId) || itemId <= 0 || !field || !rawValue) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +shopedit {id} {champ} {valeur}') })],
      })
    }

    const patch = {}
    if (field === 'name') patch.name = rawValue
    else if (field === 'category') patch.category = rawValue
    else if (field === 'price') patch.price = Number.parseInt(rawValue, 10)
    else if (field === 'rewardtype') patch.rewardType = rawValue
    else if (field === 'rewardvalue') patch.rewardValue = rawValue
    else if (field === 'roleid') patch.roleId = parseRoleId(rawValue) || rawValue
    else if (field === 'emoji') patch.emoji = rawValue
    else if (field === 'enabled') patch.enabled = parseBoolean(rawValue)
    else if (field === 'sort' || field === 'sortorder') patch.sortOrder = Number.parseInt(rawValue, 10)
    else {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Champs autorisés: name, category, price, rewardType, rewardValue, roleId, emoji, enabled, sort') })],
      })
    }

    if (patch.enabled == null && field === 'enabled') {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Valeur enabled invalide (on/off).') })],
      })
    }

    const updated = client.store.updateCasinoShopItem(message.guild.id, itemId, patch)
    if (!updated.ok) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Modification impossible (${updated.reason || 'unknown'}).`) })],
      })
    }

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: [
            status(true, `Item #${itemId} modifié.`),
            formatShopItemAdminLine(updated.item, client.config),
          ].join('\n'),
        }),
      ],
    })
  },
})
