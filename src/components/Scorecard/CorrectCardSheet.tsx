import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { reportSupabaseError } from '../../lib/sentry'
import type { CourseSnapshot } from '../../types'

// Correct this card. The vendor's card is wrong on a hole, or the course
// changed its scorecard, and the organizer fixes it for this round only: the
// RPC rewrites the round's snapshot and records a course_overrides row for
// review. The shared catalog is never touched from here. Stroke indexes stay
// unique: the hole that held the new index takes the old one.

export interface CardCorrection {
  hole: number
  par: number
  stroke_index: number
  previous_par: number
  previous_stroke_index: number
  swapped_hole: number | null
}

interface Props {
  roundId: string
  snapshot: CourseSnapshot
  onClose: () => void
  onCorrected: (c: CardCorrection) => void
}

export function CorrectCardSheet({ roundId, snapshot, onClose, onCorrected }: Props) {
  const holes = [...snapshot.holes].sort((a, b) => a.number - b.number)
  const [holeNumber, setHoleNumber] = useState(holes[0]?.number ?? 1)
  const current = holes.find(h => h.number === holeNumber) ?? holes[0]
  const [par, setPar] = useState(current?.par ?? 4)
  const [si, setSi] = useState(current?.strokeIndex ?? 1)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickHole = (n: number) => {
    const h = holes.find(x => x.number === n)
    setHoleNumber(n)
    if (h) { setPar(h.par); setSi(h.strokeIndex) }
    setError(null)
  }

  const swappedWith = holes.find(h => h.strokeIndex === si && h.number !== holeNumber)
  const unchanged = current && par === current.par && si === current.strokeIndex

  const save = async () => {
    if (saving || unchanged) return
    if (si < 1 || si > holes.length) { setError(`Stroke index must be 1 to ${holes.length}`); return }
    setSaving(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('correct_round_card', {
      p_round_id: roundId,
      p_hole_number: holeNumber,
      p_par: par,
      p_stroke_index: si,
      p_reason: reason.trim() || null,
    })
    setSaving(false)
    if (rpcError) {
      reportSupabaseError(rpcError, 'correct_round_card', { roundId, holeNumber })
      setError(rpcError.message || "Couldn't save the correction.")
      return
    }
    onCorrected(data as CardCorrection)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Correct this card"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl"
      >
        <div>
          <h2 className="font-display font-bold text-lg text-gray-900 dark:text-gray-100">Correct this card</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Fixes the par or stroke index for this round only. Scores already entered stay as they are.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hole</span>
            <select
              value={holeNumber}
              onChange={e => pickHole(parseInt(e.target.value))}
              className="mt-1 w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base"
            >
              {holes.map(h => (
                <option key={h.number} value={h.number}>Hole {h.number} · par {h.par} · SI {h.strokeIndex}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stroke index</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={holes.length}
              value={si}
              onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setSi(v) }}
              className="mt-1 w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base"
            />
          </label>
        </div>

        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Par</span>
          <div className="mt-1 flex gap-2">
            {[3, 4, 5, 6].map(p => (
              <button
                key={p}
                onClick={() => setPar(p)}
                className={`flex-1 h-11 rounded-xl text-base font-bold ${
                  par === p ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {swappedWith && si !== current?.strokeIndex && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Hole {swappedWith.number} currently has stroke index {si}. It will take {current?.strokeIndex} so every index stays unique.
          </p>
        )}

        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Why (optional)</span>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Card at the course says par 5"
            maxLength={140}
            className="mt-1 w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base"
          />
        </label>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-12 rounded-2xl font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !!unchanged}
            className="flex-1 h-12 rounded-2xl font-bold bg-gray-800 text-white dark:bg-brass dark:text-navy disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </div>
    </div>
  )
}
