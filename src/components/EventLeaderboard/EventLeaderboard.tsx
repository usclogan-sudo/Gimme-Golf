import { useEffect, useMemo, useState } from 'react'
import { supabase, rowToRound, rowToRoundPlayer, rowToHoleScore, rowToEvent, rowToEventParticipant } from '../../lib/supabase'
import { buildCourseHandicaps, strokesOnHole, fmtAmount } from '../../lib/gameLogic'
import { makePlayableSnapshot, roundToHolesConfig } from '../../lib/holeUtils'
import { InvitePlayerModal } from '../InvitePlayerModal'
import type { Round, RoundPlayer, HoleScore, GolfEvent, EventParticipant, ScoreStatus } from '../../types'

interface Props {
  userId: string
  eventId: string
  onBack: () => void
}

export function EventLeaderboard({ userId, eventId, onBack }: Props) {
  const [event, setEvent] = useState<GolfEvent | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayer[]>([])
  const [holeScores, setHoleScores] = useState<HoleScore[]>([])
  const [eventParticipants, setEventParticipants] = useState<EventParticipant[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overall' | number>('overall')
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [showApproval, setShowApproval] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // Load data — extracted so the visibility-resume path can refetch on demand.
  const loadData = (isCancelled?: () => boolean) => {
    const cancelled = () => isCancelled?.() ?? false
    supabase.from('events').select('*').eq('id', eventId).single().then(({ data }) => {
      if (cancelled()) return
      if (!data) return
      const ev = rowToEvent(data)
      setEvent(ev)
      if (!ev.roundId) { setLoading(false); return }

      Promise.all([
        supabase.from('rounds').select('*').eq('id', ev.roundId).single(),
        supabase.from('round_players').select('*').eq('round_id', ev.roundId),
        supabase.from('hole_scores').select('*').eq('round_id', ev.roundId),
        supabase.from('event_participants').select('*').eq('event_id', eventId).eq('status', 'accepted'),
      ]).then(([roundRes, rpRes, hsRes, epRes]) => {
        if (cancelled()) return
        if (roundRes.data) setRound(rowToRound(roundRes.data))
        if (rpRes.data) setRoundPlayers(rpRes.data.map(rowToRoundPlayer))
        if (hsRes.data) setHoleScores(hsRes.data.map(rowToHoleScore))
        if (epRes.data) setEventParticipants(epRes.data.map(rowToEventParticipant))
        setLoading(false)
      })
    })
  }

  useEffect(() => {
    let cancelled = false
    loadData(() => cancelled)
    return () => { cancelled = true }
  }, [eventId])

  // Realtime + presence subscriptions, gated by tab visibility — backgrounded
  // tabs drop their channels after a 5s grace window so they don't count
  // against the realtime cap. On resume we refetch state and resubscribe.
  useEffect(() => {
    if (!round || !event) return
    let cancelled = false
    let dataChannel: ReturnType<typeof supabase.channel> | null = null
    let presenceChannel: ReturnType<typeof supabase.channel> | null = null
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null
    const HIDDEN_GRACE_MS = 5000

    const subscribe = () => {
      if (cancelled) return
      if (!dataChannel) {
        dataChannel = supabase
          .channel(`event-${eventId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'hole_scores', filter: `round_id=eq.${round.id}` }, (payload) => {
            if (payload.eventType === 'INSERT') {
              const row = payload.new as any
              setHoleScores(prev => prev.some(s => s.id === row.id) ? prev : [...prev, rowToHoleScore(row)])
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new as any
              setHoleScores(prev => prev.map(s => s.id === row.id ? rowToHoleScore(row) : s))
            } else if (payload.eventType === 'DELETE') {
              const row = payload.old as any
              setHoleScores(prev => prev.filter(s => s.id !== row.id))
            }
          })
          .subscribe()
      }
      if (!presenceChannel) {
        const ch = supabase.channel(`presence-event-${eventId}`)
        ch.on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState()
          const userIds = new Set<string>()
          for (const entries of Object.values(state)) {
            for (const entry of entries as any[]) {
              if (entry.user_id) userIds.add(entry.user_id)
            }
          }
          setOnlineUsers(userIds)
        }).subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && !cancelled) {
            await ch.track({ user_id: userId })
          }
        })
        presenceChannel = ch
      }
    }

    const unsubscribe = () => {
      if (dataChannel) { supabase.removeChannel(dataChannel); dataChannel = null }
      if (presenceChannel) { supabase.removeChannel(presenceChannel); presenceChannel = null }
    }

    const onVisibilityChange = () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') {
        if (hiddenTimer) clearTimeout(hiddenTimer)
        hiddenTimer = setTimeout(() => {
          if (!cancelled && document.visibilityState === 'hidden') unsubscribe()
        }, HIDDEN_GRACE_MS)
      } else {
        if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null }
        if (!dataChannel || !presenceChannel) {
          loadData(() => cancelled)
          subscribe()
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    if (document.visibilityState !== 'hidden') subscribe()

    return () => {
      cancelled = true
      if (hiddenTimer) clearTimeout(hiddenTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unsubscribe()
    }
  }, [round?.id, event?.id, eventId, userId])

  const players = round?.players ?? []
  const snapshot = round?.courseSnapshot
  const game = round?.game
  const groups = round?.groups

  // Build playable snapshot for 9-hole / shotgun modes
  const playableSnapshot = useMemo(() => {
    if (!snapshot || !round) return snapshot ?? null
    return makePlayableSnapshot(snapshot, roundToHolesConfig(round))
  }, [snapshot, round])

  // Only use approved scores for calculations
  const approvedScores = useMemo(() => {
    return holeScores.filter(s => s.scoreStatus !== 'rejected' && s.scoreStatus !== 'pending')
  }, [holeScores])

  const courseHcps = useMemo(() => {
    if (!snapshot || !roundPlayers) return {}
    return buildCourseHandicaps(players, roundPlayers, snapshot, round?.holesMode)
  }, [players, roundPlayers, snapshot, round?.holesMode])

  const groupNumbers = useMemo(() => {
    if (!groups) return [1]
    return [...new Set(Object.values(groups))].sort((a, b) => a - b)
  }, [groups])

  // Build leaderboard data
  const leaderboard = useMemo(() => {
    if (!playableSnapshot) return []
    const pSnap = playableSnapshot
    return players.map(p => {
      const pScores = approvedScores.filter(s => s.playerId === p.id)
      const gross = pScores.reduce((s, hs) => s + hs.grossScore, 0)
      const courseHcp = courseHcps[p.id] ?? 0
      const netStrokes = pScores.reduce((s, hs) => {
        const hole = pSnap.holes.find(h => h.number === hs.holeNumber)
        return s + (hole ? strokesOnHole(courseHcp, hole.strokeIndex, pSnap.holes.length) : 0)
      }, 0)
      const net = gross - netStrokes
      const scoredPar = pScores.reduce((s, hs) => {
        const hole = pSnap.holes.find(h => h.number === hs.holeNumber)
        return s + (hole?.par ?? 0)
      }, 0)
      const vsPar = gross - scoredPar
      const groupNum = groups?.[p.id] ?? 1
      const participant = eventParticipants.find(ep => ep.playerId === p.id)
      const isOnline = participant ? onlineUsers.has(participant.userId) : false

      return { player: p, gross, net, vsPar, thru: pScores.length, groupNum, isOnline }
    }).sort((a, b) => a.net - b.net)
  }, [players, approvedScores, playableSnapshot, courseHcps, groups, eventParticipants, onlineUsers])

  // Role detection
  const myParticipant = eventParticipants.find(ep => ep.userId === userId)
  const isManager = myParticipant?.role === 'manager'
  const isScorekeeper = myParticipant?.role === 'scorekeeper'
  const canApprove = isManager || isScorekeeper

  // Pending scores (scorekeepers only see their group's)
  const pendingScores = useMemo(() => {
    const pending = holeScores.filter(s => s.scoreStatus === 'pending')
    if (isManager) return pending
    if (isScorekeeper && myParticipant?.groupNumber) {
      const groupPlayerIds = new Set(
        players.filter(p => groups?.[p.id] === myParticipant.groupNumber).map(p => p.id)
      )
      return pending.filter(s => groupPlayerIds.has(s.playerId))
    }
    return []
  }, [holeScores, isManager, isScorekeeper, myParticipant, players, groups])

  // Per-group progress: max hole where ALL group members have an approved score
  const groupProgress = useMemo(() => {
    if (!groups || !playableSnapshot) return {}
    const pHoleNums = playableSnapshot.holes.map(h => h.number)
    const progress: Record<number, number> = {}
    for (const gn of groupNumbers) {
      const groupPlayerIds = players.filter(p => groups[p.id] === gn).map(p => p.id)
      if (groupPlayerIds.length === 0) { progress[gn] = 0; continue }
      let maxComplete = 0
      for (const h of pHoleNums) {
        const allHaveScore = groupPlayerIds.every(pid =>
          approvedScores.some(s => s.playerId === pid && s.holeNumber === h)
        )
        if (allHaveScore) maxComplete++
        else break
      }
      progress[gn] = maxComplete
    }
    return progress
  }, [groups, snapshot, groupNumbers, players, approvedScores])

  if (loading || !event || !round || !snapshot) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Loading leaderboard...</p>
      </div>
    )
  }

  const filteredLeaderboard = activeTab === 'overall'
    ? leaderboard
    : leaderboard.filter(e => e.groupNum === activeTab)

  // Compute positions
  const positions: number[] = []
  filteredLeaderboard.forEach((entry, idx) => {
    if (idx === 0) positions.push(1)
    else positions.push(entry.net === filteredLeaderboard[idx - 1].net ? positions[idx - 1] : idx + 1)
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-300">{snapshot.courseName}</p>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {event.name}
              <span className="inline-flex items-center gap-1 text-[10px] bg-green-500/30 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                Live
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {isManager && (
              <button onClick={() => setShowInvite(true)} className="text-cyan-300 text-sm font-medium px-3 min-h-[44px] rounded-lg hover:bg-gray-600">Invite</button>
            )}
            <button onClick={onBack} className="text-gray-300 text-sm font-medium px-3 min-h-[44px] rounded-lg hover:bg-gray-600">← Back</button>
          </div>
        </div>
      </header>

      {showInvite && (
        <InvitePlayerModal
          eventId={eventId}
          currentUserId={userId}
          existingPlayerIds={players.map((p: any) => p.id)}
          onClose={() => setShowInvite(false)}
        />
      )}

      {/* Tab bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 sticky top-[4.5rem] z-[6]">
        <div className="max-w-2xl mx-auto flex gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overall')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
              activeTab === 'overall' ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            Overall
          </button>
          {groupNumbers.map(gn => (
            <button
              key={gn}
              onClick={() => setActiveTab(gn)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
                activeTab === gn ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              Group {gn}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">Players</p>
            <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{filteredLeaderboard.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">Online</p>
            <p className="text-xl font-bold text-green-600">{onlineUsers.size}</p>
          </div>
          {groupNumbers.length > 1 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Group Progress</p>
              <div className="flex flex-col gap-0.5">
                {(() => {
                  const maxHole = Math.max(...Object.values(groupProgress), 0)
                  return groupNumbers.map(gn => {
                    const h = groupProgress[gn] ?? 0
                    const isBehind = h < maxHole
                    return (
                      <span key={gn} className={`text-xs font-bold ${isBehind ? 'text-amber-600' : 'text-green-600'}`}>
                        G{gn}: H{h}
                      </span>
                    )
                  })
                })()}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500">Hole</p>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{round.currentHole}</p>
            </div>
          )}
        </div>

        {/* Leaderboard table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase border-b border-gray-200 dark:border-gray-600">
                <th className="text-left py-2 px-1 font-medium w-8">Pos</th>
                <th className="text-left py-2 px-1 font-medium">Player</th>
                <th className="text-center py-2 px-1 font-medium">Thru</th>
                <th className="text-center py-2 px-1 font-medium">Gross</th>
                <th className="text-center py-2 px-1 font-medium">Net</th>
                <th className="text-center py-2 px-1 font-medium">vs Par</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeaderboard.map((entry, idx) => (
                <tr key={entry.player.id} className={`border-b border-gray-50 dark:border-gray-700 ${positions[idx] === 1 ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                  <td className={`py-2.5 px-1 font-bold ${positions[idx] === 1 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {positions[idx]}
                  </td>
                  <td className="py-2.5 px-1">
                    <div className="flex items-center gap-1.5">
                      {entry.isOnline && (
                        <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                      )}
                      <span className="font-semibold text-gray-800 dark:text-gray-100">{entry.player.name}</span>
                      {activeTab === 'overall' && groupNumbers.length > 1 && (
                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300">G{entry.groupNum}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-1 text-center text-gray-500">{entry.thru}</td>
                  <td className="py-2.5 px-1 text-center font-semibold text-gray-700 dark:text-gray-300">{entry.gross || '—'}</td>
                  <td className="py-2.5 px-1 text-center font-semibold text-gray-700 dark:text-gray-300">{entry.net || '—'}</td>
                  <td className={`py-2.5 px-1 text-center font-semibold ${entry.vsPar > 0 ? 'text-red-600' : entry.vsPar < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {entry.thru > 0 ? `${entry.vsPar > 0 ? '+' : ''}${entry.vsPar}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pending scores / approval panel */}
        {pendingScores.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 space-y-2">
            <button
              onClick={() => canApprove && setShowApproval(!showApproval)}
              className="w-full flex items-center justify-between"
            >
              <p className="text-yellow-800 text-sm font-semibold">
                {pendingScores.length} pending score{pendingScores.length !== 1 ? 's' : ''} awaiting approval
              </p>
              {canApprove && (
                <span className="text-yellow-600 text-xs font-semibold">
                  {showApproval ? 'Hide' : 'Review'}
                </span>
              )}
            </button>
            {showApproval && canApprove && (
              <div className="space-y-2 mt-2">
                {pendingScores.length > 1 && (
                  <button
                    onClick={async () => {
                      setApprovingId('all')
                      setHoleScores(prev => prev.map(s =>
                        s.scoreStatus === 'pending' && pendingScores.some(ps => ps.id === s.id)
                          ? { ...s, scoreStatus: 'approved' as ScoreStatus }
                          : s
                      ))
                      await Promise.all(pendingScores.map(s =>
                        supabase.rpc('approve_score', { p_score_id: s.id })
                      ))
                      setApprovingId(null)
                    }}
                    disabled={approvingId !== null}
                    className="w-full py-2 bg-green-500 text-white text-sm font-bold rounded-lg active:bg-green-600 disabled:opacity-50"
                  >
                    Approve All ({pendingScores.length})
                  </button>
                )}
                {pendingScores.map(score => {
                  const player = players.find(p => p.id === score.playerId)
                  const h = snapshot?.holes.find(h => h.number === score.holeNumber)
                  const groupNum = groups?.[score.playerId]
                  return (
                    <div key={score.id} className="flex items-center justify-between bg-white rounded-lg p-2.5">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {player?.name ?? 'Unknown'}
                          {groupNum && groupNumbers.length > 1 && (
                            <span className="ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500">G{groupNum}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          Hole {score.holeNumber} · Par {h?.par ?? '?'} · Shot {score.grossScore}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={async () => {
                            setApprovingId(score.id)
                            setHoleScores(prev => prev.map(s => s.id === score.id ? { ...s, scoreStatus: 'approved' as ScoreStatus } : s))
                            await supabase.rpc('approve_score', { p_score_id: score.id })
                            setApprovingId(null)
                          }}
                          disabled={approvingId !== null}
                          className="px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg active:bg-green-600 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={async () => {
                            setApprovingId(score.id)
                            setHoleScores(prev => prev.map(s => s.id === score.id ? { ...s, scoreStatus: 'rejected' as ScoreStatus } : s))
                            await supabase.rpc('reject_score', { p_score_id: score.id })
                            setApprovingId(null)
                          }}
                          disabled={approvingId !== null}
                          className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg active:bg-red-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Game info */}
        {game && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Game</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {game.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} · {fmtAmount(game.buyInCents, game.stakesMode)}/player · Pot {fmtAmount(game.buyInCents * players.length, game.stakesMode)}
            </p>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 safe-bottom">
        <div className="max-w-2xl mx-auto">
          <button onClick={onBack} className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl active:bg-gray-900">← Back to Scorecard</button>
        </div>
      </div>
    </div>
  )
}
