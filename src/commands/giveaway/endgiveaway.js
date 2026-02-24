import { buildEmbed, withStatusEmoji } from '../../utils/embedBuilder.js';
import { ensureCommandAccess } from '../../utils/accessGuards.js';
import {
  endGiveawayByMessageId,
  ensureGiveawayTables,
  getRecentGiveawayInChannel
} from '../../utils/giveawayManager.js';
import { parseGiveawayMessageRef } from '../../utils/giveawayUtils.js';
import { ensureGuild, safeTrim } from '../../utils/commandToolkit.js';

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
  name: 'endgiveaway',
  aliases: ['endgaw', 'end-giveaway'],
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

    const first = safeTrim(args[0], 120).toLowerCase();
    const referenceArg = first === 'giveaway' ? args[1] : args[0];
    let messageId = parseGiveawayMessageRef(referenceArg)?.messageId || null;
    if (!messageId) {
      const recent = getRecentGiveawayInChannel(client.db, guildGuard.guild.id, message.channelId, 'active');
      messageId = recent?.message_id || null;
    }

    if (!messageId) {
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, 'Usage: +endgiveaway <messageId|lien>') })]
      });
    }

    const ended = await endGiveawayByMessageId(client, messageId, message.author.id);
    if (!ended.ok) {
      const map = {
        not_found: 'Giveaway introuvable.',
        locked: 'Giveaway déjà en cours de clôture.',
        already_finished: 'Ce giveaway est déjà terminé.',
        draw_failed: 'Tirage impossible.',
        update_failed: 'Impossible de terminer le giveaway.'
      };
      return message.reply({
        embeds: [buildEmbed({ variant: 'error', description: withStatusEmoji(false, map[ended.reason] || 'Fin forcée impossible.') })]
      });
    }

    return message.reply({
      embeds: [
        buildEmbed({
          variant: 'success',
          title: 'Giveaway terminé',
          description: ended.winners.length
            ? `Message: ${ended.giveaway.message_id}\n`
              + `Gain total: ${formatCoins(ended.giveaway, ended.giveaway.reward_coins)}\n`
              + `Gagnants: ${ended.winners.map((id) => `<@${id}>`).join(', ')}\n`
              + `Distribution: ${formatPayoutSummary(ended.giveaway, ended.payouts) || 'non disponible'}`
            : `Message: ${ended.giveaway.message_id}\nAucun gagnant (pas de participant).`
        })
      ],
      allowedMentions: { users: ended.winners, roles: [], parse: [] }
    });
  }
});
