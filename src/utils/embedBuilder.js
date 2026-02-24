import { EmbedBuilder } from 'discord.js'

function resolveColor(config, variant) {
  const palette = config?.embedColor || {}
  if (variant === 'success') return palette.success || '#2ecc71'
  if (variant === 'error') return palette.error || '#e74c3c'
  if (variant === 'warn' || variant === 'warning') return palette.warning || '#f39c12'
  if (variant === 'info') return palette.info || '#3498db'
  return palette.default || '#1f8bff'
}

export function buildEmbed(configOrOptions, maybeOptions = null) {
  const options = maybeOptions || configOrOptions || {}
  const config = maybeOptions ? configOrOptions : null

  const {
    variant = 'default',
    title = null,
    description = null,
    fields = [],
    footer = null,
    thumbnail = null,
    image = null,
    timestamp = true,
  } = options

  const embed = new EmbedBuilder().setColor(resolveColor(config, variant))

  if (title) embed.setTitle(String(title).slice(0, 256))
  if (description) embed.setDescription(String(description).slice(0, 4096))
  if (Array.isArray(fields) && fields.length) {
    embed.setFields(
      fields.map((field) => ({
        name: String(field.name || '').slice(0, 256),
        value: String(field.value || '').slice(0, 1024),
        inline: Boolean(field.inline),
      }))
    )
  }

  if (footer) {
    embed.setFooter({ text: String(footer).slice(0, 2048) })
  }

  if (thumbnail) embed.setThumbnail(thumbnail)
  if (image) embed.setImage(image)
  if (timestamp) embed.setTimestamp(new Date())

  return embed
}

export function withStatusEmoji(configOrOk, okOrText, maybeText) {
  let config = configOrOk
  let ok = okOrText
  let text = maybeText

  if (typeof configOrOk === 'boolean') {
    config = null
    ok = configOrOk
    text = okOrText
  }

  const emojiSet = config?.statusEmoji || {}
  const emoji = ok ? emojiSet.success || '✅' : emojiSet.error || '❌'
  return `${emoji} ${text}`
}
