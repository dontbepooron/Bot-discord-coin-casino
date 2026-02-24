import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'ownerlist',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed }) {
    const owners = client.store.listOwners()
    if (!owners.length) {
      return message.reply({
        embeds: [embed({ variant: 'info', description: 'Aucun owner enregistré.' })],
      })
    }

    const lines = owners.slice(0, 50).map((row, index) => `${index + 1}. <@${row.user_id}> • ajouté par <@${row.added_by || '0'}>`)
    return message.reply({
      embeds: [embed({ variant: 'info', title: 'Owners', description: lines.join('\n') })],
      allowedMentions: { users: owners.map((row) => row.user_id), parse: [] },
    })
  },
})
