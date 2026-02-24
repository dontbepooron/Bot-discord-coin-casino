import {
  PermissionFlagsBits,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'
import { parseChannelId } from '../../utils/commandToolkit.js'
import { sendSetupPanelMessage } from '../../utils/setupPanelManager.js'

export default defineCommand({
  name: 'setup',
  aliases: [],
  buyerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const askedChannelId = parseChannelId(args[0] || '')
    const targetChannel = askedChannelId
      ? message.guild.channels.cache.get(askedChannelId)
      : message.channel

    if (!targetChannel?.isTextBased?.()) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Salon cible invalide.') })],
      })
    }

    const me = message.guild.members.me
    const perms = targetChannel.permissionsFor(me)
    const required = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
    ]
    if (targetChannel.isThread?.()) {
      required.push(PermissionFlagsBits.SendMessagesInThreads)
    }

    const missing = required.filter((perm) => !perms?.has(perm))
    if (missing.length) {
      const labels = missing.map((perm) => {
        if (perm === PermissionFlagsBits.ViewChannel) return 'ViewChannel'
        if (perm === PermissionFlagsBits.SendMessages) return 'SendMessages'
        if (perm === PermissionFlagsBits.EmbedLinks) return 'EmbedLinks'
        if (perm === PermissionFlagsBits.AttachFiles) return 'AttachFiles'
        if (perm === PermissionFlagsBits.SendMessagesInThreads) return 'SendMessagesInThreads'
        return String(perm)
      })
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, `Permissions manquantes dans ${targetChannel}: ${labels.join(', ')}`) })],
      })
    }

    let sent = null
    let sendError = null
    try {
      sent = await sendSetupPanelMessage({
        client,
        guild: message.guild,
        channel: targetChannel,
        authorId: message.author.id,
      })
    } catch (error) {
      sendError = error
    }

    if (!sent) {
      return message.reply({
        embeds: [
          embed({
            variant: 'error',
            description: status(false, `Impossible d’envoyer l’interface setup. ${sendError?.message || 'Erreur inconnue.'}`),
          }),
        ],
      })
    }

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: status(true, `Interface setup créée dans <#${sent.channelId}>.`),
        }),
      ],
      allowedMentions: { roles: [], users: [], parse: [] },
    })
  },
})
