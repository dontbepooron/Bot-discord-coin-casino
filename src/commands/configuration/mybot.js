import { defineCommand } from '../../utils/commandHelpers.js'

export default defineCommand({
  name: 'mybot',
  aliases: ['botinfo'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed }) {
    const guilds = client.guilds.cache.size
    const users = client.users.cache.size
    const commands = client.commands.size

    return message.reply({
      embeds: [
        embed({
          variant: 'info',
          title: 'Informations Bot',
          description: [
            `Nom: **${client.user.tag}**`,
            `Serveurs: **${guilds}**`,
            `Utilisateurs en cache: **${users}**`,
            `Commandes chargées: **${commands}**`,
            `Base: **better-sqlite3**`,
            `Monnaie: **${client.config.currency?.coinEmoji || '🪙'}**`,
          ].join('\n'),
          thumbnail: client.user.displayAvatarURL({ size: 256 }),
        }),
      ],
    })
  },
})
