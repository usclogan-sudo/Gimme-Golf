import { useEffect, useState } from 'react'
import { ScoringDistribution } from '../ScoringDistribution'
import { supabase, rowToRound, rowToHoleScore, rowToRoundPlayer, rowToJunkRecord, rowToBBBPoint, rowToSideBet } from '../../lib/supabase'
import {
  buildCourseHandicaps,
  calculateSkins, calculateSkinsPayouts,
  calculateBestBall, calculateBestBallPayouts,
  calculateNassau, calculateNassauPayouts,
  calculateWolf, calculateWolfPayouts,
  calculateBBB, calculateBBBPayouts,
  calculateJunks,
} from '../../lib/gameLogic'
import { makePlayableSnapshot, roundToHolesConfig } from '../../lib/holeUtils'
import type {
  Round, HoleScore, RoundPlayer, Player,
  SkinsConfig, BestBallConfig, NassauConfig, WolfConfig,
  BBBPoint, JunkRecord, SideBet, GameType,
} from '../../types'

const GAME_LABELS: Record<GameType, string> = {
  skins: '⛳ Skins',
  best_ball: '🤝 Best Ball',
  nassau: '🏳️ Nassau',
  wolf: '🐺 Wolf',
  bingo_bango_bongo: '⭐ BBB',
  hammer: '🔨 Hammer',
  vegas: 'Vegas',
  stableford: '📊 Stableford',
  dots: '🔴 Dots',
  banker: '🏦 Banker',
  quota: '📋 Quota',
}

function fmtSigned(cents: number): string {
  const abs = Math.abs(cents)
  const str = `${abs} pts`
  // Gimme surfaces points only — never a currency symbol. The zero case used to
  // return a literal '$0', which leaked a dollar sign into a points-mode UI
  // (surfaced as "$0" on My Stats → Game Breakdown → Nassau). (UX v2.1 §13)
  return cents < 0 ? `-${str}` : cents > 0 ? `+${str}` : '0 pts'
}

interface DashboardData {
  netWinnings: number
  scoringAvg: number | null
  bestRound: { gross: number; course: string } | null
  winRate: number
  totalRounds: number
  scoreDist: { eagles: number; birdies: number; pars: number; bogeys: number; doubles: number; worse: number }
  gameBreakdown: { type: GameType; rounds: number; wins: number; netCents: number }[]
  h2h: { id: string; name: string; wins: number; losses: number; ties: number; netCents: number; rounds: number }[]
  monthly: { month: string; avg: number }[]
  recent: { course: string; date: Date; gross: number; vsPar: number | null; netCents: number }[]
}

function MonthlyChart({ data }: { data: { month: string; avg: number }[] }) {
  if (data.length < 2) return null

  const W = 320, H = 160, PX = 40, PY = 20, PB = 30
  const vals = data.map(d => d.avg)
  const minY = Math.floor(Math.min(...vals) - 2)
  const maxY = Math.ceil(Math.max(...vals) + 2)
  const rY = maxY - minY || 1

  const xS = (i: number) => PX + (i / (data.length - 1)) * (W - PX - 10)
  const yS = (v: number) => PY + (1 - (v - minY) / rY) * (H - PY - PB)

  const pts = data.map((d, i) => ({ x: xS(i), y: yS(d.avg) }))
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ')

  const yTicks: number[] = []
  const step = rY <= 6 ? 1 : rY <= 12 ? 2 : Math.ceil(rY / 4)
  for (let v = Math.ceil(minY / step) * step; v <= maxY; v += step) yTicks.push(v)

  const fmtM = (m: string) => {
    const [y, mo] = m.split('-')
    return new Date(+y, +mo - 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }
  const xLabels = [
    { i: 0, label: fmtM(data[0].month) },
    ...(data.length > 2 ? [{ i: Math.floor(data.length / 2), label: fmtM(data[Math.floor(data.length / 2)].month) }] : []),
    { i: data.length - 1, label: fmtM(data[data.length - 1].month) },
  ]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PX} y1={yS(v)} x2={W - 10} y2={yS(v)} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={0.5} />
          <text x={PX - 6} y={yS(v) + 4} textAnchor="end" className="text-gray-400 dark:text-gray-500" fontSize={10} fill="currentColor">{v}</text>
        </g>
      ))}
      <polyline points={poly} fill="none" stroke="#d97706" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={`${pts[0].x},${H - PB} ${poly} ${pts[pts.length - 1].x},${H - PB}`} fill="url(#pdGrad)" opacity={0.15} />
      <defs>
        <linearGradient id="pdGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
        </linearGradient>
      </defs>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4 : 2.5} fill={i === pts.length - 1 ? '#d97706' : '#fbbf24'} stroke="#fff" strokeWidth={1} />
      ))}
      <text x={pts[pts.length - 1].x} y={pts[pts.length - 1].y - 10} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#d97706">
        {data[data.length - 1].avg.toFixed(1)}
      </text>
      {xLabels.map(({ i, label }) => (
        <text key={i} x={xS(i)} y={H - 5} textAnchor="middle" className="text-gray-400 dark:text-gray-500" fontSize={9} fill="currentColor">{label}</text>
      ))}
    </svg>
  )
}

export function PersonalDashboard({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadData() }, [userId])

  async function loadData() {
    setError(null)
    // Bound the dashboard to the most recent 300 completed rounds. Casual golfers
    // play ~50/yr, so 300 covers 6+ years; power users see recent history first
    // and avoid pulling thousands of rows.
    const { data: roundRows, error: roundError } = await supabase
      .from('rounds').select('*').eq('status', 'complete')
      .order('date', { ascending: false }).limit(300)
    if (roundError) { setError('Failed to load stats. Tap to retry.'); setLoading(false); return }
    if (!roundRows?.length) { setLoading(false); return }

    const rounds: Round[] = roundRows.map(rowToRound)
    const roundIds = rounds.map(r => r.id)

    const [scoresRes, rpRes, bbbRes, junkRes, sbRes, partRes] = await Promise.all([
      supabase.from('hole_scores').select('*').in('round_id', roundIds),
      supabase.from('round_players').select('*').in('round_id', roundIds),
      supabase.from('bbb_points').select('*').in('round_id', roundIds),
      supabase.from('junk_records').select('*').in('round_id', roundIds),
      supabase.from('side_bets').select('*').in('round_id', roundIds),
      supabase.from('round_participants').select('*').eq('user_id', userId).eq('status', 'accepted'),
    ])

    const allScores: HoleScore[] = (scoresRes.data ?? []).map(rowToHoleScore)
    const allRP: RoundPlayer[] = (rpRes.data ?? []).map(rowToRoundPlayer)
    const allBbb: BBBPoint[] = (bbbRes.data ?? []).map(rowToBBBPoint)
    const allJunks: JunkRecord[] = (junkRes.data ?? []).map(rowToJunkRecord)
    const allSB: SideBet[] = (sbRes.data ?? []).map(rowToSideBet)
    const partMap = new Map<string, string>()
    for (const p of (partRes.data ?? [])) partMap.set(p.round_id, p.player_id)

    let netWinnings = 0, totalGross = 0, roundsScored = 0, roundsWon = 0, roundsWithGame = 0, roundsPlayed = 0
    let bestRound: DashboardData['bestRound'] = null
    const dist = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, worse: 0 }
    const gtMap = new Map<GameType, { rounds: number; wins: number; netCents: number }>()
    const h2hMap = new Map<string, { name: string; wins: number; losses: number; ties: number; netCents: number; rounds: number }>()
    const monthMap = new Map<string, { total: number; count: number }>()
    const recent: DashboardData['recent'] = []

    rounds.sort((a, b) => b.date.getTime() - a.date.getTime())

    for (const round of rounds) {
      const players: Player[] = round.players ?? []
      const snap = round.courseSnapshot
      if (!players.length || !snap) continue

      const pSnap = makePlayableSnapshot(snap, roundToHolesConfig(round))

      let myId = players.find(p => p.id === userId)?.id
      if (!myId) myId = partMap.get(round.id)
      if (!myId || !players.find(p => p.id === myId)) continue

      roundsPlayed++
      const rScores = allScores.filter(s => s.roundId === round.id)
      const rPlayers = allRP.filter(rp => rp.roundId === round.id)
      const myScores = rScores.filter(s => s.playerId === myId)
      const gross = myScores.reduce((s, sc) => s + sc.grossScore, 0)
      const complete = myScores.length >= pSnap.holes.length

      if (complete) {
        totalGross += gross
        roundsScored++
        if (!bestRound || gross < bestRound.gross) bestRound = { gross, course: snap.courseName }
        const mk = `${round.date.getFullYear()}-${String(round.date.getMonth() + 1).padStart(2, '0')}`
        const m = monthMap.get(mk) ?? { total: 0, count: 0 }
        m.total += gross; m.count++
        monthMap.set(mk, m)
      }

      // Scoring distribution (user only)
      for (const sc of myScores) {
        const hole = pSnap.holes.find(h => h.number === sc.holeNumber)
        if (!hole) continue
        const d = sc.grossScore - hole.par
        if (sc.grossScore === 1 || d <= -2) dist.eagles++
        else if (d === -1) dist.birdies++
        else if (d === 0) dist.pars++
        else if (d === 1) dist.bogeys++
        else if (d === 2) dist.doubles++
        else dist.worse++
      }

      // Compute net winnings per player for this round
      const pNet = new Map<string, number>()
      players.forEach(p => pNet.set(p.id, 0))

      if (round.game && round.game.buyInCents > 0) {
        roundsWithGame++
        const chm = buildCourseHandicaps(players, rPlayers, snap, round.holesMode)
        let payouts: { playerId: string; amountCents: number }[] = []
        try {
          const g = round.game
          if (g.type === 'skins') {
            payouts = calculateSkinsPayouts(calculateSkins(players, rScores, pSnap, g.config as SkinsConfig, chm), g, players.length)
          } else if (g.type === 'best_ball') {
            payouts = calculateBestBallPayouts(calculateBestBall(players, rScores, pSnap, g.config as BestBallConfig, chm), g.config as BestBallConfig, g, players)
          } else if (g.type === 'nassau') {
            payouts = calculateNassauPayouts(calculateNassau(players, rScores, pSnap, g.config as NassauConfig, chm), g, players, rScores, pSnap, chm)
          } else if (g.type === 'wolf') {
            payouts = calculateWolfPayouts(calculateWolf(players, rScores, pSnap, g.config as WolfConfig, chm), g, players)
          } else if (g.type === 'bingo_bango_bongo') {
            payouts = calculateBBBPayouts(calculateBBB(players, allBbb.filter(b => b.roundId === round.id)), g, players)
          }
        } catch { /* skip rounds with calc errors */ }

        const buyIn = round.game.buyInCents
        for (const p of players) {
          const po = payouts.find(x => x.playerId === p.id)
          pNet.set(p.id, (pNet.get(p.id) ?? 0) + (po ? po.amountCents - buyIn : -buyIn))
        }

        // Game type tracking
        const gt = round.game.type
        const e = gtMap.get(gt) ?? { rounds: 0, wins: 0, netCents: 0 }
        e.rounds++
        const myPo = payouts.find(x => x.playerId === myId)
        e.netCents += myPo ? myPo.amountCents - buyIn : -buyIn
        if (myPo && myPo.amountCents > buyIn) { e.wins++; roundsWon++ }
        gtMap.set(gt, e)
      }

      // Junk
      if (round.junkConfig) {
        const rj = allJunks.filter(jr => jr.roundId === round.id)
        if (rj.length > 0) {
          const jr = calculateJunks(players, rj, round.junkConfig)
          for (const p of players) pNet.set(p.id, (pNet.get(p.id) ?? 0) + (jr.netCents[p.id] ?? 0))
        }
      }

      // Side bets
      const rsb = allSB.filter(sb => sb.roundId === round.id && sb.status === 'resolved' && sb.winnerPlayerId)
      for (const sb of rsb) {
        const losers = sb.participants.filter(id => id !== sb.winnerPlayerId)
        if (sb.winnerPlayerId) pNet.set(sb.winnerPlayerId, (pNet.get(sb.winnerPlayerId) ?? 0) + sb.amountCents * losers.length)
        for (const lid of losers) pNet.set(lid, (pNet.get(lid) ?? 0) - sb.amountCents)
      }

      const myNet = pNet.get(myId!) ?? 0
      netWinnings += myNet

      // H2H
      for (const opp of players) {
        if (opp.id === myId) continue
        const entry = h2hMap.get(opp.id) ?? { name: opp.name, wins: 0, losses: 0, ties: 0, netCents: 0, rounds: 0 }
        entry.rounds++
        entry.netCents += myNet
        const oppNet = pNet.get(opp.id) ?? 0
        if (myNet > oppNet) entry.wins++
        else if (myNet < oppNet) entry.losses++
        else entry.ties++
        h2hMap.set(opp.id, entry)
      }

      // Recent form
      if (myScores.length > 0) {
        const par = pSnap.holes.reduce((s, h) => s + h.par, 0)
        recent.push({ course: snap.courseName, date: round.date, gross, vsPar: complete ? gross - par : null, netCents: myNet })
      }
    }

    setData({
      netWinnings,
      scoringAvg: roundsScored > 0 ? Math.round(totalGross / roundsScored * 10) / 10 : null,
      bestRound,
      winRate: roundsWithGame > 0 ? Math.round((roundsWon / roundsWithGame) * 100) : 0,
      totalRounds: roundsPlayed,
      scoreDist: dist,
      gameBreakdown: [...gtMap.entries()].map(([type, s]) => ({ type, ...s })).sort((a, b) => b.rounds - a.rounds),
      h2h: [...h2hMap.entries()].map(([id, d]) => ({ id, ...d })).filter(h => h.rounds >= 2).sort((a, b) => b.rounds - a.rounds).slice(0, 8),
      monthly: [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, { total, count }]) => ({ month, avg: Math.round(total / count * 10) / 10 })),
      recent: recent.slice(0, 5),
    })
    setLoading(false)
  }

  const header = (
    <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
      <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-600 text-xl" aria-label="Back">←</button>
      <h1 className="text-xl font-bold font-display">My Stats</h1>
      {data && <span className="text-gray-400 text-sm ml-auto">{data.totalRounds} round{data.totalRounds !== 1 ? 's' : ''}</span>}
    </header>
  )

  if (loading) return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {header}
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {header}
      <div className="text-center py-16">
        <p className="text-4xl mb-3">⚠️</p>
        <button onClick={() => { setLoading(true); loadData() }} className="text-red-500 font-medium">{error}</button>
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {header}
      <div className="text-center py-16">
        <p className="text-4xl mb-3">📈</p>
        <p className="text-gray-500 dark:text-gray-400 font-medium">No completed rounds yet</p>
        <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Play your first round to see your stats here</p>
        <button onClick={onBack} className="mt-4 text-amber-600 font-semibold text-sm">← Start a Round</button>
      </div>
    </div>
  )

  const distTotal = Object.values(data.scoreDist).reduce((a, b) => a + b, 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      {header}
      <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">

        {/* Hero Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
            <p className={`text-2xl font-bold font-display ${data.netWinnings > 0 ? 'text-green-600' : data.netWinnings < 0 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
              {fmtSigned(data.netWinnings)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Net Result</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{data.scoringAvg ?? '—'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Scoring Avg</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{data.bestRound?.gross ?? '—'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{data.bestRound ? `Best · ${data.bestRound.course}` : 'Best Round'}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
            <p className="text-2xl font-bold font-display text-gray-900 dark:text-gray-100">{data.winRate}%</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Win Rate</p>
          </div>
        </div>

        {/* Scoring Distribution */}
        {distTotal > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Scoring Distribution</h2>
            <ScoringDistribution {...data.scoreDist} />
          </section>
        )}

        {/* Game Type Breakdown */}
        {data.gameBreakdown.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Game Breakdown</h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {data.gameBreakdown.map(g => (
                <div key={g.type} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{GAME_LABELS[g.type] ?? g.type}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{g.rounds} round{g.rounds !== 1 ? 's' : ''} · {g.wins} win{g.wins !== 1 ? 's' : ''}</p>
                  </div>
                  <p className={`font-bold font-display ${g.netCents > 0 ? 'text-green-600' : g.netCents < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {fmtSigned(g.netCents)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Head-to-Head */}
        {data.h2h.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Head-to-Head</h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {data.h2h.map(h => (
                <div key={h.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{h.name}</p>
                    <p className="text-sm">
                      <span className="text-green-600 font-semibold">{h.wins}W</span>
                      <span className="text-gray-400">-</span>
                      <span className="text-red-500 font-semibold">{h.losses}L</span>
                      <span className="text-gray-400">-</span>
                      <span className="text-gray-500 dark:text-gray-400 font-semibold">{h.ties}T</span>
                      <span className="text-gray-400 dark:text-gray-500 ml-1.5">({h.rounds} rounds)</span>
                    </p>
                  </div>
                  <p className={`font-bold font-display ${h.netCents > 0 ? 'text-green-600' : h.netCents < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {fmtSigned(h.netCents)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Monthly Scoring Trend */}
        {data.monthly.length >= 2 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Scoring Trend</h2>
            <MonthlyChart data={data.monthly} />
          </section>
        )}

        {/* Recent Form */}
        {data.recent.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Recent Form</h2>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {data.recent.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{r.course}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{r.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0 ml-3">
                    <span className="text-gray-900 dark:text-gray-100 font-bold font-display">{r.gross}</span>
                    {r.vsPar !== null && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.vsPar < 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                        r.vsPar > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                        'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {r.vsPar > 0 ? `+${r.vsPar}` : r.vsPar === 0 ? 'E' : r.vsPar}
                      </span>
                    )}
                    <span className={`text-sm font-bold ${r.netCents > 0 ? 'text-green-600' : r.netCents < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {fmtSigned(r.netCents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
