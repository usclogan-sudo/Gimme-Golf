import type {
  Player,
  CourseSnapshot,
  HoleScore,
  SkinsConfig,
  BestBallConfig,
  NassauConfig,
  WolfConfig,
  BBBPoint,
  JunkRecord,
  JunkConfig,
  JunkType,
  Game,
  GameType,
  RoundPlayer,
  Press,
  SideBet,
  HammerConfig,
  HammerHoleState,
  VegasConfig,
  StablefordConfig,
  DotsConfig,
  DotType,
  BankerConfig,
  QuotaConfig,
  PropBet,
  PropWager,
  HolesMode,
} from '../types'
import { getFrontBackSplit } from './holeUtils'

// ─── Handicap math ────────────────────────────────────────────────────────────

/** USGA course handicap formula */
export function calcCourseHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number,
): number {
  return Math.round(handicapIndex * (slope / 113) + (rating - par))
}

/** How many strokes a player receives on a specific hole. Positive = strokes given
 *  on the hardest holes (low stroke index). Negative = a PLUS handicap gives strokes
 *  back on the easiest holes (high stroke index) — a +4 (courseHcp −4) plays +1 to par
 *  on the four holes with the highest stroke index. (USGA plus-handicap allocation.) */
export function strokesOnHole(courseHcp: number, strokeIndex: number, totalHoles: number = 18): number {
  if (courseHcp < 0) {
    // Mirror of the positive case, allocated from the easiest hole (highest SI) up.
    let s = 0
    if (strokeIndex >= totalHoles + 1 + courseHcp) s--
    if (strokeIndex >= 2 * totalHoles + 1 + courseHcp) s--
    return s
  }
  let s = 0
  if (courseHcp >= strokeIndex) s++
  if (courseHcp >= totalHoles + strokeIndex) s++
  return s
}

/** Parse a handicap the way golfers write it: a leading "+" means a PLUS handicap
 *  (better than scratch), stored internally as a negative index (USGA convention).
 *  "+4" → −4 · "12.4" → 12.4 · "0" → 0 · "" → null. */
export function parseHandicap(input: string): number | null {
  const s = input.trim()
  if (s === '') return null
  const isPlus = s.startsWith('+')
  const n = parseFloat(s.replace(/^\+/, ''))
  if (isNaN(n)) return null
  return isPlus ? -Math.abs(n) : n
}

/** Display a handicap index in golf notation: a negative (plus) index shows as "+4",
 *  a normal index as-is, null/undefined as an em dash. */
export function fmtHandicap(index: number | null | undefined): string {
  if (index === null || index === undefined || isNaN(index as number)) return '—'
  return index < 0 ? `+${-index}` : `${index}`
}

/** Build playerId → courseHandicap map for all players in a round.
 *  When holesMode is front_9 or back_9, the course handicap is halved. */
export function buildCourseHandicaps(
  players: Player[],
  roundPlayers: RoundPlayer[],
  snapshot: CourseSnapshot,
  holesMode?: HolesMode,
): Record<string, number> {
  const par = snapshot.holes.reduce((s, h) => s + h.par, 0)
  const is9 = holesMode === 'front_9' || holesMode === 'back_9'
  const map: Record<string, number> = {}
  for (const p of players) {
    const rp = roundPlayers.find(x => x.playerId === p.id)
    const teeName = rp?.teePlayed ?? p.tee
    const tee = snapshot.tees.find(t => t.name === teeName)
    let hcp = tee
      ? calcCourseHandicap(p.handicapIndex, tee.slope, tee.rating, par)
      : Math.round(p.handicapIndex)
    if (is9) hcp = Math.round(hcp / 2)
    map[p.id] = hcp
  }
  return map
}

// ─── Skins ────────────────────────────────────────────────────────────────────

export interface HoleSkinsResult {
  holeNumber: number
  winnerId: string | null  // null = tied (carry or push)
  carry: number            // skins carried INTO this hole
  skinsInPlay: number      // total skins on the line this hole
}

export interface SkinsResult {
  skinsWon: Record<string, number>
  holeResults: HoleSkinsResult[]
  totalSkins: number
  /** skins still unresolved (carryover on hole 18) */
  pendingCarry: number
}

export function calculateSkins(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: SkinsConfig,
  courseHcps: Record<string, number>,
  /** playerId → join hole (mid-round). Absent ⇒ from the start. A player is only a
   *  contestant on holes ≥ their startHole, so a not-yet-joined player's missing
   *  score doesn't make an earlier hole "incomplete". */
  startHoles: Record<string, number> = {},
): SkinsResult {
  const skinsWon: Record<string, number> = {}
  const holeResults: HoleSkinsResult[] = []
  players.forEach(p => (skinsWon[p.id] = 0))
  const activeOn = (holeNum: number) => players.filter(p => (startHoles[p.id] ?? 1) <= holeNum)

  let carry = 0

  const totalHoles = snapshot.holes.length

  for (let holeNum = 1; holeNum <= totalHoles; holeNum++) {
    const hole = snapshot.holes.find(h => h.number === holeNum)
    if (!hole) continue

    const skinsInPlay = 1 + carry

    // Only players active on this hole are contestants — a player who joined later
    // isn't "missing" here.
    const scores = activeOn(holeNum).map(p => {
      const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === holeNum)
      if (!hs) return { playerId: p.id, score: null as number | null }
      const gross = hs.grossScore
      const net =
        config.mode === 'net'
          ? gross - strokesOnHole(courseHcps[p.id] ?? 0, hole.strokeIndex, totalHoles)
          : gross
      return { playerId: p.id, score: net }
    })

    const allScored = scores.length > 0 && scores.every(s => s.score !== null)
    if (!allScored) {
      holeResults.push({ holeNumber: holeNum, winnerId: null, carry, skinsInPlay })
      continue
    }

    const valid = scores as Array<{ playerId: string; score: number }>
    const minScore = Math.min(...valid.map(s => s.score))
    const winners = valid.filter(s => s.score === minScore)

    if (winners.length === 1) {
      const winnerId = winners[0].playerId
      skinsWon[winnerId] = (skinsWon[winnerId] ?? 0) + skinsInPlay
      holeResults.push({ holeNumber: holeNum, winnerId, carry, skinsInPlay })
      carry = 0
    } else {
      if (config.carryovers) {
        holeResults.push({ holeNumber: holeNum, winnerId: null, carry, skinsInPlay })
        carry++
      } else {
        holeResults.push({ holeNumber: holeNum, winnerId: null, carry: 0, skinsInPlay: 1 })
        carry = 0
      }
    }
  }

  let pendingCarry = 0
  if (carry > 0 && config.carryovers) {
    const lastHoleNum = totalHoles
    const lastHole = snapshot.holes.find(h => h.number === lastHoleNum)
    const scoresLast = activeOn(lastHoleNum).map(p => {
      const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === lastHoleNum)
      if (!hs || !lastHole) return { playerId: p.id, score: null as number | null }
      const gross = hs.grossScore
      const net =
        config.mode === 'net'
          ? gross - strokesOnHole(courseHcps[p.id] ?? 0, lastHole.strokeIndex, totalHoles)
          : gross
      return { playerId: p.id, score: net }
    })
    const valid18 = scoresLast.filter(s => s.score !== null) as Array<{
      playerId: string
      score: number
    }>
    if (valid18.length > 0) {
      const min18 = Math.min(...valid18.map(s => s.score))
      const tied18 = valid18.filter(s => s.score === min18)
      const perPlayer = Math.floor(carry / tied18.length)
      let rem = carry - perPlayer * tied18.length
      for (const t of tied18) {
        const extra = rem > 0 ? 1 : 0
        rem = Math.max(0, rem - 1)
        skinsWon[t.playerId] = (skinsWon[t.playerId] ?? 0) + perPlayer + extra
      }
    } else {
      pendingCarry = carry
    }
    carry = 0
  }

  const totalSkins = Object.values(skinsWon).reduce((s, n) => s + n, 0)
  return { skinsWon, holeResults, totalSkins, pendingCarry }
}

/**
 * Round a map of ×divisor-scaled integers to integer cents that STILL sum to zero.
 * Largest-remainder method: truncate toward zero, then hand the residual ±1s to the
 * entries with the most extreme fractional parts. Used so Option-A Skins nets stay
 * exactly zero-sum after the ÷totalHoles proration.
 */
function divideZeroSum(scaled: Record<string, number>, divisor: number): Record<string, number> {
  const ids = Object.keys(scaled)
  const out: Record<string, number> = {}
  const frac: Array<{ id: string; f: number }> = []
  let sum = 0
  for (const id of ids) {
    const v = scaled[id] / divisor
    const b = Math.trunc(v)
    out[id] = b
    sum += b
    frac.push({ id, f: v - b })
  }
  let residual = -sum // ±1s needed to reach a zero sum
  if (residual > 0) {
    frac.sort((a, b) => b.f - a.f)
    for (let i = 0; i < residual && i < frac.length; i++) out[frac[i].id] += 1
  } else if (residual < 0) {
    frac.sort((a, b) => a.f - b.f)
    for (let i = 0; i < -residual && i < frac.length; i++) out[frac[i].id] -= 1
  }
  return out
}

/**
 * Signed net cents per player for Skins with a MID-ROUND ROSTER (Option A —
 * "you're in the bets from the hole you joined"). Each hole's skin is valued at
 * `buyIn × (players active that hole) ÷ totalHoles` and funded equally by exactly
 * those active players, so a late joiner only funds — and can only win — holes on or
 * after their startHole; earlier skins keep their original (smaller) value.
 *
 * Returns net = winnings − prorated ante, summing to zero. For a CONSTANT roster on
 * a fully-resolved, press-free round this reduces exactly to the pot model
 * (calculateSkinsPayouts + netFromPayouts) — but callers should only use this when a
 * joiner is actually present and keep the pot path otherwise (see SettleUp).
 *
 * `startHoles`: playerId → the hole they joined (absent ⇒ round start, i.e. 1).
 */
export function calculateSkinsNet(
  result: SkinsResult,
  game: Game,
  players: Player[],
  startHoles: Record<string, number>,
): Record<string, number> {
  const presses: Press[] = (game.config as SkinsConfig).presses ?? []
  const buyIn = game.buyInCents
  const startOf = (id: string) => startHoles[id] ?? 1
  const pressMult = (h: number) => Math.pow(2, presses.filter(p => p.holeNumber <= h).length)

  // Holes after the last WON hole are an unresolved trailing carry — nobody is
  // charged for them (mirrors the pot model paying nothing when a skin never
  // resolves), so their entries are effectively returned.
  let lastWon = 0
  for (const hr of result.holeResults) if (hr.winnerId) lastWon = Math.max(lastWon, hr.holeNumber)
  const zero: Record<string, number> = {}
  players.forEach(p => (zero[p.id] = 0))
  if (lastWon === 0) return zero

  // The per-round buy-in is spread over the holes that actually counted — i.e. up to
  // the last resolved hole — NOT the scheduled 18. So a round that ends after a few
  // holes still charges each full-round player their whole buy-in (matching the pot
  // model), rather than 1/18th of it.
  const divisor = lastWon

  const winningsS: Record<string, number> = { ...zero }
  const anteS: Record<string, number> = { ...zero }
  let carryS = 0
  for (const hr of result.holeResults) {
    if (hr.holeNumber > lastWon) break
    const active = players.filter(p => startOf(p.id) <= hr.holeNumber)
    const mult = pressMult(hr.holeNumber)
    const holeValueS = buyIn * active.length * mult // = holeValue × totalHoles
    for (const p of active) anteS[p.id] += buyIn * mult // equal share of the hole
    if (hr.winnerId) {
      winningsS[hr.winnerId] += carryS + holeValueS
      carryS = 0
    } else {
      carryS += holeValueS
    }
  }

  const netS: Record<string, number> = {}
  players.forEach(p => (netS[p.id] = winningsS[p.id] - anteS[p.id]))
  return divideZeroSum(netS, divisor)
}

// ─── Best Ball ────────────────────────────────────────────────────────────────

export interface HoleBestBallResult {
  holeNumber: number
  bestA: number | null
  bestB: number | null
  winner: 'A' | 'B' | 'tie' | 'incomplete'
}

export interface BestBallResult {
  holesWon: { A: number; B: number; tied: number }
  totalScore: { A: number; B: number }
  winner: 'A' | 'B' | 'tie'
  holeResults: HoleBestBallResult[]
}

export function calculateBestBall(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: BestBallConfig,
  courseHcps: Record<string, number>,
): BestBallResult {
  const holesWon = { A: 0, B: 0, tied: 0 }
  const totalScore = { A: 0, B: 0 }
  const holeResults: HoleBestBallResult[] = []

  const totalHoles = snapshot.holes.length

  for (let holeNum = 1; holeNum <= totalHoles; holeNum++) {
    const hole = snapshot.holes.find(h => h.number === holeNum)
    if (!hole) continue

    let bestA: number | null = null
    let bestB: number | null = null

    for (const p of players) {
      const team = config.teams[p.id]
      if (!team) continue
      const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === holeNum)
      if (!hs) continue
      const gross = hs.grossScore
      const score =
        config.mode === 'net'
          ? gross - strokesOnHole(courseHcps[p.id] ?? 0, hole.strokeIndex, totalHoles)
          : gross
      if (team === 'A') {
        if (bestA === null || score < bestA) bestA = score
      } else {
        if (bestB === null || score < bestB) bestB = score
      }
    }

    if (bestA === null || bestB === null) {
      holeResults.push({ holeNumber: holeNum, bestA, bestB, winner: 'incomplete' })
      continue
    }

    if (config.scoring === 'total') {
      totalScore.A += bestA
      totalScore.B += bestB
    }

    let holeWinner: 'A' | 'B' | 'tie'
    if (bestA < bestB) {
      holesWon.A++
      holeWinner = 'A'
    } else if (bestB < bestA) {
      holesWon.B++
      holeWinner = 'B'
    } else {
      holesWon.tied++
      holeWinner = 'tie'
    }
    holeResults.push({ holeNumber: holeNum, bestA, bestB, winner: holeWinner })
  }

  let winner: 'A' | 'B' | 'tie'
  if (config.scoring === 'match') {
    winner = holesWon.A > holesWon.B ? 'A' : holesWon.B > holesWon.A ? 'B' : 'tie'
  } else {
    winner = totalScore.A < totalScore.B ? 'A' : totalScore.B < totalScore.A ? 'B' : 'tie'
  }

  return { holesWon, totalScore, winner, holeResults }
}

// ─── Nassau ───────────────────────────────────────────────────────────────────

export interface NassauSegmentResult {
  holeRange: string
  scores: Record<string, number>   // playerId → total strokes for segment
  winner: string | null            // playerId, or null if tied/incomplete
  tiedPlayers: string[]            // players tied for the lead
  incomplete: boolean
}

export interface NassauResult {
  front: NassauSegmentResult
  back: NassauSegmentResult
  total: NassauSegmentResult
}

function nassauSegment(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: NassauConfig,
  courseHcps: Record<string, number>,
  holeNums: number[],
  holeRange: string,
): NassauSegmentResult {
  const scores: Record<string, number> = {}
  let incomplete = false
  const totalHoles = snapshot.holes.length

  for (const p of players) {
    let total = 0
    for (const holeNum of holeNums) {
      const hole = snapshot.holes.find(h => h.number === holeNum)
      const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === holeNum)
      if (!hs || !hole) { incomplete = true; break }
      const gross = hs.grossScore
      total +=
        config.mode === 'net'
          ? gross - strokesOnHole(courseHcps[p.id] ?? 0, hole.strokeIndex, totalHoles)
          : gross
    }
    scores[p.id] = total
  }

  if (incomplete) {
    return { holeRange, scores, winner: null, tiedPlayers: [], incomplete: true }
  }

  if (Object.keys(scores).length === 0) {
    return { holeRange, scores, winner: null, tiedPlayers: [], incomplete: true }
  }

  const min = Math.min(...Object.values(scores))
  const tiedPlayers = Object.entries(scores)
    .filter(([, s]) => s === min)
    .map(([id]) => id)

  return {
    holeRange,
    scores,
    winner: tiedPlayers.length === 1 ? tiedPlayers[0] : null,
    tiedPlayers,
    incomplete: false,
  }
}

export function calculateNassau(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: NassauConfig,
  courseHcps: Record<string, number>,
): NassauResult {
  const holeNums = snapshot.holes.map(h => h.number)
  const { frontHoles, backHoles } = getFrontBackSplit(snapshot.holes)
  const frontLabel = `${frontHoles[0]}–${frontHoles[frontHoles.length - 1]}`
  const backLabel = `${backHoles[0]}–${backHoles[backHoles.length - 1]}`
  const allLabel = `${holeNums[0]}–${holeNums[holeNums.length - 1]}`

  return {
    front: nassauSegment(players, holeScores, snapshot, config, courseHcps, frontHoles, frontLabel),
    back: nassauSegment(players, holeScores, snapshot, config, courseHcps, backHoles, backLabel),
    total: nassauSegment(players, holeScores, snapshot, config, courseHcps, holeNums, allLabel),
  }
}

export interface NassauLiveSegment {
  holesPlayed: number
  totalHoles: number
  leaderId: string | null   // null = all square or nothing played
  margin: number            // strokes the leader is ahead of the next player
  started: boolean
}

/**
 * Live leg status over the holes PLAYED so far in each segment — so a segment
 * mid-nine reads "Test leads by 2 (thru 4)" instead of a blank "—". Uses the same
 * lowest-total scoring as the final segment result, but only over holes everyone
 * has a score for.
 */
export function nassauLive(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: NassauConfig,
  courseHcps: Record<string, number>,
): { front: NassauLiveSegment; back: NassauLiveSegment; total: NassauLiveSegment } {
  const totalHoles = snapshot.holes.length
  const { frontHoles, backHoles } = getFrontBackSplit(snapshot.holes)
  const allHoles = snapshot.holes.map(h => h.number)

  const segFor = (holeNums: number[]): NassauLiveSegment => {
    // Only count holes where every player has posted a score.
    const played = holeNums.filter(hn =>
      players.every(p => holeScores.some(s => s.playerId === p.id && s.holeNumber === hn)),
    )
    if (played.length === 0) {
      return { holesPlayed: 0, totalHoles: holeNums.length, leaderId: null, margin: 0, started: false }
    }
    const scores: Record<string, number> = {}
    for (const p of players) {
      let total = 0
      for (const hn of played) {
        const hole = snapshot.holes.find(h => h.number === hn)!
        const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === hn)!
        total += config.mode === 'net'
          ? hs.grossScore - strokesOnHole(courseHcps[p.id] ?? 0, hole.strokeIndex, totalHoles)
          : hs.grossScore
      }
      scores[p.id] = total
    }
    const sorted = Object.entries(scores).sort((a, b) => a[1] - b[1])
    const [leaderId, low] = sorted[0]
    const nextLow = sorted[1]?.[1] ?? low
    const margin = nextLow - low
    return {
      holesPlayed: played.length,
      totalHoles: holeNums.length,
      leaderId: margin === 0 ? null : leaderId,
      margin,
      started: true,
    }
  }

  return { front: segFor(frontHoles), back: segFor(backHoles), total: segFor(allHoles) }
}

export function calculateNassauPayouts(
  result: NassauResult,
  game: Game,
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  courseHcps: Record<string, number>,
): PlayerPayout[] {
  const presses: Press[] = (game.config as NassauConfig).presses ?? []
  // buyInCents = total per player; divide equally across 3 segments
  const totalPot = game.buyInCents * players.length
  const segPot = Math.floor(totalPot / 3)

  const map: Record<string, { amount: number; reasons: string[] }> = {}
  players.forEach(p => (map[p.id] = { amount: 0, reasons: [] }))

  const segs = [
    { seg: result.front, label: `Front (${result.front.holeRange})` },
    { seg: result.back, label: `Back (${result.back.holeRange})` },
    { seg: result.total, label: `Total (${result.total.holeRange})` },
  ]

  // Track how much of the base pot actually gets won. Every player is charged
  // buyInCents up front (netFromPayouts subtracts it), so any segment pot that is
  // NOT won — an incomplete leg on a round that ended early, or the floor remainder
  // — must be refunded, or the standings won't sum to zero (the "both players at
  // −25, all square" bug on a partial round).
  let baseWon = 0
  for (const { seg, label } of segs) {
    const winners = seg.incomplete ? [] : seg.winner ? [seg.winner] : seg.tiedPlayers
    if (winners.length === 0) continue
    const perWinner = Math.floor(segPot / winners.length)
    let rem = segPot - perWinner * winners.length
    for (const id of winners) {
      const extra = rem > 0 ? 1 : 0
      rem = Math.max(0, rem - extra)
      map[id].amount += perWinner + extra
      baseWon += perWinner + extra
      map[id].reasons.push(winners.length > 1 ? `${label} (split)` : label)
    }
  }

  // Refund the unwon base pot evenly so the base game is exactly zero-sum. When no
  // leg completed at all this returns every player's full entry (net 0 each).
  const baseRefund = totalPot - baseWon
  if (baseRefund > 0) {
    const per = Math.floor(baseRefund / players.length)
    let rem = baseRefund - per * players.length
    for (const p of players) {
      const extra = rem > 0 ? 1 : 0
      rem = Math.max(0, rem - extra)
      const give = per + extra
      if (give > 0) {
        map[p.id].amount += give
        map[p.id].reasons.push('Entry returned (leg not completed)')
      }
    }
  }

  // Press bets: each press creates a sub-segment from press hole to end of nine
  // Worth the same as one original segment bet per player
  const pressPot = Math.floor(game.buyInCents * players.length / 3)
  // Derive hole boundaries from the result segments
  const frontParts = result.front.holeRange.split('–').map(Number)
  const frontEnd = frontParts[1] ?? frontParts[0]
  const backParts = result.back.holeRange.split('–').map(Number)
  const backEnd = backParts[1] ?? backParts[0]

  for (const press of presses) {
    const inFront = press.holeNumber <= frontEnd
    const endHole = inFront ? frontEnd : backEnd
    const pressHoleNums = Array.from(
      { length: endHole - press.holeNumber + 1 },
      (_, i) => press.holeNumber + i
    )
    const holeRange = `${press.holeNumber}–${endHole}`
    const config = game.config as NassauConfig
    const seg = nassauSegment(players, holeScores, snapshot, config, courseHcps, pressHoleNums, holeRange)
    if (seg.incomplete) continue
    const winners = seg.winner ? [seg.winner] : seg.tiedPlayers
    if (winners.length === 0) continue
    const perWinner = Math.floor(pressPot / winners.length)
    let rem = pressPot - perWinner * winners.length
    for (const id of winners) {
      const extra = rem > 0 ? 1 : 0
      rem = Math.max(0, rem - extra)
      map[id].amount += perWinner + extra
      map[id].reasons.push(`Press ${holeRange}`)
    }
  }

  return Object.entries(map)
    .filter(([, { amount }]) => amount > 0)
    .map(([playerId, { amount, reasons }]) => ({
      playerId,
      amountCents: amount,
      reason: reasons.join(' + '),
    }))
}

// ─── Wolf ─────────────────────────────────────────────────────────────────────

/** Which player is wolf on a given hole (1-based) */
export function wolfForHole(wolfOrder: string[], holeNumber: number): string {
  if (wolfOrder.length === 0) return ''
  return wolfOrder[(holeNumber - 1) % wolfOrder.length]
}

export interface WolfHoleResult {
  holeNumber: number
  wolfId: string
  partnerId: string | null   // null = lone wolf
  loneWolf: boolean
  wolfTeamWon: boolean | null // null = tie or incomplete
  tied: boolean
}

export interface WolfResult {
  holeResults: WolfHoleResult[]
  netUnits: Record<string, number>  // playerId → net units (can be negative)
}

export function calculateWolf(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: WolfConfig,
  courseHcps: Record<string, number>,
): WolfResult {
  const holeResults: WolfHoleResult[] = []
  const netUnits: Record<string, number> = {}
  players.forEach(p => (netUnits[p.id] = 0))

  const totalHoles = snapshot.holes.length

  for (let holeNum = 1; holeNum <= totalHoles; holeNum++) {
    const wolfId = wolfForHole(config.wolfOrder, holeNum)
    const decision = config.holeDecisions?.[holeNum]

    if (!decision) {
      holeResults.push({ holeNumber: holeNum, wolfId, partnerId: null, loneWolf: false, wolfTeamWon: null, tied: false })
      continue
    }

    const { partnerId } = decision
    const loneWolf = partnerId === null
    const hole = snapshot.holes.find(h => h.number === holeNum)
    if (!hole) continue

    const getScore = (playerId: string): number | null => {
      const hs = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNum)
      if (!hs) return null
      return config.mode === 'net'
        ? hs.grossScore - strokesOnHole(courseHcps[playerId] ?? 0, hole.strokeIndex, totalHoles)
        : hs.grossScore
    }

    const wolfScore = getScore(wolfId)

    if (loneWolf) {
      const others = players.filter(p => p.id !== wolfId)
      const otherScores = others.map(p => getScore(p.id))
      if (wolfScore === null || otherScores.some(s => s === null)) {
        holeResults.push({ holeNumber: holeNum, wolfId, partnerId: null, loneWolf: true, wolfTeamWon: null, tied: false })
        continue
      }
      const othersMin = Math.min(...(otherScores as number[]))
      const wolfWon = wolfScore < othersMin
      const tied = wolfScore === othersMin
      holeResults.push({ holeNumber: holeNum, wolfId, partnerId: null, loneWolf: true, wolfTeamWon: tied ? null : wolfWon, tied })

      if (!tied) {
        const units = 2  // lone wolf = double value
        if (wolfWon) {
          netUnits[wolfId] += units * others.length
          others.forEach(p => (netUnits[p.id] -= units))
        } else {
          netUnits[wolfId] -= units * others.length
          others.forEach(p => (netUnits[p.id] += units))
        }
      }
    } else {
      const wolfTeam = [wolfId, partnerId]
      const otherTeam = players.filter(p => !wolfTeam.includes(p.id)).map(p => p.id)
      const wolfTeamScores = wolfTeam.map(getScore)
      const otherTeamScores = otherTeam.map(getScore)

      if (wolfTeamScores.some(s => s === null) || otherTeamScores.some(s => s === null)) {
        holeResults.push({ holeNumber: holeNum, wolfId, partnerId, loneWolf: false, wolfTeamWon: null, tied: false })
        continue
      }

      const wolfBest = Math.min(...(wolfTeamScores as number[]))
      const otherBest = Math.min(...(otherTeamScores as number[]))
      const wolfWon = wolfBest < otherBest
      const tied = wolfBest === otherBest

      holeResults.push({ holeNumber: holeNum, wolfId, partnerId, loneWolf: false, wolfTeamWon: tied ? null : wolfWon, tied })

      if (!tied) {
        const winners = wolfWon ? wolfTeam : otherTeam
        const losers = wolfWon ? otherTeam : wolfTeam
        winners.forEach(id => (netUnits[id] += losers.length))
        losers.forEach(id => (netUnits[id] -= winners.length))
      }
    }
  }

  return { holeResults, netUnits }
}

export function calculateWolfPayouts(
  result: WolfResult,
  game: Game,
  players: Player[],
): PlayerPayout[] {
  const totalPot = game.buyInCents * players.length
  const positiveUnits = Object.values(result.netUnits).filter(u => u > 0).reduce((s, u) => s + u, 0)

  if (positiveUnits === 0) {
    return refundEvenly(players, totalPot, 'Wolf — all square, refund')
  }

  const centsPerUnit = Math.floor(totalPot / positiveUnits)
  let remainder = totalPot - centsPerUnit * positiveUnits

  return Object.entries(result.netUnits)
    .filter(([, u]) => u > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([playerId, u]) => {
      const extra = remainder > 0 ? Math.min(u, remainder) : 0
      remainder = Math.max(0, remainder - extra)
      return {
        playerId,
        amountCents: u * centsPerUnit + extra,
        reason: `Wolf +${u} unit${u !== 1 ? 's' : ''}`,
      }
    })
}

// ─── Bingo Bango Bongo ────────────────────────────────────────────────────────

export interface BBBResult {
  pointsWon: Record<string, number>  // playerId → total points earned
  totalPoints: number
  /** Player ids referenced by stored BBB rows that aren't in the current
   *  player list (e.g. a player was removed mid-round). Surface these to
   *  the user so they can clean up the stale entries. */
  unknownPlayerIds: string[]
}

export function calculateBBB(
  players: Player[],
  bbbPoints: BBBPoint[],
): BBBResult {
  const pointsWon: Record<string, number> = {}
  players.forEach(p => (pointsWon[p.id] = 0))

  const unknown = new Set<string>()
  const tally = (id: string | undefined | null) => {
    if (!id) return
    if (pointsWon[id] !== undefined) pointsWon[id]++
    else unknown.add(id)
  }
  for (const pt of bbbPoints) {
    tally(pt.bingo); tally(pt.bango); tally(pt.bongo)
  }

  const totalPoints = Object.values(pointsWon).reduce((s, p) => s + p, 0)
  return { pointsWon, totalPoints, unknownPlayerIds: Array.from(unknown) }
}

export function calculateBBBPayouts(
  result: BBBResult,
  game: Game,
  players: Player[],
): PlayerPayout[] {
  const totalPot = game.buyInCents * players.length

  if (result.totalPoints === 0) {
    return refundEvenly(players, totalPot, 'BBB — no points recorded, refund')
  }

  const entries = Object.entries(result.pointsWon)
    .filter(([, pts]) => pts > 0)
    .sort((a, b) => b[1] - a[1])

  const totalPoints = result.totalPoints
  let remainder = totalPot

  const payouts = entries.map(([playerId, pts]) => {
    const share = Math.floor((pts / totalPoints) * totalPot)
    remainder -= share
    return {
      playerId,
      amountCents: share,
      reason: `${pts} point${pts !== 1 ? 's' : ''} (Bingo/Bango/Bongo)`,
    }
  })

  // Distribute remainder cents to top earners
  for (let i = 0; i < payouts.length && remainder > 0; i++) {
    payouts[i].amountCents++
    remainder--
  }

  return payouts
}

// ─── Hammer ──────────────────────────────────────────────────────────────────

export interface HammerResult {
  /** Net cents per player (positive = won, negative = lost) */
  netCents: Record<string, number>
  /** Per-hole results */
  holeResults: HammerHoleResult[]
  totalHolesPlayed: number
}

export interface HammerHoleResult {
  holeNumber: number
  hammerState: HammerHoleState | null
  winnerId: string | null
  amountCents: number
}

/**
 * Calculate hammer results from hole scores and hammer states.
 * Hammer is a 2-player game. Each hole, the hammer holder can "throw" to double.
 * If declined, thrower wins the current value. If accepted, value doubles and play continues.
 * If no hammer thrown, the hole winner gets the base value.
 */
export function calculateHammer(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: HammerConfig,
  _courseHcps: Record<string, number>,
): HammerResult {
  const netCents: Record<string, number> = {}
  const holeResults: HammerHoleResult[] = []
  players.forEach(p => (netCents[p.id] = 0))

  if (players.length !== 2) {
    return { netCents, holeResults, totalHolesPlayed: 0 }
  }

  const [p1, p2] = players
  const totalHoles = snapshot.holes.length

  for (let holeNum = 1; holeNum <= totalHoles; holeNum++) {
    const hole = snapshot.holes.find(h => h.number === holeNum)
    if (!hole) continue

    const hammerState = config.hammerStates?.[holeNum] ?? null

    // Get scores for both players
    const getNet = (playerId: string): number | null => {
      const hs = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNum)
      if (!hs) return null
      return hs.grossScore // Hammer is always gross
    }

    const s1 = getNet(p1.id)
    const s2 = getNet(p2.id)

    if (s1 === null || s2 === null) {
      holeResults.push({ holeNumber: holeNum, hammerState, winnerId: null, amountCents: 0 })
      continue
    }

    // If hammer was declined, the thrower wins the pre-throw value
    if (hammerState?.declined) {
      const thrower = hammerState.hammerHolder
      const decliner = hammerState.declinedBy ?? (thrower === p1.id ? p2.id : p1.id)
      // Value before the throw (half the current doubled value)
      const winAmount = Math.floor(hammerState.value / 2)
      netCents[thrower] += winAmount
      netCents[decliner] -= winAmount
      holeResults.push({ holeNumber: holeNum, hammerState, winnerId: thrower, amountCents: winAmount })
      continue
    }

    // Determine hole value
    const holeValue = hammerState?.value ?? config.baseValueCents

    // Determine winner by score
    if (s1 < s2) {
      netCents[p1.id] += holeValue
      netCents[p2.id] -= holeValue
      holeResults.push({ holeNumber: holeNum, hammerState, winnerId: p1.id, amountCents: holeValue })
    } else if (s2 < s1) {
      netCents[p2.id] += holeValue
      netCents[p1.id] -= holeValue
      holeResults.push({ holeNumber: holeNum, hammerState, winnerId: p2.id, amountCents: holeValue })
    } else {
      // Tie — push, no money exchanged
      holeResults.push({ holeNumber: holeNum, hammerState, winnerId: null, amountCents: 0 })
    }
  }

  return {
    netCents,
    holeResults,
    totalHolesPlayed: holeResults.filter(h => h.winnerId !== null).length,
  }
}

export function calculateHammerPayouts(
  result: HammerResult,
  _game: Game,
  players: Player[],
): PlayerPayout[] {
  if (players.length !== 2) return []

  // In hammer, there's no traditional pot. Settlements are direct.
  // But we use the payout structure to show who won/lost net.
  const payouts: PlayerPayout[] = []
  for (const p of players) {
    const net = result.netCents[p.id] ?? 0
    if (net > 0) {
      payouts.push({
        playerId: p.id,
        amountCents: net,
        reason: `Hammer winner (${result.totalHolesPlayed} hole${result.totalHolesPlayed !== 1 ? 's' : ''} played)`,
      })
    }
  }
  return payouts
}

// ─── Vegas ────────────────────────────────────────────────────────────────────

export interface VegasHoleResult {
  holeNumber: number
  teamAScore: number | null  // 2-digit combo (e.g. 45)
  teamBScore: number | null
  diff: number               // positive = Team A wins
}

export interface VegasResult {
  holeResults: VegasHoleResult[]
  netPoints: { A: number; B: number }
  winner: 'A' | 'B' | 'tie'
}

export function calculateVegas(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: VegasConfig,
  courseHcps: Record<string, number>,
): VegasResult {
  const holeResults: VegasHoleResult[] = []
  const netPoints = { A: 0, B: 0 }
  const totalHoles = snapshot.holes.length

  for (let holeNum = 1; holeNum <= totalHoles; holeNum++) {
    const hole = snapshot.holes.find(h => h.number === holeNum)
    if (!hole) continue

    const teamScores: { A: number[]; B: number[] } = { A: [], B: [] }
    let incomplete = false

    for (const p of players) {
      const team = config.teams[p.id]
      if (!team) continue
      const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === holeNum)
      if (!hs) { incomplete = true; continue }
      const score = config.mode === 'net'
        ? hs.grossScore - strokesOnHole(courseHcps[p.id] ?? 0, hole.strokeIndex, totalHoles)
        : hs.grossScore
      teamScores[team].push(score)
    }

    if (incomplete || teamScores.A.length === 0 || teamScores.B.length === 0) {
      holeResults.push({ holeNumber: holeNum, teamAScore: null, teamBScore: null, diff: 0 })
      continue
    }

    // Vegas scoring: sort each team's scores low-high, combine as digits
    const sortedA = teamScores.A.sort((a, b) => a - b)
    const sortedB = teamScores.B.sort((a, b) => a - b)
    const comboA = sortedA.length >= 2 ? sortedA[0] * 10 + sortedA[1] : sortedA[0]
    const comboB = sortedB.length >= 2 ? sortedB[0] * 10 + sortedB[1] : sortedB[0]
    const diff = comboB - comboA // positive = Team A wins

    netPoints.A += Math.max(0, diff)
    netPoints.B += Math.max(0, -diff)

    holeResults.push({ holeNumber: holeNum, teamAScore: comboA, teamBScore: comboB, diff })
  }

  const winner = netPoints.A > netPoints.B ? 'A' : netPoints.B > netPoints.A ? 'B' : 'tie'
  return { holeResults, netPoints, winner }
}

export function calculateVegasPayouts(
  result: VegasResult,
  config: VegasConfig,
  game: Game,
  players: Player[],
): PlayerPayout[] {
  const potCents = game.buyInCents * players.length

  if (result.winner === 'tie') {
    return refundEvenly(players, potCents, 'Vegas — tie, refund')
  }

  const winTeam = result.winner
  const winnerIds = players.filter(p => config.teams[p.id] === winTeam).map(p => p.id)
  const perWinner = Math.floor(potCents / winnerIds.length)
  let remainder = potCents - perWinner * winnerIds.length

  return winnerIds.map(pid => {
    const extra = Math.min(remainder, 1)
    remainder -= extra
    return { playerId: pid, amountCents: perWinner + extra, reason: `Vegas winner (Team ${winTeam})` }
  })
}

// ─── Stableford ──────────────────────────────────────────────────────────────

export interface StablefordResult {
  points: Record<string, number>  // playerId → total stableford points
  holePoints: Record<string, Record<number, number>>  // playerId → holeNum → points
  winner: string | null
}

/**
 * Stableford scoring:
 * Double bogey or worse = 0, Bogey = 1, Par = 2, Birdie = 3, Eagle = 4, Double Eagle = 5
 */
export function calculateStableford(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: StablefordConfig,
  courseHcps: Record<string, number>,
): StablefordResult {
  const points: Record<string, number> = {}
  const holePoints: Record<string, Record<number, number>> = {}
  players.forEach(p => { points[p.id] = 0; holePoints[p.id] = {} })
  const totalHoles = snapshot.holes.length

  for (let holeNum = 1; holeNum <= totalHoles; holeNum++) {
    const hole = snapshot.holes.find(h => h.number === holeNum)
    if (!hole) continue

    for (const p of players) {
      const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === holeNum)
      if (!hs) continue
      const score = config.mode === 'net'
        ? hs.grossScore - strokesOnHole(courseHcps[p.id] ?? 0, hole.strokeIndex, totalHoles)
        : hs.grossScore
      const diff = score - hole.par
      let pts = 0
      if (diff <= -3) pts = 5      // albatross+
      else if (diff === -2) pts = 4 // eagle
      else if (diff === -1) pts = 3 // birdie
      else if (diff === 0) pts = 2  // par
      else if (diff === 1) pts = 1  // bogey
      // double bogey or worse = 0

      holePoints[p.id][holeNum] = pts
      points[p.id] += pts
    }
  }

  if (Object.keys(points).length === 0) {
    return { points, holePoints, winner: null }
  }

  const maxPts = Math.max(...Object.values(points))
  const leaders = Object.entries(points).filter(([, p]) => p === maxPts)
  const winner = leaders.length === 1 ? leaders[0][0] : null

  return { points, holePoints, winner }
}

export function calculateStablefordPayouts(
  result: StablefordResult,
  game: Game,
  players: Player[],
): PlayerPayout[] {
  const totalPot = game.buyInCents * players.length
  const totalPoints = Object.values(result.points).reduce((s, p) => s + p, 0)

  if (totalPoints === 0) {
    return refundEvenly(players, totalPot, 'Stableford — no points, refund')
  }

  let remainder = totalPot
  const payouts = Object.entries(result.points)
    .filter(([, pts]) => pts > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([playerId, pts]) => {
      const share = Math.floor((pts / totalPoints) * totalPot)
      remainder -= share
      return { playerId, amountCents: share, reason: `${pts} Stableford point${pts !== 1 ? 's' : ''}` }
    })

  for (let i = 0; i < payouts.length && remainder > 0; i++) {
    payouts[i].amountCents++
    remainder--
  }

  return payouts
}

// ─── Dots ────────────────────────────────────────────────────────────────────

export const DOT_LABELS: Record<DotType, { emoji: string; name: string; description: string }> = {
  sandy: { emoji: '🏖️', name: 'Sandy', description: 'Par or better from a bunker' },
  greenie: { emoji: '🟢', name: 'Greenie', description: 'On the green in regulation (par 3s)' },
  snake: { emoji: '🐍', name: 'Snake', description: '3-putt (pays others)' },
  barkie: { emoji: '🌳', name: 'Barkie', description: 'Hit a tree, still make par' },
  ctp: { emoji: '🎯', name: 'CTP', description: 'Closest to the pin' },
  fairway_hit: { emoji: '🏌️', name: 'Fairway Hit', description: 'Tee shot on the fairway' },
  up_and_down: { emoji: '⬆️', name: 'Up & Down', description: 'Get up and down from off the green' },
  one_putt: { emoji: '1️⃣', name: 'One Putt', description: 'Hole out in a single putt' },
  longest_drive: { emoji: '💪', name: 'Longest Drive', description: 'Longest drive on the hole' },
  par_save: { emoji: '💾', name: 'Par Save', description: 'Save par after being in trouble' },
}

export interface DotsResult {
  netCents: Record<string, number>
  tallies: Record<string, Record<DotType, number>>
}

export function calculateDots(
  players: Player[],
  junkRecords: JunkRecord[],
  config: DotsConfig,
): DotsResult {
  const netCents: Record<string, number> = {}
  const tallies: Record<string, Record<DotType, number>> = {}
  const others = players.length - 1

  for (const p of players) {
    netCents[p.id] = 0
    const t: any = {}
    for (const dt of config.activeDots) t[dt] = 0
    tallies[p.id] = t
  }

  for (const jr of junkRecords) {
    const dt = jr.junkType as DotType
    if (!config.activeDots.includes(dt)) continue
    if (!tallies[jr.playerId]) continue

    tallies[jr.playerId][dt] = (tallies[jr.playerId][dt] ?? 0) + 1

    if (dt === 'snake') {
      netCents[jr.playerId] -= config.valueCentsPerDot * others
      for (const p of players) {
        if (p.id !== jr.playerId) netCents[p.id] += config.valueCentsPerDot
      }
    } else {
      netCents[jr.playerId] += config.valueCentsPerDot * others
      for (const p of players) {
        if (p.id !== jr.playerId) netCents[p.id] -= config.valueCentsPerDot
      }
    }
  }

  return { netCents, tallies }
}

export function calculateDotsPayouts(
  result: DotsResult,
  _game: Game,
  _players: Player[],
): PlayerPayout[] {
  // Dots is direct settlement, not pot-based. Use net cents directly.
  return Object.entries(result.netCents)
    .filter(([, net]) => net > 0)
    .map(([playerId, net]) => ({
      playerId,
      amountCents: net,
      reason: `Dots net winnings`,
    }))
}

// ─── Banker ──────────────────────────────────────────────────────────────────

export interface BankerHoleResult {
  holeNumber: number
  bankerId: string
  netCents: Record<string, number>  // per-player net for this hole
}

export interface BankerResult {
  holeResults: BankerHoleResult[]
  netCents: Record<string, number>
}

export function calculateBanker(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: BankerConfig,
  courseHcps: Record<string, number>,
): BankerResult {
  const holeResults: BankerHoleResult[] = []
  const netCents: Record<string, number> = {}
  players.forEach(p => (netCents[p.id] = 0))
  const totalHoles = snapshot.holes.length

  if (config.bankerOrder.length === 0) {
    return { holeResults, netCents }
  }

  for (let holeNum = 1; holeNum <= totalHoles; holeNum++) {
    const hole = snapshot.holes.find(h => h.number === holeNum)
    if (!hole) continue

    const bankerId = config.bankerOrder[(holeNum - 1) % config.bankerOrder.length]
    const holeNet: Record<string, number> = {}
    players.forEach(p => (holeNet[p.id] = 0))

    const bankerScore = (() => {
      const hs = holeScores.find(s => s.playerId === bankerId && s.holeNumber === holeNum)
      if (!hs) return null
      return config.mode === 'net'
        ? hs.grossScore - strokesOnHole(courseHcps[bankerId] ?? 0, hole.strokeIndex, totalHoles)
        : hs.grossScore
    })()

    if (bankerScore === null) {
      holeResults.push({ holeNumber: holeNum, bankerId, netCents: holeNet })
      continue
    }

    for (const p of players) {
      if (p.id === bankerId) continue
      const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === holeNum)
      if (!hs) continue
      const score = config.mode === 'net'
        ? hs.grossScore - strokesOnHole(courseHcps[p.id] ?? 0, hole.strokeIndex, totalHoles)
        : hs.grossScore

      if (score < bankerScore) {
        // Player beats banker: banker pays 1 unit
        holeNet[p.id] += 1
        holeNet[bankerId] -= 1
      } else if (score > bankerScore) {
        // Banker beats player: player pays 1 unit
        holeNet[p.id] -= 1
        holeNet[bankerId] += 1
      }
      // tie = push
    }

    for (const id of Object.keys(holeNet)) {
      netCents[id] = (netCents[id] ?? 0) + holeNet[id]
    }
    holeResults.push({ holeNumber: holeNum, bankerId, netCents: holeNet })
  }

  return { holeResults, netCents }
}

export function calculateBankerPayouts(
  result: BankerResult,
  game: Game,
  players: Player[],
): PlayerPayout[] {
  const totalPot = game.buyInCents * players.length
  const positiveUnits = Object.values(result.netCents).filter(u => u > 0).reduce((s, u) => s + u, 0)

  if (positiveUnits === 0) {
    return refundEvenly(players, totalPot, 'Banker — all square, refund')
  }

  const centsPerUnit = Math.floor(totalPot / positiveUnits)
  let remainder = totalPot - centsPerUnit * positiveUnits

  return Object.entries(result.netCents)
    .filter(([, u]) => u > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([playerId, u]) => {
      const extra = Math.min(remainder, u)
      remainder -= extra
      return { playerId, amountCents: u * centsPerUnit + extra, reason: `Banker +${u} unit${u !== 1 ? 's' : ''}` }
    })
}

// ─── Quota ───────────────────────────────────────────────────────────────────

export interface QuotaResult {
  stablefordPoints: Record<string, number>
  quotas: Record<string, number>
  netPoints: Record<string, number>  // stableford - quota (positive = over quota)
  winner: string | null
}

/**
 * Refund a pot evenly with remainder drip so it sums to EXACTLY `totalPot`.
 * `floor(pot/N)` alone orphans up to N−1 cents on uneven pots (breaking net-zero);
 * this drips the leftover one cent at a time. Used by no-winner / all-tied refunds.
 */
function refundEvenly(players: Player[], totalPot: number, reason: string): PlayerPayout[] {
  const per = Math.floor(totalPot / players.length)
  let remainder = totalPot - per * players.length
  return players.map(p => {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    return { playerId: p.id, amountCents: per + extra, reason }
  })
}

export function calculateQuota(
  players: Player[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  config: QuotaConfig,
  courseHcps: Record<string, number>,
): QuotaResult {
  // Quota already bakes the handicap into each player's target (36 − handicap), so
  // the underlying Stableford MUST be scored GROSS — scoring it net would subtract
  // the handicap a second time and unfairly reward higher handicaps. (config.mode is
  // intentionally ignored here for that reason.)
  const stablefordResult = calculateStableford(players, holeScores, snapshot, { mode: 'gross' }, courseHcps)

  const netPoints: Record<string, number> = {}
  for (const p of players) {
    const quota = config.quotas[p.id] ?? 0
    netPoints[p.id] = stablefordResult.points[p.id] - quota
  }

  if (Object.keys(netPoints).length === 0) {
    return {
      stablefordPoints: stablefordResult.points,
      quotas: config.quotas,
      netPoints,
      winner: null,
    }
  }

  const maxNet = Math.max(...Object.values(netPoints))
  const leaders = Object.entries(netPoints).filter(([, n]) => n === maxNet)
  const winner = leaders.length === 1 ? leaders[0][0] : null

  return {
    stablefordPoints: stablefordResult.points,
    quotas: config.quotas,
    netPoints,
    winner,
  }
}

export function calculateQuotaPayouts(
  result: QuotaResult,
  game: Game,
  players: Player[],
): PlayerPayout[] {
  const totalPot = game.buyInCents * players.length
  const positiveNet = Object.values(result.netPoints).filter(n => n > 0)
  const totalPositive = positiveNet.reduce((s, n) => s + n, 0)

  // Nobody beat their quota. There's still a game to settle: the player closest to
  // quota (highest net, least under) takes the pot — that matches the winner the
  // engine names. Only a genuine tie for that top spot refunds evenly.
  if (totalPositive === 0) {
    if (result.winner) {
      return [{ playerId: result.winner, amountCents: totalPot, reason: 'Quota — closest to target' }]
    }
    return refundEvenly(players, totalPot, 'Quota — tied, refund')
  }

  let remainder = totalPot
  const payouts = Object.entries(result.netPoints)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([playerId, n]) => {
      const share = Math.floor((n / totalPositive) * totalPot)
      remainder -= share
      return { playerId, amountCents: share, reason: `Quota +${n} over target` }
    })

  for (let i = 0; i < payouts.length && remainder > 0; i++) {
    payouts[i].amountCents++
    remainder--
  }

  return payouts
}

// ─── Payouts ──────────────────────────────────────────────────────────────────

export interface PlayerPayout {
  playerId: string
  amountCents: number
  reason: string
}

export function calculateSkinsPayouts(
  result: SkinsResult,
  game: Game,
  playerCount: number,
): PlayerPayout[] {
  const presses: Press[] = (game.config as SkinsConfig).presses ?? []
  const basePotCents = game.buyInCents * playerCount

  if (result.totalSkins === 0 && presses.length === 0) return []

  // Calculate weighted skins: each press doubles value from press hole onward
  const weightedWon: Record<string, number> = {}
  let totalWeighted = 0

  for (const hr of result.holeResults) {
    if (!hr.winnerId) continue
    // Multiplier = 2^(number of presses on or before this hole)
    const mult = Math.pow(2, presses.filter(p => p.holeNumber <= hr.holeNumber).length)
    const weighted = hr.skinsInPlay * mult
    weightedWon[hr.winnerId] = (weightedWon[hr.winnerId] ?? 0) + weighted
    totalWeighted += weighted
  }

  if (totalWeighted === 0) return []

  // Total pot increases with presses: each press adds the base pot
  const totalPot = basePotCents * (1 + presses.length)
  const centsPerUnit = Math.floor(totalPot / totalWeighted)
  let remainder = totalPot - centsPerUnit * totalWeighted

  return Object.entries(weightedWon)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([playerId, w]) => {
      const extra = Math.min(remainder, w)
      remainder -= extra
      const skins = result.skinsWon[playerId] ?? 0
      return {
        playerId,
        amountCents: w * centsPerUnit + extra,
        reason: `${skins} skin${skins !== 1 ? 's' : ''}${presses.length > 0 ? ` (${presses.length} press${presses.length !== 1 ? 'es' : ''})` : ''}`,
      }
    })
}

export function calculateBestBallPayouts(
  result: BestBallResult,
  config: BestBallConfig,
  game: Game,
  players: Player[],
): PlayerPayout[] {
  const potCents = game.buyInCents * players.length

  if (result.winner === 'tie') {
    return refundEvenly(players, potCents, 'Tie — refund')
  }

  const winTeam = result.winner
  const winnerIds = players.filter(p => config.teams[p.id] === winTeam).map(p => p.id)
  const perWinner = Math.floor(potCents / winnerIds.length)
  let remainder = potCents - perWinner * winnerIds.length

  return winnerIds.map(pid => {
    const extra = Math.min(remainder, 1)
    remainder -= extra
    return {
      playerId: pid,
      amountCents: perWinner + extra,
      reason: `Best Ball winner (Team ${winTeam})`,
    }
  })
}

// ─── Settlement (treasurer-based) ─────────────────────────────────────────────

export interface Settlement {
  fromId: string
  toId: string
  amountCents: number
  note: string
}

/**
 * Treasurer collected all buy-ins. Winners receive payouts from the treasurer.
 * If treasurer is a winner, they keep their share and pay others from the pot.
 */
export function buildSettlements(
  payouts: PlayerPayout[],
  treasurerId: string,
): Settlement[] {
  return payouts
    .filter(p => p.playerId !== treasurerId)
    .map(p => ({
      fromId: treasurerId,
      toId: p.playerId,
      amountCents: p.amountCents,
      note: p.reason,
    }))
}

// ─── Venmo deep link ──────────────────────────────────────────────────────────

export function venmoLink(username: string, amountCents: number, note: string): string {
  const amount = (amountCents / 100).toFixed(2)
  const encoded = encodeURIComponent(note)
  return `venmo://paycharge?txn=pay&recipients=${username.replace('@', '')}&amount=${amount}&note=${encoded}`
}

export function venmoRequestLink(username: string, amountCents: number, note: string): string {
  const amount = (amountCents / 100).toFixed(2)
  const encoded = encodeURIComponent(note)
  return `venmo://paycharge?txn=charge&recipients=${username.replace('@', '')}&amount=${amount}&note=${encoded}`
}

export function venmoWebLink(username: string, amountCents: number, note: string): string {
  const amount = (amountCents / 100).toFixed(2)
  const encoded = encodeURIComponent(note)
  return `https://venmo.com/${username.replace('@', '')}?txn=pay&amount=${amount}&note=${encoded}`
}

export function zelleLink(identifier: string): string {
  // Zelle has no universal deep link — just open the search page
  return `https://enroll.zellepay.com/qr-codes?data=${encodeURIComponent(identifier)}`
}

export function cashAppLink(username: string, amountCents: number, note: string): string {
  const amount = (amountCents / 100).toFixed(2)
  const tag = username.replace('$', '')
  return `https://cash.app/$${tag}/${amount}?note=${encodeURIComponent(note)}`
}

export function paypalLink(email: string, amountCents: number): string {
  const amount = (amountCents / 100).toFixed(2)
  return `https://www.paypal.com/paypalme/${encodeURIComponent(email)}/${amount}`
}

// ─── Profile links (no amount — for directory/roster views) ─────────────────

export function venmoProfileLink(username: string): string {
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
  const clean = username.replace('@', '')
  return isMobile ? `venmo://users/${clean}` : `https://venmo.com/${clean}`
}

export function cashAppProfileLink(username: string): string {
  return `https://cash.app/$${username.replace('$', '')}`
}

// ─── Junks (side bets) ───────────────────────────────────────────────────────

export const JUNK_LABELS: Record<JunkType, { emoji: string; name: string; description: string }> = {
  sandy: { emoji: '🏖️', name: 'Sandy', description: 'Par or better from a bunker' },
  greenie: { emoji: '🟢', name: 'Greenie', description: 'On the green in regulation (par 3s)' },
  snake: { emoji: '🐍', name: 'Snake', description: '3-putt (pays others)' },
  barkie: { emoji: '🌳', name: 'Barkie', description: 'Hit a tree, still make par' },
  ctp: { emoji: '🎯', name: 'CTP', description: 'Closest to the pin' },
}

export interface JunkResult {
  /** playerId → net cents (positive = won, negative = lost) */
  netCents: Record<string, number>
  /** Individual junk tallies per player: playerId → count */
  tallies: Record<string, Record<JunkType, number>>
}

/**
 * Calculate junk side bet net amounts.
 * Positive junks: earner gets valueCents from each other player.
 * Snake (negative): player pays valueCents to each other player.
 */
export function calculateJunks(
  players: Player[],
  junkRecords: JunkRecord[],
  config: JunkConfig,
): JunkResult {
  const netCents: Record<string, number> = {}
  const tallies: Record<string, Record<JunkType, number>> = {}
  const others = players.length - 1

  for (const p of players) {
    netCents[p.id] = 0
    tallies[p.id] = { sandy: 0, greenie: 0, snake: 0, barkie: 0, ctp: 0 }
  }

  for (const jr of junkRecords) {
    if (!config.types.includes(jr.junkType)) continue
    if (!tallies[jr.playerId]) continue

    tallies[jr.playerId][jr.junkType]++

    if (jr.junkType === 'snake') {
      // Snake: player PAYS everyone else
      netCents[jr.playerId] -= config.valueCents * others
      for (const p of players) {
        if (p.id !== jr.playerId) netCents[p.id] += config.valueCents
      }
    } else {
      // Positive junk: player GETS from everyone else
      netCents[jr.playerId] += config.valueCents * others
      for (const p of players) {
        if (p.id !== jr.playerId) netCents[p.id] -= config.valueCents
      }
    }
  }

  return { netCents, tallies }
}

// ─── Unified Settlements (game + junk through treasurer) ────────────────────

export interface UnifiedSettlement {
  fromId: string
  toId: string
  amountCents: number
  reason: string
  source: 'game' | 'junk' | 'side_bet' | 'prop'
}

/**
 * Build unified settlements merging game payouts and junk side bets.
 * All flows go through the treasurer (hub-and-spoke model).
 * Bidirectional flows between the same pair are netted out.
 */
export function buildUnifiedSettlements(
  payouts: PlayerPayout[],
  treasurerId: string,
  junkResult: JunkResult | null,
  sideBetSettlements: SideBetSettlement[] = [],
  propSettlements: PropSettlement[] = [],
): UnifiedSettlement[] {
  type SourceType = 'game' | 'junk' | 'side_bet' | 'prop'
  // Accumulate net flows: key = "fromId→toId", value = { amountCents, reasons }
  const flows: Record<string, { amountCents: number; reasons: { reason: string; source: SourceType }[] }> = {}

  const addFlow = (fromId: string, toId: string, amountCents: number, reason: string, source: SourceType) => {
    if (amountCents <= 0 || fromId === toId) return
    const key = `${fromId}→${toId}`
    if (!flows[key]) flows[key] = { amountCents: 0, reasons: [] }
    flows[key].amountCents += amountCents
    flows[key].reasons.push({ reason, source })
  }

  // Game payouts: treasurer pays each winner (excluding self)
  for (const p of payouts) {
    if (p.playerId !== treasurerId) {
      addFlow(treasurerId, p.playerId, p.amountCents, p.reason, 'game')
    }
  }

  // Junk settlements through treasurer
  if (junkResult) {
    for (const [playerId, netCents] of Object.entries(junkResult.netCents)) {
      if (netCents > 0 && playerId !== treasurerId) {
        // Player won junk money → treasurer pays them
        addFlow(treasurerId, playerId, netCents, 'Junk winnings', 'junk')
      } else if (netCents < 0 && playerId !== treasurerId) {
        // Player lost junk money → they owe treasurer
        addFlow(playerId, treasurerId, Math.abs(netCents), 'Junk losses', 'junk')
      }
    }
    // Treasurer's own junk net is handled implicitly (kept from/added to pot)
  }

  // Side bet settlements: direct player-to-player (not through treasurer)
  for (const sbs of sideBetSettlements) {
    addFlow(sbs.fromId, sbs.toId, sbs.amountCents, `Side bet: ${sbs.description}`, 'side_bet')
  }

  // Prop settlements: direct player-to-player (like side bets)
  for (const ps of propSettlements) {
    addFlow(ps.fromId, ps.toId, ps.amountCents, `Prop: ${ps.description}`, 'prop')
  }

  // Net out bidirectional flows between same pair
  const settlements: UnifiedSettlement[] = []
  const processed = new Set<string>()

  for (const key of Object.keys(flows)) {
    if (processed.has(key)) continue
    const [fromId, toId] = key.split('→')
    const reverseKey = `${toId}→${fromId}`
    processed.add(key)
    processed.add(reverseKey)

    const forward = flows[key]?.amountCents ?? 0
    const reverse = flows[reverseKey]?.amountCents ?? 0
    const net = forward - reverse

    if (net === 0) continue

    const actualFromId = net > 0 ? fromId : toId
    const actualToId = net > 0 ? toId : fromId
    const sourceFlows = net > 0 ? flows[key] : flows[reverseKey]
    // Use the dominant direction's reasons; if netted, label accordingly
    const reasons = sourceFlows?.reasons ?? []
    const hasGame = reasons.some(r => r.source === 'game')
    const hasJunk = reasons.some(r => r.source === 'junk')
    const hasSideBet = reasons.some(r => r.source === 'side_bet')
    const hasProp = reasons.some(r => r.source === 'prop')
    const source: SourceType = hasGame ? 'game' : hasJunk ? 'junk' : hasSideBet ? 'side_bet' : 'prop'

    // Build a combined reason string
    let reason: string
    const sourceCount = [hasGame, hasJunk, hasSideBet, hasProp].filter(Boolean).length
    if (sourceCount > 1) {
      const gameReasons = reasons.filter(r => r.source === 'game').map(r => r.reason).join(', ')
      const parts = [gameReasons, hasJunk ? 'junk' : '', hasSideBet ? 'side bets' : '', hasProp ? 'props' : ''].filter(Boolean)
      reason = `${parts.join(' + ')} (netted)`
    } else if (net !== forward && net !== -reverse) {
      // Partial netting happened
      reason = reasons.map(r => r.reason).join(', ') + ' (netted)'
    } else {
      reason = reasons.map(r => r.reason).join(', ')
    }

    settlements.push({
      fromId: actualFromId,
      toId: actualToId,
      amountCents: Math.abs(net),
      reason,
      source: sourceCount > 1 ? 'game' : source,
    })
  }

  return settlements
}

/**
 * Games classified as *unit* (variable / asymmetric / buy-in-less) settle from a
 * signed, zero-sum per-player net rather than a shared pot. There is no pot or
 * treasurer for a unit game — each player's net is settled head-to-head — so they
 * route through `buildDirectSettlements` in BOTH points and money mode. Pot games
 * (everything else) still net to zero via `netFromPayouts` (payout − buy-in) and
 * keep the treasurer hub in money mode.
 *
 * Per the product model, a point is an abstract unit worth whatever players agree
 * outside the app, so `buyInCents` is simply the value of ONE unit:
 *   - hammer, dots: `netCents` is already the real per-player net (buy-in is 0).
 *   - wolf, banker:  the calc carries signed *units*; net = units × `buyInCents`.
 * See `unitGameNet`.
 */
const UNIT_GAMES: GameType[] = ['hammer', 'dots', 'wolf', 'banker']

export function isUnitGame(gameType: GameType): boolean {
  return UNIT_GAMES.includes(gameType)
}

/**
 * Signed per-player cash net (points/cents) for a *unit* game's head-to-head
 * settlement. Wolf's units live in `netUnits`; banker's in `netCents` (misnamed —
 * they're ±1-per-hole units); both scale by the per-unit stake (`buyInCents`).
 * Hammer/dots carry real cents already, so they pass through unscaled. Zero-sum in,
 * zero-sum out.
 */
export function unitGameNet(
  gameType: GameType,
  buyInCents: number,
  raw: { netCents?: Record<string, number>; netUnits?: Record<string, number> },
): Record<string, number> {
  const source = gameType === 'wolf' ? raw.netUnits ?? {} : raw.netCents ?? {}
  const scale = gameType === 'wolf' || gameType === 'banker' ? buyInCents : 1
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(source)) out[id] = v * scale
  return out
}

/**
 * Signed per-player net (cents) for a *pot* game: winners receive their payout and
 * everyone antes an equal share of the collected pot, so net = payout − ante.
 *
 * The ante is the *distributed* pot split evenly (`sum(payouts) / N`), not a fixed
 * buy-in. For a plain pot game that equals `buyInCents` (pot = buyIn × N), so this
 * is unchanged. But presses inflate the winners' pot without a matching flat buy-in
 * — deriving the ante from what's actually distributed keeps the round net-zero
 * (everyone's exposure scales with the presses). `buyInCents` is the fallback ante
 * when no payouts exist yet (so an unscored round still reads as everyone-down).
 */
export function netFromPayouts(
  payouts: PlayerPayout[],
  players: Player[],
  buyInCents: number,
): Record<string, number> {
  const distributed = payouts.reduce((s, p) => s + p.amountCents, 0)
  const anteTotal = distributed > 0 ? distributed : buyInCents * players.length
  const perAnte = Math.floor(anteTotal / players.length)
  let remainder = anteTotal - perAnte * players.length
  const net: Record<string, number> = {}
  players.forEach(p => {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    net[p.id] = -(perAnte + extra)
  })
  for (const p of payouts) net[p.playerId] = (net[p.playerId] ?? 0) + p.amountCents
  return net
}

/**
 * Direct (no-treasurer) settlements for points-mode rounds. Points mode never
 * assigns a treasurer, so instead of routing every flow through one, take each
 * player's signed game net (`gameNet` — from `netFromPayouts` for pot games, or a
 * unit game's real-cents net), fold in junk/side-bet/prop nets, and greedily match
 * debtors to creditors so losers pay winners directly. Nets to zero.
 */
export function buildDirectSettlements(
  gameNet: Record<string, number>,
  junkResult: JunkResult | null,
  sideBetSettlements: SideBetSettlement[] = [],
  propSettlements: PropSettlement[] = [],
): UnifiedSettlement[] {
  const net = new Map<string, number>()
  for (const [id, c] of Object.entries(gameNet)) net.set(id, (net.get(id) ?? 0) + c)
  if (junkResult) {
    for (const [id, c] of Object.entries(junkResult.netCents)) net.set(id, (net.get(id) ?? 0) + c)
  }
  for (const s of sideBetSettlements) {
    net.set(s.fromId, (net.get(s.fromId) ?? 0) - s.amountCents)
    net.set(s.toId, (net.get(s.toId) ?? 0) + s.amountCents)
  }
  for (const s of propSettlements) {
    net.set(s.fromId, (net.get(s.fromId) ?? 0) - s.amountCents)
    net.set(s.toId, (net.get(s.toId) ?? 0) + s.amountCents)
  }

  const creditors = [...net.entries()].filter(([, c]) => c > 0).map(([id, c]) => ({ id, amt: c })).sort((a, b) => b.amt - a.amt)
  const debtors = [...net.entries()].filter(([, c]) => c < 0).map(([id, c]) => ({ id, amt: -c })).sort((a, b) => b.amt - a.amt)

  const out: UnifiedSettlement[] = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].amt, debtors[di].amt)
    if (pay > 0) {
      out.push({ fromId: debtors[di].id, toId: creditors[ci].id, amountCents: pay, reason: 'Round settlement', source: 'game' })
    }
    creditors[ci].amt -= pay
    debtors[di].amt -= pay
    if (creditors[ci].amt === 0) ci++
    if (debtors[di].amt === 0) di++
  }
  return out
}

// ─── Side Bet Settlements ────────────────────────────────────────────────────

export interface SideBetSettlement {
  fromId: string
  toId: string
  amountCents: number
  description: string
}

/**
 * Calculate settlements from resolved side bets.
 * Each resolved side bet: every non-winner participant pays the winner amountCents.
 */
export function calculateSideBetSettlements(sideBets: SideBet[]): SideBetSettlement[] {
  const settlements: SideBetSettlement[] = []
  for (const bet of sideBets) {
    if (bet.status !== 'resolved' || !bet.winnerPlayerId) continue
    const losers = bet.participants.filter(id => id !== bet.winnerPlayerId)
    for (const loserId of losers) {
      settlements.push({
        fromId: loserId,
        toId: bet.winnerPlayerId,
        amountCents: bet.amountCents,
        description: bet.description,
      })
    }
  }
  return settlements
}

// ─── Prop Bet Settlements ────────────────────────────────────────────────────

export interface PropSettlement {
  fromId: string
  toId: string
  amountCents: number
  description: string
}

/**
 * Calculate settlements from resolved prop bets.
 *
 * Challenge model: each acceptor wagered on the opposing outcome.
 *   - If creator's outcome wins, each acceptor pays creator stakeCents.
 *   - If creator loses, creator pays each acceptor stakeCents.
 *
 * Pool model: winners split losers' pool proportionally by wager size.
 *   Each loser pays their wager; each winner gets proportional share.
 *
 * Fixed model: everyone in for stakeCents. Winner(s) split total pot.
 */
export function calculatePropSettlements(
  propBets: PropBet[],
  propWagers: PropWager[],
): PropSettlement[] {
  const settlements: PropSettlement[] = []

  for (const prop of propBets) {
    if (prop.status !== 'resolved' || !prop.winningOutcomeId) continue
    const wagers = propWagers.filter(w => w.propBetId === prop.id)
    if (wagers.length === 0) continue

    if (prop.wagerModel === 'challenge') {
      // Creator implicitly wagered on their outcome (first outcome).
      // Acceptors wagered on the opposing outcome.
      const winningId = prop.winningOutcomeId
      const creatorOutcome = prop.outcomes[0]?.id
      const creatorWon = winningId === creatorOutcome

      // Find acceptors (wagers by non-creator)
      const acceptorWagers = wagers.filter(w => w.playerId !== prop.creatorId)

      for (const aw of acceptorWagers) {
        // Guard: no self-settlements
        if (aw.playerId === prop.creatorId) continue
        if (creatorWon) {
          settlements.push({
            fromId: aw.playerId,
            toId: prop.creatorId,
            amountCents: prop.stakeCents,
            description: prop.title,
          })
        } else {
          settlements.push({
            fromId: prop.creatorId,
            toId: aw.playerId,
            amountCents: prop.stakeCents,
            description: prop.title,
          })
        }
      }
    } else if (prop.wagerModel === 'pool') {
      const winningId = prop.winningOutcomeId
      const winnerWagers = wagers.filter(w => w.outcomeId === winningId)
      const loserWagers = wagers.filter(w => w.outcomeId !== winningId)

      const totalWinnerPool = winnerWagers.reduce((s, w) => s + w.amountCents, 0)
      const totalLoserPool = loserWagers.reduce((s, w) => s + w.amountCents, 0)

      if (totalWinnerPool === 0 || totalLoserPool === 0) continue

      // Each loser pays proportionally to each winner
      for (const loser of loserWagers) {
        for (const winner of winnerWagers) {
          if (loser.playerId === winner.playerId) continue // no self-settlement
          const winnerShare = winner.amountCents / totalWinnerPool
          const amount = Math.round(loser.amountCents * winnerShare)
          if (amount > 0) {
            settlements.push({
              fromId: loser.playerId,
              toId: winner.playerId,
              amountCents: amount,
              description: prop.title,
            })
          }
        }
      }
    } else if (prop.wagerModel === 'fixed') {
      const winningId = prop.winningOutcomeId
      const winners = wagers.filter(w => w.outcomeId === winningId)
      const losers = wagers.filter(w => w.outcomeId !== winningId)

      if (winners.length === 0) continue

      // Each loser owes stakeCents split equally among winners
      const perWinner = Math.round(prop.stakeCents / winners.length)
      for (const loser of losers) {
        for (const winner of winners) {
          if (loser.playerId === winner.playerId) continue // no self-settlement
          if (perWinner > 0) {
            settlements.push({
              fromId: loser.playerId,
              toId: winner.playerId,
              amountCents: perWinner,
              description: prop.title,
            })
          }
        }
      }
    }
  }

  return settlements
}

/**
 * Auto-resolve props that have auto-resolve configs.
 * Returns new PropBet array with resolved statuses where applicable.
 * Only resolves if all relevant holes have been scored.
 */
export function autoResolveProps(
  props: PropBet[],
  holeScores: HoleScore[],
  snapshot: CourseSnapshot,
  courseHcps?: Record<string, number>,
): PropBet[] {
  return props.map(prop => {
    if (prop.status !== 'open' && prop.status !== 'locked') return prop
    if (prop.resolveType !== 'auto' || !prop.autoResolveConfig) return prop

    const config = prop.autoResolveConfig
    const holes = snapshot.holes

    // Determine which holes to consider
    let holeNumbers: number[]
    if (config.holeRange === 'front' || config.holeRange === 'back') {
      const { frontHoles, backHoles } = getFrontBackSplit(holes)
      holeNumbers = config.holeRange === 'front' ? frontHoles : backHoles
    } else {
      holeNumbers = holes.map(h => h.number)
    }

    if (config.type === 'over_under') {
      if (!config.playerId || config.threshold == null) return prop
      const playerScores = holeScores.filter(s => s.playerId === config.playerId && holeNumbers.includes(s.holeNumber))
      if (playerScores.length < holeNumbers.length) return prop // not all holes scored

      let total: number
      if (config.metric === 'net' && courseHcps) {
        total = playerScores.reduce((sum, s) => {
          const hole = holes.find(h => h.number === s.holeNumber)
          const strokes = hole ? strokesOnHole(courseHcps[config.playerId!] ?? 0, hole.strokeIndex) : 0
          return sum + (s.grossScore - strokes)
        }, 0)
      } else {
        total = playerScores.reduce((sum, s) => sum + s.grossScore, 0)
      }

      if (total > config.threshold) {
        // Over wins — outcome 'over'
        const overOutcome = prop.outcomes.find(o => o.id === 'over')
        if (overOutcome) {
          return { ...prop, status: 'resolved' as const, winningOutcomeId: 'over', resolvedAt: new Date() }
        }
      } else if (total < config.threshold) {
        const underOutcome = prop.outcomes.find(o => o.id === 'under')
        if (underOutcome) {
          return { ...prop, status: 'resolved' as const, winningOutcomeId: 'under', resolvedAt: new Date() }
        }
      } else {
        // Exact match = push → void
        return { ...prop, status: 'voided' as const, resolvedAt: new Date() }
      }
    } else if (config.type === 'h2h') {
      if (!config.playerId || !config.playerIdB) return prop
      const scoresA = holeScores.filter(s => s.playerId === config.playerId && holeNumbers.includes(s.holeNumber))
      const scoresB = holeScores.filter(s => s.playerId === config.playerIdB && holeNumbers.includes(s.holeNumber))
      if (scoresA.length < holeNumbers.length || scoresB.length < holeNumbers.length) return prop

      const scoreFor = (scores: HoleScore[], playerId: string) => {
        if (config.metric === 'net' && courseHcps) {
          return scores.reduce((sum, s) => {
            const hole = holes.find(h => h.number === s.holeNumber)
            const strokes = hole ? strokesOnHole(courseHcps[playerId] ?? 0, hole.strokeIndex) : 0
            return sum + (s.grossScore - strokes)
          }, 0)
        }
        return scores.reduce((sum, s) => sum + s.grossScore, 0)
      }

      const totalA = scoreFor(scoresA, config.playerId)
      const totalB = scoreFor(scoresB, config.playerIdB)

      if (totalA < totalB) {
        return { ...prop, status: 'resolved' as const, winningOutcomeId: config.playerId, resolvedAt: new Date() }
      } else if (totalB < totalA) {
        return { ...prop, status: 'resolved' as const, winningOutcomeId: config.playerIdB, resolvedAt: new Date() }
      } else {
        return { ...prop, status: 'voided' as const, resolvedAt: new Date() }
      }
    } else if (config.type === 'birdie_count') {
      if (!config.playerId || config.threshold == null) return prop
      const playerScores = holeScores.filter(s => s.playerId === config.playerId && holeNumbers.includes(s.holeNumber))
      if (playerScores.length < holeNumbers.length) return prop

      const birdies = playerScores.filter(s => {
        const hole = holes.find(h => h.number === s.holeNumber)
        return hole && s.grossScore < hole.par
      }).length

      if (birdies > config.threshold) {
        return { ...prop, status: 'resolved' as const, winningOutcomeId: 'over', resolvedAt: new Date() }
      } else if (birdies < config.threshold) {
        return { ...prop, status: 'resolved' as const, winningOutcomeId: 'under', resolvedAt: new Date() }
      } else {
        return { ...prop, status: 'voided' as const, resolvedAt: new Date() }
      }
    } else if (config.type === 'hole_score') {
      if (!config.playerId || !config.holeNumber) return prop
      const score = holeScores.find(s => s.playerId === config.playerId && s.holeNumber === config.holeNumber)
      if (!score) return prop

      const hole = holes.find(h => h.number === config.holeNumber)
      if (!hole) return prop

      const diff = score.grossScore - hole.par
      // Winner is 'y' if the condition was met (birdie or better), 'n' otherwise
      if (diff < 0) {
        return { ...prop, status: 'resolved' as const, winningOutcomeId: 'y', resolvedAt: new Date() }
      } else {
        return { ...prop, status: 'resolved' as const, winningOutcomeId: 'n', resolvedAt: new Date() }
      }
    }

    return prop
  })
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function fmtMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(
    cents / 100,
  )
}

/**
 * Format an amount for display. Gimme surfaces POINTS only — no currency ever
 * appears in the app (1 pt = $1). In points mode the stored value IS the point
 * count; legacy money-mode values are stored in cents, so convert to points.
 * Payment deep-links compute their own dollar amount separately (see SettleUp /
 * BuyInBanner `toPayCents`), so this is display-only.
 */
export function fmtAmount(value: number, stakesMode?: string): string {
  const points = stakesMode === 'points' ? value : Math.round(value / 100)
  return `${points} pts`
}
