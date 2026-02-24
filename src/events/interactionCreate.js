import { handleSetupPanelInteraction } from '../utils/setupPanelManager.js'
import { runWithRequestContext } from '../utils/requestContext.js'
import { takeBurstHit } from '../utils/runtimeGuards.js'

function isRateLimitedInteraction(interaction) {
  return interaction?.isButton?.()
    || interaction?.isStringSelectMenu?.()
    || interaction?.isModalSubmit?.()
}

export default {
  name: 'interactionCreate',
  async execute(client, interaction) {
    if (interaction?.user?.bot) return

    if (interaction.guildId && isRateLimitedInteraction(interaction)) {
      const burst = takeBurstHit(client, {
        bucket: 'interactions',
        key: `${interaction.guildId}:${interaction.user?.id || 'unknown'}`,
        windowMs: client.config?.security?.interactionBurstWindowMs ?? 5_000,
        maxHits: client.config?.security?.interactionBurstMax ?? 12,
        blockMs: client.config?.security?.interactionBurstBlockMs ?? 10_000,
        notifyEveryMs: client.config?.security?.interactionBurstNotifyMs ?? 4_000,
      })

      if (!burst.allowed) {
        if (burst.shouldNotify && !interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: `Trop d’actions envoyées trop vite. Réessaie dans ${Math.ceil(burst.retryAfterMs / 1000)}s.`,
            ephemeral: true,
          }).catch(() => null)
        }
        return
      }
    }

    const requestContext = {
      guildId: interaction.guildId || null,
      channelId: interaction.channelId || null,
      messageId: interaction.message?.id || null,
      actorId: interaction.user?.id || null,
      commandName: interaction.isChatInputCommand?.()
        ? interaction.commandName
        : `interaction:${String(interaction.customId || interaction.type || 'unknown').slice(0, 60)}`,
    }

    const setupHandled = await runWithRequestContext(requestContext, async () => (
      handleSetupPanelInteraction(client, interaction).catch(() => false)
    ))
    if (setupHandled) return

    if (client.handleGiveawayButtonInteraction && interaction.isButton()) {
      const handled = await runWithRequestContext(requestContext, async () => (
        client.handleGiveawayButtonInteraction(interaction).catch(() => false)
      ))
      if (handled) return
    }
  },
}
