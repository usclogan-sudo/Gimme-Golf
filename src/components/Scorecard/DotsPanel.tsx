import { fmtAmount, DOT_LABELS } from '../../lib/gameLogic'
import type { Player, DotType, JunkRecord, DotsConfig, StakesMode } from '../../types'

interface Props {
  currentHole: number
  /** Par of the current hole — Greenie only applies on par 3s. */
  holePar?: number
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
 *
 * Brand palette throughout: brass for an awarded dot, slate for one not awarded.
 * The old red read as an error state on every hole.
 */
export function DotsPanel({ currentHole, holePar, players, config, junkRecords, toggleDot, netCents, stakesMode, readOnly }: Props) {
  const holeDots = junkRecords.filter(jr => jr.holeNumber === currentHole)
  const hasNet = netCents && players.some(p => (netCents[p.id] ?? 0) !== 0)
  // Greenie (green-in-regulation) is a par-3-only dot; hide it elsewhere so it can't
  // be awarded on a hole where it doesn't apply.
  const activeDots = config.activeDots.filter(dt => !(dt === 'greenie' && holePar != null && holePar !== 3))

  return (
    <div className="bg-cream dark:bg-slate-brand/40 border border-brass/40 rounded-xl p-3 space-y-3">
      <p className="font-bold text-navy dark:text-cream text-sm">
        Dots — Hole {currentHole}
        <span className="ml-2 text-slate-brand dark:text-cream/70 font-normal">{fmtAmount(config.valueCentsPerDot, stakesMode)}/dot</span>
      </p>
      {hasNet && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {[...players].sort((a, b) => (netCents![b.id] ?? 0) - (netCents![a.id] ?? 0)).map(p => {
            const n = netCents![p.id] ?? 0
            return (
              <span key={p.id} className={n > 0 ? 'text-navy dark:text-brass font-semibold' : n < 0 ? 'text-slate-brand dark:text-cream/70 font-semibold' : 'text-gray-500'}>
                {p.name} {n > 0 ? '+' : n < 0 ? '−' : ''}{fmtAmount(Math.abs(n), stakesMode)}
              </span>
            )
          })}
        </div>
      )}
      {activeDots.length === 0 && (
        <p className="text-xs text-slate-brand dark:text-cream/70">No dot types apply on this hole.</p>
      )}
      {activeDots.map(dt => {
        const info = DOT_LABELS[dt]
        return (
          <div key={dt} className="space-y-1">
            <p className="text-xs font-semibold text-navy dark:text-cream">
              {info.name} — <span className="font-normal text-slate-brand dark:text-cream/70">{info.description}</span>
            </p>
            {/* 44px targets in a two-column grid on phones, matching the BBB awards.
              Same defect, same reasoning: these were 26px chips with 6px gaps,
              tapped repeatedly per hole on a phone outdoors, and a mis-tap
              silently awards a dot to the wrong player. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {players.map(p => {
                const active = holeDots.some(jr => jr.playerId === p.id && jr.junkType === dt)
                return (
                  <button
                    key={p.id}
                    onClick={() => !readOnly && toggleDot(dt, p.id)}
                    disabled={readOnly}
                    aria-pressed={active}
                    className={`min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold leading-tight transition-colors disabled:opacity-60 ${
                      active
                        ? 'bg-brass text-navy'
                        : 'bg-white dark:bg-gray-700 border border-slate-brand/20 dark:border-slate-brand/60 text-slate-brand dark:text-cream'
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
