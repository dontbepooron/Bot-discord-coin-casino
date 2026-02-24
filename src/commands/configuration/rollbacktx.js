import { defineCommand } from '../../utils/commandHelpers.js'
import { writeLog } from '../../utils/logSystem.js'

const FR = new Intl.NumberFormat('fr-FR')

function randomTraceId() {
  return `rb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export default defineCommand({
  name: 'rollbacktx',
  aliases: ['reverttx', 'txrollback'],
  ownerOnly: true,
  profileRequired: false,
  async execute({ client, message, args, embed, status }) {
    const txId = Number.parseInt(args[0] || '', 10)
    const reason = String(args.slice(1).join(' ') || 'Rollback manuel staff').slice(0, 250)

    if (!Number.isInteger(txId) || txId <= 0) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Usage: +rollbacktx {txId} [raison]') })],
      })
    }

    const tx = client.store.getEconomyTransaction(message.guild.id, txId)
    if (!tx) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Transaction introuvable.') })],
      })
    }
    if (tx.reverted_at) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Cette transaction est déjà rollback.') })],
      })
    }

    const coinsDelta = Number.parseInt(tx.coins_delta, 10) || 0
    const xpDelta = Number.parseInt(tx.xp_delta, 10) || 0
    if (coinsDelta === 0 && xpDelta === 0) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Cette transaction ne modifie rien, rollback impossible.') })],
      })
    }

    const user = client.store.getUser(message.guild.id, tx.user_id)
    if (coinsDelta > 0 && (Number.parseInt(user?.coins, 10) || 0) < coinsDelta) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Rollback impossible: solde coins insuffisant chez la cible.') })],
      })
    }
    if (xpDelta > 0 && (Number.parseInt(user?.xp_flasks, 10) || 0) < xpDelta) {
      return message.reply({
        embeds: [embed({ variant: 'error', description: status(false, 'Rollback impossible: solde XP insuffisant chez la cible.') })],
      })
    }

    const reverseCoins = -coinsDelta
    const reverseXp = -xpDelta
    const traceId = randomTraceId()
    client.store.addBalance(
      message.guild.id,
      tx.user_id,
      { coinsDelta: reverseCoins, xpDelta: reverseXp },
      {
        source: 'rollbacktx',
        actorId: message.author.id,
        commandName: 'rollbacktx',
        channelId: message.channel.id,
        messageId: message.id,
        reason: `Rollback transaction #${tx.id}`,
        traceId,
        metadata: { originalTxId: tx.id, reason },
      }
    )

    const rollbackTx = client.store.listEconomyTransactions(message.guild.id, {
      traceId,
      limit: 1,
    })[0] || null

    client.store.markEconomyTransactionReverted(message.guild.id, tx.id, {
      revertedBy: message.author.id,
      revertedReason: reason,
      revertedTxId: rollbackTx?.id || null,
    })

    await writeLog(client, {
      guild: message.guild,
      logType: 'economy',
      severity: 'warning',
      actorId: message.author.id,
      targetUserId: tx.user_id,
      commandName: 'rollbacktx',
      description: `Rollback transaction #${tx.id} appliqué. Motif: ${reason}`,
      data: {
        originalTxId: tx.id,
        rollbackTxId: rollbackTx?.id || null,
        reverseCoins,
        reverseXp,
      },
    }).catch(() => null)

    await writeLog(client, {
      guild: message.guild,
      logType: 'anticheat',
      severity: 'warning',
      actorId: message.author.id,
      targetUserId: tx.user_id,
      commandName: 'rollbacktx',
      description: `Action anti-triche: rollback de la transaction #${tx.id}.`,
      data: {
        reason,
        originalSource: tx.source,
        originalActorId: tx.actor_id,
      },
    }).catch(() => null)

    return message.reply({
      embeds: [
        embed({
          variant: 'success',
          description: [
            status(true, `Transaction \`#${tx.id}\` rollback avec succès.`),
            `Cible: <@${tx.user_id}>`,
            `Inversion coins: \`${reverseCoins > 0 ? '+' : ''}${FR.format(reverseCoins)}\``,
            `Inversion xp: \`${reverseXp > 0 ? '+' : ''}${FR.format(reverseXp)}\``,
            `Raison: ${reason}`,
          ].join('\n'),
        }),
      ],
      allowedMentions: { parse: [], users: [], roles: [] },
    })
  },
})
