import { fmtAmount, JUNK_LABELS } from '../../lib/gameLogic'
import type { Player, JunkType, JunkRecord, SideBet, JunkConfig } from '../../types'

interface Props {
  currentHole: number
  players: Player[]
  junkConfig: JunkConfig | null
  junkRecords: JunkRecord[]
  sideBets: SideBet[]
  showSideBetForm: boolean
  setShowSideBetForm: (v: boolean) => void
  sideBetDesc: string
  setSideBetDesc: (v: string) => void
  sideBetAmount: string
  setSideBetAmount: (v: string) => void
  sideBetParticipants: string[]
  setSideBetParticipants: (fn: (prev: string[]) => string[]) => void
  toggleJunk: (junkType: JunkType, playerId: string) => void
  createSideBet: () => void
  resolveSideBet: (betId: string, winnerId: string) => void
  cancelSideBet: (betId: string) => void
}

export function HoleBetsPanel({
  currentHole, players, junkConfig, junkRecords, sideBets,
  showSideBetForm, setShowSideBetForm, sideBetDesc, setSideBetDesc,
  sideBetAmount, setSideBetAmount, sideBetParticipants, setSideBetParticipants,
  toggleJunk, createSideBet, resolveSideBet, cancelSideBet,
}: Props) {
  const hasJunks = junkConfig && junkConfig.types.length > 0
  const holeJunks = hasJunks ? junkRecords.filter(jr => jr.holeNumber === currentHole) : []
  const holeBets = sideBets.filter(sb => sb.holeNumber === currentHole && sb.status !== 'cancelled')

  if (!hasJunks && holeBets.length === 0 && !showSideBetForm) {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">🎯 Hole Bets — Hole {currentHole}</p>
          <button
            onClick={() => setShowSideBetForm(true)}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500 text-white active:bg-amber-600"
          >
            + Side Bet
          </button>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">No bets on this hole</p>
      </div>
    )
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-3 space-y-3">
      <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">🎯 Hole Bets — Hole {currentHole}</p>

      {/* Quick Junks Row */}
      {hasJunks && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
            🎲 Junks <span className="text-indigo-400 font-normal">{fmtAmount(junkConfig!.valueCents)}/junk</span>
          </p>
          {junkConfig!.types.map(jt => {
            const info = JUNK_LABELS[jt]
            const isSnake = jt === 'snake'
            return (
              <div key={jt} className="space-y-1">
                <p className={`text-xs font-semibold ${isSnake ? 'text-red-600' : 'text-indigo-700 dark:text-indigo-300'}`}>
                  {info.emoji} {info.name} — {info.description}
                </p>
                {/* 44px targets in a two-column grid on phones, matching the BBB awards.
                  Same defect, same reasoning: these were 26px chips with 6px gaps,
                  tapped repeatedly per hole on a phone outdoors, and a mis-tap
                  silently awards a dot to the wrong player. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {players.map(p => {
                    const active = holeJunks.some(jr => jr.playerId === p.id && jr.junkType === jt)
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleJunk(jt, p.id)}
                        aria-pressed={active}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold leading-tight transition-colors ${
                          active
                            ? isSnake ? 'bg-red-500 text-white' : 'bg-indigo-500 text-white'
                            : 'bg-white dark:bg-gray-700 border border-indigo-200 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300'
                        }`}
                      >
                        {p.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Divider between junks and side bets */}
      {hasJunks && (holeBets.length > 0 || showSideBetForm) && (
        <div className="border-t border-amber-200 dark:border-amber-600" />
      )}

      {/* Side Bets List */}
      {holeBets.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">💰 Side Bets</p>
          {holeBets.map(bet => {
            const participantNames = bet.participants.map(id => players.find(p => p.id === id)?.name ?? '?')
            const winnerName = bet.winnerPlayerId ? players.find(p => p.id === bet.winnerPlayerId)?.name : null
            return (
              <div key={bet.id} className={`rounded-lg p-2.5 ${bet.status === 'resolved' ? 'bg-green-50 dark:bg-green-900/30' : 'bg-white dark:bg-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{bet.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {fmtAmount(bet.amountCents)} · {participantNames.join(' vs ')}
                    </p>
                  </div>
                  {bet.status === 'resolved' && winnerName && (
                    <span className="text-xs font-bold text-green-700 dark:text-green-400">🏆 {winnerName}</span>
                  )}
                  {bet.status === 'open' && (
                    <button
                      onClick={() => cancelSideBet(bet.id)}
                      className="text-xs text-red-500 font-semibold"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {bet.status === 'open' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400 self-center">Winner:</span>
                    {bet.participants.map(pid => {
                      const pName = players.find(p => p.id === pid)?.name ?? '?'
                      return (
                        <button
                          key={pid}
                          onClick={() => resolveSideBet(bet.id, pid)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 active:bg-green-200"
                        >
                          {pName}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* New Side Bet Form */}
      {showSideBetForm && (
        <div className="space-y-2 bg-white dark:bg-gray-800 rounded-lg p-3">
          <input
            type="text"
            placeholder="e.g. CTP on #7, longest drive..."
            value={sideBetDesc}
            onChange={e => setSideBetDesc(e.target.value)}
            className="w-full text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">pts</span>
            <input
              type="number"
              value={sideBetAmount}
              onChange={e => setSideBetAmount(e.target.value)}
              min="1"
              step="1"
              className="w-20 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">per loser</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Participants:</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {players.map(p => {
              const active = sideBetParticipants.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => setSideBetParticipants(prev => active ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                  aria-pressed={active}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold leading-tight transition-colors ${
                    active ? 'bg-amber-500 text-white' : 'bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-600 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {p.name}
                </button>
              )
            })}
          </div>
          <button
            onClick={createSideBet}
            disabled={!sideBetDesc.trim() || sideBetParticipants.length < 2}
            className="w-full py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white active:bg-amber-600 disabled:opacity-40"
          >
            Create Bet ({sideBetParticipants.length < 2 ? 'need 2+ players' : `$${sideBetAmount} each`})
          </button>
        </div>
      )}

      {/* Add Side Bet button at bottom */}
      {!showSideBetForm && (
        <button
          onClick={() => setShowSideBetForm(true)}
          className="w-full text-xs font-semibold px-2.5 py-2 rounded-lg bg-amber-500 text-white active:bg-amber-600"
        >
          + Add Side Bet
        </button>
      )}
    </div>
  )
}
