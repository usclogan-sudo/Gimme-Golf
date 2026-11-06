// The two ways a hole score is drawn in the hole view, kept pure so the "no
// score yet" state has a test.
//
// 6 November: the hole view filled a missing score with par and printed it as
// a bold number. Three players with no score on a par 4 read as three 4s, at
// full opacity, while the leaderboard (correctly) showed them thru 0. A missing
// score is now null all the way down: the read-only row draws a dash and says
// so, and the editable row keeps par as a highlighted suggestion with no Net
// until a tap lands.

import { getScoreClass } from '../../lib/scoreClass'

export function ReadOnlyScore({
  gross, par, pending, rejected,
}: {
  /** null when no hole_scores row exists for this player on this hole. */
  gross: number | null
  par: number
  pending?: boolean
  rejected?: boolean
}) {
  if (gross === null) {
    return (
      <span className="inline-flex flex-col items-end leading-tight" data-testid="no-score">
        <span className="text-base font-bold px-2 text-gray-300 dark:text-gray-600" aria-label="No score yet">—</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 pr-2">no score yet</span>
      </span>
    )
  }
  return (
    <span className={`text-base font-bold px-2 py-1 rounded ${pending ? 'opacity-50' : ''} ${rejected ? 'line-through opacity-40' : ''} ${getScoreClass(gross, par)}`}>
      {gross}
    </span>
  )
}

export function InlineScorePad({
  value,
  par,
  hasScore,
  readOnly,
  onChange,
  onMore,
}: {
  /** The score to show selected when `hasScore`; otherwise the suggestion (par). */
  value: number
  par: number
  hasScore: boolean
  readOnly?: boolean
  onChange: (v: number) => void
  onMore: () => void
}) {
  // Show par-2 through par+3 inline (6 buttons), then "..." for out-of-range
  const start = Math.max(1, par - 2)
  const end = par + 3
  const nums = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  const inRange = hasScore && value >= start && value <= end
  const moreHighlight = hasScore && !inRange
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {nums.map(n => {
        const selected = inRange && value === n
        return (
          <button
            key={n}
            onClick={() => !readOnly && onChange(n)}
            disabled={readOnly}
            aria-pressed={selected}
            // One selected state — navy fill (brass in dark), cream numeral. No rainbow.
            // Par chip gets a brass underline at rest so the eye lands on it. (§7c/§7d)
            className={`relative h-12 rounded-xl font-bold text-lg flex items-center justify-center border-2 transition-all active:scale-95 ${
              selected
                ? 'bg-navy text-cream border-navy dark:bg-brass dark:text-navy dark:border-brass shadow-md'
                : `bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 active:bg-gray-50 dark:active:bg-gray-600 border-gray-200 dark:border-gray-600 ${n === par ? 'border-b-brass' : ''}`
            }`}
            aria-label={`Score ${n}`}
          >
            {/* Under-par is marked by a brass dot, not a colour — restraint reads as
                confidence. (§7d) */}
            {selected && n < par && <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brass dark:bg-navy" />}
            {n}
          </button>
        )
      })}
      <button
        onClick={() => !readOnly && onMore()}
        disabled={readOnly}
        aria-pressed={moreHighlight}
        className={`relative h-12 rounded-xl font-bold text-lg flex items-center justify-center border-2 transition-all active:scale-95 ${
          moreHighlight
            ? 'bg-navy text-cream border-navy dark:bg-brass dark:text-navy dark:border-brass shadow-md'
            : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600 active:bg-gray-50 dark:active:bg-gray-600'
        }`}
        aria-label="More score options"
      >
        {moreHighlight && value < par && <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brass dark:bg-navy" />}
        {moreHighlight ? value : '···'}
      </button>
    </div>
  )
}
