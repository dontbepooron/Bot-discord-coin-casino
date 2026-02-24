import { defineCommand } from '../../utils/commandHelpers.js'
import { createAutoLogs, getLogChannelMap, listLogTypes } from '../../utils/logSystem.js'
import { setGainChannel } from '../../utils/gainSystem.js'

export default defineCommand({
  name: 'autologs',
  aliases: ['setupautologs'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const result = await createAutoLogs(client, message.guild, message.author.id)
    if (!result.ok) {
      const reason = result.reason === 'missing_manage_channels'
        ? 'Permission manquante: `Manage Channels`.'
        : 'Impossible de créer la structure auto logs.'

      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, reason) })],
      })
    }

    const channels = getLogChannelMap(client, message.guild.id)
    const gainsChannelId = channels.get('gains')
    if (gainsChannelId) {
      setGainChannel(client, message.guild.id, gainsChannelId)
    }
    const lines = listLogTypes().map((meta) => {
      const channelId = channels.get(meta.key)
      return `• \`${meta.key}\`: ${channelId ? `<#${channelId}>` : 'Non défini'}`
    })

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          title: 'Auto Logs configuré',
          description: [
            status(true, `Catégorie créée/validée: <#${result.categoryId}>`),
            `Salons créés: **${result.created}**`,
            `Mappings appliqués: **${result.mapped}/${result.total}**`,
            '',
            ...lines,
          ].join('\n'),
        }),
      ],
      allowedMentions: { parse: [], users: [], roles: [] },
    })
  },
})
