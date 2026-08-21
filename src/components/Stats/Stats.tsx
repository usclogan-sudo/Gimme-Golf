import { useEffect, useState } from 'react'
import { ScoringDistribution } from '../ScoringDistribution'
import { supabase, rowToRound, rowToHoleScore, rowToRoundPlayer, rowToJunkRecord, rowToSideBet } from '../../lib/supabase'
import { computeRoundPlayerNets } from '../../lib/roundNet'
import { makePlayableSnapshot, roundToHolesConfig } from '../../lib/holeUtils'
import type { Round, HoleScore, RoundPlayer, Player, CourseSnapshot, BBBPoint, JunkRecord, SideBet } from '../../types'

interface Props {
  userId: string
  onBack: () => void
}

interface PlayerStats {
  id: string
  name: string
  roundsPlayed: number
  roundsWithGame: number
  totalGross: number
  bestGross: number | null
  totalWinningsCents: number
  roundsWon: number
}

interface ScoreDistribution {
  eagles: number
  birdies: number
  pars: number
  bogeys: number
  doubles: number
  worse: number
}

export function Stats({ userId, onBack }: Props) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PlayerStats[]>([])
  const [totalRounds, setTotalRounds] = useState(0)
  const [scoreDist, setScoreDist] = useState<ScoreDistribution>({ eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, worse: 0 })
  const [mostPlayedCourse, setMostPlayedCourse] = useState('')

  useEffect(() => {
    loadStats()
  }, [userId])

  const loadStats = async () => {
    // Bound to the most recent 300 completed rounds — keeps the stats payload
    // sane for power users while covering a casual golfer's full history.
    const { data: roundRows, error: roundError } = await supabase
      .from('rounds')
      .select('*')
      .eq('status', 'complete')
      .order('date', { ascending: false })
      .limit(300)

    if (roundError) {
      setLoading(false)
      return
    }

    if (!roundRows || roundRows.length === 0) {
      setLoading(false)
      return
    }

    const rounds: Round[] = roundRows.map(rowToRound)
    setTotalRounds(rounds.length)

    const roundIds = rounds.map(r => r.id)

    const [scoresRes, rpRes, bbbRes, junkRes, sbRes, partRes] = await Promise.all([
      supabase.from('hole_scores').select('*').in('round_id', roundIds),
      supabase.from('round_players').select('*').in('round_id', roundIds),
      supabase.from('bbb_points').select('*').in('round_id', roundIds),
      supabase.from('junk_records').select('*').in('round_id', roundIds),
      supabase.from('side_bets').select('*').in('round_id', roundIds),
      supabase.from('round_participants').select('round_id, player_id, user_id').eq('user_id', userId).eq('status', 'accepted'),
    ])

    const allScores: HoleScore[] = (scoresRes.data ?? []).map(rowToHoleScore)
    const allRoundPlayers: RoundPlayer[] = (rpRes.data ?? []).map(rowToRoundPlayer)
    const allBbbPoints: BBBPoint[] = (bbbRes.data ?? []).map((r: any) => ({
      id: r.id, roundId: r.round_id, holeNumber: r.hole_number,
      bingo: r.bingo, bango: r.bango, bongo: r.bongo,
    }))
    const allJunkRecords: JunkRecord[] = (junkRes.data ?? []).map(rowToJunkRecord)
    const allSideBets: SideBet[] = (sbRes.data ?? []).map(rowToSideBet)
    // round_id → the current user's player id in that round (for their distribution).
    const partMap = new Map<string, string>()
    for (const p of (partRes.data ?? [])) partMap.set(p.round_id, p.player_id)

    const playerMap = new Map<string, { name: string; roundsPlayed: number; roundsWithGame: number; grossTotals: number[]; winningsCents: number; roundsWon: number }>()
    const dist: ScoreDistribution = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, worse: 0 }
    const courseCounts = new Map<string, number>()

    for (const round of rounds) {
      const players: Player[] = round.players ?? []
      const snapshot: CourseSnapshot | undefined = round.courseSnapshot
      if (!players.length || !snapshot) continue

      const pSnap = makePlayableSnapshot(snapshot, roundToHolesConfig(round))
      const roundScores = allScores.filter(s => s.roundId === round.id)
      const roundPlayers = allRoundPlayers.filter(rp => rp.roundId === round.id)

      // Which player is the current user this round (for their own distribution).
      let myId = players.find(p => p.id === userId)?.id
      if (!myId) myId = partMap.get(round.id)

      // ONE shared net computation for the whole round — the same helper My Stats
      // uses, so the two screens agree across all 11 game types (not just 5).
      const { netByPlayer, hasGame } = computeRoundPlayerNets({
        round,
        roundScores,
        roundPlayers,
        bbbPoints: allBbbPoints.filter(b => b.roundId === round.id),
        junkRecords: allJunkRecords.filter(jr => jr.roundId === round.id),
        sideBets: allSideBets.filter(sb => sb.roundId === round.id),
      })

      for (const player of players) {
        const pScores = roundScores.filter(s => s.playerId === player.id)
        const gross = pScores.reduce((s, sc) => s + sc.grossScore, 0)

        if (!playerMap.has(player.id)) {
          playerMap.set(player.id, { name: player.name, roundsPlayed: 0, roundsWithGame: 0, grossTotals: [], winningsCents: 0, roundsWon: 0 })
        }
        const entry = playerMap.get(player.id)!
        entry.roundsPlayed++
        if (pScores.length >= pSnap.holes.length) {
          entry.grossTotals.push(gross)
        }
        // Net + win rate: identical definition to My Stats (games contested; a win
        // is coming out ahead on the round).
        entry.winningsCents += netByPlayer[player.id] ?? 0
        if (hasGame) {
          entry.roundsWithGame++
          if ((netByPlayer[player.id] ?? 0) > 0) entry.roundsWon++
        }

        // Scoring distribution — the current user's holes only, matching My Stats.
        if (player.id === myId) {
          for (const sc of pScores) {
            const hole = pSnap.holes.find(h => h.number === sc.holeNumber)
            if (!hole) continue
            const diff = sc.grossScore - hole.par
            if (sc.grossScore === 1 || diff <= -2) dist.eagles++
            else if (diff === -1) dist.birdies++
            else if (diff === 0) dist.pars++
            else if (diff === 1) dist.bogeys++
            else if (diff === 2) dist.doubles++
            else dist.worse++
          }
        }
      }

      if (snapshot.courseName) {
        courseCounts.set(snapshot.courseName, (courseCounts.get(snapshot.courseName) ?? 0) + 1)
      }
    }

    setScoreDist(dist)
    let maxCount = 0
    let topCourse = ''
    for (const [name, count] of courseCounts) {
      if (count > maxCount) { maxCount = count; topCourse = name }
    }
    setMostPlayedCourse(topCourse)

    const statsArr: PlayerStats[] = Array.from(playerMap.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      roundsPlayed: data.roundsPlayed,
      roundsWithGame: data.roundsWithGame,
      totalGross: data.grossTotals.length > 0
        ? Math.round(data.grossTotals.reduce((a, b) => a + b, 0) / data.grossTotals.length)
        : 0,
      bestGross: data.grossTotals.length > 0
        ? Math.min(...data.grossTotals)
        : null,
      totalWinningsCents: data.winningsCents,
      roundsWon: data.roundsWon,
    }))

    statsArr.sort((a, b) => b.totalWinningsCents - a.totalWinningsCents)
    setStats(statsArr)
    setLoading(false)
  }

  // Points only — winnings totals are aggregated point values (1 pt = $1).
  const fmtPts = (value: number) => {
    const abs = Math.abs(value)
    const str = `${abs} pts`
    return value < 0 ? `-${str}` : `+${str}`
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
        <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-600 text-xl" aria-label="Back">←</button>
        <h1 className="text-xl font-bold">Leaderboard</h1>
      </header>

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-gray-500 font-medium">No completed rounds yet</p>
            <p className="text-gray-400 text-sm mt-1">Stats will appear after your first round</p>
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 flex gap-3">
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-display">{totalRounds}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Rounds</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 font-display">{stats.length}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Players</p>
              </div>
              {mostPlayedCourse && (
                <div className="flex-1 text-center">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 font-display truncate">{mostPlayedCourse}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Top Course</p>
                </div>
              )}
            </div>

            <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
              <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Your Scoring Distribution</h2>
              <ScoringDistribution {...scoreDist} />
            </section>

            <section>
              {/* Reset lives in Settings → Manage data only — never one tap from
                  browsing standings. (UX v2.1 §17) */}
              <div className="mb-3">
                <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base">Lifetime Standings</h2>
              </div>
              <div className="space-y-2">
                {stats.map((player, i) => (
                  <div key={player.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm font-display ${
                        i === 0 ? 'bg-yellow-400 text-yellow-900' :
                        i === 1 ? 'bg-gray-300 text-gray-700' :
                        i === 2 ? 'bg-amber-600 text-amber-100' :
                        'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{player.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {player.roundsPlayed} round{player.roundsPlayed !== 1 ? 's' : ''}
                          {player.totalGross > 0 && ` · Avg ${player.totalGross}`}
                          {player.bestGross && ` · Best ${player.bestGross}`}
                          {player.roundsWithGame > 0 && ` · ${Math.round((player.roundsWon / player.roundsWithGame) * 100)}% win`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold font-display text-lg ${
                          player.totalWinningsCents > 0 ? 'text-amber-600 dark:text-brass' :
                          'text-gray-500 dark:text-gray-400'
                        }`}>
                          {player.totalWinningsCents === 0 ? '0 pts' : fmtPts(player.totalWinningsCents)}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">net</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
