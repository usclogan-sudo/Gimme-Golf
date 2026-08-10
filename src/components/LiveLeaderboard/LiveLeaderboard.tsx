import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { makePlayableSnapshot } from '../../lib/holeUtils'
import type { CourseSnapshot, Player, RoundPlayer, HoleScore, Game, HolesMode } from '../../types'

interface Props {
  inviteCode: string
  onBack: () => void
}

interface SpectateData {
  id: string
  status: 'setup' | 'active' | 'complete'
  currentHole: number
  courseSnapshot: CourseSnapshot
  players: Player[]
  game?: Game
  holeScores: HoleScore[]
  roundPlayers: RoundPlayer[]
  holesMode?: HolesMode
}

export function LiveLeaderboard({ inviteCode, onBack }: Props) {
  const [data, setData] = useState<SpectateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchData = async () => {
    try {
      // Look up round by invite code using existing RPC
      const { data: roundData, error: rpcError } = await supabase.rpc('get_round_by_invite', {
        p_invite_code: inviteCode.toUpperCase().trim(),
      })
      if (rpcError) throw rpcError
      if (!roundData) throw new Error('Round not found')

      const rd = roundData as any
      const roundId = rd.id

      // Fetch hole scores and round players
      const [hsRes, rpRes] = await Promise.all([
        supabase.rpc('get_scores_by_round', { p_round_id: roundId }).then(res => {
          // Fall back to direct query if RPC doesn't exist
          if (res.error) return supabase.from('hole_scores').select('*').eq('round_id', roundId)
          return res
        }),
        supabase.rpc('get_round_players_by_round', { p_round_id: roundId }).then(res => {
          if (res.error) return supabase.from('round_players').select('*').eq('round_id', roundId)
          return res
        }),
      ])

      const holeScores: HoleScore[] = (hsRes.data ?? []).map((row: any) => ({
        id: row.id,
        roundId: row.round_id ?? roundId,
        playerId: row.player_id,
        holeNumber: row.hole_number,
        grossScore: row.gross_score,
        scoreStatus: row.score_status,
        submittedBy: row.submitted_by,
      }))

      const roundPlayers: RoundPlayer[] = (rpRes.data ?? []).map((row: any) => ({
        id: row.id,
        roundId: row.round_id ?? roundId,
        playerId: row.player_id,
        teePlayed: row.tee_played ?? 'White',
        courseHandicap: row.course_handicap,
        playingHandicap: row.playing_handicap,
      }))

      setData({
        id: roundId,
        status: rd.status ?? 'active',
        currentHole: rd.current_hole ?? 1,
        courseSnapshot: rd.course_snapshot,
        players: rd.players ?? [],
        game: rd.game,
        holeScores,
        roundPlayers,
        holesMode: rd.holes_mode ?? undefined,
      })
      setError(null)
      setLastRefresh(new Date())
    } catch (err: any) {
      setError(err.message ?? 'Failed to load round')
    } finally {
      setLoading(false)
    }
  }

  // Initial load
  useEffect(() => {
    fetchData()
  }, [inviteCode])

  // Poll every 30 seconds while round is active
  useEffect(() => {
    if (!data || data.status === 'complete') return
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [data?.status, inviteCode])

  // Build leaderboard
  const leaderboard = useMemo(() => {
    if (!data) return []
    const snapshot = makePlayableSnapshot(data.courseSnapshot, { holesMode: data.holesMode })
    const holesPlayed = snapshot.holes.length

    return data.players.map(player => {
      const scores = data.holeScores.filter(s => s.playerId === player.id)
      const holesScored = scores.length
      const totalGross = scores.reduce((s, hs) => s + hs.grossScore, 0)
      const parForScored = snapshot.holes
        .filter(h => scores.some(s => s.holeNumber === h.number))
        .reduce((s, h) => s + h.par, 0)
      const toPar = totalGross - parForScored

      // Front/back split
      const half = Math.ceil(holesPlayed / 2)
      const frontScores = scores.filter(s => s.holeNumber <= half)
      const backScores = scores.filter(s => s.holeNumber > half)
      const frontTotal = frontScores.reduce((s, hs) => s + hs.grossScore, 0)
      const backTotal = backScores.reduce((s, hs) => s + hs.grossScore, 0)

      return {
        player,
        holesScored,
        totalGross,
        toPar,
        frontTotal: frontScores.length > 0 ? frontTotal : null,
        backTotal: backScores.length > 0 ? backTotal : null,
      }
    }).sort((a, b) => {
      if (a.holesScored === 0 && b.holesScored === 0) return 0
      if (a.holesScored === 0) return 1
      if (b.holesScored === 0) return -1
      return a.toPar - b.toPar
    })
  }, [data])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Loading leaderboard...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl">←</button>
          <h1 className="text-xl font-bold">Leaderboard</h1>
        </header>
        <div className="px-4 py-8 text-center">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-gray-600 dark:text-gray-400 font-semibold">{error ?? 'Round not found'}</p>
          <button onClick={onBack} className="mt-4 px-6 py-3 bg-gray-800 text-white dark:bg-brass dark:text-navy rounded-xl font-semibold">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const snapshot = makePlayableSnapshot(data.courseSnapshot, { holesMode: data.holesMode })
  const isActive = data.status === 'active'
  const isComplete = data.status === 'complete'
  const gameLabel = data.game ? ({
    skins: '🎰 Skins',
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
  }[data.game.type] ?? data.game.type) : null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <header className="app-header text-white px-4 py-3 sticky top-0 z-10 shadow-xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl">←</button>
            <div>
              <p className="text-xs text-gray-300">{snapshot.courseName}</p>
              <h1 className="text-lg font-bold flex items-center gap-2">
                Leaderboard
                {isActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-green-500/30 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
                {isComplete && (
                  <span className="text-[10px] bg-gray-500/30 px-2 py-0.5 rounded-full">Final</span>
                )}
              </h1>
            </div>
          </div>
          {gameLabel && (
            <span className="text-xs bg-white/10 px-2 py-1 rounded-lg">{gameLabel}</span>
          )}
        </div>
      </header>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-3">
        {/* Hole progress */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase">Through Hole {data.currentHole > 1 ? data.currentHole - 1 : 0} of {snapshot.holes.length}</span>
            <span className="text-[10px] text-gray-400">Updated {lastRefresh.toLocaleTimeString()}</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.max(2, ((data.currentHole - 1) / snapshot.holes.length) * 100)}%` }}
            />
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400">
                <th className="text-left py-2 px-3 font-semibold">#</th>
                <th className="text-left py-2 px-2 font-semibold">Player</th>
                <th className="text-center py-2 px-2 font-semibold">Thru</th>
                <th className="text-center py-2 px-2 font-semibold">To Par</th>
                <th className="text-center py-2 px-2 font-semibold">Front</th>
                <th className="text-center py-2 px-2 font-semibold">Back</th>
                <th className="text-center py-2 px-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, idx) => {
                const toParStr = entry.holesScored === 0
                  ? '—'
                  : entry.toPar === 0
                  ? 'E'
                  : entry.toPar > 0
                  ? `+${entry.toPar}`
                  : `${entry.toPar}`
                const toParColor = entry.toPar < 0
                  ? 'text-red-600'
                  : entry.toPar > 0
                  ? 'text-blue-600'
                  : 'text-gray-700 dark:text-gray-300'
                const isLeader = idx === 0 && entry.holesScored > 0

                return (
                  <tr key={entry.player.id} className={`border-t border-gray-100 dark:border-gray-700 ${isLeader ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                    <td className="py-3 px-3 text-sm font-bold text-gray-400">{entry.holesScored > 0 ? idx + 1 : '—'}</td>
                    <td className="py-3 px-2">
                      <p className={`text-sm font-semibold ${isLeader ? 'text-amber-700' : 'text-gray-800 dark:text-gray-100'}`}>
                        {entry.player.name}
                      </p>
                      <p className="text-[10px] text-gray-400">HCP {entry.player.handicapIndex}</p>
                    </td>
                    <td className="py-3 px-2 text-center text-sm text-gray-600 dark:text-gray-400">{entry.holesScored || '—'}</td>
                    <td className={`py-3 px-2 text-center text-sm font-bold ${toParColor}`}>{toParStr}</td>
                    <td className="py-3 px-2 text-center text-sm text-gray-600 dark:text-gray-400">{entry.frontTotal ?? '—'}</td>
                    <td className="py-3 px-2 text-center text-sm text-gray-600 dark:text-gray-400">{entry.backTotal ?? '—'}</td>
                    <td className="py-3 px-3 text-center text-sm font-bold text-gray-800 dark:text-gray-100">{entry.holesScored > 0 ? entry.totalGross : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Refresh button */}
        <button
          onClick={() => { setLoading(false); fetchData() }}
          className="w-full py-3 bg-white dark:bg-gray-800 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-400 active:bg-gray-100 border border-gray-200 dark:border-gray-700"
        >
          Refresh Leaderboard
        </button>
      </div>
    </div>
  )
}
