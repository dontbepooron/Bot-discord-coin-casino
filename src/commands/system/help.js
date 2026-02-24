import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js'
import { defineCommand } from '../../utils/commandHelpers.js'

const CATEGORY_ORDER = [
  'economy',
  'games',
  'giveaway',
  'moderation',
  'configuration',
  'groups',
  'buyer',
  'system',
]

const CATEGORY_LABEL = {
  economy: 'Économie',
  games: 'Jeux',
  giveaway: 'Giveaway',
  moderation: 'Modération',
  configuration: 'Configuration',
  groups: 'Groupes',
  buyer: 'Buyer',
  system: 'Système',
}

const CATEGORY_EMOJI = {
  economy: '💰',
  games: '🎲',
  giveaway: '🎉',
  moderation: '🛡️',
  configuration: '⚙️',
  groups: '👥',
  buyer: '👑',
  system: '🧠',
}

const COMMAND_DETAILS = {
  setup: { usage: '+setup [#salon]', desc: 'Déploie le panel setup (Profil, Tirage, Shop, Inventaire, Succès).' },
  owner: { usage: '+owner {@/id/reply}', desc: 'Ajoute un owner.' },
  unowner: { usage: '+unowner {@/id/reply}', desc: 'Retire un owner.' },
  ownerlist: { usage: '+ownerlist', desc: 'Liste les owners.' },
  give: { usage: '+give {@/id/reply} {montant}', desc: 'Donne des coins illimités (buyer).' },
  setmodetest: { usage: '+setmodetest', desc: 'Active le mode test (buyer sans cooldown).' },
  setmodeprod: { usage: '+setmodeprod', desc: 'Retour en mode prod (cooldowns actifs).' },
  panale: { usage: '+panale', desc: 'Panel buyer ultra interactif pour piloter le bot (coins, commandes, système).' },
  clearallsanctions: { usage: '+clearallsanctions', desc: 'Supprime toutes les sanctions globales.' },
  reset: { usage: '+reset', desc: 'Reset total avec confirmation.' },

  setgroup: { usage: '+setgroup {num} {@role}', desc: 'Associe un rôle à un groupe.' },
  change: { usage: '+change {commande} {groupe}', desc: 'Déplace une commande vers un groupe.' },
  changeall: { usage: '+changeall {groupe}', desc: 'Déplace toutes les commandes.' },
  transfer: { usage: '+transfer {src} {dst}', desc: 'Transfère commandes entre groupes.' },
  setgroupname: { usage: '+setgroupname {num} {nom}', desc: 'Renomme un groupe.' },
  grouplist: { usage: '+grouplist', desc: 'Affiche rôles/noms/commandes des groupes.' },

  bl: { usage: '+bl {@/id/reply}', desc: 'Blacklist permanente.' },
  unbl: { usage: '+unbl {@/id/reply}', desc: 'Retrait blacklist.' },
  tempbl: { usage: '+tempbl {@/id/reply} {durée}', desc: 'Blacklist temporaire.' },
  blacklist: { usage: '+blacklist', desc: 'Liste les blacklist actifs.' },
  warn: { usage: '+warn {@/id/reply}', desc: 'Ajoute un warn (auto tempbl à 3).' },
  delwarn: { usage: '+delwarn {@/id/reply} {id}', desc: 'Supprime un warn précis.' },
  sanctions: { usage: '+sanctions {@/id/reply}', desc: 'Panel interactif des sanctions.' },
  clearsanctions: { usage: '+clearsanctions {@/id/reply}', desc: 'Supprime sanctions d’un utilisateur.' },

  serverprofile: { usage: '+serverprofile', desc: 'Panel profil bot par serveur.' },
  setprofil: { usage: '+setprofil', desc: 'Panel profil bot global.' },
  mybot: { usage: '+mybot', desc: 'Infos générales bot.' },
  setcommandpanel: { usage: '+setcommandpanel', desc: 'Bloque/débloque les commandes de jeux.' },
  setgainchannel: { usage: '+setgainchannel {#salon}', desc: 'Définit le salon de logs de gains.' },
  autologs: { usage: '+autologs', desc: 'Crée automatiquement la catégorie et tous les salons de logs bot.' },
  setlogchannel: { usage: '+setlogchannel {type} {#salon}', desc: 'Associe un type de log à un salon.' },
  logchannels: { usage: '+logchannels', desc: 'Affiche le mapping complet des salons de logs.' },
  logtypes: { usage: '+logtypes', desc: 'Liste tous les types de logs disponibles.' },
  loghistory: { usage: '+loghistory {type|all} [limit]', desc: 'Historique audit des événements logs.' },
  txhistory: { usage: '+txhistory [@user] [limit]', desc: 'Historique des transactions coins/xp.' },
  drawhistory: { usage: '+drawhistory [@user] [limit]', desc: 'Historique des tirages setup.' },
  gainhistory: { usage: '+gainhistory [@user] [limit]', desc: 'Historique des gains (status/vocal/texte).' },
  suspicious: { usage: '+suspicious [minutes] [seuil] [limit]', desc: 'Analyse anti-triche des transactions suspectes.' },
  rollbacktx: { usage: '+rollbacktx {txId} [raison]', desc: 'Rollback d’une transaction (réparation triche).' },
  panelgain: { usage: '+panelgain', desc: 'Panel interactif de configuration des gains (status/vocal/texte).' },
  setreward: { usage: '+setreward', desc: 'Panel interactif pour configurer les récompenses de tirage (Autres).' },
  setupseed: { usage: '+setupseed', desc: 'Injecte le setup par défaut (shop + tirages).' },
  shoplist: { usage: '+shoplist', desc: 'Liste admin des items boutique setup.' },
  shopadd: { usage: '+shopadd {cat} {prix} {type} {value} {nom...}', desc: 'Ajoute un item boutique setup.' },
  shopedit: { usage: '+shopedit {id} {champ} {valeur}', desc: 'Modifie un item boutique setup.' },
  shopremove: { usage: '+shopremove {id}', desc: 'Supprime un item boutique setup.' },
  drawlist: { usage: '+drawlist', desc: 'Liste admin des tirages setup.' },
  drawadd: { usage: '+drawadd {cat} {weight} {type} {value} {nom...}', desc: 'Ajoute un item de tirage.' },
  drawedit: { usage: '+drawedit {id} {champ} {valeur}', desc: 'Modifie un item de tirage.' },
  drawremove: { usage: '+drawremove {id}', desc: 'Supprime un item de tirage.' },
  drawcredits: { usage: '+drawcredits {@/id/reply} {+/-n}', desc: 'Ajuste les crédits de tirages d’un membre.' },

  bal: { usage: '+bal [@/id/reply]', desc: 'Affiche coins et fioles XP (vous ou une cible).' },
  collect: { usage: '+collect', desc: 'Récompense toutes les 15 minutes.' },
  daily: { usage: '+daily', desc: 'Récompense quotidienne.' },
  timer: { usage: '+timer', desc: 'Affiche le temps restant des cooldowns de jeu.' },
  gift: { usage: '+gift', desc: 'Jeu 1 bouton gagnant sur 3.' },
  don: { usage: '+don {@/id/reply} {montant}', desc: 'Don avec taxe 10%.' },
  profil: { usage: '+profil [@/id/reply]', desc: 'Affiche la carte profil dynamique (vous ou une cible).' },

  bingo: { usage: '+bingo {1-90}', desc: 'Bingo avec pot progressif.' },
  jackpot: { usage: '+jackpot', desc: 'Tirage 100-999, 777 gagne le pot.' },
  vol: { usage: '+vol {@/id}', desc: 'Vol coins + XP avec suspense.' },
  roulette: { usage: '+roulette {mise} {choix}', desc: 'Roulette multi-choix et multiplicateurs.' },
  blackjack: { usage: '+blackjack {mise}', desc: 'Blackjack interactif (boutons).' },
  pfc: { usage: '+pfc {@/id/reply} {mise}', desc: 'Pierre-Feuille-Ciseaux PvP interactif.' },
  slots: { usage: '+slots {mise}', desc: 'Machine à sous casino avec multiplicateurs.' },
  coinflip: { usage: '+coinflip {mise} {pile|face}', desc: 'Pile ou face avec suspense.' },
  hilo: { usage: '+hilo {mise} {haut|bas}', desc: 'Devinez si la 2e carte sera plus haute ou plus basse.' },
  craps: { usage: '+craps {mise}', desc: 'Jeu de dés casino (2/12 x4, 7/11 x3, double x2).' },

  giveaway: { usage: '+giveaway', desc: 'Panel giveaway coins.' },
  endgiveaway: { usage: '+endgiveaway <id|lien>', desc: 'Termine un giveaway actif.' },
  reroll: { usage: '+reroll <id|lien> [gagnants]', desc: 'Nouveau tirage d’un giveaway terminé.' },

  help: { usage: '+help', desc: 'Panel d’aide interactif.' },
  ping: { usage: '+ping', desc: 'Latence bot/websocket.' },
}

function getCategory(command) {
  if (command.category) return String(command.category).toLowerCase()
  return 'system'
}

function getAccessBadge(command) {
  if (command.buyerOnly) return '👑 Buyer'
  if (command.ownerOnly || command.requiredLevel === 2) return '🛡️ Owner'
  if (command.groupControlled) return `👥 Groupe ${command.defaultGroup || 9}`
  return '🌍 Public'
}

function getCooldownText(client, command) {
  const raw = typeof command.cooldownMs === 'function' ? command.cooldownMs(client) : command.cooldownMs
  const n = Number.parseInt(raw || 0, 10)
  if (!n || n <= 0) return 'Aucun'
  if (n % 60000 === 0) return `${n / 60000} min`
  if (n % 1000 === 0) return `${n / 1000} sec`
  return `${n} ms`
}

function buildCategoryMap(client) {
  const map = new Map()
  for (const command of client.commands.values()) {
    const category = getCategory(command)
    if (!map.has(category)) map.set(category, [])
    map.get(category).push(command)
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name))
  }

  return map
}

function categoryDisplay(category) {
  return `${CATEGORY_EMOJI[category] || '📦'} ${CATEGORY_LABEL[category] || category}`
}

function buildOverviewEmbed(embed, client, categoryMap) {
  const total = client.commands.size
  const lines = CATEGORY_ORDER
    .filter((key) => categoryMap.has(key))
    .map((key) => {
      const count = categoryMap.get(key).length
      return `${categoryDisplay(key)}: **${count}**`
    })

  return embed({
    variant: 'info',
    title: 'Centre de Commandes Casino',
    description: [
      'Panel d’aide interactif du bot Casino.',
      '',
      `Préfixes acceptés: **${client.config.prefix}** et **.**`,
      `Commandes chargées: **${total}**`,
      '',
      ...lines,
      '',
      'Utilisez le menu pour changer de catégorie et les boutons pour naviguer entre pages.',
    ].join('\n'),
  })
}

function buildCategoryEmbed(embed, client, category, commands, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(commands.length / pageSize))
  const safePage = Math.min(totalPages - 1, Math.max(0, page))
  const start = safePage * pageSize
  const slice = commands.slice(start, start + pageSize)

  const fields = slice.map((command) => {
    const details = COMMAND_DETAILS[command.name] || {}
    return {
      name: `${command.name} • ${getAccessBadge(command)}`,
      value: [
        details.desc || 'Description non fournie.',
        `Usage: \`${details.usage || `${client.config.prefix}${command.name}`}\``,
        `Cooldown: ${getCooldownText(client, command)}`,
        `Profil requis: ${command.profileRequired === false ? 'Non' : 'Oui'}`,
      ].join('\n'),
      inline: false,
    }
  })

  return {
    embed: embed({
      variant: 'info',
      title: `${categoryDisplay(category)} • Page ${safePage + 1}/${totalPages}`,
      description: `Catégorie **${CATEGORY_LABEL[category] || category}** • ${commands.length} commande(s).`,
      fields,
      footer: 'Astuce: sélectionnez une autre catégorie sans relancer la commande.',
    }),
    totalPages,
    safePage,
  }
}

function buildComponents(ownerId, categories, selectedCategory, page, totalPages) {
  const selectId = `help:select:${ownerId}`
  const prevId = `help:prev:${ownerId}`
  const nextId = `help:next:${ownerId}`
  const homeId = `help:home:${ownerId}`
  const closeId = `help:close:${ownerId}`

  const options = categories.slice(0, 25).map((key) => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(CATEGORY_LABEL[key] || key)
      .setValue(key)
      .setDescription(`Voir les commandes ${CATEGORY_LABEL[key] || key}`.slice(0, 100))

    const emoji = CATEGORY_EMOJI[key]
    if (emoji) opt.setEmoji(emoji)
    if (key === selectedCategory) opt.setDefault(true)
    return opt
  })

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(selectId)
        .setPlaceholder('Choisir une catégorie')
        .addOptions(options)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(prevId).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1 || page <= 0),
      new ButtonBuilder().setCustomId(nextId).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1 || page >= totalPages - 1),
      new ButtonBuilder().setCustomId(homeId).setLabel('Accueil').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(closeId).setLabel('Fermer').setStyle(ButtonStyle.Danger)
    ),
  ]
}

export default defineCommand({
  name: 'help',
  aliases: ['commands', 'aide'],
  profileRequired: false,
  async execute({ client, message, embed, status }) {
    const categoryMap = buildCategoryMap(client)
    const categories = CATEGORY_ORDER.filter((key) => categoryMap.has(key))

    if (!categories.length) {
      return message.reply({
        embeds: [embed({ variant: 'warning', description: status(false, 'Aucune commande chargée.') })],
      })
    }

    const ownerId = message.author.id
    let currentCategory = categories[0]
    let currentPage = 0
    let isHome = true

    const overviewEmbed = buildOverviewEmbed(embed, client, categoryMap)
    const first = buildCategoryEmbed(embed, client, currentCategory, categoryMap.get(currentCategory), currentPage, 5)

    const panel = await message.reply({
      embeds: [overviewEmbed],
      components: buildComponents(ownerId, categories, currentCategory, first.safePage, first.totalPages),
    })

    const collector = panel.createMessageComponentCollector({ time: 15 * 60 * 1000 })

    const render = async () => {
      const commands = categoryMap.get(currentCategory) || []
      const built = buildCategoryEmbed(embed, client, currentCategory, commands, currentPage, 5)
      currentPage = built.safePage

      await panel.edit({
        embeds: [isHome ? overviewEmbed : built.embed],
        components: buildComponents(ownerId, categories, currentCategory, built.safePage, built.totalPages),
      }).catch(() => null)
    }

    collector.on('collect', async (interaction) => {
      const belongsToPanel = interaction.customId.endsWith(`:${ownerId}`)
      if (!belongsToPanel) return

      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          embeds: [embed({ variant: 'error', description: status(false, 'Seul l’auteur peut utiliser ce panel help.') })],
          flags: MessageFlags.Ephemeral,
        }).catch(() => null)
        return
      }

      if (interaction.isStringSelectMenu() && interaction.customId === `help:select:${ownerId}`) {
        currentCategory = interaction.values[0]
        currentPage = 0
        isHome = false
        await interaction.deferUpdate().catch(() => null)
        await render()
        return
      }

      if (!interaction.isButton()) return

      if (interaction.customId === `help:close:${ownerId}`) {
        collector.stop('closed')
        await interaction.update({
          embeds: [embed({ variant: 'info', description: 'Panel help fermé.' })],
          components: [],
        }).catch(() => null)
        return
      }

      if (interaction.customId === `help:home:${ownerId}`) {
        isHome = true
        await interaction.deferUpdate().catch(() => null)
        await render()
        return
      }

      if (interaction.customId === `help:prev:${ownerId}`) {
        isHome = false
        currentPage -= 1
        await interaction.deferUpdate().catch(() => null)
        await render()
        return
      }

      if (interaction.customId === `help:next:${ownerId}`) {
        isHome = false
        currentPage += 1
        await interaction.deferUpdate().catch(() => null)
        await render()
      }
    })

    collector.on('end', async (_, reason) => {
      if (reason === 'closed') return
      await panel.edit({ components: [] }).catch(() => null)
    })
  },
})
