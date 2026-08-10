import type { GameType } from '../types'
import { GAME_RULES } from '../data/gameRules'

interface Props {
  gameType: GameType
  onClose: () => void
}

// Typographic monograms, not icons — a tracked two-letter mark in brass inside a
// hairline circle. Replaces the emoji (incl. a slot-machine + bank glyph, which read
// as casino/gambling). Cheaper than clip-art and extends to any new format. (§6/§11)
const GAME_MONOGRAM: Record<GameType, string> = {
  skins: 'SK',
  best_ball: 'BB',
  nassau: 'NA',
  wolf: 'WF',
  bingo_bango_bongo: 'B3',
  hammer: 'HM',
  vegas: 'VG',
  stableford: 'ST',
  dots: 'DT',
  banker: 'BK',
  quota: 'QT',
}

export function GameRulesModal({ gameType, onClose }: Props) {
  const rules = GAME_RULES[gameType]
  if (!rules) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex-1 flex flex-col w-full max-w-[560px] bg-white dark:bg-gray-800 mt-12 rounded-t-3xl shadow-2xl overflow-hidden animate-[slide-up_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-brass text-brass text-xs font-bold tracking-wider">{GAME_MONOGRAM[gameType]}</span>
            <h2 className="font-display text-xl font-bold text-gray-900 dark:text-gray-100">{rules.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-lg font-bold active:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 pb-20">
          {/* Summary */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
            <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">{rules.summary}</p>
          </div>

          {/* How to Play */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">How to Play</h3>
            <div className="space-y-2">
              {rules.howToPlay.map((item, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Scoring */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Scoring</h3>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
              {rules.scoring.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-amber-500 mt-1 flex-shrink-0">•</span>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{item}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Tips */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Tips</h3>
            <div className="space-y-2">
              {rules.tips.map((item, i) => (
                <div key={i} className="flex gap-2 items-start bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                  <span className="text-blue-500 flex-shrink-0">💡</span>
                  <p className="text-sm text-blue-800 dark:text-blue-200">{item}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
