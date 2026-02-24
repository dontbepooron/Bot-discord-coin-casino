/**
 * Shared giveaway helpers for command consistency and safety.
 */
import { parseIntInRange, safeTrim } from './commandToolkit.js';

const MESSAGE_LINK_PATTERN =
  /(?:https?:\/\/)?(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})$/i;

// Keep below Node.js setTimeout max (~24.8 days) to avoid overflow.
export const MAX_GIVEAWAY_DURATION_MS = 24 * 24 * 60 * 60 * 1000;

export function parseGiveawayMessageRef(input) {
  const raw = safeTrim(input, 500);
  if (!raw) return null;

  const linkMatch = raw.match(MESSAGE_LINK_PATTERN);
  if (linkMatch) {
    return {
      guildId: linkMatch[1],
      channelId: linkMatch[2],
      messageId: linkMatch[3]
    };
  }

  const idMatch = raw.match(/\d{17,20}$/);
  if (!idMatch) return null;
  return { messageId: idMatch[0] };
}

export async function resolveGiveawayMessage(message, reference) {
  if (!message?.guild || !reference?.messageId) return null;

  const channelId = reference.channelId || message.channel.id;
  const channel = message.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased?.()) return null;

  return channel.messages.fetch(reference.messageId).catch(() => null);
}

export async function findRecentGiveawayMessage(channel, limit = 50) {
  if (!channel?.messages?.fetch) return null;
  const fetched = await channel.messages.fetch({ limit }).catch(() => null);
  if (!fetched) return null;
  return fetched.find((msg) => msg.reactions?.cache?.has('🎉')) || null;
}

export async function pickGiveawayWinners(giveawayMessage, winnersCount = 1) {
  const reaction = giveawayMessage?.reactions?.resolve?.('🎉');
  const users = await reaction?.users?.fetch?.().catch(() => null);
  const entrants = users ? users.filter((user) => !user.bot) : null;
  if (!entrants || entrants.size === 0) return [];

  const count = Math.max(1, Math.min(Number(winnersCount) || 1, entrants.size));
  const winners = entrants.random(count);
  return Array.isArray(winners) ? winners : [winners];
}

export function parseWinnersCountFromGiveawayMessage(giveawayMessage) {
  const text =
    safeTrim(giveawayMessage?.embeds?.[0]?.description || '', 2000) ||
    safeTrim(giveawayMessage?.content || '', 2000);
  const match = text.match(/Gagnants?:\s*(\d+)/i);
  const parsed = parseIntInRange(match?.[1], 1, 50);
  return parsed ?? 1;
}
