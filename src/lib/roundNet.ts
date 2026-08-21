// Single source of truth for a completed round's per-player net winnings, across
// ALL game types. Mirrors SettleUp's settlement math so the stats screens
// (My Stats, Leaderboard) agree with each other AND with what the round actually
// settled to. Before this, both stat screens only resolved 5 of 11 game types
// (skins/best_ball/nassau/wolf/bbb) and silently dropped dots/banker/hammer/
// stableford/quota/vegas from net and win detection.
//
// Net is signed cents (or points, in points mode — 1 pt = 1 unit), zero-sum
// across players. Junk side-bets and resolved side bets fold in, exactly as
// SettleUp does. (Prop bets are behind a disabled flag and omitted, matching the
// stat screens' current inputs.)
import { makePlayableSnapshot, roundToHolesConfig } from './holeUtils'
import {
  buildCourseHandicaps,
  unitGameNet,
  netFromPayouts,
  calculateJunks,
  calculateSideBetSettlements,
  calculateSkins, calculateSkinsPayouts, calculateSkinsNet,
  calculateBestBall, calculateBestBallPayouts,
  calculateNassau, calculateNassauPayouts,
  calculateWolf,
  calculateBBB, calculateBBBPayouts,
  calculateHammer,
  calculateDots,
  calculateBanker,
  calculateStableford, calculateStablefordPayouts,
  calculateQuota, calculateQuotaPayouts,
  calculateVegas, calculateVegasPayouts,
} from './gameLogic'
import type {
  Round, HoleScore, RoundPlayer, BBBPoint, JunkRecord, SideBet,
  SkinsConfig, BestBallConfig, NassauConfig, WolfConfig, HammerConfig,
  DotsConfig, BankerConfig, StablefordConfig, QuotaConfig, VegasConfig,
} from '../types'

export interface RoundNetInputs {
  round: Round
  roundScores: HoleScore[]
  roundPlayers: RoundPlayer[]
  bbbPoints?: BBBPoint[]
  junkRecords?: JunkRecord[]
  sideBets?: SideBet[]
}

export interface RoundNetResult {
  /** playerId → signed net (cents in money mode, points in points mode). Zero-sum. */
  netByPlayer: Record<string, number>
  /** True when the round had a game format (any of the 11 types) — i.e. it was contested. */
  hasGame: boolean
}

export function computeRoundPlayerNets(input: RoundNetInputs): RoundNetResult {
  const { round, roundScores, roundPlayers, bbbPoints = [], junkRecords = [], sideBets = [] } = input
  const players = round.players ?? []
  const snapshot = round.courseSnapshot

  const net: Record<string, number> = {}
  players.forEach(p => { net[p.id] = 0 })
  if (!players.length || !snapshot) return { netByPlayer: net, hasGame: false }

  const pSnap = makePlayableSnapshot(snapshot, roundToHolesConfig(round))
  const chm = buildCourseHandicaps(players, roundPlayers, snapshot, round.holesMode)
  const startHoles: Record<string, number> = {}
  roundPlayers.forEach(rp => { startHoles[rp.playerId] = rp.startHole ?? 1 })

  const game = round.game
  const hasGame = game != null

  const add = (m: Record<string, number>) => {
    for (const [id, v] of Object.entries(m)) net[id] = (net[id] ?? 0) + v
  }

  if (game) {
    const cfg = game.config
    const buyIn = game.buyInCents ?? 0
    try {
      let gameNet: Record<string, number> | null = null
      switch (game.type) {
        case 'skins': {
          const result = calculateSkins(players, roundScores, pSnap, cfg as SkinsConfig, chm, startHoles)
          // A mid-round joiner breaks the uniform-ante pot model, so skins settles
          // from a prorated signed net in that case (matches SettleUp Option A).
          const hasJoiner = Object.values(startHoles).some(h => h > 1)
          gameNet = hasJoiner
            ? calculateSkinsNet(result, game, players, startHoles)
            : netFromPayouts(calculateSkinsPayouts(result, game, players.length), players, buyIn)
          break
        }
        case 'best_ball': {
          const result = calculateBestBall(players, roundScores, pSnap, cfg as BestBallConfig, chm)
          gameNet = netFromPayouts(calculateBestBallPayouts(result, cfg as BestBallConfig, game, players), players, buyIn)
          break
        }
        case 'nassau': {
          const result = calculateNassau(players, roundScores, pSnap, cfg as NassauConfig, chm)
          gameNet = netFromPayouts(calculateNassauPayouts(result, game, players, roundScores, pSnap, chm), players, buyIn)
          break
        }
        case 'bingo_bango_bongo': {
          const result = calculateBBB(players, bbbPoints)
          gameNet = netFromPayouts(calculateBBBPayouts(result, game, players), players, buyIn)
          break
        }
        case 'stableford': {
          const result = calculateStableford(players, roundScores, pSnap, cfg as StablefordConfig, chm)
          gameNet = netFromPayouts(calculateStablefordPayouts(result, game, players), players, buyIn)
          break
        }
        case 'quota': {
          const result = calculateQuota(players, roundScores, pSnap, cfg as QuotaConfig, chm)
          gameNet = netFromPayouts(calculateQuotaPayouts(result, game, players), players, buyIn)
          break
        }
        case 'vegas': {
          const result = calculateVegas(players, roundScores, pSnap, cfg as VegasConfig, chm)
          gameNet = netFromPayouts(calculateVegasPayouts(result, cfg as VegasConfig, game, players), players, buyIn)
          break
        }
        // Unit games settle from a signed net, not a pot.
        case 'wolf': {
          gameNet = unitGameNet('wolf', buyIn, calculateWolf(players, roundScores, pSnap, cfg as WolfConfig, chm))
          break
        }
        case 'banker': {
          gameNet = unitGameNet('banker', buyIn, calculateBanker(players, roundScores, pSnap, cfg as BankerConfig, chm))
          break
        }
        case 'hammer': {
          gameNet = unitGameNet('hammer', buyIn, calculateHammer(players, roundScores, pSnap, cfg as HammerConfig, chm))
          break
        }
        case 'dots': {
          gameNet = unitGameNet('dots', buyIn, calculateDots(players, junkRecords, cfg as DotsConfig))
          break
        }
      }
      if (gameNet) add(gameNet)
    } catch {
      // Match SettleUp/existing stats behaviour: skip rounds whose game can't be
      // resolved rather than throwing out the whole stats page.
    }
  }

  // Junk side-bets (independent of the game format). Not applied for a 'dots' game,
  // whose junk_records ARE the game and are already counted above.
  if (round.junkConfig && junkRecords.length > 0 && game?.type !== 'dots') {
    try {
      const jr = calculateJunks(players, junkRecords, round.junkConfig)
      for (const [id, v] of Object.entries(jr.netCents)) net[id] = (net[id] ?? 0) + v
    } catch { /* skip */ }
  }

  // Resolved side bets, player-to-player.
  try {
    for (const s of calculateSideBetSettlements(sideBets)) {
      net[s.fromId] = (net[s.fromId] ?? 0) - s.amountCents
      net[s.toId] = (net[s.toId] ?? 0) + s.amountCents
    }
  } catch { /* skip */ }

  return { netByPlayer: net, hasGame }
}
