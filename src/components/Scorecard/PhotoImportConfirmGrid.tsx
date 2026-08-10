import { useMemo, useState } from 'react'
import type { Player, CourseSnapshot, HoleScore } from '../../types'
import type { ExtractionResult, Confidence } from '../../lib/photoImport'
import { bulkSaveImportedScores } from '../../lib/photoImport'

interface Props {
  roundId: string
  userId: string
  players: Player[]
  snapshot: CourseSnapshot
  existing: HoleScore[]
  extraction: ExtractionResult
  onCancel: () => void
  onSaved: (n: { updated: number; inserted: number }) => void
}

interface CellState {
  grossScore: number | null
  confidence: Confidence
}

const confidenceClass = (c: Confidence): string => {
  if (c === 'high') return 'border-green-300 bg-green-50 dark:bg-green-900/20'
  if (c === 'medium') return 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'
  return 'border-red-300 bg-red-50 dark:bg-red-900/20'
}

export function PhotoImportConfirmGrid({
  roundId,
  userId,
  players,
  snapshot,
  existing,
  extraction,
  onCancel,
  onSaved,
}: Props) {
  const sortedHoles = useMemo(() => snapshot.holes.slice().sort((a, b) => a.number - b.number), [snapshot.holes])
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  // ── Column → player mapping (user can override) ───────────────────────────
  // Build the initial mapping: trust the extraction but fall back to roster
  // order for any missing players. The "columns" align to roster order.
  const initialColumnMapping = useMemo<string[]>(() => {
    const mapping = [...players.map(p => p.id)] // start with roster order
    extraction.playerColumnMapping.forEach((m, i) => {
      if (i < mapping.length && playerById.has(m.playerId)) {
        mapping[i] = m.playerId
      }
    })
    return mapping
  }, [players, extraction.playerColumnMapping, playerById])

  const [columnMapping, setColumnMapping] = useState<string[]>(initialColumnMapping)

  const mappingConfidence = useMemo<Map<string, Confidence>>(() => {
    const m = new Map<string, Confidence>()
    extraction.playerColumnMapping.forEach(entry => m.set(entry.playerId, entry.confidence))
    return m
  }, [extraction.playerColumnMapping])

  const reassignColumn = (columnIndex: number, newPlayerId: string) => {
    setColumnMapping(prev => {
      const out = [...prev]
      const oldPlayerId = out[columnIndex]
      // Swap if the new player is already in another column.
      const otherIdx = out.indexOf(newPlayerId)
      if (otherIdx >= 0 && otherIdx !== columnIndex) {
        out[otherIdx] = oldPlayerId
      }
      out[columnIndex] = newPlayerId
      return out
    })
  }

  // ── Per-cell state, keyed by extracted (playerId, holeNumber) ─────────────
  // The extraction's playerId is column-bound; user remapping shifts which
  // player gets which column's scores.
  const initialCells = useMemo<Map<string, CellState>>(() => {
    const map = new Map<string, CellState>()
    for (const s of extraction.scores) {
      map.set(`${s.playerId}-${s.holeNumber}`, { grossScore: s.grossScore, confidence: s.confidence })
    }
    return map
  }, [extraction.scores])

  const [cells, setCells] = useState<Map<string, CellState>>(initialCells)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  /** Resolve which extracted-column-playerId backs the current display column. */
  const extractedIdForColumn = (columnIndex: number): string => {
    return extraction.playerColumnMapping[columnIndex]?.playerId ?? players[columnIndex]?.id ?? ''
  }

  const cellFor = (columnIndex: number, holeNumber: number): CellState | undefined => {
    const extractedPid = extractedIdForColumn(columnIndex)
    return cells.get(`${extractedPid}-${holeNumber}`)
  }

  const beginEdit = (columnIndex: number, holeNumber: number) => {
    const extractedPid = extractedIdForColumn(columnIndex)
    const key = `${extractedPid}-${holeNumber}`
    const current = cells.get(key)
    setEditingKey(key)
    setEditingDraft(current?.grossScore != null ? String(current.grossScore) : '')
  }

  const commitEdit = () => {
    if (!editingKey) return
    const trimmed = editingDraft.trim()
    let next: CellState
    if (trimmed === '') {
      next = { grossScore: null, confidence: 'low' }
    } else {
      const v = parseInt(trimmed, 10)
      if (!Number.isFinite(v) || v < 1 || v > 15) {
        // Invalid input — leave as-is, don't commit.
        setEditingKey(null)
        setEditingDraft('')
        return
      }
      next = { grossScore: v, confidence: 'high' }
    }
    setCells(prev => {
      const out = new Map(prev)
      out.set(editingKey, next)
      return out
    })
    setEditingKey(null)
    setEditingDraft('')
  }

  // ── Save All ──────────────────────────────────────────────────────────────
  const lowConfidenceCount = useMemo(() => {
    let n = 0
    for (const v of cells.values()) {
      if (v.confidence === 'low' || v.grossScore == null) n++
    }
    return n
  }, [cells])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const scoresToSave: { playerId: string; holeNumber: number; grossScore: number }[] = []
      for (let col = 0; col < columnMapping.length; col++) {
        const targetPlayerId = columnMapping[col]
        if (!targetPlayerId) continue
        const extractedPid = extractedIdForColumn(col)
        for (const hole of sortedHoles) {
          const cell = cells.get(`${extractedPid}-${hole.number}`)
          if (cell?.grossScore != null) {
            scoresToSave.push({ playerId: targetPlayerId, holeNumber: hole.number, grossScore: cell.grossScore })
          }
        }
      }
      if (scoresToSave.length === 0) {
        setSaveError('No valid scores to save. Tap a cell to enter a score.')
        setSaving(false)
        return
      }
      const result = await bulkSaveImportedScores({ roundId, userId, scores: scoresToSave, existing })
      onSaved(result)
    } catch (err: any) {
      setSaveError(err?.message ?? 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-40 overflow-y-auto pb-24">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
        <button
          onClick={onCancel}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl"
          aria-label="Cancel"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">Review imported scores</h1>
          <p className="text-xs text-white/70 truncate">
            {extraction.scores.length} cells extracted · tap any cell to edit
          </p>
        </div>
      </header>

      <div className="px-3 py-3 max-w-3xl mx-auto space-y-3">
        {extraction.notes && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
            <p className="text-blue-800 dark:text-blue-200 text-xs">{extraction.notes}</p>
          </div>
        )}

        {lowConfidenceCount > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg px-3 py-2">
            <p className="text-yellow-800 dark:text-yellow-200 text-xs">
              ⚠ {lowConfidenceCount} score{lowConfidenceCount === 1 ? '' : 's'} need a closer look. Red and yellow cells were uncertain — tap to verify or correct.
            </p>
          </div>
        )}

        {/* Player column mapping */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Card columns → players</p>
          {columnMapping.map((targetPlayerId, columnIndex) => {
            const extractedEntry = extraction.playerColumnMapping[columnIndex]
            const cardLabel = extractedEntry?.cardColumnLabel ?? `Column ${columnIndex + 1}`
            const conf = extractedEntry ? mappingConfidence.get(extractedEntry.playerId) ?? 'low' : 'low'
            return (
              <div key={columnIndex} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-16">Col {columnIndex + 1}</span>
                <span className="text-sm text-gray-700 dark:text-gray-200 flex-1 truncate">"{cardLabel}"</span>
                <span className="text-gray-400 text-xs">→</span>
                <select
                  value={targetPlayerId}
                  onChange={e => reassignColumn(columnIndex, e.target.value)}
                  className={`h-9 px-2 rounded-lg border text-sm font-semibold ${confidenceClass(conf)} text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500`}
                >
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>

        {/* Score grid */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-2 overflow-x-auto">
          <table className="w-full text-sm border-separate" style={{ borderSpacing: 4 }}>
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 px-1">Hole</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-1">Par</th>
                {columnMapping.map((targetPlayerId, columnIndex) => {
                  const player = playerById.get(targetPlayerId)
                  return (
                    <th key={columnIndex} className="text-center text-xs font-semibold text-gray-700 dark:text-gray-200 px-1 truncate" style={{ minWidth: 56 }}>
                      {player?.name ?? `Col ${columnIndex + 1}`}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sortedHoles.map(hole => (
                <tr key={hole.number}>
                  <td className="text-xs text-gray-600 dark:text-gray-300 px-1">{hole.number}</td>
                  <td className="text-xs text-gray-400 dark:text-gray-500 px-1">{hole.par}</td>
                  {columnMapping.map((_, columnIndex) => {
                    const cell = cellFor(columnIndex, hole.number)
                    const conf: Confidence = cell?.confidence ?? 'low'
                    const extractedPid = extractedIdForColumn(columnIndex)
                    const key = `${extractedPid}-${hole.number}`
                    const isEditing = editingKey === key
                    return (
                      <td key={columnIndex} className="text-center px-0">
                        {isEditing ? (
                          <input
                            autoFocus
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={15}
                            value={editingDraft}
                            onChange={e => setEditingDraft(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitEdit()
                              if (e.key === 'Escape') { setEditingKey(null); setEditingDraft('') }
                            }}
                            className="w-12 h-10 text-center font-semibold border-2 border-amber-500 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => beginEdit(columnIndex, hole.number)}
                            className={`w-12 h-10 rounded-lg border-2 font-semibold ${confidenceClass(conf)} text-gray-900 dark:text-gray-100 active:bg-gray-100 dark:active:bg-gray-700`}
                          >
                            {cell?.grossScore ?? '—'}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 text-center">
          🟢 high confidence · 🟡 verify · 🔴 missing or unreadable
        </p>

        {saveError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            <p className="text-red-700 dark:text-red-300 text-sm">{saveError}</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-3xl mx-auto flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 h-12 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 font-semibold active:bg-gray-50 dark:active:bg-gray-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] h-12 bg-gray-800 text-white dark:bg-brass dark:text-navy rounded-xl font-semibold active:bg-gray-900 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save all scores'}
          </button>
        </div>
      </div>
    </div>
  )
}
