import { useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase, rowToCourse, rowToPlayer, rowToSharedCourse, roundToRow, roundPlayerToRow, buyInToRow, eventToRow, generateInviteCode, rowToUserProfile } from '../../lib/supabase'
import { safeWrite } from '../../lib/safeWrite'
import { reportSupabaseError } from '../../lib/sentry'
// Events store buy-in in cents (money mode); fmtAmount with no stakesMode
// converts cents -> points for display (1 pt = $1), so no $ surfaces.
import { fmtAmount } from '../../lib/gameLogic'
import { autoAssignGroups, autoAssignShotgunStarts, MAX_PER_GROUP } from '../../lib/eventUtils'
import { parseDollarsToCents } from '../../lib/money'
import { venturaCourses } from '../../data/venturaCourses'
import { NearMeCourses } from '../NearMeCourses/NearMeCourses'
import { GameRulesModal } from '../GameRulesModal'
import { InviteQR } from '../InviteQR'
import type {
  Course,
  Player,
  Round,
  Game,
  GolfEvent,
  SkinsConfig,
  BestBallConfig,
  NassauConfig,
  WolfConfig,
  BBBConfig,
  HammerConfig,
  BuyIn,
  GameType,
  HolesMode,
} from '../../types'

interface Props {
  userId: string
  onStart: (roundId: string, eventId: string) => void
  onCancel: () => void
  onAddCourse: () => void
}

type Step = 'name' | 'course' | 'players' | 'groups' | 'game' | 'review' | 'share'

export function EventSetup({ userId, onStart, onCancel, onAddCourse }: Props) {
  const [step, setStep] = useState<Step>('name')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdRoundId, setCreatedRoundId] = useState<string | null>(null)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null)
  const [shareToast, setShareToast] = useState<string | null>(null)

  // Step 1: Event name
  const [eventName, setEventName] = useState('')

  // Step 2: Course
  const [courses, setCourses] = useState<Course[]>([])
  const [courseSearch, setCourseSearch] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null)

  // Step 3: Players
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [quickAddName, setQuickAddName] = useState('')

  // Step 4: Groups & scorekeepers
  const [groups, setGroups] = useState<Record<string, number>>({})
  const [groupScorekeepers, setGroupScorekeepers] = useState<Record<number, string>>({})
  const [groupError, setGroupError] = useState<string | null>(null)

  // Step 5: Game
  const [gameType, setGameType] = useState<GameType>('skins')
  const [buyInCents, setBuyInCents] = useState(1000)
  const [skinsMode, setSkinsMode] = useState<'gross' | 'net'>('net')
  const [carryovers, setCarryovers] = useState(true)
  const [bbScoring] = useState<'match' | 'total'>('match')
  const [bbMode] = useState<'gross' | 'net'>('net')
  const [nassauMode] = useState<'gross' | 'net'>('net')
  const [wolfMode] = useState<'gross' | 'net'>('net')
  const [bbbMode] = useState<'gross' | 'net'>('net')
  const [treasurerId, setTreasurerId] = useState<string | null>(null)
  const [customBuyIn, setCustomBuyIn] = useState('')
  const [gameError, setGameError] = useState<string | null>(null)
  const [rulesModalType, setRulesModalType] = useState<GameType | null>(null)
  const [holesMode, setHolesMode] = useState<HolesMode>('full_18')
  const [shotgunEnabled, setShotgunEnabled] = useState(false)
  const [shotgunStarts, setShotgunStarts] = useState<Record<number, number>>({})

  // Load courses
  useEffect(() => {
    Promise.all([
      supabase.from('courses').select('*').eq('user_id', userId).neq('hidden', true),
      supabase.from('shared_courses').select('*').limit(500),
    ]).then(([ownedRes, sharedRes]) => {
      const owned = (ownedRes.data ?? []).map(rowToCourse)
      const shared = (sharedRes.data ?? []).map(rowToSharedCourse)
      const catalog = venturaCourses.map(vc => ({
        // CourseTemplate has no id field; derive a stable one from the name so
        // React reconciliation is consistent across re-renders.
        id: `catalog-${vc.name.replace(/\s+/g, '-').toLowerCase()}`,
        name: vc.name,
        tees: vc.tees,
        holes: vc.holes,
        createdAt: new Date(),
      }))
      // Deduplicate by name
      const seen = new Set<string>()
      const all: Course[] = []
      for (const c of [...owned, ...shared, ...catalog]) {
        if (!seen.has(c.name)) { seen.add(c.name); all.push(c) }
      }
      setCourses(all)
    })
  }, [userId])

  // Load players
  useEffect(() => {
    Promise.all([
      supabase.from('players').select('*').eq('user_id', userId),
      supabase.from('user_profiles').select('*').not('display_name', 'is', null).limit(500),
    ]).then(([playersRes, profilesRes]) => {
      const guestPlayers = (playersRes.data ?? []).map(rowToPlayer)
      const profiles = (profilesRes.data ?? []).map(rowToUserProfile)
      // Create player entries from user profiles
      const profilePlayers: Player[] = profiles
        .filter(p => p.displayName)
        .map(p => ({
          id: p.userId,
          name: p.displayName!,
          handicapIndex: p.handicapIndex ?? 0,
          tee: p.tee ?? 'White',
          ghinNumber: '',
          isPublic: true,
        }))
      // Merge, deduplicating by id
      const seen = new Set<string>()
      const all: Player[] = []
      for (const p of [...profilePlayers, ...guestPlayers]) {
        if (!seen.has(p.id)) { seen.add(p.id); all.push(p) }
      }
      setAvailablePlayers(all)
    })
  }, [userId])

  // Auto-assign groups when players change (keyed on player IDs, not just count)
  const playerIdKey = useMemo(() => selectedPlayers.map(p => p.id).join(','), [selectedPlayers])
  useEffect(() => {
    setGroups(autoAssignGroups(selectedPlayers.map(p => p.id)))
    setGroupError(null)
  }, [playerIdKey])

  // Default the treasurer to the round creator once they appear in the selected list.
  // Only sets when treasurerId is still null so a manual pick is never overwritten.
  useEffect(() => {
    if (treasurerId) return
    if (selectedPlayers.some(p => p.id === userId)) {
      setTreasurerId(userId)
    }
  }, [playerIdKey, treasurerId, userId])

  const togglePlayer = (player: Player) => {
    setSelectedPlayers(prev =>
      prev.some(p => p.id === player.id)
        ? prev.filter(p => p.id !== player.id)
        : [...prev, player]
    )
  }

  const quickAddPlayer = () => {
    if (!quickAddName.trim()) return
    const newPlayer: Player = {
      id: uuidv4(),
      name: quickAddName.trim(),
      handicapIndex: 0,
      tee: 'White',
      ghinNumber: '',
    }
    setAvailablePlayers(prev => [...prev, newPlayer])
    setSelectedPlayers(prev => [...prev, newPlayer])
    setQuickAddName('')
  }

  const numGroups = Math.max(...Object.values(groups), 1)
  const groupNumbers = Array.from({ length: numGroups }, (_, i) => i + 1)

  const buildGame = (): Game => {
    let config: SkinsConfig | BestBallConfig | NassauConfig | WolfConfig | BBBConfig | HammerConfig
    if (gameType === 'skins') config = { mode: skinsMode, carryovers }
    else if (gameType === 'best_ball') {
      const teams: Record<string, 'A' | 'B'> = {}
      selectedPlayers.forEach((p, i) => { teams[p.id] = i % 2 === 0 ? 'A' : 'B' })
      config = { scoring: bbScoring, mode: bbMode, teams }
    }
    else if (gameType === 'nassau') config = { mode: nassauMode }
    else if (gameType === 'wolf') config = { mode: wolfMode, wolfOrder: selectedPlayers.map(p => p.id) }
    else if (gameType === 'hammer') config = { baseValueCents: 100 }
    else config = { mode: bbbMode }

    return { id: uuidv4(), type: gameType, buyInCents: gameType === 'hammer' ? 0 : buyInCents, config }
  }

  const createEvent = async () => {
    if (!selectedCourse || !treasurerId) return
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setCreateError(null)
    try {
      const roundId = uuidv4()
      const eventId = uuidv4()
      const inviteCode = generateInviteCode()
      const game = buildGame()

      // Create the round
      const firstHole = holesMode === 'back_9' ? Math.ceil(selectedCourse.holes.length / 2) + 1 : 1
      const round: Round = {
        id: roundId,
        courseId: selectedCourse.id,
        date: new Date(),
        status: 'active',
        currentHole: firstHole,
        courseSnapshot: {
          courseId: selectedCourse.id,
          courseName: selectedCourse.name,
          tees: selectedCourse.tees,
          holes: selectedCourse.holes,
        },
        players: selectedPlayers,
        game,
        treasurerPlayerId: treasurerId,
        groups,
        eventId,
        inviteCode,
        holesMode: holesMode !== 'full_18' ? holesMode : undefined,
        shotgunStarts: shotgunEnabled && Object.keys(shotgunStarts).length > 0 ? shotgunStarts : undefined,
      }

      // Create the event
      const golfEvent: GolfEvent = {
        id: eventId,
        name: eventName,
        status: 'active',
        roundId,
        inviteCode,
        groupScorekeepers,
        createdBy: userId,
        createdAt: new Date(),
      }

      // Create buy-ins
      const buyIns: BuyIn[] = selectedPlayers.map(p => ({
        id: uuidv4(),
        roundId,
        playerId: p.id,
        amountCents: game.buyInCents,
        status: 'unpaid' as const,
      }))

      // Create round players
      const roundPlayers = selectedPlayers.map(p => ({
        id: uuidv4(),
        roundId,
        playerId: p.id,
        teePlayed: p.tee,
      }))

      // Insert event first (round references it), then the round (parent), then
      // round_players + buy_ins in parallel. round_players and buy_ins both have
      // FK constraints on rounds(id), so racing them via Promise.all caused
      // fk_round_players_round / fk_buy_ins_round violations (same bug pattern
      // fixed in NewRound.startRound in commit d6358ff).
      await safeWrite(supabase.from('events').insert(eventToRow(golfEvent, userId)), 'insert event')
      const roundResult = await supabase.from('rounds').insert(roundToRow(round, userId))
      if (roundResult.error) {
        reportSupabaseError(roundResult.error, 'create_event.rounds', { eventId, roundId, playerCount: selectedPlayers.length })
        throw roundResult.error
      }
      const [rpResult, biResult] = await Promise.all([
        supabase.from('round_players').insert(roundPlayers.map(rp => roundPlayerToRow(rp, userId))),
        supabase.from('buy_ins').insert(buyIns.map(b => buyInToRow(b, userId))),
      ])
      if (rpResult.error) {
        reportSupabaseError(rpResult.error, 'create_event.round_players', { eventId, roundId })
        throw rpResult.error
      }
      if (biResult.error) {
        reportSupabaseError(biResult.error, 'create_event.buy_ins', { eventId, roundId })
        throw biResult.error
      }

      // Insert the event manager participant (the creator)
      await safeWrite(supabase.from('event_participants').insert({
        id: uuidv4(),
        event_id: eventId,
        user_id: userId,
        player_id: selectedPlayers[0]?.id ?? userId,
        role: 'manager',
        group_number: groups[selectedPlayers[0]?.id] ?? 1,
      }), 'insert event manager participant')

      setCreatedRoundId(roundId)
      setCreatedEventId(eventId)
      setCreatedInviteCode(inviteCode)
      setStep('share')
    } catch (err) {
      console.error('Failed to create event:', err)
      setCreateError('Failed to create event. Please try again.')
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  const filteredCourses = courses.filter(c =>
    c.name.toLowerCase().includes(courseSearch.toLowerCase())
  )

  const filteredPlayers = availablePlayers
    .filter(p =>
      p.name.toLowerCase().includes(playerSearch.toLowerCase()) &&
      !selectedPlayers.some(sp => sp.id === p.id)
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  const GAME_OPTIONS: { type: GameType; label: string; emoji: string }[] = [
    { type: 'skins', label: 'Skins', emoji: '🎰' },
    { type: 'best_ball', label: 'Best Ball', emoji: '🤝' },
    { type: 'nassau', label: 'Nassau', emoji: '🏳️' },
    { type: 'wolf', label: 'Wolf', emoji: '🐺' },
    { type: 'bingo_bango_bongo', label: 'BBB', emoji: '⭐' },
    { type: 'hammer', label: 'Hammer', emoji: '🔨' },
    { type: 'vegas', label: 'Vegas', emoji: '🎲' },
    { type: 'stableford', label: 'Stableford', emoji: '📊' },
    { type: 'dots', label: 'Dots', emoji: '🔴' },
    { type: 'banker', label: 'Banker', emoji: '🏦' },
    { type: 'quota', label: 'Quota', emoji: '📋' },
  ]

  const BUY_IN_PRESETS = [500, 1000, 2000, 5000]

  // ─── Step 1: Event Name ─────────────────────────────────────────────────────
  if (step === 'name') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <button onClick={onCancel} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl" aria-label="Back">←</button>
          <h1 className="text-xl font-bold">Create Event</h1>
        </header>
        <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <div className="text-center">
              <p className="text-4xl mb-2">🏌️‍♂️</p>
              <h2 className="font-display font-bold text-xl text-gray-900 dark:text-gray-100">Event Name</h2>
              <p className="text-sm text-gray-500 mt-1">Give your outing a name</p>
            </div>
            <input
              type="text"
              placeholder="e.g. Saturday Scramble, Annual Trip 2026..."
              value={eventName}
              onChange={e => setEventName(e.target.value)}
              className="w-full h-14 px-4 text-lg rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
          </div>
        </div>
        <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 safe-bottom">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setStep('course')}
              disabled={!eventName.trim()}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl disabled:opacity-40 active:bg-gray-900"
            >
              Next: Pick Course →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 2: Course Selection ───────────────────────────────────────────────
  if (step === 'course') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <button onClick={() => setStep('name')} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl">←</button>
          <div>
            <h1 className="text-xl font-bold">Select Course</h1>
            <p className="text-gray-300 text-xs">{eventName}</p>
          </div>
        </header>
        <div className="px-4 py-4 max-w-2xl mx-auto space-y-3">
          <NearMeCourses onAddCourse={onAddCourse} />

          <input
            type="text"
            placeholder="Search courses..."
            value={courseSearch}
            onChange={e => setCourseSearch(e.target.value)}
            className="w-full h-11 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={onAddCourse}
            className="w-full text-left px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 font-semibold text-sm active:bg-amber-100"
          >
            + Add New Course
          </button>
          {filteredCourses.map(course => (
            <button
              key={course.id}
              onClick={() => { setSelectedCourse(course); setStep('players') }}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                selectedCourse?.id === course.id
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 active:bg-gray-50'
              }`}
            >
              <p className="font-semibold text-gray-900 dark:text-gray-100">{course.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Par {course.holes.reduce((s, h) => s + h.par, 0)} · {course.tees.length} tee{course.tees.length !== 1 ? 's' : ''}
              </p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ─── Step 3: Player Selection ───────────────────────────────────────────────
  if (step === 'players') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <button onClick={() => setStep('course')} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl">←</button>
          <div>
            <h1 className="text-xl font-bold">Select Players</h1>
            <p className="text-gray-300 text-xs">{eventName} · {selectedCourse?.name}</p>
          </div>
        </header>
        <div className="px-4 py-4 max-w-2xl mx-auto space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{selectedPlayers.length} selected</p>

          {/* Selected players */}
          {selectedPlayers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedPlayers.map(p => (
                <button
                  key={p.id}
                  onClick={() => togglePlayer(p)}
                  className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold active:bg-amber-200"
                >
                  {p.name} ✕
                </button>
              ))}
            </div>
          )}

          {/* Quick add */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Quick add guest..."
              value={quickAddName}
              onChange={e => setQuickAddName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && quickAddPlayer()}
              className="flex-1 h-11 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={quickAddPlayer}
              disabled={!quickAddName.trim()}
              className="h-11 px-4 bg-gray-800 text-white dark:bg-brass dark:text-navy text-sm font-bold rounded-xl disabled:opacity-40"
            >
              + Add
            </button>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search players..."
            value={playerSearch}
            onChange={e => setPlayerSearch(e.target.value)}
            className="w-full h-11 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          {/* Available players */}
          {filteredPlayers.map(p => (
            <button
              key={p.id}
              onClick={() => togglePlayer(p)}
              className="w-full text-left px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl active:bg-gray-50"
            >
              <p className="font-semibold text-gray-900 dark:text-gray-100">{p.name}</p>
              <p className="text-xs text-gray-500">HCP {p.handicapIndex} · {p.tee}</p>
            </button>
          ))}
        </div>
        <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 safe-bottom">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => setStep('groups')}
              disabled={selectedPlayers.length < 2}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl disabled:opacity-40 active:bg-gray-900"
            >
              Next: Assign Groups ({selectedPlayers.length} players) →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 4: Groups & Scorekeepers ──────────────────────────────────────────
  if (step === 'groups') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <button onClick={() => setStep('players')} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl">←</button>
          <div>
            <h1 className="text-xl font-bold">Groups & Scorekeepers</h1>
            <p className="text-gray-300 text-xs">{selectedPlayers.length} players · {numGroups} group{numGroups !== 1 ? 's' : ''}</p>
          </div>
        </header>
        <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => {
                const ng = Math.ceil(selectedPlayers.length / MAX_PER_GROUP)
                const g: Record<string, number> = {}
                selectedPlayers.forEach((p, i) => { g[p.id] = (i % ng) + 1 })
                setGroups(g)
              }}
              className="flex-1 h-10 bg-amber-50 border border-amber-200 text-amber-600 text-sm font-semibold rounded-xl active:bg-amber-100"
            >
              Auto-assign
            </button>
            {numGroups < 8 && (
              <button
                onClick={() => {
                  const newGroupNum = numGroups + 1
                  const largestGroup = groupNumbers.reduce((best, gn) => {
                    const count = selectedPlayers.filter(p => groups[p.id] === gn).length
                    const bestCount = selectedPlayers.filter(p => groups[p.id] === best).length
                    return count > bestCount ? gn : best
                  }, 1)
                  const playerToMove = selectedPlayers.find(p => groups[p.id] === largestGroup)
                  if (playerToMove) setGroups(prev => ({ ...prev, [playerToMove.id]: newGroupNum }))
                }}
                className="h-10 px-4 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl active:bg-gray-200"
              >
                + Group
              </button>
            )}
          </div>

          {groupNumbers.map(gn => {
            const groupPlayers = selectedPlayers.filter(p => groups[p.id] === gn)
            return (
              <div key={gn} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-800 dark:text-gray-100">Group {gn}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    groupPlayers.length > MAX_PER_GROUP ? 'bg-red-100 text-red-600' :
                    groupPlayers.length === 0 ? 'bg-red-100 text-red-600' :
                    'bg-amber-100 text-amber-600'
                  }`}>
                    {groupPlayers.length}/{MAX_PER_GROUP}
                  </span>
                </div>

                {/* Scorekeeper selection */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">Scorekeeper:</span>
                  <select
                    value={groupScorekeepers[gn] ?? ''}
                    onChange={e => setGroupScorekeepers(prev => ({ ...prev, [gn]: e.target.value }))}
                    className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1"
                  >
                    <option value="">None</option>
                    {groupPlayers.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {groupPlayers.map(player => (
                  <div key={player.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2">
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-100 text-sm">
                        {player.name}
                        {groupScorekeepers[gn] === player.id && (
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-700">SK</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">HCP {player.handicapIndex}</p>
                    </div>
                    <div className="flex gap-1">
                      {groupNumbers.map(targetGn => (
                        <button
                          key={targetGn}
                          onClick={() => { setGroupError(null); setGroups(prev => ({ ...prev, [player.id]: targetGn })) }}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                            groups[player.id] === targetGn
                              ? 'bg-amber-500 text-white'
                              : 'bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {targetGn}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {/* Holes Mode toggle (only for 18-hole courses) */}
          {selectedCourse && selectedCourse.holes.length > 9 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-3">
              <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Holes</p>
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600">
                {(['front_9', 'full_18', 'back_9'] as HolesMode[]).map(mode => {
                  const label = mode === 'front_9' ? 'Front 9' : mode === 'back_9' ? 'Back 9' : `Full ${selectedCourse!.holes.length}`
                  const active = holesMode === mode
                  return (
                    <button
                      key={mode}
                      onClick={() => {
                        setHolesMode(mode)
                        if (mode !== 'full_18') { setShotgunEnabled(false); setShotgunStarts({}) }
                      }}
                      className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                        active ? 'bg-amber-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>

              {/* Shotgun start toggle (only for full 18) */}
              {holesMode === 'full_18' && numGroups > 1 && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shotgunEnabled}
                      onChange={e => {
                        const on = e.target.checked
                        setShotgunEnabled(on)
                        if (on) {
                          setShotgunStarts(autoAssignShotgunStarts(numGroups, selectedCourse!.holes.length))
                        } else {
                          setShotgunStarts({})
                        }
                      }}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Shotgun Start</span>
                  </label>
                  {shotgunEnabled && (
                    <div className="space-y-1.5 pl-6">
                      {groupNumbers.map(gn => (
                        <div key={gn} className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-16">Group {gn}:</span>
                          <select
                            value={shotgunStarts[gn] ?? 1}
                            onChange={e => setShotgunStarts(prev => ({ ...prev, [gn]: Number(e.target.value) }))}
                            className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1"
                          >
                            {selectedCourse!.holes.map(h => (
                              <option key={h.number} value={h.number}>Hole {h.number}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 safe-bottom">
          <div className="max-w-2xl mx-auto">
            {groupError && (
              <p className="text-red-500 text-sm font-semibold text-center mb-2">{groupError}</p>
            )}
            <button
              onClick={() => {
                // Validate groups: no empty groups, max per group
                const hasEmpty = groupNumbers.some(gn => !selectedPlayers.some(p => groups[p.id] === gn))
                if (hasEmpty) { setGroupError('Each group needs at least 1 player'); return }
                const oversize = groupNumbers.some(gn => selectedPlayers.filter(p => groups[p.id] === gn).length > MAX_PER_GROUP)
                if (oversize) { setGroupError(`Max ${MAX_PER_GROUP} players per group`); return }
                setGroupError(null)
                setStep('game')
              }}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl active:bg-gray-900"
            >
              Next: Game Setup →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 5: Game & Stakes ──────────────────────────────────────────────────
  if (step === 'game') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <button onClick={() => setStep('groups')} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl">←</button>
          <div>
            <h1 className="text-xl font-bold">Game & Stakes</h1>
            <p className="text-gray-300 text-xs">{eventName} · {selectedPlayers.length} players</p>
          </div>
        </header>
        <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
          {/* Game type */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Game Type</p>
            <div className="grid grid-cols-3 gap-2">
              {GAME_OPTIONS.map(opt => {
                const disabled = (opt.type === 'wolf' && selectedPlayers.length < 3) ||
                  (opt.type === 'best_ball' && selectedPlayers.length % 2 !== 0) ||
                  (opt.type === 'hammer' && selectedPlayers.length !== 2)
                return (
                  <div key={opt.type} className="relative">
                    <button
                      onClick={() => { if (!disabled) { setGameType(opt.type); setGameError(null) } }}
                      disabled={disabled}
                      className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
                        gameType === opt.type
                          ? 'bg-amber-500 text-white'
                          : disabled
                            ? 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {opt.emoji} {opt.label}
                      {disabled && <span className="block text-[10px] font-normal mt-0.5">
                        {opt.type === 'wolf' ? '3+ players' : opt.type === 'hammer' ? '2 players' : 'Even #'}
                      </span>}
                    </button>
                    <button
                      onClick={() => setRulesModalType(opt.type)}
                      className={`absolute top-0.5 right-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        gameType === opt.type
                          ? 'bg-white/20 text-white/80'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                      }`}
                      aria-label={`${opt.label} rules`}
                    >
                      ?
                    </button>
                  </div>
                )
              })}
            </div>
            {gameError && <p className="text-red-500 text-sm">{gameError}</p>}
          </section>

          {/* Buy-in */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Buy-in</p>
            <div className="grid grid-cols-4 gap-2">
              {BUY_IN_PRESETS.map(cents => (
                <button
                  key={cents}
                  onClick={() => { setBuyInCents(cents); setCustomBuyIn('') }}
                  className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                    buyInCents === cents && !customBuyIn
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {fmtAmount(cents)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 font-medium">Custom:</span>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">pts</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={customBuyIn}
                  onChange={e => {
                    setCustomBuyIn(e.target.value)
                    const v = parseDollarsToCents(e.target.value, { allowZero: false })
                    if (v > 0) setBuyInCents(v)
                  }}
                  className="w-full h-10 pl-11 pr-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <p className="text-sm text-gray-500 text-center">
              Pot: {fmtAmount(buyInCents * selectedPlayers.length)}
            </p>
          </section>

          {/* Treasurer (before game-specific config so it's easy to find) */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Treasurer</p>
            <div className="space-y-2">
              {selectedPlayers.map(p => (
                <button
                  key={p.id}
                  onClick={() => setTreasurerId(p.id)}
                  className={`w-full p-3 rounded-xl border-2 text-left font-semibold text-sm transition-colors ${
                    treasurerId === p.id
                      ? 'border-amber-500 bg-amber-50 text-gray-900'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {p.name}{treasurerId === p.id ? ' ✓' : ''}
                </button>
              ))}
            </div>
          </section>

          {/* Game-specific config */}
          {gameType === 'skins' && (
            <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Skins Mode</p>
              <div className="flex gap-2">
                {(['gross', 'net'] as const).map(m => (
                  <button key={m} onClick={() => setSkinsMode(m)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold ${skinsMode === m ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={carryovers} onChange={e => setCarryovers(e.target.checked)}
                  className="rounded border-gray-300" />
                Carryovers (tied skins carry to next hole)
              </label>
            </section>
          )}
        </div>
        <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 safe-bottom">
          <div className="max-w-2xl mx-auto">
            {!treasurerId && (
              <p className="text-amber-600 text-sm font-semibold text-center mb-2">Select a treasurer to continue</p>
            )}
            <button
              onClick={() => setStep('review')}
              disabled={!treasurerId}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl disabled:opacity-40 active:bg-gray-900"
            >
              Next: Review →
            </button>
          </div>
        </div>
        {rulesModalType && <GameRulesModal gameType={rulesModalType} onClose={() => setRulesModalType(null)} />}
      </div>
    )
  }

  // ─── Share Step ────────────────────────────────────────────────────────────
  if (step === 'share' && createdInviteCode && createdRoundId && createdEventId) {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?join=${createdInviteCode}`

    const shareInvite = async () => {
      const title = `Join ${eventName}!`
      const text = `Join ${eventName} on Gimme Golf! Code: ${createdInviteCode}\n${inviteUrl}`
      if (navigator.share) {
        try { await navigator.share({ title, text }) } catch {}
      } else {
        await navigator.clipboard.writeText(inviteUrl)
        setShareToast('Link copied!')
        setTimeout(() => setShareToast(null), 3000)
      }
    }

    const copyCode = async () => {
      await navigator.clipboard.writeText(createdInviteCode)
      setShareToast('Code copied!')
      setTimeout(() => setShareToast(null), 3000)
    }

    const copyLink = async () => {
      await navigator.clipboard.writeText(inviteUrl)
      setShareToast('Link copied!')
      setTimeout(() => setShareToast(null), 3000)
    }

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <div className="w-[44px]" />
          <h1 className="text-xl font-bold">Event Created!</h1>
        </header>
        <div className="px-4 py-8 max-w-2xl mx-auto space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-center space-y-4">
            <p className="text-4xl">🎉</p>
            <h2 className="font-display font-bold text-2xl text-gray-900 dark:text-gray-100">{eventName}</h2>
            <p className="text-gray-500 text-sm">Share this code so players can join from their phones</p>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl py-6 px-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Invite Code</p>
              <p className="text-4xl font-mono font-bold tracking-[0.3em] text-gray-900 dark:text-gray-100">{createdInviteCode}</p>
              <InviteQR url={inviteUrl} code={createdInviteCode} />
              <button
                onClick={copyCode}
                className="text-xs text-amber-600 font-semibold underline active:text-amber-700"
              >
                Copy Code
              </button>
            </div>
            <button
              onClick={copyLink}
              className="w-full flex items-center justify-between bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 active:bg-gray-100 dark:active:bg-gray-600"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate text-left flex-1 mr-2 font-mono">{inviteUrl}</p>
              <span className="text-amber-600 text-sm font-semibold flex-shrink-0">Copy Link</span>
            </button>
            <button
              onClick={shareInvite}
              className="w-full h-14 bg-amber-500 text-white text-lg font-bold rounded-2xl active:bg-amber-600 shadow-lg flex items-center justify-center gap-2"
            >
              Share Invite Link
            </button>
            {shareToast && (
              <p className="text-green-600 font-semibold text-sm animate-pulse">{shareToast}</p>
            )}
          </div>
          <p className="text-center text-xs text-gray-400">Players open the link or enter the code on their phone to join and self-score.</p>
        </div>
        <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 safe-bottom">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={() => onStart(createdRoundId, createdEventId)}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl active:bg-gray-900"
            >
              Start Scoring →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 6: Review & Create ────────────────────────────────────────────────
  const GAME_LABELS: Record<GameType, string> = {
    skins: 'Skins',
    best_ball: 'Best Ball',
    nassau: 'Nassau',
    wolf: 'Wolf',
    bingo_bango_bongo: 'BBB',
    hammer: 'Hammer',
    vegas: 'Vegas',
    stableford: 'Stableford',
    dots: 'Dots',
    banker: 'Banker',
    quota: 'Quota',
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-28">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
        <button onClick={() => setStep('game')} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl">←</button>
        <h1 className="text-xl font-bold">Review Event</h1>
      </header>
      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-4">
          <div className="text-center">
            <h2 className="font-display font-bold text-2xl text-gray-900 dark:text-gray-100">{eventName}</h2>
            <p className="text-gray-500 text-sm mt-1">{selectedCourse?.name}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
              <p className="text-xs text-gray-500">Players</p>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{selectedPlayers.length}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
              <p className="text-xs text-gray-500">Groups</p>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{numGroups}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3">
              <p className="text-xs text-amber-600">Pot</p>
              <p className="text-xl font-bold text-amber-700">{fmtAmount(buyInCents * selectedPlayers.length)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Game: {GAME_LABELS[gameType]} · {fmtAmount(buyInCents)}/player</p>
            <p className="text-xs text-gray-500">Treasurer: {selectedPlayers.find(p => p.id === treasurerId)?.name ?? '—'}</p>
          </div>

          {/* Groups summary */}
          {groupNumbers.map(gn => {
            const gp = selectedPlayers.filter(p => groups[p.id] === gn)
            const sk = groupScorekeepers[gn]
            const skName = sk ? selectedPlayers.find(p => p.id === sk)?.name : null
            return (
              <div key={gn} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">Group {gn}</p>
                  {skName && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-700">SK: {skName}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">{gp.map(p => p.name).join(', ')}</p>
              </div>
            )
          })}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-blue-800 text-sm font-semibold">Players will join via invite code</p>
          <p className="text-blue-600 text-xs mt-0.5">After creating, share the code so players can self-score from their phones.</p>
        </div>
      </div>
      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 safe-bottom">
        <div className="max-w-2xl mx-auto">
          {createError && <p className="text-red-500 text-sm text-center mb-2">{createError}</p>}
          <button
            onClick={createEvent}
            disabled={saving}
            className="w-full h-14 bg-amber-500 text-white text-lg font-bold rounded-2xl active:bg-amber-600 disabled:opacity-60 shadow-lg"
          >
            {saving ? 'Creating Event...' : 'Create Event & Start'}
          </button>
        </div>
      </div>
    </div>
  )
}
