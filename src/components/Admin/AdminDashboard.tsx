import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase, rowToSharedCourse, sharedCourseToRow, rowToGamePreset, gamePresetToRow } from '../../lib/supabase'
import { fmtAmount } from '../../lib/gameLogic'
import { parseDollarsToCents } from '../../lib/money'
import { venturaCourses } from '../../data/venturaCourses'
import { ConfirmModal } from '../ConfirmModal'
import { logAdminAction } from '../../lib/adminAudit'
import { UserDetailsModal } from './UserDetailsModal'
import type { Course, Tee, Hole, GamePreset, GameType, StakesMode } from '../../types'

interface Props {
  userId: string
  onBack: () => void
  isHome?: boolean
  onSettings?: () => void
  onLogout?: () => void
}

const GAME_TYPE_LABELS: Record<GameType, string> = {
  skins: '🎰 Skins',
  best_ball: '🤝 Best Ball',
  nassau: '🏳️ Nassau',
  wolf: '🐺 Wolf',
  bingo_bango_bongo: '⭐ BBB',
  hammer: '🔨 Hammer',
  vegas: '🎲 Vegas',
  stableford: '📊 Stableford',
  dots: '🔴 Dots',
  banker: '🏦 Banker',
  quota: '📋 Quota',
}

// ─── Shared Courses Tab ──────────────────────────────────────────────────────

function SharedCoursesTab({ userId }: { userId: string }) {
  const [courses, setCourses] = useState<Course[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [tees, setTees] = useState<Tee[]>([{ name: 'White', rating: 72, slope: 113 }])
  const [holes, setHoles] = useState<Hole[]>(
    Array.from({ length: 18 }, (_, i) => ({
      number: i + 1,
      par: 4,
      strokeIndex: i + 1,
      yardages: { White: 350 },
    }))
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('shared_courses').select('*').order('name').then(({ data }) => {
      if (data) setCourses(data.map(rowToSharedCourse))
    })
  }, [])

  const resetForm = () => {
    setName('')
    setTees([{ name: 'White', rating: 72, slope: 113 }])
    setHoles(Array.from({ length: 18 }, (_, i) => ({
      number: i + 1, par: 4, strokeIndex: i + 1, yardages: { White: 350 },
    })))
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (course: Course) => {
    setName(course.name)
    setTees(course.tees)
    setHoles(course.holes)
    setEditingId(course.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    const course: Course = {
      id: editingId ?? uuidv4(),
      name: name.trim(),
      tees,
      holes,
      createdAt: new Date(),
    }
    if (editingId) {
      await supabase.from('shared_courses').update(sharedCourseToRow(course, userId)).eq('id', editingId)
      setCourses(prev => prev.map(c => c.id === editingId ? course : c))
    } else {
      await supabase.from('shared_courses').insert(sharedCourseToRow(course, userId))
      setCourses(prev => [...prev, course].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setSaving(false)
    resetForm()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this shared course?')) return
    const course = courses.find(c => c.id === id)
    await supabase.from('shared_courses').delete().eq('id', id)
    setCourses(prev => prev.filter(c => c.id !== id))
    logAdminAction({
      action: 'delete_shared_course',
      target_type: 'shared_course',
      target_id: id,
      target_label: course?.name ?? id,
    })
  }

  const handleImport = async (template: typeof venturaCourses[number]) => {
    const course: Course = {
      id: uuidv4(),
      name: template.name,
      tees: template.tees,
      holes: template.holes,
      createdAt: new Date(),
    }
    await supabase.from('shared_courses').insert(sharedCourseToRow(course, userId))
    setCourses(prev => [...prev, course].sort((a, b) => a.name.localeCompare(b.name)))
    setShowImport(false)
  }

  const totalPar = (h: Hole[]) => h.reduce((s, hole) => s + hole.par, 0)

  if (showForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">{editingId ? 'Edit' : 'Add'} Shared Course</h3>
          <button onClick={resetForm} className="text-sm text-gray-500">Cancel</button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Course Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. River Oaks GC"
            className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tees</label>
          {tees.map((tee, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                type="text"
                value={tee.name}
                onChange={e => setTees(prev => prev.map((t, j) => j === i ? { ...t, name: e.target.value } : t))}
                placeholder="Tee name"
                className="flex-1 h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                type="number"
                value={tee.rating}
                onChange={e => setTees(prev => prev.map((t, j) => j === i ? { ...t, rating: parseFloat(e.target.value) || 0 } : t))}
                placeholder="Rating"
                className="w-20 h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                type="number"
                value={tee.slope}
                onChange={e => setTees(prev => prev.map((t, j) => j === i ? { ...t, slope: parseInt(e.target.value) || 0 } : t))}
                placeholder="Slope"
                className="w-20 h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {tees.length > 1 && (
                <button onClick={() => setTees(prev => prev.filter((_, j) => j !== i))}
                  className="text-red-400 text-sm px-2">X</button>
              )}
            </div>
          ))}
          <button
            onClick={() => setTees(prev => [...prev, { name: '', rating: 72, slope: 113 }])}
            className="text-amber-600 text-sm font-semibold"
          >
            + Add Tee
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Holes</label>
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left py-1 px-1">#</th>
                  <th className="text-left py-1 px-1">Par</th>
                  <th className="text-left py-1 px-1">SI</th>
                  {tees.map(t => (
                    <th key={t.name} className="text-left py-1 px-1">{t.name || 'Tee'}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holes.map((hole, i) => (
                  <tr key={i}>
                    <td className="py-0.5 px-1 text-gray-600">{hole.number}</td>
                    <td className="py-0.5 px-1">
                      <select
                        value={hole.par}
                        onChange={e => setHoles(prev => prev.map((h, j) => j === i ? { ...h, par: parseInt(e.target.value) } : h))}
                        className="h-8 px-1 rounded border border-gray-300 text-sm"
                      >
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                      </select>
                    </td>
                    <td className="py-0.5 px-1">
                      <input
                        type="number"
                        min={1}
                        max={18}
                        value={hole.strokeIndex}
                        onChange={e => setHoles(prev => prev.map((h, j) => j === i ? { ...h, strokeIndex: parseInt(e.target.value) || 1 } : h))}
                        className="w-12 h-8 px-1 rounded border border-gray-300 text-sm"
                      />
                    </td>
                    {tees.map(t => (
                      <td key={t.name} className="py-0.5 px-1">
                        <input
                          type="number"
                          value={hole.yardages[t.name] ?? ''}
                          onChange={e => setHoles(prev => prev.map((h, j) => j === i ? {
                            ...h,
                            yardages: { ...h.yardages, [t.name]: parseInt(e.target.value) || 0 },
                          } : h))}
                          className="w-16 h-8 px-1 rounded border border-gray-300 text-sm"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full h-12 bg-gray-800 text-white dark:bg-brass dark:text-navy font-semibold rounded-xl disabled:opacity-50 active:bg-gray-900 transition-colors"
        >
          {saving ? 'Saving...' : editingId ? 'Update Course' : 'Add Course'}
        </button>
      </div>
    )
  }

  if (showImport) {
    const existingNames = new Set(courses.map(c => c.name))
    const available = venturaCourses.filter(t => !existingNames.has(t.name))
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Import from Catalog</h3>
          <button onClick={() => setShowImport(false)} className="text-sm text-gray-500">Cancel</button>
        </div>
        {available.length === 0 && (
          <p className="text-gray-400 text-sm py-4 text-center">All catalog courses already imported.</p>
        )}
        {available.map(t => (
          <button
            key={t.name}
            onClick={() => handleImport(t)}
            className="w-full bg-white rounded-xl p-3 border border-gray-200 text-left active:bg-gray-50"
          >
            <p className="font-semibold text-gray-800 dark:text-gray-100">{t.name}</p>
            <p className="text-sm text-gray-500">Par {totalPar(t.holes)} · {t.tees.map(te => te.name).join(', ')}</p>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => setShowForm(true)}
          className="flex-1 h-10 border-2 border-dashed border-amber-300 text-amber-600 font-semibold rounded-xl text-sm active:bg-amber-50"
        >
          + Add Course
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="flex-1 h-10 border-2 border-dashed border-blue-300 text-blue-700 font-semibold rounded-xl text-sm active:bg-blue-50"
        >
          Import from Catalog
        </button>
      </div>

      {courses.length === 0 && (
        <p className="text-gray-400 text-sm py-4 text-center">No shared courses yet.</p>
      )}

      {courses.map(course => (
        <div key={course.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{course.name}</p>
              <p className="text-sm text-gray-500">Par {totalPar(course.holes)} · {course.tees.map(t => t.name).join(', ')}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => startEdit(course)} className="text-blue-600 text-sm font-medium">Edit</button>
              <button onClick={() => handleDelete(course.id)} className="text-red-400 text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Game Presets Tab ────────────────────────────────────────────────────────

function GamePresetsTab({ userId }: { userId: string }) {
  const [presets, setPresets] = useState<GamePreset[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [presetName, setPresetName] = useState('')
  const [gameType, setGameType] = useState<GameType>('skins')
  const [buyInDollars, setBuyInDollars] = useState('10')
  const [stakesMode, setStakesMode] = useState<StakesMode>('standard')
  const [mode, setMode] = useState<'gross' | 'net'>('net')
  const [carryovers, setCarryovers] = useState(true)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('game_presets').select('*').order('sort_order').then(({ data }) => {
      if (data) setPresets(data.map(rowToGamePreset))
    })
  }, [])

  const resetForm = () => {
    setPresetName('')
    setGameType('skins')
    setBuyInDollars('10')
    setStakesMode('standard')
    setMode('net')
    setCarryovers(true)
    setDescription('')
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (preset: GamePreset) => {
    setPresetName(preset.name)
    setGameType(preset.gameType)
    setBuyInDollars(String(preset.buyInCents / 100))
    setStakesMode(preset.stakesMode)
    setMode((preset.config as any).mode ?? 'net')
    setCarryovers((preset.config as any).carryovers ?? true)
    setDescription(preset.description ?? '')
    setEditingId(preset.id)
    setShowForm(true)
  }

  const buildConfig = () => {
    if (gameType === 'skins') return { mode, carryovers }
    return { mode }
  }

  const handleSave = async () => {
    if (!presetName.trim()) return
    setSaving(true)
    const buyInCents = parseDollarsToCents(buyInDollars)
    const preset: GamePreset = {
      id: editingId ?? uuidv4(),
      createdBy: userId,
      name: presetName.trim(),
      gameType,
      buyInCents,
      stakesMode,
      config: buildConfig() as any,
      description: description.trim() || undefined,
      sortOrder: editingId
        ? presets.find(p => p.id === editingId)?.sortOrder ?? 0
        : presets.length,
    }
    if (editingId) {
      await supabase.from('game_presets').update(gamePresetToRow(preset, userId)).eq('id', editingId)
      setPresets(prev => prev.map(p => p.id === editingId ? preset : p))
    } else {
      await supabase.from('game_presets').insert(gamePresetToRow(preset, userId))
      setPresets(prev => [...prev, preset])
    }
    setSaving(false)
    resetForm()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this preset?')) return
    const preset = presets.find(p => p.id === id)
    await supabase.from('game_presets').delete().eq('id', id)
    setPresets(prev => prev.filter(p => p.id !== id))
    logAdminAction({
      action: 'delete_game_preset',
      target_type: 'game_preset',
      target_id: id,
      target_label: preset?.name ?? id,
    })
  }

  const movePreset = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= presets.length) return
    const next = [...presets]
    ;[next[index], next[target]] = [next[target], next[index]]
    // Update sort orders
    const updated = next.map((p, i) => ({ ...p, sortOrder: i }))
    setPresets(updated)
    // Persist
    await Promise.all(updated.map(p =>
      supabase.from('game_presets').update({ sort_order: p.sortOrder }).eq('id', p.id)
    ))
  }

  if (showForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">{editingId ? 'Edit' : 'Add'} Preset</h3>
          <button onClick={resetForm} className="text-sm text-gray-500">Cancel</button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Preset Name</label>
          <input
            type="text"
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            placeholder="e.g. Friday Skins"
            className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Game Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(GAME_TYPE_LABELS) as GameType[]).map(gt => (
              <button
                key={gt}
                onClick={() => setGameType(gt)}
                className={`h-10 rounded-xl text-sm font-semibold transition-colors ${
                  gameType === gt ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {GAME_TYPE_LABELS[gt]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Buy-in ($)</label>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              value={buyInDollars}
              onChange={e => setBuyInDollars(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Stakes</label>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setStakesMode('standard')}
                className={`h-12 rounded-xl text-sm font-semibold ${stakesMode === 'standard' ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 text-gray-700'}`}
              >
                Standard
              </button>
              <button
                onClick={() => setStakesMode('high_roller')}
                className={`h-12 rounded-xl text-sm font-semibold ${stakesMode === 'high_roller' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                High Roller
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Scoring Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('net')}
              className={`h-10 rounded-xl font-semibold text-sm ${mode === 'net' ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 text-gray-700'}`}
            >
              Net (handicap)
            </button>
            <button
              onClick={() => setMode('gross')}
              className={`h-10 rounded-xl font-semibold text-sm ${mode === 'gross' ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 text-gray-700'}`}
            >
              Gross (raw)
            </button>
          </div>
        </div>

        {gameType === 'skins' && (
          <button
            onClick={() => setCarryovers(v => !v)}
            className={`w-full h-10 rounded-xl font-semibold text-sm border-2 ${
              carryovers ? 'bg-amber-50 border-amber-300 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}
          >
            Carryovers: {carryovers ? 'ON' : 'OFF'}
          </button>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Our regular Friday game"
            className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !presetName.trim()}
          className="w-full h-12 bg-gray-800 text-white dark:bg-brass dark:text-navy font-semibold rounded-xl disabled:opacity-50 active:bg-gray-900 transition-colors"
        >
          {saving ? 'Saving...' : editingId ? 'Update Preset' : 'Add Preset'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowForm(true)}
        className="w-full h-10 border-2 border-dashed border-amber-300 text-amber-600 font-semibold rounded-xl text-sm active:bg-amber-50"
      >
        + Add Preset
      </button>

      {presets.length === 0 && (
        <p className="text-gray-400 text-sm py-4 text-center">No game presets yet.</p>
      )}

      {presets.map((preset, index) => (
        <div key={preset.id} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 dark:text-gray-100">{preset.name}</p>
              <p className="text-sm text-gray-500">
                {GAME_TYPE_LABELS[preset.gameType]} · {fmtAmount(preset.buyInCents, preset.stakesMode)}
                {preset.stakesMode === 'high_roller' && ' · 💎'}
              </p>
              {preset.description && <p className="text-xs text-gray-400 mt-0.5">{preset.description}</p>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => movePreset(index, -1)}
                disabled={index === 0}
                className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 disabled:opacity-30 flex items-center justify-center text-xs"
              >
                ↑
              </button>
              <button
                onClick={() => movePreset(index, 1)}
                disabled={index === presets.length - 1}
                className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 disabled:opacity-30 flex items-center justify-center text-xs"
              >
                ↓
              </button>
              <button onClick={() => startEdit(preset)} className="text-blue-600 text-sm font-medium ml-2">Edit</button>
              <button onClick={() => handleDelete(preset.id)} className="text-red-400 text-sm font-medium ml-1">Delete</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Players Tab (Admin) ──────────────────────────────────────────────────────

function PlayersTab() {
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editHandicap, setEditHandicap] = useState('')
  const [editTee, setEditTee] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_get_all_players').then(({ data, error }) => {
      if (error) {
        console.error('admin_get_all_players RPC error:', error)
        setLoading(false)
        return
      }
      if (data) setPlayers(data)
      setLoading(false)
    })
  }, [])

  const startEdit = (player: any) => {
    setEditTarget(player)
    setEditName(player.name)
    setEditHandicap(String(player.handicap_index ?? ''))
    setEditTee(player.tee ?? 'White')
  }

  const handleSave = async () => {
    if (!editTarget) return
    setSaving(true)
    const { error } = await supabase.rpc('admin_update_player', {
      target_player_id: editTarget.id,
      new_name: editName.trim() || null,
      new_handicap: editHandicap ? parseFloat(editHandicap) : null,
      new_tee: editTee || null,
    })
    if (error) {
      console.error('admin_update_player error:', error)
      alert('Failed to update player. Make sure the admin_update_player RPC is deployed.')
    } else {
      setPlayers(prev => prev.map(p =>
        p.id === editTarget.id
          ? { ...p, name: editName.trim() || p.name, handicap_index: editHandicap ? parseFloat(editHandicap) : p.handicap_index, tee: editTee || p.tee }
          : p
      ))
    }
    setSaving(false)
    setEditTarget(null)
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm">No players found. Make sure the <code className="bg-gray-100 px-1 rounded">admin_get_all_players</code> RPC is deployed.</p>
        <p className="text-gray-400 text-xs mt-2">See <code>supabase-schema-admin.sql</code></p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{players.length} total players</p>
      {players.map((p: any) => (
        <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-3">
          {editTarget?.id === p.id ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Name"
                  className="flex-1 h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="number"
                  value={editHandicap}
                  onChange={e => setEditHandicap(e.target.value)}
                  placeholder="HCP"
                  step="0.1"
                  className="w-20 h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="text"
                  value={editTee}
                  onChange={e => setEditTee(e.target.value)}
                  placeholder="Tee"
                  className="w-20 h-10 px-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditTarget(null)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-sm font-semibold text-white bg-gray-800 px-4 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-800 dark:text-gray-100">{p.name}</p>
                <p className="text-xs text-gray-500">
                  HCP: {p.handicap_index ?? '—'} · Tee: {p.tee ?? '—'}
                  {p.owner_name && <span className="text-gray-400"> · Owner: {p.owner_name}</span>}
                </p>
              </div>
              <button onClick={() => startEdit(p)} className="text-blue-600 text-sm font-medium flex-shrink-0">Edit</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Users Tab (Admin) ────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editTarget, setEditTarget] = useState<any | null>(null)
  const [detailsTarget, setDetailsTarget] = useState<{ id: string; name: string } | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editHandicap, setEditHandicap] = useState('')
  const [editVenmo, setEditVenmo] = useState('')
  const [editZelle, setEditZelle] = useState('')
  const [editCashApp, setEditCashApp] = useState('')
  const [editPaypal, setEditPaypal] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [createHandicap, setCreateHandicap] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_get_all_users').then(({ data, error }) => {
      if (error) {
        console.error('admin_get_all_users RPC error:', error)
        setLoading(false)
        return
      }
      if (data) setUsers(data)
      setLoading(false)
    })
  }, [])

  const toggleAdmin = async (targetUserId: string, currentlyAdmin: boolean) => {
    setToggling(targetUserId)
    const target = users.find(u => u.user_id === targetUserId)
    const { error } = await supabase.rpc('admin_set_user_admin', {
      target_user_id: targetUserId,
      make_admin: !currentlyAdmin,
    })
    if (error) {
      console.error('Toggle admin error:', error)
      alert('Failed to update admin status. Make sure the admin_set_user_admin RPC is deployed.')
    } else {
      setUsers(prev => prev.map(u =>
        u.user_id === targetUserId ? { ...u, is_admin: !currentlyAdmin } : u
      ))
      logAdminAction({
        action: 'toggle_admin',
        target_type: 'user',
        target_id: targetUserId,
        target_label: target?.display_name ?? targetUserId,
        metadata: { granted: !currentlyAdmin },
      })
    }
    setToggling(null)
  }

  const deleteUser = async (targetUserId: string) => {
    setDeleting(true)
    const target = users.find(u => u.user_id === targetUserId)
    const { error } = await supabase.rpc('admin_delete_user', { target_user_id: targetUserId })
    if (error) {
      console.error('Delete user error:', error)
      alert('Failed to delete user. Make sure the admin_delete_user RPC is deployed.')
    } else {
      setUsers(prev => prev.filter(u => u.user_id !== targetUserId))
      logAdminAction({
        action: 'delete_user_profile',
        target_type: 'user',
        target_id: targetUserId,
        target_label: target?.display_name ?? targetUserId,
      })
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  const startEditUser = (u: any) => {
    setEditTarget(u)
    setEditDisplayName(u.display_name ?? '')
    setEditHandicap(u.handicap_index != null ? String(u.handicap_index) : '')
    setEditVenmo(u.venmo_username ?? '')
    setEditZelle(u.zelle_identifier ?? '')
    setEditCashApp(u.cashapp_username ?? '')
    setEditPaypal(u.paypal_email ?? '')
  }

  const handleEditSave = async () => {
    if (!editTarget) return
    setEditSaving(true)
    const { error } = await supabase.rpc('admin_update_user_profile', {
      target_user_id: editTarget.user_id,
      new_display_name: editDisplayName.trim() || null,
      new_handicap: editHandicap ? parseFloat(editHandicap) : null,
      new_venmo: editVenmo.trim() || null,
      new_zelle: editZelle.trim() || null,
      new_cashapp: editCashApp.trim() || null,
      new_paypal: editPaypal.trim() || null,
    })
    if (error) {
      console.error('admin_update_user_profile error:', error)
      alert('Failed to update user. Make sure the admin_update_user_profile RPC is deployed.')
    } else {
      setUsers(prev => prev.map(u =>
        u.user_id === editTarget.user_id
          ? {
              ...u,
              display_name: editDisplayName.trim() || u.display_name,
              handicap_index: editHandicap ? parseFloat(editHandicap) : u.handicap_index,
              venmo_username: editVenmo.trim() || u.venmo_username,
              zelle_identifier: editZelle.trim() || u.zelle_identifier,
              cashapp_username: editCashApp.trim() || u.cashapp_username,
              paypal_email: editPaypal.trim() || u.paypal_email,
            }
          : u
      ))
    }
    setEditSaving(false)
    setEditTarget(null)
  }

  const handleCreateAccount = async () => {
    if (!createEmail.trim() || !createPassword.trim()) return
    setCreating(true)
    const { error } = await supabase.rpc('admin_create_user', {
      user_email: createEmail.trim(),
      user_password: createPassword,
      user_display_name: createDisplayName.trim() || null,
      user_handicap: createHandicap ? parseFloat(createHandicap) : null,
    })
    if (error) {
      console.error('admin_create_user error:', error)
      alert(`Failed to create account: ${error.message}`)
    } else {
      // Refresh user list
      const { data: refreshed } = await supabase.rpc('admin_get_all_users')
      if (refreshed) setUsers(refreshed)
      setShowCreate(false)
      setCreateEmail('')
      setCreatePassword('')
      setCreateDisplayName('')
      setCreateHandicap('')
    }
    setCreating(false)
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (showCreate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">Create Account</h3>
          <button onClick={() => setShowCreate(false)} className="text-sm text-gray-500">Cancel</button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
          <input
            type="email"
            value={createEmail}
            onChange={e => setCreateEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Password</label>
          <input
            type="text"
            value={createPassword}
            onChange={e => setCreatePassword(e.target.value)}
            placeholder="Temporary password"
            className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <p className="text-xs text-gray-400 mt-1">User can change this after first login</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Display Name</label>
            <input
              type="text"
              value={createDisplayName}
              onChange={e => setCreateDisplayName(e.target.value)}
              placeholder="Optional"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Handicap</label>
            <input
              type="number"
              value={createHandicap}
              onChange={e => setCreateHandicap(e.target.value)}
              placeholder="Optional"
              step="0.1"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
        <button
          onClick={handleCreateAccount}
          disabled={creating || !createEmail.trim() || !createPassword.trim()}
          className="w-full h-12 bg-gray-800 text-white dark:bg-brass dark:text-navy font-semibold rounded-xl disabled:opacity-50 active:bg-gray-900 transition-colors"
        >
          {creating ? 'Creating...' : 'Create Account'}
        </button>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setShowCreate(true)}
          className="w-full h-10 border-2 border-dashed border-amber-300 text-amber-600 font-semibold rounded-xl text-sm active:bg-amber-50"
        >
          + Create Account
        </button>
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">No users found. Make sure the <code className="bg-gray-100 px-1 rounded">admin_get_all_users</code> RPC is deployed.</p>
          <p className="text-gray-400 text-xs mt-2">See <code>supabase-schema-admin.sql</code></p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setShowCreate(true)}
        className="w-full h-10 border-2 border-dashed border-amber-300 text-amber-600 font-semibold rounded-xl text-sm active:bg-amber-50"
      >
        + Create Account
      </button>
      <p className="text-xs text-gray-500">{users.length} registered users</p>
      {users.map((u: any) => {
        const isSelf = u.user_id === currentUserId
        const isEditing = editTarget?.user_id === u.user_id
        return (
          <div key={u.user_id} className="bg-white rounded-xl border border-gray-200 p-3">
            {isEditing ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Display Name</label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={e => setEditDisplayName(e.target.value)}
                      className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Handicap</label>
                    <input
                      type="number"
                      value={editHandicap}
                      onChange={e => setEditHandicap(e.target.value)}
                      step="0.1"
                      className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Venmo</label>
                    <input
                      type="text"
                      value={editVenmo}
                      onChange={e => setEditVenmo(e.target.value)}
                      placeholder="@username"
                      className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Zelle</label>
                    <input
                      type="text"
                      value={editZelle}
                      onChange={e => setEditZelle(e.target.value)}
                      placeholder="email or phone"
                      className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">Cash App</label>
                    <input
                      type="text"
                      value={editCashApp}
                      onChange={e => setEditCashApp(e.target.value)}
                      placeholder="$cashtag"
                      className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">PayPal</label>
                    <input
                      type="text"
                      value={editPaypal}
                      onChange={e => setEditPaypal(e.target.value)}
                      placeholder="email"
                      className="w-full h-9 px-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditTarget(null)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
                  <button
                    onClick={handleEditSave}
                    disabled={editSaving}
                    className="text-sm font-semibold text-white bg-gray-800 px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {editSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">{u.display_name || 'No name'}</p>
                  <p className="text-xs text-gray-500 truncate">
                    HCP: {u.handicap_index ?? '—'}
                    {u.venmo_username && ` · Venmo: @${u.venmo_username}`}
                    {u.zelle_identifier && ` · Zelle: ${u.zelle_identifier}`}
                    {u.cashapp_username && ` · Cash App: $${u.cashapp_username}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {u.is_admin && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Admin</span>}
                  <button
                    onClick={() => setDetailsTarget({ id: u.user_id, name: u.display_name || 'Unnamed user' })}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-gray-700 border border-gray-200 active:bg-gray-50"
                  >
                    View
                  </button>
                  {!isSelf && (
                    <>
                      <button
                        onClick={() => startEditUser(u)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-blue-600 border border-blue-200 active:bg-blue-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => toggleAdmin(u.user_id, u.is_admin)}
                        disabled={toggling === u.user_id}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                          u.is_admin
                            ? 'text-red-600 border border-red-200 active:bg-red-50'
                            : 'text-blue-600 border border-blue-200 active:bg-blue-50'
                        }`}
                      >
                        {toggling === u.user_id ? '...' : u.is_admin ? 'Remove Admin' : 'Make Admin'}
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: u.user_id, name: u.display_name || 'this user' })}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-600 border border-red-200 active:bg-red-50"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {isSelf && <span className="text-[10px] text-gray-400">You</span>}
                </div>
              </div>
            )}
          </div>
        )
      })}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete User?"
        message={`Permanently delete ${deleteTarget?.name} and all their rounds, scores, and data? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete User'}
        destructive
        onConfirm={() => { if (deleteTarget) deleteUser(deleteTarget.id) }}
        onCancel={() => setDeleteTarget(null)}
      />
      {detailsTarget && (
        <UserDetailsModal
          targetUserId={detailsTarget.id}
          targetName={detailsTarget.name}
          onClose={() => setDetailsTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Rounds Tab (Admin) ───────────────────────────────────────────────────────

function RoundsTab() {
  const [rounds, setRounds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    supabase.rpc('admin_get_all_rounds').then(({ data, error }) => {
      if (error) {
        console.error('admin_get_all_rounds RPC error:', error)
        setLoading(false)
        return
      }
      if (data) setRounds(data)
      setLoading(false)
    })
  }, [])

  const deleteRound = async (roundId: string) => {
    setDeleting(true)
    const targetLabel = deleteTarget?.name ?? roundId
    const { error } = await supabase.rpc('admin_delete_round', { target_round_id: roundId })
    if (error) {
      console.error('Delete round error:', error)
      alert('Failed to delete round. Make sure the admin_delete_round RPC is deployed.')
    } else {
      setRounds(prev => prev.filter(r => r.id !== roundId))
      logAdminAction({
        action: 'delete_round',
        target_type: 'round',
        target_id: roundId,
        target_label: targetLabel,
      })
    }
    setDeleting(false)
    setDeleteTarget(null)
  }

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (rounds.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm">No rounds found. Make sure the <code className="bg-gray-100 px-1 rounded">admin_get_all_rounds</code> RPC is deployed.</p>
        <p className="text-gray-400 text-xs mt-2">See <code>supabase-schema-admin.sql</code></p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{rounds.length} total rounds</p>
      {rounds.map((r: any) => {
        const courseName = r.course_snapshot?.courseName ?? 'Unknown'
        const playerCount = Array.isArray(r.players) ? r.players.length : 0
        const gameType = r.game?.type ?? null
        const date = r.date ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
        return (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-800 dark:text-gray-100">{courseName}</p>
                <p className="text-xs text-gray-500">
                  {date} · {playerCount} players
                  {gameType && ` · ${gameType.replace(/_/g, ' ')}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  r.status === 'active' ? 'bg-green-100 text-green-700' :
                  r.status === 'complete' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {r.status}
                </span>
                <button
                  onClick={() => setDeleteTarget({ id: r.id, name: `${courseName} (${date})` })}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-red-600 border border-red-200 active:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      })}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Round?"
        message={`Permanently delete ${deleteTarget?.name} and all associated scores, settlements, and data? This cannot be undone.`}
        confirmLabel={deleting ? 'Deleting...' : 'Delete Round'}
        destructive
        onConfirm={() => { if (deleteTarget) deleteRound(deleteTarget.id) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ─── Broadcast Tab (Admin) ────────────────────────────────────────────────────

function BroadcastTab() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [recent, setRecent] = useState<Array<{ id: string; target_label: string; metadata: any; created_at: string }>>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)

  const refreshRecent = async () => {
    const { data } = await supabase
      .from('admin_audit_log')
      .select('id, target_label, metadata, created_at')
      .eq('action', 'send_broadcast')
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setRecent(data as any)
  }

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('onboarding_complete', true)
      .then(({ count }) => setAudienceCount(count ?? 0))
    refreshRecent()
  }, [])

  const send = async () => {
    setSending(true)
    setSendResult(null)
    const { data, error } = await supabase.rpc('admin_send_broadcast', {
      p_title: title.trim(),
      p_body: body.trim() || null,
      p_target_user_ids: null,
    })
    setSending(false)
    setShowConfirm(false)
    if (error) {
      setSendResult({ ok: false, message: error.message })
      return
    }
    const count = typeof data === 'number' ? data : 0
    setSendResult({ ok: true, message: `Sent to ${count} user${count !== 1 ? 's' : ''}.` })
    setTitle('')
    setBody('')
    refreshRecent()
  }

  const canSend = title.trim().length > 0 && !sending

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Compose</p>
          <p className="text-xs text-gray-400 mt-1">
            Goes to every user who finished onboarding.
            {audienceCount !== null && ` Current audience: ${audienceCount} user${audienceCount !== 1 ? 's' : ''}.`}
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. New side games are here"
            maxLength={100}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Body <span className="font-normal normal-case text-gray-400">(optional)</span>
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={4}
            placeholder="Short context for the notification."
            maxLength={500}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-1">{body.length}/500</p>
        </div>

        {sendResult && (
          <p className={`text-sm font-semibold ${sendResult.ok ? 'text-green-600' : 'text-red-600'}`}>
            {sendResult.message}
          </p>
        )}

        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSend}
          className="w-full h-12 bg-gray-800 text-white dark:bg-brass dark:text-navy font-bold rounded-xl disabled:opacity-40 active:bg-gray-900 transition-colors"
        >
          Send broadcast
        </button>

        {showConfirm && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-3">
            <p className="text-sm font-semibold text-amber-900">
              Send "{title}" to {audienceCount ?? '?'} user{audienceCount !== 1 ? 's' : ''}?
            </p>
            <p className="text-xs text-amber-700">No undo. The notification will appear in each user's in-app inbox immediately.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} className="flex-1 h-10 bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-300">Cancel</button>
              <button onClick={send} disabled={sending} className="flex-1 h-10 bg-amber-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 active:bg-amber-700">
                {sending ? 'Sending…' : 'Send now'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent broadcasts</p>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">No broadcasts sent yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map(r => (
              <div key={r.id} className="bg-gray-50 rounded-xl px-3 py-2 text-sm">
                <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">{r.target_label || 'Untitled broadcast'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {r.metadata?.recipient_count !== undefined && ` · ${r.metadata.recipient_count} recipient${r.metadata.recipient_count !== 1 ? 's' : ''}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400 leading-relaxed px-2">
        Broadcasts write to the in-app notifications table today. When native push (N4) ships, the same
        admin_send_broadcast RPC fans out push payloads as well — no UI changes needed.
      </p>
    </div>
  )
}

// ─── System Tab (Admin) ───────────────────────────────────────────────────────

function SystemTab() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc('admin_get_system_stats').then(({ data, error }) => {
      if (error) {
        console.error('admin_get_system_stats RPC error:', error)
        setLoading(false)
        return
      }
      if (data && data.length > 0) setStats(data[0])
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm">System stats unavailable. Deploy the <code className="bg-gray-100 px-1 rounded">admin_get_system_stats</code> RPC.</p>
        <p className="text-gray-400 text-xs mt-2">See <code>supabase-schema-admin.sql</code></p>
      </div>
    )
  }

  const items = [
    { label: 'Total Users', value: stats.total_users, color: 'bg-blue-50 text-blue-700' },
    { label: 'Total Rounds', value: stats.total_rounds, color: 'bg-green-50 text-green-700' },
    { label: 'Active Rounds', value: stats.total_active_rounds, color: 'bg-amber-50 text-amber-700' },
    { label: 'Completed Rounds', value: stats.total_completed_rounds, color: 'bg-purple-50 text-purple-700' },
    { label: 'Shared Courses', value: stats.total_courses, color: 'bg-gray-50 text-gray-700' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(({ label, value, color }) => (
        <div key={label} className={`rounded-2xl p-4 ${color}`}>
          <p className="text-2xl font-bold font-display">{value}</p>
          <p className="text-xs">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

type AdminTab = 'courses' | 'presets' | 'players' | 'users' | 'rounds' | 'broadcast' | 'system'

export function AdminDashboard({ userId, onBack, isHome, onSettings, onLogout }: Props) {
  const [tab, setTab] = useState<AdminTab>('courses')

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'courses', label: 'Courses' },
    { key: 'presets', label: 'Presets' },
    { key: 'players', label: 'Players' },
    { key: 'users', label: 'Users' },
    { key: 'rounds', label: 'Rounds' },
    { key: 'broadcast', label: 'Broadcast' },
    { key: 'system', label: 'System' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
        {!isHome && (
          <button
            onClick={onBack}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-800 text-xl"
            aria-label="Back"
          >
            &#8592;
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-bold">Admin Dashboard</h1>
          <p className="text-amber-400 text-xs">Manage shared data</p>
        </div>
        {isHome && onSettings && (
          <button
            onClick={onSettings}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-800"
            aria-label="Settings"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
        {isHome && onLogout && (
          <button
            onClick={onLogout}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-800"
            aria-label="Log out"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        )}
      </header>

      <div className="px-4 py-4 max-w-2xl mx-auto">
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 h-10 rounded-xl font-semibold text-sm transition-colors flex-shrink-0 ${
                tab === t.key ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-white text-gray-700 border border-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'courses' && <SharedCoursesTab userId={userId} />}
        {tab === 'presets' && <GamePresetsTab userId={userId} />}
        {tab === 'players' && <PlayersTab />}
        {tab === 'users' && <UsersTab currentUserId={userId} />}
        {tab === 'rounds' && <RoundsTab />}
        {tab === 'broadcast' && <BroadcastTab />}
        {tab === 'system' && <SystemTab />}
      </div>
    </div>
  )
}
