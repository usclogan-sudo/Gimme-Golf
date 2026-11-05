// One answer to "who is winning the side game?" for every format (usability
// Finding 9). The in-round standings bar and the Leaderboard tab both rank AND
// display on this — the same metric in both places, never strokes-to-par dressed
// up as a game result. Stableford already worked this way with points; this
// extends it to all eleven formats.
//
// Each game produces, per player, a rank value and the label shown next to the
// name. Higher value = better. When the game has produced nothing yet, every
// entry is a dash and nobody is ranked.

import type { Game, Player, BestBallConfig, VegasConfig, NassauConfig } from '../types'
import type {
  SkinsResult, BestBallResult, NassauResult, NassauMatchResult, NassauMatchLeg,
  WolfResult, BBBResult, HammerResult, VegasResult, StablefordResult,
  DotsResult, BankerResult, QuotaResult,
} from './gameLogic'

export interface StandingEntry {
  player: Player
  /** Rank value, higher is better. Null when the game has no result yet. */
  value: number | null
  /** What sits next to the name: "3 skins", "+2 u", "2 UP", "14 pt", or "—". */
  label: string
  /** Standard competition rank (ties share). 0 when unranked. */
  position: number
}

export interface GameStandings {
  /** Column heading for the metric, e.g. "Skins", "Units", "Holes up". */
  metric: string
  entries: StandingEntry[]
  /** False until the game has produced at least one non-zero result. */
  hasResult: boolean
}

export interface StandingsInputs {
  skins?: SkinsResult | null
  bestBall?: BestBallResult | null
  nassau?: NassauResult | null
  nassauMatch?: NassauMatchResult | null
  wolf?: WolfResult | null
  bbb?: BBBResult | null
  hammer?: HammerResult | null
  vegas?: VegasResult | null
  stableford?: StablefordResult | null
  dots?: DotsResult | null
  banker?: BankerResult | null
  quota?: QuotaResult | null
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`
const upDown = (up: number) => up === 0 ? 'AS' : `${Math.abs(up)} ${up > 0 ? 'UP' : 'DN'}`

/** A match leg from one player's side: "2 UP", "AS", "1 DN", "3&2", "3&2 DN". */
function legFromSide(leg: NassauMatchLeg, playerId: string): string | null {
  const mine = leg.matches.filter(m => m.a === playerId || m.b === playerId)
  if (mine.length === 0) return null
  if (!leg.started) return '—'
  return mine.map(m => {
    const up = m.a === playerId ? m.holesUp : -m.holesUp
    if (up === 0) return 'AS'
    if (m.closed && m.holesRemaining > 0) return `${Math.abs(up)}&${m.holesRemaining}${up > 0 ? '' : ' DN'}`
    return upDown(up)
  }).join('/')
}

/** Net legs decided for a player across every leg and press: won − lost. */
function netLegs(result: NassauMatchResult, playerId: string): { net: number; holesUp: number; decided: number } {
  let net = 0, holesUp = 0, decided = 0
  for (const leg of [result.front, result.back, result.total, ...result.presses]) {
    for (const m of leg.matches) {
      if (m.a !== playerId && m.b !== playerId) continue
      const mineIsA = m.a === playerId
      holesUp += mineIsA ? m.holesUp : -m.holesUp
      if (m.result === 'a') { net += mineIsA ? 1 : -1; decided++ }
      else if (m.result === 'b') { net += mineIsA ? -1 : 1; decided++ }
      else if (m.result === 'halved') decided++
    }
  }
  return { net, holesUp, decided }
}

export function gameStandings(
  game: Game | null,
  players: Player[],
  r: StandingsInputs,
  opts: { stakesMode?: string } = {},
): GameStandings {
  const build = (metric: string, valueOf: (p: Player) => number | null, labelOf: (p: Player, v: number) => string, anyResult: boolean): GameStandings => {
    const hasResult = anyResult
    const raw = players.map(p => {
      const v = hasResult ? valueOf(p) : null
      return { player: p, value: v, label: v === null ? '—' : labelOf(p, v), position: 0 }
    })
    if (!hasResult) return { metric, entries: raw, hasResult: false }
    const sorted = raw.slice().sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
    sorted.forEach((e, i) => {
      e.position = i > 0 && e.value === sorted[i - 1].value ? sorted[i - 1].position : i + 1
    })
    return { metric, entries: sorted, hasResult: true }
  }
  const nonZero = (m: Record<string, number> | undefined) => !!m && Object.values(m).some(v => v !== 0)
  const tokens = (cents: number) => opts.stakesMode === 'points' ? cents : Math.round(cents / 100)

  if (!game) return build('', () => null, () => '—', false)

  switch (game.type) {
    case 'skins': {
      const s = r.skins
      return build('Skins',
        p => s?.skinsWon[p.id] ?? 0,
        (_p, v) => `${v} skin${v === 1 ? '' : 's'}`,
        !!s && s.totalSkins > 0)
    }
    case 'wolf': {
      const w = r.wolf
      return build('Units', p => w?.netUnits[p.id] ?? 0, (_p, v) => `${signed(v)} u`, nonZero(w?.netUnits))
    }
    case 'banker': {
      const b = r.banker
      return build('Units', p => b?.netCents[p.id] ?? 0, (_p, v) => `${signed(v)} u`, nonZero(b?.netCents))
    }
    case 'bingo_bango_bongo': {
      const b = r.bbb
      return build('Points', p => b?.pointsWon[p.id] ?? 0, (_p, v) => `${v} pt`, !!b && b.totalPoints > 0)
    }
    case 'stableford': {
      const s = r.stableford
      return build('Points', p => s?.points[p.id] ?? 0, (_p, v) => `${v} pt`, nonZero(s?.points))
    }
    case 'quota': {
      const q = r.quota
      return build('vs Quota', p => q?.netPoints[p.id] ?? 0, (_p, v) => signed(v), nonZero(q?.netPoints))
    }
    case 'dots': {
      const d = r.dots
      return build('Net', p => d?.netCents[p.id] ?? 0, (_p, v) => signed(tokens(v)), nonZero(d?.netCents))
    }
    case 'hammer': {
      const h = r.hammer
      const won: Record<string, number> = {}
      players.forEach(p => (won[p.id] = 0))
      for (const hr of h?.holeResults ?? []) if (hr.winnerId && hr.winnerId in won) won[hr.winnerId]++
      const total = Object.values(won).reduce((s, n) => s + n, 0)
      return build('Holes up',
        p => won[p.id] - (total - won[p.id]),
        (_p, v) => upDown(v),
        total > 0)
    }
    case 'best_ball': {
      const b = r.bestBall
      const teams = (game.config as BestBallConfig).teams ?? {}
      const diff = b ? b.holesWon.A - b.holesWon.B : 0
      const played = b ? b.holesWon.A + b.holesWon.B + b.holesWon.tied : 0
      return build('Holes up',
        p => teams[p.id] === 'A' ? diff : teams[p.id] === 'B' ? -diff : 0,
        (p, v) => `${upDown(v)}${teams[p.id] ? ` · Team ${teams[p.id]}` : ''}`,
        played > 0)
    }
    case 'vegas': {
      const v = r.vegas
      const teams = (game.config as VegasConfig).teams ?? {}
      const diff = v ? v.netPoints.A - v.netPoints.B : 0
      const played = (v?.holeResults.length ?? 0) > 0
      return build('Points',
        p => teams[p.id] === 'A' ? diff : teams[p.id] === 'B' ? -diff : 0,
        (p, val) => `${signed(val)}${teams[p.id] ? ` · Team ${teams[p.id]}` : ''}`,
        played)
    }
    case 'nassau': {
      const cfg = game.config as NassauConfig
      if (cfg.scoring === 'match') {
        const m = r.nassauMatch
        if (!m) return build('Legs', () => null, () => '—', false)
        const started = [m.front, m.back, m.total].some(l => l.started)
        const twoPlayers = players.length === 2
        return build(twoPlayers ? 'Legs' : 'Net legs',
          p => { const { net, holesUp } = netLegs(m, p.id); return net * 100 + holesUp },
          p => {
            if (twoPlayers) {
              // The player's own view of each leg: "2 UP / AS / 1 UP".
              return [m.front, m.back, m.total].map(l => legFromSide(l, p.id) ?? '—').join(' · ')
            }
            const { net } = netLegs(m, p.id)
            return `${signed(net)} leg${Math.abs(net) === 1 ? '' : 's'}`
          },
          started)
      }
      // Legacy stroke-play Nassau: legs won so far.
      const n = r.nassau
      const legsWon: Record<string, number> = {}
      players.forEach(p => (legsWon[p.id] = 0))
      let decided = 0
      for (const seg of n ? [n.front, n.back, n.total] : []) {
        if (seg.incomplete) continue
        decided++
        if (seg.winner && seg.winner in legsWon) legsWon[seg.winner]++
      }
      return build('Legs', p => legsWon[p.id], (_p, v) => `${v} leg${v === 1 ? '' : 's'}`, decided > 0)
    }
    default:
      return build('', () => null, () => '—', false)
  }
}
