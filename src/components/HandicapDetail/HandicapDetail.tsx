import { useEffect, useState, useMemo } from 'react'
import { supabase, rowToRound, rowToHoleScore, rowToRoundPlayer } from '../../lib/supabase'
import { calcScoreDifferential, calcHandicapIndex } from '../../lib/handicap'
import { HandicapChart } from '../HandicapChart'
import { Tooltip } from '../ui/Tooltip'
import type { Round, HoleScore, RoundPlayer, UserProfile } from '../../types'

interface Props {
  userId: string
  userProfile: UserProfile | null
  onBack: () => void
}

interface RoundEntry {
  date: Date
  courseName: string
  gross: number
  par: number
  differential: number | null // null if no tee rating/slope available
  courseRating: number | null
  slopeRating: number | null
}

export function HandicapDetail({ userId, userProfile, onBack }: Props) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [holeScores, setHoleScores] = useState<HoleScore[]>([])
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Handicap calc only needs the recent 20 differentials, so 100 rounds is overkill
    // already; cap to keep the join payload small at scale.
    supabase.from('rounds').select('*').eq('status', 'complete').order('date', { ascending: false }).limit(100)
      .then(async (roundsRes) => {
        if (roundsRes.data) {
          const rounds = roundsRes.data.map(rowToRound)
          setRounds(rounds)
          const roundIds = rounds.map(r => r.id)
          if (roundIds.length > 0) {
            const [scoresRes, rpRes] = await Promise.all([
              supabase.from('hole_scores').select('*').in('round_id', roundIds),
              supabase.from('round_players').select('*').in('round_id', roundIds),
            ])
            if (scoresRes.data) setHoleScores(scoresRes.data.map(rowToHoleScore))
            if (rpRes.data) setRoundPlayers(rpRes.data.map(rowToRoundPlayer))
          }
        }
        setLoading(false)
      })
  }, [userId])

  const roundEntries = useMemo((): RoundEntry[] => {
    const entries: RoundEntry[] = []
    for (const r of rounds) {
      const myScores = holeScores.filter(s => s.roundId === r.id && s.playerId === userId)
      if (myScores.length === 0) continue
      // Only count 18-hole rounds for handicap calculation
      const totalHoles = r.courseSnapshot?.holes.length ?? 18
      if (totalHoles < 18) continue

      const gross = myScores.reduce((sum, s) => sum + s.grossScore, 0)
      const par = r.courseSnapshot?.holes.reduce((s, h) => s + h.par, 0) ?? 72

      // Look up the tee played from round_players → get slope/rating from courseSnapshot.tees
      const rp = roundPlayers.find(p => p.roundId === r.id && p.playerId === userId)
      const teePlayed = rp?.teePlayed
      const teeData = teePlayed
        ? r.courseSnapshot?.tees.find(t => t.name === teePlayed)
        : null

      let differential: number | null = null
      let courseRating: number | null = null
      let slopeRating: number | null = null

      if (teeData && teeData.rating > 0 && teeData.slope > 0) {
        courseRating = teeData.rating
        slopeRating = teeData.slope
        differential = calcScoreDifferential(gross, courseRating, slopeRating)
      }

      entries.push({
        date: r.date,
        courseName: r.courseSnapshot?.courseName ?? 'Unknown',
        gross,
        par,
        differential,
        courseRating,
        slopeRating,
      })
    }
    return entries
  }, [rounds, holeScores, roundPlayers, userId])

  // Differentials for handicap calculation (only rounds with valid tee data)
  const differentials = roundEntries
    .filter((e): e is RoundEntry & { differential: number } => e.differential !== null)
    .map(e => e.differential)

  const handicapResult = calcHandicapIndex(differentials)

  // Which round indices in roundEntries were used in the calculation
  const usedRoundIndices = useMemo(() => {
    if (!handicapResult) return new Set<number>()
    // Map: handicapResult.usedIndices are indices into the `differentials` array.
    // We need to map those back to indices in `roundEntries`.
    const diffRoundMap: number[] = []
    roundEntries.forEach((e, i) => {
      if (e.differential !== null) diffRoundMap.push(i)
    })
    return new Set(handicapResult.usedIndices.map(di => diffRoundMap[di]))
  }, [handicapResult, roundEntries])

  const hasManualOverride = userProfile?.handicapIndex != null
  const displayIndex = hasManualOverride ? userProfile!.handicapIndex! : handicapResult?.index ?? null

  // Historical handicap indices for chart (compute at each step oldest→newest)
  const historicalIndices = useMemo(() => {
    const withDiff = roundEntries
      .filter(e => e.differential !== null)
      .slice()
      .reverse() // oldest first
    const points: { date: Date; index: number }[] = []
    for (let i = 2; i < withDiff.length; i++) {
      const diffs = withDiff.slice(0, i + 1).reverse().map(e => e.differential!)
      const result = calcHandicapIndex(diffs)
      if (result) {
        points.push({ date: withDiff[i].date, index: result.index })
      }
    }
    return points
  }, [roundEntries])

  // Trend indicator
  const trend = useMemo(() => {
    if (historicalIndices.length < 2) return null
    const current = historicalIndices[historicalIndices.length - 1].index
    const compareIdx = Math.max(0, historicalIndices.length - 6) // ~5 rounds ago
    const previous = historicalIndices[compareIdx].index
    const diff = current - previous
    if (Math.abs(diff) < 0.2) return { label: 'Steady', arrow: '→', color: 'text-gray-500' }
    if (diff < 0) return { label: 'Improving', arrow: '↓', color: 'text-green-600' }
    return { label: 'Trending up', arrow: '↑', color: 'text-red-500' }
  }, [historicalIndices])

  const last20 = roundEntries.slice(0, 20)
  const bestRound = roundEntries.length > 0 ? roundEntries.reduce((best, e) => e.gross < best.gross ? e : best) : null
  const worstRound = roundEntries.length > 0 ? roundEntries.reduce((worst, e) => e.gross > worst.gross ? e : worst) : null

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
        <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-800 text-xl" aria-label="Back">←</button>
        <h1 className="text-xl font-bold">Handicap</h1>
      </header>

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        {/* Current Handicap Index */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            <Tooltip term="Handicap Index">{hasManualOverride ? 'Manual Handicap Index' : 'Calculated Handicap Index'}</Tooltip>
          </p>
          <p className="text-5xl font-bold gold-text font-display">
            {displayIndex != null ? displayIndex.toFixed(1) : '—'}
          </p>
          {!hasManualOverride && handicapResult && (
            <p className="text-sm text-gray-500 mt-2">
              Based on {differentials.length} round{differentials.length !== 1 ? 's' : ''}
            </p>
          )}
          {!hasManualOverride && !handicapResult && differentials.length > 0 && (
            <p className="text-sm text-gray-400 mt-2">
              {differentials.length} of 3 rounds needed
            </p>
          )}
          {!hasManualOverride && differentials.length === 0 && roundEntries.length > 0 && (
            <p className="text-sm text-gray-400 mt-2">
              No tee rating/slope data available
            </p>
          )}
          {hasManualOverride && handicapResult && (
            <div className="mt-3 bg-amber-50 rounded-xl px-3 py-2">
              <p className="text-xs text-amber-700">
                Auto-calculated: <span className="font-bold">{handicapResult.index.toFixed(1)}</span> (from {differentials.length} rounds)
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Clear handicap in Settings to use auto-calculated value
              </p>
            </div>
          )}
        </section>

        {/* Handicap Trend Chart */}
        {historicalIndices.length >= 2 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Handicap Trend</p>
            <HandicapChart data={historicalIndices} />
            {trend && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className={`text-lg ${trend.color}`}>{trend.arrow}</span>
                <span className={`text-sm font-semibold ${trend.color}`}>{trend.label}</span>
              </div>
            )}
          </section>
        )}

        {/* Best / Worst */}
        {(bestRound || worstRound) && (
          <div className="grid grid-cols-2 gap-3">
            {bestRound && (
              <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Best Round</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{bestRound.gross}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{bestRound.courseName}</p>
                <p className="text-xs text-gray-400">{bestRound.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
              </section>
            )}
            {worstRound && (
              <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Worst Round</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{worstRound.gross}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{worstRound.courseName}</p>
                <p className="text-xs text-gray-400">{worstRound.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
              </section>
            )}
          </div>
        )}

        {/* Recent Rounds with Differentials */}
        {last20.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Recent Rounds {handicapResult ? `(${handicapResult.usedIndices.length} used for index)` : ''}
            </p>
            <div className="space-y-2">
              {last20.map((entry, i) => {
                const vsPar = entry.gross - entry.par
                const isUsed = usedRoundIndices.has(i)
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-3 rounded-xl ${
                      isUsed ? 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700' : 'bg-gray-50 dark:bg-gray-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">{entry.courseName}</p>
                        {isUsed && (
                          <span className="flex-shrink-0 text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                            USED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{entry.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="font-bold text-gray-800 dark:text-gray-100">{entry.gross}</p>
                      <div className="flex items-center gap-2 justify-end">
                        <p className={`text-xs font-semibold ${vsPar > 0 ? 'text-red-500' : vsPar < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {vsPar > 0 ? '+' : ''}{vsPar}
                        </p>
                        {entry.differential != null && (
                          <Tooltip term="Differential">
                            <p className="text-xs text-gray-500 font-mono">
                              {entry.differential.toFixed(1)}
                            </p>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {roundEntries.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-gray-500 font-medium">No scoring data yet</p>
            <p className="text-gray-400 text-sm mt-1">Complete a round to see your trend</p>
          </div>
        )}
      </div>
    </div>
  )
}
