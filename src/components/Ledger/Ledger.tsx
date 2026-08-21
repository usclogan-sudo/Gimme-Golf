import { useEffect, useState, useMemo } from 'react'
import { supabase, rowToSettlementRecord, rowToRound } from '../../lib/supabase'
import { safeWrite } from '../../lib/safeWrite'
import { PaymentButtons } from '../PaymentButtons'
import { ConfirmModal } from '../ConfirmModal'
import { fmtAmount } from '../../lib/gameLogic'
import type { SettlementRecord, Round, Player } from '../../types'

interface Props {
  userId: string
  onBack: () => void
}

interface OpponentBalance {
  playerId: string
  playerName: string
  /** Positive = they owe you, negative = you owe them */
  netCents: number
  /** Breakdown per round */
  rounds: {
    roundId: string
    courseName: string
    date: string
    amountCents: number // positive = they owe you
    settlements: SettlementRecord[]
  }[]
  /** Player snapshot for payment buttons */
  player: Player | null
}

type FilterMode = 'all' | 'season' | 'custom'

export function Ledger({ userId, onBack }: Props) {
  const [loading, setLoading] = useState(true)
  const [allSettlements, setAllSettlements] = useState<SettlementRecord[]>([])
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [userPlayerIds, setUserPlayerIds] = useState<Set<string>>(new Set())
  const [playerMap, setPlayerMap] = useState<Map<string, Player>>(new Map())
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null)
  const [markingSettled, setMarkingSettled] = useState<string | null>(null)
  const [confirmSettleModal, setConfirmSettleModal] = useState<{ opponentId: string; opponentName: string; count: number } | null>(null)

  // Filter state
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showSettled, setShowSettled] = useState(false)

  useEffect(() => {
    loadLedger()
  }, [])

  async function loadLedger() {
    setLoading(true)

    const [roundsRes, partRes] = await Promise.all([
      supabase.from('rounds').select('*').eq('status', 'complete'),
      supabase.from('round_participants').select('player_id').eq('user_id', userId).eq('status', 'accepted'),
    ])

    const rounds = (roundsRes.data ?? []).map(rowToRound)
    const roundIds = rounds.map(r => r.id)

    // Scope settlements to user's rounds only
    let settlements: SettlementRecord[] = []
    if (roundIds.length > 0) {
      const { data } = await supabase.from('settlements').select('*').in('round_id', roundIds)
      settlements = (data ?? []).map(rowToSettlementRecord)
    }

    const pMap = new Map<string, Player>()
    for (const r of rounds) {
      for (const p of r.players ?? []) {
        pMap.set(p.id, p)
      }
    }

    const upIds = new Set<string>()
    upIds.add(userId)
    if (partRes.data) {
      for (const p of partRes.data) upIds.add(p.player_id)
    }

    setAllSettlements(settlements)
    setAllRounds(rounds)
    setPlayerMap(pMap)
    setUserPlayerIds(upIds)
    setLoading(false)
  }

  // Compute filtered balances from raw data + filter state
  const balances = useMemo(() => {
    if (loading) return []

    // Filter rounds by date range
    const roundMap = new Map<string, Round>()
    for (const r of allRounds) {
      const roundDate = new Date(r.date)
      if (filterMode === 'season') {
        if (roundDate.getFullYear() !== seasonYear) continue
      } else if (filterMode === 'custom') {
        if (customFrom && roundDate < new Date(customFrom)) continue
        if (customTo && roundDate > new Date(customTo + 'T23:59:59')) continue
      }
      roundMap.set(r.id, r)
    }

    // Aggregate by opponent
    const opponentMap = new Map<string, { netCents: number; rounds: Map<string, { amountCents: number; settlements: SettlementRecord[] }> }>()

    for (const s of allSettlements) {
      const round = roundMap.get(s.roundId)
      if (!round) continue

      const isFrom = userPlayerIds.has(s.fromPlayerId)
      const isTo = userPlayerIds.has(s.toPlayerId)
      if (!isFrom && !isTo) continue
      if (isFrom && isTo) continue

      const opponentId = isFrom ? s.toPlayerId : s.fromPlayerId
      const sign = isTo ? 1 : -1
      const amount = s.status === 'paid' ? 0 : sign * s.amountCents

      if (!opponentMap.has(opponentId)) {
        opponentMap.set(opponentId, { netCents: 0, rounds: new Map() })
      }
      const opp = opponentMap.get(opponentId)!
      opp.netCents += amount

      const roundKey = s.roundId
      if (!opp.rounds.has(roundKey)) {
        opp.rounds.set(roundKey, { amountCents: 0, settlements: [] })
      }
      const roundEntry = opp.rounds.get(roundKey)!
      roundEntry.amountCents += amount
      roundEntry.settlements.push(s)
    }

    const result: OpponentBalance[] = []
    for (const [oppId, data] of opponentMap) {
      const player = playerMap.get(oppId) ?? null
      const playerName = player?.name ?? oppId.slice(0, 8)

      const roundEntries = Array.from(data.rounds.entries()).map(([roundId, entry]) => {
        const round = roundMap.get(roundId)
        return {
          roundId,
          courseName: round?.courseSnapshot?.courseName ?? 'Unknown course',
          date: round?.date ? new Date(round.date).toLocaleDateString() : '—',
          amountCents: entry.amountCents,
          settlements: entry.settlements,
        }
      }).sort((a, b) => b.date.localeCompare(a.date))

      result.push({
        playerId: oppId,
        playerName,
        netCents: data.netCents,
        rounds: roundEntries,
        player,
      })
    }

    result.sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents))
    return showSettled ? result : result.filter(b => b.netCents !== 0)
  }, [loading, allSettlements, allRounds, userPlayerIds, playerMap, filterMode, seasonYear, customFrom, customTo, showSettled])

  const markAllSettled = async (opponentId: string) => {
    setMarkingSettled(opponentId)
    const opponent = balances.find(b => b.playerId === opponentId)
    if (!opponent) return

    const settlementIds: string[] = []
    for (const r of opponent.rounds) {
      for (const s of r.settlements) {
        if (s.status === 'owed') settlementIds.push(s.id)
      }
    }

    if (settlementIds.length > 0) {
      await safeWrite(supabase.from('settlements').update({ status: 'paid', paid_at: new Date().toISOString() }).in('id', settlementIds), 'mark settlements paid')
    }

    await loadLedger()
    setMarkingSettled(null)
  }

  const totalOwedToYou = balances.filter(b => b.netCents > 0).reduce((s, b) => s + b.netCents, 0)
  const totalYouOwe = balances.filter(b => b.netCents < 0).reduce((s, b) => s + Math.abs(b.netCents), 0)

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      <header className="app-header text-white px-4 py-5 sticky top-0 z-10 shadow-xl">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl">←</button>
          <div>
            <h1 className="text-2xl font-bold">Ledger</h1>
            <p className="text-gray-300 text-sm">Cross-round balances</p>
          </div>
        </div>
      </header>

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        {/* Filter bar */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            {(['all', 'season', 'custom'] as FilterMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`flex-1 h-9 text-sm font-semibold rounded-xl transition-colors ${
                  filterMode === mode
                    ? 'bg-amber-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 active:bg-gray-200'
                }`}
              >
                {mode === 'all' ? 'All Time' : mode === 'season' ? 'Season' : 'Custom'}
              </button>
            ))}
          </div>
          {filterMode === 'season' && (
            <select
              value={seasonYear}
              onChange={e => setSeasonYear(Number(e.target.value))}
              className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 text-sm text-gray-800 dark:text-gray-200"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y} Season</option>
              ))}
            </select>
          )}
          {filterMode === 'custom' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-semibold uppercase">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 text-sm text-gray-800 dark:text-gray-200"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-semibold uppercase">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 text-sm text-gray-800 dark:text-gray-200"
                />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showSettled}
              onChange={e => setShowSettled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Show settled (zero-balance) opponents</span>
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : balances.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-8 text-center">
            <p className="text-3xl mb-2">🤝</p>
            <p className="font-semibold text-gray-800 dark:text-gray-100">All square!</p>
            <p className="text-sm text-gray-500 mt-1">
              {filterMode === 'all' ? 'No outstanding balances across your rounds.' : 'No balances for the selected period.'}
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 text-center">
                <p className="text-xs text-amber-600 dark:text-brass font-semibold uppercase">Owed to you</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-brass">{fmtAmount(totalOwedToYou, 'points')}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-2xl p-4 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase">You owe</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{fmtAmount(totalYouOwe, 'points')}</p>
              </div>
            </div>

            {/* Opponent list */}
            <div className="space-y-3">
              {balances.map(b => {
                const isExpanded = expandedOpponent === b.playerId
                const owedToYou = b.netCents > 0
                const isZero = b.netCents === 0
                return (
                  <div key={b.playerId} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpandedOpponent(isExpanded ? null : b.playerId)}
                      className="w-full p-4 flex items-center justify-between active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
                    >
                      <div className="text-left">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{b.playerName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{b.rounds.length} round{b.rounds.length !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          {isZero ? (
                            <p className="text-lg font-bold text-gray-400">0 pts</p>
                          ) : (
                            <>
                              <p className={`text-lg font-bold ${owedToYou ? 'text-amber-600 dark:text-brass' : 'text-gray-700 dark:text-gray-200'}`}>
                                {owedToYou ? '+' : '-'}{fmtAmount(Math.abs(b.netCents), 'points')}
                              </p>
                              <p className={`text-xs ${owedToYou ? 'text-amber-500 dark:text-brass/70' : 'text-gray-400 dark:text-gray-500'}`}>
                                {owedToYou ? 'they owe you' : 'you owe'}
                              </p>
                            </>
                          )}
                        </div>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 space-y-3">
                        {/* Round breakdown */}
                        <div className="pt-3 space-y-2">
                          {b.rounds.map(r => (
                            <div key={r.roundId} className={`flex items-center justify-between p-3 rounded-xl ${r.amountCents > 0 ? 'bg-amber-50 dark:bg-amber-900/10' : r.amountCents < 0 ? 'bg-gray-50 dark:bg-gray-700/40' : 'bg-gray-50 dark:bg-gray-700'}`}>
                              <div>
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.courseName}</p>
                                <p className="text-xs text-gray-500">{r.date}</p>
                              </div>
                              <p className={`font-bold text-sm ${r.amountCents > 0 ? 'text-amber-600 dark:text-brass' : r.amountCents < 0 ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400'}`}>
                                {r.amountCents > 0 ? '+' : ''}{fmtAmount(r.amountCents === 0 ? 0 : Math.abs(r.amountCents), 'points')}
                                {r.amountCents < 0 && <span className="text-xs font-normal ml-0.5">owed</span>}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Payment buttons if you owe them */}
                        {!owedToYou && !isZero && b.player && (
                          <div>
                            <p className="text-xs text-gray-500 mb-2">Pay {b.playerName}</p>
                            {/* Ledger balances are in points (1 pt = $1); ×100 → cents for the payment link. */}
                            <PaymentButtons toPlayer={b.player} amountCents={Math.abs(b.netCents) * 100} note="Golf ledger balance" />
                          </div>
                        )}

                        {/* Mark all settled */}
                        {!isZero && (
                          <button
                            onClick={() => {
                              const owedCount = b.rounds.reduce((sum, r) => sum + r.settlements.filter(s => s.status === 'owed').length, 0)
                              setConfirmSettleModal({ opponentId: b.playerId, opponentName: b.playerName, count: owedCount })
                            }}
                            disabled={markingSettled === b.playerId}
                            className="w-full h-12 bg-gray-800 dark:bg-gray-600 text-white font-semibold rounded-xl active:bg-gray-900 disabled:opacity-50 transition-colors"
                          >
                            {markingSettled === b.playerId ? 'Settling...' : 'Mark All Settled'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={!!confirmSettleModal}
        title="Mark All Settled?"
        message={confirmSettleModal ? `Mark ${confirmSettleModal.count} settlement${confirmSettleModal.count !== 1 ? 's' : ''} with ${confirmSettleModal.opponentName} as paid? This cannot be undone.` : ''}
        confirmLabel="Mark All Paid"
        destructive
        onConfirm={() => {
          if (confirmSettleModal) markAllSettled(confirmSettleModal.opponentId)
          setConfirmSettleModal(null)
        }}
        onCancel={() => setConfirmSettleModal(null)}
      />
    </div>
  )
}
