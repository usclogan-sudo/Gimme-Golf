import { Fragment, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase, courseToRow } from '../../lib/supabase'
import { ConfirmModal } from '../ConfirmModal'
import type { Course, Hole, Tee } from '../../types'

// Standard stroke index allocation (odd on front, even on back, hardest first)
const STANDARD_SI_18 = [7, 11, 3, 15, 1, 9, 5, 13, 17, 8, 12, 4, 16, 2, 10, 6, 14, 18]
const STANDARD_SI_9 = [5, 3, 1, 7, 9, 4, 2, 8, 6]

function defaultHoles(count: 9 | 18 = 18): Hole[] {
  const si = count === 9 ? STANDARD_SI_9 : STANDARD_SI_18
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1, par: 4, strokeIndex: si[i], yardages: {},
  }))
}
function sumYards(holes: Hole[], teeName: string, from = 0, to?: number) {
  return holes.slice(from, to ?? holes.length).reduce((s, h) => s + (h.yardages[teeName] ?? 0), 0)
}

interface Props { userId: string; course?: Course; onSave: () => void; onCancel: () => void; initialName?: string }

export function CourseSetup({ userId, course: editCourse, onSave, onCancel, initialName }: Props) {
  const [name, setName] = useState(editCourse?.name ?? initialName ?? '')
  const [tees, setTees] = useState<Tee[]>(editCourse?.tees ?? [{ name: 'Blue', rating: 72.1, slope: 128 }])
  const [holeCount, setHoleCount] = useState<9 | 18>(editCourse?.holes.length === 9 ? 9 : 18)
  const [holes, setHoles] = useState<Hole[]>(editCourse?.holes ?? defaultHoles())
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const addTee = () => setTees(prev => [...prev, { name: '', rating: 72.0, slope: 113 }])
  const removeTee = (idx: number) => {
    const removedName = tees[idx].name
    setTees(prev => prev.filter((_, i) => i !== idx))
    if (removedName) {
      setHoles(prev => prev.map(hole => {
        const { [removedName]: _d, ...rest } = hole.yardages
        return { ...hole, yardages: rest }
      }))
    }
  }
  const updateTee = (idx: number, updates: Partial<Tee>) => {
    const oldName = tees[idx].name
    setTees(prev => prev.map((t, i) => (i === idx ? { ...t, ...updates } : t)))
    if (updates.name !== undefined && updates.name !== oldName) {
      const newName = updates.name
      setHoles(prev => prev.map(hole => {
        const yards = hole.yardages[oldName]
        const { [oldName]: _d, ...rest } = hole.yardages
        return { ...hole, yardages: newName ? { ...rest, [newName]: yards ?? 0 } : rest }
      }))
    }
  }
  const updateHole = (num: number, updates: Partial<Omit<Hole, 'number' | 'yardages'>>) =>
    setHoles(prev => prev.map(h => (h.number === num ? { ...h, ...updates } : h)))
  const updateYardage = (holeNum: number, teeName: string, yards: number) =>
    setHoles(prev => prev.map(h =>
      h.number === holeNum ? { ...h, yardages: { ...h.yardages, [teeName]: yards } } : h))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Course name is required'
    if (tees.length === 0) { errs.tees = 'At least one tee is required' }
    else {
      tees.forEach((tee, i) => {
        if (!tee.name.trim()) errs[`tee${i}name`] = 'Required'
        if (isNaN(tee.rating) || tee.rating < 60 || tee.rating > 80) errs[`tee${i}rating`] = '60–80'
        if (isNaN(tee.slope) || tee.slope < 55 || tee.slope > 155) errs[`tee${i}slope`] = '55–155'
      })
      const names = tees.map(t => t.name.trim().toLowerCase()).filter(Boolean)
      if (new Set(names).size !== names.length) errs.teeDupe = 'Tee names must be unique'
    }
    const sis = holes.map(h => h.strokeIndex)
    if (new Set(sis).size !== holes.length || sis.some(si => si < 1 || si > holes.length))
      errs.si = `Each stroke index 1–${holes.length} must be used exactly once`
    if (holes.length !== 9 && holes.length !== 18) {
      errs.holeCount = 'Hole count must be 9 or 18'
    }
    holes.forEach(h => {
      if (!Number.isFinite(h.par) || h.par < 3 || h.par > 6) {
        errs[`par${h.number}`] = `Hole ${h.number} par must be between 3 and 6`
      }
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const course: Course = {
        id: editCourse?.id ?? uuidv4(),
        name: name.trim(),
        tees,
        holes,
        createdAt: editCourse?.createdAt ?? new Date(),
      }
      const { error: err } = await supabase
        .from('courses')
        .upsert(courseToRow(course, userId), { onConflict: 'id' })
      if (err) throw err
      onSave()
    } catch (err) {
      console.error('Failed to save course:', err)
      setErrors(prev => ({ ...prev, save: 'Failed to save. Please try again.' }))
    } finally { setSaving(false) }
  }

  const namedTees = tees.filter(t => t.name.trim())
  const half = Math.ceil(holes.length / 2)
  const frontPar = holes.slice(0, half).reduce((s, h) => s + h.par, 0)
  const backPar = holes.slice(half).reduce((s, h) => s + h.par, 0)

  const [confirmSwitch, setConfirmSwitch] = useState<9 | 18 | null>(null)

  const switchHoleCount = (count: 9 | 18) => {
    // If holes have been modified (any yardages entered or pars changed from default), confirm first
    const hasData = holes.some(h => h.par !== 4 || Object.values(h.yardages).some(y => y > 0))
    if (hasData && count !== holeCount) {
      setConfirmSwitch(count)
      return
    }
    setHoleCount(count)
    setHoles(defaultHoles(count))
  }

  const doSwitch = () => {
    if (confirmSwitch) {
      setHoleCount(confirmSwitch)
      setHoles(defaultHoles(confirmSwitch))
      setConfirmSwitch(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
        <button onClick={onCancel} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-600 text-xl" aria-label="Back">←</button>
        <h1 className="text-xl font-bold">{editCourse ? 'Edit Course' : 'New Course'}</h1>
      </header>
      <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Course Name</label>
          <input type="text" placeholder="e.g. Pebble Beach Golf Links" value={name} onChange={e => setName(e.target.value)}
            className={`w-full h-12 px-4 rounded-xl border text-base focus:outline-none focus:ring-2 focus:ring-amber-500 ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
        </section>
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tees</h2>
            <button onClick={addTee} className="bg-gray-800 text-white dark:bg-brass dark:text-navy text-sm px-4 h-9 rounded-lg font-semibold active:bg-gray-900">+ Add Tee</button>
          </div>
          {errors.tees && <p className="text-red-500 text-sm mb-2">{errors.tees}</p>}
          {errors.teeDupe && <p className="text-red-500 text-sm mb-2">{errors.teeDupe}</p>}
          <div className="space-y-3">
            {tees.map((tee, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <input type="text" placeholder="Color (e.g. Blue)" value={tee.name} onChange={e => updateTee(idx, { name: e.target.value })}
                    className={`flex-1 h-11 px-3 rounded-lg border text-base focus:outline-none focus:ring-2 focus:ring-amber-500 ${errors[`tee${idx}name`] ? 'border-red-400' : 'border-gray-300'}`} />
                  {tees.length > 1 && (
                    <button onClick={() => removeTee(idx)} className="w-11 h-11 text-red-500 border border-red-200 rounded-lg flex items-center justify-center text-2xl leading-none" aria-label={`Remove ${tee.name || 'tee'}`}>×</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Course Rating</label>
                    <input type="number" inputMode="decimal" step="0.1" min="60" max="80" value={tee.rating} onChange={e => updateTee(idx, { rating: parseFloat(e.target.value) })}
                      className={`w-full h-11 px-3 rounded-lg border text-base focus:outline-none focus:ring-2 focus:ring-amber-500 ${errors[`tee${idx}rating`] ? 'border-red-400' : 'border-gray-300'}`} />
                    {errors[`tee${idx}rating`] && <p className="text-red-500 text-xs mt-0.5">{errors[`tee${idx}rating`]}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Slope</label>
                    <input type="number" inputMode="numeric" min="55" max="155" value={tee.slope} onChange={e => updateTee(idx, { slope: parseInt(e.target.value) })}
                      className={`w-full h-11 px-3 rounded-lg border text-base focus:outline-none focus:ring-2 focus:ring-amber-500 ${errors[`tee${idx}slope`] ? 'border-red-400' : 'border-gray-300'}`} />
                    {errors[`tee${idx}slope`] && <p className="text-red-500 text-xs mt-0.5">{errors[`tee${idx}slope`]}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Holes</h2>
            <div className="flex gap-1.5">
              {!editCourse && ([9, 18] as const).map(c => (
                <button key={c} onClick={() => switchHoleCount(c)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${holeCount === c ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}>{c}H</button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 mb-3">
            {(holeCount === 18 ? [
              { label: 'Par 72', pars: [4,4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5] },
              { label: 'Par 71', pars: [4,4,4,3,5,4,4,3,4,4,4,4,3,5,4,4,3,5] },
              { label: 'Par 70', pars: [4,4,4,3,5,4,4,3,4,4,4,4,3,5,4,4,3,4] },
            ] : [
              { label: 'Par 36', pars: [4,4,4,3,5,4,4,3,5] },
              { label: 'Par 35', pars: [4,4,4,3,5,4,4,3,4] },
              { label: 'Par 34', pars: [4,4,3,3,5,4,4,3,4] },
            ]).map(tmpl => (
              <button key={tmpl.label} onClick={() => {
                setHoles(prev => prev.map((h, i) => ({ ...h, par: tmpl.pars[i] ?? 4 })))
              }}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 text-amber-600 border border-amber-200 active:bg-amber-100"
              >{tmpl.label}</button>
            ))}
          </div>
          {errors.si && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3"><p className="text-red-600 text-sm">{errors.si}</p></div>}
          {errors.holeCount && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3"><p className="text-red-600 text-sm">{errors.holeCount}</p></div>}
          {(() => {
            const parErrors = Object.entries(errors).filter(([k]) => k.startsWith('par')).map(([, v]) => v)
            if (parErrors.length === 0) return null
            return <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3"><p className="text-red-600 text-sm">{parErrors[0]}{parErrors.length > 1 ? ` (and ${parErrors.length - 1} more)` : ''}</p></div>
          })()}
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-400 uppercase border-b border-gray-200">
                  <th className="text-center pb-2 w-8 font-medium">#</th>
                  <th className="text-center pb-2 font-medium px-1" style={{ minWidth: 96 }}>Par</th>
                  <th className="text-center pb-2 font-medium px-1 w-14">SI</th>
                  {namedTees.map(t => (
                    <th key={t.name} className="text-center pb-2 font-medium px-1" style={{ minWidth: 72 }}>
                      {t.name}<span className="normal-case text-gray-300 ml-0.5">yds</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holes.map(hole => (
                  <Fragment key={hole.number}>
                    {holes.length > 9 && hole.number === half + 1 && (
                      <tr><td colSpan={3 + namedTees.length} className="pt-3 pb-1 border-t-2 border-amber-200">
                        <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Back {holes.length - half}</span>
                      </td></tr>
                    )}
                    <tr className={hole.number % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                      <td className="py-1 text-center font-semibold text-gray-500 w-8">{hole.number}</td>
                      <td className="py-1 px-1">
                        <div className="flex gap-0.5 justify-center">
                          {[3, 4, 5].map(p => (
                            <button key={p} onClick={() => updateHole(hole.number, { par: p })}
                              className={`w-8 h-9 text-sm font-semibold rounded transition-colors ${hole.par === p ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy shadow-sm' : 'bg-gray-100 text-gray-600 active:bg-gray-200'}`}>{p}</button>
                          ))}
                        </div>
                      </td>
                      <td className="py-1 px-1">
                        <input type="number" inputMode="numeric" min={1} max={holes.length} value={hole.strokeIndex}
                          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) updateHole(hole.number, { strokeIndex: v }) }}
                          className="w-12 h-9 text-center rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                      </td>
                      {namedTees.map(tee => (
                        <td key={tee.name} className="py-1 px-1">
                          <input type="number" inputMode="numeric" min={0} max={700} placeholder="—" value={hole.yardages[tee.name] ?? ''}
                            onChange={e => { const v = parseInt(e.target.value); updateYardage(hole.number, tee.name, isNaN(v) ? 0 : v) }}
                            className="w-16 h-9 text-center rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-300">
                {holes.length > 9 ? (
                  <>
                    <tr className="text-xs font-semibold text-gray-500">
                      <td className="pt-2 pb-0.5 text-center">Out</td><td className="pt-2 pb-0.5 text-center">{frontPar}</td><td />
                      {namedTees.map(t => <td key={t.name} className="pt-2 pb-0.5 text-center">{sumYards(holes, t.name, 0, half) || '—'}</td>)}
                    </tr>
                    <tr className="text-xs font-semibold text-gray-500">
                      <td className="py-0.5 text-center">In</td><td className="py-0.5 text-center">{backPar}</td><td />
                      {namedTees.map(t => <td key={t.name} className="py-0.5 text-center">{sumYards(holes, t.name, half) || '—'}</td>)}
                    </tr>
                    <tr className="border-t border-gray-200 text-sm font-bold text-gray-800 dark:text-gray-100">
                      <td className="pt-2 text-center">Tot</td><td className="pt-2 text-center">{frontPar + backPar}</td><td />
                      {namedTees.map(t => <td key={t.name} className="pt-2 text-center">{sumYards(holes, t.name) || '—'}</td>)}
                    </tr>
                  </>
                ) : (
                  <tr className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    <td className="pt-2 text-center">Tot</td><td className="pt-2 text-center">{frontPar}</td><td />
                    {namedTees.map(t => <td key={t.name} className="pt-2 text-center">{sumYards(holes, t.name) || '—'}</td>)}
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </section>
        {errors.save && <p className="text-red-500 text-sm text-center">{errors.save}</p>}
      </div>
      <ConfirmModal
        open={!!confirmSwitch}
        title="Switch Hole Count?"
        message={`Switching to ${confirmSwitch} holes will reset all hole data. Continue?`}
        confirmLabel="Reset"
        destructive
        onConfirm={doSwitch}
        onCancel={() => setConfirmSwitch(null)}
      />
      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto">
          <button onClick={handleSave} disabled={saving}
            className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg disabled:opacity-60 active:bg-gray-900 transition-colors">
            {saving ? 'Saving…' : 'Save Course'}
          </button>
        </div>
      </div>
    </div>
  )
}
