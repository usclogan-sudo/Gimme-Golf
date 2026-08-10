import { useEffect, useMemo, useState, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useUnsavedChangesPrompt } from '../../hooks/useUnsavedChangesPrompt'
import { enqueue, flush, getPending } from '../../lib/offlineQueue'
import { supabase, rowToRound, rowToRoundPlayer, rowToHoleScore, rowToBuyIn, rowToBBBPoint, rowToJunkRecord, rowToSideBet, rowToRoundParticipant, rowToEvent, rowToEventParticipant, rowToUserProfile, holeScoreToRow, bbbPointToRow, junkRecordToRow, sideBetToRow, rowToPropBet, propBetToRow, rowToPropWager, propWagerToRow, generateInviteCode } from '../../lib/supabase'
import { safeWrite } from '../../lib/safeWrite'
import { computeScorecardPermissions } from '../../lib/permissions'
import { parseDollarsToCents } from '../../lib/money'
import { applyHoleScorePayload, applyBBBPointPayload, applyJunkRecordPayload, applySideBetPayload, applyRoundParticipantPayload, applyBuyInPayload, applyPropBetPayload, applyPropWagerPayload } from '../../lib/realtimeReducers'
import { getCelebration, CelebrationToast, CelebrationFullscreen } from '../Celebrations'
import { Tooltip } from '../ui/Tooltip'
import { ConfirmModal } from '../ConfirmModal'
import { GameRulesModal } from '../GameRulesModal'
import { InviteQRModal } from '../InviteQR'
import { InvitePlayerModal } from '../InvitePlayerModal'
import { usePhotoImport } from './PhotoImportButton'
import { PhotoImportConfirmGrid } from './PhotoImportConfirmGrid'
import type { ExtractionResult } from '../../lib/photoImport'
import { NumberPad } from './NumberPad'
import { BuyInBanner } from './BuyInBanner'
import { LeaderboardTab } from './LeaderboardTab'
import { HoleBetsPanel } from './HoleBetsPanel'
import { DotsPanel } from './DotsPanel'
import { PropBetsPanel } from './PropBetsPanel'
import {
  buildCourseHandicaps,
  calculateSkins,
  calculateBestBall,
  calculateNassau,
  nassauLive,
  calculateWolf,
  calculateBBB,
  calculateHammer,
  calculateVegas,
  calculateStableford,
  calculateBanker,
  calculateQuota,
  calculateDots,
  wolfForHole,
  strokesOnHole,
  fmtAmount,
} from '../../lib/gameLogic'
import type { BestBallResult } from '../../lib/gameLogic'
import { makePlayableSnapshot, getPlayableHoleNumbers, roundToHolesConfig } from '../../lib/holeUtils'
import type {
  Round,
  RoundPlayer,
  HoleScore,
  BuyIn,
  BBBPoint,
  JunkRecord,
  JunkType,
  SideBet,
  RoundParticipant,
  SkinsConfig,
  BestBallConfig,
  NassauConfig,
  WolfConfig,
  HammerConfig,
  HammerHoleState,
  VegasConfig,
  StablefordConfig,
  BankerConfig,
  QuotaConfig,
  DotsConfig,
  DotType,
  GolfEvent,
  EventParticipant,
  ScoreStatus,
  Player,
  PropBet,
  PropWager,
  Game,
} from '../../types'
import { useShareImage } from '../ShareCard'
import { reportSupabaseError } from '../../lib/sentry'
import { SHOW_HOLE_BETS, SHOW_PROP_BETS, SHOW_PRESSES } from '../../lib/featureFlags'

interface Props {
  userId: string
  roundId: string
  onEndRound: () => void
  onHome: () => void
  readOnly?: boolean
}

function getScoreClass(score: number, par: number): string {
  const diff = score - par
  if (score === 1) return 'score-eagle'
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0) return 'score-par'
  if (diff === 1) return 'score-bogey'
  if (diff === 2) return 'score-double'
  return 'score-worse'
}

function scoreBtnClass(score: number, par: number): string {
  const diff = score - par
  if (score === 1 || diff <= -2) return 'bg-gradient-to-br from-amber-500 to-yellow-400 text-white border-amber-500'
  if (diff === -1) return 'bg-gradient-to-br from-blue-600 to-blue-400 text-white border-blue-500'
  if (diff === 0) return 'bg-emerald-500 text-white border-emerald-500'
  if (diff === 1) return 'bg-orange-400 text-white border-orange-400'
  if (diff === 2) return 'bg-red-400 text-white border-red-400'
  return 'bg-red-600 text-white border-red-600'
}

function InlineScorePad({
  value,
  par,
  hasScore,
  readOnly,
  onChange,
  onMore,
}: {
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
            className={`h-12 rounded-xl font-bold text-lg flex items-center justify-center border-2 transition-all active:scale-95 ${
              selected
                ? `${scoreBtnClass(n, par)} shadow-md ring-2 ring-offset-1 ring-gray-900 dark:ring-white`
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 active:bg-gray-50 dark:active:bg-gray-600'
            }`}
            aria-label={`Score ${n}`}
          >
            {n}
          </button>
        )
      })}
      <button
        onClick={() => !readOnly && onMore()}
        disabled={readOnly}
        className={`h-12 rounded-xl font-bold text-lg flex items-center justify-center border-2 transition-all active:scale-95 ${
          moreHighlight
            ? `${scoreBtnClass(value, par)} shadow-md ring-2 ring-offset-1 ring-gray-900 dark:ring-white`
            : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600 active:bg-gray-50 dark:active:bg-gray-600'
        }`}
        aria-label="More score options"
      >
        {moreHighlight ? value : '···'}
      </button>
    </div>
  )
}

function SkinsStatus({ carry, potCents, stakesMode }: { carry: number; potCents: number; stakesMode?: string }) {
  const valueCents = potCents * (carry + 1)
  if (carry === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
        <span className="text-gray-500 font-bold text-sm">Skins</span>
        <span className="text-gray-600 text-sm">{fmtAmount(valueCents, stakesMode)} per hole</span>
      </div>
    )
  }
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 flex items-center gap-2">
      <Tooltip term="Carry"><span className="text-yellow-600 font-bold text-sm">🔥 Carry ×{carry + 1}</span></Tooltip>
      <span className="text-yellow-700 text-sm">{fmtAmount(valueCents, stakesMode)} on the line</span>
    </div>
  )
}

function BestBallStatus({ result, scoring }: { result: BestBallResult; scoring: 'match' | 'total' }) {
  // Stroke Play (total): the winner is decided by total strokes, so the scoreboard
  // must show strokes — not holes-won, which could contradict the payout.
  if (scoring === 'total') {
    const { A, B } = result.totalScore
    const diff = A - B
    const label = diff === 0 ? 'All Square' : diff < 0 ? `Team A leads` : `Team B leads`
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
        <span className="text-blue-700 font-bold text-sm">{label}</span>
        <span className="text-blue-500 text-xs ml-2">(A {A} · B {B} strokes)</span>
      </div>
    )
  }
  const { holesWon } = result
  const diff = holesWon.A - holesWon.B
  const decided = holesWon.A + holesWon.tied + holesWon.B
  const label = diff === 0 ? 'All Square' : `Team ${diff > 0 ? 'A' : 'B'} ${Math.abs(diff)} UP`
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
      <span className="text-blue-700 font-bold text-sm">{label}</span>
      <span className="text-blue-500 text-xs ml-2">thru {decided}</span>
    </div>
  )
}

export function Scorecard({ userId, roundId, onEndRound, onHome, readOnly: readOnlyProp = false }: Props) {
  const [round, setRound] = useState<Round | null>(null)
  const [roundPlayers, setRoundPlayers] = useState<RoundPlayer[]>([])
  const [holeScores, setHoleScores] = useState<HoleScore[]>([])
  const [bbbPoints, setBbbPoints] = useState<BBBPoint[]>([])
  const [junkRecords, setJunkRecords] = useState<JunkRecord[]>([])
  const [sideBets, setSideBets] = useState<SideBet[]>([])
  const [propBets, setPropBets] = useState<PropBet[]>([])
  const [propWagers, setPropWagers] = useState<PropWager[]>([])
  const [roundParticipants, setRoundParticipants] = useState<RoundParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [inviteToast, setInviteToast] = useState<string | null>(null)
  const [showRulesModal, setShowRulesModal] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastFailedSave, setLastFailedSave] = useState<{ playerId: string; grossScore: number } | null>(null)
  const [activeGroupTab, setActiveGroupTab] = useState<number | 'all'>(1)
  const [celebration, setCelebration] = useState<{ level: 'toast' | 'fullscreen'; title: string; subtitle?: string; emoji: string; playerName: string } | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; destructive?: boolean } | null>(null)
  const [scoreTab, setScoreTab] = useState<'scores' | 'leaderboard'>('scores')
  const [showSideBetForm, setShowSideBetForm] = useState(false)
  const [sideBetDesc, setSideBetDesc] = useState('')
  const [sideBetAmount, setSideBetAmount] = useState('5')
  const [sideBetParticipants, setSideBetParticipants] = useState<string[]>([])
  const [editingHcpPlayerId, setEditingHcpPlayerId] = useState<string | null>(null)
  const [editingHcpValue, setEditingHcpValue] = useState('')
  const [showHoleConfirm, setShowHoleConfirm] = useState(false)
  const [confirmParFill, setConfirmParFill] = useState(false)
  const [showMiniBoard, setShowMiniBoard] = useState(false)
  const [showGameStatus, setShowGameStatus] = useState(true)
  // BBB (Bingo Bango Bongo) settles from points, not strokes — so golf-score entry
  // is optional and collapsed by default, and the standings/nags key off points.
  const [showScoreEntry, setShowScoreEntry] = useState(false)
  const { isOnline } = useOnlineStatus()
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(getPending())
  // Warn before navigating away (back button, tab close) if there are unsaved
  // offline writes — prevents losing taps that haven't synced yet.
  useUnsavedChangesPrompt(pendingCount > 0)
  const holeNavRef = useRef<HTMLDivElement>(null)
  const [showHoleGrid, setShowHoleGrid] = useState(false)

  // Buy-in / payment state
  const [buyIns, setBuyIns] = useState<BuyIn[]>([])
  const [treasurerProfile, setTreasurerProfile] = useState<Player | null>(null)

  // Event-related state
  const [event, setEvent] = useState<GolfEvent | null>(null)
  const [eventParticipants, setEventParticipants] = useState<EventParticipant[]>([])
  const [localHole, setLocalHole] = useState<number | null>(null)
  const [showApprovalPanel, setShowApprovalPanel] = useState(false)
  const [showContextBanner, setShowContextBanner] = useState(() => {
    try { return localStorage.getItem('scorecard-selfentry-dismissed') !== 'true' } catch { return true }
  })
  const [pendingPopover, setPendingPopover] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  // Per-cell debounce for score writes — coalesces rapid taps on the same
  // (player, hole) into one server write 250ms after the last tap. Map keyed
  // by `${playerId}-${holeNumber}`. Each entry tracks the pending payload so
  // we can flush on unmount.
  const pendingScoreWritesRef = useRef<Map<string, { timer: ReturnType<typeof setTimeout>; data: { playerId: string; holeNumber: number; grossScore: number } }>>(new Map())
  // Ref to the latest persistScore so timers fire with current closure state
  // (latest holeScores etc.) regardless of when the timer was scheduled.
  const persistScoreRef = useRef<((playerId: string, holeNumber: number, grossScore: number) => Promise<void>) | null>(null)
  const scoreToastTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const roundRef = useRef(round)
  roundRef.current = round
  const { shareRef, sharing, shareImage } = useShareImage('gimme-leaderboard')
  const [scoreToast, setScoreToast] = useState<{
    message: string
    type: 'info' | 'success' | 'error'
    undo?: { previousScore: number; playerId: string; holeNumber: number }
  } | null>(null)
  const [showRoundSummary, setShowRoundSummary] = useState(true)
  const [showBatchEntry, setShowBatchEntry] = useState(false)
  const [batchScores, setBatchScores] = useState<Record<string, Record<number, string>>>({})
  const [numberPadTarget, setNumberPadTarget] = useState<{ playerId: string; playerName: string } | null>(null)
  const [photoExtraction, setPhotoExtraction] = useState<ExtractionResult | null>(null)

  const loadScorecardData = (isCancelled?: () => boolean) => {
    const cancelled = () => isCancelled?.() ?? false
    setLoadError(false)
    setLoading(true)
    Promise.all([
      supabase.from('rounds').select('*').eq('id', roundId).single(),
      supabase.from('round_players').select('*').eq('round_id', roundId),
      supabase.from('hole_scores').select('*').eq('round_id', roundId),
      supabase.from('bbb_points').select('*').eq('round_id', roundId),
      supabase.from('junk_records').select('*').eq('round_id', roundId),
      supabase.from('side_bets').select('*').eq('round_id', roundId),
      supabase.from('round_participants').select('*').eq('round_id', roundId).eq('status', 'accepted'),
      supabase.from('buy_ins').select('*').eq('round_id', roundId),
      supabase.from('prop_bets').select('*').eq('round_id', roundId),
      supabase.from('prop_wagers').select('*').eq('round_id', roundId),
    ]).then(([roundRes, rpRes, hsRes, bbbRes, junkRes, sbRes, partRes, biRes, pbRes, pwRes]) => {
      if (cancelled()) return
      if (roundRes.error || !roundRes.data) {
        setLoadError(true)
        setLoading(false)
        return
      }
      setRound(rowToRound(roundRes.data))
      if (rpRes.data) setRoundPlayers(rpRes.data.map(rowToRoundPlayer))
      if (hsRes.data) setHoleScores(hsRes.data.map(rowToHoleScore))
      if (bbbRes.data) setBbbPoints(bbbRes.data.map(rowToBBBPoint))
      if (junkRes.data) setJunkRecords(junkRes.data.map(rowToJunkRecord))
      if (sbRes.data) setSideBets(sbRes.data.map(rowToSideBet))
      if (partRes.data) setRoundParticipants(partRes.data.map(rowToRoundParticipant))
      if (biRes.data) setBuyIns(biRes.data.map(rowToBuyIn))
      if (pbRes?.data) setPropBets(pbRes.data.map(rowToPropBet))
      if (pwRes?.data) setPropWagers(pwRes.data.map(rowToPropWager))
      setLoading(false)
    }).catch(() => {
      if (cancelled()) return
      setLoadError(true)
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    loadScorecardData(() => cancelled)
    return () => { cancelled = true }
  }, [roundId])

  // ─── Fetch event data when round is part of an event ──────────────────────
  useEffect(() => {
    if (!round?.eventId) return
    let cancelled = false
    Promise.all([
      supabase.from('events').select('*').eq('id', round.eventId).single(),
      supabase.from('event_participants').select('*').eq('event_id', round.eventId).eq('status', 'accepted'),
    ]).then(([eventRes, epRes]) => {
      if (cancelled) return
      if (eventRes.data) setEvent(rowToEvent(eventRes.data))
      if (epRes.data) setEventParticipants(epRes.data.map(rowToEventParticipant))
    })
    return () => { cancelled = true }
  }, [round?.eventId])

  // ─── Fetch treasurer payment info for BuyInBanner ──────────────────────────
  useEffect(() => {
    if (!round?.treasurerPlayerId || !round.players) return
    const treasurerPlayer = round.players.find(p => p.id === round.treasurerPlayerId)
    if (!treasurerPlayer) return
    let cancelled = false
    // Try to get fresh payment info from user_profiles (treasurer's player ID = their user ID for registered users)
    const participantMap = new Map(roundParticipants.map(rp => [rp.playerId, rp.userId]))
    const linkedUserId = participantMap.get(round.treasurerPlayerId)
    if (linkedUserId) {
      supabase.from('user_profiles').select('*').eq('user_id', linkedUserId).single().then(({ data }) => {
        if (cancelled) return
        if (data) {
          const profile = rowToUserProfile(data)
          setTreasurerProfile({
            ...treasurerPlayer,
            venmoUsername: profile.venmoUsername ?? treasurerPlayer.venmoUsername,
            zelleIdentifier: profile.zelleIdentifier ?? treasurerPlayer.zelleIdentifier,
            cashAppUsername: profile.cashAppUsername ?? treasurerPlayer.cashAppUsername,
            paypalEmail: profile.paypalEmail ?? treasurerPlayer.paypalEmail,
          })
        } else {
          setTreasurerProfile(treasurerPlayer)
        }
      })
    } else {
      setTreasurerProfile(treasurerPlayer)
    }
    return () => { cancelled = true }
  }, [round?.treasurerPlayerId, round?.players, roundParticipants])

  // ─── Realtime subscriptions for multi-device sync ──────────────────────────
  // Channel is opened only while the tab is visible. On a >5s hidden window
  // we drop the channel so backgrounded tabs don't count against the project's
  // realtime channel cap; on return we refetch state + resubscribe.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null
    const HIDDEN_GRACE_MS = 5000

    const buildChannel = () => supabase
      .channel(`round-${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hole_scores', filter: `round_id=eq.${roundId}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          const row = payload.new as any
          const oldRow = payload.old as any
          if (oldRow?.score_status === 'pending' && row.score_status === 'approved') {
            setScoreToast({ message: `Score approved! Hole ${row.hole_number}`, type: 'success' })
            setTimeout(() => setScoreToast(null), 3000)
          } else if (oldRow?.score_status === 'pending' && row.score_status === 'rejected') {
            setScoreToast({ message: `Score rejected on Hole ${row.hole_number} — re-enter your score`, type: 'error' })
            setTimeout(() => setScoreToast(null), 3000)
          }
        }
        setHoleScores(prev => applyHoleScorePayload(prev, payload as any))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bbb_points', filter: `round_id=eq.${roundId}` }, (payload) => {
        setBbbPoints(prev => applyBBBPointPayload(prev, payload as any))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'junk_records', filter: `round_id=eq.${roundId}` }, (payload) => {
        setJunkRecords(prev => applyJunkRecordPayload(prev, payload as any))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'side_bets', filter: `round_id=eq.${roundId}` }, (payload) => {
        setSideBets(prev => applySideBetPayload(prev, payload as any))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${roundId}` }, (payload) => {
        const row = payload.new as any
        setRound(rowToRound(row))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_participants', filter: `round_id=eq.${roundId}` }, (payload) => {
        setRoundParticipants(prev => applyRoundParticipantPayload(prev, payload as any))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'buy_ins', filter: `round_id=eq.${roundId}` }, (payload) => {
        setBuyIns(prev => applyBuyInPayload(prev, payload as any))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prop_bets', filter: `round_id=eq.${roundId}` }, (payload) => {
        setPropBets(prev => applyPropBetPayload(prev, payload as any))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prop_wagers', filter: `round_id=eq.${roundId}` }, (payload) => {
        setPropWagers(prev => applyPropWagerPayload(prev, payload as any))
      })
      .subscribe()

    const subscribe = () => {
      if (channel || cancelled) return
      channel = buildChannel()
    }

    const unsubscribe = () => {
      if (!channel) return
      supabase.removeChannel(channel)
      channel = null
    }

    const onVisibilityChange = () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') {
        // Only drop the channel after a grace period — short tab-switches
        // shouldn't cause subscribe/unsubscribe thrash.
        if (hiddenTimer) clearTimeout(hiddenTimer)
        hiddenTimer = setTimeout(() => {
          if (!cancelled && document.visibilityState === 'hidden') unsubscribe()
        }, HIDDEN_GRACE_MS)
      } else {
        if (hiddenTimer) { clearTimeout(hiddenTimer); hiddenTimer = null }
        // If we dropped the channel while hidden, refetch state to catch up
        // on writes that landed during the gap, then resubscribe.
        if (!channel) {
          loadScorecardData(() => cancelled)
          subscribe()
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    if (document.visibilityState !== 'hidden') subscribe()

    return () => {
      cancelled = true
      if (hiddenTimer) clearTimeout(hiddenTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unsubscribe()
    }
  }, [roundId])

  // Flush offline queue when coming back online
  useEffect(() => {
    if (isOnline && getPending() > 0) {
      setSyncing(true)
      flush().then(({ synced }) => {
        setPendingCount(getPending())
        setSyncing(false)
        if (synced > 0) {
          // Refetch scores after sync
          supabase.from('hole_scores').select('*').eq('round_id', roundId).then(({ data }) => {
            if (data) setHoleScores(data.map(rowToHoleScore))
          })
        }
      })
    }
  }, [isOnline, roundId])

  const players = round?.players ?? []
  const snapshot = round?.courseSnapshot
  const game = round?.game
  const isEventRound = !!round?.eventId

  // Photo-import flow — hook is mounted always; the confirm grid renders
  // only when an extraction result is in hand.
  const photoImport = usePhotoImport({
    roundId,
    players,
    snapshot: snapshot ?? { courseId: '', courseName: '', tees: [], holes: [] },
    onExtracted: (result) => setPhotoExtraction(result),
  })
  // For event rounds, use local hole navigation; for regular rounds, use DB-synced hole
  const currentHole = (isEventRound && localHole !== null) ? localHole : (round?.currentHole ?? 1)

  // Initialize localHole from round's currentHole on first load
  useEffect(() => {
    if (isEventRound && localHole === null && round) {
      setLocalHole(round.currentHole)
    }
  }, [isEventRound, round?.currentHole])

  // Close header menu on outside click
  useEffect(() => {
    if (!showHeaderMenu) return
    const handleClick = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false)
      }
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [showHeaderMenu])

  // Close pending popover on outside click
  useEffect(() => {
    if (!pendingPopover) return
    const handleClick = () => setPendingPopover(false)
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [pendingPopover])

  // Auto-scroll hole nav bar to current hole
  useEffect(() => {
    if (!showHoleGrid || !holeNavRef.current) return
    const btn = holeNavRef.current.querySelector(`[data-hole="${currentHole}"]`) as HTMLElement | null
    if (btn) btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [currentHole, showHoleGrid])

  // Determine which group this user belongs to (for shotgun start rotation)
  const myGroupNumber = useMemo(() => {
    if (!round?.groups) return undefined
    const myPid = roundParticipants.find(rp => rp.userId === userId)?.playerId
    return myPid ? round.groups[myPid] : undefined
  }, [round?.groups, roundParticipants, userId])

  // Build playable snapshot (filters/rotates holes for 9-hole or shotgun modes)
  const playableSnapshot = useMemo(() => {
    if (!snapshot || !round) return snapshot ?? null
    return makePlayableSnapshot(snapshot, roundToHolesConfig(round, myGroupNumber))
  }, [snapshot, round, myGroupNumber])

  const playableHoleNums = useMemo(() => {
    if (!snapshot || !round) return snapshot?.holes.map(h => h.number) ?? []
    return getPlayableHoleNumbers(snapshot, roundToHolesConfig(round, myGroupNumber))
  }, [snapshot, round, myGroupNumber])

  const courseHcps = useMemo(() => {
    if (!snapshot || !roundPlayers) return {}
    return buildCourseHandicaps(players, roundPlayers, snapshot, round?.holesMode)
  }, [players, roundPlayers, snapshot, round?.holesMode])

  const hole = snapshot?.holes.find(h => h.number === currentHole)
  const par = hole?.par ?? 4
  const strokeIndex = hole?.strokeIndex ?? currentHole

  const getScore = (playerId: string): number => {
    const hs = holeScores.find(s => s.playerId === playerId && s.holeNumber === currentHole)
    return hs?.grossScore ?? par
  }

  const showScoreToast = (
    message: string,
    type: 'success' | 'error' | 'info',
    undo?: { previousScore: number; playerId: string; holeNumber: number },
  ) => {
    if (scoreToastTimerRef.current) clearTimeout(scoreToastTimerRef.current)
    setScoreToast({ message, type, undo })
    const duration = undo ? 4000 : type === 'error' ? 3000 : 2000
    scoreToastTimerRef.current = setTimeout(() => setScoreToast(null), duration)
  }

  const performScoreUndo = () => {
    const undo = scoreToast?.undo
    if (!undo) return
    if (scoreToastTimerRef.current) clearTimeout(scoreToastTimerRef.current)
    setScoreToast(null)
    setHoleScores(prev => prev.map(s =>
      s.playerId === undo.playerId && s.holeNumber === undo.holeNumber
        ? { ...s, grossScore: undo.previousScore }
        : s
    ))
    void persistScoreRef.current?.(undo.playerId, undo.holeNumber, undo.previousScore)
  }

  // Server write — invoked by the debounced setScore wrapper after 250ms of
  // tap idle on a given (playerId, holeNumber). Uses `holeNumber` from the
  // tap rather than `currentHole` so writes for cells the user has navigated
  // away from still land on the right hole.
  const persistScore = async (playerId: string, holeNumber: number, grossScore: number) => {
    setSaveError(null)
    const existing = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNumber)

    try {
      if (isEventRound && myEventParticipant) {
        const scoreStatus: ScoreStatus = canApproveScores ? 'approved' : 'pending'
        if (existing) {
          setHoleScores(prev => prev.map(s => s.id === existing.id ? { ...s, grossScore, scoreStatus } : s))
        } else {
          const tempId = uuidv4()
          setHoleScores(prev => prev.find(s => s.playerId === playerId && s.holeNumber === holeNumber)
            ? prev
            : [...prev, { id: tempId, roundId, playerId, holeNumber, grossScore, scoreStatus, submittedBy: userId }])
        }
        const { data, error } = await supabase.rpc('submit_event_score', {
          p_round_id: roundId,
          p_player_id: playerId,
          p_hole_number: holeNumber,
          p_gross_score: grossScore,
        })
        if (error) throw error
        if (data) {
          const actualStatus = (data as any).status as ScoreStatus
          const actualId = (data as any).id as string
          setHoleScores(prev => prev.map(s =>
            (s.playerId === playerId && s.holeNumber === holeNumber)
              ? { ...s, id: actualId, scoreStatus: actualStatus }
              : s
          ))
          if (actualStatus === 'pending') {
            showScoreToast("Hang tight — the scorekeeper's confirming. You're in.", 'info')
          }
        }
      } else if (selfEntryOnly && myParticipant && playerId === myParticipant.playerId) {
        const prevScore = existing?.grossScore
        if (existing) {
          setHoleScores(prev => prev.map(s => s.id === existing.id ? { ...s, grossScore } : s))
        } else {
          const tempId = uuidv4()
          setHoleScores(prev => prev.find(s => s.playerId === playerId && s.holeNumber === holeNumber)
            ? prev
            : [...prev, { id: tempId, roundId, playerId, holeNumber, grossScore }])
        }
        const { error } = await supabase.rpc('submit_participant_score', {
          p_round_id: roundId,
          p_player_id: playerId,
          p_hole_number: holeNumber,
          p_gross_score: grossScore,
        })
        if (error) throw error
        showScoreToast(
          "Saved. You're good.",
          'success',
          prevScore !== undefined && prevScore !== grossScore
            ? { previousScore: prevScore, playerId, holeNumber }
            : undefined,
        )
      } else if (existing && !String(existing.id).startsWith('temp-')) {
        const prevScore = existing.grossScore
        setHoleScores(prev => prev.map(s => s.id === existing.id ? { ...s, grossScore } : s))
        const query = supabase.from('hole_scores').update({ gross_score: grossScore }).eq('id', existing.id)
        if (existing.updatedAt) query.eq('updated_at', existing.updatedAt)
        const { data, error } = await query.select()
        if (error) throw error
        if (!data || data.length === 0) {
          // Someone else updated this score — revert to whatever realtime pushed.
          setHoleScores(prev => {
            const current = prev.find(s => s.playerId === playerId && s.holeNumber === holeNumber)
            return current ? prev.map(s => s.id === existing.id ? current : s) : prev
          })
          showScoreToast('Score was updated by someone else', 'error')
          return
        }
        const updated = rowToHoleScore(data[0])
        setHoleScores(prev => prev.map(s => s.id === existing.id ? { ...s, grossScore, updatedAt: updated.updatedAt } : s))
        showScoreToast(
          "Saved. You're good.",
          'success',
          prevScore !== grossScore
            ? { previousScore: prevScore, playerId, holeNumber }
            : undefined,
        )
      } else {
        // New score: replace any optimistic `temp-` placeholder with the real
        // (uuid) row, then INSERT. Previously the placeholder was mistaken for an
        // existing DB row and UPDATE'd by an id that only exists client-side
        // (0 rows matched) → scores never persisted → settle voided to all-square.
        const newScore: HoleScore = { id: uuidv4(), roundId, playerId, holeNumber, grossScore }
        setHoleScores(prev => {
          const idx = prev.findIndex(s => s.playerId === playerId && s.holeNumber === holeNumber)
          return idx >= 0 ? prev.map((s, i) => (i === idx ? newScore : s)) : [...prev, newScore]
        })
        const { error } = await supabase.from('hole_scores').insert(holeScoreToRow(newScore, userId))
        if (error) throw error
        showScoreToast("Saved. You're good.", 'success')
      }
    } catch (err) {
      if (!isOnline) {
        // Only treat a persisted (non-temp) row as an update target; an
        // optimistic temp- placeholder must enqueue an INSERT, not an UPDATE by
        // a client-only id (which would match 0 rows on sync).
        const live = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNumber && !String(s.id).startsWith('temp-'))
        if (live) {
          enqueue({
            table: 'hole_scores',
            method: 'update',
            data: { gross_score: grossScore },
            matchColumn: 'id',
            matchValue: live.id,
            _expectedUpdatedAt: live.updatedAt,
          })
        } else {
          enqueue({
            table: 'hole_scores',
            method: 'insert',
            data: holeScoreToRow({ id: uuidv4(), roundId, playerId, holeNumber, grossScore }, userId),
          })
        }
        setPendingCount(getPending())
        showScoreToast('Saved offline — will sync when connected', 'success')
      } else {
        // Online failure path — the actual error never reached the user.
        // Capture so the underlying Postgres/RPC error is visible.
        reportSupabaseError(err, 'persist_score', {
          roundId, playerId, holeNumber, grossScore,
          path: isEventRound ? 'event_rpc' : selfEntryOnly ? 'participant_rpc' : existing ? 'update' : 'insert',
        })
        setSaveError('Score failed to save — check your connection')
        setLastFailedSave({ playerId, grossScore })
      }
    }
  }
  persistScoreRef.current = persistScore

  // Public entry point — instant optimistic UI + celebration, server write
  // coalesced 250ms after the last tap on the same cell.
  const setScore = (playerId: string, grossScore: number) => {
    const holeNumber = currentHole

    // Optimistic local update so the score input feels instant.
    const existing = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNumber)
    if (existing) {
      setHoleScores(prev => prev.map(s => s.id === existing.id ? { ...s, grossScore } : s))
    } else {
      const tempId = `temp-${playerId}-${holeNumber}`
      setHoleScores(prev => prev.find(s => s.id === tempId)
        ? prev.map(s => s.id === tempId ? { ...s, grossScore } : s)
        : [...prev, { id: tempId, roundId, playerId, holeNumber, grossScore }])
    }

    // Celebration fires on each tap (UX) — never debounced.
    const celeb = getCelebration(grossScore, par)
    if (celeb) {
      const playerName = players.find(p => p.id === playerId)?.name ?? ''
      setCelebration({ ...celeb, playerName })
    }

    // Reset the per-cell debounce timer.
    const key = `${playerId}-${holeNumber}`
    const map = pendingScoreWritesRef.current
    const prev = map.get(key)
    if (prev) clearTimeout(prev.timer)
    const timer = setTimeout(() => {
      map.delete(key)
      void persistScoreRef.current?.(playerId, holeNumber, grossScore)
    }, 250)
    map.set(key, { timer, data: { playerId, holeNumber, grossScore } })
  }

  // On unmount or roundId change, flush any pending debounced writes immediately
  // so we don't lose taps that landed within the last 250ms.
  useEffect(() => {
    const map = pendingScoreWritesRef.current
    return () => {
      for (const [, entry] of map) {
        clearTimeout(entry.timer)
        void persistScoreRef.current?.(entry.data.playerId, entry.data.holeNumber, entry.data.grossScore)
      }
      map.clear()
    }
  }, [roundId])

  const goToHole = async (holeNum: number) => {
    setSaveError(null)
    setConfirmParFill(false)
    if (isEventRound) {
      // Event rounds: navigate locally, only event manager updates DB
      setLocalHole(holeNum)
      if (isEventManager) {
        setRound(prev => prev ? { ...prev, currentHole: holeNum } : prev)
        const { error } = await supabase.from('rounds').update({ current_hole: holeNum }).eq('id', roundId)
        if (error) setSaveError('Failed to save hole change — check your connection')
      }
    } else {
      setRound(prev => prev ? { ...prev, currentHole: holeNum } : prev)
      const { error } = await supabase.from('rounds').update({ current_hole: holeNum }).eq('id', roundId)
      if (error) setSaveError('Failed to save hole change — check your connection')
    }
  }

  const confirmEndRound = () => {
    const totalHoles = playableHoleNums.length
    const holesWithAllScores = playableHoleNums
      .filter(n => players.every(p => holeScores.some(s => s.playerId === p.id && s.holeNumber === n)))
      .length
    const missing = totalHoles - holesWithAllScores
    const msg = missing > 0
      ? `${holesWithAllScores} of ${totalHoles} holes scored (${missing} incomplete). You can still view results in Settle Up.`
      : `All ${totalHoles} holes scored. View results in Settle Up.`
    setConfirmModal({
      title: 'End Round?',
      message: msg,
      onConfirm: async () => {
        setConfirmModal(null)
        setRound(prev => prev ? { ...prev, status: 'complete' } : prev)
        safeWrite(supabase.from('rounds').update({ status: 'complete' }).eq('id', roundId), 'end round')
        onEndRound()
      },
    })
  }

  const confirmGoHome = () => {
    if (readOnly) { onHome(); return }
    setConfirmModal({
      title: 'Leave Scoring?',
      message: 'Your round is saved and you can resume from the Home screen.',
      onConfirm: () => { setConfirmModal(null); onHome() },
    })
  }

  // Atomic game state update: reads latest from ref, applies mutation, persists.
  // On conflict (stale local state), refetches from DB and retries once.
  const updateGameState = async (mutate: (game: Game) => Game) => {
    const latest = roundRef.current
    if (!latest?.game) return
    const updatedGame = mutate(latest.game)
    setRound(prev => prev ? { ...prev, game: updatedGame } : prev)
    const { error } = await supabase.from('rounds')
      .update({ game: updatedGame }).eq('id', roundId).select('game').single()
    if (error) {
      // Conflict or network error — refetch and retry once
      const { data: fresh } = await supabase.from('rounds').select('game').eq('id', roundId).single()
      if (fresh?.game) {
        const retryGame = mutate(fresh.game)
        setRound(prev => prev ? { ...prev, game: retryGame } : prev)
        safeWrite(supabase.from('rounds').update({ game: retryGame }).eq('id', roundId), 'retry game update')
      }
    }
  }

  // Wolf decision handler
  const updateWolfDecision = async (holeNumber: number, partnerId: string | null) => {
    await updateGameState(game => {
      if (game.type !== 'wolf') return game
      const wolfConfig = game.config as WolfConfig
      const current = wolfConfig.holeDecisions?.[holeNumber]
      const newPartnerId = current?.partnerId === partnerId ? undefined : partnerId
      const updatedConfig: WolfConfig = {
        ...wolfConfig,
        holeDecisions: {
          ...(wolfConfig.holeDecisions ?? {}),
          ...(newPartnerId === undefined
            ? (() => { const d = { ...(wolfConfig.holeDecisions ?? {}) }; delete d[holeNumber]; return d })()
            : { [holeNumber]: { partnerId: newPartnerId } }),
        },
      }
      return { ...game, config: updatedConfig }
    })
  }

  // Press handler (Skins & Nassau)
  const handlePress = async () => {
    await updateGameState(game => {
      const config = game.config as any
      const presses = [...(config.presses ?? []), { holeNumber: currentHole, playerId: userId }]
      return { ...game, config: { ...config, presses } }
    })
  }

  // Undo the current user's most recent press (removes the last press this
  // device added — presses are attributed to userId when created above).
  const handleUndoPress = async () => {
    await updateGameState(game => {
      const config = game.config as any
      const presses = [...(config.presses ?? [])]
      for (let i = presses.length - 1; i >= 0; i--) {
        if (presses[i].playerId === userId) { presses.splice(i, 1); break }
      }
      return { ...game, config: { ...config, presses } }
    })
  }

  // How many presses the current user can undo.
  const myPressCount = ((game?.config as any)?.presses ?? []).filter((p: any) => p.playerId === userId).length

  // BBB point handler
  const setBBBPoint = async (category: 'bingo' | 'bango' | 'bongo', playerId: string) => {
    const existing = bbbPoints.find(p => p.holeNumber === currentHole)
    const currentVal = existing?.[category]
    const newVal = currentVal === playerId ? null : playerId

    if (existing) {
      const updated = { ...existing, [category]: newVal }
      setBbbPoints(prev => prev.map(p => p.id === existing.id ? updated : p))
      safeWrite(supabase.from('bbb_points').update({ [category]: newVal }).eq('id', existing.id), 'update bbb point')
    } else {
      const newPoint: BBBPoint = {
        id: uuidv4(),
        roundId,
        holeNumber: currentHole,
        bingo: category === 'bingo' ? newVal : null,
        bango: category === 'bango' ? newVal : null,
        bongo: category === 'bongo' ? newVal : null,
      }
      setBbbPoints(prev => [...prev, newPoint])
      safeWrite(supabase.from('bbb_points').insert(bbbPointToRow(newPoint, userId)), 'insert bbb point')
    }
  }

  // Junk toggle handler
  const toggleJunk = async (junkType: JunkType, playerId: string) => {
    const existing = junkRecords.find(jr => jr.holeNumber === currentHole && jr.playerId === playerId && jr.junkType === junkType)
    if (existing) {
      setJunkRecords(prev => prev.filter(jr => jr.id !== existing.id))
      safeWrite(supabase.from('junk_records').delete().eq('id', existing.id), 'delete junk record')
    } else {
      const newRecord: JunkRecord = { id: uuidv4(), roundId, holeNumber: currentHole, playerId, junkType }
      setJunkRecords(prev => [...prev, newRecord])
      safeWrite(supabase.from('junk_records').insert(junkRecordToRow(newRecord, userId)), 'insert junk record')
    }
  }

  // Side bet handlers
  const createSideBet = async () => {
    if (!sideBetDesc.trim() || sideBetParticipants.length < 2) return
    const amountCents = parseDollarsToCents(sideBetAmount) || 500
    const newBet: SideBet = {
      id: uuidv4(),
      roundId,
      holeNumber: currentHole,
      description: sideBetDesc.trim(),
      amountCents,
      participants: sideBetParticipants,
      status: 'open',
      createdAt: new Date(),
    }
    setSideBets(prev => [...prev, newBet])
    safeWrite(supabase.from('side_bets').insert(sideBetToRow(newBet, userId)), 'insert side bet')
    setSideBetDesc('')
    setSideBetAmount('5')
    setSideBetParticipants([])
    setShowSideBetForm(false)
  }

  const resolveSideBet = async (betId: string, winnerId: string) => {
    setSideBets(prev => prev.map(sb => sb.id === betId ? { ...sb, winnerPlayerId: winnerId, status: 'resolved' as const } : sb))
    safeWrite(supabase.from('side_bets').update({ winner_player_id: winnerId, status: 'resolved' }).eq('id', betId), 'resolve side bet')
  }

  const cancelSideBet = async (betId: string) => {
    setSideBets(prev => prev.map(sb => sb.id === betId ? { ...sb, status: 'cancelled' as const } : sb))
    safeWrite(supabase.from('side_bets').update({ status: 'cancelled' }).eq('id', betId), 'cancel side bet')
  }

  // Prop bet handlers
  const myPlayerId = roundParticipants.find(rp => rp.userId === userId)?.playerId

  const createPropBet = async (title: string, stakeCents: number, targetPlayerId?: string) => {
    if (!myPlayerId || !title.trim() || stakeCents <= 0) return
    const propId = uuidv4()
    const wagerId = uuidv4()
    const newProp: PropBet = {
      id: propId,
      roundId,
      creatorId: myPlayerId,
      userId,
      title: title.trim(),
      category: 'quick',
      wagerModel: 'challenge',
      stakeCents,
      outcomes: [{ id: 'y', label: 'Yes' }, { id: 'n', label: 'No' }],
      resolveType: 'manual',
      targetPlayerId,
      status: 'open',
      createdAt: new Date(),
      holeNumber: currentHole,
    }
    const creatorWager: PropWager = {
      id: wagerId,
      propBetId: propId,
      roundId,
      playerId: myPlayerId,
      userId,
      outcomeId: 'y',
      amountCents: stakeCents,
      createdAt: new Date(),
    }
    // Optimistic update
    setPropBets(prev => [...prev, newProp])
    setPropWagers(prev => [...prev, creatorWager])
    // Write prop first, then wager (wager has FK on prop)
    const { error: propErr } = await supabase.from('prop_bets').insert(propBetToRow(newProp, userId))
    if (propErr) {
      console.error('Failed to create prop:', propErr)
      setPropBets(prev => prev.filter(p => p.id !== propId))
      setPropWagers(prev => prev.filter(w => w.id !== wagerId))
      return
    }
    const { error: wagerErr } = await supabase.from('prop_wagers').insert(propWagerToRow(creatorWager, userId))
    if (wagerErr) {
      console.error('Failed to create creator wager:', wagerErr)
      // Prop exists but wager failed — still functional, wager can be re-created
    }
  }

  const acceptPropBet = async (propId: string, outcomeId: string): Promise<boolean> => {
    if (!myPlayerId) return false
    const prop = propBets.find(p => p.id === propId)
    if (!prop || prop.status !== 'open') return false
    // Prevent duplicate accept
    if (propWagers.some(w => w.propBetId === propId && w.playerId === myPlayerId)) return false
    // Prevent self-accept on challenge
    if (prop.wagerModel === 'challenge' && prop.creatorId === myPlayerId) return false

    const wager: PropWager = {
      id: uuidv4(),
      propBetId: propId,
      roundId,
      playerId: myPlayerId,
      userId,
      outcomeId,
      amountCents: prop.stakeCents,
      createdAt: new Date(),
    }
    setPropWagers(prev => [...prev, wager])
    const { error } = await supabase.from('prop_wagers').insert(propWagerToRow(wager, userId))
    if (error) {
      console.error('Failed to accept prop:', error)
      setPropWagers(prev => prev.filter(w => w.id !== wager.id))
      return false
    }
    return true
  }

  const resolvePropBet = async (propId: string, outcomeId: string): Promise<boolean> => {
    const prop = propBets.find(p => p.id === propId)
    if (!prop || prop.status !== 'open') return false
    if (prop.creatorId !== myPlayerId) return false // only creator can resolve

    const prev = prop.status
    setPropBets(ps => ps.map(pb => pb.id === propId ? { ...pb, status: 'resolved' as const, winningOutcomeId: outcomeId, resolvedAt: new Date() } : pb))
    // Conditional update: only resolve if still open (race-safe)
    const { error, count } = await supabase.from('prop_bets')
      .update({ status: 'resolved', winning_outcome_id: outcomeId, resolved_at: new Date().toISOString() })
      .eq('id', propId)
      .eq('status', 'open') // guard: only if still open
    if (error || count === 0) {
      console.error('Failed to resolve prop:', error)
      setPropBets(ps => ps.map(pb => pb.id === propId ? { ...pb, status: prev } : pb))
      return false
    }
    return true
  }

  const cancelPropBet = async (propId: string): Promise<boolean> => {
    const prop = propBets.find(p => p.id === propId)
    if (!prop || prop.status !== 'open') return false
    if (prop.creatorId !== myPlayerId) return false

    setPropBets(ps => ps.map(pb => pb.id === propId ? { ...pb, status: 'voided' as const } : pb))
    const { error, count } = await supabase.from('prop_bets')
      .update({ status: 'voided' })
      .eq('id', propId)
      .eq('status', 'open')
    if (error || count === 0) {
      console.error('Failed to void prop:', error)
      setPropBets(ps => ps.map(pb => pb.id === propId ? { ...pb, status: 'open' as const } : pb))
      return false
    }
    return true
  }

  const saveHandicapEdit = async () => {
    if (!editingHcpPlayerId || !round) return
    const newHcp = parseFloat(editingHcpValue)
    if (isNaN(newHcp) || newHcp < 0 || newHcp > 54) return
    // Update the player snapshot in the round
    const updatedPlayers = (round.players ?? []).map(p =>
      p.id === editingHcpPlayerId ? { ...p, handicapIndex: newHcp } : p
    )
    setRound(prev => prev ? { ...prev, players: updatedPlayers } : prev)
    setEditingHcpPlayerId(null)
    setEditingHcpValue('')
    // Persist: update round's player snapshot
    safeWrite(supabase.from('rounds').update({ players: updatedPlayers }).eq('id', roundId), 'update round players')
    // Also update the player in the players table
    safeWrite(supabase.from('players').update({ handicap_index: newHcp }).eq('id', editingHcpPlayerId), 'update player handicap')
  }

  // Role-based access (must be before approvedScores which depends on isEventRound)
  const {
    isScoremasterRole,
    selfEntryOnly,
    isEventManager,
    isGroupScorekeeper,
    isScoreMaster,
    groupHasActiveScorekeeper,
    canApproveScores,
    readOnly,
    myEventGroupNumber,
    myParticipant,
    myEventParticipant,
  } = computeScorecardPermissions(userId, round, roundParticipants, eventParticipants, isEventRound, readOnlyProp)

  // Filter scores for game logic: only use approved scores
  const approvedScores = useMemo(() => {
    if (!isEventRound) return holeScores
    return holeScores.filter(s => s.scoreStatus !== 'rejected' && s.scoreStatus !== 'pending')
  }, [holeScores, isEventRound])

  // Pending scores for approval panel
  const pendingScores = useMemo(() => {
    if (!isEventRound) return []
    return holeScores.filter(s => s.scoreStatus === 'pending')
  }, [holeScores, isEventRound])

  // Game result calculations (all depend on approvedScores, must come after it)
  // Use playableSnapshot so game logic only sees the holes being played
  const skinsResult = useMemo(() => {
    if (!game || game.type !== 'skins' || !playableSnapshot) return null
    return calculateSkins(players, approvedScores, playableSnapshot, game.config as SkinsConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const bestBallResult = useMemo(() => {
    if (!game || game.type !== 'best_ball' || !playableSnapshot) return null
    return calculateBestBall(players, approvedScores, playableSnapshot, game.config as BestBallConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const nassauResult = useMemo(() => {
    if (!game || game.type !== 'nassau' || !playableSnapshot) return null
    return calculateNassau(players, approvedScores, playableSnapshot, game.config as NassauConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const nassauLiveStatus = useMemo(() => {
    if (!game || game.type !== 'nassau' || !playableSnapshot) return null
    return nassauLive(players, approvedScores, playableSnapshot, game.config as NassauConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const wolfResult = useMemo(() => {
    if (!game || game.type !== 'wolf' || !playableSnapshot) return null
    return calculateWolf(players, approvedScores, playableSnapshot, game.config as WolfConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const bbbResult = useMemo(() => {
    if (!game || game.type !== 'bingo_bango_bongo') return null
    return calculateBBB(players, bbbPoints)
  }, [game, players, bbbPoints])

  // Hammer game state
  const hammerConfig = game?.type === 'hammer' ? game.config as HammerConfig : null
  const hammerStates = hammerConfig?.hammerStates ?? {}

  const hammerResult = useMemo(() => {
    if (!game || game.type !== 'hammer' || !playableSnapshot || players.length !== 2) return null
    return calculateHammer(players, approvedScores, playableSnapshot, game.config as HammerConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const vegasResult = useMemo(() => {
    if (!game || game.type !== 'vegas' || !playableSnapshot) return null
    return calculateVegas(players, approvedScores, playableSnapshot, game.config as VegasConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const stablefordResult = useMemo(() => {
    if (!game || game.type !== 'stableford' || !playableSnapshot) return null
    return calculateStableford(players, approvedScores, playableSnapshot, game.config as StablefordConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const bankerResult = useMemo(() => {
    if (!game || game.type !== 'banker' || !playableSnapshot) return null
    return calculateBanker(players, approvedScores, playableSnapshot, game.config as BankerConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const quotaResult = useMemo(() => {
    if (!game || game.type !== 'quota' || !playableSnapshot) return null
    return calculateQuota(players, approvedScores, playableSnapshot, game.config as QuotaConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  // Dots settle from the junk_records for this round (junkType holds the DotType).
  const dotsResult = useMemo(() => {
    if (!game || game.type !== 'dots') return null
    return calculateDots(players, junkRecords, game.config as DotsConfig)
  }, [game, players, junkRecords])

  // Dots reuse the junk toggle/persistence (junkType stores a DotType string).
  const toggleDot = (dot: DotType, playerId: string) => toggleJunk(dot as JunkType, playerId)

  // Alt (opposite mode) results — compute the other mode for dual display
  const skinsResultAlt = useMemo(() => {
    if (!game || game.type !== 'skins' || !playableSnapshot) return null
    const cfg = game.config as SkinsConfig
    return calculateSkins(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const bestBallResultAlt = useMemo(() => {
    if (!game || game.type !== 'best_ball' || !playableSnapshot) return null
    const cfg = game.config as BestBallConfig
    return calculateBestBall(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const nassauResultAlt = useMemo(() => {
    if (!game || game.type !== 'nassau' || !playableSnapshot) return null
    const cfg = game.config as NassauConfig
    return calculateNassau(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const wolfResultAlt = useMemo(() => {
    if (!game || game.type !== 'wolf' || !playableSnapshot) return null
    const cfg = game.config as WolfConfig
    return calculateWolf(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const vegasResultAlt = useMemo(() => {
    if (!game || game.type !== 'vegas' || !playableSnapshot) return null
    const cfg = game.config as VegasConfig
    return calculateVegas(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const stablefordResultAlt = useMemo(() => {
    if (!game || game.type !== 'stableford' || !playableSnapshot) return null
    const cfg = game.config as StablefordConfig
    return calculateStableford(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const bankerResultAlt = useMemo(() => {
    if (!game || game.type !== 'banker' || !playableSnapshot) return null
    const cfg = game.config as BankerConfig
    return calculateBanker(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const quotaResultAlt = useMemo(() => {
    if (!game || game.type !== 'quota' || !playableSnapshot) return null
    const cfg = game.config as QuotaConfig
    return calculateQuota(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const currentHammerState = hammerStates[currentHole] ?? null

  const currentCarry = useMemo(() => {
    if (!skinsResult) return 0
    const prevHole = skinsResult.holeResults.find(h => h.holeNumber === currentHole - 1)
    if (!prevHole) return 0
    return prevHole.winnerId === null ? prevHole.carry + 1 : 0
  }, [skinsResult, currentHole])

  const miniBoard = useMemo(() => {
    if (!playableSnapshot) return []
    const pSnap = playableSnapshot
    const gt = game?.type
    // Points/net games rank by their own metric, not strokes: BBB & Stableford by
    // points, Quota by points-over-quota, Banker by holes-won units.
    const rankBy: 'points' | 'quota' | 'banker' | 'strokes' =
      gt === 'bingo_bango_bongo' || gt === 'stableford' ? 'points'
      : gt === 'quota' ? 'quota'
      : gt === 'banker' ? 'banker'
      : 'strokes'
    const board = players.map(p => {
      const pScores = holeScores.filter(s => s.playerId === p.id && playableHoleNums.includes(s.holeNumber))
      const gross = pScores.reduce((s, hs) => s + hs.grossScore, 0)
      const courseHcp = courseHcps[p.id] ?? 0
      const netStrokes = pScores.reduce((s, hs) => {
        const hole = pSnap.holes.find(h => h.number === hs.holeNumber)
        return s + (hole ? strokesOnHole(courseHcp, hole.strokeIndex, pSnap.holes.length) : 0)
      }, 0)
      const net = gross - netStrokes
      const scoredPar = pScores.reduce((s, hs) => {
        const hole = pSnap.holes.find(h => h.number === hs.holeNumber)
        return s + (hole?.par ?? 0)
      }, 0)
      const vsPar = gross - scoredPar
      const points =
        gt === 'stableford' ? (stablefordResult?.points[p.id] ?? 0)
        : gt === 'quota' ? (quotaResult?.netPoints[p.id] ?? 0)
        : (bbbResult?.pointsWon[p.id] ?? 0)
      const bankerUnits = bankerResult?.netCents[p.id] ?? 0
      return { player: p, gross, net, vsPar, thru: pScores.length, points, bankerUnits }
    })
    // Higher is better for points/quota/banker; lower net is better for strokes.
    const metric = (e: typeof board[number]) => rankBy === 'banker' ? e.bankerUnits : e.points
    board.sort((a, b) => rankBy === 'strokes' ? a.net - b.net : metric(b) - metric(a))
    const positions: number[] = []
    board.forEach((entry, idx) => {
      if (idx === 0) positions.push(1)
      else {
        const tied = rankBy === 'strokes' ? entry.net === board[idx - 1].net : metric(entry) === metric(board[idx - 1])
        positions.push(tied ? positions[idx - 1] : idx + 1)
      }
    })
    return board.map((entry, idx) => ({ ...entry, pos: positions[idx], rankBy }))
  }, [players, holeScores, playableSnapshot, playableHoleNums, courseHcps, game, bbbResult, stablefordResult, quotaResult, bankerResult])

  const headerClass = game?.stakesMode === 'high_roller' ? 'hr-header' : 'app-header'

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-red-500 font-semibold">Failed to load scorecard</p>
        <button onClick={() => loadScorecardData()} className="px-6 py-3 bg-amber-500 text-white font-bold rounded-xl active:bg-amber-600">Tap to Retry</button>
        <button onClick={onHome} className="text-gray-500 text-sm underline mt-2">Go Back</button>
      </div>
    )
  }

  if (loading || !round || !snapshot) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center"><p className="text-gray-400">Loading round…</p></div>
  }

  const junkConfig = round?.junkConfig
  const wolfConfig = game?.type === 'wolf' ? game.config as WolfConfig : null
  const wolfId = wolfConfig ? wolfForHole(wolfConfig.wolfOrder, currentHole) : null
  const wolfDecision = wolfConfig?.holeDecisions?.[currentHole]
  const currentBBB = bbbPoints.find(p => p.holeNumber === currentHole)

  // Hammer interaction functions
  const updateHammerState = async (holeNum: number, state: HammerHoleState) => {
    await updateGameState(game => {
      if (game.type !== 'hammer') return game
      const updatedStates = { ...(game.config as HammerConfig).hammerStates, [holeNum]: state }
      return { ...game, config: { ...game.config, hammerStates: updatedStates } }
    })
  }

  const throwHammer = () => {
    if (!hammerConfig || players.length !== 2) return
    const current = currentHammerState
    if (current && current.declined) return // Already resolved
    const maxPresses = hammerConfig.maxPresses
    const baseValue = hammerConfig.baseValueCents
    if (!current) {
      // First throw on this hole — player 0 starts with hammer
      const newState: HammerHoleState = {
        hammerHolder: players[0].id,
        value: baseValue * 2,
        presses: 1,
        declined: false,
      }
      updateHammerState(currentHole, newState)
    } else {
      if (maxPresses != null && current.presses >= maxPresses) return
      const newState: HammerHoleState = {
        ...current,
        hammerHolder: players.find(p => p.id !== current.hammerHolder)!.id,
        value: current.value * 2,
        presses: current.presses + 1,
        declined: false,
      }
      updateHammerState(currentHole, newState)
    }
  }

  const declineHammer = () => {
    if (!currentHammerState || currentHammerState.declined) return
    const decliner = players.find(p => p.id !== currentHammerState.hammerHolder)!.id
    const newState: HammerHoleState = {
      ...currentHammerState,
      declined: true,
      declinedBy: decliner,
    }
    updateHammerState(currentHole, newState)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      <header className={`${headerClass} text-white px-4 py-2 sticky top-0 z-10 shadow-xl`}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={confirmGoHome} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl" aria-label="Back">←</button>
            <div>
              <p className="text-xs text-gray-300 font-medium flex items-center gap-1.5">
                {event ? `${event.name} · ` : ''}{snapshot.courseName}
                <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/30 px-1.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                  {readOnly ? 'Spectating' : isEventRound ? (isScoreMaster ? 'Score Master' : isGroupScorekeeper ? `Scorekeeper · G${myEventGroupNumber}` : groupHasActiveScorekeeper ? 'View Only' : 'Self-Entry') : selfEntryOnly ? 'Self-Entry' : 'Live'}
                </span>
              </p>
              <h1 className="text-xl font-bold flex items-center gap-2">
                Hole {currentHole}
                <span className="text-gray-300 font-normal text-base">Par {par} · <Tooltip term="SI">SI {strokeIndex}</Tooltip></span>
                {game?.stakesMode === 'high_roller' && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: 'linear-gradient(135deg,#d97706,#fbbf24)', color: '#000' }}>
                    💎
                  </span>
                )}
              </h1>
            </div>
          </div>
          <div className="relative" ref={headerMenuRef}>
            <button
              onClick={() => setShowHeaderMenu(v => !v)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-black/20 text-xl"
              aria-label="Menu"
            >
              ⋮
            </button>
            {showHeaderMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 rounded-xl shadow-2xl border border-gray-600 min-w-[180px] z-50 py-1 overflow-hidden">
                {/* Primary path: the clear search-and-add modal comes first. The
                    share-a-link path (which just fires the OS share sheet / copies a
                    link) is demoted below it, since on desktop it reads as a no-op. */}
                {isScoremasterRole && (
                  <button
                    onClick={() => { setShowHeaderMenu(false); setShowInviteModal(true) }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-cyan-300 hover:bg-gray-700 active:bg-gray-700"
                  >
                    👤 Add players
                  </button>
                )}
                {isScoremasterRole && (
                  <button
                    onClick={async () => {
                      setShowHeaderMenu(false)
                      let code = (event?.inviteCode) ?? round.inviteCode
                      if (!code) {
                        code = generateInviteCode()
                        const { error } = await supabase.from('rounds').update({ invite_code: code }).eq('id', roundId)
                        if (error) {
                          const { data } = await supabase.from('rounds').select('invite_code').eq('id', roundId).single()
                          code = data?.invite_code ?? code
                        }
                        setRound(prev => prev ? { ...prev, inviteCode: code! } : prev)
                      }
                      const title = event ? `Join ${event.name}!` : 'Join my round!'
                      const url = `${window.location.origin}${window.location.pathname}?join=${code}`
                      const text = event
                        ? `Join ${event.name} on Gimme Golf! Code: ${code}\n${url}`
                        : `Join my round on Gimme Golf! Code: ${code}\n${url}`
                      if (navigator.share) {
                        try { await navigator.share({ title, text, url }) } catch {}
                      } else {
                        await navigator.clipboard.writeText(url)
                      }
                      setInviteToast(`Join link copied · code ${code}`)
                      setTimeout(() => setInviteToast(null), 5000)
                    }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-cyan-300 hover:bg-gray-700 active:bg-gray-700"
                  >
                    🔗 Share join link
                  </button>
                )}
                {isScoremasterRole && (
                  <button
                    onClick={async () => {
                      setShowHeaderMenu(false)
                      let code = (event?.inviteCode) ?? round.inviteCode
                      if (!code) {
                        code = generateInviteCode()
                        const { error } = await supabase.from('rounds').update({ invite_code: code }).eq('id', roundId)
                        if (error) {
                          const { data } = await supabase.from('rounds').select('invite_code').eq('id', roundId).single()
                          code = data?.invite_code ?? code
                        }
                        setRound(prev => prev ? { ...prev, inviteCode: code! } : prev)
                      }
                      setShowQRModal(true)
                    }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-cyan-300 hover:bg-gray-700 active:bg-gray-700"
                  >
                    📷 QR code
                  </button>
                )}
                {!readOnly && (
                  <button
                    onClick={async () => {
                      setShowHeaderMenu(false)
                      let code = (event?.inviteCode) ?? round.inviteCode
                      if (!code) {
                        code = generateInviteCode()
                        const { error } = await supabase.from('rounds').update({ invite_code: code }).eq('id', roundId)
                        if (error) {
                          const { data } = await supabase.from('rounds').select('invite_code').eq('id', roundId).single()
                          code = data?.invite_code ?? code
                        }
                        setRound(prev => prev ? { ...prev, inviteCode: code! } : prev)
                      }
                      const url = `${window.location.origin}${window.location.pathname}?spectate=${code}`
                      const title = 'Watch live leaderboard!'
                      const text = `Follow the round live on Gimme Golf!\n${url}`
                      if (navigator.share) {
                        try { await navigator.share({ title, text, url }) } catch {}
                      } else {
                        await navigator.clipboard.writeText(url)
                      }
                      setInviteToast('Spectator link copied!')
                      setTimeout(() => setInviteToast(null), 3000)
                    }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-green-300 hover:bg-gray-700 active:bg-gray-700"
                  >
                    📡 Live Spectator Link
                  </button>
                )}
                {!readOnly && snapshot && players.length > 0 && (
                  <button
                    onClick={() => { setShowHeaderMenu(false); photoImport.open() }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-amber-300 hover:bg-gray-700 active:bg-gray-700"
                  >
                    📸 Import scores from photo
                  </button>
                )}
                {game && (
                  <button
                    onClick={() => { setShowHeaderMenu(false); setShowRulesModal(true) }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-cyan-300 hover:bg-gray-700 active:bg-gray-700"
                  >
                    Rules
                  </button>
                )}
                {!readOnly && (isEventRound ? isScoreMaster : !selfEntryOnly) && (
                  <button
                    onClick={() => { setShowHeaderMenu(false); confirmEndRound() }}
                    className="w-full px-4 py-3 text-left text-sm font-medium text-yellow-300 hover:bg-gray-700 active:bg-gray-700"
                  >
                    End Round
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-2 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              const idx = playableHoleNums.indexOf(currentHole)
              if (idx > 0) goToHole(playableHoleNums[idx - 1])
            }}
            disabled={playableHoleNums.indexOf(currentHole) <= 0}
            className="min-w-[44px] min-h-[44px] rounded-full bg-gray-700/40 text-gray-300 font-bold text-lg disabled:opacity-30"
          >‹</button>
          <button
            onClick={() => setShowHoleGrid(!showHoleGrid)}
            className="text-white font-bold text-sm px-3 py-1.5 rounded-lg active:bg-gray-600 transition-colors"
          >
            Hole {currentHole} · Par {par}
            {round?.holesMode === 'front_9' ? ' · Front 9' : round?.holesMode === 'back_9' ? ' · Back 9' : ''}
            {(round?.startingHole ?? 1) > 1 && round?.holesMode !== 'front_9' && round?.holesMode !== 'back_9' ? ` · Shotgun ${round?.startingHole}` : ''}
          </button>
          <button
            onClick={() => {
              const idx = playableHoleNums.indexOf(currentHole)
              if (idx < playableHoleNums.length - 1) goToHole(playableHoleNums[idx + 1])
            }}
            disabled={playableHoleNums.indexOf(currentHole) >= playableHoleNums.length - 1}
            className="min-w-[44px] min-h-[44px] rounded-full bg-gray-700/40 text-gray-300 font-bold text-lg disabled:opacity-30"
          >›</button>
        </div>
        {showHoleGrid && (
          <div ref={holeNavRef} className="max-w-2xl mx-auto mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {playableHoleNums.map(n => {
              const hasScore = players.length > 0 && players.every(p => holeScores.some(s => s.playerId === p.id && s.holeNumber === n))
              return (
                <button key={n} data-hole={n} onClick={() => { goToHole(n); setShowHoleGrid(false) }}
                  className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-full text-sm font-bold flex-shrink-0 transition-colors flex items-center justify-center ${
                    n === currentHole ? 'bg-white text-gray-800 ring-2 ring-amber-400' : hasScore ? 'bg-amber-500 text-white' : 'bg-gray-700/40 text-gray-400 border border-gray-500/30'
                  }`}>{n}</button>
              )
            })}
          </div>
        )}
      </header>

      {/* Scores / Leaderboard tab toggle */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 sticky top-[calc(5.5rem+2rem)] z-[6]">
        <div className="max-w-2xl mx-auto flex gap-1">
          <button
            onClick={() => setScoreTab('scores')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              scoreTab === 'scores' ? 'bg-gray-800 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            Scores
          </button>
          <button
            onClick={() => setScoreTab('leaderboard')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              scoreTab === 'leaderboard' ? 'bg-gray-800 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            Leaderboard
          </button>
        </div>
      </div>

      {/* Buy-In Payment Banner — hidden for points mode */}
      {(() => {
        if (game?.stakesMode === 'points') return null
        if (!userId || !round?.treasurerPlayerId || !treasurerProfile) return null
        // Find current user's player ID via round_participants
        const myParticipant = roundParticipants.find(rp => rp.userId === userId)
        if (!myParticipant) return null
        const myPlayerId = myParticipant.playerId
        // Don't show to treasurer
        if (myPlayerId === round.treasurerPlayerId) return null
        const myBuyIn = buyIns.find(b => b.playerId === myPlayerId)
        if (!myBuyIn) return null
        return (
          <BuyInBanner
            buyIn={myBuyIn}
            treasurerPlayer={treasurerProfile}
            roundId={roundId}
            playerId={myPlayerId}
            stakesMode={game?.stakesMode}
            onReported={(method) => {
              setBuyIns(prev => prev.map(b =>
                b.playerId === myPlayerId
                  ? { ...b, method: method as any, playerReportedAt: new Date() }
                  : b
              ))
            }}
          />
        )
      })()}

      {/* Round Complete Summary */}
      {showRoundSummary && (() => {
        if (!snapshot) return null
        const totalHoles = snapshot.holes.length
        const allHolesScored = players.length > 0 && players.every(p =>
          Array.from({ length: totalHoles }, (_, i) => i + 1).every(n =>
            holeScores.some(s => s.playerId === p.id && s.holeNumber === n)
          )
        )
        if (!allHolesScored) return null
        // Compute stats for the current user's player (or first player)
        const myPlayer = players.find(p => {
          const rp = roundParticipants.find(rp2 => rp2.userId === userId)
          return rp ? p.id === rp.playerId : false
        }) ?? players[0]
        const myScores = holeScores.filter(s => s.playerId === myPlayer.id)
        const totalScore = myScores.reduce((sum, s) => sum + s.grossScore, 0)
        const totalPar = snapshot.holes.reduce((sum, h) => sum + h.par, 0)
        const vsPar = totalScore - totalPar
        const bestHole = myScores.reduce((best, s) => {
          const hole = snapshot.holes.find(h => h.number === s.holeNumber)
          const diff = s.grossScore - (hole?.par ?? 4)
          return diff < best.diff ? { holeNum: s.holeNumber, diff, score: s.grossScore, par: hole?.par ?? 4 } : best
        }, { holeNum: 0, diff: 99, score: 0, par: 0 })
        const worstHole = myScores.reduce((worst, s) => {
          const hole = snapshot.holes.find(h => h.number === s.holeNumber)
          const diff = s.grossScore - (hole?.par ?? 4)
          return diff > worst.diff ? { holeNum: s.holeNumber, diff, score: s.grossScore, par: hole?.par ?? 4 } : worst
        }, { holeNum: 0, diff: -99, score: 0, par: 0 })
        return (
          <div className="px-4 pt-4 max-w-2xl mx-auto">
            <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-2xl p-5 space-y-3 relative">
              <button
                onClick={() => setShowRoundSummary(false)}
                className="absolute top-3 right-3 text-amber-400 text-lg font-bold"
              >&times;</button>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">Round Complete!</p>
                <p className="text-amber-700 text-sm font-medium mt-1">{snapshot.courseName}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/70 rounded-xl p-2">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-xl font-bold text-gray-900">{totalScore}</p>
                </div>
                <div className="bg-white/70 rounded-xl p-2">
                  <p className="text-xs text-gray-500">vs Par</p>
                  <p className={`text-xl font-bold ${vsPar > 0 ? 'text-red-600' : vsPar < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {vsPar > 0 ? '+' : ''}{vsPar === 0 ? 'E' : vsPar}
                  </p>
                </div>
                <div className="bg-white/70 rounded-xl p-2">
                  <p className="text-xs text-gray-500">Holes</p>
                  <p className="text-xl font-bold text-gray-900">{totalHoles}</p>
                </div>
              </div>
              <div className="flex gap-2 text-center">
                <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-2">
                  <p className="text-xs text-green-600">Best Hole</p>
                  <p className="text-sm font-bold text-green-800">#{bestHole.holeNum} ({bestHole.score}, {bestHole.diff > 0 ? '+' : ''}{bestHole.diff === 0 ? 'E' : bestHole.diff})</p>
                </div>
                <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-2">
                  <p className="text-xs text-red-600">Worst Hole</p>
                  <p className="text-sm font-bold text-red-800">#{worstHole.holeNum} ({worstHole.score}, +{worstHole.diff})</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                {!readOnly && (
                  <button
                    onClick={confirmEndRound}
                    className="flex-1 h-12 bg-amber-500 text-white font-bold rounded-xl active:bg-amber-600 text-sm"
                  >
                    Settle Up
                  </button>
                )}
                <button
                  onClick={confirmGoHome}
                  className="flex-1 h-12 bg-gray-100 text-gray-700 font-bold rounded-xl active:bg-gray-200 text-sm"
                >
                  ← Home
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Mini-leaderboard on Scores tab */}
      {scoreTab === 'scores' && miniBoard.length > 0 && (
        <div className="px-4 pt-3 max-w-2xl mx-auto">
          <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowMiniBoard(!showMiniBoard)}
              className="w-full px-3 py-2 flex items-center justify-between"
            >
              {showMiniBoard ? (
                <span className="text-xs font-semibold text-gray-500 uppercase">Standings</span>
              ) : (
                <div className="flex-1 flex items-center gap-1.5 overflow-x-auto text-xs font-semibold text-gray-600">
                  {miniBoard.map((e, i) => (
                    <span key={e.player.id}>
                      {i > 0 && <span className="text-gray-300 mx-0.5">·</span>}
                      {e.pos}. {e.player.name}{' '}
                      {e.rankBy === 'points' ? (
                        <span className="text-purple-600 font-bold">{e.points}pt</span>
                      ) : e.rankBy === 'quota' ? (
                        <span className={e.points > 0 ? 'text-green-600 font-bold' : e.points < 0 ? 'text-red-500 font-bold' : 'text-gray-400 font-bold'}>{e.points > 0 ? '+' : ''}{e.points}</span>
                      ) : e.rankBy === 'banker' ? (
                        <span className={e.bankerUnits > 0 ? 'text-green-600 font-bold' : e.bankerUnits < 0 ? 'text-red-500 font-bold' : 'text-gray-400 font-bold'}>{e.bankerUnits > 0 ? '+' : ''}{e.bankerUnits}u</span>
                      ) : (
                        <span className={e.vsPar > 0 ? 'text-red-500' : e.vsPar < 0 ? 'text-green-600' : 'text-gray-400'}>
                          ({e.thru > 0 ? `${e.vsPar > 0 ? '+' : ''}${e.vsPar === 0 ? 'E' : e.vsPar}` : '—'})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <span className="text-gray-400 text-xs ml-2 flex-shrink-0">{showMiniBoard ? '▾' : '▸'}</span>
            </button>
            {showMiniBoard && (
              <div className="px-3 pb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase">
                      <th className="text-left py-1 px-1 font-medium w-6">Pos</th>
                      <th className="text-left py-1 px-1 font-medium">Player</th>
                      {game?.type === 'bingo_bango_bongo' || game?.type === 'stableford' ? (
                        <th className="text-center py-1 px-1 font-medium">Points</th>
                      ) : game?.type === 'quota' ? (
                        <th className="text-center py-1 px-1 font-medium">vs Quota</th>
                      ) : game?.type === 'banker' ? (
                        <th className="text-center py-1 px-1 font-medium">Units</th>
                      ) : (
                        <>
                          <th className="text-center py-1 px-1 font-medium"><Tooltip term="Net">Net</Tooltip></th>
                          <th className="text-center py-1 px-1 font-medium">vs Par</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {miniBoard.map(e => (
                      <tr key={e.player.id} className={e.pos === 1 ? 'bg-amber-50' : ''}>
                        <td className={`py-1 px-1 font-bold text-sm ${e.pos === 1 ? 'text-amber-600' : 'text-gray-500'}`}>{e.pos}</td>
                        <td className="py-1 px-1 font-semibold text-gray-800 text-sm">{e.player.name}</td>
                        {game?.type === 'bingo_bango_bongo' || game?.type === 'stableford' ? (
                          <td className="py-1 px-1 text-center font-bold text-purple-600 text-sm">{e.points} pt</td>
                        ) : game?.type === 'quota' ? (
                          <td className={`py-1 px-1 text-center font-bold text-sm ${e.points > 0 ? 'text-green-600' : e.points < 0 ? 'text-red-600' : 'text-gray-400'}`}>{e.points > 0 ? '+' : ''}{e.thru > 0 ? e.points : '—'}</td>
                        ) : game?.type === 'banker' ? (
                          <td className={`py-1 px-1 text-center font-bold text-sm ${e.bankerUnits > 0 ? 'text-green-600' : e.bankerUnits < 0 ? 'text-red-600' : 'text-gray-400'}`}>{e.bankerUnits > 0 ? '+' : ''}{e.bankerUnits}</td>
                        ) : (
                          <>
                            <td className="py-1 px-1 text-center font-semibold text-gray-700 text-sm">{e.net || '—'}</td>
                            <td className={`py-1 px-1 text-center font-semibold text-sm ${e.vsPar > 0 ? 'text-red-600' : e.vsPar < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                              {e.thru > 0 ? `${e.vsPar > 0 ? '+' : ''}${e.vsPar === 0 ? 'E' : e.vsPar}` : '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Game summaries */}
                <div className="mt-1.5 space-y-0.5">
                  {skinsResult && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">Skins:</span>{' '}
                      {skinsResult.totalSkins === 0 ? 'No skins won yet' : (
                        <>
                          {players.filter(p => (skinsResult.skinsWon[p.id] ?? 0) > 0).map(p => `${p.name} ${skinsResult.skinsWon[p.id]}`).join(', ')}
                          {skinsResult.pendingCarry > 0 && ` · ${skinsResult.pendingCarry} carry`}
                        </>
                      )}
                    </p>
                  )}
                  {nassauResult && (() => {
                    const getName = (id: string | null) => id ? (players.find(p => p.id === id)?.name ?? '?') : null
                    const firstName = (id: string | null) => (getName(id) ?? '').split(' ')[0] || '?'
                    const segs = [
                      { label: 'F', seg: nassauResult.front, live: nassauLiveStatus?.front },
                      { label: 'B', seg: nassauResult.back, live: nassauLiveStatus?.back },
                      { label: 'T', seg: nassauResult.total, live: nassauLiveStatus?.total },
                    ]
                    return (
                      <p className="text-xs text-gray-500">
                        <span className="font-semibold">Nassau:</span>{' '}
                        {segs.map(({ label, seg, live }) => {
                          // Final result once a leg is complete; otherwise the live lead
                          // over holes played so far ("Test by 2 thru 4") instead of "—".
                          let status: string
                          if (!seg.incomplete) {
                            status = seg.winner ? `${firstName(seg.winner)} wins` : seg.tiedPlayers.length > 1 ? 'All square' : '—'
                          } else if (!live || !live.started) {
                            status = 'not started'
                          } else if (live.leaderId) {
                            status = `${firstName(live.leaderId)} by ${live.margin} thru ${live.holesPlayed}`
                          } else {
                            status = `all square thru ${live.holesPlayed}`
                          }
                          return `${label}: ${status}`
                        }).join(' · ')}
                      </p>
                    )
                  })()}
                  {bestBallResult && game && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">Best Ball:</span>{' '}
                      {(game.config as BestBallConfig).scoring === 'total'
                        ? `Team A ${bestBallResult.totalScore.A} – Team B ${bestBallResult.totalScore.B} strokes`
                        : `Team A ${bestBallResult.holesWon.A} – Team B ${bestBallResult.holesWon.B}`}
                    </p>
                  )}
                  {wolfResult && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">Wolf:</span>{' '}
                      {players.slice().sort((a, b) => (wolfResult.netUnits[b.id] ?? 0) - (wolfResult.netUnits[a.id] ?? 0))
                        .map(p => { const u = wolfResult.netUnits[p.id] ?? 0; return `${p.name} ${u > 0 ? '+' : ''}${u}` }).join(', ')}
                    </p>
                  )}
                  {hammerResult && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">Hammer:</span>{' '}
                      {players.map(p => { const c = hammerResult.netCents[p.id] ?? 0; return `${p.name} ${c >= 0 ? '+' : '−'}${fmtAmount(Math.abs(c), game?.stakesMode)}` }).join(', ')}
                    </p>
                  )}
                  {bbbResult && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">BBB:</span>{' '}
                      {players.slice().sort((a, b) => (bbbResult.pointsWon[b.id] ?? 0) - (bbbResult.pointsWon[a.id] ?? 0))
                        .map(p => `${p.name} ${bbbResult.pointsWon[p.id] ?? 0}`).join(', ')}
                    </p>
                  )}
                  {stablefordResult && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">Stableford:</span>{' '}
                      {players.slice().sort((a, b) => (stablefordResult.points[b.id] ?? 0) - (stablefordResult.points[a.id] ?? 0))
                        .map(p => `${p.name} ${stablefordResult.points[p.id] ?? 0}pt`).join(', ')}
                    </p>
                  )}
                  {quotaResult && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">Quota:</span>{' '}
                      {players.slice().sort((a, b) => (quotaResult.netPoints[b.id] ?? 0) - (quotaResult.netPoints[a.id] ?? 0))
                        .map(p => { const n = quotaResult.netPoints[p.id] ?? 0; return `${p.name} ${n > 0 ? '+' : ''}${n}` }).join(', ')}
                    </p>
                  )}
                  {bankerResult && game && (() => {
                    const order = (game.config as BankerConfig).bankerOrder
                    const bankerId = order.length ? order[(currentHole - 1) % order.length] : null
                    const bankerName = bankerId ? players.find(p => p.id === bankerId)?.name : null
                    return (
                      <p className="text-xs text-gray-500">
                        <span className="font-semibold">Banker:</span>{' '}
                        {bankerName ? `${bankerName} banks hole ${currentHole} · ` : ''}
                        {players.slice().sort((a, b) => (bankerResult.netCents[b.id] ?? 0) - (bankerResult.netCents[a.id] ?? 0))
                          .map(p => { const u = bankerResult.netCents[p.id] ?? 0; return `${p.name} ${u > 0 ? '+' : ''}${u}` }).join(', ')}
                      </p>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Group tabs */}
      {scoreTab === 'scores' && round.groups && (() => {
        const groupNums = [...new Set(Object.values(round.groups))].sort((a, b) => a - b)
        if (groupNums.length <= 1) return null
        return (
          <div className="bg-white border-b border-gray-200 px-4 py-2 sticky top-[calc(5.5rem+2rem)] z-[5]">
            <div className="max-w-2xl mx-auto flex gap-1 overflow-x-auto">
              {groupNums.map(gn => (
                <button
                  key={gn}
                  onClick={() => setActiveGroupTab(gn)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
                    activeGroupTab === gn ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Group {gn}
                </button>
              ))}
              <button
                onClick={() => setActiveGroupTab('all')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
                  activeGroupTab === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                All
              </button>
            </div>
          </div>
        )
      })()}

      {/* Leaderboard tab */}
      {scoreTab === 'leaderboard' && snapshot && (
        <LeaderboardTab
          snapshot={playableSnapshot!}
          players={players}
          holeScores={holeScores}
          courseHcps={courseHcps}
          game={game ?? null}
          round={round ?? null}
          skinsResult={skinsResult}
          bestBallResult={bestBallResult}
          nassauResult={nassauResult}
          wolfResult={wolfResult}
          bbbResult={bbbResult}
          hammerResult={hammerResult}
          vegasResult={vegasResult}
          stablefordResult={stablefordResult}
          bankerResult={bankerResult}
          quotaResult={quotaResult}
          skinsResultAlt={skinsResultAlt}
          bestBallResultAlt={bestBallResultAlt}
          nassauResultAlt={nassauResultAlt}
          wolfResultAlt={wolfResultAlt}
          vegasResultAlt={vegasResultAlt}
          stablefordResultAlt={stablefordResultAlt}
          bankerResultAlt={bankerResultAlt}
          quotaResultAlt={quotaResultAlt}
          primaryMode={(game?.config as any)?.mode ?? 'net'}
          shareRef={shareRef}
          sharing={sharing}
          shareImage={shareImage}
        />
      )}

      {scoreTab === 'scores' && (
      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        {/* BBB unknown-player warning — stale player ids referenced by bbb_points
            rows that aren't in the current player list (player removed mid-round). */}
        {bbbResult && bbbResult.unknownPlayerIds.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-amber-800 text-sm font-semibold">⚠ BBB has stale player references</p>
            <p className="text-amber-700 text-xs mt-0.5">
              {bbbResult.unknownPlayerIds.length} BBB point{bbbResult.unknownPlayerIds.length > 1 ? 's' : ''} reference{bbbResult.unknownPlayerIds.length > 1 ? '' : 's'} a player no longer in this round. Re-assign on the affected hole or those points will be ignored.
            </p>
          </div>
        )}
        {/* Single priority status line — highest priority: save error > offline > syncing > context */}
        {(() => {
          if (saveError) return (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-red-700 text-sm font-semibold flex-1 truncate">{saveError}</p>
              {lastFailedSave && (
                <button onClick={() => { setSaveError(null); setLastFailedSave(null); setScore(lastFailedSave.playerId, lastFailedSave.grossScore) }}
                  className="text-red-600 text-xs font-bold bg-red-100 px-2 py-1 rounded-lg active:bg-red-200 whitespace-nowrap">Retry</button>
              )}
              <button onClick={() => { setSaveError(null); setLastFailedSave(null) }} className="text-red-400 font-bold ml-1">&times;</button>
            </div>
          )
          if (!isOnline) return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-yellow-600 text-sm">📡</span>
              <p className="text-yellow-800 text-sm font-semibold flex-1">Offline{pendingCount > 0 ? ` · ${pendingCount} queued` : ''}</p>
            </div>
          )
          if (syncing) return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-blue-500 animate-spin text-sm">↻</span>
              <p className="text-blue-700 text-sm font-semibold">Syncing...</p>
            </div>
          )
          if (isEventRound && showContextBanner) {
            if (isScoreMaster) return (
              <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <p className="text-purple-800 text-sm font-semibold">Score Master · All Groups</p>
                <button onClick={() => setShowContextBanner(false)} className="text-purple-400 font-bold ml-2">&times;</button>
              </div>
            )
            if (isGroupScorekeeper) return (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <p className="text-blue-800 text-sm font-semibold">Scorekeeper · Group {myEventGroupNumber}</p>
                <button onClick={() => setShowContextBanner(false)} className="text-blue-400 font-bold ml-2">&times;</button>
              </div>
            )
            if (groupHasActiveScorekeeper) return (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <p className="text-gray-600 text-sm font-semibold">Your scorekeeper is entering scores for your group</p>
                <button onClick={() => setShowContextBanner(false)} className="text-gray-400 font-bold ml-2">&times;</button>
              </div>
            )
            if (myEventParticipant && !canApproveScores) return (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <p className="text-yellow-800 text-sm font-semibold">You're in self-entry mode — scores need scorekeeper approval before counting</p>
                <button onClick={() => { setShowContextBanner(false); try { localStorage.setItem('scorecard-selfentry-dismissed', 'true') } catch {} }} className="text-yellow-400 font-bold ml-2">&times;</button>
              </div>
            )
          }
          return null
        })()}

        {/* === Game ribbon (was Game tab) === */}
        {!showBatchEntry && (
          <>
            {/* Game Status accordion toggle */}
            {(skinsResult || bestBallResult || nassauResult || (wolfConfig && wolfId) || (game?.type === 'hammer' && hammerConfig) || (game?.type === 'bingo_bango_bongo') || (junkConfig && junkConfig.types.length > 0)) && (
              <button
                onClick={() => setShowGameStatus(!showGameStatus)}
                className="w-full flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Game · Hole {currentHole}</span>
                <span className="text-gray-400 text-sm">{showGameStatus ? '▾' : '▸'}</span>
              </button>
            )}

            {showGameStatus && skinsResult && game && (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SkinsStatus carry={currentCarry} potCents={game.buyInCents * players.length * (1 + ((game.config as any).presses?.length ?? 0))} stakesMode={game.stakesMode} />
                </div>
                {SHOW_PRESSES && !readOnly && (
                  <button
                    onClick={handlePress}
                    className="px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl active:bg-orange-600 flex-shrink-0"
                  >
                    Press{(game.config as any).presses?.length ? ` (${(game.config as any).presses.length})` : ''}
                  </button>
                )}
                {!readOnly && myPressCount > 0 && (
                  <button
                    onClick={handleUndoPress}
                    aria-label="Undo last press"
                    title="Undo last press"
                    className="px-2.5 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl active:bg-gray-300 dark:active:bg-gray-600 flex-shrink-0"
                  >
                    ↩
                  </button>
                )}
              </div>
            )}
            {showGameStatus && bestBallResult && game && <BestBallStatus result={bestBallResult} scoring={(game.config as BestBallConfig).scoring} />}

            {/* Nassau status */}
            {showGameStatus && nassauResult && game && (() => {
              const getName = (id: string | null) => id ? (players.find(p => p.id === id)?.name ?? '?') : null
              const firstName = (id: string | null) => (getName(id) ?? '').split(' ')[0] || '?'
              const pressCount = (game.config as any).presses?.length ?? 0
              const totalHoles = snapshot?.holes.length ?? 18
              const half = Math.ceil(totalHoles / 2)
              const segs = [
                { label: `F${half}`, seg: nassauResult.front, live: nassauLiveStatus?.front },
                { label: `B${totalHoles - half}`, seg: nassauResult.back, live: nassauLiveStatus?.back },
                { label: `${totalHoles}`, seg: nassauResult.total, live: nassauLiveStatus?.total },
              ]
              return (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 flex items-center gap-2">
                    <span className="font-bold text-teal-700 text-sm mr-1">Nassau</span>
                    {segs.map(({ label, seg, live }) => {
                      // Once a leg is done show the winner; while it's live show who's
                      // ahead so far ("A-Aron +2") instead of a blank dash.
                      let leaderName: string
                      if (!seg.incomplete) {
                        leaderName = seg.winner ? firstName(seg.winner) : seg.tiedPlayers.length > 1 ? 'Tied' : '—'
                      } else if (live?.started) {
                        leaderName = live.leaderId ? `${firstName(live.leaderId)} +${live.margin}` : `AS·${live.holesPlayed}`
                      } else {
                        leaderName = '—'
                      }
                      return (
                        <div key={label} className="text-center px-2 border-l border-teal-200">
                          <p className="text-xs text-teal-500">{label}</p>
                          <p className="text-xs font-semibold text-teal-800 truncate max-w-[72px]">{leaderName}</p>
                        </div>
                      )
                    })}
                  </div>
                  {SHOW_PRESSES && !readOnly && (
                    <button
                      onClick={handlePress}
                      className="px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl active:bg-orange-600 flex-shrink-0"
                    >
                      Press{pressCount ? ` (${pressCount})` : ''}
                    </button>
                  )}
                  {!readOnly && myPressCount > 0 && (
                    <button
                      onClick={handleUndoPress}
                      aria-label="Undo last press"
                      title="Undo last press"
                      className="px-2.5 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl active:bg-gray-300 dark:active:bg-gray-600 flex-shrink-0"
                    >
                      ↩
                    </button>
                  )}
                </div>
              )
            })()}

            {/* Wolf panel */}
            {showGameStatus && !readOnly && wolfConfig && wolfId && (() => {
              const wolfPlayer = players.find(p => p.id === wolfId)
              const nonWolfs = players.filter(p => p.id !== wolfId)
              return (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                  <p className="font-bold text-purple-800 text-sm">🐺 Wolf: {wolfPlayer?.name}</p>
                  <p className="text-xs text-purple-600">Pick a partner after tee shots, or go Lone Wolf:</p>
                  <div className="flex flex-wrap gap-2">
                    {nonWolfs.map(p => (
                      <button
                        key={p.id}
                        onClick={() => updateWolfDecision(currentHole, p.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                          wolfDecision?.partnerId === p.id
                            ? 'bg-purple-600 text-white'
                            : 'bg-white border border-purple-200 text-purple-700'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                    <button
                      onClick={() => updateWolfDecision(currentHole, null)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                        wolfDecision !== undefined && wolfDecision.partnerId === null
                          ? 'bg-red-500 text-white'
                          : 'bg-white border border-red-200 text-red-600'
                      }`}
                    >
                      Lone Wolf 🐺
                    </button>
                  </div>
                  {wolfDecision && (
                    <p className="text-xs text-purple-500">
                      {wolfDecision.partnerId === null
                        ? `${wolfPlayer?.name} going LONE WOLF`
                        : `${wolfPlayer?.name} + ${players.find(p => p.id === wolfDecision.partnerId)?.name}`}
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Hammer panel */}
            {showGameStatus && game?.type === 'hammer' && hammerConfig && players.length === 2 && (() => {
              const baseValue = hammerConfig.baseValueCents
              const hState = currentHammerState
              const holeValue = hState ? hState.value : baseValue
              const holderName = hState ? (players.find(p => p.id === hState.hammerHolder)?.name ?? '?') : players[0].name
              const receiverName = hState
                ? (players.find(p => p.id !== hState.hammerHolder)?.name ?? '?')
                : players[1].name
              const canThrow = !readOnly && (!hState || (!hState.declined && (hammerConfig.maxPresses == null || hState.presses < hammerConfig.maxPresses)))
              const canDecline = !readOnly && hState && !hState.declined && hState.presses > 0

              return (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-orange-800 text-sm">🔨 Hammer</p>
                    <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                      Hole value: {fmtAmount(holeValue, game?.stakesMode)}
                    </span>
                  </div>

                  {hState?.declined ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                      <p className="text-sm text-red-700 font-semibold">
                        {players.find(p => p.id === hState.declinedBy)?.name} declined — {holderName} wins {fmtAmount(hState.value / 2, game?.stakesMode)}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(() => {
                        const holeScored = players.every(p => holeScores.some(s => s.playerId === p.id && s.holeNumber === currentHole))
                        const holdVerb = holderName === 'You' ? 'hold' : 'holds'
                        const respondVerb = receiverName === 'You' ? 'respond' : 'responds'
                        return (
                          <p className="text-xs text-orange-600">
                            {!hState
                              ? `${holderName} ${holdVerb} the hammer — throw it to double the stakes`
                              : holeScored
                                ? `Hammer settled at ${fmtAmount(holeValue, game?.stakesMode)} for the hole`
                                : `${holderName} threw the hammer (×${hState.presses}) — ${receiverName} ${respondVerb}: play on to accept, or Decline`}
                          </p>
                        )
                      })()}
                      {!readOnly && (
                        <div className="flex gap-2">
                          <button
                            onClick={throwHammer}
                            disabled={!canThrow}
                            className="flex-1 py-2 rounded-lg text-sm font-bold bg-orange-500 text-white active:bg-orange-600 disabled:opacity-40"
                          >
                            🔨 Throw Hammer
                          </button>
                          {canDecline && (
                            <button
                              onClick={declineHammer}
                              className="flex-1 py-2 rounded-lg text-sm font-bold bg-red-100 text-red-700 border border-red-200 active:bg-red-200"
                            >
                              Decline
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Running totals */}
                  <div className="flex gap-2 pt-1 border-t border-orange-200">
                    {players.map(p => {
                      const net = hammerResult?.netCents[p.id] ?? 0
                      return (
                        <div key={p.id} className={`flex-1 text-center rounded-lg py-1 ${net > 0 ? 'bg-green-50' : net < 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                          <p className="text-xs text-gray-500">{p.name}</p>
                          <p className={`text-sm font-bold ${net > 0 ? 'text-green-700' : net < 0 ? 'text-red-700' : 'text-gray-600'}`}>
                            {net >= 0 ? '+' : ''}{fmtAmount(Math.abs(net), game?.stakesMode)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* BBB panel */}
            {showGameStatus && !readOnly && game?.type === 'bingo_bango_bongo' && (() => {
              const BBBRow = ({
                category,
                icon,
                label,
              }: {
                category: 'bingo' | 'bango' | 'bongo'
                icon: string
                label: string
              }) => (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-amber-700">{icon} {label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setBBBPoint(category, p.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          currentBBB?.[category] === p.id
                            ? 'bg-amber-500 text-white'
                            : 'bg-white border border-amber-200 text-amber-700'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                  <p className="font-bold text-amber-800 text-sm">⭐ Bingo Bango Bongo — Hole {currentHole}</p>
                  <BBBRow category="bingo" icon="🟢" label="Bingo — First on green" />
                  <BBBRow category="bango" icon="📍" label="Bango — Closest to pin" />
                  <BBBRow category="bongo" icon="🏆" label="Bongo — First to hole out" />
                </div>
              )
            })()}

            {/* Hole Bets panel (junks + side bets) */}
            {SHOW_HOLE_BETS && showGameStatus && !readOnly && (
              <HoleBetsPanel
                currentHole={currentHole}
                players={players}
                junkConfig={junkConfig ?? null}
                junkRecords={junkRecords}
                sideBets={sideBets}
                showSideBetForm={showSideBetForm}
                setShowSideBetForm={setShowSideBetForm}
                sideBetDesc={sideBetDesc}
                setSideBetDesc={setSideBetDesc}
                sideBetAmount={sideBetAmount}
                setSideBetAmount={setSideBetAmount}
                sideBetParticipants={sideBetParticipants}
                setSideBetParticipants={setSideBetParticipants}
                toggleJunk={toggleJunk}
                createSideBet={createSideBet}
                resolveSideBet={resolveSideBet}
                cancelSideBet={cancelSideBet}
              />
            )}

            {/* Dots award panel — always on for a Dots round (own entry surface,
                independent of the SHOW_HOLE_BETS junk panel above). */}
            {game?.type === 'dots' && (
              <DotsPanel
                currentHole={currentHole}
                holePar={snapshot?.holes.find(h => h.number === currentHole)?.par}
                players={players}
                config={game.config as DotsConfig}
                junkRecords={junkRecords}
                toggleDot={toggleDot}
                netCents={dotsResult?.netCents}
                stakesMode={game.stakesMode}
                readOnly={readOnly}
              />
            )}

            {/* Props panel */}
            {SHOW_PROP_BETS && showGameStatus && !readOnly && (
              <PropBetsPanel
                currentHole={currentHole}
                players={players}
                propBets={propBets}
                propWagers={propWagers}
                currentPlayerId={myPlayerId}
                onCreateProp={createPropBet}
                onAcceptProp={acceptPropBet}
                onResolveProp={resolvePropBet}
                onCancelProp={cancelPropBet}
              />
            )}

            {/* Event Approval Panel */}
            {isEventRound && canApproveScores && pendingScores.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-2">
                <button
                  onClick={() => setShowApprovalPanel(!showApprovalPanel)}
                  className="w-full flex items-center justify-between"
                >
                  <p className="font-bold text-yellow-800 text-sm">
                    ⏳ {pendingScores.length} Pending Score{pendingScores.length !== 1 ? 's' : ''}
                  </p>
                  <span className="text-yellow-600 text-xs font-semibold">
                    {showApprovalPanel ? 'Hide' : 'Review'}
                  </span>
                </button>
                {showApprovalPanel && (
                  <div className="space-y-2 mt-2">
                    {pendingScores.map(score => {
                      const player = players.find(p => p.id === score.playerId)
                      const hole = snapshot?.holes.find(h => h.number === score.holeNumber)
                      return (
                        <div key={score.id} className="flex items-center justify-between bg-white rounded-lg p-2.5">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{player?.name ?? 'Unknown'}</p>
                            <p className="text-xs text-gray-500">
                              Hole {score.holeNumber} · Par {hole?.par ?? '?'} · Shot {score.grossScore}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={async () => {
                                setHoleScores(prev => prev.map(s => s.id === score.id ? { ...s, scoreStatus: 'approved' as ScoreStatus } : s))
                                await supabase.rpc('approve_score', { p_score_id: score.id })
                              }}
                              className="px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg active:bg-green-600"
                            >
                              Approve
                            </button>
                            <button
                              onClick={async () => {
                                setHoleScores(prev => prev.map(s => s.id === score.id ? { ...s, scoreStatus: 'rejected' as ScoreStatus } : s))
                                await supabase.rpc('reject_score', { p_score_id: score.id })
                              }}
                              className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg active:bg-red-600"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {/* === end game ribbon === */}

        {/* Batch Entry Toggle */}
        {!readOnly && isScoremasterRole && players.length > 1 && (
          <button
            onClick={() => setShowBatchEntry(!showBatchEntry)}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              showBatchEntry ? 'bg-blue-600 text-white' : 'bg-blue-50 border border-blue-200 text-blue-700'
            }`}
          >
            {showBatchEntry ? '← Standard Entry' : '⊞ Batch Entry'}
          </button>
        )}

        {/* Batch Entry Grid */}
        {showBatchEntry && !readOnly && snapshot && (() => {
          const half = Math.ceil(playableHoleNums.length / 2)
          const idx = playableHoleNums.indexOf(currentHole)
          const isBack = idx >= half
          const holeRange = isBack ? playableHoleNums.slice(half) : playableHoleNums.slice(0, half)
          const rangeStart = holeRange[0]
          const rangeEnd = holeRange[holeRange.length - 1]

          const getBatchValue = (playerId: string, holeNum: number): string => {
            const override = batchScores[playerId]?.[holeNum]
            if (override !== undefined) return override
            const existing = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNum)
            return existing ? String(existing.grossScore) : ''
          }

          const saveBatch = async () => {
            for (const playerId of Object.keys(batchScores)) {
              for (const [holeStr, valStr] of Object.entries(batchScores[playerId])) {
                const holeNum = Number(holeStr)
                const val = parseInt(valStr)
                if (isNaN(val) || val < 1 || val > 15) continue
                const existing = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNum)
                if (existing && existing.grossScore === val) continue
                if (existing) {
                  setHoleScores(prev => prev.map(s => s.id === existing.id ? { ...s, grossScore: val } : s))
                  safeWrite(supabase.from('hole_scores').update({ gross_score: val }).eq('id', existing.id), 'update batch score')
                } else {
                  const newScore: HoleScore = { id: uuidv4(), roundId, playerId, holeNumber: holeNum, grossScore: val }
                  setHoleScores(prev => [...prev, newScore])
                  safeWrite(supabase.from('hole_scores').insert(holeScoreToRow(newScore, userId)), 'insert batch score')
                }
              }
            }
            setBatchScores({})
            setShowBatchEntry(false)
            setScoreToast({ message: 'All scores saved', type: 'success' })
            setTimeout(() => setScoreToast(null), 2000)
          }

          return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase">
                {isBack ? 'Back 9' : 'Front 9'} — Holes {rangeStart}–{rangeEnd}
              </p>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400">
                      <th className="text-left py-1 px-1.5 font-medium sticky left-0 bg-white dark:bg-gray-800">Hole</th>
                      <th className="text-center py-1 px-1 font-medium text-gray-300">Par</th>
                      {players.map(p => (
                        <th key={p.id} className="text-center py-1 px-1 font-medium max-w-[60px] truncate">{p.name.split(' ')[0]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holeRange.map(holeNum => {
                      const hole = snapshot.holes.find(h => h.number === holeNum)
                      return (
                        <tr key={holeNum} className="border-t border-gray-50">
                          <td className="py-1 px-1.5 font-bold text-gray-600 sticky left-0 bg-white dark:bg-gray-800">{holeNum}</td>
                          <td className="py-1 px-1 text-center text-gray-400">{hole?.par ?? 4}</td>
                          {players.map(p => (
                            <td key={p.id} className="py-1 px-0.5 text-center">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={15}
                                value={getBatchValue(p.id, holeNum)}
                                onChange={e => {
                                  setBatchScores(prev => ({
                                    ...prev,
                                    [p.id]: { ...prev[p.id], [holeNum]: e.target.value },
                                  }))
                                }}
                                className="w-12 h-10 text-center text-sm font-semibold rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <button
                onClick={saveBatch}
                className="w-full h-12 bg-blue-600 text-white font-bold rounded-xl active:bg-blue-700 text-sm"
              >
                Save All Scores
              </button>
            </div>
          )
        })()}

        {/* BBB doesn't need strokes — offer golf-score entry as an optional, collapsed section. */}
        {!showBatchEntry && game?.type === 'bingo_bango_bongo' && (
          <button
            onClick={() => setShowScoreEntry(v => !v)}
            className="w-full text-sm font-semibold text-gray-500 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 active:bg-gray-100 transition-colors"
          >
            {showScoreEntry ? 'Hide golf scores' : '⛳ Enter golf scores (optional) ▸'}
          </button>
        )}

        {/* Score cards */}
        {!showBatchEntry && (game?.type !== 'bingo_bango_bongo' || showScoreEntry) && players.map(player => {
          const grossScore = getScore(player.id)
          const courseHcp = courseHcps[player.id] ?? 0
          const strokesGiven = strokesOnHole(courseHcp, strokeIndex)
          const netScore = grossScore - strokesGiven
          let scoreBadge = ''
          if (grossScore < par - 1) scoreBadge = '🦅 Eagle'
          else if (grossScore === par - 1) scoreBadge = '🐦 Birdie'
          else if (grossScore === par) scoreBadge = '— Par'
          else if (grossScore === par + 1) scoreBadge = 'Bogey'
          else if (grossScore === par + 2) scoreBadge = 'Double'
          else if (grossScore > par + 2) scoreBadge = `+${grossScore - par}`

          // Running total through current hole
          const scoredHoles = holeScores.filter(s => s.playerId === player.id)
          const runningGross = scoredHoles.reduce((sum, s) => sum + s.grossScore, 0)
          const runningPar = scoredHoles.reduce((sum, s) => {
            const h = snapshot?.holes.find(h => h.number === s.holeNumber)
            return sum + (h?.par ?? 0)
          }, 0)
          const runningVsPar = runningGross - runningPar
          const holesPlayed = scoredHoles.length

          // Determine if this player's card should be editable or compact read-only
          const playerGroup = round.groups?.[player.id]
          const hasGroups = round.groups && Object.keys(round.groups).length > 0
          const groupNums = hasGroups ? [...new Set(Object.values(round.groups!))].sort((a, b) => a - b) : []
          const isInActiveGroup = !hasGroups || groupNums.length <= 1 || activeGroupTab === 'all' || activeGroupTab === playerGroup
          const isMyPlayer = selfEntryOnly && myParticipant?.playerId === player.id
          const isMyEventPlayer = isEventRound && myEventParticipant?.playerId === player.id

          // Event editability: Score Master > Group Scorekeeper > self-entry fallback
          let isEditable: boolean
          if (isEventRound) {
            const playerInMyGroup = playerGroup != null && playerGroup === myEventGroupNumber
            if (isScoreMaster) {
              // Score Master can edit any player in any active group tab (not 'all')
              isEditable = isInActiveGroup && activeGroupTab !== 'all'
            } else if (isGroupScorekeeper && playerInMyGroup) {
              // Group Scorekeeper can edit any player in their group
              isEditable = true
            } else if (groupHasActiveScorekeeper) {
              // Player with active scorekeeper is read-only
              isEditable = false
            } else {
              // No active scorekeeper — fall back to self-entry
              isEditable = isMyEventPlayer
            }
          } else {
            isEditable = isMyPlayer || (!readOnly && !selfEntryOnly && isInActiveGroup && activeGroupTab !== 'all')
          }

          // Score status for event rounds
          const currentScore = holeScores.find(s => s.playerId === player.id && s.holeNumber === currentHole)
          const scoreStatus = isEventRound ? (currentScore?.scoreStatus ?? undefined) : undefined
          const isPending = scoreStatus === 'pending'
          const isRejected = scoreStatus === 'rejected'

          // Filter out players not in the active group tab (unless showing 'all')
          if (hasGroups && groupNums.length > 1 && activeGroupTab !== 'all' && playerGroup !== activeGroupTab) {
            return null
          }

          // Compact read-only row for "all" tab or readOnly mode with groups
          if (!isEditable) {
            return (
              <div key={player.id} className={`bg-white rounded-xl shadow-sm border px-4 py-2.5 flex items-center justify-between ${isPending ? 'border-yellow-300 bg-yellow-50/50' : isRejected ? 'border-red-300 bg-red-50/50' : 'border-gray-100'}`}>
                <div className="flex items-center gap-2">
                  <p className={`font-semibold text-sm ${isRejected ? 'text-gray-400 line-through' : isPending ? 'text-gray-600' : 'text-gray-800'}`}>{player.name}</p>
                  {hasGroups && groupNums.length > 1 && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">G{playerGroup}</span>
                  )}
                  {isPending && (
                      <span className="relative inline-flex">
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingPopover(prev => !prev) }}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-700 active:bg-yellow-300"
                        >
                          PENDING
                        </button>
                        {pendingPopover && (
                          <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 bg-gray-800 text-white text-xs rounded-xl px-3 py-2 shadow-lg">
                            <p className="font-bold mb-0.5">Pending Score</p>
                            <p className="text-gray-300 leading-relaxed">Your score is awaiting approval from your group's scorekeeper</p>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-gray-800" />
                          </div>
                        )}
                      </span>
                    )}
                  {isRejected && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-200 text-red-700">REJECTED</span>}
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className={`text-base font-bold px-2 py-1 rounded ${isPending ? 'opacity-50' : ''} ${isRejected ? 'line-through opacity-40' : ''} ${getScoreClass(grossScore, par)}`}>{grossScore}</span>
                  {strokesGiven > 0 && <span className="text-xs text-amber-600 font-semibold">Net {netScore}</span>}
                  {holesPlayed > 0 && (
                    <span className={`text-xs font-semibold ${runningVsPar > 0 ? 'text-red-500' : runningVsPar < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {runningGross} ({runningVsPar > 0 ? '+' : ''}{runningVsPar})
                    </span>
                  )}
                </div>
              </div>
            )
          }

          // Score validation warnings
          const warnings: string[] = []
          if (grossScore === 1 && par >= 4) warnings.push('Hole in one! Verify score')
          if (grossScore >= par + 5) warnings.push(`That's +${grossScore - par} over par — verify score`)

          return (
            <div key={player.id} className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border p-4 ${isPending ? 'border-yellow-300' : isRejected ? 'border-red-300' : 'border-gray-100 dark:border-gray-700'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800 text-lg">{player.name}</p>
                    {isPending && (
                      <span className="relative inline-flex">
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendingPopover(prev => !prev) }}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-700 active:bg-yellow-300"
                        >
                          PENDING
                        </button>
                        {pendingPopover && (
                          <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 bg-gray-800 text-white text-xs rounded-xl px-3 py-2 shadow-lg">
                            <p className="font-bold mb-0.5">Pending Score</p>
                            <p className="text-gray-300 leading-relaxed">Your score is awaiting approval from your group's scorekeeper</p>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-gray-800" />
                          </div>
                        )}
                      </span>
                    )}
                    {isRejected && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-200 text-red-700">REJECTED</span>}
                  </div>
                  {editingHcpPlayerId === player.id ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0"
                        max="54"
                        value={editingHcpValue}
                        onChange={e => setEditingHcpValue(e.target.value)}
                        className="w-16 h-8 px-2 rounded-lg border border-amber-300 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveHandicapEdit(); if (e.key === 'Escape') setEditingHcpPlayerId(null) }}
                      />
                      <button onClick={saveHandicapEdit} className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-lg">Save</button>
                      <button onClick={() => setEditingHcpPlayerId(null)} className="text-xs text-gray-500">Cancel</button>
                    </div>
                  ) : (
                    <p className={`text-sm text-gray-500 ${!readOnly ? 'cursor-pointer active:text-amber-600' : ''}`}
                      onClick={() => {
                        if (readOnly) return
                        setEditingHcpPlayerId(player.id)
                        setEditingHcpValue(String(player.handicapIndex))
                      }}
                    >
                      HCP {player.handicapIndex}
                      {strokesGiven > 0 && <span className="ml-2 text-amber-600 font-semibold">+{strokesGiven} stroke{strokesGiven !== 1 ? 's' : ''}</span>}
                      {!readOnly && <span className="ml-1 text-gray-300 text-xs">✎</span>}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${getScoreClass(grossScore, par)}`}>{scoreBadge}</span>
                  {strokesGiven > 0 && <p className="text-sm font-semibold text-amber-600 mt-0.5">Net {netScore}</p>}
                  {holesPlayed > 0 && (
                    <p className={`text-xs font-semibold mt-0.5 ${runningVsPar > 0 ? 'text-red-500' : runningVsPar < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      Thru {holesPlayed}: {runningGross} ({runningVsPar > 0 ? '+' : ''}{runningVsPar})
                    </p>
                  )}
                </div>
              </div>
              <InlineScorePad
                value={grossScore}
                par={par}
                hasScore={!!currentScore}
                readOnly={!isEditable}
                onChange={v => setScore(player.id, v)}
                onMore={() => setNumberPadTarget({ playerId: player.id, playerName: player.name })}
              />
              {warnings.map((w, i) => (
                <p key={i} className="text-amber-600 text-xs font-medium mt-2 bg-amber-50 rounded-lg px-3 py-1.5">{w}</p>
              ))}
            </div>
          )
        })}

        {/* Hole result callout for Skins */}
        {!showBatchEntry && skinsResult && skinsResult.holeResults.length >= currentHole && (() => {
          const hr = skinsResult.holeResults[currentHole - 1]
          if (!hr || hr.winnerId === null) return null
          const winner = players.find(p => p.id === hr.winnerId)
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
              <p className="text-gray-800 font-bold">🏆 {winner?.name} wins {hr.skinsInPlay} skin{hr.skinsInPlay !== 1 ? 's' : ''}</p>
            </div>
          )
        })()}

        {/* Next Hole / End Round — in scrollable content. BBB settles from points,
            so a missing-strokes nag would be noise there. */}
        {!showBatchEntry && !readOnly && !showHoleConfirm && game?.type !== 'bingo_bango_bongo' && (() => {
          const missingPlayers = players.filter(p => !holeScores.some(s => s.playerId === p.id && s.holeNumber === currentHole))
          return missingPlayers.length > 0 ? (
            <p className="text-amber-600 text-xs font-medium text-center py-1.5 bg-amber-50 rounded-xl">
              Not all players have scores for this hole
            </p>
          ) : null
        })()}

        {/* Hole Confirm Panel */}
        {!showBatchEntry && showHoleConfirm && (() => {
          const unscoredPlayers = players.filter(p => !holeScores.some(s => s.playerId === p.id && s.holeNumber === currentHole))
          const needsParWarning = unscoredPlayers.length > 0 && !confirmParFill
          return (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
              <p className="font-bold text-blue-800 text-sm">Confirm Hole {currentHole} Scores</p>

              {/* Par fill warning */}
              {needsParWarning && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 space-y-2">
                  <p className="text-amber-800 text-sm font-semibold">
                    {unscoredPlayers.length === 1
                      ? `${unscoredPlayers[0].name} has no score`
                      : `${unscoredPlayers.map(p => p.name).join(', ')} have no scores`}
                  </p>
                  <p className="text-amber-700 text-xs">
                    {unscoredPlayers.length === 1 ? 'Score' : 'Scores'} will be recorded as par ({par})
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmParFill(true)}
                      className="flex-1 h-10 bg-amber-500 text-white font-bold rounded-xl active:bg-amber-600 text-sm"
                    >
                      Record as Par & Next
                    </button>
                    <button
                      onClick={() => { setShowHoleConfirm(false); setConfirmParFill(false) }}
                      className="flex-1 h-10 bg-gray-100 text-gray-700 font-bold rounded-xl active:bg-gray-200 text-sm"
                    >
                      Edit Scores
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                {players.map(p => {
                  const hs = holeScores.find(s => s.playerId === p.id && s.holeNumber === currentHole)
                  const score = hs?.grossScore ?? par
                  const isAssumed = !hs
                  return (
                    <div key={p.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${isAssumed ? 'bg-amber-50 border border-amber-200' : 'bg-white'}`}>
                      <span className="text-sm font-medium text-gray-800">{p.name}</span>
                      <span className={`text-sm font-bold ${isAssumed ? 'text-amber-600' : 'text-gray-800'}`}>
                        {score} {isAssumed && <span className="text-xs font-normal">(par assumed)</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
              {!needsParWarning && (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      // Auto-save par for unscored players
                      if (unscoredPlayers.length > 0) {
                        await Promise.all(unscoredPlayers.map(p => setScore(p.id, par)))
                      }
                      setShowHoleConfirm(false)
                      setConfirmParFill(false)
                      const nextIdx = playableHoleNums.indexOf(currentHole) + 1
                      goToHole(playableHoleNums[nextIdx] ?? currentHole)
                    }}
                    className="flex-1 h-12 bg-blue-600 text-white font-bold rounded-xl active:bg-blue-700 text-sm"
                  >
                    Confirm & Next →
                  </button>
                  <button
                    onClick={() => { setShowHoleConfirm(false); setConfirmParFill(false) }}
                    className="flex-1 h-12 bg-gray-100 text-gray-700 font-bold rounded-xl active:bg-gray-200 text-sm"
                  >
                    Edit Scores
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {!showBatchEntry && !showHoleConfirm && (playableHoleNums.indexOf(currentHole) < playableHoleNums.length - 1 ? (
          <button onClick={() => {
            // Small groups (1-2 players) in non-event rounds: skip confirm
            const isSmallCasual = players.length <= 2 && !isEventRound
            const nextIdx = playableHoleNums.indexOf(currentHole) + 1
            if (!readOnly && !selfEntryOnly && isScoremasterRole && !isSmallCasual) {
              setShowHoleConfirm(true)
            } else {
              goToHole(playableHoleNums[nextIdx])
            }
          }}
            className="w-full h-14 bg-gray-800 text-white text-lg font-bold rounded-2xl active:bg-gray-900 transition-colors shadow-lg">Next Hole →</button>
        ) : readOnly ? (
          <button onClick={onHome}
            className="w-full h-14 bg-gray-600 text-white text-lg font-bold rounded-2xl active:bg-gray-700 transition-colors shadow-lg">Back to Home</button>
        ) : (
          <button onClick={confirmEndRound}
            className="w-full h-14 bg-yellow-500 text-white text-lg font-bold rounded-2xl active:bg-yellow-600 transition-colors shadow-lg">🏁 End Round & Settle Up</button>
        ))}
      </div>
      )} {/* end scoreTab === 'scores' */}

      {/* Invite toast */}
      {inviteToast && (
        <div className="fixed top-20 inset-x-0 z-50 flex justify-center pointer-events-none">
          <div className="bg-gray-800 text-white px-4 py-2 rounded-xl shadow-lg text-sm font-semibold">
            {inviteToast}
          </div>
        </div>
      )}

      {/* Score status toast */}
      {scoreToast && (
        <div className="fixed top-20 inset-x-0 z-50 flex justify-center pointer-events-none">
          <div className={`px-4 py-2 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-3 ${
            scoreToast.type === 'success' ? 'bg-green-600 text-white' :
            scoreToast.type === 'error' ? 'bg-red-600 text-white' :
            'bg-blue-600 text-white'
          }`}>
            <span>{scoreToast.message}</span>
            {scoreToast.undo && (
              <button
                onClick={performScoreUndo}
                className="underline font-bold pointer-events-auto active:opacity-70"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Celebrations */}
      {celebration && celebration.level === 'toast' && (
        <CelebrationToast config={celebration} playerName={celebration.playerName} onDone={() => setCelebration(null)} />
      )}
      {celebration && celebration.level === 'fullscreen' && (
        <CelebrationFullscreen config={celebration} playerName={celebration.playerName} onDismiss={() => setCelebration(null)} />
      )}

      {/* Confirm modal */}
      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={confirmModal?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmModal(null)}
        destructive={confirmModal?.destructive}
      />

      {/* Game rules modal */}
      {showRulesModal && game && <GameRulesModal gameType={game.type} onClose={() => setShowRulesModal(false)} />}

      {/* QR Code modal */}
      {showQRModal && (() => {
        const qrCode = (event?.inviteCode) ?? round.inviteCode ?? ''
        const qrUrl = `${window.location.origin}${window.location.pathname}?join=${qrCode}`
        return <InviteQRModal url={qrUrl} code={qrCode} eventName={event?.name} onClose={() => setShowQRModal(false)} />
      })()}

      {showInviteModal && (
        <InvitePlayerModal
          roundId={roundId}
          currentUserId={userId}
          existingPlayerIds={players.map((p: any) => p.id)}
          onClose={() => setShowInviteModal(false)}
          onInvited={name => { setInviteToast(`Invited ${name}`); setTimeout(() => setInviteToast(null), 3000) }}
        />
      )}

      {/* Photo import flow — capture overlays always mounted; confirmation
          grid renders only when an extraction is in hand. */}
      {photoImport.overlays}
      {photoExtraction && snapshot && (
        <PhotoImportConfirmGrid
          roundId={roundId}
          userId={userId}
          players={players}
          snapshot={snapshot}
          existing={holeScores}
          extraction={photoExtraction}
          onCancel={() => setPhotoExtraction(null)}
          onSaved={({ updated, inserted }) => {
            setPhotoExtraction(null)
            setScoreToast({
              message: `Imported ${updated + inserted} score${updated + inserted === 1 ? '' : 's'}`,
              type: 'success',
            })
            setTimeout(() => setScoreToast(null), 3000)
            // Refresh from server so the local state reflects what we just wrote.
            loadScorecardData()
          }}
        />
      )}

      {/* Number pad for quick score entry */}
      {numberPadTarget && (
        <NumberPad
          playerName={numberPadTarget.playerName}
          holeNumber={currentHole}
          par={par}
          currentValue={holeScores.find(s => s.playerId === numberPadTarget.playerId && s.holeNumber === currentHole)?.grossScore ?? par}
          onSelect={v => setScore(numberPadTarget.playerId, v)}
          onClose={() => setNumberPadTarget(null)}
        />
      )}
    </div>
  )
}
