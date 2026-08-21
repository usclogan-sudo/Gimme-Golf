import { useEffect, useState } from 'react'
import { supabase, rowToRound, rowToHoleScore, rowToSettlementRecord } from '../../lib/supabase'
import { buildCourseHandicaps, strokesOnHole } from '../../lib/gameLogic'
import { makePlayableSnapshot, roundToHolesConfig } from '../../lib/holeUtils'
import { ResultCard, buildResultCardProps } from '../ResultCard'
import { ConfirmModal } from '../ConfirmModal'
import type { Round, HoleScore, RoundPlayer, GameType, SettlementRecord } from '../../types'

interface Props {
  userId: string
  onBack?: () => void
  onViewSettlements?: (roundId: string) => void
  onPlayAgain?: (round: Round) => void
  /** Rendered inline as the Rounds tab's content — hides its own header (§3). */
  embedded?: boolean
}

const GAME_EMOJI: Record<GameType, string> = {
  skins: '⛳ Skins',
  best_ball: '🤝 Best Ball',
  nassau: '🏳️ Nassau',
  wolf: '🐺 Wolf',
  bingo_bango_bongo: '⭐ BBB',
  hammer: '🔨 Hammer',
  vegas: '🎲 Vegas',
  stableford: '📊 Stableford',
  dots: '🔴 Dots',
  banker: '🏦 Banker',
  quota: '📋 Quota',
}

// Clean format label for the ResultCard (strip the leading emoji from GAME_EMOJI).
const gameLabelOf = (t: GameType): string => {
  const label = (GAME_EMOJI[t] ?? t).split(' ').slice(1).join(' ')
  return label || t
}

export function RoundHistory({ userId, onBack, onViewSettlements, onPlayAgain, embedded }: Props) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedScores, setExpandedScores] = useState<HoleScore[]>([])
  const [expandedRoundPlayers, setExpandedRoundPlayers] = useState<RoundPlayer[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<string | null>(null)
  const [showScoreTable, setShowScoreTable] = useState(false)
  const [settlementStatus, setSettlementStatus] = useState<Map<string, { owed: number; paid: number }>>(new Map())
  // Full settlement records + which player id is "me" per round — drives the
  // outcome each row leads with (UX v2.1 §10).
  const [settlementsByRound, setSettlementsByRound] = useState<Map<string, SettlementRecord[]>>(new Map())
  const [myPlayerByRound, setMyPlayerByRound] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    supabase
      .from('rounds')
      .select('*')
      .eq('status', 'complete')
      .order('date', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const mapped = data.map(rowToRound)
          setRounds(mapped)
          const ids = mapped.map(r => r.id)
          if (ids.length > 0) {
            // Settlement records (for status badges + per-round outcome) and
            // participant rows (to resolve which player is the current user).
            Promise.all([
              supabase.from('settlements').select('*').in('round_id', ids),
              supabase.from('round_participants').select('round_id, player_id, user_id').in('round_id', ids),
            ]).then(([sRes, pRes]) => {
              const statusMap = new Map<string, { owed: number; paid: number }>()
              const recMap = new Map<string, SettlementRecord[]>()
              for (const row of sRes.data ?? []) {
                const entry = statusMap.get(row.round_id) ?? { owed: 0, paid: 0 }
                if (row.status === 'owed') entry.owed++
                else if (row.status === 'paid') entry.paid++
                statusMap.set(row.round_id, entry)
                const rec = rowToSettlementRecord(row)
                recMap.set(rec.roundId, [...(recMap.get(rec.roundId) ?? []), rec])
              }
              const meMap = new Map<string, string>()
              for (const row of pRes.data ?? []) {
                if (row.user_id === userId) meMap.set(row.round_id, row.player_id)
              }
              // Self-created guest rounds have no participant row — the player id
              // equals the auth user id in the round snapshot.
              for (const r of mapped) {
                if (!meMap.has(r.id) && (r.players ?? []).some(p => p.id === userId)) meMap.set(r.id, userId)
              }
              setSettlementStatus(statusMap)
              setSettlementsByRound(recMap)
              setMyPlayerByRound(meMap)
            })
          }
        }
        setLoading(false)
      })
  }, [userId])

  const toggleExpand = async (roundId: string) => {
    if (expandedId === roundId) {
      setExpandedId(null)
      return
    }
    setExpandedId(roundId)
    setExpandedScores([])
    setExpandedRoundPlayers([])
    setShowScoreTable(false)
    const [hsRes, rpRes] = await Promise.all([
      supabase.from('hole_scores').select('*').eq('round_id', roundId),
      supabase.from('round_players').select('*').eq('round_id', roundId),
    ])
    if (hsRes.data) setExpandedScores(hsRes.data.map(rowToHoleScore))
    if (rpRes.data) {
      setExpandedRoundPlayers(rpRes.data.map((r: any) => ({
        id: r.id,
        roundId: r.round_id,
        playerId: r.player_id,
        teePlayed: r.tee_played,
        courseHandicap: r.course_handicap ?? undefined,
        playingHandicap: r.playing_handicap ?? undefined,
      })))
    }
  }

  const [deleteError, setDeleteError] = useState<string | null>(null)

  const deleteRound = async (roundId: string) => {
    setDeleting(roundId)
    setDeleteError(null)
    try {
      const { error } = await supabase.rpc('delete_own_round', { p_round_id: roundId })
      if (error) throw error
      setRounds(prev => prev.filter(r => r.id !== roundId))
      if (expandedId === roundId) setExpandedId(null)
    } catch {
      setDeleteError('Failed to delete round. Please try again.')
    }
    setDeleting(null)
  }

  const confirmDelete = (roundId: string) => {
    setDeleteModal(roundId)
  }

  if (loading) {
    return (
      <div className={embedded ? 'flex justify-center py-16' : 'min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center'}>
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gray-50 dark:bg-gray-900 pb-8'}>
      {!embedded && (
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-600 text-xl" aria-label="Back">←</button>
          <h1 className="text-xl font-bold">Round History</h1>
        </header>
      )}

      <div className={embedded ? 'space-y-3' : 'px-4 py-5 max-w-2xl mx-auto space-y-3'}>
        {rounds.length === 0 && (
          <div className="text-center py-12">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-gray-500 font-medium">No completed rounds yet</p>
            <p className="text-gray-400 text-sm mt-1">Finished rounds will appear here</p>
          </div>
        )}

        {rounds.map(round => {
          const snapshot = round.courseSnapshot
          const game = round.game
          const players = round.players ?? []
          const isExpanded = expandedId === round.id
          const sStatus = settlementStatus.get(round.id)

          // ── Per-round outcome (UX v2.1 §10) — lead the row with the result ──
          const recs = settlementsByRound.get(round.id) ?? []
          const hasOutcome = recs.length > 0 && !!snapshot && !!game
          const cardProps = hasOutcome
            ? buildResultCardProps({
                roundId: round.id,
                courseName: snapshot!.courseName,
                date: round.date,
                formats: [gameLabelOf(game!.type)],
                holesPlayed: new Set(expandedScores.map(h => h.holeNumber)).size,
                players,
                settlements: recs,
                isPoints: game!.stakesMode === 'points',
              })
            : null

          let outcome: { label: string; tone: 'win' | 'loss' | 'even' } | null = null
          if (cardProps) {
            const anyPositive = cardProps.standings.some(s => s.net > 0)
            const winner = cardProps.standings.find(s => s.position === 1) ?? null
            const myId = myPlayerByRound.get(round.id) ?? null
            const myNet = myId ? cardProps.standings.find(s => s.playerId === myId)?.net ?? null : null
            if (!anyPositive) {
              outcome = { label: 'All square', tone: 'even' }
            } else if (myNet !== null) {
              if (myNet > 0) outcome = { label: `You won +${myNet} pts`, tone: 'win' }
              else if (myNet < 0) outcome = { label: `You lost ${Math.abs(myNet)} pts`, tone: 'loss' }
              else outcome = { label: 'You broke even', tone: 'even' }
            } else if (winner) {
              outcome = { label: `${winner.displayName} won`, tone: 'even' }
            }
          }
          const toneClass = outcome?.tone === 'win'
            ? 'text-amber-600 dark:text-brass'
            : outcome?.tone === 'loss'
              ? 'text-gray-500 dark:text-gray-400'
              : 'text-gray-700 dark:text-gray-200'

          return (
            <div key={round.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => toggleExpand(round.id)}
                className="w-full text-left px-4 py-3 active:bg-gray-50 dark:active:bg-gray-700/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {outcome ? (
                      <p className={`font-display text-lg font-semibold leading-tight truncate ${toneClass}`}>{outcome.label}</p>
                    ) : (
                      <p className="font-display text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate">{snapshot?.courseName ?? 'Unknown Course'}</p>
                    )}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {outcome && <>{snapshot?.courseName ?? 'Unknown Course'} · </>}
                      {new Date(round.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {game && <> · {GAME_EMOJI[game.type] ?? game.type}</>}
                      {game?.stakesMode === 'high_roller' && ' 💎'}
                      {players.length > 0 && <> · {players.length}p</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {sStatus && sStatus.owed === 0 && sStatus.paid > 0 && (
                      <span className="text-xs font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">Settled</span>
                    )}
                    {sStatus && sStatus.owed > 0 && (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">{sStatus.owed} owed</span>
                    )}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3">
                  {/* The ResultCard — the shareable hero for this round (UX v2.1 §10) */}
                  {cardProps && expandedScores.length > 0 && (
                    <div className="rounded-2xl overflow-hidden shadow-md">
                      <ResultCard {...cardProps} variant="screen" ratio="feed" />
                    </div>
                  )}

                  {/* Golf scorecard — collapsed by default; the card above is the hero (§6). */}
                  {players.length > 0 && snapshot && (
                    <div>
                      <button
                        onClick={() => setShowScoreTable(v => !v)}
                        className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide py-1"
                      >
                        <span>Scorecard</span>
                        <span className="text-gray-400 text-sm">{showScoreTable ? '▾' : '▸'}</span>
                      </button>
                  {showScoreTable && (() => {
                    const pSnap = makePlayableSnapshot(snapshot, roundToHolesConfig(round))
                    const courseHcps = buildCourseHandicaps(players, expandedRoundPlayers, snapshot, round.holesMode)

                    const board = players.map(player => {
                      const playerScores = expandedScores.filter(s => s.playerId === player.id)
                      const gross = playerScores.reduce((s, hs) => s + hs.grossScore, 0)
                      const courseHcp = courseHcps[player.id] ?? 0
                      const netStrokes = playerScores.reduce((s, hs) => {
                        const hole = pSnap.holes.find(h => h.number === hs.holeNumber)
                        return s + (hole ? strokesOnHole(courseHcp, hole.strokeIndex, pSnap.holes.length) : 0)
                      }, 0)
                      // vs par over the holes actually played (not all 18), so a
                      // partial round doesn't read e.g. −68 for a 1-hole gross of 6.
                      const scoredPar = playerScores.reduce((s, hs) => {
                        const hole = pSnap.holes.find(h => h.number === hs.holeNumber)
                        return s + (hole?.par ?? 0)
                      }, 0)
                      return { player, gross, net: gross - netStrokes, vsPar: gross - scoredPar, hasScores: playerScores.length > 0 }
                    }).sort((a, b) => a.net - b.net)

                    return (
                      <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
                              <th className="text-left py-1.5 px-2 font-medium">#</th>
                              <th className="text-left py-1.5 px-2 font-medium">Player</th>
                              <th className="text-center py-1.5 px-2 font-medium">Gross</th>
                              <th className="text-center py-1.5 px-2 font-medium">Net</th>
                              <th className="text-center py-1.5 px-2 font-medium">vs Par</th>
                            </tr>
                          </thead>
                          <tbody>
                            {board.map(({ player, gross, net, vsPar, hasScores }, i) => (
                              <tr key={player.id} className="border-b border-gray-50 dark:border-gray-700/50">
                                <td className="py-1.5 px-2 text-gray-400 font-semibold">{i + 1}</td>
                                <td className="py-1.5 px-2 font-semibold text-gray-800 dark:text-gray-100">{player.name}</td>
                                {hasScores ? (
                                  <>
                                    <td className="py-1.5 px-2 text-center text-gray-700 dark:text-gray-300">{gross}</td>
                                    <td className="py-1.5 px-2 text-center font-semibold text-gray-700 dark:text-gray-200">{net}</td>
                                    <td className={`py-1.5 px-2 text-center font-semibold ${vsPar > 0 ? 'text-gray-500 dark:text-gray-400' : vsPar < 0 ? 'text-amber-600 dark:text-brass' : 'text-gray-500'}`}>
                                      {vsPar > 0 ? '+' : ''}{vsPar}
                                    </td>
                                  </>
                                ) : (
                                  <td colSpan={3} className="py-1.5 px-2 text-center text-gray-400">No scores</td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })()}
                    </div>
                  )}

                  {/* Primary actions — Settle Up is navy, not money-gold (§6). */}
                  <div className="flex gap-2">
                    {onViewSettlements && sStatus && (
                      <button
                        onClick={() => onViewSettlements(round.id)}
                        className={`flex-1 h-11 text-sm font-semibold rounded-xl transition-colors ${
                          sStatus.owed > 0
                            ? 'bg-navy text-cream dark:bg-brass dark:text-navy active:opacity-90 shadow-sm'
                            : 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 active:bg-gray-50 dark:active:bg-gray-700'
                        }`}
                      >
                        {sStatus.owed > 0 ? 'Settle Up' : 'View Settlements'}
                      </button>
                    )}
                    {onPlayAgain && (
                      <button
                        onClick={() => onPlayAgain(round)}
                        className="flex-1 h-11 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-xl active:bg-gray-50 dark:active:bg-gray-700"
                      >
                        Play Again
                      </button>
                    )}
                  </div>
                  {/* Delete is destructive and tertiary — not a peer of the primary action (§6). */}
                  <div className="text-center">
                    <button
                      onClick={() => confirmDelete(round.id)}
                      disabled={deleting === round.id}
                      className="text-xs font-medium text-gray-400 dark:text-gray-500 active:text-gray-600 disabled:opacity-50 py-1"
                    >
                      {deleting === round.id ? 'Deleting…' : 'Delete round'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {deleteError && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-100 border border-red-300 rounded-xl p-3 text-center z-20">
          <p className="text-red-700 text-sm font-medium">{deleteError}</p>
          <button onClick={() => setDeleteError(null)} className="text-red-500 text-xs underline mt-1">Dismiss</button>
        </div>
      )}
      <ConfirmModal
        open={!!deleteModal}
        title="Delete Round?"
        message="Delete this round? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteModal) { deleteRound(deleteModal); setDeleteModal(null) } }}
        onCancel={() => setDeleteModal(null)}
      />
    </div>
  )
}
