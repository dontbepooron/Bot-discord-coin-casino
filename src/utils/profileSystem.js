import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js'
import { writeLog } from './logSystem.js'

const execFileAsync = promisify(execFile)
const FR = new Intl.NumberFormat('fr-FR')

const ASSET_FOLDER = 'Succès et Backgroung profil'
const CACHE_MS = 5 * 60_000

const RARITY_BY_INDEX = ['D', 'C', 'C+', 'B', 'B+', 'A', 'A+', 'S', 'S+', 'SS', 'SSS']

const SUCCESS_RULES = [
  {
    conditionText: 'Effectuer 10 tirages',
    check: (stats) => stats.drawsDone >= 10,
    rewards: { coins: 0, xp: 100, draws: 10 },
  },
  {
    conditionText: 'Avoir 20 000 coins en banque',
    check: (stats) => stats.coins >= 20_000,
    rewards: { coins: 1_000, xp: 140, draws: 2 },
  },
  {
    conditionText: 'Atteindre 50 tirages',
    check: (stats) => stats.drawsDone >= 50,
    rewards: { coins: 3_000, xp: 220, draws: 4 },
  },
  {
    conditionText: 'Passer 3 heures en vocal',
    check: (stats) => stats.voiceMinutes >= 180,
    rewards: { coins: 5_000, xp: 300, draws: 5 },
  },
  {
    conditionText: 'Gagner 20 manches de jeux',
    check: (stats) => stats.gameWins >= 20,
    rewards: { coins: 9_000, xp: 400, draws: 6 },
  },
  {
    conditionText: 'Avoir 120 000 coins en banque',
    check: (stats) => stats.coins >= 120_000,
    rewards: { coins: 18_000, xp: 520, draws: 7 },
  },
  {
    conditionText: 'Jouer 80 manches roulette/blackjack',
    check: (stats) => (stats.rouletteRounds + stats.blackjackRounds) >= 80,
    rewards: { coins: 30_000, xp: 700, draws: 8 },
  },
  {
    conditionText: 'Voler 80 000 coins cumulés',
    check: (stats) => stats.volCoinsStolen >= 80_000,
    rewards: { coins: 45_000, xp: 900, draws: 10 },
  },
  {
    conditionText: 'Atteindre 4 000 XP',
    check: (stats) => stats.xp >= 4_000,
    rewards: { coins: 60_000, xp: 1_200, draws: 12 },
  },
  {
    conditionText: 'Gagner 700 000 coins cumulés',
    check: (stats) => stats.coinsIn >= 700_000,
    rewards: { coins: 100_000, xp: 1_700, draws: 15 },
  },
  {
    conditionText: 'Atteindre 500 tirages et 100 victoires',
    check: (stats) => stats.drawsDone >= 500 && stats.gameWins >= 100,
    rewards: { coins: 200_000, xp: 2_500, draws: 20 },
  },
]

function toInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function parseIndexedImageName(filename) {
  const base = String(filename || '').trim()
  const match = base.match(/^(.+)-(\d+)\.(png|jpg|jpeg|webp)$/i)
  if (!match) return null
  const title = String(match[1] || '').trim()
  const index = Number.parseInt(match[2], 10)
  if (!title || !Number.isInteger(index) || index <= 0) return null
  return {
    title,
    index,
    extension: match[3].toLowerCase(),
  }
}

function capitalizeWords(input) {
  return String(input || '')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ')
}

function getCoinEmoji(config) {
  return String(config?.currency?.coinEmoji || '').trim() || '🪙'
}

function getXpEmoji(config) {
  return String(config?.currency?.xpFlaskEmoji || '').trim() || '🧪'
}

async function loadAssetCatalog(client) {
  const now = Date.now()
  const cached = client.profileAssetCatalog
  if (cached && cached.expiresAt > now) return cached.items

  const dir = path.join(client.rootDir, 'image', ASSET_FOLDER)
  let names = []
  try {
    names = await fsp.readdir(dir)
  } catch {
    names = []
  }

  const items = names
    .map((name) => {
      const parsed = parseIndexedImageName(name)
      if (!parsed) return null
      return {
        index: parsed.index,
        key: `success_${parsed.index}`,
        title: capitalizeWords(parsed.title),
        upper: String(parsed.title).toUpperCase(),
        filename: name,
        path: path.join(dir, name),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)

  client.profileAssetCatalog = {
    items,
    expiresAt: now + CACHE_MS,
  }

  return items
}

function computeLevelFromXp(totalXp) {
  let xp = Math.max(0, toInt(totalXp, 0))
  let level = 1
  let needed = 50
  let guard = 0

  while (xp >= needed && guard < 5000) {
    xp -= needed
    level += 1
    needed = Math.floor(50 + (level - 1) * 35)
    guard += 1
  }

  return {
    level,
    currentXp: xp,
    nextXp: needed,
    totalXp: Math.max(0, toInt(totalXp, 0)),
  }
}

function resolveBackgroundByHighestSuccess(assets, highestUnlocked) {
  if (highestUnlocked?.imagePath && fs.existsSync(highestUnlocked.imagePath)) {
    return highestUnlocked.imagePath
  }

  if (!Array.isArray(assets) || !assets.length) return null
  const fallback = assets.find((asset) => asset?.path && fs.existsSync(asset.path))
  return fallback?.path || null
}

function getSuccessDefinitions(assets) {
  return assets.map((asset, i) => {
    const rule = SUCCESS_RULES[i] || {
      conditionText: `Atteindre le palier #${asset.index}`,
      check: () => false,
      rewards: { coins: 0, xp: 0, draws: 0 },
    }
    return {
      key: asset.key,
      index: asset.index,
      name: asset.upper,
      title: asset.title,
      rarity: RARITY_BY_INDEX[i] || `R${asset.index}`,
      imagePath: asset.path,
      conditionText: rule.conditionText,
      check: rule.check,
      rewards: {
        coins: Math.max(0, toInt(rule.rewards?.coins, 0)),
        xp: Math.max(0, toInt(rule.rewards?.xp, 0)),
        draws: Math.max(0, toInt(rule.rewards?.draws, 0)),
      },
    }
  })
}

export async function getUserProgressStats(client, guildId, userId) {
  if (!client.store.hasProfile(userId)) {
    return {
      guildId,
      userId,
      missingProfile: true,
      user: null,
      profile: null,
      economy: null,
      achievementRows: [],
      achievementMap: new Map(),
      coins: 0,
      xp: 0,
      drawCredits: 0,
      drawsDone: 0,
      voiceMinutes: 0,
      coinsIn: 0,
      coinsOut: 0,
      gameWins: 0,
      gameRounds: 0,
      rouletteRounds: 0,
      blackjackRounds: 0,
      volRounds: 0,
      volCoinsStolen: 0,
    }
  }

  client.store.ensureUser(guildId, userId)
  client.store.ensureCasinoProfile(guildId, userId)

  const user = client.store.getUser(guildId, userId)
  const profile = client.store.getCasinoProfile(guildId, userId)
  const economy = client.store.getUserEconomyStats(guildId, userId)
  const achievementRows = client.store.listUserAchievements(guildId, userId)
  const achievementMap = new Map(achievementRows.map((row) => [String(row.achievement_key), row]))

  return {
    guildId,
    userId,
    missingProfile: false,
    user,
    profile,
    economy,
    achievementRows,
    achievementMap,
    coins: Math.max(0, toInt(user?.coins, 0)),
    xp: Math.max(0, toInt(user?.xp_flasks, 0)),
    drawCredits: Math.max(0, toInt(profile?.draw_credits, 0)),
    drawsDone: Math.max(0, toInt(profile?.draws_done, 0)),
    voiceMinutes: Math.max(0, toInt(profile?.voice_minutes, 0)),
    coinsIn: Math.max(0, toInt(economy?.coins_in, 0)),
    coinsOut: Math.max(0, toInt(economy?.coins_out, 0)),
    gameWins: Math.max(0, toInt(economy?.game_wins, 0)),
    gameRounds: Math.max(0, toInt(economy?.game_rounds, 0)),
    rouletteRounds: Math.max(0, toInt(economy?.roulette_rounds, 0)),
    blackjackRounds: Math.max(0, toInt(economy?.blackjack_rounds, 0)),
    volRounds: Math.max(0, toInt(economy?.vol_rounds, 0)),
    volCoinsStolen: Math.max(0, toInt(economy?.vol_coins_stolen, 0)),
  }
}

export async function syncUserAchievements(client, guild, userId) {
  const assets = await loadAssetCatalog(client)
  const definitions = getSuccessDefinitions(assets)
  const stats = await getUserProgressStats(client, guild.id, userId)
  const unlockedRows = []

  if (stats.missingProfile) {
    return {
      assets,
      definitions,
      stats,
      unlockedNow: [],
    }
  }

  for (const def of definitions) {
    const already = stats.achievementMap.get(def.key)
    const eligible = Boolean(def.check(stats))

    if (!already && eligible) {
      const unlock = client.store.unlockUserAchievement(guild.id, userId, {
        achievementKey: def.key,
        achievementIndex: def.index,
        achievementName: def.name,
        rewardCoins: def.rewards.coins,
        rewardXp: def.rewards.xp,
        rewardDraws: def.rewards.draws,
      })

      if (unlock.ok && unlock.created) {
        if (def.rewards.coins > 0 || def.rewards.xp > 0) {
          client.store.addBalance(guild.id, userId, {
            coinsDelta: def.rewards.coins,
            xpDelta: def.rewards.xp,
          }, {
            source: 'achievement:unlock',
            reason: `Succes ${def.name}`,
            actorId: 'system',
            metadata: {
              achievementKey: def.key,
              achievementIndex: def.index,
            },
          })
        }

        if (def.rewards.draws > 0) {
          client.store.addCasinoDrawCredits(guild.id, userId, def.rewards.draws)
        }

        const created = client.store.getUserAchievement(guild.id, userId, def.key)
        if (created) {
          stats.achievementMap.set(def.key, created)
          unlockedRows.push(created)
        }

        await writeLog(client, {
          guild,
          logType: 'setup',
          severity: 'success',
          actorId: userId,
          targetUserId: userId,
          commandName: 'achievement',
          description: `Succès débloqué: ${def.name}`,
          data: {
            achievementKey: def.key,
            rewards: def.rewards,
          },
        }).catch(() => null)
      }
    }
  }

  const refreshed = await getUserProgressStats(client, guild.id, userId)
  return {
    assets,
    definitions,
    stats: refreshed,
    unlockedNow: unlockedRows,
  }
}

function resolveHighestUnlocked(definitions, achievementMap) {
  let best = null
  for (const def of definitions) {
    if (!achievementMap.has(def.key)) continue
    if (!best || def.index > best.index) best = def
  }
  return best
}

function drawCommandForRoundedRect(x, y, w, h, radius = 24) {
  const x2 = x + w
  const y2 = y + h
  return `roundrectangle ${x},${y} ${x2},${y2} ${radius},${radius}`
}

function drawText(args, {
  x,
  y,
  text,
  size,
  fill = '#f5f8ff',
  stroke = 'rgba(8,11,22,0.95)',
  strokeWidth = 5,
  gravity = 'NorthWest',
}) {
  args.push(
    '-gravity', gravity,
    '-font', 'Arial-Black',
    '-pointsize', String(size),
    '-fill', fill,
    '-stroke', stroke,
    '-strokewidth', String(strokeWidth),
    '-annotate', `+${x}+${y}`, String(text || '')
  )
}

async function measureText({ text, size }) {
  const safeText = String(text || '').replace(/\n/g, ' ')
  const { stdout } = await execFileAsync('convert', [
    '-background', 'none',
    '-font', 'Arial-Black',
    '-pointsize', String(size),
    `label:${safeText}`,
    '-format', '%w %h',
    'info:',
  ])

  const [wRaw, hRaw] = String(stdout || '').trim().split(/\s+/)
  const width = Math.max(1, Number.parseInt(wRaw, 10) || 1)
  const height = Math.max(1, Number.parseInt(hRaw, 10) || 1)
  return { width, height }
}

async function fitTextSize({
  text,
  startSize,
  minSize,
  maxWidth,
  cache,
}) {
  let size = startSize
  let measured = { width: 1, height: 1 }
  const safeText = String(text || '')

  while (size >= minSize) {
    const cacheKey = `${safeText}|${size}`
    if (cache.has(cacheKey)) {
      measured = cache.get(cacheKey)
    } else {
      measured = await measureText({ text: safeText, size })
      cache.set(cacheKey, measured)
    }

    if (measured.width <= maxWidth) {
      return { size, ...measured }
    }
    size -= 2
  }

  return { size: minSize, ...measured }
}

async function renderProfileCardToFile({
  backgroundPath,
  outputPath,
  username,
  level,
  rankText,
  trophyCount,
  coins,
  drawCredits,
  pillages,
  clanText,
  xpText,
  xpRatio,
}) {
  const width = 1600
  const height = 900
  const safeRatio = clamp(Number.isFinite(xpRatio) ? xpRatio : 0, 0, 1)
  const textYShift = -62

  const statCoinsText = `BANQUE : ${FR.format(coins)}`
  const statDrawsText = `TIRAGES : ${FR.format(drawCredits)}`
  const statPillageText = `PILLAGES : ${FR.format(pillages)}`
  const longestStatsLen = Math.max(statCoinsText.length, statDrawsText.length, statPillageText.length)
  const statsBoxW = clamp(760 + Math.max(0, longestStatsLen - 18) * 24, 760, 1080)

  const xpBarX = 520
  const xpBarY = 840
  const xpBarW = 560
  const xpBarH = 36
  const xpFillW = clamp(Math.round((xpBarW - 8) * safeRatio), 0, xpBarW - 8)

  const BOX_LVL = { x: 70, y: 45, w: 380, h: 175 }
  const BOX_NAME = { x: 500, y: 65, w: 1030, h: 130 }
  const BOX_RANK = { x: 70, y: 290, w: 570, h: 130 }
  const BOX_TROPHY = { x: 1215, y: 240, w: 325, h: 185 }
  const BOX_STATS = { x: 70, y: 545, w: statsBoxW, h: 280 }
  const BOX_CLAN = { x: 860, y: 760, w: 680, h: 120 }

  const shapes = [
    drawCommandForRoundedRect(BOX_LVL.x, BOX_LVL.y, BOX_LVL.w, BOX_LVL.h, 32),
    drawCommandForRoundedRect(BOX_NAME.x, BOX_NAME.y, BOX_NAME.w, BOX_NAME.h, 32),
    drawCommandForRoundedRect(BOX_RANK.x, BOX_RANK.y, BOX_RANK.w, BOX_RANK.h, 28),
    drawCommandForRoundedRect(BOX_TROPHY.x, BOX_TROPHY.y, BOX_TROPHY.w, BOX_TROPHY.h, 32),
    drawCommandForRoundedRect(BOX_STATS.x, BOX_STATS.y, BOX_STATS.w, BOX_STATS.h, 30),
    drawCommandForRoundedRect(BOX_CLAN.x, BOX_CLAN.y, BOX_CLAN.w, BOX_CLAN.h, 30),
    drawCommandForRoundedRect(xpBarX, xpBarY, xpBarW, xpBarH, 20),
  ]

  const args = [
    backgroundPath,
    '-resize', `${width}x${height}^`,
    '-gravity', 'center',
    '-extent', `${width}x${height}`,
    '-gravity', 'NorthWest',
    '-fill', 'rgba(0,0,0,0.52)',
    '-stroke', 'rgba(240,245,255,0.90)',
    '-strokewidth', '4',
  ]

  for (const shape of shapes) {
    args.push('-draw', shape)
  }

  args.push(
    '-fill', 'rgba(173,220,255,0.88)',
    '-stroke', 'rgba(235,245,255,0.80)',
    '-strokewidth', '2',
    '-draw', drawCommandForRoundedRect(xpBarX + 4, xpBarY + 4, xpFillW, xpBarH - 8, 16)
  )

  const measureCache = new Map()
  const safeName = String(username || 'unknown').slice(0, 28)
  const safeRank = String(rankText || 'NOVICE').slice(0, 14)
  const safeTrophy = FR.format(trophyCount)
  const safeClan = `CLAN : ${String(clanText || '').slice(0, 20)}`
  const safeXp = String(xpText || '0/50 XP').slice(0, 24)
  const safeLvl = `LVL ${level}`

  const lvlFit = await fitTextSize({
    text: safeLvl,
    startSize: level >= 100 ? 74 : 84,
    minSize: 52,
    maxWidth: BOX_LVL.w - 46,
    cache: measureCache,
  })
  const nameFit = await fitTextSize({
    text: safeName,
    startSize: 96,
    minSize: 42,
    maxWidth: BOX_NAME.w - 70,
    cache: measureCache,
  })
  const rankFit = await fitTextSize({
    text: safeRank,
    startSize: 78,
    minSize: 42,
    maxWidth: BOX_RANK.w - 60,
    cache: measureCache,
  })
  const trophyFit = await fitTextSize({
    text: safeTrophy,
    startSize: 92,
    minSize: 48,
    maxWidth: BOX_TROPHY.w - 40,
    cache: measureCache,
  })
  const coinsFit = await fitTextSize({
    text: statCoinsText,
    startSize: 68,
    minSize: 34,
    maxWidth: BOX_STATS.w - 70,
    cache: measureCache,
  })
  const drawsFit = await fitTextSize({
    text: statDrawsText,
    startSize: 68,
    minSize: 34,
    maxWidth: BOX_STATS.w - 70,
    cache: measureCache,
  })
  const pillageFit = await fitTextSize({
    text: statPillageText,
    startSize: 68,
    minSize: 34,
    maxWidth: BOX_STATS.w - 70,
    cache: measureCache,
  })
  const clanFit = await fitTextSize({
    text: safeClan,
    startSize: 58,
    minSize: 30,
    maxWidth: BOX_CLAN.w - 60,
    cache: measureCache,
  })
  const xpFit = await fitTextSize({
    text: safeXp,
    startSize: 38,
    minSize: 22,
    maxWidth: xpBarW - 30,
    cache: measureCache,
  })

  const lvlX = Math.round(BOX_LVL.x + (BOX_LVL.w - lvlFit.width) / 2)
  const nameX = Math.round(BOX_NAME.x + (BOX_NAME.w - nameFit.width) / 2)
  const rankX = Math.round(BOX_RANK.x + (BOX_RANK.w - rankFit.width) / 2)
  const trophyX = Math.round(BOX_TROPHY.x + (BOX_TROPHY.w - trophyFit.width) / 2)
  const clanX = Math.round(BOX_CLAN.x + (BOX_CLAN.w - clanFit.width) / 2)
  const xpX = Math.round(xpBarX + (xpBarW - xpFit.width) / 2)

  drawText(args, { x: lvlX, y: 162 + textYShift, text: safeLvl, size: lvlFit.size })
  drawText(args, { x: nameX, y: 154 + textYShift, text: safeName, size: nameFit.size })
  drawText(args, { x: rankX, y: 392 + textYShift, text: safeRank, size: rankFit.size })
  drawText(args, { x: trophyX, y: 352 + textYShift, text: safeTrophy, size: trophyFit.size })

  drawText(args, { x: BOX_STATS.x + 35, y: 636 + textYShift, text: statCoinsText, size: coinsFit.size })
  drawText(args, { x: BOX_STATS.x + 35, y: 716 + textYShift, text: statDrawsText, size: drawsFit.size })
  drawText(args, { x: BOX_STATS.x + 35, y: 796 + textYShift, text: statPillageText, size: pillageFit.size })

  drawText(args, { x: clanX, y: 842 + textYShift, text: safeClan, size: clanFit.size })
  drawText(args, { x: xpX, y: xpBarY + 32 + textYShift, text: safeXp, size: xpFit.size })

  args.push(outputPath)

  await execFileAsync('convert', args)
  return outputPath
}

export async function buildProfileCardPayload(client, guild, user, { ephemeral = false, includeEmbed = true } = {}) {
  const synced = await syncUserAchievements(client, guild, user.id)
  const { assets, definitions, stats } = synced
  if (stats.missingProfile) {
    if (!includeEmbed) {
      return {
        content: `<@${user.id}> n’a pas de profil.`,
        embeds: [],
        files: [],
        components: [],
        ephemeral,
      }
    }

    const missingEmbed = new EmbedBuilder()
      .setColor('#111111')
      .setTitle('Profil')
      .setDescription(`<@${user.id}> n’a pas de profil.`)
    return { embeds: [missingEmbed], files: [], components: [], ephemeral }
  }

  const highest = resolveHighestUnlocked(definitions, stats.achievementMap)
  const levelInfo = computeLevelFromXp(stats.xp)
  const backgroundPath = resolveBackgroundByHighestSuccess(assets, highest)

  if (!backgroundPath) {
    if (!includeEmbed) {
      return {
        content: [
          `Profil de ${user.username}`,
          `Niveau: ${levelInfo.level}`,
          `Coins: ${FR.format(stats.coins)}`,
          `Tirages: ${FR.format(stats.drawCredits)}`,
          `Pillages: ${FR.format(stats.volRounds)}`,
        ].join('\n'),
        embeds: [],
        components: [],
        files: [],
        ephemeral,
      }
    }

    const fallbackEmbed = new EmbedBuilder()
      .setColor('#111111')
      .setTitle('Profil')
      .setDescription([
        `Utilisateur: **${user.username}**`,
        `Niveau: **${levelInfo.level}**`,
        `Coins: **${FR.format(stats.coins)}**`,
        `Tirages: **${FR.format(stats.drawCredits)}**`,
        `Pillages: **${FR.format(stats.volRounds)}**`,
      ].join('\n'))
    return { embeds: [fallbackEmbed], components: [], files: [], ephemeral }
  }

  const tmpPath = path.join(
    client.rootDir,
    'data',
    `profile-card-${user.id}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.png`
  )
  await fsp.mkdir(path.dirname(tmpPath), { recursive: true }).catch(() => null)
  const xpRatio = levelInfo.nextXp > 0 ? levelInfo.currentXp / levelInfo.nextXp : 0

  try {
    await renderProfileCardToFile({
      backgroundPath,
      outputPath: tmpPath,
      username: user.username,
      level: levelInfo.level,
      rankText: highest?.name || 'NOVICE',
      trophyCount: stats.achievementRows.length,
      coins: stats.coins,
      drawCredits: stats.drawCredits,
      pillages: stats.volRounds,
      clanText: '',
      xpText: `${FR.format(levelInfo.currentXp)}/${FR.format(levelInfo.nextXp)} XP`,
      xpRatio,
    })

    const fileBuffer = await fsp.readFile(tmpPath)
    await fsp.unlink(tmpPath).catch(() => null)

    const attachment = new AttachmentBuilder(fileBuffer, { name: 'profil-card.png' })

    if (!includeEmbed) {
      return {
        content: null,
        embeds: [],
        files: [attachment],
        components: [],
        ephemeral,
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#111111')
      .setImage('attachment://profil-card.png')

    return {
      embeds: [embed],
      files: [attachment],
      components: [],
      ephemeral,
    }
  } catch {
    await fsp.unlink(tmpPath).catch(() => null)

    if (!includeEmbed) {
      return {
        content: `Profil de ${user.username}\nNiveau: ${levelInfo.level}\nRang: ${highest?.name || 'NOVICE'}`,
        embeds: [],
        files: [],
        components: [],
        ephemeral,
      }
    }

    const fallbackEmbed = new EmbedBuilder()
      .setColor('#111111')
      .setTitle('Profil')
      .setDescription([
        `Utilisateur: **${user.username}**`,
        `Niveau: **${levelInfo.level}**`,
        `Rang: **${highest?.name || 'NOVICE'}**`,
        `Coins: **${FR.format(stats.coins)}**`,
        `Tirages: **${FR.format(stats.drawCredits)}**`,
      ].join('\n'))
    return { embeds: [fallbackEmbed], files: [], components: [], ephemeral }
  }
}

function buildSuccessComponents(currentPage, totalPages) {
  const prev = clamp(currentPage - 1, 0, totalPages - 1)
  const next = clamp(currentPage + 1, 0, totalPages - 1)

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`setup:success:nav:${prev}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage <= 0),
      new ButtonBuilder()
        .setCustomId(`setup:success:nav:${next}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage >= totalPages - 1)
    ),
  ]
}

export async function buildSuccessPagePayload(client, guild, userId, page = 0, { ephemeral = true } = {}) {
  const synced = await syncUserAchievements(client, guild, userId)
  const { definitions, stats } = synced
  if (stats.missingProfile) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor('#111111')
          .setTitle('Succès')
          .setDescription('Aucun profil trouvé pour cet utilisateur.'),
      ],
      files: [],
      components: [],
      ephemeral,
      page: 0,
      totalPages: 1,
    }
  }

  const totalPages = Math.max(1, definitions.length || 1)
  const safePage = clamp(toInt(page, 0), 0, totalPages - 1)
  const current = definitions[safePage] || null

  if (!current) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor('#111111')
          .setTitle('Succès')
          .setDescription('Aucun succès configuré.'),
      ],
      files: [],
      components: [],
      ephemeral,
      page: safePage,
      totalPages,
    }
  }

  const unlocked = stats.achievementMap.has(current.key)
  const row = stats.achievementMap.get(current.key) || null
  const coinEmoji = getCoinEmoji(client.config)
  const xpEmoji = getXpEmoji(client.config)
  const rewards = current.rewards

  const attachment = fs.existsSync(current.imagePath)
    ? new AttachmentBuilder(current.imagePath, { name: 'success-preview.png' })
    : null

  const embed = new EmbedBuilder()
    .setColor('#111111')
    .setTitle(`${unlocked ? '`✅`' : '`❌`'} Succès : ${current.name} \`💠\``)
    .setDescription([
      '**Conditions d’obtention**',
      current.conditionText,
      '',
      '**Récompenses**',
      `${FR.format(rewards.xp)} ${xpEmoji} : ${FR.format(rewards.draws)} 🎰${rewards.coins > 0 ? ` : ${FR.format(rewards.coins)} ${coinEmoji}` : ''}`,
      '',
      '**Rareté**',
      current.rarity,
      unlocked && row?.unlocked_at ? `\nDébloqué: <t:${row.unlocked_at}:R>` : '',
      '',
      'Vous pouvez équiper les succès obtenus dans votre inventaire.',
    ].join('\n'))

  if (attachment) {
    embed.setImage('attachment://success-preview.png')
  }

  return {
    embeds: [embed],
    files: attachment ? [attachment] : [],
    components: buildSuccessComponents(safePage, totalPages),
    ephemeral,
    page: safePage,
    totalPages,
  }
}
