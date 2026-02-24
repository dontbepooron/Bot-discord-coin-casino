import { defineCommand } from '../../utils/commandHelpers.js'
import { formatCoinsBackticks } from '../../utils/format.js'

export default defineCommand({
  name: 'resetallcoins',
  aliases: ['coinsresetall'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const rows = client.store.listGuildUsersWithProfile(message.guild.id, { minCoins: 1 })
    if (!rows.length) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Aucun utilisateur avec profil ne possède de coins à reset.') })],
      })
    }

    let totalReset = 0
    let usersReset = 0

    for (const row of rows) {
      const userId = String(row.user_id || '').trim()
      const coins = Math.max(0, Number.parseInt(row.coins, 10) || 0)
      if (!userId || coins <= 0) continue

      client.store.addBalance(message.guild.id, userId, { coinsDelta: -coins }, {
        source: 'admin:reset_all_coins',
        reason: `Reset global coins par ${message.author.id}`,
        actorId: message.author.id,
        metadata: {
          resetAmount: coins,
        },
      })

      totalReset += coins
      usersReset += 1
    }

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: [
            status(true, 'Reset global des coins effectué.'),
            `Utilisateurs impactés: **${usersReset}**`,
            `Total retiré: ${formatCoinsBackticks(client.config, totalReset)}`,
          ].join('\n'),
        }),
      ],
    })
  },
})

