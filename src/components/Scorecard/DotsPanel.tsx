import { fmtAmount, DOT_LABELS } from '../../lib/gameLogic'
import type { Player, DotType, JunkRecord, DotsConfig, StakesMode } from '../../types'

interface Props {
  currentHole: number
  players: Player[]
  config: DotsConfig
  junkRecords: JunkRecord[]
  toggleDot: (dot: DotType, playerId: string) => void
  /** Running net per player (from calculateDots) for the standings strip. */
  netCents?: Record<string, number>
  stakesMode?: StakesMode
  readOnly?: boolean
}

/**
 * In-round dot-awarding UI for the Dots game. Unlike junks (HoleBetsPanel, gated
 * behind SHOW_HOLE_BETS), this always renders for a Dots round: for each active dot
 * type, tap a player to award/remove that dot on the current hole. Dots are stored
 * as junk_records (junkType = DotType) — the same mechanism as junks — so it reuses
 * the Scorecard's toggle handler.
 */
export function DotsPanel({ currentHole, players, config, junkRecords, toggleDot, netCents, stakesMode, readOnly }: Props) {
  const holeDots = junkRecords.filter(jr => jr.holeNumber === currentHole)
  const hasNet = netCents && players.some(p => (netCents[p.id] ?? 0) !== 0)

  return (
    <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-xl p-3 space-y-3">
      <p className="font-bold text-rose-800 dark:text-rose-300 text-sm">
        🔴 Dots — Hole {currentHole}
        <span className="ml-2 text-rose-500 font-normal">{fmtAmount(config.valueCentsPerDot, stakesMode)}/dot</span>
      </p>
      {hasNet && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {[...players].sort((a, b) => (netCents![b.id] ?? 0) - (netCents![a.id] ?? 0)).map(p => {
            const n = netCents![p.id] ?? 0
            return (
              <span key={p.id} className={n > 0 ? 'text-green-700 dark:text-green-400 font-semibold' : n < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500'}>
                {p.name} {n > 0 ? '+' : ''}{fmtAmount(n, stakesMode)}
              </span>
            )
          })}
        </div>
      )}
      {config.activeDots.length === 0 && (
        <p className="text-xs text-rose-600 dark:text-rose-400">No dot types configured for this round.</p>
      )}
      {config.activeDots.map(dt => {
        const info = DOT_LABELS[dt]
        const isSnake = dt === 'snake'
        return (
          <div key={dt} className="space-y-1">
            <p className={`text-xs font-semibold ${isSnake ? 'text-red-600' : 'text-rose-700 dark:text-rose-300'}`}>
              {info.emoji} {info.name} — <span className="font-normal">{info.description}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {players.map(p => {
                const active = holeDots.some(jr => jr.playerId === p.id && jr.junkType === dt)
                return (
                  <button
                    key={p.id}
                    onClick={() => !readOnly && toggleDot(dt, p.id)}
                    disabled={readOnly}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                      active
                        ? isSnake ? 'bg-red-500 text-white' : 'bg-rose-500 text-white'
                        : 'bg-white dark:bg-gray-700 border border-rose-200 dark:border-rose-600 text-rose-700 dark:text-rose-300'
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
  )
}
