// The Hammer hole panel, pure so it can be rendered in tests against every state
// the hole can be in: no throw yet, a throw pending, settled by decline, settled by
// scores. Scorecard owns the writes and passes callbacks.

import { fmtAmount, hammerPreThrowValue } from '../../lib/gameLogic'
import type { Player, HammerHoleState } from '../../types'

interface Props {
  /** Exactly two players. */
  players: Player[]
  baseValueCents: number
  maxPresses?: number
  state: HammerHoleState | null
  /** Both players have a score on this hole, so the hole is settled by play. */
  holeScored: boolean
  netCents: Record<string, number>
  readOnly: boolean
  stakesMode?: string
  onThrow: () => void
  onDecline: () => void
}

/** "+2 tokens" / "−1 token" / "0 tokens": the sign is part of the figure. */
export function signedAmount(cents: number, stakesMode?: string): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  return `${sign}${fmtAmount(Math.abs(cents), stakesMode)}`
}

export function hammerHoleStatus(state: HammerHoleState | null, holeScored: boolean): 'open' | 'pending' | 'declined' | 'scored' {
  if (state?.declined) return 'declined'
  if (holeScored) return 'scored'
  if (state && state.presses > 0) return 'pending'
  return 'open'
}

export function HammerPanel({
  players, baseValueCents, maxPresses, state, holeScored, netCents, readOnly, stakesMode, onThrow, onDecline,
}: Props) {
  const fmt = (c: number) => fmtAmount(c, stakesMode)
  const status = hammerHoleStatus(state, holeScored)
  const holeValue = state ? state.value : baseValueCents
  const holder = state ? players.find(p => p.id === state.hammerHolder) : players[0]
  const receiver = state ? players.find(p => p.id !== state.hammerHolder) : players[1]
  const holderName = holder?.name ?? '?'
  const receiverName = receiver?.name ?? '?'
  const settled = status === 'declined' || status === 'scored'

  const canThrow = !readOnly && !settled
    && (maxPresses == null || (state?.presses ?? 0) < maxPresses)
  const canDecline = !readOnly && status === 'pending'

  const chip = status === 'pending' && state
    ? `${fmt(hammerPreThrowValue(state))}, ${fmt(state.value)} if accepted`
    : status === 'declined' && state
      ? `Settled: ${fmt(hammerPreThrowValue(state))}`
      : status === 'scored'
        ? `Settled: ${fmt(holeValue)}`
        : `Hole value: ${fmt(holeValue)}`

  const holdVerb = holderName === 'You' ? 'hold' : 'holds'
  const respondVerb = receiverName === 'You' ? 'respond' : 'responds'
  const line = status === 'open'
    ? `${holderName} ${holdVerb} the hammer — throw it to double the value`
    : status === 'pending' && state
      ? `${holderName} threw the hammer (×${state.presses}) — ${receiverName} ${respondVerb}: play on to accept, or Decline`
      : status === 'scored'
        ? `Hammer settled at ${fmt(holeValue)} for the hole`
        : ''

  return (
    <div className={`rounded-xl p-3 space-y-2 border ${settled ? 'bg-gray-50 border-gray-200' : 'bg-orange-50 border-orange-200'}`}>
      <div className="flex items-center justify-between">
        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Hammer{settled ? ' · settled' : ''}</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${settled ? 'text-gray-600 bg-gray-100' : 'text-orange-600 bg-orange-100'}`}>
          {chip}
        </span>
      </div>

      {status === 'declined' && state ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2">
          <p className="text-sm text-red-700 font-semibold">
            {players.find(p => p.id === state.declinedBy)?.name ?? receiverName} declined — {holderName} wins {fmt(hammerPreThrowValue(state))}
          </p>
        </div>
      ) : (
        <p className={`text-xs ${settled ? 'text-gray-500' : 'text-orange-600'}`}>{line}</p>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <button
            onClick={onThrow}
            disabled={!canThrow}
            className="flex-1 py-2 rounded-lg text-sm font-bold bg-orange-500 text-white active:bg-orange-600 disabled:opacity-40"
          >
            Throw Hammer
          </button>
          <button
            onClick={onDecline}
            disabled={!canDecline}
            className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-100 text-red-700 border border-red-200 active:bg-red-200 disabled:opacity-40"
          >
            Decline
          </button>
        </div>
      )}

      {/* Running totals */}
      <div className={`flex gap-2 pt-1 border-t ${settled ? 'border-gray-200' : 'border-orange-200'}`}>
        {players.map(p => {
          const net = netCents[p.id] ?? 0
          return (
            <div key={p.id} className={`flex-1 text-center rounded-lg py-1 ${net > 0 ? 'bg-green-50' : net < 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-500">{p.name}</p>
              <p className={`text-sm font-bold ${net > 0 ? 'text-green-700' : net < 0 ? 'text-red-700' : 'text-gray-600'}`}>
                {signedAmount(net, stakesMode)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
