import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'blacklist',
  aliases: ['blist'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed }) {
    const rows = client.store.listBlacklist()
    if (!rows.length) {
      return message.reply({ embeds: [embed({ variant: 'info', description: 'Blacklist vide.' })] })
    }

    const now = Math.floor(Date.now() / 1000)
    const lines = rows.slice(0, 60).map((row, i) => {
      const duration = row.expires_at ? `jusqu’à <t:${row.expires_at}:R>` : 'permanent'
      const type = row.type === 'temporary' ? 'temporaire' : 'permanent'
      return `${i + 1}. <@${row.user_id}> • ${type} • ${duration}`
    })

    void now

    return message.reply({
      embeds: [embed({ variant: 'info', title: 'Blacklist', description: lines.join('\n').slice(0, 3900) })],
      allowedMentions: { users: rows.map((row) => row.user_id), parse: [] },
    })
  },
})
