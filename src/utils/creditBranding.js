import {
  ActivityType,
  BaseGuildTextChannel,
  DMChannel,
  EmbedBuilder,
  InteractionResponse,
  Message,
  Webhook,
  WebhookClient,
} from 'discord.js'
import * as djs from 'discord.js'

const CREDIT_SIGNATURE = 'développé par dvm #🇵🇸'
const WRAPPED = Symbol('casino_credit_wrapped')

const FOOTER_VARIANTS = [
  `${CREDIT_SIGNATURE}`,
  `Casino officiel • ${CREDIT_SIGNATURE}`,
  `NozCoins system • ${CREDIT_SIGNATURE}`,
  `Interface casino • ${CREDIT_SIGNATURE}`,
  `Support premium • ${CREDIT_SIGNATURE}`,
]

function pickDifferentVariant(variants = [], previousIndex = -1) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return { text: CREDIT_SIGNATURE, index: 0 }
  }

  if (variants.length === 1) {
    return { text: variants[0], index: 0 }
  }

  let idx = Math.floor(Math.random() * variants.length)
  if (idx === previousIndex) {
    idx = (idx + 1 + Math.floor(Math.random() * (variants.length - 1))) % variants.length
  }

  return { text: variants[idx], index: idx }
}

function resolveFooterCredit(client) {
  const runtime = client.runtime || (client.runtime = {})
  const picked = pickDifferentVariant(FOOTER_VARIANTS, runtime.creditFooterIndex ?? -1)
  runtime.creditFooterIndex = picked.index
  return picked.text
}

function trimFooter(text) {
  return String(text || '').slice(0, 2048)
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  return payload
}

function toEmbedBuilder(input) {
  if (input instanceof EmbedBuilder) return input

  if (typeof EmbedBuilder.from === 'function') {
    try {
      return EmbedBuilder.from(input)
    } catch {
      // fallback below
    }
  }

  try {
    return new EmbedBuilder(input || {})
  } catch {
    return new EmbedBuilder()
  }
}

function decorateEmbed(embedInput, creditText) {
  const embed = toEmbedBuilder(embedInput)
  const footer = embed.data?.footer || null
  const currentFooterText = String(footer?.text || '').trim()

  if (currentFooterText.includes(CREDIT_SIGNATURE)) {
    return embed
  }

  const iconURL = footer?.icon_url || footer?.iconURL || null
  const nextFooterText = currentFooterText
    ? `${currentFooterText} • ${creditText}`
    : creditText

  if (iconURL) {
    embed.setFooter({ text: trimFooter(nextFooterText), iconURL })
  } else {
    embed.setFooter({ text: trimFooter(nextFooterText) })
  }

  return embed
}

function decoratePayloadEmbeds(client, payload) {
  const normalized = normalizePayload(payload)
  if (!normalized?.embeds || !Array.isArray(normalized.embeds) || normalized.embeds.length === 0) {
    return payload
  }

  const creditText = resolveFooterCredit(client)
  const nextEmbeds = normalized.embeds.map((entry) => decorateEmbed(entry, creditText))
  return {
    ...normalized,
    embeds: nextEmbeds,
  }
}

function wrapPrototypeMethod(client, prototype, methodName) {
  const original = prototype?.[methodName]
  if (typeof original !== 'function') return
  if (original[WRAPPED]) return

  const wrapped = function wrappedCreditPayload(...args) {
    if (args.length > 0 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      args[0] = decoratePayloadEmbeds(client, args[0])
    }

    return original.apply(this, args)
  }

  wrapped[WRAPPED] = true
  prototype[methodName] = wrapped
}

function buildStatusVariants(client) {
  const serverName = String(client?.config?.servername || 'Casino').trim() || 'Casino'
  const customActivity = String(client?.store?.getGlobalBotProfile?.()?.activity || '').trim()
  const base = customActivity || serverName

  return [
    `${base} • ${CREDIT_SIGNATURE}`,
    `NozCoins actifs • ${CREDIT_SIGNATURE}`,
    `Casino en ligne • ${CREDIT_SIGNATURE}`,
    `Interface premium • ${CREDIT_SIGNATURE}`,
    `Support dvm #🇵🇸 • ${CREDIT_SIGNATURE}`,
  ]
}

export async function applyCreditedActivity(client) {
  if (!client?.user?.setActivity) return null

  const runtime = client.runtime || (client.runtime = {})
  const variants = buildStatusVariants(client)
  const picked = pickDifferentVariant(variants, runtime.creditStatusIndex ?? -1)
  runtime.creditStatusIndex = picked.index

  try {
    const maybePromise = client.user.setActivity(picked.text, { type: ActivityType.Playing })
    if (maybePromise && typeof maybePromise.then === 'function') {
      await maybePromise
    }
  } catch {
    // Ignore activity failures to avoid crashing startup.
  }
  return picked.text
}

export function startCreditStatusRotation(client) {
  const runtime = client.runtime || (client.runtime = {})
  if (runtime.creditStatusInterval) {
    clearInterval(runtime.creditStatusInterval)
    runtime.creditStatusInterval = null
  }

  const intervalMsRaw = Number.parseInt(client?.config?.branding?.statusRotateMs, 10)
  const intervalMs = Number.isInteger(intervalMsRaw) && intervalMsRaw >= 30_000
    ? intervalMsRaw
    : 120_000

  void applyCreditedActivity(client)

  const interval = setInterval(() => {
    void applyCreditedActivity(client)
  }, intervalMs)

  if (typeof interval.unref === 'function') {
    interval.unref()
  }

  runtime.creditStatusInterval = interval
}

export function installCreditBranding(client) {
  const runtime = client.runtime || (client.runtime = {})
  if (runtime.creditBrandingInstalled) return

  wrapPrototypeMethod(client, Message.prototype, 'reply')
  wrapPrototypeMethod(client, Message.prototype, 'edit')
  wrapPrototypeMethod(client, BaseGuildTextChannel?.prototype, 'send')
  wrapPrototypeMethod(client, DMChannel?.prototype, 'send')
  wrapPrototypeMethod(client, Webhook?.prototype, 'send')
  wrapPrototypeMethod(client, Webhook?.prototype, 'edit')
  wrapPrototypeMethod(client, WebhookClient?.prototype, 'send')
  wrapPrototypeMethod(client, WebhookClient?.prototype, 'edit')
  wrapPrototypeMethod(client, InteractionResponse?.prototype, 'edit')

  for (const [name, exported] of Object.entries(djs)) {
    if (!name.endsWith('Interaction')) continue
    if (typeof exported !== 'function' || !exported.prototype) continue

    wrapPrototypeMethod(client, exported.prototype, 'reply')
    wrapPrototypeMethod(client, exported.prototype, 'followUp')
    wrapPrototypeMethod(client, exported.prototype, 'update')
    wrapPrototypeMethod(client, exported.prototype, 'editReply')
  }

  runtime.creditBrandingInstalled = true
}

export { CREDIT_SIGNATURE }
