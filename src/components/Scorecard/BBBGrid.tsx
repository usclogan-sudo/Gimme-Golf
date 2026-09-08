import type { Player, BBBPoint } from '../../types'
import { bbbGridSummary, playerInitials } from '../../lib/gameLogic'

/**
 * The traditional Bingo Bango Bongo card, and the audit trail the format needs.
 *
 * Three points a hole all move money, so a missed tap is not a cosmetic gap. Under
 * the pot model it silently raised the value of every other point — four missed on
 * 7 September moved the rate 8% and the group had no way to see it. A gap renders
 * as a brass dash here, and the footer says "50 of 51 · 1 unassigned", which is the
 * line that would have caught it on the day.
 *
 * Tapping a row goes to that hole, where the award chips are: the grid is the
 * correction surface as well as the record.
 */
export function BBBGrid({
  players,
  bbbPoints,
  currentHole,
  onSelectHole,
  readOnly = false,
}: {
  players: Player[]
  bbbPoints: BBBPoint[]
  currentHole: number
  onSelectHole: (hole: number) => void
  readOnly?: boolean
}) {
  const { thru, assigned, expected, unassigned } = bbbGridSummary(bbbPoints)
  const byHole = new Map(bbbPoints.map(p => [p.holeNumber, p]))
  const initialsFor = (playerId: string | null) => {
    if (!playerId) return null
    const p = players.find(pl => pl.id === playerId)
    return p ? playerInitials(p.name) : '??'
  }

  // Rows up to the furthest recorded hole, plus the one being played, so the card
  // reads as a record rather than an empty 18-row form.
  const lastRow = Math.max(thru, currentHole)
  const holes = Array.from({ length: lastRow }, (_, i) => i + 1)

  const points = new Map<string, number>()
  players.forEach(p => points.set(p.id, 0))
  for (const row of bbbPoints) {
    for (const id of [row.bingo, row.bango, row.bongo]) {
      if (id && points.has(id)) points.set(id, (points.get(id) ?? 0) + 1)
    }
  }
  const ranked = [...points.entries()].sort((a, b) => b[1] - a[1])

  const Cell = ({ v }: { v: string | null }) =>
    v ? <span className="font-semibold text-gray-800 dark:text-gray-100">{v}</span>
      : <span className="text-amber-500 font-bold" aria-label="not assigned">—</span>

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Bingo Bango Bongo</p>
        {thru > 0 && <p className="text-xs text-gray-500">thru {thru}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-500">
              <th className="text-left font-semibold py-1 w-12">Hole</th>
              <th className="text-center font-semibold py-1">Bingo</th>
              <th className="text-center font-semibold py-1">Bango</th>
              <th className="text-center font-semibold py-1">Bongo</th>
            </tr>
          </thead>
          <tbody>
            {holes.map(h => {
              const row = byHole.get(h)
              const isCurrent = h === currentHole
              return (
                <tr
                  key={h}
                  onClick={() => !readOnly && onSelectHole(h)}
                  className={`border-t border-gray-100 dark:border-gray-700 ${
                    isCurrent ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                  } ${readOnly ? '' : 'cursor-pointer active:bg-gray-50 dark:active:bg-gray-700'}`}
                >
                  <td className="py-2 text-gray-500 font-medium">{h}</td>
                  <td className="py-2 text-center"><Cell v={initialsFor(row?.bingo ?? null)} /></td>
                  <td className="py-2 text-center"><Cell v={initialsFor(row?.bango ?? null)} /></td>
                  <td className="py-2 text-center"><Cell v={initialsFor(row?.bongo ?? null)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <span className="text-[11px] uppercase tracking-wide text-gray-500 w-16 shrink-0">Points</span>
          {ranked.map(([id, n]) => {
            const p = players.find(pl => pl.id === id)
            return (
              <span key={id} className="whitespace-nowrap">
                <span className="font-semibold">{p ? playerInitials(p.name) : '??'}</span>{' '}
                <span className="text-gray-500">{n}</span>
              </span>
            )
          })}
        </div>
        <div className="flex gap-3 text-sm">
          <span className="text-[11px] uppercase tracking-wide text-gray-500 w-16 shrink-0">Awarded</span>
          <span className={unassigned > 0 ? 'text-amber-600 font-semibold' : 'text-gray-500'}>
            {assigned} of {expected}
            {unassigned > 0 && ` · ${unassigned} unassigned`}
          </span>
        </div>
        {unassigned > 0 && !readOnly && (
          <p className="text-xs text-gray-500">
            Every point changes the settlement. Tap a hole to fill the gaps.
          </p>
        )}
      </div>
    </div>
  )
}
