interface NumberPadProps {
  playerName: string
  holeNumber: number
  par: number
  currentValue: number
  onSelect: (value: number) => void
  onClose: () => void
  /** Whether this player already has a score on the hole — shows "Clear score". */
  hasScore?: boolean
  /** Remove the player's score for this hole. A mistaken tap should be removable
   *  on any game, not edited into a different wrong number (Finding 4). */
  onClear?: () => void
}

function getScoreColor(score: number, par: number): string {
  const diff = score - par
  if (score === 1 || diff <= -2) return 'bg-gradient-to-br from-amber-500 to-yellow-400 text-white'
  if (diff === -1) return 'bg-gradient-to-br from-blue-600 to-blue-400 text-white'
  if (diff === 0) return 'bg-emerald-500 text-white'
  if (diff === 1) return 'bg-orange-400 text-white'
  if (diff === 2) return 'bg-red-400 text-white'
  return 'bg-red-600 text-white'
}

function getScoreLabel(score: number, par: number): string {
  const diff = score - par
  if (score === 1) return 'Ace!'
  if (diff <= -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0) return 'Par'
  if (diff === 1) return 'Bogey'
  if (diff === 2) return 'Double'
  return `+${diff}`
}

export function NumberPad({ playerName, holeNumber, par, currentValue, onSelect, onClose, hasScore, onClear }: NumberPadProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl overflow-hidden animate-[slide-up_0.2s_ease-out] safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="font-bold text-gray-900 dark:text-gray-100">{playerName}</p>
            <p className="text-sm text-gray-500">Hole {holeNumber} · Par {par}</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-lg font-bold active:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Number grid: 2 rows x 5 columns */}
        <div className="px-5 pb-6 space-y-2">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => { onSelect(n); onClose() }}
                className={`h-16 rounded-2xl font-bold text-xl flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform ${getScoreColor(n, par)} ${n === currentValue ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white' : ''}`}
              >
                <span>{n}</span>
                <span className="text-[9px] font-semibold opacity-80">{getScoreLabel(n, par)}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[6, 7, 8, 9, 10].map(n => (
              <button
                key={n}
                onClick={() => { onSelect(n); onClose() }}
                className={`h-16 rounded-2xl font-bold text-xl flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform ${getScoreColor(n, par)} ${n === currentValue ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white' : ''}`}
              >
                <span>{n}</span>
                <span className="text-[9px] font-semibold opacity-80">{getScoreLabel(n, par)}</span>
              </button>
            ))}
          </div>
          {hasScore && onClear && (
            <button
              onClick={() => { onClear(); onClose() }}
              className="w-full min-h-[44px] rounded-2xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-700"
            >
              Clear score
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
