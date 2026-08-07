// ─── Course ───────────────────────────────────────────────────────────────────

export interface Course {
  id: string
  name: string
  tees: Tee[]
  holes: Hole[]
  createdAt: Date
}

export interface Tee {
  name: string
  rating: number  // e.g. 72.1
  slope: number   // e.g. 128
}

export interface Hole {
  number: number                    // 1–18
  par: number                       // 3, 4, or 5
  strokeIndex: number               // 1–18 (handicap allocation; 1 = hardest)
  yardages: Record<string, number>  // keyed by tee name
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface Player {
  id: string
  name: string
  ghinNumber: string
  handicapIndex: number   // e.g. 12.4
  tee: string             // default tee color
  isPublic?: boolean
  venmoUsername?: string
  zelleIdentifier?: string
  cashAppUsername?: string
  paypalEmail?: string
  createdAt?: Date
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  userId: string
  isAdmin: boolean
  adminOnly: boolean
  onboardingComplete: boolean
  displayName?: string
  handicapIndex?: number
  tee: string
  venmoUsername?: string
  zelleIdentifier?: string
  cashAppUsername?: string
  paypalEmail?: string
  preferredPayment?: string
  avatarUrl?: string
  avatarPreset?: string
  createdAt?: Date
}

// ─── Game Preset ──────────────────────────────────────────────────────────────

export interface GamePreset {
  id: string
  createdBy: string
  name: string
  gameType: GameType
  buyInCents: number
  stakesMode: StakesMode
  config: SkinsConfig | BestBallConfig | NassauConfig | WolfConfig | BBBConfig | HammerConfig | VegasConfig | StablefordConfig | DotsConfig | BankerConfig | QuotaConfig
  description?: string
  sortOrder: number
  createdAt?: Date
}

// ─── Holes Mode ──────────────────────────────────────────────────────────────

export type HolesMode = 'full_18' | 'front_9' | 'back_9'

// ─── Course Snapshot (freezes course data at time of round) ──────────────────

export interface CourseSnapshot {
  courseId: string
  courseName: string
  tees: Tee[]
  holes: Hole[]
}

// ─── Games ────────────────────────────────────────────────────────────────────

export type GameType = 'skins' | 'best_ball' | 'nassau' | 'wolf' | 'bingo_bango_bongo' | 'hammer' | 'vegas' | 'stableford' | 'dots' | 'banker' | 'quota'

export type SkinsMode = 'gross' | 'net'
export interface Press {
  holeNumber: number
  playerId: string
}

export interface SkinsConfig {
  mode: SkinsMode
  carryovers: boolean
  presses?: Press[]
}

export type BestBallMode = 'gross' | 'net'
export type BestBallScoring = 'match' | 'total'
export interface BestBallConfig {
  scoring: BestBallScoring
  mode: BestBallMode
  /** playerId → 'A' | 'B' */
  teams: Record<string, 'A' | 'B'>
}

export interface NassauConfig {
  mode: 'gross' | 'net'
  presses?: Press[]
}

export interface WolfConfig {
  mode: 'gross' | 'net'
  wolfOrder: string[]
  holeDecisions?: Record<number, { partnerId: string | null }>
}

export interface BBBConfig {
  mode: 'gross' | 'net'
}

export interface HammerConfig {
  baseValueCents: number
  maxPresses?: number
  autoHammer?: boolean
  /** Hole-by-hole hammer states, keyed by hole number */
  hammerStates?: Record<number, HammerHoleState>
}

export interface HammerHoleState {
  hammerHolder: string  // playerId who currently holds the hammer
  value: number         // current value in cents for this hole
  presses: number       // number of presses (doubles) this hole
  declined: boolean     // whether the opponent declined the hammer
  declinedBy?: string   // playerId who declined
}

export interface VegasConfig {
  mode: 'gross' | 'net'
  teams: Record<string, 'A' | 'B'>
}

export interface StablefordConfig {
  mode: 'gross' | 'net'
}

export type DotType = JunkType | 'fairway_hit' | 'up_and_down' | 'one_putt' | 'longest_drive' | 'par_save'

export interface DotsConfig {
  activeDots: DotType[]
  valueCentsPerDot: number
}

export interface BankerConfig {
  mode: 'gross' | 'net'
  bankerOrder: string[]
}

export interface QuotaConfig {
  mode: 'gross' | 'net'
  quotas: Record<string, number>
}

// ─── Junks (side bets) ─────────────────────────────────────────────────────

export type JunkType = 'sandy' | 'greenie' | 'snake' | 'barkie' | 'ctp'

export interface JunkConfig {
  valueCents: number  // value per junk (e.g. 100 = $1 per junk per player)
  types: JunkType[]   // which junks are active this round
}

export interface JunkRecord {
  id: string
  roundId: string
  holeNumber: number
  playerId: string
  junkType: JunkType
}

export interface BBBPoint {
  id: string
  roundId: string
  holeNumber: number
  bingo: string | null
  bango: string | null
  bongo: string | null
}

export type StakesMode = 'standard' | 'high_roller' | 'points'

export interface Game {
  id: string
  type: GameType
  buyInCents: number
  stakesMode?: StakesMode
  config: SkinsConfig | BestBallConfig | NassauConfig | WolfConfig | BBBConfig | HammerConfig | VegasConfig | StablefordConfig | DotsConfig | BankerConfig | QuotaConfig
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentMethod = 'venmo' | 'cash' | 'zelle' | 'paypal' | 'other'
export type PaymentStatus = 'unpaid' | 'marked_paid'

export interface BuyIn {
  id: string
  roundId: string
  playerId: string
  amountCents: number
  method?: PaymentMethod
  status: PaymentStatus
  paidAt?: Date
  playerReportedAt?: Date
}

// ─── Events ──────────────────────────────────────────────────────────────────

export type EventStatus = 'setup' | 'active' | 'complete'
export type EventRole = 'manager' | 'scorekeeper' | 'player'
export type ScoreStatus = 'pending' | 'approved' | 'rejected'

export interface GolfEvent {
  id: string
  name: string
  status: EventStatus
  roundId?: string
  inviteCode?: string
  groupScorekeepers: Record<number, string>  // groupNumber → playerId
  createdBy: string
  createdAt: Date
}

export interface EventParticipant {
  id: string
  eventId: string
  userId: string
  playerId: string
  role: EventRole
  status: 'pending' | 'accepted' | 'declined'
  invitedBy?: string
  invitedAt?: Date
  groupNumber?: number
  joinedAt?: Date
}

// ─── Round ────────────────────────────────────────────────────────────────────

export interface Round {
  id: string
  courseId: string
  date: Date
  status: 'setup' | 'active' | 'complete'
  currentHole: number

  // Frozen snapshot so old rounds don't break when course is edited
  courseSnapshot?: CourseSnapshot

  // One game per round
  game?: Game

  // Optional junk side bets (independent of main game)
  junkConfig?: JunkConfig

  // Explicitly assigned treasurer
  treasurerPlayerId?: string

  // Players embedded for convenience (source of truth for new rounds)
  players?: Player[]

  // Group assignments: playerId → group number (1-based)
  groups?: Record<string, number>

  // Round creator's user ID (for scoremaster vs viewer distinction)
  createdBy?: string

  // Game master (scorekeeper) — can edit scores alongside round creator
  gameMasterId?: string

  // Invite code for shared scoring
  inviteCode?: string

  // Event ID if this round is part of an event
  eventId?: string

  // 9-hole mode: which holes to play (default full_18)
  holesMode?: HolesMode

  // Starting hole for the round (default 1)
  startingHole?: number

  // Shotgun starts: group number → starting hole (event only)
  shotgunStarts?: Record<number, number>
}

// ─── Round Participant ──────────────────────────────────────────────────────

export interface RoundParticipant {
  id: string
  roundId: string
  userId: string
  playerId: string
  status: 'pending' | 'accepted' | 'declined'
  invitedBy?: string
  invitedAt?: Date
  joinedAt?: Date
}

// ─── Pinned Friends ─────────────────────────────────────────────────────────

export interface PinnedFriend {
  userId: string
  friendUserId: string
}

// ─── Join / score tables ──────────────────────────────────────────────────────

export interface RoundPlayer {
  id: string
  roundId: string
  playerId: string
  teePlayed: string
  courseHandicap?: number
  playingHandicap?: number
}

export interface HoleScore {
  id: string
  roundId: string
  playerId: string
  holeNumber: number
  grossScore: number
  scoreStatus?: ScoreStatus
  submittedBy?: string
  updatedAt?: string
}

// ─── Settlements ─────────────────────────────────────────────────────────────

export type SettlementStatus = 'owed' | 'paid'

export interface SettlementRecord {
  id: string
  roundId: string
  fromPlayerId: string
  toPlayerId: string
  amountCents: number
  reason?: string
  source: 'game' | 'junk' | 'side_bet' | 'prop'
  status: SettlementStatus
  paidAt?: Date
  playerReportedAt?: Date
  reportedMethod?: string
}

// ─── Notifications ──────────────────────────────────────────────────────────

// Push-worthy event types. `score_update` was removed — it was in the enum and had
// a toast icon but nothing ever wrote it. The remaining four are all real events:
// round_invite (server RPC), unsettled_round (settle-up nudges), round_complete
// (written for non-debtor participants when a round settles), broadcast (admin).
export type NotificationType = 'unsettled_round' | 'round_invite' | 'round_complete' | 'broadcast'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body?: string
  roundId?: string
  inviteCode?: string
  read: boolean
  createdAt: Date
}

// ─── Push (groundwork; nothing is sent until WEB_PUSH_ENABLED) ─────────────────

export type PushPlatform = 'web' | 'ios' | 'android'

/** One registered device. Web fills endpoint/p256dh/auth; native fills deviceToken. */
export interface PushDeviceSubscription {
  id: string
  userId: string
  platform: PushPlatform
  endpoint?: string
  p256dh?: string
  auth?: string
  deviceToken?: string
  userAgent?: string
  createdAt: Date
  lastSeenAt: Date
}

/** Per-user notification preferences. Absence ⇒ push off, in-app categories on. */
export interface NotificationPreferences {
  userId: string
  pushEnabled: boolean
  invites: boolean
  settleUp: boolean
  roundComplete: boolean
  broadcasts: boolean
  updatedAt: Date
}

// ─── Side Bets ──────────────────────────────────────────────────────────────

export type SideBetStatus = 'open' | 'resolved' | 'cancelled'

export interface SideBet {
  id: string
  roundId: string
  holeNumber: number
  description: string
  amountCents: number
  participants: string[] // playerIds
  winnerPlayerId?: string
  status: SideBetStatus
  createdAt: Date
}

// ─── Prop Bets ───────────────────────────────────────────────────────────────

export type PropCategory = 'quick' | 'skill' | 'h2h'
export type PropWagerModel = 'challenge' | 'pool' | 'fixed'
export type PropStatus = 'open' | 'locked' | 'resolved' | 'voided'
export type PropResolveType = 'auto' | 'manual'

export interface PropOutcome {
  id: string    // 'y'/'n' or player ID
  label: string // 'Yes'/'No' or player name
}

export interface AutoResolveConfig {
  type: 'over_under' | 'h2h' | 'birdie_count' | 'hole_score'
  playerId?: string
  playerIdB?: string   // for H2H
  threshold?: number   // e.g. 82.5 for over/under
  metric?: 'gross' | 'net'
  holeNumber?: number
  holeRange?: 'front' | 'back' | 'all'
}

export interface PropBet {
  id: string
  roundId: string | null
  creatorId: string         // player ID
  userId: string            // auth user (RLS)
  title: string
  description?: string
  category: PropCategory
  wagerModel: PropWagerModel
  stakeCents: number        // for challenge/fixed
  outcomes: PropOutcome[]
  resolveType: PropResolveType
  autoResolveConfig?: AutoResolveConfig
  targetPlayerId?: string
  status: PropStatus
  winningOutcomeId?: string
  locksAt?: Date
  resolvedAt?: Date
  createdAt: Date
  holeNumber?: number
}

export interface PropWager {
  id: string
  propBetId: string
  roundId: string
  playerId: string
  userId: string
  outcomeId: string
  amountCents: number
  createdAt: Date
}

// ─── Tournaments ────────────────────────────────────────────────────────────

export type TournamentFormat = 'match_play_single' | 'match_play_double' | 'stroke_play'
export type TournamentStatus = 'setup' | 'active' | 'complete'

export interface Tournament {
  id: string
  name: string
  format: TournamentFormat
  status: TournamentStatus
  courseId?: string
  courseSnapshot?: CourseSnapshot
  playerIds: string[]
  config?: {
    handicapMode?: 'gross' | 'net'
    roundsCount?: number
    buyInCents?: number
  }
  createdAt: Date
}

export interface TournamentRound {
  id: string
  tournamentId: string
  roundId?: string
  roundNumber: number
  bracketRound?: number
  status: 'pending' | 'active' | 'complete'
  createdAt: Date
}

export type MatchupStatus = 'pending' | 'active' | 'complete'

export interface TournamentMatchup {
  id: string
  tournamentId: string
  tournamentRoundId?: string
  bracketRound: number
  matchNumber: number
  playerAId?: string
  playerBId?: string
  winnerId?: string
  loserBracket: boolean
  status: MatchupStatus
  createdAt: Date
}

// ─── Legacy score (kept for migration safety) ─────────────────────────────────

export interface Score {
  playerId: string
  holeNumber: number
  grossScore: number
  netScore: number
  strokesReceived: number
}
