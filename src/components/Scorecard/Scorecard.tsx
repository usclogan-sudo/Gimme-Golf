import { useEffect, useMemo, useState, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useUnsavedChangesPrompt } from '../../hooks/useUnsavedChangesPrompt'
import { enqueue, flush, getPending } from '../../lib/offlineQueue'
import { supabase, rowToRound, rowToRoundPlayer, rowToHoleScore, rowToBuyIn, rowToBBBPoint, rowToJunkRecord, rowToSideBet, rowToRoundParticipant, rowToEvent, rowToEventParticipant, rowToUserProfile, holeScoreToRow, bbbPointToRow, junkRecordToRow, sideBetToRow, rowToPropBet, propBetToRow, rowToPropWager, propWagerToRow, generateInviteCode } from '../../lib/supabase'
import { safeWrite } from '../../lib/safeWrite'
import { finalizeRound } from '../../lib/finalizeRound'
import { computeScorecardPermissions } from '../../lib/permissions'
import { getScoringStance } from '../../lib/scoringStance'
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
import { WolfHolePanel, WolfHoleOutcome, type WolfPick } from './WolfPanels'
import { HammerPanel } from './HammerPanel'
import { ScorecardHeaderMenu } from './ScorecardHeaderMenu'
import { InlineErrorBoundary } from '../InlineErrorBoundary'
import { BuyInBanner } from './BuyInBanner'
import { LeaderboardTab } from './LeaderboardTab'
import { BBBGrid } from './BBBGrid'
import { HoleBetsPanel } from './HoleBetsPanel'
import { DotsPanel } from './DotsPanel'
import { PropBetsPanel } from './PropBetsPanel'
import {
  buildCourseHandicaps,
  calculateSkins,
  calculateBestBall,
  calculateNassau,
  nassauLive,
  calculateNassauMatch,
  isMatchNassau,
  nassauMatchLegStatus,
  nassauPressStartHole,
  calculateWolf,
  calculateBBB,
  calculateHammer,
  bestBallTeamsLabel,
  calculateVegas,
  calculateStableford,
  calculateBanker,
  calculateQuota,
  calculateDots,
  wolfForHole,
  strokesOnHole,
  parseHandicap,
  fmtHandicap,
  fmtAmount,
} from '../../lib/gameLogic'
import type { BestBallResult } from '../../lib/gameLogic'
import { claimedSeatNames, joinedSeatCount } from '../../lib/seats'
import { makePlayableSnapshot, getPlayableHoleNumbers, roundToHolesConfig, getFrontBackSplit } from '../../lib/holeUtils'
import { gameStandings } from '../../lib/standings'
import type { NassauPress } from '../../types'
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
import { reportSupabaseError } from '../../lib/sentry'
import { holdReload } from '../../lib/swUpdate'
import { createRealtimeSync } from '../../lib/realtimeSync'
import { approvedOnly, missingScorePlayers } from '../../lib/scores'
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

/** `unitCents` is what one skin is worth to the winner: the whole pot under the pot
 *  model, or value × opponents when each skin is paid for individually. */
function SkinsStatus({ carry, potCents, stakesMode }: { carry: number; potCents: number; stakesMode?: string }) {
  const valueCents = potCents * (carry + 1)
  if (carry === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-2">
        <span className="text-gray-500 font-bold text-sm">Skins</span>
        <span className="text-gray-600 text-sm">{fmtAmount(valueCents, stakesMode)} in play</span>
      </div>
    )
  }
  return (
    // Carry is a live state — brass tokens, no flame. (§7f)
    <div className="rounded-xl px-3 py-2 flex items-center gap-2 border border-brass/30" style={{ background: 'var(--state-live-bg)' }}>
      <Tooltip term="Carry"><span className="text-brass font-bold text-sm">Carry ×{carry + 1}</span></Tooltip>
      <span className="text-brass/80 text-sm">{fmtAmount(valueCents, stakesMode)} on the line</span>
    </div>
  )
}

function BestBallStatus({ result, scoring, teamsLine }: { result: BestBallResult; scoring: 'match' | 'total'; teamsLine?: string }) {
  // Before any hole is decided there is no score to show; say who is with whom.
  const decidedSoFar = result.holesWon.A + result.holesWon.B + result.holesWon.tied
  if (decidedSoFar === 0 && teamsLine) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
        <span className="text-blue-700 font-bold text-sm">{teamsLine}</span>
      </div>
    )
  }
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
  // Player-ids of invitees who haven't accepted yet — roundParticipants above only
  // holds ACCEPTED members, so pending invitees are tracked separately for the
  // "INVITED" badge on the scoring card (UX M2).
  const [pendingInviteeIds, setPendingInviteeIds] = useState<Set<string>>(new Set())
  // Profile display names for registered users who claimed a guest seat, keyed by
  // auth uid. The seat keeps the organiser's name; this is who is holding it.
  const [claimantNames, setClaimantNames] = useState<Record<string, string>>({})
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
  const [showMiniBoard, setShowMiniBoard] = useState(false)
  const [showGameStatus, setShowGameStatus] = useState(true)
  // BBB (Bingo Bango Bongo) settles from points, not strokes — so golf-score entry
  // is optional and collapsed by default, and the standings/nags key off points.
  //
  // ASKING ONCE PER ROUND, NOT ONCE PER VISIT
  //
  // As plain component state this already survived hole navigation, but not a
  // remount — leaving the round and coming back, closing the app, or any reload
  // (including the service-worker one that fires when a deploy lands mid-round)
  // silently collapsed it again. A real BBB foursome on 7 September finished
  // eighteen holes with "No scores" against all four players, and a preference
  // that quietly resets is a good way to end up there.
  //
  // Scoped per round and to this device: it is a display choice, not data, and
  // "I want strokes in this round" should not follow someone into the next one.
  const scoreEntryKey = `gimme_score_entry_${roundId}`
  const [showScoreEntry, setShowScoreEntry] = useState(() => {
    try { return localStorage.getItem(scoreEntryKey) === '1' } catch { return false }
  })
  const toggleScoreEntry = () => setShowScoreEntry(prev => {
    const next = !prev
    try {
      if (next) localStorage.setItem(scoreEntryKey, '1')
      else localStorage.removeItem(scoreEntryKey)
    } catch { /* private mode: the toggle still works for this session */ }
    return next
  })
  const { isOnline } = useOnlineStatus()
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(getPending())
  const holeNavRef = useRef<HTMLDivElement>(null)
  const [showHoleGrid, setShowHoleGrid] = useState(false)

  // Buy-in / payment state
  const [buyIns, setBuyIns] = useState<BuyIn[]>([])
  const [treasurerProfile, setTreasurerProfile] = useState<Player | null>(null)

  // Event-related state
  const [event, setEvent] = useState<GolfEvent | null>(null)
  const [eventParticipants, setEventParticipants] = useState<EventParticipant[]>([])
  // Whether the event lookup has finished. Until it has, a round carrying an
  // event_id is treated as an event round — otherwise there is a window on load
  // where it reads as an ordinary round, and a score entered in that window would
  // take the self-entry write path instead of the event one.
  const [eventResolved, setEventResolved] = useState(false)
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
  const [scoreToast, setScoreToast] = useState<{
    message: string
    type: 'info' | 'success' | 'error'
    undo?: { previousScore: number; playerId: string; holeNumber: number }
    /** Auto-advance undo (§4): the hole to jump back to when tapped. */
    holeUndo?: number
  } | null>(null)
  // Pending auto-advance timer, and a per-render snapshot of the guards it needs
  // (kept in a ref so setScore — defined before permissions — can read them).
  const holeAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advanceCtxRef = useRef<{ can: boolean; holes: number[] }>({ can: false, holes: [] })
  const [showRoundSummary, setShowRoundSummary] = useState(true)
  const [showBatchEntry, setShowBatchEntry] = useState(false)
  const [batchScores, setBatchScores] = useState<Record<string, Record<number, string>>>({})
  // Warn before navigating away (back button, tab close) with unsaved work — either
  // queued offline writes OR buffered batch-grid edits not yet persisted. The batch
  // grid also autosaves per cell on blur (below), so this is a backstop for a cell
  // still being edited when the user leaves. (UX v2.1 §16.2 — data-loss guard)
  const hasUnsavedBatch = Object.values(batchScores).some(holes => Object.keys(holes).length > 0)
  useUnsavedChangesPrompt(pendingCount > 0 || hasUnsavedBatch)
  // A mounted scorecard holds the service worker reload for its whole life, not
  // only while scores are unsaved: a reload mid-round loses the hole, the tab and
  // the open panel even when every tap has landed (see lib/swUpdate.ts).
  useEffect(() => holdReload('scorecard'), [])
  const [numberPadTarget, setNumberPadTarget] = useState<{ playerId: string; playerName: string } | null>(null)
  const [photoExtraction, setPhotoExtraction] = useState<ExtractionResult | null>(null)

  // `silent` refetches behind the current screen (realtime catch up, tab opened,
  // back from hidden): no loading screen, and a failure keeps what is shown.
  const loadScorecardData = (isCancelled?: () => boolean, opts?: { silent?: boolean }) => {
    const cancelled = () => isCancelled?.() ?? false
    const silent = opts?.silent === true
    if (!silent) {
      setLoadError(false)
      setLoading(true)
    }
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
      supabase.from('round_participants').select('player_id').eq('round_id', roundId).eq('status', 'pending'),
    ]).then(([roundRes, rpRes, hsRes, bbbRes, junkRes, sbRes, partRes, biRes, pbRes, pwRes, pendingRes]) => {
      if (cancelled()) return
      if (roundRes.error || !roundRes.data) {
        if (silent) return
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
      setPendingInviteeIds(new Set((pendingRes?.data ?? []).map((r: any) => r.player_id as string)))
      if (biRes.data) setBuyIns(biRes.data.map(rowToBuyIn))
      if (pbRes?.data) setPropBets(pbRes.data.map(rowToPropBet))
      if (pwRes?.data) setPropWagers(pwRes.data.map(rowToPropWager))
      setLoading(false)
    }).catch(() => {
      if (cancelled() || silent) return
      setLoadError(true)
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    loadScorecardData(() => cancelled)
    return () => { cancelled = true }
  }, [roundId])

  // Latest silent refetch, for the Leaderboard tab button (it is a plain handler
  // outside the realtime effect's closure).
  const refetchRef = useRef<() => void>(() => {})

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
      // Resolved either way — a missing event is an answer, not a pending state.
      setEventResolved(true)
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
  // Lifecycle lives in lib/realtimeSync.ts: the channel is opened with a status
  // callback and, on error, timeout or an unexpected close, torn down, refetched
  // and reopened with backoff. A hidden tab drops its channel after a grace
  // period (channel cap); coming back refetches whatever the gap missed.
  useEffect(() => {
    let cancelled = false

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

    const sync = createRealtimeSync({
      open: (onStatus) => {
        const channel = buildChannel()
        channel.subscribe(status => onStatus(status))
        return () => { supabase.removeChannel(channel) }
      },
      refetch: () => { if (!cancelled) loadScorecardData(() => cancelled, { silent: true }) },
    })
    refetchRef.current = () => sync.refetch()
    sync.start()

    return () => {
      cancelled = true
      refetchRef.current = () => {}
      sync.stop()
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
  // Derived from the event that actually LOADED, not from the column. A deleted
  // event used to leave rounds.event_id dangling, and trusting the column put the
  // round in event mode with no event: every permission check looked for
  // event_participants rows that had cascaded away, and eleven of thirteen players
  // went read-only mid-round. A round whose event is gone should behave as an
  // ordinary round — which still scores and settles fine — rather than as a broken
  // event. The FK added in 20260908120000 stops the dangling id arising; this stops
  // it mattering for rounds that already have one.
  const isEventRound = !!round?.eventId && (!eventResolved || !!event)

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
  // The tee each player is scored from: frozen on the round player row at setup,
  // falling back to the roster entry. Shown beside the course handicap on the
  // leaderboard so a plus player can see why a mid-index hole carries a stroke.
  const teeByPlayer = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of players) m[p.id] = roundPlayers.find(rp => rp.playerId === p.id)?.teePlayed ?? p.tee
    return m
  }, [players, roundPlayers])

  // Claimed guest seats: fetch the claimant's profile display name once per uid.
  const claimantUids = useMemo(
    () => roundParticipants.filter(rp => rp.playerId !== rp.userId).map(rp => rp.userId).sort().join(','),
    [roundParticipants],
  )
  useEffect(() => {
    const missing = claimantUids.split(',').filter(uid => uid && !(uid in claimantNames))
    if (missing.length === 0) return
    let stale = false
    supabase.from('user_profiles').select('user_id, display_name').in('user_id', missing).then(({ data }) => {
      if (stale || !data) return
      setClaimantNames(prev => {
        const next = { ...prev }
        for (const row of data) next[row.user_id] = row.display_name ?? ''
        return next
      })
    })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimantUids])
  const claimedBy = useMemo(
    () => claimedSeatNames(roundParticipants, uid => claimantNames[uid], round?.createdBy),
    [roundParticipants, claimantNames, round?.createdBy],
  )
  const joinedCount = useMemo(
    () => joinedSeatCount(roundParticipants, round?.createdBy),
    [roundParticipants, round?.createdBy],
  )

  // Resolve an actor's user id to a display name, for score provenance (§5b). The
  // creator's own player uses their auth user id as its player id (see NewRound), so
  // an unmatched uid falls through to that.
  const nameByUserId = (uid?: string | null): string | null => {
    if (!uid) return null
    const pid = roundParticipants.find(rp => rp.userId === uid)?.playerId ?? uid
    return players.find(p => p.id === pid)?.name ?? null
  }

  // Handicap lock (Authority Model §5c): handicap drives strokes → net → who owes,
  // so it is a money lever. It is free to edit while setting up, but the moment ANY
  // score is entered the round is underway and a later change would silently rewrite
  // the settlement. Lock it once the first score lands.
  const handicapsLocked = holeScores.length > 0

  // A per-hole betting decision (press, Wolf pick) locks once THIS hole has a score:
  // you cannot make a wager after seeing the hole's outcome (Authority Model §7).
  const currentHoleHasScore = holeScores.some(s => s.holeNumber === currentHole)

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
    holeUndo?: number,
  ) => {
    if (scoreToastTimerRef.current) clearTimeout(scoreToastTimerRef.current)
    setScoreToast({ message, type, undo, holeUndo })
    const duration = undo || holeUndo != null ? 4000 : type === 'error' ? 3000 : 2000
    scoreToastTimerRef.current = setTimeout(() => setScoreToast(null), duration)
  }

  const performScoreUndo = () => {
    const t = scoreToast
    if (scoreToastTimerRef.current) clearTimeout(scoreToastTimerRef.current)
    setScoreToast(null)
    // Auto-advance undo (§4): jump back to the hole (scores are already correct).
    if (t?.holeUndo != null) {
      void goToHole(t.holeUndo)
      return
    }
    const undo = t?.undo
    if (!undo) return
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
        // Record the author on edits too (§5b): submitted_by tracks who LAST touched
        // the score, so a proxy edit is attributable — not just the original enterer.
        const query = supabase.from('hole_scores').update({ gross_score: grossScore, submitted_by: userId }).eq('id', existing.id)
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
        const newScore: HoleScore = { id: uuidv4(), roundId, playerId, holeNumber, grossScore, submittedBy: userId }
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
            data: { gross_score: grossScore, submitted_by: userId },
            matchColumn: 'id',
            matchValue: live.id,
            _expectedUpdatedAt: live.updatedAt,
          })
        } else {
          enqueue({
            table: 'hole_scores',
            method: 'insert',
            data: holeScoreToRow({ id: uuidv4(), roundId, playerId, holeNumber, grossScore, submittedBy: userId }, userId),
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

    // Any score change cancels a pending auto-advance — editing means "I'm still here".
    if (holeAdvanceTimerRef.current) { clearTimeout(holeAdvanceTimerRef.current); holeAdvanceTimerRef.current = null }

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

    // Auto-advance (§4): when a NEW score fills the last blank on this hole, hold
    // ~450ms so the outcome flash lands, then advance and offer Undo. Only for a
    // single authoritative scorer on a normal round (guards snapshotted in the ref),
    // never on an edit to an already-scored player, and never on the final hole.
    if (!existing) {
      const { can, holes } = advanceCtxRef.current
      const idx = holes.indexOf(holeNumber)
      const allNowScored = players.every(p => p.id === playerId || holeScores.some(s => s.playerId === p.id && s.holeNumber === holeNumber))
      if (can && allNowScored && idx >= 0 && idx < holes.length - 1) {
        const nextHole = holes[idx + 1]
        holeAdvanceTimerRef.current = setTimeout(() => {
          holeAdvanceTimerRef.current = null
          void goToHole(nextHole)
          showScoreToast(`Hole ${holeNumber} saved`, 'success', undefined, holeNumber)
        }, 450)
      }
    }
  }

  // Clear a player's score on the current hole (Finding 4). Cancels any pending
  // debounced write for the cell, drops it locally, then removes the row through
  // clear_hole_score (organiser / scorekeeper / author may clear). If that RPC is
  // not deployed yet, fall back to a direct delete, which RLS allows for rows this
  // user inserted. Undo re-enters the previous score through the normal path.
  const clearScore = async (playerId: string) => {
    const holeNumber = currentHole
    const key = `${playerId}-${holeNumber}`
    const pending = pendingScoreWritesRef.current.get(key)
    if (pending) { clearTimeout(pending.timer); pendingScoreWritesRef.current.delete(key) }
    if (holeAdvanceTimerRef.current) { clearTimeout(holeAdvanceTimerRef.current); holeAdvanceTimerRef.current = null }

    const existing = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNumber)
    if (!existing) return
    const previousScore = existing.grossScore
    setHoleScores(prev => prev.filter(s => !(s.playerId === playerId && s.holeNumber === holeNumber)))

    // A placeholder that never reached the server has nothing to delete.
    if (String(existing.id).startsWith('temp-')) {
      showScoreToast('Score cleared', 'success', { previousScore, playerId, holeNumber })
      return
    }
    try {
      const { error } = await supabase.rpc('clear_hole_score', {
        p_round_id: roundId, p_player_id: playerId, p_hole_number: holeNumber,
      })
      if (error) {
        const missingFn = /clear_hole_score|PGRST202|42883/.test(`${error.code ?? ''} ${error.message ?? ''}`)
        if (!missingFn) throw error
        const { error: delErr } = await supabase.from('hole_scores').delete().eq('id', existing.id)
        if (delErr) throw delErr
      }
      showScoreToast('Score cleared', 'success', { previousScore, playerId, holeNumber })
    } catch (err) {
      // Put it back; the server still has it.
      setHoleScores(prev => prev.some(s => s.playerId === playerId && s.holeNumber === holeNumber) ? prev : [...prev, existing])
      reportSupabaseError(err, 'clear_score', { roundId, playerId, holeNumber })
      showScoreToast("Couldn't clear that score — check your connection", 'error')
    }
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
      if (holeAdvanceTimerRef.current) { clearTimeout(holeAdvanceTimerRef.current); holeAdvanceTimerRef.current = null }
    }
  }, [roundId])

  const goToHole = async (holeNum: number) => {
    setSaveError(null)
    // A manual hole change supersedes any pending auto-advance.
    if (holeAdvanceTimerRef.current) { clearTimeout(holeAdvanceTimerRef.current); holeAdvanceTimerRef.current = null }
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
        safeWrite(finalizeRound(roundId), 'end round')
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
  // Every per-hole decision that lives in rounds.game (Wolf picks, Skins and
  // Nassau presses, Hammer throws) goes through here. The write is optimistic;
  // if it fails after one retry the local state is put back to what the server
  // holds and the user is told, so a pick that never saved is not shown as made.
  const updateGameState = async (mutate: (game: Game) => Game): Promise<boolean> => {
    const latest = roundRef.current
    if (!latest?.game) return false
    const previousGame = latest.game
    const updatedGame = mutate(previousGame)
    setRound(prev => prev ? { ...prev, game: updatedGame } : prev)
    const { error } = await supabase.from('rounds')
      .update({ game: updatedGame }).eq('id', roundId).select('game').single()
    if (!error) return true
    // Conflict or network error — refetch and retry once
    const { data: fresh } = await supabase.from('rounds').select('game').eq('id', roundId).single()
    if (fresh?.game) {
      const retryGame = mutate(fresh.game)
      setRound(prev => prev ? { ...prev, game: retryGame } : prev)
      const ok = await safeWrite(supabase.from('rounds').update({ game: retryGame }).eq('id', roundId), 'retry game update')
      if (ok) return true
      setRound(prev => prev ? { ...prev, game: fresh.game } : prev)
    } else {
      reportSupabaseError(error, 'updateGameState')
      setRound(prev => prev ? { ...prev, game: previousGame } : prev)
    }
    showScoreToast("That didn't save. Try again.", 'error')
    return false
  }

  // Wolf decision handler (Finding 4).
  //
  // Authority Model §7 still holds in one direction: a pick that exists cannot be
  // CHANGED once the hole has a score, because the outcome is becoming known. But
  // a hole with scores and NO pick is not forfeited any more — it waits. The
  // organiser or the acting scorekeeper records the pick late (flagged
  // `recordedLate`) and the hole settles as normal. Blind Wolf is never accepted
  // late: it has to be called before the tee.
  const updateWolfDecision = async (holeNumber: number, pick: WolfPick) => {
    const holeHasScores = holeScores.some(s => s.holeNumber === holeNumber)
    const existing = (game?.config as WolfConfig | undefined)?.holeDecisions?.[holeNumber]
    if (holeHasScores && existing) return
    if (holeHasScores && !canRecordLatePick) return
    if (holeHasScores && pick.blind) return
    await updateGameState(game => {
      if (game.type !== 'wolf') return game
      const wolfConfig = game.config as WolfConfig
      // Build the map once, then add or remove — the old spread-then-delete merge
      // re-added the key it had just deleted, so a pick could never be cleared.
      const decisions = { ...(wolfConfig.holeDecisions ?? {}) }
      const current = decisions[holeNumber]
      const sameAsCurrent = current
        && current.partnerId === pick.partnerId
        && (current.blind === true) === (pick.blind === true)
      if (sameAsCurrent && !holeHasScores) {
        delete decisions[holeNumber]
      } else {
        decisions[holeNumber] = {
          partnerId: pick.partnerId,
          ...(pick.blind ? { blind: true } : {}),
          ...(holeHasScores ? { recordedLate: true } : {}),
        }
      }
      return { ...game, config: { ...wolfConfig, holeDecisions: decisions } }
    })
  }

  // Press handler (Skins & Nassau)
  const handlePress = async () => {
    // Lock once this hole is scored (§7) — a press is a wager on the hole from here
    // forward, so declaring it after the outcome is known is a way to win money that
    // should not exist. The button is disabled too; this is the backstop.
    if (currentHoleHasScore) return
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

  // Match-play Nassau presses (Finding 6). The leg in progress is the one the
  // current hole sits in. A press opens a new match from the current hole if no
  // scores are in for it yet, otherwise from the next hole, to the end of that
  // nine. Unlike the Skins press it is allowed after this hole is scored: that is
  // exactly when a player knows they are down. It records who pressed, which leg,
  // and the starting hole. Nothing is automatic.
  const nassauMatchCfg = game?.type === 'nassau' && isMatchNassau(game.config as NassauConfig)
    ? (game.config as NassauConfig) : null
  const [pressPickerOpen, setPressPickerOpen] = useState(false)
  const currentHoleScored = holeScores.some(s => s.holeNumber === currentHole)
  const matchPressContext = useMemo(() => {
    if (!nassauMatchCfg || !playableSnapshot) return null
    const { frontHoles, backHoles } = getFrontBackSplit(playableSnapshot.holes)
    const leg: 'front' | 'back' = frontHoles.includes(currentHole) ? 'front' : 'back'
    const legHoles = leg === 'front' ? frontHoles : backHoles
    const startHole = nassauPressStartHole(legHoles, currentHole, currentHoleScored)
    return { leg, startHole, startsHere: startHole === currentHole }
  }, [nassauMatchCfg, playableSnapshot, currentHole, currentHoleScored])
  const matchPressCount = nassauMatchCfg?.matchPresses?.length ?? 0
  const handleMatchPress = async (playerId: string) => {
    if (!matchPressContext?.startHole) return
    const press: NassauPress = {
      id: uuidv4(),
      playerId,
      leg: matchPressContext.leg,
      startHole: matchPressContext.startHole,
      pressedAtHole: currentHole,
    }
    setPressPickerOpen(false)
    await updateGameState(game => {
      const config = game.config as NassauConfig
      return { ...game, config: { ...config, matchPresses: [...(config.matchPresses ?? []), press] } }
    })
  }
  const handleUndoMatchPress = async () => {
    await updateGameState(game => {
      const config = game.config as NassauConfig
      const presses = [...(config.matchPresses ?? [])]
      presses.pop()
      return { ...game, config: { ...config, matchPresses: presses } }
    })
  }

  // BBB point handler
  const setBBBPoint = async (category: 'bingo' | 'bango' | 'bongo', playerId: string) => {
    const existing = bbbPoints.find(p => p.holeNumber === currentHole)
    const currentVal = existing?.[category]
    const newVal = currentVal === playerId ? null : playerId

    // Optimistic, then put back and say so if the write fails — an award that
    // never saved must not stay lit on the phone.
    if (existing) {
      const updated = { ...existing, [category]: newVal }
      setBbbPoints(prev => prev.map(p => p.id === existing.id ? updated : p))
      const ok = await safeWrite(supabase.from('bbb_points').update({ [category]: newVal }).eq('id', existing.id), 'update bbb point')
      if (!ok) {
        setBbbPoints(prev => prev.map(p => p.id === existing.id ? existing : p))
        showScoreToast("That didn't save. Try again.", 'error')
      }
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
      const ok = await safeWrite(supabase.from('bbb_points').insert(bbbPointToRow(newPoint, userId)), 'insert bbb point')
      if (!ok) {
        setBbbPoints(prev => prev.filter(p => p.id !== newPoint.id))
        showScoreToast("That didn't save. Try again.", 'error')
      }
    }
  }

  // Junk toggle handler (Junks side game and Dots: junkType holds the DotType).
  // Optimistic; a failed write puts the selection back and tells the user. The
  // 6 November Dots failure (23514, junk_type check) sat behind exactly this
  // silence: the dot stayed lit, the row never existed.
  const toggleJunk = async (junkType: JunkType, playerId: string) => {
    const existing = junkRecords.find(jr => jr.holeNumber === currentHole && jr.playerId === playerId && jr.junkType === junkType)
    if (existing) {
      setJunkRecords(prev => prev.filter(jr => jr.id !== existing.id))
      const ok = await safeWrite(supabase.from('junk_records').delete().eq('id', existing.id), 'delete junk record')
      if (!ok) {
        setJunkRecords(prev => prev.some(jr => jr.id === existing.id) ? prev : [...prev, existing])
        showScoreToast("That didn't save. Try again.", 'error')
      }
    } else {
      const newRecord: JunkRecord = { id: uuidv4(), roundId, holeNumber: currentHole, playerId, junkType }
      setJunkRecords(prev => [...prev, newRecord])
      const ok = await safeWrite(supabase.from('junk_records').insert(junkRecordToRow(newRecord, userId)), 'insert junk record')
      if (!ok) {
        setJunkRecords(prev => prev.filter(jr => jr.id !== newRecord.id))
        showScoreToast("That didn't save. Try again.", 'error')
      }
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
    // Backstop for the §5c lock — refuse the write if scoring has started, even if
    // an editor was somehow left open when the first score landed.
    if (handicapsLocked) { setEditingHcpPlayerId(null); return }
    const newHcp = parseHandicap(editingHcpValue)
    if (newHcp === null || newHcp < -10 || newHcp > 54) return // plus handicaps (down to +10) allowed
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

  // Lazily mint the round's invite code the first time someone shares it (§15).
  const ensureInviteCode = async (): Promise<string | null> => {
    if (!round) return null
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
    return code!
  }

  const shareJoinLink = async () => {
    const code = await ensureInviteCode()
    if (!code) return
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
  }

  // Role-based access (must be before approvedScores which depends on isEventRound)
  // Taking your own card back when a scorekeeper has the pen. Session-scoped on
  // purpose: it is a "just for now" action (their phone died, they walked ahead),
  // not a standing preference worth persisting and later having to unwind.
  const [selfScoringOverride, setSelfScoringOverride] = useState(false)
  const [joiningFromCard, setJoiningFromCard] = useState(false)

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
    myRosterPlayerId,
    myPendingInvite,
    groupScorekeeperPlayerId,
  } = computeScorecardPermissions(
    userId, round, roundParticipants, eventParticipants, isEventRound, readOnlyProp,
    players.map(p => p.id),
  )

  // One derived answer to "what am I here?", replacing the five-word badge that
  // could not tell an outsider apart from a player who had never been invited.
  const stance = getScoringStance({
    perms: {
      isScoremasterRole, isScoreMaster, isGroupScorekeeper, groupHasActiveScorekeeper,
      myRosterPlayerId, myParticipant, myEventParticipant, myPendingInvite,
      myEventGroupNumber, readOnly,
    },
    isEventRound,
    scorekeeperName: players.find(p => p.id === groupScorekeeperPlayerId)?.name,
    selfScoringOverride,
  })

  async function acceptInviteFromCard() {
    setJoiningFromCard(true)
    const ok = await safeWrite(
      isEventRound && round?.eventId
        ? supabase.rpc('respond_to_event_invite', { p_event_id: round.eventId, p_accept: true })
        : supabase.rpc('respond_to_round_invite', { p_round_id: roundId, p_accept: true }),
      'accept invite from scorecard',
    )
    setJoiningFromCard(false)
    // Membership changes what every permission below resolves to, so the simplest
    // correct thing is to re-derive the whole screen from a fresh fetch.
    if (ok) window.location.reload()
  }

  // Snapshot the auto-advance guards for setScore (defined earlier). Auto-advance
  // only for a single authoritative scorer on a normal round, in the Hole view —
  // never spectators, self-entry, or multi-actor event rounds.
  advanceCtxRef.current = {
    can: !readOnly && !selfEntryOnly && !isEventRound && isScoremasterRole && scoreTab === 'scores' && !showBatchEntry,
    holes: playableHoleNums,
  }

  // Filter scores for game logic: only use approved scores. The leaderboard
  // table applies the same rule (lib/scores.ts), so the two never disagree.
  const approvedScores = useMemo(() => {
    if (!isEventRound) return holeScores
    return approvedOnly(holeScores)
  }, [holeScores, isEventRound])

  // Pending scores for approval panel
  // Scoped the same way EventLeaderboard scopes it: a group scorekeeper approves
  // their OWN foursome, not the whole field. Unscoped this is invisible in a
  // single-group event and wrong the moment there are several — a group-1
  // scorekeeper would be shown, and could approve or reject, scores for twelve
  // players in foursomes they never walked with. Managers and the round creator keep
  // the field-wide view, since fixing anyone's card is their job.
  const pendingScores = useMemo(() => {
    if (!isEventRound) return []
    const pending = holeScores.filter(s => s.scoreStatus === 'pending')
    if (isEventManager || isScoremasterRole) return pending
    if (isGroupScorekeeper && myEventGroupNumber != null) {
      const groupPlayerIds = new Set(
        players.filter((p: any) => round?.groups?.[p.id] === myEventGroupNumber).map((p: any) => p.id),
      )
      return pending.filter(s => groupPlayerIds.has(s.playerId))
    }
    return []
  }, [holeScores, isEventRound, isEventManager, isScoremasterRole, isGroupScorekeeper,
      myEventGroupNumber, players, round?.groups])

  // Player-id → the hole they joined mid-round (Option A). Absent ⇒ round start, so
  // a pre-join hole isn't treated as "incomplete" just because they've no score yet.
  const startHoles = useMemo((): Record<string, number> => {
    const m: Record<string, number> = {}
    for (const rp of roundPlayers) if (rp.startHole) m[rp.playerId] = rp.startHole
    return m
  }, [roundPlayers])

  // Game result calculations (all depend on approvedScores, must come after it)
  // Use playableSnapshot so game logic only sees the holes being played
  const skinsResult = useMemo(() => {
    if (!game || game.type !== 'skins' || !playableSnapshot) return null
    return calculateSkins(players, approvedScores, playableSnapshot, game.config as SkinsConfig, courseHcps, startHoles)
  }, [game, players, approvedScores, playableSnapshot, courseHcps, startHoles])

  const bestBallResult = useMemo(() => {
    if (!game || game.type !== 'best_ball' || !playableSnapshot) return null
    return calculateBestBall(players, approvedScores, playableSnapshot, game.config as BestBallConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  // Legacy stroke-play Nassau (NassauConfig.scoring absent). Null for match play.
  const nassauResult = useMemo(() => {
    if (!game || game.type !== 'nassau' || !playableSnapshot) return null
    if (isMatchNassau(game.config as NassauConfig)) return null
    return calculateNassau(players, approvedScores, playableSnapshot, game.config as NassauConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const nassauLiveStatus = useMemo(() => {
    if (!game || game.type !== 'nassau' || !playableSnapshot) return null
    if (isMatchNassau(game.config as NassauConfig)) return null
    return nassauLive(players, approvedScores, playableSnapshot, game.config as NassauConfig, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  // Match-play Nassau (Finding 6): holes up per leg, pairwise, closing early.
  const nassauMatch = useMemo(() => {
    if (!game || game.type !== 'nassau' || !playableSnapshot) return null
    if (!isMatchNassau(game.config as NassauConfig)) return null
    return calculateNassauMatch(players, approvedScores, playableSnapshot, game.config as NassauConfig, courseHcps, game.buyInCents)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  // The viewer's own seat, for "from my side" status lines. A registered user's
  // player id is their auth uid; a guest-seat joiner is found via their participant row.
  const viewerPlayerId = useMemo(() =>
    roundParticipants.find(rp => rp.userId === userId)?.playerId
      ?? (players.some(p => p.id === userId) ? userId : null),
  [roundParticipants, players, userId])

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
    return calculateSkins(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps, startHoles)
  }, [game, players, approvedScores, playableSnapshot, courseHcps, startHoles])

  const bestBallResultAlt = useMemo(() => {
    if (!game || game.type !== 'best_ball' || !playableSnapshot) return null
    const cfg = game.config as BestBallConfig
    return calculateBestBall(players, approvedScores, playableSnapshot, { ...cfg, mode: cfg.mode === 'net' ? 'gross' : 'net' }, courseHcps)
  }, [game, players, approvedScores, playableSnapshot, courseHcps])

  const nassauResultAlt = useMemo(() => {
    if (!game || game.type !== 'nassau' || !playableSnapshot) return null
    const cfg = game.config as NassauConfig
    if (isMatchNassau(cfg)) return null
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
  // Both players scored on this hole: settled by play, so no more throws or declines.
  const currentHoleScoredByAll = players.length > 0
    && players.every(p => holeScores.some(s => s.playerId === p.id && s.holeNumber === currentHole))
  const currentHammerSettled = !!currentHammerState?.declined || currentHoleScoredByAll

  const currentCarry = useMemo(() => {
    if (!skinsResult) return 0
    const prevHole = skinsResult.holeResults.find(h => h.holeNumber === currentHole - 1)
    if (!prevHole) return 0
    return prevHole.winnerId === null ? prevHole.carry + 1 : 0
  }, [skinsResult, currentHole])

  // The standings bar ranks and displays on the side game's own result for every
  // format (Finding 9) — skins won, units, holes up, points, legs — through the
  // shared helper the Leaderboard tab also uses, so the two never disagree.
  // Strokes-to-par appear nowhere in it. No result yet ⇒ a dash per player.
  const miniBoard = useMemo(() => gameStandings(game ?? null, players, {
    skins: skinsResult, bestBall: bestBallResult, nassau: nassauResult, nassauMatch,
    wolf: wolfResult, bbb: bbbResult, hammer: hammerResult, vegas: vegasResult,
    stableford: stablefordResult, dots: dotsResult, banker: bankerResult, quota: quotaResult,
  }, { stakesMode: game?.stakesMode }), [
    game, players, skinsResult, bestBallResult, nassauResult, nassauMatch, wolfResult,
    bbbResult, hammerResult, vegasResult, stablefordResult, dotsResult, bankerResult, quotaResult,
  ])

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
  const wolfId = wolfConfig ? wolfForHole(wolfConfig.wolfOrder ?? [], currentHole) : null
  // Only the organiser or the acting scorekeeper may record a pick after scoring
  // has started on a hole (Finding 4).
  const canRecordLatePick = !readOnly && (isScoremasterRole || isScoreMaster || isGroupScorekeeper)
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
    if (currentHammerSettled) return // Settled by decline or by scores (the buttons are disabled too)
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
    if (!currentHammerState || currentHammerSettled || currentHammerState.presses === 0) return
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
                  {stance.badge}
                </span>
              </p>
              {/* One hole header — stepper chevrons merged in; the duplicate row below
                  is gone, recovering ~56px of vertical space. (§7a) */}
              <h1 className="text-xl font-bold flex items-center gap-1">
                <button
                  onClick={() => { const idx = playableHoleNums.indexOf(currentHole); if (idx > 0) goToHole(playableHoleNums[idx - 1]) }}
                  disabled={playableHoleNums.indexOf(currentHole) <= 0}
                  className="w-11 h-11 -my-2 flex items-center justify-center rounded-full text-gray-300 hover:bg-black/20 disabled:opacity-30"
                  aria-label="Previous hole"
                >‹</button>
                <button onClick={() => setShowHoleGrid(v => !v)} className="min-h-[44px] -my-2 px-1 flex items-center active:opacity-80" aria-label="Choose hole">Hole {currentHole}</button>
                <button
                  onClick={() => { const idx = playableHoleNums.indexOf(currentHole); if (idx < playableHoleNums.length - 1) goToHole(playableHoleNums[idx + 1]) }}
                  disabled={playableHoleNums.indexOf(currentHole) >= playableHoleNums.length - 1}
                  className="w-11 h-11 -my-2 flex items-center justify-center rounded-full text-gray-300 hover:bg-black/20 disabled:opacity-30"
                  aria-label="Next hole"
                >›</button>
                <span className="text-gray-300 font-normal text-base ml-1">Par {par} · <Tooltip term="SI">SI {strokeIndex}</Tooltip></span>
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
            {/* The menu is a pure list of actions (see ScorecardHeaderMenu): it reads
                no game state, and sits inside its own boundary. Add players + Share
                link live in the visible invite strip below the header (§15); the
                kebab keeps the niche invite options. Settle Up is open to everyone,
                including read-only viewers: looking at results is not privileged. */}
            {showHeaderMenu && (
              <ScorecardHeaderMenu
                showQR={isScoremasterRole}
                onQR={async () => { setShowHeaderMenu(false); await ensureInviteCode(); setShowQRModal(true) }}
                showSpectatorLink={!readOnly}
                onSpectatorLink={async () => {
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
                    try { await navigator.clipboard.writeText(url) } catch {}
                  }
                  setInviteToast('Spectator link copied!')
                  setTimeout(() => setInviteToast(null), 3000)
                }}
                showPhotoImport={!readOnly && !!snapshot && players.length > 0}
                onPhotoImport={() => { setShowHeaderMenu(false); photoImport.open() }}
                showRules={!!game}
                onRules={() => { setShowHeaderMenu(false); setShowRulesModal(true) }}
                showSettleUp={round.status === 'complete'}
                onSettleUp={() => { setShowHeaderMenu(false); onEndRound() }}
                showEndRound={round.status !== 'complete' && !readOnly && (isEventRound ? isScoreMaster : !selfEntryOnly)}
                onEndRound={() => { setShowHeaderMenu(false); confirmEndRound() }}
              />
            )}
          </div>
        </div>
        {showHoleGrid && (
          <div ref={holeNavRef} className="max-w-2xl mx-auto mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {playableHoleNums.map(n => {
              const hasScore = players.length > 0 && players.every(p => holeScores.some(s => s.playerId === p.id && s.holeNumber === n))
              return (
                <button key={n} data-hole={n} onClick={() => { goToHole(n); setShowHoleGrid(false) }}
                  className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-full text-sm font-bold flex-shrink-0 transition-colors flex items-center justify-center ${
                    n === currentHole ? 'bg-white text-gray-800 dark:text-gray-100 ring-2 ring-amber-400' : hasScore ? 'bg-amber-500 text-white' : 'bg-gray-700/40 text-gray-400 border border-gray-500/30'
                  }`}>{n}</button>
              )
            })}
          </div>
        )}
      </header>

      {/* Any state that stops someone doing the obvious thing has to say so, and
          offer the action that resolves it. A bare badge said "Spectating" to a
          player who had simply never been invited, and to a spouse on the cart
          path, and gave neither of them anywhere to go. */}
      {(stance.action || stance.kind === 'following' || stance.kind === 'scored_for') && (
        <div className="max-w-2xl mx-auto px-4 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
            <p className="text-sm text-gray-700 dark:text-gray-200">{stance.headline}</p>
            {stance.action === 'join' && (
              <button
                onClick={acceptInviteFromCard}
                disabled={joiningFromCard}
                className="shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-50"
              >{joiningFromCard ? 'Joining…' : stance.actionLabel}</button>
            )}
            {stance.action === 'take_over' && (
              <button
                onClick={() => setSelfScoringOverride(true)}
                className="shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600"
              >{stance.actionLabel}</button>
            )}
          </div>
        </div>
      )}

      {/* ── Invite strip (§15): the primary invite path, out of the kebab and into
          the open. Host-only; shows live roster status. ── */}
      {isScoremasterRole && !readOnly && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
            <p className="text-sm text-gray-600 dark:text-gray-300 min-w-0 truncate">
              <span className="font-semibold text-gray-800 dark:text-gray-100">{players.length} playing</span>
              {joinedCount > 0 && (
                <span className="text-gray-500 dark:text-gray-400"> · {joinedCount} joined</span>
              )}
              {pendingInviteeIds.size > 0 && (
                <span className="text-amber-600 dark:text-amber-400"> · {pendingInviteeIds.size} invited</span>
              )}
            </p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={shareJoinLink}
                className="text-sm font-semibold text-navy dark:text-brass px-3 min-h-[44px] rounded-lg active:opacity-70"
              >
                Share link
              </button>
              <button
                onClick={() => setShowInviteModal(true)}
                className="text-sm font-bold bg-navy text-white dark:bg-brass dark:text-navy px-3 min-h-[44px] rounded-lg active:opacity-90"
              >
                + Add players
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hole / Grid / Leaderboard segmented control (§7g). Grid = batch entry,
          promoted from a button to a first-class segment; only offered to a
          scorekeeper with more than one player. Hole & Grid both live under the
          'scores' tab — showBatchEntry picks which — so all the per-hole/grid
          render gates below stay untouched. */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 sticky top-[5.5rem] z-[6]">
        <div className="max-w-2xl mx-auto flex gap-1">
          <button
            onClick={() => { setScoreTab('scores'); setShowBatchEntry(false) }}
            className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
              scoreTab === 'scores' && !showBatchEntry ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            Hole
          </button>
          {/* Grid is the fast way to enter several players' scores, so it has to be
              available to everyone who actually does that. Gating it on
              isScoremasterRole (creator or game master) hid it from event group
              scorekeepers — the very people entering a whole foursome's card. */}
          {/* On a BBB round Grid is the points card — the audit trail for a format
              where every missed tap moves the settlement — so it is offered to
              everyone, not only whoever is entering strokes. */}
          {(game?.type === 'bingo_bango_bongo' ||
            (!readOnly && players.length > 1 && (isScoremasterRole || isGroupScorekeeper || isEventManager))) && (
            <button
              onClick={() => { setScoreTab('scores'); setShowBatchEntry(true) }}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
                scoreTab === 'scores' && showBatchEntry ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              Grid
            </button>
          )}
          <button
            // Opening the board is a moment the user expects it to be current, so
            // catch up on anything realtime missed.
            onClick={() => { setScoreTab('leaderboard'); refetchRef.current() }}
            className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
              scoreTab === 'leaderboard' ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
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
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">Round Complete!</p>
                <p className="text-amber-700 text-sm font-medium mt-1">{snapshot.courseName}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/70 rounded-xl p-2">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{totalScore}</p>
                </div>
                <div className="bg-white/70 rounded-xl p-2">
                  <p className="text-xs text-gray-500">vs Par</p>
                  <p className={`text-xl font-bold ${vsPar > 0 ? 'text-red-600' : vsPar < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {vsPar > 0 ? '+' : ''}{vsPar === 0 ? 'E' : vsPar}
                  </p>
                </div>
                <div className="bg-white/70 rounded-xl p-2">
                  <p className="text-xs text-gray-500">Holes</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{totalHoles}</p>
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
      {scoreTab === 'scores' && game && miniBoard.entries.length > 0 && (
        <div className="px-4 pt-3 max-w-2xl mx-auto">
          <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowMiniBoard(!showMiniBoard)}
              className="w-full px-3 py-2 flex items-center justify-between"
            >
              {showMiniBoard ? (
                <span className="text-xs font-semibold text-gray-500 uppercase">Standings · {miniBoard.metric || 'Game'}</span>
              ) : (
                <div className="flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold text-gray-600">
                  {/* Wraps rather than scrolling sideways. As a horizontal scroller
                      this quietly hid the last players on a narrow phone — and the
                      standings strip is the only thing that reveals a mis-tapped
                      award, so a hidden player is a wrong score nobody catches.
                      The figure is the side game's own result (Finding 9). */}
                  {miniBoard.entries.map((e, i) => (
                    <span key={e.player.id} className="whitespace-nowrap">
                      {i > 0 && <span className="text-gray-300 mx-0.5">·</span>}
                      {miniBoard.hasResult ? `${e.position}. ` : ''}{e.player.name}{' '}
                      <span className={
                        e.value === null ? 'text-gray-400'
                        : e.value > 0 ? 'text-amber-700 dark:text-brass font-bold'
                        : e.value < 0 ? 'text-gray-500 font-bold'
                        : 'text-gray-500 font-bold'
                      }>{e.label}</span>
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
                      <th className="text-right py-1 px-1 font-medium">{miniBoard.metric || 'Result'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {miniBoard.entries.map(e => (
                      <tr key={e.player.id} className={e.position === 1 ? 'bg-amber-50' : ''}>
                        <td className={`py-1 px-1 font-bold text-sm ${e.position === 1 ? 'text-amber-600' : 'text-gray-500'}`}>{e.position || '—'}</td>
                        <td className="py-1 px-1 font-semibold text-gray-800 dark:text-gray-100 text-sm">{e.player.name}</td>
                        <td className={`py-1 px-1 text-right font-bold text-sm ${
                          e.value === null ? 'text-gray-400' : e.value > 0 ? 'text-amber-700 dark:text-brass' : 'text-gray-600 dark:text-gray-300'
                        }`}>{e.label}</td>
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
                  {nassauMatch && (() => {
                    const nameOf = (id: string) => (players.find(p => p.id === id)?.name ?? '?').split(' ')[0] || '?'
                    const legs = [
                      { label: 'F', leg: nassauMatch.front },
                      { label: 'B', leg: nassauMatch.back },
                      { label: 'T', leg: nassauMatch.total },
                    ]
                    return (
                      <p className="text-xs text-gray-500">
                        <span className="font-semibold">Nassau:</span>{' '}
                        {legs.map(({ label, leg }) => `${label}: ${nassauMatchLegStatus(leg, nameOf, viewerPlayerId)}`).join(' · ')}
                        {matchPressCount > 0 && ` · ${matchPressCount} press${matchPressCount === 1 ? '' : 'es'}`}
                      </p>
                    )
                  })()}
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
                      {bestBallResult.holesWon.A + bestBallResult.holesWon.B + bestBallResult.holesWon.tied === 0
                        // Nothing decided yet: say who is with whom.
                        ? bestBallTeamsLabel(players, (game.config as BestBallConfig).teams ?? {})
                        : (game.config as BestBallConfig).scoring === 'total'
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
          <div className="bg-white border-b border-gray-200 px-4 py-2 sticky top-[5.5rem] z-[5]">
            <div className="max-w-2xl mx-auto flex gap-1 overflow-x-auto">
              {groupNums.map(gn => (
                <button
                  key={gn}
                  onClick={() => setActiveGroupTab(gn)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
                    activeGroupTab === gn ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  Group {gn}
                </button>
              ))}
              <button
                onClick={() => setActiveGroupTab('all')}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
                  activeGroupTab === 'all' ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy' : 'bg-gray-100 text-gray-600'
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
          nassauMatch={nassauMatch}
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
          claimedBy={claimedBy}
          teeByPlayer={teeByPlayer}
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
                <p className="text-purple-800 text-sm font-semibold">Organizer · All Groups</p>
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
            {(skinsResult || bestBallResult || nassauResult || nassauMatch || (wolfConfig && wolfId) || (game?.type === 'hammer' && hammerConfig) || (game?.type === 'bingo_bango_bongo') || (junkConfig && junkConfig.types.length > 0)) && (
              <button
                onClick={() => setShowGameStatus(!showGameStatus)}
                className="w-full min-h-[44px] flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Game · Hole {currentHole}</span>
                <span className="text-gray-400 text-sm">{showGameStatus ? '▾' : '▸'}</span>
              </button>
            )}

            {showGameStatus && skinsResult && game && (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SkinsStatus
                    carry={currentCarry}
                    potCents={
                      (game.config as SkinsConfig).payModel === 'per_skin'
                        // No pot: a skin is worth its value from each opponent, so
                        // showing buyIn × everyone would overstate it by one player's
                        // share and imply money that was never collected.
                        ? game.buyInCents * Math.max(players.length - 1, 1)
                        : game.buyInCents * players.length * (1 + ((game.config as any).presses?.length ?? 0))
                    }
                    stakesMode={game.stakesMode}
                  />
                </div>
                {SHOW_PRESSES && !readOnly && (
                  <button
                    onClick={handlePress}
                    disabled={currentHoleHasScore}
                    title={currentHoleHasScore ? 'Presses lock once the hole is scored — press on the next hole' : undefined}
                    className="px-3 py-2 bg-navy text-cream dark:bg-brass dark:text-navy text-xs font-bold rounded-xl active:opacity-90 flex-shrink-0 disabled:opacity-40 disabled:active:opacity-40"
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
            {showGameStatus && bestBallResult && game && (
              <BestBallStatus
                result={bestBallResult}
                scoring={(game.config as BestBallConfig).scoring}
                teamsLine={bestBallTeamsLabel(players, (game.config as BestBallConfig).teams ?? {})}
              />
            )}

            {/* Nassau status — match play. Each leg reads in holes up ("Sam 2 UP",
                "AS", "Sam 3&2"), never a stroke count. The press button asks who is
                pressing before anything is recorded. */}
            {showGameStatus && nassauMatch && game && (() => {
              const nameOf = (id: string) => (players.find(p => p.id === id)?.name ?? '?').split(' ')[0] || '?'
              const totalHoles = playableSnapshot?.holes.length ?? 18
              const half = Math.ceil(totalHoles / 2)
              const legs = [
                { label: `F${half}`, leg: nassauMatch.front },
                { label: `B${totalHoles - half}`, leg: nassauMatch.back },
                { label: `${totalHoles}`, leg: nassauMatch.total },
              ]
              const canPress = SHOW_PRESSES && !readOnly && !!matchPressContext?.startHole
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 flex items-center gap-2">
                      <span className="font-bold text-teal-700 text-sm mr-1">Nassau</span>
                      {legs.map(({ label, leg }) => (
                        <div key={label} className="text-center px-2 border-l border-teal-200 min-w-0">
                          <p className="text-xs text-teal-500">{label}</p>
                          <p className="text-xs font-semibold text-teal-800 truncate max-w-[88px]">
                            {nassauMatchLegStatus(leg, nameOf, viewerPlayerId)}
                          </p>
                        </div>
                      ))}
                    </div>
                    {SHOW_PRESSES && !readOnly && (
                      <button
                        onClick={() => setPressPickerOpen(v => !v)}
                        disabled={!canPress}
                        title={!canPress ? 'Nothing left to press on this nine' : undefined}
                        className="px-3 py-2 bg-navy text-cream dark:bg-brass dark:text-navy text-xs font-bold rounded-xl active:opacity-90 flex-shrink-0 disabled:opacity-40 disabled:active:opacity-40"
                      >
                        Press{matchPressCount ? ` (${matchPressCount})` : ''}
                      </button>
                    )}
                    {!readOnly && matchPressCount > 0 && (
                      <button
                        onClick={handleUndoMatchPress}
                        aria-label="Undo last press"
                        title="Undo last press"
                        className="px-2.5 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl active:bg-gray-300 dark:active:bg-gray-600 flex-shrink-0"
                      >
                        ↩
                      </button>
                    )}
                  </div>
                  {pressPickerOpen && matchPressContext?.startHole && (
                    <div className="bg-white dark:bg-gray-800 border border-teal-200 dark:border-gray-700 rounded-xl px-3 py-3 space-y-2">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Who's pressing?</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Opens a new match on the {matchPressContext.leg} nine from hole {matchPressContext.startHole} to the end, at the same value as the leg.{' '}
                        {matchPressContext.startsHere
                          ? 'No scores are in for this hole yet, so the press starts here.'
                          : 'This hole is already scored, so the press starts on the next one.'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {players.map(p => (
                          <button
                            key={p.id}
                            onClick={() => handleMatchPress(p.id)}
                            className="px-3 py-2 min-h-[44px] rounded-lg text-sm font-semibold bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 active:bg-gray-100"
                          >
                            {p.name}
                          </button>
                        ))}
                        <button
                          onClick={() => setPressPickerOpen(false)}
                          className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-gray-500 underline"
                        >
                          Not now
                        </button>
                      </div>
                    </div>
                  )}
                  {nassauMatch.presses.length > 0 && (
                    <div className="bg-teal-50/60 border border-teal-100 rounded-xl px-3 py-2 space-y-0.5">
                      {nassauMatch.presses.map(p => (
                        <p key={p.press.id} className="text-xs text-teal-800">
                          <span className="font-semibold">{nameOf(p.press.playerId)} pressed</span> · {p.press.leg} nine from {p.press.startHole} —{' '}
                          {nassauMatchLegStatus(p, nameOf, viewerPlayerId)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Nassau status — stroke play (legacy rounds) */}
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
                      disabled={currentHoleHasScore}
                      title={currentHoleHasScore ? 'Presses lock once the hole is scored — press on the next hole' : undefined}
                      className="px-3 py-2 bg-navy text-cream dark:bg-brass dark:text-navy text-xs font-bold rounded-xl active:opacity-90 flex-shrink-0 disabled:opacity-40 disabled:active:opacity-40"
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

            {/* Wolf panel — pure component, own boundary (Findings 3 and 4). Also
                rendered for a previous hole the scorekeeper arrows back to, which
                is how a missed pick gets recorded. */}
            {showGameStatus && !readOnly && wolfConfig && (
              <InlineErrorBoundary label="the Wolf panel">
                <WolfHolePanel
                  players={players}
                  config={wolfConfig}
                  holeScores={holeScores}
                  holeNumber={currentHole}
                  canRecordLatePick={canRecordLatePick}
                  onPick={updateWolfDecision}
                />
              </InlineErrorBoundary>
            )}

            {/* Hammer panel */}
            {showGameStatus && game?.type === 'hammer' && hammerConfig && players.length === 2 && (
              <InlineErrorBoundary label="the Hammer panel">
                <HammerPanel
                  players={players}
                  baseValueCents={hammerConfig.baseValueCents}
                  maxPresses={hammerConfig.maxPresses}
                  state={currentHammerState}
                  holeScored={currentHoleScoredByAll}
                  netCents={hammerResult?.netCents ?? {}}
                  readOnly={readOnly}
                  stakesMode={game?.stakesMode}
                  onThrow={throwHammer}
                  onDecline={declineHammer}
                />
              </InlineErrorBoundary>
            )}

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
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700">{icon} {label}</p>
                  {/* TOUCH TARGETS, AND WHY THEY ARE THIS SIZE
                      These chips were 26px tall with 6px gaps. A foursome awards
                      three points a hole, so a round is 54 taps onto targets 41%
                      under the 44px minimum, one-handed, outdoors, sometimes with a
                      glove on — and a mis-tap does not error, it quietly gives
                      Bango to the wrong player. Reported as "super clunky" after a
                      real foursome, which is exactly what that adds up to.

                      Two columns on a phone rather than four: it makes the card
                      taller, but each target becomes roughly 170x44 instead of
                      83x26, and full names stay readable. That last part matters
                      here more than it looks — truncating would render "Austin
                      Logan" and "Jeff Logan" identically. */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setBBBPoint(category, p.id)}
                        aria-pressed={currentBBB?.[category] === p.id}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-sm font-semibold leading-tight transition-colors ${
                          currentBBB?.[category] === p.id
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-white border border-amber-200 text-amber-700 active:bg-amber-100'
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
                  <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Bingo Bango Bongo — Hole {currentHole}</p>
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
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{player?.name ?? 'Unknown'}</p>
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

        {/* Batch Entry Grid — the "Grid" segment (§7g) */}
        {showBatchEntry && game?.type === 'bingo_bango_bongo' && (
          <BBBGrid
            players={players}
            bbbPoints={bbbPoints}
            currentHole={currentHole}
            readOnly={readOnly}
            onSelectHole={h => { goToHole(h); setShowBatchEntry(false) }}
          />
        )}

        {showBatchEntry && game?.type !== 'bingo_bango_bongo' && !readOnly && snapshot && (() => {
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

          // Immutably drop one cell from the unsaved buffer.
          const dropBatchCell = (
            prev: Record<string, Record<number, string>>,
            playerId: string,
            holeNum: number,
          ): Record<string, Record<number, string>> => {
            if (!prev[playerId]) return prev
            const holes = { ...prev[playerId] }
            delete holes[holeNum]
            const next = { ...prev, [playerId]: holes }
            if (Object.keys(holes).length === 0) delete next[playerId]
            return next
          }

          // Persist a single cell and clear it from the unsaved buffer. Called on cell
          // blur so batch scores are saved as you go — navigating away can no longer
          // drop the whole grid. (UX v2.1 §16.2)
          const persistBatchCell = (playerId: string, holeNum: number, valStr: string) => {
            const val = parseInt(valStr)
            if (isNaN(val) || val < 1 || val > 15) return // leave invalid edits buffered
            const existing = holeScores.find(s => s.playerId === playerId && s.holeNumber === holeNum)
            if (!(existing && existing.grossScore === val)) {
              if (existing) {
                setHoleScores(prev => prev.map(s => s.id === existing.id ? { ...s, grossScore: val } : s))
                safeWrite(supabase.from('hole_scores').update({ gross_score: val }).eq('id', existing.id), 'update batch score')
              } else {
                const newScore: HoleScore = { id: uuidv4(), roundId, playerId, holeNumber: holeNum, grossScore: val }
                setHoleScores(prev => [...prev, newScore])
                safeWrite(supabase.from('hole_scores').insert(holeScoreToRow(newScore, userId)), 'insert batch score')
              }
            }
            setBatchScores(prev => dropBatchCell(prev, playerId, holeNum))
          }

          // Flush any still-buffered cells (e.g. one being edited) and close.
          const saveBatch = async () => {
            for (const playerId of Object.keys(batchScores)) {
              for (const [holeStr, valStr] of Object.entries(batchScores[playerId])) {
                persistBatchCell(playerId, Number(holeStr), valStr)
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
                                onBlur={e => persistBatchCell(p.id, holeNum, e.target.value)}
                                className="w-12 h-11 text-center text-sm font-semibold rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brass"
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
                className="w-full h-12 bg-navy text-cream dark:bg-brass dark:text-navy font-bold rounded-xl active:opacity-90 text-sm"
              >
                Save All Scores
              </button>
            </div>
          )
        })()}

        {/* BBB doesn't need strokes — offer golf-score entry as an optional, collapsed section. */}
        {!showBatchEntry && game?.type === 'bingo_bango_bongo' && (
          <button
            onClick={toggleScoreEntry}
            className="w-full text-sm font-semibold text-gray-500 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 active:bg-gray-100 transition-colors"
          >
            {showScoreEntry ? 'Hide golf scores' : 'Enter golf scores (optional) — stays open for the round ▸'}
          </button>
        )}

        {/* Score cards */}
        {!showBatchEntry && (game?.type !== 'bingo_bango_bongo' || showScoreEntry) && players.map(player => {
          const grossScore = getScore(player.id)
          const courseHcp = courseHcps[player.id] ?? 0
          const strokesGiven = strokesOnHole(courseHcp, strokeIndex)
          const netScore = grossScore - strokesGiven

          // Score provenance (§5b): surface when a player's score was entered/edited
          // by someone OTHER than the player themselves — but only when that player is
          // on their own device (device-bound). In a single-device round the scorekeeper
          // enters everyone's score by design, so labelling every row would be noise;
          // the owner-not-device-bound case stays unlabelled.
          const scoreRow = holeScores.find(s => s.playerId === player.id && s.holeNumber === currentHole)
          const ownerUserId = roundParticipants.find(rp => rp.playerId === player.id)?.userId
          const enteredByName = (scoreRow?.submittedBy && ownerUserId && scoreRow.submittedBy !== ownerUserId)
            ? nameByUserId(scoreRow.submittedBy)
            : null

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
          // Owning the slot is what matters, and it can be established two ways: a
          // membership row that names this player, or the roster slot that carries
          // this user's own id. The second is the baseline that survives a missing
          // invite — see the note in permissions.ts.
          const ownsThisSlot = myParticipant?.playerId === player.id || player.id === myRosterPlayerId
          const isMyPlayer = selfEntryOnly && ownsThisSlot
          const isMyEventPlayer = isEventRound &&
            (myEventParticipant?.playerId === player.id || player.id === myRosterPlayerId)

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
            } else if (groupHasActiveScorekeeper && !(selfScoringOverride && ownsThisSlot)) {
              // A scorekeeper holds the pen for the group — but only until one of
              // their players asks for it back. This used to be an unconditional
              // lock, so a dead phone or a scorekeeper who walked ahead left a
              // player unable to record their own strokes.
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
                  <div>
                    <p className={`font-semibold text-sm ${isRejected ? 'text-gray-400 line-through' : isPending ? 'text-gray-600' : 'text-gray-800 dark:text-gray-100'}`}>{player.name}</p>
                    {claimedBy[player.id] && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500">claimed by {claimedBy[player.id]}</p>
                    )}
                  </div>
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
                          <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 bg-gray-800 text-white dark:bg-brass dark:text-navy text-xs rounded-xl px-3 py-2 shadow-lg">
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
                  {strokesGiven > 0 && <span className="text-xs text-amber-600 font-semibold">Net {scoreRow ? netScore : '—'}</span>}
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
            <div key={player.id} className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border px-3 py-2.5 ${isPending ? 'border-yellow-300' : isRejected ? 'border-red-300' : 'border-gray-100 dark:border-gray-700'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-bold text-gray-800 dark:text-gray-100 text-base">{player.name}</p>
                      {claimedBy[player.id] && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-0.5">claimed by {claimedBy[player.id]}</p>
                      )}
                    </div>
                    {pendingInviteeIds.has(player.id) && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                        title="Invited — hasn't joined on their phone yet"
                      >
                        INVITED
                      </span>
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
                          <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-56 bg-gray-800 text-white dark:bg-brass dark:text-navy text-xs rounded-xl px-3 py-2 shadow-lg">
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
                        type="text"
                        inputMode="text"
                        placeholder="e.g. 12 or +4"
                        value={editingHcpValue}
                        onChange={e => setEditingHcpValue(e.target.value)}
                        className="w-16 h-8 px-2 rounded-lg border border-amber-300 dark:bg-gray-700 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveHandicapEdit(); if (e.key === 'Escape') setEditingHcpPlayerId(null) }}
                      />
                      <button onClick={saveHandicapEdit} className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded-lg">Save</button>
                      <button onClick={() => setEditingHcpPlayerId(null)} className="text-xs text-gray-500">Cancel</button>
                    </div>
                  ) : (
                    <p className={`text-sm text-gray-500 ${!readOnly && !handicapsLocked ? 'cursor-pointer active:text-amber-600' : ''}`}
                      title={handicapsLocked ? 'Handicaps lock once scoring starts' : undefined}
                      onClick={() => {
                        if (readOnly || handicapsLocked) return
                        setEditingHcpPlayerId(player.id)
                        setEditingHcpValue(fmtHandicap(player.handicapIndex))
                      }}
                    >
                      HCP {fmtHandicap(player.handicapIndex)}
                      {strokesGiven > 0 && <span className="ml-2 text-amber-600 font-semibold">receives {strokesGiven}</span>}
                      {!readOnly && (handicapsLocked
                        ? <span className="ml-1 text-gray-300 text-xs" aria-label="locked">&#128274;</span>
                        : <span className="ml-1 text-gray-300 text-xs">&#9998;</span>)}
                    </p>
                  )}
                  {enteredByName && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">entered by {enteredByName}</p>
                  )}
                </div>
                {/* §7b: badges deleted (outcome lives in the selected chip); the cryptic
                    "Thru N: G (±P)" line dropped — the Leaderboard tab answers it. */}
                <div className="text-right">
                  {/* The pre-highlighted par is a suggestion, not a score: no Net until a tap lands. */}
                  {strokesGiven > 0 && <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-0.5">Net {currentScore ? netScore : '—'}</p>}
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
            // The per-hole reward moment — brass, and it flashes when the hole (and so
            // the outcome) changes. key={} re-triggers the animation; motion-safe
            // respects prefers-reduced-motion. (§7e)
            <div key={currentHole} className="bg-navy dark:bg-gray-800 border border-brass/40 rounded-2xl px-4 py-3 text-center shadow-sm motion-safe:animate-[brass-flash_0.45s_ease-out]">
              <p className="font-bold text-brass">{winner?.name} wins {hr.skinsInPlay} skin{hr.skinsInPlay !== 1 ? 's' : ''}</p>
            </div>
          )
        })()}

        {/* Wolf per-hole outcome — every completed hole states a result, including
            the "waiting on a pick" case, which keeps its scores (§5, Finding 4). */}
        {!showBatchEntry && game?.type === 'wolf' && wolfConfig && wolfResult && (
          <InlineErrorBoundary label="the Wolf result">
            <WolfHoleOutcome
              players={players}
              config={wolfConfig}
              result={wolfResult}
              holeScores={holeScores}
              holeNumber={currentHole}
            />
          </InlineErrorBoundary>
        )}

        {/* Next Hole / End Round — in scrollable content. BBB settles from points,
            so a missing-strokes nag would be noise there. */}
        {!showBatchEntry && !readOnly && game?.type !== 'bingo_bango_bongo' && (() => {
          // A pending score counts as entered; only a rejected one is still owed.
          const missingPlayers = missingScorePlayers(players, holeScores, currentHole)
          return missingPlayers.length > 0 ? (
            <p className="text-amber-600 text-xs font-medium text-center py-1.5 bg-amber-50 rounded-xl">
              Not all players have scores for this hole
            </p>
          ) : null
        })()}

        {/* Next Hole advances immediately (§4). Completing a hole auto-advances after
            a brief hold with an Undo, so this button is the manual fallback. */}
        {!showBatchEntry && (playableHoleNums.indexOf(currentHole) < playableHoleNums.length - 1 ? (
          <button onClick={() => {
            const nextIdx = playableHoleNums.indexOf(currentHole) + 1
            goToHole(playableHoleNums[nextIdx])
          }}
            className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl active:bg-gray-900 transition-colors shadow-lg">Next Hole →</button>
        ) : readOnly ? (
          <button onClick={onHome}
            className="w-full h-14 bg-gray-600 text-white text-lg font-bold rounded-2xl active:bg-gray-700 transition-colors shadow-lg">Back to Home</button>
        ) : round.status === 'complete' ? (
          <button onClick={onEndRound}
            className="w-full h-14 bg-yellow-500 text-white text-lg font-bold rounded-2xl active:bg-yellow-600 transition-colors shadow-lg">Settle Up →</button>
        ) : (
          <button onClick={confirmEndRound}
            className="w-full h-14 bg-yellow-500 text-white text-lg font-bold rounded-2xl active:bg-yellow-600 transition-colors shadow-lg">🏁 End Round & Settle Up</button>
        ))}
      </div>
      )} {/* end scoreTab === 'scores' */}

      {/* Invite toast */}
      {inviteToast && (
        <div className="fixed top-20 inset-x-0 z-50 flex justify-center pointer-events-none">
          <div className="bg-gray-800 text-white dark:bg-brass dark:text-navy px-4 py-2 rounded-xl shadow-lg text-sm font-semibold">
            {inviteToast}
          </div>
        </div>
      )}

      {/* Score status toast — footer, so it never overlaps the invite strip (§4/§8) */}
      {scoreToast && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
          <div className={`px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-3 ${
            scoreToast.type === 'success' ? 'bg-navy text-cream dark:bg-brass dark:text-navy' :
            scoreToast.type === 'error' ? 'bg-red-600 text-white' :
            'bg-navy text-cream'
          }`}>
            <span>{scoreToast.message}</span>
            {(scoreToast.undo || scoreToast.holeUndo != null) && (
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

      {/* The header menu's children — End Round dialog, Rules, QR — each inside a
          boundary so a thrown render shows a plain fallback, never a hang (Finding 3). */}
      <InlineErrorBoundary label="the confirmation">
        <ConfirmModal
          open={!!confirmModal}
          title={confirmModal?.title ?? ''}
          message={confirmModal?.message ?? ''}
          onConfirm={confirmModal?.onConfirm ?? (() => {})}
          onCancel={() => setConfirmModal(null)}
          destructive={confirmModal?.destructive}
        />
      </InlineErrorBoundary>

      {showRulesModal && game && (
        <InlineErrorBoundary label="the rules">
          <GameRulesModal
            gameType={game.type}
            onClose={() => setShowRulesModal(false)}
            teamsLine={game.type === 'best_ball' ? bestBallTeamsLabel(players, (game.config as BestBallConfig).teams ?? {}) : undefined}
          />
        </InlineErrorBoundary>
      )}

      {showQRModal && (() => {
        const qrCode = (event?.inviteCode) ?? round.inviteCode ?? ''
        const qrUrl = `${window.location.origin}${window.location.pathname}?join=${qrCode}`
        return (
          <InlineErrorBoundary label="the QR code">
            <InviteQRModal url={qrUrl} code={qrCode} eventName={event?.name} onClose={() => setShowQRModal(false)} />
          </InlineErrorBoundary>
        )
      })()}

      {showInviteModal && (
        <InvitePlayerModal
          roundId={roundId}
          currentUserId={userId}
          existingPlayerIds={players.map((p: any) => p.id)}
          startHole={currentHole}
          onClose={() => setShowInviteModal(false)}
          onInvited={name => {
            setInviteToast(`Invited ${name}`); setTimeout(() => setInviteToast(null), 3000)
            // Refresh so the newly-added player appears on the card immediately —
            // otherwise the host sees no change until a manual reload (UX M3).
            loadScorecardData()
          }}
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
          hasScore={holeScores.some(s => s.playerId === numberPadTarget.playerId && s.holeNumber === currentHole)}
          onSelect={v => setScore(numberPadTarget.playerId, v)}
          onClear={() => { void clearScore(numberPadTarget.playerId) }}
          onClose={() => setNumberPadTarget(null)}
        />
      )}
    </div>
  )
}
