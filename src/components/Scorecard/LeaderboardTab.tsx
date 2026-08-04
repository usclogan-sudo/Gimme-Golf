import type { Ref, RefObject } from 'react'
import { Tooltip } from '../ui/Tooltip'
import { ShareCard } from '../ShareCard'
import type { ShareCardStanding } from '../ShareCard/ShareCard'
import {
  strokesOnHole, fmtAmount,
  calculateSkinsPayouts, calculateBestBallPayouts, calculateNassauPayouts,
  calculateBBBPayouts, calculateVegasPayouts,
  calculateStablefordPayouts, calculateQuotaPayouts,
  isUnitGame, unitGameNet, netFromPayouts,
} from '../../lib/gameLogic'
import type {
  SkinsResult, BestBallResult, NassauResult, WolfResult, BBBResult,
  HammerResult, VegasResult, StablefordResult, BankerResult, QuotaResult,
  PlayerPayout,
} from '../../lib/gameLogic'
import type { Player, HoleScore, CourseSnapshot, Round, Game, BestBallConfig, VegasConfig } from '../../types'

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
  shareRef: RefObject<HTMLDivElement | null>
  sharing: boolean
  shareImage: () => void
}

const GAME_LABELS: Record<string, string> = {
  skins: 'Skins', best_ball: 'Best Ball', nassau: 'Nassau', wolf: 'Wolf',
  bingo_bango_bongo: 'Bingo Bango Bongo', hammer: 'Hammer', vegas: 'Vegas',
  stableford: 'Stableford', dots: 'Dots', banker: 'Banker', quota: 'Quota',
}

export function LeaderboardTab({
  snapshot, players, holeScores, courseHcps, game, round,
  skinsResult, bestBallResult, nassauResult, wolfResult, bbbResult,
  hammerResult, vegasResult, stablefordResult, bankerResult, quotaResult,
  skinsResultAlt, bestBallResultAlt, nassauResultAlt, wolfResultAlt,
  vegasResultAlt, stablefordResultAlt, bankerResultAlt, quotaResultAlt,
  primaryMode = 'net',
  shareRef, sharing, shareImage,
}: Props) {
  const primaryLabel = primaryMode === 'net' ? 'Net' : 'Gross'
  const altLabel = primaryMode === 'net' ? 'Gross' : 'Net'

  const board = players.map(p => {
    const pScores = holeScores.filter(s => s.playerId === p.id)
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
    return { player: p, gross, net: gross - netStrokes, vsPar: gross - scoredPar, thru: pScores.length }
  }).sort((a, b) => a.net - b.net)

  const positions: number[] = []
  board.forEach((entry, idx) => {
    positions.push(idx === 0 ? 1 : entry.net === board[idx - 1].net ? positions[idx - 1] : idx + 1)
  })

  // In-round per-player net cents for the off-screen share card.
  // - Hammer / Banker / Dots are direct-settlement: result.netCents per player is zero-sum.
  // - Pot-based games: every player implicitly pays buyInCents in; winners receive a slice
  //   of the pot via calculateXxxPayouts.
  // Net per player = (received from pot) − (buyInCents stake) + (direct-settlement netCents).
  const shareStandings: ShareCardStanding[] = (() => {
    if (!game) return []
    const netByPlayer = new Map<string, number>()
    players.forEach(p => netByPlayer.set(p.id, 0))

    // Use the SAME net the settlement engine records, so in-round standings match
    // Settle Up. Unit games (hammer/dots/banker/wolf) settle head-to-head from a
    // signed net (wolf/banker units × per-unit stake; hammer real cents); pot games
    // are payout − buy-in.
    const unitRaw =
      game.type === 'wolf' ? wolfResult ?? undefined
      : game.type === 'banker' ? bankerResult ?? undefined
      : game.type === 'hammer' ? hammerResult ?? undefined
      : undefined
    if (isUnitGame(game.type) && unitRaw) {
      Object.entries(unitGameNet(game.type, game.buyInCents, unitRaw)).forEach(([pid, c]) => {
        netByPlayer.set(pid, (netByPlayer.get(pid) ?? 0) + c)
      })
    } else {
      // Pot-based dispatch — mirrors SettleUp.payouts
      let payouts: PlayerPayout[] = []
      if (game.type === 'skins' && skinsResult) {
        payouts = calculateSkinsPayouts(skinsResult, game, players.length)
      } else if (game.type === 'best_ball' && bestBallResult) {
        payouts = calculateBestBallPayouts(bestBallResult, game.config as BestBallConfig, game, players)
      } else if (game.type === 'nassau' && nassauResult) {
        payouts = calculateNassauPayouts(nassauResult, game, players, holeScores, snapshot, courseHcps)
      } else if (game.type === 'bingo_bango_bongo' && bbbResult) {
        payouts = calculateBBBPayouts(bbbResult, game, players)
      } else if (game.type === 'vegas' && vegasResult) {
        payouts = calculateVegasPayouts(vegasResult, game.config as VegasConfig, game, players)
      } else if (game.type === 'stableford' && stablefordResult) {
        payouts = calculateStablefordPayouts(stablefordResult, game, players)
      } else if (game.type === 'quota' && quotaResult) {
        payouts = calculateQuotaPayouts(quotaResult, game, players)
      }

      if (payouts.length > 0 && game.buyInCents > 0) {
        Object.entries(netFromPayouts(payouts, players, game.buyInCents)).forEach(([pid, c]) => {
          netByPlayer.set(pid, c)
        })
      }
    }

    // Drop empty standings — keeps "All square." path for unscored rounds clean.
    const allZero = Array.from(netByPlayer.values()).every(v => v === 0)
    if (allZero) return []
    return players
      .map(p => ({ name: p.name, netCents: netByPlayer.get(p.id) ?? 0 }))
      .sort((a, b) => b.netCents - a.netCents)
  })()

  const gameLabel = game ? (GAME_LABELS[game.type] ?? game.type) : null

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
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
              <tr key={entry.player.id} className={`border-b border-gray-50 ${positions[idx] === 1 ? 'bg-amber-50' : ''}`}>
                <td className={`py-2.5 px-1 font-bold ${positions[idx] === 1 ? 'text-amber-600' : 'text-gray-500'}`}>{positions[idx]}</td>
                <td className="py-2.5 px-1 font-semibold text-gray-800">{entry.player.name}</td>
                <td className="py-2.5 px-1 text-center text-gray-500">{entry.thru}</td>
                <td className="py-2.5 px-1 text-center font-semibold text-gray-700">{entry.gross || '—'}</td>
                <td className="py-2.5 px-1 text-center font-semibold text-gray-700">{entry.net || '—'}</td>
                <td className={`py-2.5 px-1 text-center font-semibold ${entry.vsPar > 0 ? 'text-red-600' : entry.vsPar < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {entry.thru > 0 ? `${entry.vsPar > 0 ? '+' : ''}${entry.vsPar}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Game-specific running totals */}

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
        {skinsResultAlt && (
          <div className="mt-2 pl-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">
              Skins ({altLabel}) — {skinsResultAlt.totalSkins} won
            </p>
            <div className="flex flex-wrap gap-2">
              {players.filter(p => (skinsResultAlt.skinsWon[p.id] ?? 0) > 0).map(p => (
                <span key={p.id} className="text-xs text-gray-500 px-2 py-0.5 rounded bg-gray-50">
                  {p.name}: {skinsResultAlt.skinsWon[p.id]}
                </span>
              ))}
              {skinsResultAlt.totalSkins === 0 && (
                <span className="text-xs text-gray-400">No skins won yet</span>
              )}
            </div>
          </div>
        )}

        {/* Best Ball */}
        {bestBallResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Best Ball ({primaryLabel})</p>
            <p className="text-sm font-semibold text-gray-700">
              Team A: {bestBallResult.holesWon.A}W · Team B: {bestBallResult.holesWon.B}W · Tied: {bestBallResult.holesWon.tied}
            </p>
          </div>
        )}
        {bestBallResultAlt && (
          <div className="mt-2 pl-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Best Ball ({altLabel})</p>
            <p className="text-sm text-gray-500">
              Team A: {bestBallResultAlt.holesWon.A}W · Team B: {bestBallResultAlt.holesWon.B}W · Tied: {bestBallResultAlt.holesWon.tied}
            </p>
          </div>
        )}

        {/* Nassau */}
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
                    {seg.incomplete ? <span className="text-gray-400">In progress</span> : leader ? <span className="text-teal-700 font-semibold">{leader}</span> : tiedNames ? <span className="text-gray-500">Tied ({tiedNames})</span> : '—'}
                  </p>
                )
              })}
            </div>
          </div>
        )}
        {nassauResultAlt && (
          <div className="mt-2 pl-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Nassau ({altLabel})</p>
            <div className="space-y-0.5">
              {[
                { label: 'Front', seg: nassauResultAlt.front },
                { label: 'Back', seg: nassauResultAlt.back },
                { label: 'Total', seg: nassauResultAlt.total },
              ].map(({ label, seg }) => {
                const leader = seg.winner ? players.find(p => p.id === seg.winner)?.name : null
                const tiedNames = seg.tiedPlayers.map(id => players.find(p => p.id === id)?.name).filter(Boolean).join(', ')
                return (
                  <p key={label} className="text-xs text-gray-500">
                    <span className="font-medium">{label}:</span>{' '}
                    {seg.incomplete ? 'In progress' : leader ?? (tiedNames ? `Tied (${tiedNames})` : '—')}
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
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (wolfResult.netUnits[b.id] ?? 0) - (wolfResult.netUnits[a.id] ?? 0)).map(p => {
                const u = wolfResult.netUnits[p.id] ?? 0
                return (
                  <span key={p.id} className={`text-xs font-semibold px-2 py-1 rounded-lg ${u > 0 ? 'bg-purple-50 text-purple-700' : u < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
                    {p.name}: {u > 0 ? '+' : ''}{u}
                  </span>
                )
              })}
            </div>
          </div>
        )}
        {wolfResultAlt && (
          <div className="mt-2 pl-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Wolf ({altLabel}) — Units</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (wolfResultAlt.netUnits[b.id] ?? 0) - (wolfResultAlt.netUnits[a.id] ?? 0)).map(p => {
                const u = wolfResultAlt.netUnits[p.id] ?? 0
                return (
                  <span key={p.id} className="text-xs text-gray-500 px-2 py-0.5 rounded bg-gray-50">
                    {p.name}: {u > 0 ? '+' : ''}{u}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* BBB — no mode, no alt */}
        {bbbResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Bingo Bango Bongo</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (bbbResult.pointsWon[b.id] ?? 0) - (bbbResult.pointsWon[a.id] ?? 0)).map(p => {
                const pts = bbbResult.pointsWon[p.id] ?? 0
                return (
                  <span key={p.id} className={`text-xs font-semibold px-2 py-1 rounded-lg ${pts > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
                    {p.name}: {pts}pt{pts !== 1 ? 's' : ''}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Hammer — no mode, no alt */}
        {hammerResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Hammer</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (hammerResult.netCents[b.id] ?? 0) - (hammerResult.netCents[a.id] ?? 0)).map(p => {
                const net = hammerResult.netCents[p.id] ?? 0
                return (
                  <span key={p.id} className={`text-xs font-semibold px-2 py-1 rounded-lg ${net > 0 ? 'bg-orange-50 text-orange-700' : net < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
                    {p.name}: {net > 0 ? '+' : ''}{fmtAmount(Math.abs(net), game?.stakesMode)}
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
        {vegasResultAlt && (
          <div className="mt-2 pl-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Vegas ({altLabel})</p>
            <p className="text-xs text-gray-500">
              Team A: {vegasResultAlt.netPoints.A} pts · Team B: {vegasResultAlt.netPoints.B} pts
              {vegasResultAlt.winner !== 'tie' ? ` · Winner: Team ${vegasResultAlt.winner}` : ' · Tied'}
            </p>
          </div>
        )}

        {/* Stableford */}
        {stablefordResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Stableford ({primaryLabel})</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (stablefordResult.points[b.id] ?? 0) - (stablefordResult.points[a.id] ?? 0)).map(p => (
                <span key={p.id} className="text-xs font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">
                  {p.name}: {stablefordResult.points[p.id] ?? 0} pts
                </span>
              ))}
            </div>
          </div>
        )}
        {stablefordResultAlt && (
          <div className="mt-2 pl-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Stableford ({altLabel})</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (stablefordResultAlt.points[b.id] ?? 0) - (stablefordResultAlt.points[a.id] ?? 0)).map(p => (
                <span key={p.id} className="text-xs text-gray-500 px-2 py-0.5 rounded bg-gray-50">
                  {p.name}: {stablefordResultAlt.points[p.id] ?? 0} pts
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Banker */}
        {bankerResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Banker ({primaryLabel})</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (bankerResult.netCents[b.id] ?? 0) - (bankerResult.netCents[a.id] ?? 0)).map(p => {
                const net = bankerResult.netCents[p.id] ?? 0
                return (
                  <span key={p.id} className={`text-xs font-semibold px-2 py-1 rounded-lg ${net > 0 ? 'bg-emerald-50 text-emerald-700' : net < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
                    {p.name}: {net > 0 ? '+' : ''}{fmtAmount(Math.abs(net), game?.stakesMode)}
                  </span>
                )
              })}
            </div>
          </div>
        )}
        {bankerResultAlt && (
          <div className="mt-2 pl-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Banker ({altLabel})</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (bankerResultAlt.netCents[b.id] ?? 0) - (bankerResultAlt.netCents[a.id] ?? 0)).map(p => {
                const net = bankerResultAlt.netCents[p.id] ?? 0
                return (
                  <span key={p.id} className="text-xs text-gray-500 px-2 py-0.5 rounded bg-gray-50">
                    {p.name}: {net > 0 ? '+' : ''}{fmtAmount(Math.abs(net), game?.stakesMode)}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Quota */}
        {quotaResult && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Quota ({primaryLabel})</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (quotaResult.netPoints[b.id] ?? 0) - (quotaResult.netPoints[a.id] ?? 0)).map(p => {
                const net = quotaResult.netPoints[p.id] ?? 0
                return (
                  <span key={p.id} className={`text-xs font-semibold px-2 py-1 rounded-lg ${net > 0 ? 'bg-blue-50 text-blue-700' : net < 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
                    {p.name}: {net > 0 ? '+' : ''}{net}
                  </span>
                )
              })}
            </div>
          </div>
        )}
        {quotaResultAlt && (
          <div className="mt-2 pl-2 border-l-2 border-gray-200">
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Quota ({altLabel})</p>
            <div className="flex flex-wrap gap-2">
              {players.slice().sort((a, b) => (quotaResultAlt.netPoints[b.id] ?? 0) - (quotaResultAlt.netPoints[a.id] ?? 0)).map(p => {
                const net = quotaResultAlt.netPoints[p.id] ?? 0
                return (
                  <span key={p.id} className="text-xs text-gray-500 px-2 py-0.5 rounded bg-gray-50">
                    {p.name}: {net > 0 ? '+' : ''}{net}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Share Leaderboard */}
      <button
        onClick={shareImage}
        disabled={sharing}
        className="mt-4 w-full h-12 bg-emerald-600 text-white font-bold rounded-2xl active:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {sharing ? (
          <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        )}
        {sharing ? 'Creating image…' : 'Share Leaderboard'}
      </button>
      {/*
        In-round leaderboard share: standings aggregated from in-flight game
        results (Hammer/Banker netCents direct; pot-based games via the
        calculateXxxPayouts dispatch + buyIn subtraction). Settlements stay
        empty mid-round — the net-out graph is computed in SettleUp post-round.
        When no game results exist yet, shareStandings is [] and the card
        falls back to the "All square." path.
      */}
      <div style={{ position: 'absolute', left: -9999, top: 0 }}>
        <ShareCard
          ref={shareRef as Ref<HTMLDivElement>}
          courseName={snapshot.courseName}
          date={round!.date}
          gameLabel={gameLabel}
          standings={shareStandings}
          settlements={[]}
          isPoints={game?.stakesMode === 'points'}
        />
      </div>
    </div>
  )
}
