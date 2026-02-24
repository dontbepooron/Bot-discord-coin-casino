import { buildEmbed, withStatusEmoji } from '../../utils/embedBuilder.js';
import { ensureCommandAccess } from '../../utils/accessGuards.js';
import {
  ensureGiveawayTables,
  getRecentGiveawayInChannel,
  rerollGiveawayByMessageId
} from '../../utils/giveawayManager.js';
import { parseGiveawayMessageRef } from '../../utils/giveawayUtils.js';
import { ensureGuild, parseIntInRange, safeTrim } from '../../utils/commandToolkit.js';

import { defineUtilsCommand } from '../../utils/commandHelpers.js';

const COIN_NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR');

function formatCoins(giveaway, amount) {
  const value = Math.max(0, Number.parseInt(amount, 10) || 0);
  const formatted = COIN_NUMBER_FORMATTER.format(value);
  const emoji = safeTrim(giveaway?.currency_emoji, 64);
  return emoji ? `${formatted} ${emoji}` : `${formatted} 🪙`;
}

function formatPayoutSummary(giveaway, payouts = [], maxRows = 6) {
  if (!Array.isArray(payouts) || payouts.length === 0) return null;
  const preview = payouts
    .slice(0, Math.max(1, maxRows))
    .map((row) => `<@${row.user_id}>: ${formatCoins(giveaway, row.amount)}`);
  if (payouts.length > preview.length) {
    preview.push(`+${payouts.length - preview.length} autre(s)`);
  }
  return preview.join(' • ');
}

export default defineUtilsCommand({
  name: 'reroll',
  aliases: ['gawreroll', 'rerollgaw'],
  requiredLevel: 2,
  async run(client, message, args) {
    const access = ensureCommandAccess(client, message, this);
    if (!access.ok) return access.reply;
    const guildGuard = ensureGuild({ message });
    if (!guildGuard.ok) {
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Commande serveur uniquement.') })]
      });
    }
    if (!client?.db?.prepare) {
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Service DB indisponible.') })]
      });
    }

    const setup = ensureGiveawayTables(client.db);
    if (!setup.ok) {
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Impossible d’initialiser le système giveaway.') })]
      });
    }

    const reference = parseGiveawayMessageRef(args[0] || '');
    const requestedWinners = parseIntInRange(args[1], 1, 50);
    let messageId = reference?.messageId || null;
    if (!messageId) {
      const recentEnded = getRecentGiveawayInChannel(client.db, guildGuard.guild.id, message.channelId, 'ended');
      messageId = recentEnded?.message_id || null;
    }
    if (!messageId) {
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Usage: +reroll <messageId|lien> [gagnants]') })]
      });
    }

    const rerolled = await rerollGiveawayByMessageId(client, messageId, requestedWinners, message.author.id);
    if (!rerolled.ok) {
      const map = {
        not_found: 'Giveaway introuvable.',
        not_ended: 'Ce giveaway n’est pas terminé. Termine-le d’abord.',
        draw_failed: 'Reroll impossible.'
      };
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, map[rerolled.reason] || 'Reroll impossible.') })]
      });
    }

    return message.reply({
      embeds: [
        buildEmbed({
          variant: 'success',
          title: 'Giveaway reroll',
          description:
            `Message: ${safeTrim(rerolled.giveaway.message_id, 32)}\n` +
            `Gain total: ${formatCoins(rerolled.giveaway, rerolled.giveaway.reward_coins)}\n` +
            (rerolled.winners.length
              ? `Nouveaux gagnants: ${rerolled.winners.map((id) => `<@${id}>`).join(', ')}\n`
                + `Distribution: ${formatPayoutSummary(rerolled.giveaway, rerolled.payouts) || 'non disponible'}`
              : 'Aucun gagnant disponible.')
        })
      ],
      allowedMentions: { users: rerolled.winners, roles: [], parse: [] }
    });
  }
});
