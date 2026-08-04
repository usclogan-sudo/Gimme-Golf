import { useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase, courseToRow, playerToRow, roundToRow, roundPlayerToRow, buyInToRow, rowToCourse, rowToPlayer, rowToSharedCourse, rowToGamePreset, rowToUserProfile, generateInviteCode } from '../../lib/supabase'
import { safeWrite } from '../../lib/safeWrite'
import { reportSupabaseError } from '../../lib/sentry'
import { SHOW_HOLE_BETS, SHOW_EXTRA_GAMES, SHOW_BEST_BALL_STROKE_PLAY } from '../../lib/featureFlags'
import { fmtMoney, fmtAmount, JUNK_LABELS } from '../../lib/gameLogic'
import { parseDollarsToCents, parsePointsValue } from '../../lib/money'
import { venturaCourses } from '../../data/venturaCourses'
import { NearMeCourses } from '../NearMeCourses/NearMeCourses'
import { GameRulesModal } from '../GameRulesModal'
import { Tooltip } from '../ui/Tooltip'
import type {
  Course,
  Player,
  Round,
  Game,
  GamePreset,
  SkinsConfig,
  BestBallConfig,
  NassauConfig,
  WolfConfig,
  BBBConfig,
  HammerConfig,
  VegasConfig,
  StablefordConfig,
  DotsConfig,
  DotType,
  BankerConfig,
  QuotaConfig,
  JunkConfig,
  JunkType,
  BuyIn,
  GameType,
  StakesMode,
  HolesMode,
} from '../../types'

interface Props {
  userId: string
  onStart: (roundId: string) => void
  onCancel: () => void
  onAddCourse: () => void
  initialStakesMode?: StakesMode
  templateRound?: Round | null
}

// Feature flag: hide alternate stakes modes from the choose-game screen.
// All rounds default to "standard" while this is false. Code paths for
// 'high_roller' and 'points' stay intact so we can re-enable by flipping
// this constant — no other changes needed.
const SHOW_ALT_STAKES_MODES = false

const STEP_ORDER = ['course', 'players', 'groups', 'game', 'money'] as const
const STEP_LABELS: Record<string, string> = {
  course: 'Course',
  players: 'Players',
  groups: 'Groups',
  game: 'Game',
  money: 'Stakes',
}

function StepIndicator({ current, skipGroups, stakesMode }: { current: string; skipGroups: boolean; stakesMode?: StakesMode }) {
  const steps = STEP_ORDER.filter(s => !(s === 'groups' && skipGroups))
  const currentIdx = steps.indexOf(current as any)
  const isHR = stakesMode === 'high_roller'
  const goldColor = isHR ? '#fbbf24' : '#f59e0b'

  return (
    <div className="py-4 px-4 bg-white/5 relative z-0">
      <div className="max-w-2xl mx-auto">
        {/* Dots and connecting lines */}
        <div className="flex items-center justify-between relative">
          {steps.map((s, i) => {
            const isActive = s === current
            const isDone = i < currentIdx
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                {/* Dot */}
                <div className="relative z-[1] flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                      isDone
                        ? 'border-transparent'
                        : isActive
                        ? 'border-transparent shadow-lg shadow-amber-500/30'
                        : 'border-gray-500 bg-transparent'
                    }`}
                    style={
                      isDone
                        ? { background: goldColor }
                        : isActive
                        ? { background: goldColor, transform: 'scale(1.15)' }
                        : undefined
                    }
                  >
                    {isDone ? (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={`text-xs font-bold ${isActive ? 'text-white' : 'text-gray-400'}`}>{i + 1}</span>
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold mt-1.5 transition-colors ${
                    isDone ? 'text-amber-400' : isActive ? 'text-amber-300' : 'text-gray-500'
                  }`}>
                    {STEP_LABELS[s]}
                  </span>
                </div>
                {/* Connecting line */}
                {i < steps.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1 -mt-5 transition-colors" style={{ background: i < currentIdx ? goldColor : '#4b5563' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Default buy-in values when stakes mode changes
const DEFAULT_BUY_IN: Record<StakesMode, string> = { standard: '10', high_roller: '100', points: '25' }

// ─── Step 1: Course Picker ────────────────────────────────────────────────────

function CoursePicker({
  userId,
  onSelect,
  onAddCourse,
  onCancel,
  stakesMode,
}: {
  userId: string
  onSelect: (course: Course) => void
  onAddCourse: () => void
  onCancel: () => void
  stakesMode: StakesMode
}) {
  const [query, setQuery] = useState('')
  const [selecting, setSelecting] = useState<string | null>(null)
  const [savedCourses, setSavedCourses] = useState<Course[]>([])
  const [sharedCourses, setSharedCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const headerClass = stakesMode === 'high_roller' ? 'hr-header' : 'app-header'

  useEffect(() => {
    Promise.all([
      supabase.from('courses').select('*').order('name'),
      supabase.from('shared_courses').select('*').order('name').limit(500),
    ]).then(([coursesRes, sharedRes]) => {
      if (coursesRes.data) setSavedCourses(coursesRes.data.map(rowToCourse))
      if (sharedRes.data) setSharedCourses(sharedRes.data.map(rowToSharedCourse))
      setLoading(false)
    })
  }, [])

  // Merge saved courses with shared + catalog, deduplicating by name
  const savedNames = new Set(savedCourses.map(c => c.name))
  const sharedOnly = sharedCourses.filter(c => !savedNames.has(c.name))
  const allNames = new Set([...savedNames, ...sharedOnly.map(c => c.name)])
  const catalogOnly = venturaCourses.filter(t => !allNames.has(t.name))

  type CourseItem = { id: string; name: string; city?: string; par: number; tees: string; source: 'saved' | 'shared' | 'catalog'; dbCourse?: Course; templateName?: string }

  const allCourses: CourseItem[] = [
    ...savedCourses.map(c => ({
      id: c.id,
      name: c.name,
      par: c.holes.reduce((s, h) => s + h.par, 0),
      tees: c.tees.map(t => t.name).join(', '),
      source: 'saved' as const,
      dbCourse: c,
    })),
    ...sharedOnly.map(c => ({
      id: `shared-${c.id}`,
      name: c.name,
      par: c.holes.reduce((s, h) => s + h.par, 0),
      tees: c.tees.map(t => t.name).join(', '),
      source: 'shared' as const,
      dbCourse: c,
    })),
    ...catalogOnly.map(t => ({
      id: `catalog-${t.name}`,
      name: t.name,
      city: t.city,
      par: t.holes.reduce((s, h) => s + h.par, 0),
      tees: t.tees.map(t => t.name).join(', '),
      source: 'catalog' as const,
      templateName: t.name,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const filtered = query.trim()
    ? allCourses.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.city ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : allCourses

  const handleSelect = async (item: CourseItem) => {
    if (selecting) return
    if (item.source === 'saved' && item.dbCourse) {
      onSelect(item.dbCourse)
      return
    }
    // Shared or catalog course — save to user's courses DB first, then select
    setSelecting(item.id)
    if (item.source === 'shared' && item.dbCourse) {
      const course: Course = {
        id: uuidv4(),
        name: item.dbCourse.name,
        tees: item.dbCourse.tees,
        holes: item.dbCourse.holes,
        createdAt: new Date(),
      }
      // Fire-and-forget — course snapshot is stored in the round, so proceed even if save fails
      safeWrite(supabase.from('courses').insert(courseToRow(course, userId)), 'insert shared course')
        .catch(() => {})
      onSelect(course)
      return
    }
    const template = venturaCourses.find(t => t.name === item.templateName)!
    const course: Course = {
      id: uuidv4(),
      name: template.name,
      tees: template.tees,
      holes: template.holes,
      createdAt: new Date(),
    }
    safeWrite(supabase.from('courses').insert(courseToRow(course, userId)), 'insert template course')
      .catch(() => {})
    onSelect(course)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      <header className={`${headerClass} text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3`}>
        <button
          onClick={onCancel}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl"
          aria-label="Cancel"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold">Select Course</h1>
          {stakesMode === 'high_roller' && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(135deg,#d97706,#fbbf24)', color: '#000' }}>
              💎 HIGH ROLLER
            </span>
          )}
        </div>
      </header>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-3">
        <NearMeCourses onAddCourse={onAddCourse} />

        <input
          type="text"
          placeholder="Search courses…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
        />

        <div className="space-y-2">
          {filtered.map(course => (
            <button
              key={course.id}
              onClick={() => handleSelect(course)}
              disabled={!!selecting}
              className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left active:bg-gray-50 disabled:opacity-60"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800">{course.name}</p>
                    {course.source === 'shared' && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Shared</span>
                    )}
                    {course.source === 'catalog' && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Catalog</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Par {course.par} · {course.tees}
                    {course.city && course.source === 'catalog' && (
                      <span className="ml-1 text-gray-400">· {course.city}</span>
                    )}
                  </p>
                </div>
                {selecting === course.id && (
                  <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                )}
              </div>
            </button>
          ))}

          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-400 py-8">No courses match "{query}"</p>
          )}
        </div>

        <button
          onClick={onAddCourse}
          className="w-full h-12 border-2 border-dashed border-amber-300 text-amber-600 font-semibold rounded-2xl active:bg-amber-50"
        >
          + Add Custom Course
        </button>
      </div>
    </div>
  )
}

// ─── Step 2: Player Picker ────────────────────────────────────────────────────

function PlayerPicker({
  userId,
  course,
  onNext,
  onBack,
  stakesMode,
  preSelectedIds,
  stepIndicator,
  playerTees,
  onPlayerTeesChange,
}: {
  userId: string
  course: Course
  onNext: (players: Player[]) => void
  onBack: () => void
  stakesMode: StakesMode
  preSelectedIds?: string[]
  stepIndicator?: React.ReactNode
  playerTees: Record<string, string>
  onPlayerTeesChange: (tees: Record<string, string>) => void
}) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preSelectedIds ?? []))
  const [query, setQuery] = useState('')
  const [recentFriendIds, setRecentFriendIds] = useState<Set<string>>(new Set())
  const [showAllPlayers, setShowAllPlayers] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newHcp, setNewHcp] = useState('')
  const [newTee, setNewTee] = useState(course.tees[0]?.name ?? 'White')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingPlayers, setLoadingPlayers] = useState(true)

  const MAX_PLAYERS = 6
  const headerClass = stakesMode === 'high_roller' ? 'hr-header' : 'app-header'

  useEffect(() => {
    // Fetch registered users from user_profiles (display_name IS NOT NULL = completed onboarding)
    const loadPlayers = async () => {
      const [profilesRes, guestsRes] = await Promise.all([
        supabase.from('user_profiles').select('*').not('display_name', 'is', null).limit(200),
        supabase.from('players').select('*').eq('user_id', userId).order('name'),
      ])

      const registeredPlayers: Player[] = (profilesRes.data ?? []).map((row: any) => {
        const profile = rowToUserProfile(row)
        return {
          id: profile.userId,
          name: profile.displayName!,
          handicapIndex: profile.handicapIndex ?? 0,
          tee: profile.tee ?? 'White',
          ghinNumber: '',
        } as Player
      })

      const guestPlayers: Player[] = (guestsRes.data ?? []).map(rowToPlayer)

      // Deduplicate: registered users take priority, guests that share an ID are skipped
      const registeredIds = new Set(registeredPlayers.map(p => p.id))
      const uniqueGuests = guestPlayers.filter(g => !registeredIds.has(g.id))

      const all = [...registeredPlayers, ...uniqueGuests].sort((a, b) => a.name.localeCompare(b.name))
      setAllPlayers(all)

      // Auto-select the logged-in user if no pre-selected IDs provided
      if (!preSelectedIds || preSelectedIds.length === 0) {
        const me = all.find(p => p.id === userId)
        if (me) {
          setSelectedIds(prev => {
            const next = new Set(prev)
            next.add(me.id)
            return next
          })
        }
      }

      // Fetch recent friends — player IDs from user's last 5 rounds
      try {
        const { data: recentRounds } = await supabase
          .from('rounds')
          .select('id')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(5)
        if (recentRounds && recentRounds.length > 0) {
          const roundIds = recentRounds.map((r: any) => r.id)
          const { data: rpData } = await supabase
            .from('round_players')
            .select('player_id')
            .in('round_id', roundIds)
          if (rpData) {
            const friendIds = new Set<string>()
            for (const rp of rpData) {
              const pid = (rp as any).player_id
              if (pid && pid !== userId) friendIds.add(pid)
            }
            setRecentFriendIds(friendIds)
          }
        }
      } catch {
        // Non-critical — continue without recent friends
      }
      setLoadingPlayers(false)
    }
    loadPlayers()
  }, [userId])

  // When searching, show all players flat (no tiers)
  const isSearching = query.trim().length > 0
  const byName = (a: Player, b: Player) => a.name.localeCompare(b.name)
  const filtered = isSearching
    ? allPlayers.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).sort(byName)
    : allPlayers

  // Tier the players for non-search display; sort within each tier so 16+ rosters scan cleanly.
  const me = allPlayers.find(p => p.id === userId)
  const friends = allPlayers.filter(p => p.id !== userId && recentFriendIds.has(p.id)).sort(byName).slice(0, 10)
  const others = allPlayers.filter(p => p.id !== userId && !recentFriendIds.has(p.id)).sort(byName)

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        onPlayerTeesChange((() => {
          const c = { ...playerTees }
          delete c[id]
          return c
        })())
      } else if (next.size < MAX_PLAYERS) {
        next.add(id)
      }
      return next
    })
  }

  const handleAddPlayer = async () => {
    if (!newName.trim()) { setAddError('Name is required'); return }
    const hcp = newHcp.trim() === '' ? 0 : parseFloat(newHcp)
    if (isNaN(hcp) || hcp < -10 || hcp > 54) { setAddError('Handicap must be between -10 and 54'); return }
    setSaving(true)
    try {
      const newPlayer: Player = { id: uuidv4(), name: newName.trim(), handicapIndex: hcp, tee: newTee, ghinNumber: '', createdAt: new Date() }
      const { error: err } = await supabase.from('players').insert(playerToRow(newPlayer, userId))
      if (err) throw err
      setAllPlayers(prev => [...prev, newPlayer].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedIds(prev => { const n = new Set(prev); n.add(newPlayer.id); return n })
      setNewName(''); setNewHcp(''); setAddError(''); setShowAddForm(false)
    } catch { setAddError('Failed to save. Try again.') }
    finally { setSaving(false) }
  }

  const handleNext = () => {
    const selected = allPlayers
      .filter(p => selectedIds.has(p.id))
      .map(p => ({ ...p, tee: playerTees[p.id] ?? p.tee }))
    onNext(selected)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
      <header className={`${headerClass} text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3`}>
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl"
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold">Select Players</h1>
          <p className="text-gray-300 text-xs truncate">{course.name}</p>
        </div>
      </header>
      {stepIndicator}

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-3">
        {showAddForm ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <p className="font-semibold text-gray-700 text-sm">Quick Add Guest Player</p>
            <input
              type="text"
              placeholder="Name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="number"
              inputMode="decimal"
              placeholder="Handicap (optional)"
              value={newHcp}
              onChange={e => setNewHcp(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <select
              value={newTee}
              onChange={e => setNewTee(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {course.tees.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
            {addError && <p className="text-red-500 text-sm">{addError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAddForm(false); setNewName(''); setNewHcp(''); setAddError('') }}
                className="flex-1 h-11 border border-gray-300 rounded-xl text-gray-600 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPlayer}
                disabled={saving}
                className="flex-1 h-11 bg-gray-800 text-white rounded-xl font-semibold disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            disabled={selectedIds.size >= MAX_PLAYERS}
            className="w-full h-12 border-2 border-dashed border-amber-300 text-amber-600 font-semibold rounded-2xl active:bg-amber-50 disabled:opacity-40"
          >
            + Add Guest Player
          </button>
        )}

        <input
          type="text"
          placeholder="Search players…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
        />

        <p className="text-xs text-gray-500 px-1">
          {selectedIds.size === 0
            ? `Select up to ${MAX_PLAYERS} players`
            : `${selectedIds.size} player${selectedIds.size !== 1 ? 's' : ''} selected`}
          {selectedIds.size === MAX_PLAYERS && ' (max)'}
        </p>

        {loadingPlayers && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loadingPlayers && (() => {
          const renderPlayerCard = (player: Player, badge?: string) => {
            const selected = selectedIds.has(player.id)
            const activeTee = playerTees[player.id] ?? player.tee
            return (
              <div
                key={player.id}
                className={`bg-white rounded-2xl shadow-sm border transition-colors ${
                  selected ? 'border-amber-400 bg-amber-50' : 'border-gray-100'
                }`}
              >
                <button
                  onClick={() => toggle(player.id)}
                  disabled={!selected && selectedIds.size >= MAX_PLAYERS}
                  className="w-full p-4 text-left flex items-center gap-3 disabled:opacity-40"
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selected ? 'border-gray-500 bg-amber-600' : 'border-gray-300'
                    }`}
                  >
                    {selected && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800">
                      {player.name}
                      {badge && (
                        <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{badge}</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">HCP {player.handicapIndex}</p>
                  </div>
                </button>

                {selected && course.tees.length > 1 && (
                  <div className="px-4 pb-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500">Tee:</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {course.tees.map(t => (
                        <button
                          key={t.name}
                          onClick={() => onPlayerTeesChange({ ...playerTees, [player.id]: t.name })}
                          className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                            activeTee === t.name
                              ? 'bg-gray-800 text-white'
                              : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                          }`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          }

          if (isSearching) {
            // Flat search results
            return filtered.length > 0 ? (
              <div className="space-y-2">{filtered.map(p => renderPlayerCard(p))}</div>
            ) : (
              <p className="text-center text-gray-400 py-8">No players match "{query}"</p>
            )
          }

          // Tiered display
          return (
            <div className="space-y-4">
              {/* Tier 1: You */}
              {me && (
                <div className="space-y-2">
                  {renderPlayerCard(me, 'You')}
                </div>
              )}

              {/* Tier 2: Recent Friends */}
              {friends.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Recent Friends</p>
                  {friends.map(p => renderPlayerCard(p))}
                </div>
              )}

              {/* Tier 3: All Other Players */}
              {others.length > 0 && (
                <div className="space-y-2">
                  {!showAllPlayers ? (
                    <button
                      onClick={() => setShowAllPlayers(true)}
                      className="w-full text-sm font-semibold text-gray-500 py-3 rounded-xl bg-gray-100 active:bg-gray-200 transition-colors"
                    >
                      Show all players ({others.length} more)
                    </button>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">All Players</p>
                      {others.map(p => renderPlayerCard(p))}
                    </>
                  )}
                </div>
              )}

              {allPlayers.length === 0 && (
                <p className="text-center text-gray-400 py-8">No players found</p>
              )}
            </div>
          )
        })()}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleNext}
            disabled={selectedIds.size < 2}
            className="w-full h-14 bg-gray-800 text-white text-lg font-bold rounded-2xl shadow-lg disabled:opacity-40 active:bg-gray-900 transition-colors"
          >
            {selectedIds.size < 2
              ? 'Select at Least 2 Players'
              : `Next · ${selectedIds.size} Player${selectedIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 3: Group Assignment ─────────────────────────────────────────────────

const MAX_PER_GROUP_CONST = 5

function GroupAssignment({
  players,
  initialGroups,
  onNext,
  onBack,
  stakesMode,
  stepIndicator,
}: {
  players: Player[]
  initialGroups?: Record<string, number>
  onNext: (groups: Record<string, number>) => void
  onBack: () => void
  stakesMode: StakesMode
  stepIndicator?: React.ReactNode
}) {
  const [groups, setGroups] = useState<Record<string, number>>(() => {
    if (initialGroups) return { ...initialGroups }
    // Auto-assign round-robin
    const numGroups = Math.ceil(players.length / MAX_PER_GROUP_CONST)
    const g: Record<string, number> = {}
    players.forEach((p, i) => { g[p.id] = (i % numGroups) + 1 })
    return g
  })

  const numGroups = Math.max(...Object.values(groups), 1)
  const groupNumbers = Array.from({ length: numGroups }, (_, i) => i + 1)

  const autoAssign = () => {
    const ng = Math.ceil(players.length / MAX_PER_GROUP_CONST)
    const g: Record<string, number> = {}
    players.forEach((p, i) => { g[p.id] = (i % ng) + 1 })
    setGroups(g)
  }

  const addGroup = () => {
    // Just makes the UI show an extra group number option
    const maxGroup = Math.max(...Object.values(groups), 0)
    if (maxGroup < 4) {
      // Move the first player from the largest group to the new group
      const newGroupNum = maxGroup + 1
      const largestGroup = groupNumbers.reduce((best, gn) => {
        const count = players.filter(p => groups[p.id] === gn).length
        const bestCount = players.filter(p => groups[p.id] === best).length
        return count > bestCount ? gn : best
      }, 1)
      const playerToMove = players.find(p => groups[p.id] === largestGroup)
      if (playerToMove) {
        setGroups(prev => ({ ...prev, [playerToMove.id]: newGroupNum }))
      }
    }
  }

  // Validation
  const groupSizes = groupNumbers.map(gn => players.filter(p => groups[p.id] === gn).length)
  const allValid = groupSizes.every(s => s >= 1 && s <= MAX_PER_GROUP_CONST)
  const allAssigned = players.every(p => groups[p.id] != null)

  const headerClass = stakesMode === 'high_roller' ? 'hr-header' : 'app-header'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
      <header className={`${headerClass} text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3`}>
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl"
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold">Assign Groups</h1>
          <p className="text-gray-300 text-xs">{players.length} players · {numGroups} group{numGroups !== 1 ? 's' : ''}</p>
        </div>
      </header>
      {stepIndicator}

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        <div className="flex gap-2">
          <button
            onClick={autoAssign}
            className="flex-1 h-10 bg-amber-50 border border-amber-200 text-amber-600 text-sm font-semibold rounded-xl active:bg-amber-100"
          >
            Auto-assign
          </button>
          {numGroups < 4 && (
            <button
              onClick={addGroup}
              className="h-10 px-4 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-200"
            >
              + Group
            </button>
          )}
        </div>

        {groupNumbers.map(gn => {
          const groupPlayers = players.filter(p => groups[p.id] === gn)
          return (
            <div key={gn} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-800">Group {gn}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  groupPlayers.length > MAX_PER_GROUP_CONST ? 'bg-red-100 text-red-600' :
                  groupPlayers.length === 0 ? 'bg-red-100 text-red-600' :
                  'bg-amber-100 text-amber-600'
                }`}>
                  {groupPlayers.length}/{MAX_PER_GROUP_CONST}
                </span>
              </div>
              {groupPlayers.map(player => (
                <div key={player.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{player.name}</p>
                    <p className="text-xs text-gray-500">HCP {player.handicapIndex}</p>
                  </div>
                  <div className="flex gap-1">
                    {groupNumbers.map(targetGn => (
                      <button
                        key={targetGn}
                        onClick={() => setGroups(prev => ({ ...prev, [player.id]: targetGn }))}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                          groups[player.id] === targetGn
                            ? 'bg-gray-800 text-white'
                            : 'bg-white border border-gray-200 text-gray-500'
                        }`}
                      >
                        {targetGn}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {groupPlayers.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-2">No players assigned</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => onNext(groups)}
            disabled={!allValid || !allAssigned}
            className="w-full h-14 bg-gray-800 text-white text-lg font-bold rounded-2xl shadow-lg disabled:opacity-40 active:bg-gray-900 transition-colors"
          >
            {!allValid ? 'Fix group sizes (1–5 each)' : 'Next: Choose Game'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 4: Game Setup ───────────────────────────────────────────────────────

function GameSetup({
  players,
  initialStakesMode,
  onNext,
  onBack,
  initialGame,
  initialJunkConfig,
  stepIndicator,
}: {
  players: Player[]
  initialStakesMode: StakesMode
  onNext: (game: Game, junkConfig?: JunkConfig) => void
  onBack: () => void
  initialGame?: Game
  initialJunkConfig?: JunkConfig
  stepIndicator?: React.ReactNode
}) {
  const [gamePresets, setGamePresets] = useState<GamePreset[]>([])
  const [stakesMode, setStakesMode] = useState<StakesMode>(initialGame?.stakesMode ?? initialStakesMode)
  const [type, setType] = useState<GameType>(initialGame?.type ?? 'skins')
  const PRIMARY_GAMES: GameType[] = ['skins', 'best_ball']
  const [showAllGames, setShowAllGames] = useState(() => {
    // Auto-show all if initial game is not a primary type
    if (initialGame && !['skins', 'best_ball'].includes(initialGame.type)) return true
    return false
  })
  const [buyInDollars, setBuyInDollars] = useState(
    initialGame ? String(initialGame.buyInCents / 100) : DEFAULT_BUY_IN[initialStakesMode]
  )

  // Skins
  const [carryovers, setCarryovers] = useState(
    initialGame?.type === 'skins' ? (initialGame.config as any).carryovers : true
  )

  // Best Ball
  const [bbScoring, setBbScoring] = useState<'match' | 'total'>(
    initialGame?.type === 'best_ball' ? (initialGame.config as any).scoring : 'match'
  )
  const [teams, setTeams] = useState<Record<string, 'A' | 'B'>>(() => {
    if (initialGame?.type === 'best_ball') return (initialGame.config as any).teams ?? {}
    const t: Record<string, 'A' | 'B'> = {}
    players.forEach((p, i) => (t[p.id] = i % 2 === 0 ? 'A' : 'B'))
    return t
  })

  // Wolf
  const [wolfOrder, setWolfOrder] = useState<string[]>(() =>
    initialGame?.type === 'wolf' ? (initialGame.config as any).wolfOrder : players.map(p => p.id)
  )
  // Keep wolfOrder in sync when the roster changes after game selection: preserve
  // existing order, drop removed players, append new ones. Prevents a stale/ghost
  // wolf id that would silently void that hole for everyone.
  const wolfPlayerKey = players.map(p => p.id).join(',')
  useEffect(() => {
    const ids = players.map(p => p.id)
    setWolfOrder(prev => {
      const kept = prev.filter(id => ids.includes(id))
      const next = [...kept, ...ids.filter(id => !kept.includes(id))]
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wolfPlayerKey])

  // Hammer
  const [hammerBaseValueDollars, setHammerBaseValueDollars] = useState(
    initialGame?.type === 'hammer' ? String((initialGame.config as any).baseValueCents / 100) : '1'
  )
  const [hammerMaxPresses, setHammerMaxPresses] = useState<number | undefined>(
    initialGame?.type === 'hammer' ? (initialGame.config as any).maxPresses : undefined
  )

  // Vegas
  const [vegasTeams, setVegasTeams] = useState<Record<string, 'A' | 'B'>>(() => {
    if (initialGame?.type === 'vegas') return (initialGame.config as any).teams ?? {}
    const t: Record<string, 'A' | 'B'> = {}
    players.forEach((p, i) => (t[p.id] = i % 2 === 0 ? 'A' : 'B'))
    return t
  })

  // Dots
  const [dotsValueDollars, setDotsValueDollars] = useState(
    initialGame?.type === 'dots' ? String((initialGame.config as any).valueCentsPerDot / 100) : '1'
  )

  // Banker
  const [bankerOrder, setBankerOrder] = useState<string[]>(() =>
    initialGame?.type === 'banker' ? (initialGame.config as any).bankerOrder : players.map(p => p.id)
  )

  // Game rules modal
  const [rulesModalType, setRulesModalType] = useState<GameType | null>(null)

  // Junks (side bets, independent of main game)
  const [junksEnabled, setJunksEnabled] = useState(!!initialJunkConfig)
  const [junkValueDollars, setJunkValueDollars] = useState(
    initialJunkConfig ? String(initialJunkConfig.valueCents / 100) : '1'
  )
  const [junkTypes, setJunkTypes] = useState<Set<JunkType>>(
    new Set(initialJunkConfig?.types ?? ['sandy', 'greenie', 'snake'])
  )

  const toggleJunkType = (jt: JunkType) => {
    setJunkTypes(prev => {
      const next = new Set(prev)
      if (next.has(jt)) next.delete(jt)
      else next.add(jt)
      return next
    })
  }

  useEffect(() => {
    supabase.from('game_presets').select('*').order('sort_order').then(({ data, error }) => {
      if (data) setGamePresets(data.map(rowToGamePreset))
      if (error) console.warn('Failed to load game presets:', error.message)
    })
  }, [])

  const applyPreset = (preset: GamePreset) => {
    setType(preset.gameType)
    if (!PRIMARY_GAMES.includes(preset.gameType)) setShowAllGames(true)
    setStakesMode(preset.stakesMode)
    setBuyInDollars(String(preset.buyInCents / 100))
    const cfg = preset.config as any
    if (preset.gameType === 'skins') {
      setCarryovers(cfg.carryovers ?? true)
    } else if (preset.gameType === 'best_ball') {
      setBbScoring(cfg.scoring ?? 'match')
    }
  }

  const handleStakesChange = (mode: StakesMode) => {
    setStakesMode(mode)
    setBuyInDollars(DEFAULT_BUY_IN[mode])
  }

  // In points mode, buyInCents stores raw point value; in money mode, stores cents
  const buyInCents = stakesMode === 'points'
    ? parsePointsValue(buyInDollars)
    : parseDollarsToCents(buyInDollars)

  const bestBallAllowed = players.length >= 2 && players.length % 2 === 0
  const wolfAllowed = players.length >= 3
  const hammerAllowed = players.length === 2
  const vegasAllowed = players.length >= 2 && players.length % 2 === 0
  const bankerAllowed = players.length >= 3

  const teamCounts = useMemo(() => {
    let a = 0, b = 0
    for (const p of players) {
      if (teams[p.id] === 'A') a++
      else b++
    }
    return { a, b }
  }, [players, teams])
  const teamsValid = teamCounts.a >= 1 && teamCounts.a === teamCounts.b

  const vegasTeamCounts = useMemo(() => {
    let a = 0, b = 0
    for (const p of players) {
      if (vegasTeams[p.id] === 'A') a++
      else b++
    }
    return { a, b }
  }, [players, vegasTeams])
  const vegasTeamsValid = vegasTeamCounts.a >= 1 && vegasTeamCounts.a === vegasTeamCounts.b

  const canContinue =
    (type === 'hammer' || type === 'dots' || buyInCents >= 0) &&
    (type === 'skins' ||
      type === 'nassau' ||
      type === 'bingo_bango_bongo' ||
      type === 'stableford' ||
      type === 'quota' ||
      type === 'dots' ||
      (type === 'best_ball' && bestBallAllowed && teamsValid) ||
      (type === 'wolf' && wolfAllowed) ||
      (type === 'hammer' && hammerAllowed) ||
      (type === 'vegas' && vegasAllowed && vegasTeamsValid) ||
      (type === 'banker' && bankerAllowed))

  const moveWolfPlayer = (index: number, dir: -1 | 1) => {
    const next = [...wolfOrder]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setWolfOrder(next)
  }

  const moveBankerPlayer = (index: number, dir: -1 | 1) => {
    const next = [...bankerOrder]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setBankerOrder(next)
  }

  const makeGame = (): Game => {
    const id = uuidv4()
    if (type === 'skins') {
      const config: SkinsConfig = { mode: 'net', carryovers }
      return { id, type: 'skins', buyInCents, stakesMode, config }
    }
    if (type === 'best_ball') {
      const config: BestBallConfig = { scoring: bbScoring, mode: 'net', teams }
      return { id, type: 'best_ball', buyInCents, stakesMode, config }
    }
    if (type === 'nassau') {
      const config: NassauConfig = { mode: 'net' }
      return { id, type: 'nassau', buyInCents, stakesMode, config }
    }
    if (type === 'wolf') {
      const config: WolfConfig = { mode: 'net', wolfOrder }
      return { id, type: 'wolf', buyInCents, stakesMode, config }
    }
    if (type === 'hammer') {
      const baseValueCents = Math.max(1, parseDollarsToCents(hammerBaseValueDollars))
      const config: HammerConfig = { baseValueCents, maxPresses: hammerMaxPresses }
      return { id, type: 'hammer', buyInCents: 0, stakesMode, config }
    }
    if (type === 'vegas') {
      const config: VegasConfig = { mode: 'net', teams: vegasTeams }
      return { id, type: 'vegas', buyInCents, stakesMode, config }
    }
    if (type === 'stableford') {
      const config: StablefordConfig = { mode: 'net' }
      return { id, type: 'stableford', buyInCents, stakesMode, config }
    }
    if (type === 'dots') {
      const valueCentsPerDot = Math.max(1, parseDollarsToCents(dotsValueDollars))
      const activeDots: DotType[] = Array.from(junkTypes) as DotType[]
      const config: DotsConfig = { activeDots, valueCentsPerDot }
      return { id, type: 'dots', buyInCents: 0, stakesMode, config }
    }
    if (type === 'banker') {
      const config: BankerConfig = { mode: 'net', bankerOrder }
      return { id, type: 'banker', buyInCents, stakesMode, config }
    }
    if (type === 'quota') {
      const quotas: Record<string, number> = {}
      for (const p of players) {
        quotas[p.id] = Math.max(0, Math.min(36, Math.round(36 - p.handicapIndex)))
      }
      const config: QuotaConfig = { mode: 'net', quotas }
      return { id, type: 'quota', buyInCents, stakesMode, config }
    }
    // bingo_bango_bongo
    const config: BBBConfig = { mode: 'net' }
    return { id, type: 'bingo_bango_bongo', buyInCents, stakesMode, config }
  }

  const headerClass = stakesMode === 'high_roller' ? 'hr-header' : 'app-header'

  const GameButton = ({
    gameType,
    label,
    disabled = false,
    fullWidth = false,
  }: {
    gameType: GameType
    label: string
    disabled?: boolean
    fullWidth?: boolean
  }) => (
    <div className={`relative ${fullWidth ? 'col-span-2' : ''}`}>
      <button
        onClick={() => !disabled && setType(gameType)}
        disabled={disabled}
        className={`w-full h-14 rounded-xl font-semibold text-sm disabled:opacity-40 transition-colors ${
          type === gameType
            ? stakesMode === 'high_roller'
              ? 'text-black'
              : 'bg-gray-800 text-white'
            : 'bg-gray-100 text-gray-700'
        }`}
        style={type === gameType && stakesMode === 'high_roller'
          ? { background: 'linear-gradient(135deg,#d97706,#fbbf24)' }
          : undefined}
      >
        {label}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setRulesModalType(gameType) }}
        className={`absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
          type === gameType
            ? 'bg-white/20 text-white/80 active:bg-white/30'
            : 'bg-gray-200 text-gray-500 active:bg-gray-300'
        }`}
        aria-label={`${label} rules`}
      >
        ?
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
      <header className={`${headerClass} text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3`}>
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl"
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold">Choose Game</h1>
          {stakesMode === 'high_roller' && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'linear-gradient(135deg,#d97706,#fbbf24)', color: '#000' }}>
              💎 HIGH ROLLER
            </span>
          )}
        </div>
      </header>
      {stepIndicator}

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">

        {/* Quick Pick Presets */}
        {gamePresets.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quick Pick</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {gamePresets.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-gray-800 text-sm font-semibold active:bg-amber-100 transition-colors"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Stakes Mode — alt modes (High Roller, Points) hidden behind
            SHOW_ALT_STAKES_MODES flag. Section disappears entirely when
            only "standard" is available since picking from one option
            isn't useful. Flip the flag to bring back. */}
        {SHOW_ALT_STAKES_MODES && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stakes</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleStakesChange('standard')}
                className={`h-14 rounded-xl font-semibold ${
                  stakesMode === 'standard' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                🎯 Standard
              </button>
              <button
                onClick={() => handleStakesChange('high_roller')}
                className={`h-14 rounded-xl font-bold ${
                  stakesMode === 'high_roller' ? 'text-black' : 'bg-gray-100 text-gray-700'
                }`}
                style={stakesMode === 'high_roller'
                  ? { background: 'linear-gradient(135deg,#d97706,#fbbf24)' }
                  : undefined}
              >
                💎 High Roller
              </button>
              <button
                onClick={() => handleStakesChange('points')}
                className={`h-14 rounded-xl font-semibold ${
                  stakesMode === 'points' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                🏆 Points
              </button>
            </div>
          </section>
        )}

        {/* Game Type */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Game Type</p>
          <div className="grid grid-cols-2 gap-2">
            <GameButton gameType="skins" label="⛳ Skins" />
            <GameButton gameType="best_ball" label="🤝 Best Ball" disabled={!bestBallAllowed} />
          </div>
          {showAllGames && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <GameButton gameType="nassau" label="🏳️ Nassau" />
              <GameButton gameType="wolf" label="🐺 Wolf" disabled={!wolfAllowed} />
              <GameButton gameType="bingo_bango_bongo" label="⭐ BBB" />
              {/* Extra games hidden at launch pending the settlement rework — see featureFlags. */}
              {SHOW_EXTRA_GAMES && (
                <>
                  <GameButton gameType="hammer" label="🔨 Hammer" disabled={!hammerAllowed} />
                  <GameButton gameType="stableford" label="📊 Stableford" />
                  <GameButton gameType="dots" label="🔴 Dots" />
                  <GameButton gameType="banker" label="🏦 Banker" disabled={!bankerAllowed} />
                  <GameButton gameType="quota" label="📋 Quota" />
                </>
              )}
            </div>
          )}
          <button
            onClick={() => setShowAllGames(v => !v)}
            className="w-full text-sm font-semibold text-gray-500 py-2 rounded-xl bg-gray-50 active:bg-gray-100 transition-colors"
          >
            {showAllGames ? 'Hide extra games' : `More Games (${SHOW_EXTRA_GAMES ? 8 : 3} more)`}
          </button>
          {!bestBallAllowed && type === 'best_ball' && (
            <p className="text-sm text-gray-400">Best Ball requires an even number of players (2, 4, 6…).</p>
          )}
          {!vegasAllowed && type === 'vegas' && (
            <p className="text-sm text-gray-400">Vegas requires an even number of players (4 recommended).</p>
          )}
          {!wolfAllowed && type === 'wolf' && (
            <p className="text-sm text-gray-400">Wolf requires at least 3 players.</p>
          )}
          {!bankerAllowed && type === 'banker' && (
            <p className="text-sm text-gray-400">Banker requires at least 3 players.</p>
          )}
          {!hammerAllowed && type === 'hammer' && (
            <p className="text-sm text-gray-400">Hammer requires exactly 2 players.</p>
          )}
        </section>

        {/* Junk Side Bets */}
        {SHOW_HOLE_BETS && (
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Junk Side Bets
                {junksEnabled && junkTypes.size > 0 && (
                  <span className="ml-2 text-amber-600 font-normal">({junkTypes.size} active)</span>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Optional peer-to-peer bets tracked per hole</p>
            </div>
            <div
              role="switch"
              tabIndex={0}
              aria-checked={junksEnabled}
              onClick={() => {
                if (junksEnabled) {
                  setJunkTypes(new Set(['sandy', 'greenie', 'snake']))
                  setJunkValueDollars('1')
                }
                setJunksEnabled(v => !v)
              }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setJunksEnabled(v => !v) } }}
              className={`flex-shrink-0 w-12 h-7 rounded-full p-0.5 cursor-pointer transition-colors flex ${junksEnabled ? 'bg-amber-600 justify-end' : 'bg-gray-300 justify-start'}`}
            >
              <div className="w-6 h-6 bg-white rounded-full shadow" />
            </div>
          </div>

          {junksEnabled && (
            <>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(JUNK_LABELS) as JunkType[]).map(jt => {
                  const info = JUNK_LABELS[jt]
                  const active = junkTypes.has(jt)
                  return (
                    <button
                      key={jt}
                      onClick={() => toggleJunkType(jt)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                        active
                          ? jt === 'snake' ? 'bg-red-100 border-2 border-red-300 text-red-700' : 'bg-amber-100 border-2 border-amber-300 text-gray-800'
                          : 'bg-gray-100 border-2 border-transparent text-gray-500'
                      }`}
                    >
                      {info.emoji} {info.name}
                    </button>
                  )
                })}
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-2">Value per junk</p>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-gray-500">{stakesMode === 'points' ? 'pts' : '$'}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={junkValueDollars}
                    onChange={e => setJunkValueDollars(e.target.value)}
                    className="flex-1 h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-700 space-y-1">
                <p className="font-semibold">How junks work:</p>
                {Array.from(junkTypes).map(jt => {
                  const info = JUNK_LABELS[jt]
                  return <p key={jt}>{info.emoji} <strong>{info.name}</strong> — {info.description}</p>
                })}
                {junkTypes.has('snake') && (
                  <p className="text-red-600 font-medium mt-1">Snake is negative — the player pays everyone else!</p>
                )}
              </div>
            </>
          )}
        </section>
        )}

        {/* Buy-in */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {stakesMode === 'points'
              ? 'Points Per Player'
              : <><Tooltip term="Buy-in">Buy-in Per Player</Tooltip>{type === 'nassau' ? ' (covers all 3 bets)' : ''}</>}
          </p>

          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-500">{stakesMode === 'points' ? 'pts' : '$'}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={buyInDollars}
              onChange={e => setBuyInDollars(e.target.value)}
              className="flex-1 h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="bg-amber-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">{stakesMode === 'points' ? 'Total points' : 'Total pot'}</span>
            <span className="font-bold text-gray-800 text-lg">
              {stakesMode === 'points' ? `${buyInCents * players.length} pts` : fmtMoney(buyInCents * players.length)}
            </span>
          </div>

          {type === 'nassau' && stakesMode !== 'points' && (
            <p className="text-xs text-gray-500">
              = {fmtMoney(Math.floor(buyInCents / 3))} per bet × 3 bets (Front 9, Back 9, Total)
            </p>
          )}
        </section>

        {/* Skins Options */}
        {type === 'skins' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Skins Options</p>
            <button
              onClick={() => setCarryovers((v: boolean) => !v)}
              className={`w-full h-12 rounded-xl font-semibold border-2 ${
                carryovers ? 'bg-amber-50 border-amber-300 text-gray-800' : 'bg-gray-50 border-gray-200 text-gray-600'
              }`}
            >
              Carryovers: {carryovers ? 'ON ✓ (recommended)' : 'OFF'}
            </button>
            <p className="text-sm text-gray-500 bg-gray-50 rounded-xl p-3">
              Lowest score wins the hole.{' '}
              {carryovers ? 'Ties carry the pot forward until someone wins it clean.' : 'Ties push — no carry.'}
            </p>
          </section>
        )}

        {/* Best Ball Options */}
        {type === 'best_ball' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Best Ball Options</p>
            {/* Stroke-Play mode hidden at launch — its scoreboard can contradict the
                payout (see featureFlags). Match Play is the default and unaffected. */}
            {SHOW_BEST_BALL_STROKE_PLAY && (
              <div>
                <p className="text-sm text-gray-600 mb-2">Format</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setBbScoring('match')}
                    className={`h-12 rounded-xl font-semibold text-sm ${bbScoring === 'match' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    Match Play
                  </button>
                  <button onClick={() => setBbScoring('total')}
                    className={`h-12 rounded-xl font-semibold text-sm ${bbScoring === 'total' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'}`}>
                    Stroke Play
                  </button>
                </div>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-600 mb-2">Teams (tap to assign)</p>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map(team => (
                  <div key={team} className={`rounded-xl border-2 p-3 ${team === 'A' ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${team === 'A' ? 'text-blue-700' : 'text-orange-700'}`}>Team {team}</p>
                    <div className="space-y-1.5">
                      {players.map(p => (
                        <button key={p.id}
                          onClick={() => setTeams(prev => ({ ...prev, [p.id]: team }))}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            teams[p.id] === team
                              ? team === 'A' ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white'
                              : 'bg-white text-gray-600 border border-gray-200'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!teamsValid && (
                <p className="text-red-600 text-sm mt-2">
                  Teams must be equal size. ({teamCounts.a} / {teamCounts.b})
                </p>
              )}
            </div>
          </section>
        )}

        {/* Nassau Options */}
        {type === 'nassau' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nassau Options</p>
            <div className="bg-teal-50 rounded-xl p-3 text-sm text-teal-700 space-y-1">
              <p className="font-semibold">3 separate bets:</p>
              <p>• Front 9 — lowest total strokes wins</p>
              <p>• Back 9 — lowest total strokes wins</p>
              <p>• Full round — lowest total strokes wins</p>
            </div>
          </section>
        )}

        {/* Wolf Options */}
        {type === 'wolf' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Wolf Options</p>
            <div>
              <p className="text-sm text-gray-600 mb-2">Wolf Rotation Order</p>
              <p className="text-xs text-gray-400 mb-2">Player 1 is Wolf on hole 1, Player 2 on hole 2, etc.</p>
              <div className="space-y-2">
                {wolfOrder.map((playerId, index) => {
                  const player = players.find(p => p.id === playerId)
                  return (
                    <div key={playerId} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                      <span className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </span>
                      <span className="flex-1 font-medium text-gray-800">{player?.name}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveWolfPlayer(index, -1)}
                          disabled={index === 0}
                          className="w-10 h-10 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-30 flex items-center justify-center text-sm"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveWolfPlayer(index, 1)}
                          disabled={index === wolfOrder.length - 1}
                          className="w-10 h-10 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-30 flex items-center justify-center text-sm"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-sm text-purple-700 space-y-1">
              <p className="font-semibold">How it works:</p>
              <p>• Wolf picks a partner after each tee shot, or goes Lone Wolf</p>
              <p>• Lone Wolf wins: Wolf gets 2× from each opponent</p>
              <p>• Partner wins: Wolf and partner each get 1× from opponents</p>
            </div>
          </section>
        )}

        {/* BBB Options */}
        {type === 'bingo_bango_bongo' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bingo Bango Bongo Options</p>
            <div className="bg-amber-50 rounded-xl p-3 text-sm text-amber-700 space-y-1">
              <p className="font-semibold">3 points per hole:</p>
              <p>🟢 <strong>Bingo</strong> — First ball on the green</p>
              <p>📍 <strong>Bango</strong> — Closest to pin when all are on green</p>
              <p>🏆 <strong>Bongo</strong> — First to hole out (make the putt)</p>
            </div>
          </section>
        )}

        {/* Hammer Options */}
        {type === 'hammer' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hammer Options</p>
            <div>
              <p className="text-sm text-gray-600 mb-2">Base Value Per Hole</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-500">{stakesMode === 'points' ? 'pts' : '$'}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={hammerBaseValueDollars}
                  onChange={e => setHammerBaseValueDollars(e.target.value)}
                  className="flex-1 h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Max Presses Per Hole</p>
              <div className="flex gap-2">
                {[undefined, 1, 2, 3].map(mp => (
                  <button
                    key={mp ?? 'none'}
                    onClick={() => setHammerMaxPresses(mp)}
                    className={`px-3 h-10 rounded-xl font-semibold text-sm transition-colors ${
                      hammerMaxPresses === mp
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {mp === null ? 'No limit' : `${mp}×`}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 text-sm text-orange-700 space-y-1">
              <p className="font-semibold">How Hammer works:</p>
              <p>• Each hole starts at {stakesMode === 'points'
                ? `${Math.max(1, parsePointsValue(hammerBaseValueDollars))} pts`
                : fmtMoney(Math.max(1, parseDollarsToCents(hammerBaseValueDollars)))}</p>
              <p>• The hammer holder can "throw" the hammer to double the stakes</p>
              <p>• Opponent must accept (value doubles) or decline (lose current value)</p>
              <p>• After accepting, the hammer passes to the accepter</p>
            </div>
          </section>
        )}

        {/* Vegas Options */}
        {type === 'vegas' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vegas Options</p>
            <div>
              <p className="text-sm text-gray-600 mb-2">Teams (tap to assign)</p>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map(team => (
                  <div key={team} className={`rounded-xl border-2 p-3 ${team === 'A' ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wide mb-2 ${team === 'A' ? 'text-blue-700' : 'text-orange-700'}`}>Team {team}</p>
                    <div className="space-y-1.5">
                      {players.map(p => (
                        <button key={p.id}
                          onClick={() => setVegasTeams(prev => ({ ...prev, [p.id]: team }))}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            vegasTeams[p.id] === team
                              ? team === 'A' ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white'
                              : 'bg-white text-gray-600 border border-gray-200'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!vegasTeamsValid && (
                <p className="text-red-600 text-sm mt-2">Teams must be equal size. ({vegasTeamCounts.a} / {vegasTeamCounts.b})</p>
              )}
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-sm text-green-700 space-y-1">
              <p className="font-semibold">How Vegas works:</p>
              <p>• Each team combines scores into a 2-digit number (low digit first)</p>
              <p>• Example: scores of 4 and 5 become 45</p>
              <p>• Difference between team numbers = points for that hole</p>
            </div>
          </section>
        )}

        {/* Stableford Options */}
        {type === 'stableford' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stableford Options</p>
            <div className="bg-indigo-50 rounded-xl p-3 text-sm text-indigo-700 space-y-1">
              <p className="font-semibold">Point values per hole:</p>
              <p>• Double bogey+ = 0 pts, Bogey = 1, Par = 2</p>
              <p>• Birdie = 3, Eagle = 4, Albatross = 5</p>
              <p>• Highest total points wins the pot</p>
            </div>
          </section>
        )}

        {/* Dots Options */}
        {type === 'dots' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dots / Trash Options</p>
            <div>
              <p className="text-sm text-gray-600 mb-2">Value Per Dot</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-500">{stakesMode === 'points' ? 'pts' : '$'}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={dotsValueDollars}
                  onChange={e => setDotsValueDollars(e.target.value)}
                  className="flex-1 h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">Configure active dot types in the Junk Side Bets section below.</p>
            <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700 space-y-1">
              <p className="font-semibold">How Dots work:</p>
              <p>• Each dot earned = value from each other player</p>
              <p>• Snake (3-putt) = you pay each other player</p>
              <p>• Direct settlement — no buy-in needed</p>
            </div>
          </section>
        )}

        {/* Banker Options */}
        {type === 'banker' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Banker Options</p>
            <div>
              <p className="text-sm text-gray-600 mb-2">Banker Rotation Order</p>
              <p className="text-xs text-gray-400 mb-2">Player 1 is banker on hole 1, Player 2 on hole 2, etc.</p>
              <div className="space-y-2">
                {bankerOrder.map((playerId, index) => {
                  const player = players.find(p => p.id === playerId)
                  return (
                    <div key={playerId} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                      <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </span>
                      <span className="flex-1 font-medium text-gray-800">{player?.name}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveBankerPlayer(index, -1)}
                          disabled={index === 0}
                          className="w-10 h-10 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-30 flex items-center justify-center text-sm"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveBankerPlayer(index, 1)}
                          disabled={index === bankerOrder.length - 1}
                          className="w-10 h-10 rounded-lg bg-white border border-gray-200 text-gray-600 disabled:opacity-30 flex items-center justify-center text-sm"
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 text-sm text-emerald-700 space-y-1">
              <p className="font-semibold">How Banker works:</p>
              <p>• Rotating banker takes on all other players each hole</p>
              <p>• Beat the banker = banker pays you 1 unit</p>
              <p>• Lose to banker = you pay the banker 1 unit</p>
            </div>
          </section>
        )}

        {/* Quota Options */}
        {type === 'quota' && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quota Options</p>
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Player Quotas (auto-calculated)</p>
              {players.map(p => {
                const quota = Math.max(0, Math.min(36, Math.round(36 - p.handicapIndex)))
                return (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 font-medium">{p.name}</span>
                    <span className="text-gray-500">Target: <strong className="text-gray-800">{quota} pts</strong> (HCP {p.handicapIndex})</span>
                  </div>
                )
              })}
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700 space-y-1">
              <p className="font-semibold">How Quota works:</p>
              <p>• Each player gets a target based on handicap (36 - HCP)</p>
              <p>• Earn Stableford points: Par=2, Birdie=3, Eagle=4</p>
              <p>• Beat your quota by the most to win</p>
            </div>
          </section>
        )}

      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => {
              const jc = junksEnabled && junkTypes.size > 0
                ? { valueCents: parseDollarsToCents(junkValueDollars), types: Array.from(junkTypes) }
                : undefined
              onNext(makeGame(), jc)
            }}
            disabled={!canContinue}
            className="w-full h-14 bg-gray-800 text-white text-lg font-bold rounded-2xl shadow-lg disabled:opacity-40 active:bg-gray-900 transition-colors"
          >
            {buyInCents === 0 || stakesMode === 'points' ? 'Next: Start Round' : 'Next: Collect Buy-ins'}
          </button>
        </div>
      </div>
      {rulesModalType && <GameRulesModal gameType={rulesModalType} onClose={() => setRulesModalType(null)} />}
    </div>
  )
}

// ─── Step 4: Treasurer + Buy-in Collection ────────────────────────────────────

function TreasurerAndBuyIns({
  userId,
  course,
  players,
  game,
  junkConfig,
  groups,
  holesMode,
  startingHole,
  onCreateRound,
  onBack,
  stepIndicator,
}: {
  userId: string
  course: Course
  players: Player[]
  game: Game
  junkConfig?: JunkConfig
  groups?: Record<string, number>
  holesMode: HolesMode
  startingHole: number
  onCreateRound: (roundId: string) => void
  onBack: () => void
  stepIndicator?: React.ReactNode
}) {
  const [treasurerId, setTreasurerId] = useState<string | null>(() => {
    const me = players.find(p => p.id === userId)
    return me ? me.id : null
  })
  const [gameMasterId, setGameMasterId] = useState<string>(players.find(p => p.id === userId)?.id ?? players[0]?.id ?? userId)
  const [paid, setPaid] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    players.forEach(p => (init[p.id] = false))
    return init
  })
  const [allowStartUnpaid, setAllowStartUnpaid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }) }, [])

  const potCents = game.buyInCents * players.length
  const allPaid = players.every(p => paid[p.id])
  const canStart = !!treasurerId && (allPaid || allowStartUnpaid)
  const treasurer = players.find(p => p.id === treasurerId)
  const headerClass = game.stakesMode === 'high_roller' ? 'hr-header' : 'app-header'

  const startRound = async () => {
    if (!treasurerId) return
    setSaving(true)
    try {
      const roundId = uuidv4()
      const inviteCode = generateInviteCode()
      const firstHole = holesMode === 'back_9'
        ? Math.ceil(course.holes.length / 2) + 1
        : (holesMode === 'full_18' && startingHole > 1 ? startingHole : 1)
      const round: Round = {
        id: roundId,
        courseId: course.id,
        date: new Date(),
        status: 'active',
        currentHole: firstHole,
        courseSnapshot: {
          courseId: course.id,
          courseName: course.name,
          tees: course.tees,
          holes: course.holes,
        },
        players,
        game,
        junkConfig,
        treasurerPlayerId: treasurerId,
        groups,
        gameMasterId,
        inviteCode,
        holesMode: holesMode !== 'full_18' ? holesMode : undefined,
        startingHole: holesMode === 'full_18' && startingHole > 1 ? startingHole : undefined,
      }

      const buyIns: BuyIn[] = players.map(p => ({
        id: uuidv4(),
        roundId,
        playerId: p.id,
        amountCents: game.buyInCents,
        status: paid[p.id] ? 'marked_paid' : 'unpaid',
        ...(paid[p.id] ? { paidAt: new Date() } : {}),
      }))

      const roundPlayers = players.map(p => ({
        id: uuidv4(),
        roundId,
        playerId: p.id,
        teePlayed: p.tee,
      }))

      // Insert the round first, then the child rows in parallel — round_players
      // and buy_ins have FK constraints on rounds(id), so racing them via a single
      // Promise.all caused fk_round_players_round / fk_buy_ins_round violations.
      setCreateError(null)
      const roundResult = await supabase.from('rounds').insert(roundToRow(round, userId))
      if (roundResult.error) {
        reportSupabaseError(roundResult.error, 'create_round.rounds', { roundId, playerCount: players.length, gameType: game.type })
        setCreateError('Failed to create round. Check your connection and try again.')
        setSaving(false)
        return
      }
      const [rpResult, biResult] = await Promise.all([
        supabase.from('round_players').insert(roundPlayers.map(rp => roundPlayerToRow(rp, userId))),
        supabase.from('buy_ins').insert(buyIns.map(b => buyInToRow(b, userId))),
      ])

      const insertError = rpResult.error || biResult.error
      if (insertError) {
        reportSupabaseError(rpResult.error, 'create_round.round_players', { roundId })
        reportSupabaseError(biResult.error, 'create_round.buy_ins', { roundId })
        setCreateError('Failed to create round. Check your connection and try again.')
        setSaving(false)
        return
      }

      // Fire-and-forget: send round invite notifications to registered players
      const playerIds = players.map(p => p.id)
      supabase.from('user_profiles').select('display_name').eq('user_id', userId).single()
        .then(({ data }) => {
          const creatorName = data?.display_name ?? 'Someone'
          supabase.rpc('send_round_invite_notifications', {
            p_round_id: roundId,
            p_invite_code: inviteCode,
            p_course_name: course.name,
            p_creator_name: creatorName,
            p_player_ids: playerIds,
            p_game_type: game?.type ?? null,
            p_buy_in_cents: game?.buyInCents ?? 0,
            p_player_count: players.length,
          }).then(({ error }) => {
            if (error) console.warn('Failed to send round invite notifications:', error)
          })
        })

      onCreateRound(roundId)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-36">
      <header className={`${headerClass} text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3`}>
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl"
          aria-label="Back"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Buy-ins & Treasurer</h1>
          <p className="text-gray-300 text-xs truncate">
            Pot {fmtAmount(potCents, game.stakesMode)} · {course.name}
            {game.stakesMode === 'high_roller' && (
              <span className="ml-2 font-bold" style={{ color: '#fbbf24' }}>💎 HIGH ROLLER</span>
            )}
          </p>
        </div>
      </header>
      {stepIndicator}

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Treasurer</p>
            <p className="text-sm text-gray-500 mt-1">Who is holding the pot?</p>
          </div>
          <div className="space-y-2">
            {players.map(p => (
              <button
                key={p.id}
                onClick={() => setTreasurerId(p.id)}
                className={`w-full p-4 rounded-2xl border-2 text-left font-semibold transition-colors ${
                  treasurerId === p.id
                    ? 'border-amber-500 bg-amber-50 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {p.name}
                {treasurerId === p.id && (
                  <span className="ml-2 text-sm font-normal text-amber-600">✓ Treasurer</span>
                )}
              </button>
            ))}
          </div>
          {!treasurerId && (
            <p className="text-red-500 text-sm">Choose a treasurer before starting.</p>
          )}
        </section>

        {/* Payment info card — shown after treasurer is selected */}
        {treasurerId && treasurer && (
          <section className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl shadow-sm p-4 space-y-2 border border-amber-200">
            <p className="font-bold text-gray-800 dark:text-gray-100 text-lg">
              {fmtAmount(game.buyInCents, game.stakesMode)} per player
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Pay <strong>{treasurer.name}</strong>
            </p>
            {(() => {
              const methods: string[] = []
              if (treasurer.venmoUsername) methods.push(`Venmo: ${treasurer.venmoUsername}`)
              if (treasurer.zelleIdentifier) methods.push(`Zelle: ${treasurer.zelleIdentifier}`)
              if (treasurer.cashAppUsername) methods.push(`Cash App: ${treasurer.cashAppUsername}`)
              if (treasurer.paypalEmail) methods.push(`PayPal: ${treasurer.paypalEmail}`)
              return methods.length > 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 space-y-0.5">
                  {methods.map((m, i) => <p key={i}>{m}</p>)}
                </div>
              ) : null
            })()}
          </section>
        )}

        {/* Game Master */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Game Master (Scorekeeper)</p>
            <p className="text-sm text-gray-500 mt-1">Who enters the scores? Can be the same as treasurer.</p>
          </div>
          <div className="space-y-2">
            {players.map(p => (
              <button
                key={p.id}
                onClick={() => setGameMasterId(p.id)}
                className={`w-full p-4 rounded-2xl border-2 text-left font-semibold transition-colors ${
                  gameMasterId === p.id
                    ? 'border-amber-500 bg-amber-50 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {p.name}
                {gameMasterId === p.id && (
                  <span className="ml-2 text-sm font-normal text-amber-600">✓ Game Master</span>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Confirm Payments</p>
            <p className="text-sm text-gray-500 mt-1">Tap each player once they've paid the treasurer.</p>
          </div>
          {!allPaid && (
            <button
              onClick={() => setPaid(Object.fromEntries(players.map(p => [p.id, true])))}
              className="w-full h-10 bg-amber-100 text-amber-700 text-sm font-semibold rounded-xl active:bg-amber-200 transition-colors"
            >
              Mark All Paid
            </button>
          )}
          <div className="space-y-2">
            {players.map(p => (
              <button
                key={p.id}
                onClick={() => setPaid(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-colors ${
                  paid[p.id] ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'
                }`}
              >
                <span className="font-semibold text-gray-800">{p.name}</span>
                <span
                  className={`text-sm font-bold px-3 py-1.5 rounded-full ${
                    paid[p.id] ? 'bg-amber-600 text-white' : 'bg-red-100 text-red-600'
                  }`}
                >
                  {paid[p.id] ? '✓ PAID' : 'UNPAID'}
                </span>
              </button>
            ))}
          </div>
          {!allPaid && (
            <label className="flex items-start gap-3 text-sm text-gray-500 mt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowStartUnpaid}
                onChange={e => setAllowStartUnpaid(e.target.checked)}
                className="mt-0.5 w-5 h-5 flex-shrink-0"
              />
              <span>Start anyway — I'll collect on the course (good luck with that)</span>
            </label>
          )}
        </section>
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto space-y-2">
          {createError && (
            <p className="text-red-600 text-sm font-semibold text-center">{createError}</p>
          )}
          <button
            onClick={startRound}
            disabled={!canStart || saving}
            className="w-full h-14 bg-gray-800 text-white text-lg font-bold rounded-2xl shadow-lg disabled:opacity-40 active:bg-gray-900 transition-colors"
          >
            {saving
              ? 'Starting…'
              : !treasurerId
              ? 'Choose a Treasurer First'
              : allPaid
              ? '⛳ Tee It Up!'
              : 'Collect Buy-ins to Start'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── NewRound orchestrator ────────────────────────────────────────────────────

export function NewRound({ userId, onStart, onCancel, onAddCourse, initialStakesMode = 'points', templateRound }: Props) {
  // If templateRound provided, pre-fill course from snapshot and start at players step
  const templateCourse = templateRound?.courseSnapshot
    ? {
        id: templateRound.courseSnapshot.courseId,
        name: templateRound.courseSnapshot.courseName,
        tees: templateRound.courseSnapshot.tees,
        holes: templateRound.courseSnapshot.holes,
        createdAt: new Date(),
      }
    : null

  const [step, setStep] = useState<'course' | 'players' | 'groups' | 'game' | 'money'>(templateCourse ? 'players' : 'course')
  const [course, setCourse] = useState<Course | null>(templateCourse)
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [groups, setGroups] = useState<Record<string, number> | undefined>(templateRound?.groups)
  const [game, setGame] = useState<Game | null>(null)
  const [junkConfig, setJunkConfig] = useState<JunkConfig | undefined>(templateRound?.junkConfig)
  const [playerTees, setPlayerTees] = useState<Record<string, string>>({})
  const [holesMode, setHolesMode] = useState<HolesMode>(templateRound?.holesMode ?? 'full_18')
  const [startingHole, setStartingHole] = useState<number>(templateRound?.startingHole ?? 1)

  const preSelectedPlayerIds = templateRound?.players?.map(p => p.id)
  const [creatingDirect, setCreatingDirect] = useState(false)
  const [directCreateError, setDirectCreateError] = useState<string | null>(null)

  const skipGroups = !players || players.length <= MAX_PER_GROUP_CONST

  const handlePlayersNext = (ps: Player[]) => {
    setPlayers(ps)
    if (ps.length <= MAX_PER_GROUP_CONST) {
      const g: Record<string, number> = {}
      ps.forEach(p => { g[p.id] = 1 })
      setGroups(g)
      setStep('game')
    } else {
      setStep('groups')
    }
  }

  const createRoundDirect = async (g: Game, jc?: JunkConfig) => {
    if (!course || !players || creatingDirect) return
    setCreatingDirect(true)
    setDirectCreateError(null)
    try {
      const roundId = uuidv4()
      const inviteCode = generateInviteCode()
      const gameMasterId = players.find(p => p.id === userId)?.id ?? players[0]?.id ?? userId
      const firstHole = holesMode === 'back_9'
        ? Math.ceil(course.holes.length / 2) + 1
        : (holesMode === 'full_18' && startingHole > 1 ? startingHole : 1)
      const round: Round = {
        id: roundId,
        courseId: course.id,
        date: new Date(),
        status: 'active',
        currentHole: firstHole,
        courseSnapshot: {
          courseId: course.id,
          courseName: course.name,
          tees: course.tees,
          holes: course.holes,
        },
        players,
        game: g,
        junkConfig: jc,
        groups,
        gameMasterId,
        inviteCode,
        holesMode: holesMode !== 'full_18' ? holesMode : undefined,
        startingHole: holesMode === 'full_18' && startingHole > 1 ? startingHole : undefined,
      }
      const roundPlayers = players.map(p => ({
        id: uuidv4(),
        roundId,
        playerId: p.id,
        teePlayed: p.tee,
      }))
      // Parent first, then child — round_players has an FK on rounds(id),
      // and Promise.all races caused fk_round_players_round violations.
      const roundResult = await supabase.from('rounds').insert(roundToRow(round, userId))
      if (roundResult.error) {
        reportSupabaseError(roundResult.error, 'direct_create_round.rounds', { roundId, playerCount: players.length, gameType: g.type })
        setDirectCreateError('Failed to create round. Check your connection and try again.')
        setCreatingDirect(false)
        return
      }
      const rpResult = await supabase.from('round_players').insert(roundPlayers.map(rp => roundPlayerToRow(rp, userId)))
      if (rpResult.error) {
        reportSupabaseError(rpResult.error, 'direct_create_round.round_players', { roundId })
        setDirectCreateError('Failed to create round. Check your connection and try again.')
        setCreatingDirect(false)
        return
      }
      onStart(roundId)
    } catch (err) {
      reportSupabaseError(err, 'direct_create_round.exception')
      setDirectCreateError('Failed to create round. Check your connection and try again.')
    } finally {
      setCreatingDirect(false)
    }
  }

  const stepBar = <StepIndicator current={step} skipGroups={skipGroups} stakesMode={initialStakesMode} />

  if (step === 'course') {
    return (
      <>
        <CoursePicker
          userId={userId}
          onSelect={c => {
            setCourse(c)
            // Reset holesMode when course changes — only offer 9-hole modes for 18-hole courses
            if (c.holes.length <= 9) setHolesMode('full_18')
            // Reset starting hole on course change so we don't carry over an
            // invalid number from a longer course.
            setStartingHole(1)
            setStep('players')
          }}
          onAddCourse={onAddCourse}
          onCancel={onCancel}
          stakesMode={initialStakesMode}
        />
      </>
    )
  }

  if (step === 'players' && course) {
    const showHolesToggle = course.holes.length > 9
    // Starting-hole picker is only meaningful in full_18 mode (the rotation
    // helpers ignore it for front_9 / back_9). For 9-hole courses we still
    // allow it since they default to full_18 implicitly.
    const showStartingHolePicker = holesMode === 'full_18'
    const holesModeBar = (showHolesToggle || showStartingHolePicker) ? (
      <div className="px-4 pb-2 space-y-2">
        <div className="max-w-2xl mx-auto space-y-2">
          {showHolesToggle && (
            <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600">
              {(['front_9', 'full_18', 'back_9'] as HolesMode[]).map(mode => {
                const label = mode === 'front_9' ? 'Front 9' : mode === 'back_9' ? 'Back 9' : `Full ${course.holes.length}`
                const active = holesMode === mode
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      setHolesMode(mode)
                      // Reset starting hole when leaving full_18 — the rotation
                      // helpers ignore it anyway, but clean state is clearer.
                      if (mode !== 'full_18') setStartingHole(1)
                    }}
                    className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-amber-500 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          {showStartingHolePicker && (
            <div className="flex items-center gap-2 px-1">
              <label htmlFor="startingHole" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Start at
              </label>
              <select
                id="startingHole"
                value={startingHole}
                onChange={e => setStartingHole(parseInt(e.target.value, 10) || 1)}
                className="h-9 px-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {Array.from({ length: course.holes.length }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>Hole {n}</option>
                ))}
              </select>
              {startingHole > 1 && (
                <span className="text-xs text-amber-600 font-semibold">⛳ Shotgun</span>
              )}
            </div>
          )}
        </div>
      </div>
    ) : null

    return (
      <PlayerPicker
        userId={userId}
        course={course}
        onNext={handlePlayersNext}
        onBack={() => setStep('course')}
        stakesMode={initialStakesMode}
        preSelectedIds={preSelectedPlayerIds}
        stepIndicator={<>{stepBar}{holesModeBar}</>}
        playerTees={playerTees}
        onPlayerTeesChange={setPlayerTees}
      />
    )
  }

  if (step === 'groups' && players) {
    return (
      <GroupAssignment
        players={players}
        initialGroups={groups}
        onNext={g => { setGroups(g); setStep('game') }}
        onBack={() => setStep('players')}
        stakesMode={initialStakesMode}
        stepIndicator={stepBar}
      />
    )
  }

  if (step === 'game' && players) {
    return (
      <>
        {directCreateError && (
          <div className="fixed top-0 inset-x-0 z-50 p-4 bg-red-500 text-white text-center text-sm font-semibold">
            {directCreateError}
          </div>
        )}
        <GameSetup
          players={players}
          initialStakesMode={initialStakesMode}
          onNext={(g, jc) => {
            setGame(g); setJunkConfig(jc)
            if (g.buyInCents === 0 || g.stakesMode === 'points') {
              // Skip TreasurerAndBuyIns — create round directly with no treasurer
              createRoundDirect(g, jc)
            } else {
              setStep('money')
            }
          }}
          onBack={() => players.length > MAX_PER_GROUP_CONST ? setStep('groups') : setStep('players')}
          initialGame={templateRound?.game}
          initialJunkConfig={junkConfig}
          stepIndicator={stepBar}
        />
      </>
    )
  }

  if (step === 'money' && course && players && game) {
    return (
      <TreasurerAndBuyIns
        userId={userId}
        course={course}
        players={players}
        game={game}
        junkConfig={junkConfig}
        groups={groups}
        holesMode={holesMode}
        startingHole={startingHole}
        onBack={() => setStep('game')}
        onCreateRound={rid => onStart(rid)}
        stepIndicator={stepBar}
      />
    )
  }

  return (
    <CoursePicker
      userId={userId}
      onSelect={c => { setCourse(c); setStep('players') }}
      onAddCourse={onAddCourse}
      onCancel={onCancel}
      stakesMode={initialStakesMode}
    />
  )
}
