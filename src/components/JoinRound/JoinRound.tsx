import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { reportSupabaseError } from '../../lib/sentry'

interface RoundPreview {
  id: string
  courseName: string
  gameType: string
  players: { id: string; name: string }[]
  participants: { id: string; userId: string; playerId: string }[]
  currentHole: number
}

interface EventPreview {
  id: string
  name: string
  roundId: string
  courseName: string
  gameType: string
  players: { id: string; name: string }[]
  groups?: Record<string, number>
  participants: { id: string; userId: string; playerId: string; role: string; groupNumber?: number }[]
  groupScorekeepers: Record<number, string>
  currentHole: number
}

interface Props {
  userId: string
  initialCode?: string
  onJoined: (roundId: string) => void
  onCancel: () => void
}

export function JoinRound({ userId, initialCode, onJoined, onCancel }: Props) {
  const [code, setCode] = useState(initialCode ?? '')
  const [step, setStep] = useState<'code' | 'pick' | 'joined'>(initialCode ? 'code' : 'code')
  const [loading, setLoading] = useState(false)
  const [joinedPlayerId, setJoinedPlayerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<RoundPreview | null>(null)
  const [eventPreview, setEventPreview] = useState<EventPreview | null>(null)
  const [joining, setJoining] = useState(false)

  // Auto-lookup if initialCode provided
  useEffect(() => {
    if (!initialCode) return
    let cancelled = false
    lookupRound(initialCode, () => cancelled)
    return () => { cancelled = true }
  }, [initialCode])

  const lookupRound = async (inviteCode: string, isCancelled?: () => boolean) => {
    const cancelled = () => isCancelled?.() ?? false
    setLoading(true)
    setError(null)
    setPreview(null)
    setEventPreview(null)
    try {
      // Try event lookup first
      const { data: eventData, error: eventErr } = await supabase.rpc('get_event_by_invite', {
        p_invite_code: inviteCode.toUpperCase().trim(),
      })
      if (cancelled()) return

      if (eventData && !eventErr) {
        const ed = eventData as any
        const roundData = ed.round ?? {}
        setEventPreview({
          id: ed.id,
          name: ed.name,
          roundId: roundData.id,
          courseName: roundData.course_snapshot?.courseName ?? 'Unknown Course',
          gameType: roundData.game?.type ?? 'Unknown',
          players: (roundData.players ?? []).map((p: any) => ({ id: p.id, name: p.name })),
          groups: roundData.groups ?? undefined,
          participants: (ed.participants ?? []).map((p: any) => ({
            id: p.id,
            userId: p.user_id,
            playerId: p.player_id,
            role: p.role,
            groupNumber: p.group_number,
          })),
          groupScorekeepers: ed.group_scorekeepers ?? {},
          currentHole: roundData.current_hole ?? 1,
        })
        setStep('pick')
        return
      }

      // Fall back to regular round lookup
      const { data, error: rpcError } = await supabase.rpc('get_round_by_invite', {
        p_invite_code: inviteCode.toUpperCase().trim(),
      })
      if (cancelled()) return
      if (rpcError) throw rpcError
      if (!data) throw new Error('Round not found')

      const roundData = data as any
      setPreview({
        id: roundData.id,
        courseName: roundData.course_snapshot?.courseName ?? 'Unknown Course',
        gameType: roundData.game?.type ?? 'Unknown',
        players: (roundData.players ?? []).map((p: any) => ({ id: p.id, name: p.name })),
        participants: (roundData.participants ?? []).map((p: any) => ({
          id: p.id,
          userId: p.user_id,
          playerId: p.player_id,
        })),
        currentHole: roundData.current_hole ?? 1,
      })
      setStep('pick')
    } catch (err: any) {
      if (cancelled()) return
      const msg: string = err.message ?? ''
      let friendly: string
      if (msg.includes('rate_limit_minute')) {
        friendly = "You're trying invites too fast — wait a minute and try again."
      } else if (msg.includes('rate_limit_hour')) {
        friendly = "Too many invite lookups in the last hour — try again later."
      } else if (msg.includes('not found') || msg.includes('no longer active')) {
        friendly = 'Invalid or expired invite code'
      } else {
        friendly = msg || 'Failed to look up round'
      }
      setError(friendly)
    } finally {
      if (!cancelled()) setLoading(false)
    }
  }

  const handleJoin = async (playerId: string) => {
    if (!preview && !eventPreview) return
    setJoining(true)
    setError(null)
    try {
      if (eventPreview) {
        // Already-joined users skip the info card
        const alreadyClaimed = eventPreview.participants.some((p: any) => p.userId === userId && p.playerId === playerId)
        // Join event
        const { error: rpcError } = await supabase.rpc('join_event', {
          p_invite_code: code.toUpperCase().trim(),
          p_player_id: playerId,
        })
        if (rpcError) throw rpcError
        if (alreadyClaimed) {
          onJoined(eventPreview.roundId)
          return
        }
        // Show info card before going to scorecard
        setJoinedPlayerId(playerId)
        setStep('joined')
      } else if (preview) {
        // Join regular round
        const { error: rpcError } = await supabase.rpc('join_round', {
          p_invite_code: code.toUpperCase().trim(),
          p_player_id: playerId,
        })
        if (rpcError) throw rpcError
        onJoined(preview.id)
      }
    } catch (err: any) {
      // The "already claimed" path is expected user behavior, not an error worth
      // capturing. Everything else is a real Supabase/RPC failure.
      if (!err.message?.includes('already claimed')) {
        reportSupabaseError(err, 'join_round_or_event', {
          mode: eventPreview ? 'event' : 'round',
          inviteCode: code.toUpperCase().trim(),
        })
      }
      setError(err.message?.includes('already claimed')
        ? 'This player is already claimed by another user'
        : err.message ?? 'Failed to join')
      setJoining(false)
    }
  }

  const [playerSearch, setPlayerSearch] = useState('')

  const activePreview = eventPreview ?? preview
  const activePlayers = eventPreview?.players ?? preview?.players ?? []
  const activeParticipants = eventPreview?.participants ?? preview?.participants ?? []

  const isPlayerClaimed = (playerId: string) => {
    return activeParticipants.some((p: any) => p.playerId === playerId && p.userId !== userId)
  }

  const isAlreadyJoined = activeParticipants.some((p: any) => p.userId === userId)

  // Filter by search and sort: own player first → unclaimed alphabetically → claimed alphabetically
  const sortedPlayers = useMemo(() => {
    const filtered = activePlayers.filter(p =>
      p.name.toLowerCase().includes(playerSearch.toLowerCase())
    )
    return filtered.sort((a, b) => {
      const aIsMine = activeParticipants.some((p: any) => p.playerId === a.id && p.userId === userId)
      const bIsMine = activeParticipants.some((p: any) => p.playerId === b.id && p.userId === userId)
      if (aIsMine && !bIsMine) return -1
      if (!aIsMine && bIsMine) return 1

      const aClaimed = isPlayerClaimed(a.id)
      const bClaimed = isPlayerClaimed(b.id)
      if (!aClaimed && bClaimed) return -1
      if (aClaimed && !bClaimed) return 1

      return a.name.localeCompare(b.name)
    })
  }, [activePlayers, playerSearch, activeParticipants, userId])

  const GAME_LABELS: Record<string, string> = {
    skins: 'Skins',
    best_ball: 'Best Ball',
    nassau: 'Nassau',
    wolf: 'Wolf',
    bingo_bango_bongo: 'BBB',
    hammer: 'Hammer',
    vegas: 'Vegas',
    stableford: 'Stableford',
    dots: 'Dots',
    banker: 'Banker',
    quota: 'Quota',
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col">
      <header className="app-header text-white px-4 py-3 shadow-xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold font-display">Join Round</h1>
          <button onClick={onCancel} className="text-gray-300 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-600">
            Cancel
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        {step === 'code' && !preview && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <div className="text-center">
              <p className="text-4xl mb-2">🔗</p>
              <h2 className="font-display font-bold text-xl text-gray-900">Enter Invite Code</h2>
              <p className="text-sm text-gray-500 mt-1">Get the 6-character code from the scoremaster</p>
            </div>

            <input
              type="text"
              maxLength={6}
              placeholder="ABC123"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && code.length === 6 && lookupRound(code)}
              className="w-full h-14 px-4 text-center text-2xl font-mono font-bold tracking-[0.3em] rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
              autoFocus
            />

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button
              onClick={() => lookupRound(code)}
              disabled={code.length !== 6 || loading}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg disabled:opacity-40 active:bg-gray-900 transition-colors"
            >
              {loading ? 'Looking up...' : 'Find Round'}
            </button>
          </div>
        )}

        {step === 'pick' && activePreview && (
          <div className="space-y-4">
            {/* Preview card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                {eventPreview ? 'Event Found' : 'Round Found'}
              </p>
              {eventPreview && (
                <h2 className="font-display font-bold text-xl text-gray-900 dark:text-gray-100 mt-1">{eventPreview.name}</h2>
              )}
              <p className={`${eventPreview ? 'text-gray-600 dark:text-gray-400 text-sm mt-0.5' : 'font-display font-bold text-xl text-gray-900 dark:text-gray-100 mt-1'}`}>
                {eventPreview?.courseName ?? preview?.courseName}
              </p>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span>{GAME_LABELS[(eventPreview?.gameType ?? preview?.gameType) ?? ''] ?? (eventPreview?.gameType ?? preview?.gameType)}</span>
                <span>·</span>
                <span>{activePlayers.length} players</span>
                {eventPreview && eventPreview.groups && (
                  <>
                    <span>·</span>
                    <span>{new Set(Object.values(eventPreview.groups)).size} groups</span>
                  </>
                )}
                <span>·</span>
                <span>Hole {eventPreview?.currentHole ?? preview?.currentHole}</span>
              </div>
            </div>

            {/* Player picker */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-3">
              <h3 className="font-display font-semibold text-gray-800 dark:text-gray-100">Which player are you?</h3>

              {activePlayers.length > 6 && (
                <input
                  type="text"
                  placeholder="Search players..."
                  value={playerSearch}
                  onChange={e => setPlayerSearch(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              )}

              {isAlreadyJoined && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-800 dark:text-green-400">
                  You've already joined! Tap your name to continue.
                </div>
              )}

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <div className="space-y-2">
                {sortedPlayers.map(player => {
                  const claimed = isPlayerClaimed(player.id)
                  const isMine = activeParticipants.some((p: any) => p.playerId === player.id && p.userId === userId)
                  const groupNum = eventPreview?.groups?.[player.id]
                  return (
                    <button
                      key={player.id}
                      onClick={() => handleJoin(player.id)}
                      disabled={claimed || joining}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center justify-between ${
                        isMine
                          ? 'bg-amber-50 border-amber-300 active:bg-amber-100'
                          : claimed
                            ? 'bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed'
                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 active:bg-gray-50'
                      }`}
                    >
                      <div>
                        <p className={`font-semibold ${claimed ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {player.name}
                          {groupNum && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300">G{groupNum}</span>}
                        </p>
                        {claimed && <p className="text-xs text-gray-400">Already claimed</p>}
                        {isMine && <p className="text-xs text-amber-600 font-medium">Your player</p>}
                      </div>
                      {!claimed && (
                        <span className={`text-sm font-semibold ${isMine ? 'text-amber-600' : 'text-gray-400'}`}>
                          {isMine ? 'Continue →' : 'Join as →'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => { setStep('code'); setPreview(null); setError(null) }}
              className="w-full text-center text-sm text-gray-500 py-2"
            >
              ← Enter a different code
            </button>
          </div>
        )}

        {step === 'joined' && eventPreview && joinedPlayerId && (() => {
          const groupNum = eventPreview.groups?.[joinedPlayerId]
          const groupMembers = groupNum
            ? eventPreview.players
                .filter(p => p.id !== joinedPlayerId && eventPreview.groups?.[p.id] === groupNum)
                .map(p => p.name)
            : []
          const scorekeeperPlayerId = groupNum ? eventPreview.groupScorekeepers[groupNum] : undefined
          const scorekeeperName = scorekeeperPlayerId
            ? eventPreview.players.find(p => p.id === scorekeeperPlayerId)?.name
            : undefined
          const isScorekeeper = scorekeeperPlayerId === joinedPlayerId

          return (
            <div className="space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
                <div className="text-center">
                  <p className="text-4xl mb-2">🎉</p>
                  <h2 className="font-display font-bold text-2xl text-gray-900 dark:text-gray-100">You're In!</h2>
                  <p className="text-sm text-gray-500 mt-1">{eventPreview.name}</p>
                </div>

                <div className="space-y-3">
                  {groupNum && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Group</p>
                      <p className="text-lg font-bold text-gray-800 dark:text-gray-100">Group {groupNum}</p>
                      {groupMembers.length > 0 && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{groupMembers.join(', ')}</p>
                      )}
                    </div>
                  )}

                  {scorekeeperName && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Scorekeeper</p>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {isScorekeeper ? 'You are the scorekeeper for this group' : scorekeeperName}
                      </p>
                    </div>
                  )}

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Current Hole</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Hole {eventPreview.currentHole}</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Scoring</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isScorekeeper
                        ? `You are the scorekeeper for Group ${groupNum} — you'll enter scores for all players in your group`
                        : scorekeeperName
                          ? `Your scorekeeper (${scorekeeperName}) will enter your scores`
                          : 'Your scores will be submitted for approval'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onJoined(eventPreview.roundId)}
                  className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg active:bg-gray-900 transition-colors"
                >
                  Start Scoring →
                </button>
              </div>
            </div>
          )
        })()}
      </main>
    </div>
  )
}
