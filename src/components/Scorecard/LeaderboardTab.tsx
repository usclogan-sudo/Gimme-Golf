import { useState } from 'react'
import { Tooltip } from '../ui/Tooltip'
import { renderResultCardToBlob } from '../ResultCard'
import type { ResultCardStanding } from '../ResultCard'
import { shareCard } from '../../lib/share'
import { gameStandings } from '../../lib/standings'
import { approvedOnly, pendingCountByPlayer } from '../../lib/scores'
import {
  strokesOnHole, fmtAmount, fmtHandicap,
  calculateSkinsPayouts, calculateSkinsPerSkinNet, calculateBestBallPayouts, calculateNassauPayouts,
  calculateBBBPayouts, calculateVegasPayouts,
  calculateStablefordPayouts, calculateQuotaPayouts,
  isUnitGame, unitGameNet, netFromPayouts, perPointNet,
  nassauMatchNet, nassauMatchLegStatus,
} from '../../lib/gameLogic'
import type {
  SkinsResult, BestBallResult, NassauResult, NassauMatchResult, WolfResult, BBBResult,
  HammerResult, VegasResult, StablefordResult, BankerResult, QuotaResult,
  PlayerPayout,
} from '../../lib/gameLogic'
import type { Player, HoleScore, CourseSnapshot, Round, Game, BestBallConfig, VegasConfig, SkinsConfig } from '../../types'

interface Props {
  snapshot: CourseSnapshot
  players: Player[]
  holeScores: HoleScore[]
  courseHcps: Record<string, number>
  game: Game | null
  round: Round | null
  skinsResult: SkinsResult | null
  bestBallResult: BestBallResult | null
  nassauResult: NassauResult | null
  /** Match-play Nassau (NassauConfig.scoring === 'match'); nassauResult is null then. */
  nassauMatch?: NassauMatchResult | null
  wolfResult: WolfResult | null
  bbbResult: BBBResult | null
  hammerResult: HammerResult | null
  vegasResult: VegasResult | null
  stablefordResult: StablefordResult | null
  bankerResult: BankerResult | null
  quotaResult: QuotaResult | null
  // Alt (opposite mode) results
  skinsResultAlt?: SkinsResult | null
  bestBallResultAlt?: BestBallResult | null
  nassauResultAlt?: NassauResult | null
  wolfResultAlt?: WolfResult | null
  vegasResultAlt?: VegasResult | null
  stablefordResultAlt?: StablefordResult | null
  bankerResultAlt?: BankerResult | null
  quotaResultAlt?: QuotaResult | null
  primaryMode?: 'net' | 'gross'
  /** Seat id → first name of the registered user holding a claimed guest seat. */
  claimedBy?: Record<string, string>
  /** playerId → tee played, shown beside the course handicap ("+8 · Blue"). */
  teeByPlayer?: Record<string, string>
}

const GAME_LABELS: Record<string, string> = {
  skins: 'Skins', best_ball: 'Best Ball', nassau: 'Nassau', wolf: 'Wolf',
  bingo_bango_bongo: 'Bingo Bango Bongo', hammer: 'Hammer', vegas: 'Vegas',
  stableford: 'Stableford', dots: 'Dots', banker: 'Banker', quota: 'Quota',
}

export function LeaderboardTab({
  snapshot, players, holeScores, courseHcps, game, round,
  skinsResult, bestBallResult, nassauResult, nassauMatch = null, wolfResult, bbbResult,
  hammerResult, vegasResult, stablefordResult, bankerResult, quotaResult,
  primaryMode = 'net',
  claimedBy = {},
  teeByPlayer = {},
}: Props) {
  const [sharing, setSharing] = useState(false)
  const claimedLine = (playerId: string) => claimedBy[playerId]
    ? <p className="text-[11px] font-normal text-gray-400 dark:text-gray-500">claimed by {claimedBy[playerId]}</p>
    : null
  // Show one set of units — the game's primary mode. (The opposite-mode "Alt"
  // duplicate that printed identical values was removed. §5)
  const primaryLabel = primaryMode === 'net' ? 'Net' : 'Gross'

  // Per-player net from the GAME result (money/points) — the same net the
  // settlement engine records. This, not stroke score, decides who's winning, so
  // the leaderboard ranks and brass-highlights by it (§5). Unit games (wolf/
  // banker/hammer) settle head-to-head from a signed net; pot games are payout −
  // buy-in.
  const gameNetByPlayer: Map<string, number> = (() => {
    const m = new Map<string, number>()
    players.forEach(p => m.set(p.id, 0))
    if (!game) return m
    const unitRaw =
      game.type === 'wolf' ? wolfResult ?? undefined
      : game.type === 'banker' ? bankerResult ?? undefined
      : game.type === 'hammer' ? hammerResult ?? undefined
      : undefined
    const skinsCfg = game.type === 'skins' ? (game.config as SkinsConfig) : null
    if (skinsCfg?.payModel === 'per_skin' && skinsResult) {
      // Per-skin skins has no pot to divide — each skin is paid for by the other
      // players in that hole — so the running total comes from the same signed net
      // the settle screen uses, not from a pot-model payout list.
      Object.entries(
        calculateSkinsPerSkinNet(skinsResult, players, game.buyInCents, {}, skinsCfg.presses ?? []),
      ).forEach(([pid, c]) => m.set(pid, (m.get(pid) ?? 0) + c))
    } else if (perPointNet(game, players, {
      bbb: bbbResult, stableford: stablefordResult, vegas: vegasResult, quota: quotaResult,
    })) {
      // Per-point rounds settle directly, so the running total must come from the
      // same signed net the settle screen uses — otherwise the leaderboard and the
      // settlement disagree about the same round.
      Object.entries(perPointNet(game, players, {
        bbb: bbbResult, stableford: stablefordResult, vegas: vegasResult, quota: quotaResult,
      })!).forEach(([pid, c]) => m.set(pid, (m.get(pid) ?? 0) + c))
    } else if (isUnitGame(game.type) && unitRaw) {
      Object.entries(unitGameNet(game.type, game.buyInCents, unitRaw)).forEach(([pid, c]) => m.set(pid, (m.get(pid) ?? 0) + c))
    } else if (game.type === 'nassau' && nassauMatch) {
      // Match-play Nassau settles directly from its signed net, like the unit games.
      Object.entries(nassauMatchNet(nassauMatch, players)).forEach(([pid, c]) => m.set(pid, (m.get(pid) ?? 0) + c))
    } else {
      let payouts: PlayerPayout[] = []
      if (game.type === 'skins' && skinsResult) payouts = calculateSkinsPayouts(skinsResult, game, players.length)
      else if (game.type === 'best_ball' && bestBallResult) payouts = calculateBestBallPayouts(bestBallResult, game.config as BestBallConfig, game, players)
      else if (game.type === 'nassau' && nassauResult) payouts = calculateNassauPayouts(nassauResult, game, players, approvedOnly(holeScores), snapshot, courseHcps)
      else if (game.type === 'bingo_bango_bongo' && bbbResult) payouts = calculateBBBPayouts(bbbResult, game, players)
      else if (game.type === 'vegas' && vegasResult) payouts = calculateVegasPayouts(vegasResult, game.config as VegasConfig, game, players)
      else if (game.type === 'stableford' && stablefordResult) payouts = calculateStablefordPayouts(stablefordResult, game, players)
      else if (game.type === 'quota' && quotaResult) payouts = calculateQuotaPayouts(quotaResult, game, players)
      if (payouts.length > 0 && game.buyInCents > 0) {
        Object.entries(netFromPayouts(payouts, players, game.buyInCents)).forEach(([pid, c]) => m.set(pid, c))
      }
    }
    return m
  })()
  const hasGameResult = Array.from(gameNetByPlayer.values()).some(v => v !== 0)

  // Same set the game engine scores from, so gross and thru here can never
  // disagree with the standings above. Pending rows are shown, faded and marked.
  const approvedScores = approvedOnly(holeScores)
  const pendingByPlayer = pendingCountByPlayer(holeScores)
  const hcpLine = (playerId: string) => {
    const tee = teeByPlayer[playerId]
    const hcp = courseHcps[playerId]
    if (hcp === undefined && !tee) return null
    return (
      <p className="text-[11px] font-normal text-gray-400 dark:text-gray-500">
        {hcp !== undefined ? fmtHandicap(hcp) : '—'}{tee ? ` · ${tee}` : ''}
      </p>
    )
  }

  const board = players.map(p => {
    const pScores = approvedScores.filter(s => s.playerId === p.id)
    const gross = pScores.reduce((s, hs) => s + hs.grossScore, 0)
    const courseHcp = courseHcps[p.id] ?? 0
    const netStrokes = pScores.reduce((s, hs) => {
      const hole = snapshot.holes.find(h => h.number === hs.holeNumber)
      return s + (hole ? strokesOnHole(courseHcp, hole.strokeIndex, snapshot.holes.length) : 0)
    }, 0)
    const scoredPar = pScores.reduce((s, hs) => {
      const hole = snapshot.holes.find(h => h.number === hs.holeNumber)
      return s + (hole?.par ?? 0)
    }, 0)
    return { player: p, gross, net: gross - netStrokes, vsPar: gross - scoredPar, thru: pScores.length, pending: pendingByPlayer[p.id] ?? 0 }
  }).sort((a, b) =>
    // The golf-scores table is a reference, so it ranks by net strokes to par —
    // never by the game result, which has its own table above it (Finding 9).
    (a.net - a.gross + a.vsPar) - (b.net - b.gross + b.vsPar)
  )

  const rankKey = (e: (typeof board)[number]) => e.net - e.gross + e.vsPar // net to par
  const positions: number[] = []
  board.forEach((entry, idx) => {
    positions.push(idx === 0 ? 1 : rankKey(entry) === rankKey(board[idx - 1]) ? positions[idx - 1] : idx + 1)
  })

  // The side game's own standings — the same helper the in-round bar uses.
  const standings = gameStandings(game, players, {
    skins: skinsResult, bestBall: bestBallResult, nassau: nassauResult, nassauMatch,
    wolf: wolfResult, bbb: bbbResult, hammer: hammerResult, vegas: vegasResult,
    stableford: stablefordResult, banker: bankerResult, quota: quotaResult,
  }, { stakesMode: game?.stakesMode })

  // Points-only, like fmtAmount: points mode stores the point count; money mode cents.
  const toPoints = (cents: number) => (game?.stakesMode === 'points' ? cents : Math.round(cents / 100))
  const cardStandings: ResultCardStanding[] = (() => {
    if (!game || !hasGameResult) return []
    const ranked = players
      .map(p => ({ playerId: p.id, displayName: p.name, net: toPoints(gameNetByPlayer.get(p.id) ?? 0) }))
      .sort((a, b) => b.net - a.net)
    // Standard competition ranking: ties share a position, next distinct skips.
    let pos = 0
    let lastNet: number | null = null
    return ranked.map((r, i) => {
      if (lastNet === null || r.net !== lastNet) { pos = i + 1; lastNet = r.net }
      return { ...r, position: pos }
    })
  })()

  const gameLabel = game ? (GAME_LABELS[game.type] ?? game.type) : null

  // Share the current standings as an in-progress ResultCard image. Uses the offscreen
  // 1080-grid render (renderResultCardToBlob) — no html2canvas. Settlements stay empty
  // mid-round; the card shows "{leader} leads." and a LIVE · THRU N eyebrow.
  const onShareStandings = async () => {
    if (sharing || cardStandings.length === 0) return
    setSharing(true)
    try {
      const blob = await renderResultCardToBlob({
        round: {
          courseName: snapshot.courseName,
          date: round?.date ?? new Date(),
          formats: gameLabel ? [gameLabel] : [],
          // Strokes only: this component receives computed results, not the
          // hole-level BBB/junk records, so a points round still under-reports
          // here. SettleUp's card — the one that printed "0 HOLES" — is fixed.
          holesPlayed: new Set(approvedScores.map(h => h.holeNumber)).size,
        },
        standings: cardStandings,
        settlements: [],
        roundId: round?.id,
        inProgress: true,
        ratio: 'story',
      })
      if (blob) await shareCard(blob, 'gimme-standings', window.location.origin)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto">
      {/* Every game leads with its own standings — the layout Stableford always
          had — and the stroke scorecard follows as reference (Finding 9). */}
      {game && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
            {gameLabel}{standings.metric ? ` · ${standings.metric}` : ''}
          </p>
          <table className="w-full text-sm">
            <tbody>
              {standings.entries.map(e => (
                <tr key={e.player.id} className={`border-b border-gray-50 ${e.position === 1 ? 'bg-amber-50' : ''}`}>
                  <td className={`py-2.5 px-1 font-bold w-8 ${e.position === 1 ? 'text-amber-600' : 'text-gray-500'}`}>{e.position || '—'}</td>
                  <td className="py-2.5 px-1 font-semibold text-gray-800 dark:text-gray-100">{e.player.name}{claimedLine(e.player.id)}</td>
                  <td className={`py-2.5 px-1 text-right font-bold text-lg ${
                    e.value === null ? 'text-gray-400' : e.value < 0 ? 'text-gray-500 dark:text-gray-400' : 'text-amber-600 dark:text-brass'
                  }`}>{e.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!standings.hasResult && (
            <p className="text-xs text-gray-400 mt-2">No result yet — standings appear once the game produces one.</p>
          )}

        {/* Game-specific running detail, under the standings it explains */}

        {/* Skins */}
        {skinsResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
              Skins ({primaryLabel}) — {skinsResult.totalSkins} won{skinsResult.pendingCarry > 0 ? ` · ${skinsResult.pendingCarry} carry` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {players.filter(p => (skinsResult.skinsWon[p.id] ?? 0) > 0).map(p => (
                <span key={p.id} className="text-xs bg-amber-50 text-amber-700 font-semibold px-2 py-1 rounded-lg">
                  {p.name}: {skinsResult.skinsWon[p.id]}
                </span>
              ))}
              {skinsResult.totalSkins === 0 && (
                <span className="text-xs text-gray-400">No skins won yet</span>
              )}
            </div>
          </div>
        )}

        {/* Best Ball — Stroke Play (total) shows strokes to match the payout; Match
            Play shows holes won. */}
        {bestBallResult && game && (() => {
          const isTotal = (game.config as BestBallConfig).scoring === 'total'
          return (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Best Ball ({primaryLabel})</p>
              <p className="text-sm font-semibold text-gray-700">
                {isTotal
                  ? `Team A: ${bestBallResult.totalScore.A} · Team B: ${bestBallResult.totalScore.B} strokes`
                  : `Team A: ${bestBallResult.holesWon.A}W · Team B: ${bestBallResult.holesWon.B}W · Tied: ${bestBallResult.holesWon.tied}`}
              </p>
            </div>
          )
        })()}

        {/* Nassau — match play */}
        {nassauMatch && (() => {
          const nameOf = (id: string) => (players.find(p => p.id === id)?.name ?? '?').split(' ')[0]
          const legs = [
            { label: 'Front', leg: nassauMatch.front },
            { label: 'Back', leg: nassauMatch.back },
            { label: 'Total', leg: nassauMatch.total },
            ...nassauMatch.presses.map(p => ({
              label: `Press ${p.holeRange} (${nameOf(p.press.playerId)})`, leg: p,
            })),
          ]
          return (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Nassau · match play (net)</p>
              <div className="space-y-1">
                {legs.map(({ label, leg }) => (
                  <p key={label} className="text-sm text-gray-700">
                    <span className="font-semibold">{label}:</span>{' '}
                    {!leg.started
                      ? <span className="text-gray-400">Not started</span>
                      : <span className={leg.complete ? 'text-amber-600 dark:text-brass font-semibold' : ''}>
                          {nassauMatchLegStatus(leg, nameOf)}{leg.complete ? '' : ` · thru ${Math.max(...leg.matches.map(m => m.holesPlayed))}`}
                        </span>}
                  </p>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Nassau — stroke play (legacy rounds) */}
        {nassauResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Nassau ({primaryLabel})</p>
            <div className="space-y-1">
              {[
                { label: 'Front', seg: nassauResult.front },
                { label: 'Back', seg: nassauResult.back },
                { label: 'Total', seg: nassauResult.total },
              ].map(({ label, seg }) => {
                const leader = seg.winner ? players.find(p => p.id === seg.winner)?.name : null
                const tiedNames = seg.tiedPlayers.map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(', ')
                return (
                  <p key={label} className="text-sm text-gray-700">
                    <span className="font-semibold">{label}:</span>{' '}
                    {seg.incomplete ? <span className="text-gray-400">In progress</span> : leader ? <span className="text-amber-600 dark:text-brass font-semibold">{leader}</span> : tiedNames ? <span className="text-gray-500">Tied ({tiedNames})</span> : '—'}
                  </p>
                )
              })}
            </div>
          </div>
        )}

        {/* Wolf */}
        {wolfResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Wolf ({primaryLabel}) — Units</p>
            {(wolfResult.unresolvedHoles?.length ?? 0) > 0 && (
              <p className="text-xs text-amber-700 dark:text-brass mb-2">
                Waiting on a pick: hole{wolfResult.unresolvedHoles.length === 1 ? '' : 's'} {wolfResult.unresolvedHoles.join(', ')} — scores are in, the wolf&apos;s pick isn&apos;t recorded yet.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (wolfResult.netUnits[b.id] ?? 0) - (wolfResult.netUnits[a.id] ?? 0)).map(p => {
                const u = wolfResult.netUnits[p.id] ?? 0
                return (
                  <span key={p.id} className={`text-xs font-semibold px-2 py-1 rounded-lg ${u > 0 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-brass' : u < 0 ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' : 'bg-gray-50 dark:bg-gray-700/50 text-gray-500'}`}>
                    {p.name}: {u > 0 ? '+' : ''}{u}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* BBB points are shown as the headline table above (this is a points game). */}

        {/* Hammer — no mode, no alt */}
        {hammerResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Hammer</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (hammerResult.netCents[b.id] ?? 0) - (hammerResult.netCents[a.id] ?? 0)).map(p => {
                const net = hammerResult.netCents[p.id] ?? 0
                return (
                  <span key={p.id} className={`text-xs font-semibold px-2 py-1 rounded-lg ${net > 0 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-brass' : net < 0 ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' : 'bg-gray-50 dark:bg-gray-700/50 text-gray-500'}`}>
                    {p.name}: {net > 0 ? '+' : net < 0 ? '−' : ''}{fmtAmount(Math.abs(net), game?.stakesMode)}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Vegas */}
        {vegasResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Vegas ({primaryLabel})</p>
            <p className="text-sm font-semibold text-gray-700">
              Team A: {vegasResult.netPoints.A} pts · Team B: {vegasResult.netPoints.B} pts
              {vegasResult.winner !== 'tie' ? ` · Winner: Team ${vegasResult.winner}` : ' · Tied'}
            </p>
          </div>
        )}

        {/* Stableford, Banker and Quota chips were the headline table; the
            standings table above is now that for every game. Hammer and Wolf
            keep their rows because they carry detail the table does not. */}
        </div>
      )}

      {/* Golf scores — the reference card, ranked by net to par. */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
        <p className="text-xs font-medium text-gray-400 uppercase mb-2">Golf scores (reference)</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 uppercase border-b border-gray-200">
              <th className="text-left py-2 px-1 font-medium w-8">Pos</th>
              <th className="text-left py-2 px-1 font-medium">Player</th>
              <th className="text-center py-2 px-1 font-medium">Thru</th>
              <th className="text-center py-2 px-1 font-medium"><Tooltip term="Gross">Gross</Tooltip></th>
              <th className="text-center py-2 px-1 font-medium"><Tooltip term="Net">Net</Tooltip></th>
              <th className="text-center py-2 px-1 font-medium">vs Par</th>
            </tr>
          </thead>
          <tbody>
            {board.map((entry, idx) => (
              <tr key={entry.player.id} className={`border-b border-gray-50 ${positions[idx] === 1 ? 'bg-amber-50' : ''} ${entry.pending > 0 ? 'opacity-60' : ''}`}>
                <td className={`py-2.5 px-1 font-bold ${positions[idx] === 1 ? 'text-amber-600' : 'text-gray-500'}`}>{positions[idx]}</td>
                <td className="py-2.5 px-1 font-semibold text-gray-800 dark:text-gray-100">
                  {entry.player.name}
                  {entry.pending > 0 && (
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
                      {entry.pending} pending
                    </span>
                  )}
                  {hcpLine(entry.player.id)}
                  {claimedLine(entry.player.id)}
                </td>
                <td className="py-2.5 px-1 text-center text-gray-500">{entry.thru}</td>
                <td className="py-2.5 px-1 text-center font-semibold text-gray-700">{entry.gross || '—'}</td>
                <td className="py-2.5 px-1 text-center font-semibold text-gray-700">{entry.net || '—'}</td>
                <td className={`py-2.5 px-1 text-center font-semibold ${entry.vsPar > 0 ? 'text-gray-500 dark:text-gray-400' : entry.vsPar < 0 ? 'text-amber-600 dark:text-brass' : 'text-gray-400'}`}>
                  {entry.thru > 0 ? `${entry.vsPar > 0 ? '+' : ''}${entry.vsPar}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Share the standings — an in-progress ResultCard image (§22). Hidden until
          there are game standings to show. */}
      {cardStandings.length > 0 && (
        <button
          onClick={onShareStandings}
          disabled={sharing}
          className="mt-4 w-full h-12 bg-navy text-cream dark:bg-brass dark:text-navy font-bold rounded-2xl active:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {sharing && (
            <span className="inline-block w-5 h-5 border-2 border-cream/30 border-t-cream rounded-full animate-spin" />
          )}
          {sharing ? 'Creating image…' : 'Share the standings'}
        </button>
      )}
    </div>
  )
}
