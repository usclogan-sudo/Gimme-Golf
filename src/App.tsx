import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, rowToCourse, rowToRound, rowToHoleScore, fetchOrCreateProfile } from './lib/supabase'
import { useNotifications } from './hooks/useNotifications'
import { flush as flushOfflineQueue, getPending as getOfflinePending } from './lib/offlineQueue'
import { safeWrite } from './lib/safeWrite'
import { setSentryUser, clearSentryUser } from './lib/sentry'
import { checkAppVersion } from './lib/appVersion'
import { SHOW_PROP_BETS } from './lib/featureFlags'
import { NotificationToast } from './components/NotificationToast'
import { NotificationBadge } from './components/NotificationBadge'
import { Auth } from './components/Auth/Auth'
import { ResetPassword } from './components/Auth/ResetPassword'
import { FeedbackModal } from './components/FeedbackModal'
import { GuestBanner } from './components/GuestBanner/GuestBanner'
import { ConfirmModal } from './components/ConfirmModal'
import { UserAvatar } from './components/AvatarPicker'
import { InstallBanner } from './components/InstallBanner'
import { PendingInvites } from './components/PendingInvites'

// Lazy-loaded screens (not needed for initial Home render)
const JoinRound = lazy(() => import('./components/JoinRound/JoinRound').then(m => ({ default: m.JoinRound })))
const UpgradeAccount = lazy(() => import('./components/Auth/UpgradeAccount').then(m => ({ default: m.UpgradeAccount })))
const CourseCatalog = lazy(() => import('./components/CourseCatalog/CourseCatalog').then(m => ({ default: m.CourseCatalog })))
const CourseSetup = lazy(() => import('./components/CourseSetup/CourseSetup').then(m => ({ default: m.CourseSetup })))
const NewRound = lazy(() => import('./components/NewRound/NewRound').then(m => ({ default: m.NewRound })))
const Scorecard = lazy(() => import('./components/Scorecard/Scorecard').then(m => ({ default: m.Scorecard })))
const SettleUp = lazy(() => import('./components/SettleUp/SettleUp').then(m => ({ default: m.SettleUp })))
const RoundHistory = lazy(() => import('./components/RoundHistory/RoundHistory').then(m => ({ default: m.RoundHistory })))
const Settings = lazy(() => import('./components/Settings/Settings').then(m => ({ default: m.Settings })))
const Onboarding = lazy(() => import('./components/Onboarding/Onboarding').then(m => ({ default: m.Onboarding })))
const AdminDashboard = lazy(() => import('./components/Admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const Stats = lazy(() => import('./components/Stats/Stats').then(m => ({ default: m.Stats })))
const PlayerDirectory = lazy(() => import('./components/PlayerDirectory/PlayerDirectory').then(m => ({ default: m.PlayerDirectory })))
const HandicapDetail = lazy(() => import('./components/HandicapDetail/HandicapDetail').then(m => ({ default: m.HandicapDetail })))
const PersonalDashboard = lazy(() => import('./components/PersonalDashboard/PersonalDashboard').then(m => ({ default: m.PersonalDashboard })))
const TournamentList = lazy(() => import('./components/TournamentList/TournamentList').then(m => ({ default: m.TournamentList })))
const TournamentSetup = lazy(() => import('./components/TournamentSetup/TournamentSetup').then(m => ({ default: m.TournamentSetup })))
const TournamentDetail = lazy(() => import('./components/TournamentDetail/TournamentDetail').then(m => ({ default: m.TournamentDetail })))
const EventSetup = lazy(() => import('./components/EventSetup/EventSetup').then(m => ({ default: m.EventSetup })))
const EventLeaderboard = lazy(() => import('./components/EventLeaderboard/EventLeaderboard').then(m => ({ default: m.EventLeaderboard })))
const Ledger = lazy(() => import('./components/Ledger/Ledger').then(m => ({ default: m.Ledger })))
const LiveLeaderboard = lazy(() => import('./components/LiveLeaderboard/LiveLeaderboard').then(m => ({ default: m.LiveLeaderboard })))
const PropBetsScreen = lazy(() => import('./components/PropBets/PropBetsScreen').then(m => ({ default: m.PropBetsScreen })))
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import type { AppNotification, Course, Round, UserProfile, GameType, StakesMode } from './types'

type Screen = 'home' | 'course-catalog' | 'course-setup' | 'new-round' | 'scorecard' | 'settle-up' | 'round-history' | 'stats' | 'settings' | 'onboarding' | 'admin' | 'upgrade-account' | 'player-directory' | 'handicap-detail' | 'join-round' | 'tournament-list' | 'tournament-setup' | 'tournament-detail' | 'personal-dashboard' | 'event-setup' | 'event-leaderboard' | 'ledger' | 'spectate' | 'prop-bets'

const GAME_EMOJI: Record<GameType, string> = {
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

function totalPar(course: Course) {
  return course.holes.reduce((sum, h) => sum + h.par, 0)
}

function coursePhotoClass(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff
  return `course-photo-${(Math.abs(hash) % 5) + 1}`
}


function CourseCard({ course, onEdit, onDelete, stats }: { course: Course; onEdit: () => void; onDelete: () => void; stats?: { played: number; best: number | null; avg: number | null } }) {
  const par = totalPar(course)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <button onClick={onEdit} className="w-full text-left active:bg-gray-50 dark:active:bg-gray-700 transition-colors">
        <div className={`h-10 ${coursePhotoClass(course.name)} flex items-end px-4 pb-2`}>
          <span className="text-white/60 text-xs font-medium tracking-wider uppercase">Golf Course</span>
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100 font-display">{course.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Par {par} · {course.tees.length} tee{course.tees.length !== 1 ? 's' : ''} · {course.tees.map(t => t.name).join(', ')}
            </p>
            {stats && stats.played > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {stats.played} round{stats.played !== 1 ? 's' : ''}
                {stats.best != null && <span className="text-green-600 dark:text-green-400 font-semibold"> · Best {stats.best}</span>}
                {stats.avg != null && <> · Avg {stats.avg}</>}
              </p>
            )}
          </div>
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
      <div className="px-4 pb-3">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-xs text-red-400 hover:text-red-600 font-medium"
        >
          Remove course
        </button>
      </div>
    </div>
  )
}

function Home({
  userId,
  userProfile,
  onNewRound,
  onAddCourse,
  onResumeRound,
  onEditCourse,
  onDeleteCourse,
  onRoundHistory,
  onStats,
  onPlayers,
  onSettings,
  onSignOut,
  isAdmin,
  onAdmin,
  isAnonymous,
  onUpgrade,
  onEndRound,
  onViewRound,
  onViewProps,
  onJoinRound,
  notificationCount,
  onTournaments,
  onPersonalDashboard,
  onCreateEvent,
  onLedger,
  onPlayAgain,
}: {

  userId: string
  userProfile: UserProfile | null
  onNewRound: () => void
  onAddCourse: (courseName?: string) => void
  onResumeRound: (roundId: string) => void
  onEditCourse: (course: Course) => void
  onDeleteCourse: (courseId: string) => void
  onRoundHistory: () => void
  onStats: () => void
  onPlayers: () => void
  onSettings: () => void
  onSignOut: () => void
  isAdmin: boolean
  onAdmin: () => void
  isAnonymous?: boolean
  onUpgrade?: () => void
  onEndRound?: (roundId: string) => void
  onViewRound?: (roundId: string) => void
  onViewProps?: (roundId: string) => void
  notificationCount?: number
  onJoinRound: (code?: string) => void
  onTournaments: () => void
  onPersonalDashboard: () => void
  onCreateEvent: () => void
  onLedger: () => void
  onPlayAgain: (round: Round) => void
}) {
  const [courses, setCourses] = useState<Course[]>([])
  const [activeRounds, setActiveRounds] = useState<Round[]>([])
  const [participantRounds, setParticipantRounds] = useState<Round[]>([])
  const [roundCount, setRoundCount] = useState<number | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [unsettledCount, setUnsettledCount] = useState(0)
  const [unsettledAmounts, setUnsettledAmounts] = useState<{ youOwe: number; owedToYou: number }>({ youOwe: 0, owedToYou: 0 })
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showAnonBlock, setShowAnonBlock] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [betaDismissed, setBetaDismissed] = useState(() => localStorage.getItem('gimme_beta_dismissed') === '1')
  const [retryKey, setRetryKey] = useState(0)

  const guardAnon = (action: () => void) => {
    if (isAnonymous) { setShowAnonBlock(true); return }
    action()
  }
  const [personalSummary, setPersonalSummary] = useState<{
    totalRounds: number
    lastCourse: string
    lastDate: string
    lastScore: number | null
  } | null>(null)
  const [lastRoundObj, setLastRoundObj] = useState<Round | null>(null)
  const [courseStats, setCourseStats] = useState<Map<string, { played: number; best: number | null; totalGross: number; scoredRounds: number }>>(new Map())

  useEffect(() => {
    setFetchError(null)
    supabase.from('courses').select('*').eq('user_id', userId).neq('hidden', true).order('name').then(({ data, error }) => {
      if (error) { setFetchError('Failed to load data. Tap Retry to try again.'); return }
      if (data) setCourses(data.map(rowToCourse))
    })
    // Fetch participant rows first so all downstream queries scope to this user's rounds.
    supabase.from('round_participants').select('round_id, player_id').eq('user_id', userId).eq('status', 'accepted').then(async ({ data: partData }) => {
      const partRoundIds = (partData ?? []).map((p: any) => p.round_id)
      const myPlayerIds = new Set((partData ?? []).map((p: any) => p.player_id))
      myPlayerIds.add(userId)

      const [ownedRes, partRoundsRes] = await Promise.all([
        supabase.from('rounds').select('*').eq('status', 'active').eq('user_id', userId),
        partRoundIds.length > 0
          ? supabase.from('rounds').select('*').eq('status', 'active').in('id', partRoundIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ])

      if (ownedRes.error) { setFetchError('Failed to load data. Pull down to refresh.'); return }

      const ownedRows = ownedRes.data ?? []
      const partRows = (partRoundsRes.data ?? []) as any[]
      setActiveRounds(ownedRows.map(rowToRound))
      // Participant list excludes rounds the user owns (already in activeRounds).
      const ownedIds = new Set(ownedRows.map((r: any) => r.id))
      setParticipantRounds(partRows.filter(r => !ownedIds.has(r.id)).map(rowToRound))

      const allMyRoundIds = Array.from(new Set([...ownedRows.map((r: any) => r.id), ...partRoundIds]))

      // Settlements scoped to this user's rounds only.
      if (allMyRoundIds.length > 0) {
        const { data: setData } = await supabase
          .from('settlements')
          .select('round_id,amount_cents,from_player_id,to_player_id')
          .eq('status', 'owed')
          .in('round_id', allMyRoundIds)
        if (setData) {
          const uniqueRounds = new Set(setData.map((d: any) => d.round_id))
          setUnsettledCount(uniqueRounds.size)
          let youOwe = 0
          let owedToYou = 0
          for (const s of setData) {
            if (myPlayerIds.has(s.from_player_id)) youOwe += s.amount_cents
            if (myPlayerIds.has(s.to_player_id)) owedToYou += s.amount_cents
          }
          setUnsettledAmounts({ youOwe, owedToYou })
        }
      } else {
        setUnsettledCount(0)
        setUnsettledAmounts({ youOwe: 0, owedToYou: 0 })
      }
    })

    supabase.from('rounds').select('id', { count: 'exact', head: true }).eq('user_id', userId).then(({ count }) => {
      setRoundCount(count ?? 0)
    })

    // Personal summary — only fetch recent completed rounds, not all
    supabase.from('rounds').select('*').eq('status', 'complete').order('date', { ascending: false }).limit(50)
      .then(async (roundsRes) => {
        if (roundsRes.error || !roundsRes.data) return
        const completedRounds = roundsRes.data.map(rowToRound)

        // Find rounds where current user played
        const myRounds = completedRounds.filter(r =>
          r.players?.some(p => p.id === userId)
        )

        if (myRounds.length === 0) return

        const lastRound = myRounds[0]
        // Only fetch scores for the most recent round
        const { data: scoreRows } = await supabase.from('hole_scores').select('*').eq('round_id', lastRound.id)
        const lastScores = (scoreRows ?? []).map(rowToHoleScore).filter(s => s.playerId === userId)
        const lastScore = lastScores.length > 0 ? lastScores.reduce((sum, s) => sum + s.grossScore, 0) : null

        setPersonalSummary({
          totalRounds: myRounds.length,
          lastCourse: lastRound.courseSnapshot?.courseName ?? 'Unknown',
          lastDate: lastRound.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          lastScore,
        })
        setLastRoundObj(lastRound)

        // Compute per-course stats from completed rounds
        const cMap = new Map<string, { played: number; best: number | null; totalGross: number; scoredRounds: number }>()
        const myRoundIds = myRounds.map(r => r.id)
        if (myRoundIds.length > 0) {
          const { data: allScoreRows } = await supabase.from('hole_scores').select('round_id,player_id,gross_score').in('round_id', myRoundIds)
          const scoresByRound = new Map<string, number[]>()
          for (const s of (allScoreRows ?? [])) {
            if (s.player_id !== userId) continue
            const arr = scoresByRound.get(s.round_id) ?? []
            arr.push(s.gross_score)
            scoresByRound.set(s.round_id, arr)
          }
          for (const r of myRounds) {
            const cId = r.courseSnapshot?.courseId ?? r.courseId
            if (!cId) continue
            const entry = cMap.get(cId) ?? { played: 0, best: null, totalGross: 0, scoredRounds: 0 }
            entry.played++
            const scores = scoresByRound.get(r.id)
            if (scores && r.courseSnapshot && scores.length >= r.courseSnapshot.holes.length) {
              const gross = scores.reduce((a, b) => a + b, 0)
              entry.totalGross += gross
              entry.scoredRounds++
              if (entry.best === null || gross < entry.best) entry.best = gross
            }
            cMap.set(cId, entry)
          }
        }
        setCourseStats(cMap)
      })
  }, [userId, retryKey])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-8">
      <header className="app-header text-white px-4 pt-5 pb-4 sticky top-0 z-10 shadow-xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-800 tracking-tight leading-none">Gimme</h1>
            <p className="text-[#C2A24C] text-[11px] font-medium mt-0.5 tracking-wide">SIDE GAMES · SCORES · SETTLED</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && (
              <button
                onClick={onAdmin}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full hover:bg-gray-600 border border-gray-500 text-gray-300"
                aria-label="Admin"
              >
                <span className="text-base">🛡️</span>
              </button>
            )}
            <button onClick={onSettings} aria-label="Settings">
              <UserAvatar url={userProfile?.avatarUrl} preset={userProfile?.avatarPreset} name={userProfile?.displayName} size="sm" />
            </button>
            <button
              onClick={onSignOut}
              className="text-gray-300 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-gray-600 border border-gray-500"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pt-5 max-w-2xl mx-auto space-y-6">
        <InstallBanner />

        {!betaDismissed && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl px-4 py-3 flex items-center justify-between">
            <p className="text-blue-700 dark:text-blue-300 text-sm font-medium">Welcome to the Gimme beta! We're actively building and would love <a href="https://docs.google.com/forms/d/e/1FAIpQLScC3xN8rQcoCBHSPQAG8k1tqiwoB1pz3IFytV2Mvmlikr9w4Q/viewform" target="_blank" rel="noopener noreferrer" className="underline">your feedback</a>.</p>
            <button onClick={() => { setBetaDismissed(true); localStorage.setItem('gimme_beta_dismissed', '1') }} className="text-blue-400 text-lg leading-none ml-2">&times;</button>
          </div>
        )}

        {fetchError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
            <p className="text-red-700 dark:text-red-400 text-sm font-medium flex-1">{fetchError}</p>
            <button onClick={() => { setFetchError(null); setRetryKey(k => k + 1) }} className="text-red-700 dark:text-red-400 text-sm font-bold px-3 py-1 rounded-lg active:bg-red-100 dark:active:bg-red-900/40 flex-shrink-0">Retry</button>
            <button onClick={() => setFetchError(null)} className="text-red-400 text-lg leading-none ml-1 flex-shrink-0">&times;</button>
          </div>
        )}

        {isAnonymous && onUpgrade && (
          <GuestBanner onUpgrade={onUpgrade} />
        )}

        {/* Primary CTA: Start New Round. Guests can play a real round (it persists
            under their anonymous session and upgrades in place when they create an
            account) — otherwise "Try it first" is a dead-end. The GuestBanner above
            nudges the upgrade. Events/Tournaments stay account-gated (they hinge on
            inviting others). */}
        <button onClick={onNewRound}
          className="w-full rounded-2xl shadow-lg overflow-hidden active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)' }}>
          <div className="px-6 py-5 flex items-center justify-between">
            <div className="text-left">
              <p className="font-display font-bold text-white text-xl">Start New Round</p>
              <p className="text-gray-300 text-sm mt-0.5">Skins · Best Ball · Nassau · Wolf · BBB</p>
            </div>
            <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center text-4xl border border-white/20">▶</div>
          </div>
        </button>

        <button onClick={() => guardAnon(onCreateEvent)}
          className="w-full rounded-2xl shadow-lg overflow-hidden active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e40af 100%)' }}>
          <div className="px-6 py-5 flex items-center justify-between">
            <div className="text-left">
              <p className="font-display font-bold text-white text-xl">Create Event</p>
              <p className="text-blue-200 text-sm mt-0.5">Multi-group outing · Players self-score</p>
            </div>
            <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center text-3xl border border-white/20">🏌️</div>
          </div>
        </button>

        {unsettledCount > 0 && (
          <button
            onClick={onLedger}
            className="w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-left active:bg-amber-100 transition-colors"
          >
            <p className="text-amber-800 text-sm font-semibold">
              {unsettledAmounts.youOwe > 0
                ? `You owe $${(unsettledAmounts.youOwe / 100).toFixed(2)} across ${unsettledCount} round${unsettledCount !== 1 ? 's' : ''}`
                : unsettledAmounts.owedToYou > 0
                ? `$${(unsettledAmounts.owedToYou / 100).toFixed(2)} owed to you across ${unsettledCount} round${unsettledCount !== 1 ? 's' : ''}`
                : `${unsettledCount} round${unsettledCount !== 1 ? 's' : ''} ha${unsettledCount !== 1 ? 've' : 's'} unsettled payouts`
              }
            </p>
            <p className="text-amber-600 text-xs mt-0.5">Tap to view Ledger →</p>
          </button>
        )}

        {!personalSummary && roundCount === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 px-5 py-5 space-y-4">
            <div className="text-center">
              <p className="text-3xl mb-1">⛳</p>
              <p className="font-display font-bold text-gray-800 dark:text-gray-100 text-lg">Welcome to Gimme!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Get started in 3 easy steps</p>
            </div>
            <div className="space-y-2">
              <button onClick={() => onAddCourse()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 text-left active:bg-gray-100 dark:active:bg-gray-600 transition-colors">
                <span className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Add a course</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Set up holes, pars, and tees</p>
                </div>
              </button>
              <button onClick={onSettings} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 text-left active:bg-gray-100 dark:active:bg-gray-600 transition-colors">
                <span className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Set up your profile</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Name, handicap, and payment info</p>
                </div>
              </button>
              <button onClick={onNewRound} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 text-left active:bg-gray-100 dark:active:bg-gray-600 transition-colors">
                <span className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Start a round</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pick a game and hit the links</p>
                </div>
              </button>
            </div>
          </div>
        )}

        <PendingInvites userId={userId} onAccepted={onResumeRound} />

        {activeRounds.length > 0 && (
          <section className="space-y-3">
            {activeRounds.map(round => (
              <div key={round.id} className="rounded-2xl overflow-hidden shadow-lg">
                <button onClick={() => onResumeRound(round.id)}
                  className="w-full active:scale-[0.98] transition-transform">
                  <div className="bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <p className="font-display font-bold text-amber-950 text-lg leading-tight">Round in Progress</p>
                        <p className="text-amber-800 text-sm mt-0.5">{round.courseSnapshot?.courseName ?? 'Unknown course'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display font-bold text-amber-950 text-2xl">&#9971; {round.currentHole}</p>
                        <p className="text-amber-800 text-xs">Hole</p>
                      </div>
                    </div>
                    <div className="mt-3 bg-amber-950/20 rounded-xl px-4 py-2 flex items-center justify-between">
                      <span className="text-amber-900 text-sm font-semibold">
                        {round.players?.length ?? 0} players · {round.game?.type ? (GAME_EMOJI[round.game.type] ?? round.game.type) : 'Unknown'}
                        {round.game?.stakesMode === 'high_roller' && ' 💎'}
                      </span>
                      <span className="text-amber-900 text-sm font-bold">Tap to Resume &rarr;</span>
                    </div>
                  </div>
                </button>
                <div className="bg-amber-100 px-5 py-2 flex justify-between">
                  {SHOW_PROP_BETS ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onViewProps?.(round.id) }}
                      className="text-purple-600 text-sm font-semibold hover:text-purple-800 transition-colors"
                    >
                      Props
                    </button>
                  ) : (
                    <span />
                  )}
                  {onEndRound && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEndRound(round.id) }}
                      className="text-red-600 text-sm font-semibold hover:text-red-800 transition-colors"
                    >
                      End Round
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Participant rounds — rounds you're playing in but someone else is scoring */}
        {participantRounds.length > 0 && onViewRound && (
          <section className="space-y-3">
            <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base">Your Active Games</h2>
            {participantRounds.map(round => (
              <button
                key={round.id}
                onClick={() => onViewRound(round.id)}
                className="w-full rounded-2xl overflow-hidden shadow-md active:scale-[0.98] transition-transform"
              >
                <div className="bg-gradient-to-r from-blue-500 to-cyan-400 px-5 py-4">
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <p className="font-display font-bold text-blue-950 text-lg leading-tight">Live Scoreboard</p>
                      <p className="text-blue-800 text-sm mt-0.5">{round.courseSnapshot?.courseName ?? 'Unknown course'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-blue-950 text-2xl">&#9971; {round.currentHole}</p>
                      <p className="text-blue-800 text-xs">Hole</p>
                    </div>
                  </div>
                  <div className="mt-3 bg-blue-950/20 rounded-xl px-4 py-2 flex items-center justify-between">
                    <span className="text-blue-900 text-sm font-semibold">
                      {round.players?.length ?? 0} players · {round.game?.type ? (GAME_EMOJI[round.game.type] ?? round.game.type) : 'Unknown'}
                    </span>
                    <span className="text-blue-900 text-sm font-bold">Tap to Watch &rarr;</span>
                  </div>
                </div>
              </button>
            ))}
          </section>
        )}

        {/* Join Round */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
          <p className="font-display font-semibold text-gray-800 dark:text-gray-100 text-sm mb-2">Join a Round</p>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              placeholder="Enter code"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && joinCode.length === 6 && onJoinRound(joinCode)}
              className="flex-1 h-11 px-3 text-center font-mono font-bold tracking-widest rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase"
            />
            <button
              onClick={() => onJoinRound(joinCode)}
              disabled={joinCode.length !== 6}
              className="h-11 px-5 bg-gray-800 text-white font-bold rounded-xl text-sm disabled:opacity-40 active:bg-gray-900 transition-colors"
            >
              Join
            </button>
          </div>
        </div>

        {/* Play Again — below the fold for repeat players */}
        {lastRoundObj?.courseSnapshot && onPlayAgain && (
          <button
            onClick={() => onPlayAgain(lastRoundObj)}
            className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 px-4 py-3 text-left active:bg-gray-50 dark:active:bg-gray-700 transition-colors flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔄</span>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Play Again</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{lastRoundObj.courseSnapshot.courseName} · {lastRoundObj.players?.length ?? 0} players</p>
              </div>
            </div>
            <span className="text-xs text-amber-600 font-semibold">Go →</span>
          </button>
        )}

        {/* More — secondary navigation (was in header) */}
        <section>
          <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">More</h2>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={onPersonalDashboard} className={`flex flex-col items-center justify-center min-h-[68px] rounded-2xl border shadow-sm transition-colors ${(roundCount ?? 0) > 0 ? 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 active:bg-gray-50 dark:active:bg-gray-700' : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700 text-gray-400'}`}>
              <span className="text-xl">📈</span>
              <span className="text-xs font-semibold mt-0.5">My Stats</span>
            </button>
            {(roundCount ?? 0) > 0 && (
              <>
                <button onClick={onRoundHistory} className="flex flex-col items-center justify-center min-h-[68px] rounded-2xl border bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 active:bg-gray-50 dark:active:bg-gray-700 shadow-sm transition-colors relative">
                  <span className="text-xl">📋</span>
                  <span className="text-xs font-semibold mt-0.5">History</span>
                  {(notificationCount ?? 0) > 0 && <span className="absolute top-1 right-1"><NotificationBadge count={notificationCount!} /></span>}
                </button>
                <button onClick={onStats} className="flex flex-col items-center justify-center min-h-[68px] rounded-2xl border bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 active:bg-gray-50 dark:active:bg-gray-700 shadow-sm transition-colors">
                  <span className="text-xl">📊</span>
                  <span className="text-xs font-semibold mt-0.5">Leaderboard</span>
                </button>
                <button onClick={onLedger} className="flex flex-col items-center justify-center min-h-[68px] rounded-2xl border bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 active:bg-gray-50 dark:active:bg-gray-700 shadow-sm transition-colors">
                  <span className="text-xl">💰</span>
                  <span className="text-xs font-semibold mt-0.5">Ledger</span>
                </button>
                <button onClick={onPlayers} className="flex flex-col items-center justify-center min-h-[68px] rounded-2xl border bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 active:bg-gray-50 dark:active:bg-gray-700 shadow-sm transition-colors">
                  <span className="text-xl">🏌️</span>
                  <span className="text-xs font-semibold mt-0.5">Players</span>
                </button>
                <button onClick={() => guardAnon(onTournaments)} className="flex flex-col items-center justify-center min-h-[68px] rounded-2xl border bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 active:bg-gray-50 dark:active:bg-gray-700 shadow-sm transition-colors">
                  <span className="text-xl">🏆</span>
                  <span className="text-xs font-semibold mt-0.5">Tournaments</span>
                </button>
              </>
            )}
          </div>
        </section>

        {userProfile?.displayName && (
          <section>
            <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base mb-3">Your Profile</h2>
            <button
              onClick={onSettings}
              className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 text-left flex items-center gap-3 active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
            >
              <UserAvatar url={userProfile.avatarUrl} preset={userProfile.avatarPreset} name={userProfile.displayName} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{userProfile.displayName}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">HCP {userProfile.handicapIndex ?? '—'}</p>
              </div>
              <span className="text-xs text-amber-600 font-semibold">Edit</span>
            </button>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-gray-800 dark:text-gray-100 text-base">
              Your Courses
              {courses.length > 0 && <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{courses.length}</span>}
            </h2>
            <button onClick={() => onAddCourse()} className="text-amber-600 text-sm font-semibold flex items-center gap-1">
              <span className="text-lg leading-none">+</span> Add
            </button>
          </div>
          {courses.length === 0 && (
            <button onClick={() => onAddCourse()} className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl py-8 text-center active:bg-gray-50 dark:active:bg-gray-800">
              <p className="text-3xl mb-2">🏌️</p>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Add your first course</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Holes, pars, slope & rating</p>
            </button>
          )}
          {courses.length > 0 && (
            <div className="space-y-3">
              {courses.map(course => {
                const cs = courseStats.get(course.id)
                return (
                  <CourseCard
                    key={course.id}
                    course={course}
                    onEdit={() => onEditCourse(course)}
                    onDelete={() => onDeleteCourse(course.id)}
                    stats={cs ? { played: cs.played, best: cs.best, avg: cs.scoredRounds > 0 ? Math.round(cs.totalGross / cs.scoredRounds) : null } : undefined}
                  />
                )
              })}
            </div>
          )}
        </section>

        {/* Send Feedback — at the bottom */}
        <button
          onClick={() => setFeedbackOpen(true)}
          className="block w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 text-left active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">✉️</span>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Send Feedback</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Help us improve the beta</p>
            </div>
          </div>
        </button>

        <p className="text-center text-xs text-gray-400 pb-8">Gimme Golf · Beta</p>
      </main>

      {showAnonBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4 text-center">
            <p className="text-3xl">🔒</p>
            <h3 className="font-display font-bold text-lg text-gray-900 dark:text-gray-100">Account Required</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Create a free account to start rounds, events, and tournaments. Your guest data will be preserved.</p>
            <div className="space-y-2">
              {onUpgrade && (
                <button onClick={() => { setShowAnonBlock(false); onUpgrade() }} className="w-full h-12 bg-gray-800 dark:bg-white text-white dark:text-gray-800 font-bold rounded-xl">
                  Create Account
                </button>
              )}
              <button onClick={() => setShowAnonBlock(false)} className="w-full h-10 text-gray-500 text-sm font-medium">
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackOpen && (
        <FeedbackModal
          userId={isAnonymous ? null : userId}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Becomes true once we've ever held a session this tab — used to distinguish
  // "first visit" from "session expired mid-use" so the Auth screen can show
  // an appropriate banner.
  const hasEverHadSessionRef = useRef(false)
  const [screen, setScreen] = useState<Screen>('home')
  const [afterCourseSetup, setAfterCourseSetup] = useState<Screen>('home')
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null)
  const [newRoundStakesMode, setNewRoundStakesMode] = useState<StakesMode>('points')
  const [editingCourse, setEditingCourse] = useState<Course | undefined>(undefined)
  const [homeKey, setHomeKey] = useState(0)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)
  const [playAgainRound, setPlayAgainRound] = useState<Round | null>(null)
  const [newCourseName, setNewCourseName] = useState('')
  const [scorecardReadOnly, setScorecardReadOnly] = useState(false)
  const [appConfirmModal, setAppConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; destructive?: boolean } | null>(null)
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [spectateCode, setSpectateCode] = useState<string | null>(null)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const { unreadCount: notificationCount, latestToast, dismissToast, markRead } = useNotifications(session?.user?.id ?? null)

  // Derived early so hooks can safely reference it in dependency arrays
  // Empty string is a typesafe sentinel — all consumers below are gated behind
  // an explicit `if (!session)` early return, so this value is only `''` for
  // unreachable code paths.
  const userId: string = session?.user?.id ?? ''

  const handleToastAction = useCallback(async (n: AppNotification) => {
    if (n.type === 'round_invite' && n.inviteCode) {
      dismissToast()
      markRead(n.id)
      // Try auto-join: registered users' player IDs are their auth UUIDs
      if (userId && n.roundId) {
        try {
          const { error } = await supabase.rpc('join_round', {
            p_invite_code: n.inviteCode,
            p_player_id: userId,
          })
          if (!error) {
            setActiveRoundId(n.roundId)
            setScreen('scorecard')
            return
          }
        } catch {
          // Fall through to manual join
        }
      }
      // Fallback: open JoinRound wizard
      setPendingJoinCode(n.inviteCode)
      setScreen('join-round')
    }
  }, [dismissToast, markRead, userId])

  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(() => {
    // Check sessionStorage first (survives auth redirect)
    const stored = sessionStorage.getItem('pendingJoinCode')
    if (stored) return stored
    // Check URL param
    const params = new URLSearchParams(window.location.search)
    // Handle ?spectate=CODE
    const spectateParam = params.get('spectate')
    if (spectateParam) {
      window.history.replaceState({}, '', window.location.pathname)
      // Will be picked up by the effect below
      setTimeout(() => setSpectateCode(spectateParam), 0)
      return null
    }
    const joinCode = params.get('join')
    if (joinCode) {
      sessionStorage.setItem('pendingJoinCode', joinCode)
      window.history.replaceState({}, '', window.location.pathname)
      return joinCode
    }
    return null
  })

  // Flush offline queue on app mount if online and items are pending
  useEffect(() => {
    if (navigator.onLine && getOfflinePending() > 0) {
      flushOfflineQueue()
    }
  }, [])

  useEffect(() => {
    // Set up auth listener FIRST so it catches events from code exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) hasEverHadSessionRef.current = true
      setSession(session)
      if (session?.user) {
        setSentryUser(session.user.id, session.user.is_anonymous === true)
      } else {
        clearSentryUser()
      }
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true)
      }
    })

    // Fire-and-forget compatibility check. Web no-ops; native will gate the UI.
    checkAppVersion()

    // Handle PKCE code exchange from email links (password reset, signup confirm)
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (!error && data.session) {
          // onAuthStateChange should fire PASSWORD_RECOVERY, but as a fallback:
          setSession(data.session)
          setShowResetPassword(true)
          window.history.replaceState(null, '', window.location.pathname)
        }
      })
    } else {
      // Normal session load (no code in URL)
      // Also handle implicit flow recovery tokens in hash as fallback
      const hash = window.location.hash
      if (hash.includes('type=recovery')) {
        const params = new URLSearchParams(hash.substring(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        if (accessToken && refreshToken) {
          supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ data, error }) => {
            if (!error && data.session) {
              setSession(data.session)
              setShowResetPassword(true)
              window.history.replaceState(null, '', window.location.pathname)
            }
          })
          return () => subscription.unsubscribe()
        }
      }
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session)
      })
    }
    return () => subscription.unsubscribe()
  }, [])

  // Load user profile after session is established
  useEffect(() => {
    if (!session) {
      setUserProfile(null)
      setProfileLoading(false)
      return
    }
    setProfileLoading(true)
    setProfileError(false)
    fetchOrCreateProfile(session.user.id).then(async profile => {
      // Auto-complete onboarding for anonymous guests — skip straight to app
      if (session.user.is_anonymous && profile && !profile.onboardingComplete) {
        await supabase.from('user_profiles').update({ onboarding_complete: true }).eq('user_id', session.user.id)
        profile = { ...profile, onboardingComplete: true }
      }
      setUserProfile(profile)
      // Admin-only accounts skip straight to admin dashboard
      if (profile.adminOnly) {
        setScreen('admin')
      }
      setProfileLoading(false)
    }).catch(() => {
      setProfileError(true)
      setProfileLoading(false)
    })
  }, [session])

  // Auto-navigate to join-round when pending invite code exists
  useEffect(() => {
    if (pendingJoinCode && userProfile?.onboardingComplete && screen === 'home') {
      setScreen('join-round')
    }
  }, [pendingJoinCode, userProfile?.onboardingComplete])

  // Browser back button support: push state on screen change, listen for popstate
  const userProfileRef = useRef(userProfile)
  userProfileRef.current = userProfile
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const s = e.state?.screen as Screen | undefined
      if (s) {
        setScreen(s)
      } else {
        setHomeKey(k => k + 1)
        setScreen(userProfileRef.current?.adminOnly ? 'admin' : 'home')
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    // Don't push duplicate entries for 'home' on initial load
    const currentState = window.history.state?.screen
    if (screen !== currentState) {
      if (screen === 'home') {
        window.history.replaceState({ screen }, '', window.location.pathname)
      } else {
        window.history.pushState({ screen }, '', window.location.pathname)
      }
    }
  }, [screen])

  // Spectate mode — no auth required (read-only leaderboard)
  if (spectateCode) {
    return (
      <RouteErrorBoundary onReset={() => { setSpectateCode(null); window.location.reload() }} screenLabel="spectate">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full" /></div>}>
          <LiveLeaderboard inviteCode={spectateCode} onBack={() => { setSpectateCode(null); window.location.reload() }} />
        </Suspense>
      </RouteErrorBoundary>
    )
  }

  // Still checking auth state
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Password reset flow (from email link)
  if (showResetPassword) {
    return <ResetPassword onDone={() => setShowResetPassword(false)} />
  }

  // Not signed in
  if (session === null) {
    return <Auth inviteCode={pendingJoinCode ?? undefined} sessionExpired={hasEverHadSessionRef.current} />
  }

  // Loading profile
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-red-500 font-semibold text-lg">Failed to load profile</p>
        <p className="text-gray-500 text-sm text-center">Check your connection and try again.</p>
        <button onClick={() => { setProfileLoading(true); setProfileError(false); fetchOrCreateProfile(session.user.id).then(p => { setUserProfile(p); setProfileLoading(false) }).catch(() => { setProfileError(true); setProfileLoading(false) }) }} className="px-6 py-3 bg-amber-500 text-white font-bold rounded-xl active:bg-amber-600">Retry</button>
      </div>
    )
  }

  // userId already derived above (before hooks); safe to assert non-null here after early returns
  const isAnonymous = session.user.is_anonymous ?? false

  // Onboarding gate (admin-only accounts and invited users skip onboarding)
  if (userProfile && !userProfile.onboardingComplete && !userProfile.adminOnly) {
    // If user has a pending invite, skip onboarding — let them join the round first
    if (pendingJoinCode) {
      safeWrite(supabase.from('user_profiles').update({ onboarding_complete: true }).eq('user_id', userId), 'skip onboarding')
      setUserProfile(prev => prev ? { ...prev, onboardingComplete: true } : prev)
    } else {
      return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full" /></div>}>
          <Onboarding
            userId={userId}
            onComplete={() => setUserProfile(prev => prev ? { ...prev, onboardingComplete: true } : prev)}
          />
        </Suspense>
      )
    }
  }

  const goHome = () => {
    setHomeKey(k => k + 1)
    setScreen(userProfile?.adminOnly ? 'admin' : 'home')
  }

  // Loading fallback for lazy-loaded screens
  const screenFallback = (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
    </div>
  )

  // Screen routing — each lazy-loaded screen wrapped in Suspense
  const screenContent =
    screen === 'course-catalog' ? (
      <CourseCatalog
        userId={userId}
        onDone={goHome}
        onAddCustom={() => setScreen('course-setup')}
        onPrefillCourse={(course) => { setEditingCourse(course); setScreen('course-setup') }}
      />
    ) : screen === 'course-setup' ? (
      <CourseSetup
        userId={userId}
        course={editingCourse}
        initialName={newCourseName}
        onSave={() => { setEditingCourse(undefined); setNewCourseName(''); if (afterCourseSetup === 'new-round') { setScreen('new-round') } else { goHome() } }}
        onCancel={() => { setEditingCourse(undefined); setNewCourseName(''); setScreen(afterCourseSetup === 'new-round' ? 'new-round' : 'course-catalog') }}
      />
    ) : screen === 'new-round' ? (
      <NewRound
        userId={userId}
        onStart={roundId => { setActiveRoundId(roundId); setPlayAgainRound(null); setScreen('scorecard') }}
        onCancel={() => { setPlayAgainRound(null); goHome() }}
        onAddCourse={() => { setAfterCourseSetup('new-round'); setScreen('course-catalog') }}
        initialStakesMode={newRoundStakesMode}
        templateRound={playAgainRound}
      />
    ) : screen === 'join-round' ? (
      <JoinRound
        userId={userId}
        initialCode={pendingJoinCode ?? undefined}
        onJoined={(roundId) => {
          setPendingJoinCode(null)
          sessionStorage.removeItem('pendingJoinCode')
          setActiveRoundId(roundId)
          setScorecardReadOnly(false)
          setScreen('scorecard')
        }}
        onCancel={() => {
          setPendingJoinCode(null)
          sessionStorage.removeItem('pendingJoinCode')
          goHome()
        }}
      />
    ) : screen === 'scorecard' && activeRoundId ? (
      <Scorecard userId={userId} roundId={activeRoundId} onEndRound={() => setScreen('settle-up')} onHome={() => { setScorecardReadOnly(false); goHome() }} readOnly={scorecardReadOnly} />
    ) : screen === 'settle-up' && activeRoundId ? (
      <SettleUp
        roundId={activeRoundId}
        userId={userId}
        onDone={() => { setActiveRoundId(null); goHome() }}
        onContinue={() => setScreen('scorecard')}
      />
    ) : screen === 'round-history' ? (
      <RoundHistory userId={userId} onBack={goHome} onViewSettlements={(id) => { setActiveRoundId(id); setScreen('settle-up') }} onPlayAgain={(round) => { setPlayAgainRound(round); setScreen('new-round') }} />
    ) : screen === 'stats' ? (
      <Stats userId={userId} onBack={goHome} />
    ) : screen === 'player-directory' ? (
      <PlayerDirectory userId={userId} onBack={goHome} />
    ) : screen === 'handicap-detail' ? (
      <HandicapDetail userId={userId} userProfile={userProfile} onBack={goHome} />
    ) : screen === 'personal-dashboard' ? (
      <PersonalDashboard userId={userId} onBack={goHome} />
    ) : screen === 'upgrade-account' ? (
      <UpgradeAccount
        onComplete={goHome}
        onCancel={goHome}
      />
    ) : screen === 'settings' ? (
      <Settings
        userId={userId}
        email={session.user.email ?? ''}
        onBack={() => {
          fetchOrCreateProfile(userId).then(p => setUserProfile(p))
          goHome()
        }}
        onSignOut={() => supabase.auth.signOut()}
        isAdmin={userProfile?.isAdmin}
        onAdmin={() => setScreen('admin')}
        isAnonymous={isAnonymous}
        onUpgrade={() => setScreen('upgrade-account')}
        adminOnly={userProfile?.adminOnly}
      />
    ) : screen === 'admin' && userProfile?.isAdmin ? (
      <AdminDashboard
        userId={userId}
        onBack={goHome}
        isHome={userProfile.adminOnly}
        onSettings={userProfile.adminOnly ? () => setScreen('settings') : undefined}
        onLogout={userProfile.adminOnly ? () => supabase.auth.signOut() : undefined}
      />
    ) : screen === 'tournament-list' ? (
      <TournamentList
        userId={userId}
        onBack={goHome}
        onViewTournament={(id) => { setActiveTournamentId(id); setScreen('tournament-detail') }}
        onNewTournament={() => setScreen('tournament-setup')}
      />
    ) : screen === 'tournament-setup' ? (
      <TournamentSetup
        userId={userId}
        onCreated={(id) => { setActiveTournamentId(id); setScreen('tournament-detail') }}
        onCancel={() => setScreen('tournament-list')}
      />
    ) : screen === 'tournament-detail' && activeTournamentId ? (
      <TournamentDetail
        userId={userId}
        tournamentId={activeTournamentId}
        onBack={() => setScreen('tournament-list')}
        onStartRound={() => {
          setScreen('tournament-list')
        }}
      />
    ) : screen === 'event-setup' ? (
      <EventSetup
        userId={userId}
        onStart={(roundId, eventId) => {
          setActiveRoundId(roundId)
          setActiveEventId(eventId)
          setScorecardReadOnly(false)
          setScreen('scorecard')
        }}
        onCancel={goHome}
        onAddCourse={() => { setAfterCourseSetup('home'); setScreen('course-catalog') }}
      />
    ) : screen === 'event-leaderboard' && activeEventId ? (
      <EventLeaderboard
        userId={userId}
        eventId={activeEventId}
        onBack={() => {
          if (activeRoundId) setScreen('scorecard')
          else goHome()
        }}
      />
    ) : screen === 'ledger' ? (
      <Ledger userId={userId} onBack={goHome} />
    ) : screen === 'prop-bets' && activeRoundId && SHOW_PROP_BETS ? (
      // Gated by SHOW_PROP_BETS — when false, this branch is skipped, screenContent
      // falls through to null, and the user lands on the home screen. So even a stale
      // 'prop-bets' state (bookmarked URL, legacy callback) routes safely to home
      // rather than rendering a hidden surface.
      <PropBetsScreen
        roundId={activeRoundId}
        userId={userId}
        onBack={() => {
          if (activeRoundId) setScreen('scorecard')
          else goHome()
        }}
      />
    ) : null

  if (screenContent) {
    return (
      <RouteErrorBoundary onReset={goHome} screenLabel={screen}>
        <Suspense fallback={screenFallback}>{screenContent}</Suspense>
      </RouteErrorBoundary>
    )
  }
  const handleDeleteCourse = (courseId: string) => {
    setAppConfirmModal({
      title: 'Remove Course?',
      message: 'Remove this course from your list?',
      destructive: true,
      onConfirm: async () => {
        setAppConfirmModal(null)
        await safeWrite(supabase.from('courses').update({ hidden: true }).eq('id', courseId), 'hide course')
        setHomeKey(k => k + 1)
      },
    })
  }

  const handleEndRound = async (roundId: string) => {
    const [hsRes, roundRes] = await Promise.all([
      supabase.from('hole_scores').select('player_id, hole_number').eq('round_id', roundId),
      supabase.from('rounds').select('players, course_snapshot, treasurer_player_id, game').eq('id', roundId).single(),
    ])
    const playerCount = (roundRes.data?.players as any[])?.length ?? 0
    const totalHoles = (roundRes.data?.course_snapshot as any)?.holes?.length ?? 18
    const hasTreasurer = !!(roundRes.data?.treasurer_player_id)
    const buyInCents = (roundRes.data?.game as any)?.buyInCents ?? 0
    const scores = hsRes.data ?? []
    const holesComplete = Array.from({ length: totalHoles }, (_, i) => i + 1)
      .filter(n => {
        const scoredPlayers = new Set(scores.filter((s: any) => s.hole_number === n).map((s: any) => s.player_id))
        return scoredPlayers.size >= playerCount
      }).length
    const missing = totalHoles - holesComplete
    const hasSettlements = hasTreasurer && buyInCents > 0
    const msg = missing > 0
      ? `${holesComplete} of ${totalHoles} holes scored (${missing} incomplete).${hasSettlements ? ' You can view results in Settle Up.' : ''}`
      : `All ${totalHoles} holes scored.${hasSettlements ? ' View results in Settle Up.' : ''}`
    setAppConfirmModal({
      title: 'End Round?',
      message: msg,
      onConfirm: async () => {
        setAppConfirmModal(null)
        const { error } = await supabase.from('rounds').update({ status: 'complete' }).eq('id', roundId)
        if (error) {
          setAppConfirmModal({ title: 'Error', message: 'Failed to end round. Check your connection and try again.' , onConfirm: () => setAppConfirmModal(null) })
          return
        }
        setActiveRoundId(roundId)
        if (hasSettlements) {
          setScreen('settle-up')
        } else {
          goHome()
        }
      },
    })
  }

  return (
    <>
    <Home
      key={homeKey}
      userId={userId}
      userProfile={userProfile}
      onNewRound={() => { setNewRoundStakesMode('points'); setScreen('new-round') }}
      onAddCourse={(courseName) => {
        setAfterCourseSetup('home')
        if (courseName) {
          setNewCourseName(courseName)
          setScreen('course-setup')
        } else {
          setScreen('course-catalog')
        }
      }}
      onEditCourse={(course: Course) => { setEditingCourse(course); setScreen('course-setup') }}
      onDeleteCourse={handleDeleteCourse}
      onResumeRound={roundId => { setScorecardReadOnly(false); setActiveRoundId(roundId); setScreen('scorecard') }}
      onRoundHistory={() => setScreen('round-history')}
      onStats={() => setScreen('stats')}
      onPlayers={() => setScreen('player-directory')}
      onSettings={() => setScreen('settings')}
      onSignOut={() => supabase.auth.signOut()}
      isAdmin={userProfile?.isAdmin ?? false}
      onAdmin={() => setScreen('admin')}
      isAnonymous={isAnonymous}
      onUpgrade={() => setScreen('upgrade-account')}
      onEndRound={handleEndRound}
      onViewRound={roundId => { setScorecardReadOnly(false); setActiveRoundId(roundId); setScreen('scorecard') }}
      onViewProps={roundId => { setActiveRoundId(roundId); setScreen('prop-bets') }}
      onJoinRound={(code) => {
        if (code) setPendingJoinCode(code)
        setScreen('join-round')
      }}
      notificationCount={notificationCount}
      onTournaments={() => setScreen('tournament-list')}
      onPersonalDashboard={() => setScreen('personal-dashboard')}
      onCreateEvent={() => setScreen('event-setup')}
      onLedger={() => setScreen('ledger')}
      onPlayAgain={(round) => { setPlayAgainRound(round); setNewRoundStakesMode(round.game?.stakesMode ?? 'points'); setScreen('new-round') }}
    />
    {appConfirmModal && (
      <ConfirmModal
        open={true}
        title={appConfirmModal.title}
        message={appConfirmModal.message}
        onConfirm={appConfirmModal.onConfirm}
        onCancel={() => setAppConfirmModal(null)}
        destructive={appConfirmModal.destructive}
      />
    )}
    {latestToast && <NotificationToast notification={latestToast} onDismiss={dismissToast} onAction={handleToastAction} />}
    </>
  )
}
