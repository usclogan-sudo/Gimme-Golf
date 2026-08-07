import { createClient } from '@supabase/supabase-js'
import type { Course, Player, Round, RoundPlayer, HoleScore, BuyIn, BBBPoint, JunkRecord, JunkType, UserProfile, GamePreset, GameType, StakesMode, PinnedFriend, RoundParticipant, SettlementRecord, SettlementStatus, AppNotification, NotificationType, PushDeviceSubscription, PushPlatform, NotificationPreferences, SideBet, SideBetStatus, Tournament, TournamentFormat, TournamentStatus, TournamentRound, TournamentMatchup, MatchupStatus, GolfEvent, EventStatus, EventParticipant, EventRole, PropBet, PropCategory, PropWagerModel, PropStatus, PropResolveType, PropWager, HolesMode } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: true,
  },
})

// ─── DB row → TypeScript mappers ──────────────────────────────────────────────

export function rowToCourse(row: any): Course {
  return {
    id: row.id,
    name: row.name,
    tees: row.tees,
    holes: row.holes,
    createdAt: new Date(row.created_at),
  }
}

export function rowToPlayer(row: any): Player {
  return {
    id: row.id,
    name: row.name,
    handicapIndex: row.handicap_index,
    tee: row.tee,
    ghinNumber: row.ghin_number ?? '',
    isPublic: row.is_public ?? false,
    ...(row.venmo_username ? { venmoUsername: row.venmo_username } : {}),
    ...(row.zelle_identifier ? { zelleIdentifier: row.zelle_identifier } : {}),
    ...(row.cashapp_username ? { cashAppUsername: row.cashapp_username } : {}),
    ...(row.paypal_email ? { paypalEmail: row.paypal_email } : {}),
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  }
}

export function rowToRound(row: any): Round {
  return {
    id: row.id,
    courseId: row.course_id,
    date: new Date(row.date),
    status: row.status,
    currentHole: row.current_hole,
    courseSnapshot: row.course_snapshot ?? undefined,
    game: row.game ?? undefined,
    junkConfig: row.junk_config ?? undefined,
    treasurerPlayerId: row.treasurer_player_id ?? undefined,
    players: row.players ?? undefined,
    groups: row.groups ?? undefined,
    createdBy: row.user_id ?? undefined,
    gameMasterId: row.game_master_id ?? undefined,
    inviteCode: row.invite_code ?? undefined,
    eventId: row.event_id ?? undefined,
    holesMode: (row.holes_mode as HolesMode) ?? undefined,
    startingHole: row.starting_hole ?? undefined,
    shotgunStarts: row.shotgun_starts ?? undefined,
  }
}

export function rowToRoundPlayer(row: any): RoundPlayer {
  return {
    id: row.id,
    roundId: row.round_id,
    playerId: row.player_id,
    teePlayed: row.tee_played,
    courseHandicap: row.course_handicap ?? undefined,
    playingHandicap: row.playing_handicap ?? undefined,
  }
}

export function rowToHoleScore(row: any): HoleScore {
  return {
    id: row.id,
    roundId: row.round_id,
    playerId: row.player_id,
    holeNumber: row.hole_number,
    grossScore: row.gross_score,
    scoreStatus: row.score_status ?? undefined,
    submittedBy: row.submitted_by ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  }
}

export function rowToBuyIn(row: any): BuyIn {
  return {
    id: row.id,
    roundId: row.round_id,
    playerId: row.player_id,
    amountCents: row.amount_cents,
    method: row.method ?? undefined,
    status: row.status,
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
    playerReportedAt: row.player_reported_at ? new Date(row.player_reported_at) : undefined,
  }
}

export function rowToBBBPoint(row: any): BBBPoint {
  return {
    id: row.id,
    roundId: row.round_id,
    holeNumber: row.hole_number,
    bingo: row.bingo,
    bango: row.bango,
    bongo: row.bongo,
  }
}

// ─── TypeScript → DB row mappers ──────────────────────────────────────────────

export function courseToRow(c: Course, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    tees: c.tees,
    holes: c.holes,
    created_at: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  }
}

export function playerToRow(p: Player, userId: string) {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    handicap_index: p.handicapIndex,
    tee: p.tee,
    ghin_number: p.ghinNumber || '',
    is_public: p.isPublic ?? false,
    venmo_username: p.venmoUsername ?? null,
    zelle_identifier: p.zelleIdentifier ?? null,
    cashapp_username: p.cashAppUsername ?? null,
    paypal_email: p.paypalEmail ?? null,
    created_at: p.createdAt instanceof Date ? p.createdAt.toISOString() : (p.createdAt ?? null),
  }
}

export function roundToRow(r: Round, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    course_id: r.courseId,
    date: r.date instanceof Date ? r.date.toISOString() : r.date,
    status: r.status,
    current_hole: r.currentHole,
    course_snapshot: r.courseSnapshot ?? null,
    game: r.game ?? null,
    junk_config: r.junkConfig ?? null,
    treasurer_player_id: r.treasurerPlayerId ?? null,
    players: r.players ?? null,
    groups: r.groups ?? null,
    game_master_id: r.gameMasterId ?? null,
    invite_code: r.inviteCode ?? null,
    event_id: r.eventId ?? null,
    holes_mode: r.holesMode ?? null,
    starting_hole: r.startingHole ?? null,
    shotgun_starts: r.shotgunStarts ?? null,
  }
}

export function roundPlayerToRow(rp: RoundPlayer, userId: string) {
  return {
    id: rp.id,
    user_id: userId,
    round_id: rp.roundId,
    player_id: rp.playerId,
    tee_played: rp.teePlayed,
    course_handicap: rp.courseHandicap ?? null,
    playing_handicap: rp.playingHandicap ?? null,
  }
}

export function holeScoreToRow(hs: HoleScore, userId: string) {
  return {
    id: hs.id,
    user_id: userId,
    round_id: hs.roundId,
    player_id: hs.playerId,
    hole_number: hs.holeNumber,
    gross_score: hs.grossScore,
    score_status: hs.scoreStatus ?? 'approved',
    submitted_by: hs.submittedBy ?? null,
  }
}

export function buyInToRow(b: BuyIn, userId: string) {
  return {
    id: b.id,
    user_id: userId,
    round_id: b.roundId,
    player_id: b.playerId,
    amount_cents: b.amountCents,
    method: b.method ?? null,
    status: b.status,
    paid_at: b.paidAt instanceof Date ? b.paidAt.toISOString() : (b.paidAt ?? null),
  }
}

export function bbbPointToRow(bp: BBBPoint, userId: string) {
  return {
    id: bp.id,
    user_id: userId,
    round_id: bp.roundId,
    hole_number: bp.holeNumber,
    bingo: bp.bingo,
    bango: bp.bango,
    bongo: bp.bongo,
  }
}

// ─── Junk Record mappers ────────────────────────────────────────────────────

export function rowToJunkRecord(row: any): JunkRecord {
  return {
    id: row.id,
    roundId: row.round_id,
    holeNumber: row.hole_number,
    playerId: row.player_id,
    junkType: row.junk_type as JunkType,
  }
}

export function junkRecordToRow(jr: JunkRecord, userId: string) {
  return {
    id: jr.id,
    user_id: userId,
    round_id: jr.roundId,
    hole_number: jr.holeNumber,
    player_id: jr.playerId,
    junk_type: jr.junkType,
  }
}

// ─── User Profile mappers ───────────────────────────────────────────────────

export function rowToUserProfile(row: any): UserProfile {
  return {
    userId: row.user_id,
    isAdmin: row.is_admin,
    adminOnly: row.admin_only ?? false,
    onboardingComplete: row.onboarding_complete,
    displayName: row.display_name ?? undefined,
    handicapIndex: row.handicap_index ?? undefined,
    tee: row.tee ?? 'White',
    venmoUsername: row.venmo_username ?? undefined,
    zelleIdentifier: row.zelle_identifier ?? undefined,
    cashAppUsername: row.cashapp_username ?? undefined,
    paypalEmail: row.paypal_email ?? undefined,
    preferredPayment: row.preferred_payment ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    avatarPreset: row.avatar_preset ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  }
}

export function userProfileToRow(p: UserProfile) {
  return {
    user_id: p.userId,
    is_admin: p.isAdmin,
    admin_only: p.adminOnly,
    onboarding_complete: p.onboardingComplete,
    display_name: p.displayName ?? null,
    handicap_index: p.handicapIndex ?? null,
    tee: p.tee ?? 'White',
    venmo_username: p.venmoUsername ?? null,
    zelle_identifier: p.zelleIdentifier ?? null,
    cashapp_username: p.cashAppUsername ?? null,
    paypal_email: p.paypalEmail ?? null,
    preferred_payment: p.preferredPayment ?? null,
    avatar_url: p.avatarUrl ?? null,
    avatar_preset: p.avatarPreset ?? null,
  }
}

export async function fetchOrCreateProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`Failed to fetch profile: ${error.message}`)
  if (data) return rowToUserProfile(data)
  const newProfile: UserProfile = { userId, isAdmin: false, adminOnly: false, onboardingComplete: false, tee: 'White' }
  const { data: upsertData, error: upsertError } = await supabase
    .from('user_profiles')
    .upsert(userProfileToRow(newProfile), { onConflict: 'user_id' })
    .select()
    .single()
  if (upsertError) throw new Error(`Failed to create profile: ${upsertError.message}`)
  return upsertData ? rowToUserProfile(upsertData) : newProfile
}

// ─── Game Preset mappers ────────────────────────────────────────────────────

export function rowToGamePreset(row: any): GamePreset {
  return {
    id: row.id,
    createdBy: row.created_by,
    name: row.name,
    gameType: row.game_type as GameType,
    buyInCents: row.buy_in_cents,
    stakesMode: (row.stakes_mode ?? 'standard') as StakesMode,
    config: row.config,
    description: row.description ?? undefined,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  }
}

export function gamePresetToRow(gp: GamePreset, userId: string) {
  return {
    id: gp.id,
    created_by: userId,
    name: gp.name,
    game_type: gp.gameType,
    buy_in_cents: gp.buyInCents,
    stakes_mode: gp.stakesMode,
    config: gp.config,
    description: gp.description ?? null,
    sort_order: gp.sortOrder,
  }
}

// ─── Settlement Record mappers ──────────────────────────────────────────────

export function rowToSettlementRecord(row: any): SettlementRecord {
  return {
    id: row.id,
    roundId: row.round_id,
    fromPlayerId: row.from_player_id,
    toPlayerId: row.to_player_id,
    amountCents: row.amount_cents,
    reason: row.reason ?? undefined,
    source: row.source as 'game' | 'junk' | 'side_bet' | 'prop',
    status: row.status as SettlementStatus,
    paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
    playerReportedAt: row.player_reported_at ? new Date(row.player_reported_at) : undefined,
    reportedMethod: row.reported_method ?? undefined,
  }
}

export function settlementRecordToRow(s: SettlementRecord, userId: string) {
  return {
    id: s.id,
    user_id: userId,
    round_id: s.roundId,
    from_player_id: s.fromPlayerId,
    to_player_id: s.toPlayerId,
    amount_cents: s.amountCents,
    reason: s.reason ?? null,
    source: s.source,
    status: s.status,
    paid_at: s.paidAt instanceof Date ? s.paidAt.toISOString() : (s.paidAt ?? null),
  }
}

// ─── Shared Course mappers ──────────────────────────────────────────────────

export function rowToSharedCourse(row: any): Course {
  return {
    id: row.id,
    name: row.name,
    tees: row.tees,
    holes: row.holes,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  }
}

export function sharedCourseToRow(c: Course, userId: string) {
  return {
    id: c.id,
    created_by: userId,
    name: c.name,
    tees: c.tees,
    holes: c.holes,
  }
}

// ─── Round Participant mappers ───────────────────────────────────────────────

export function rowToRoundParticipant(row: any): RoundParticipant {
  return {
    id: row.id,
    roundId: row.round_id,
    userId: row.user_id,
    playerId: row.player_id,
    status: row.status ?? 'accepted',
    invitedBy: row.invited_by ?? undefined,
    invitedAt: row.invited_at ? new Date(row.invited_at) : undefined,
    joinedAt: row.joined_at ? new Date(row.joined_at) : undefined,
  }
}

// ─── Invite Code Generator ──────────────────────────────────────────────────

export { generateInviteCode } from './inviteCode'

// ─── Pinned Friends mappers ──────────────────────────────────────────────────

export function rowToPinnedFriend(row: any): PinnedFriend {
  return {
    userId: row.user_id,
    friendUserId: row.friend_user_id,
  }
}

// ─── Notification mappers ──────────────────────────────────────────────────

export function rowToNotification(row: any): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body ?? undefined,
    roundId: row.round_id ?? undefined,
    inviteCode: row.invite_code ?? undefined,
    read: row.read,
    createdAt: new Date(row.created_at),
  }
}

export function notificationToRow(n: AppNotification, userId: string) {
  return {
    id: n.id,
    user_id: userId,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    round_id: n.roundId ?? null,
    invite_code: n.inviteCode ?? null,
    read: n.read,
  }
}

// ─── Push subscription + notification preference mappers ────────────────────

export function rowToPushDeviceSubscription(row: any): PushDeviceSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    platform: row.platform as PushPlatform,
    endpoint: row.endpoint ?? undefined,
    p256dh: row.p256dh ?? undefined,
    auth: row.auth ?? undefined,
    deviceToken: row.device_token ?? undefined,
    userAgent: row.user_agent ?? undefined,
    createdAt: new Date(row.created_at),
    lastSeenAt: new Date(row.last_seen_at),
  }
}

export function pushDeviceSubscriptionToRow(s: PushDeviceSubscription) {
  return {
    id: s.id,
    user_id: s.userId,
    platform: s.platform,
    endpoint: s.endpoint ?? null,
    p256dh: s.p256dh ?? null,
    auth: s.auth ?? null,
    device_token: s.deviceToken ?? null,
    user_agent: s.userAgent ?? null,
    last_seen_at: new Date().toISOString(),
  }
}

export function rowToNotificationPreferences(row: any): NotificationPreferences {
  return {
    userId: row.user_id,
    pushEnabled: row.push_enabled,
    invites: row.invites,
    settleUp: row.settle_up,
    roundComplete: row.round_complete,
    broadcasts: row.broadcasts,
    updatedAt: new Date(row.updated_at),
  }
}

export function notificationPreferencesToRow(p: NotificationPreferences) {
  return {
    user_id: p.userId,
    push_enabled: p.pushEnabled,
    invites: p.invites,
    settle_up: p.settleUp,
    round_complete: p.roundComplete,
    broadcasts: p.broadcasts,
    updated_at: new Date().toISOString(),
  }
}

// ─── Side Bet mappers ──────────────────────────────────────────────────────

export function rowToSideBet(row: any): SideBet {
  return {
    id: row.id,
    roundId: row.round_id,
    holeNumber: row.hole_number,
    description: row.description,
    amountCents: row.amount_cents,
    participants: row.participants,
    winnerPlayerId: row.winner_player_id ?? undefined,
    status: row.status as SideBetStatus,
    createdAt: new Date(row.created_at),
  }
}

export function sideBetToRow(sb: SideBet, userId: string) {
  return {
    id: sb.id,
    user_id: userId,
    round_id: sb.roundId,
    hole_number: sb.holeNumber,
    description: sb.description,
    amount_cents: sb.amountCents,
    participants: sb.participants,
    winner_player_id: sb.winnerPlayerId ?? null,
    status: sb.status,
  }
}

// ─── Prop Bet mappers ──────────────────────────────────────────────────────

export function rowToPropBet(row: any): PropBet {
  return {
    id: row.id,
    roundId: row.round_id,
    creatorId: row.creator_id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category as PropCategory,
    wagerModel: row.wager_model as PropWagerModel,
    stakeCents: row.stake_cents,
    outcomes: row.outcomes ?? [],
    resolveType: row.resolve_type as PropResolveType,
    autoResolveConfig: row.auto_resolve_config ?? undefined,
    targetPlayerId: row.target_player_id ?? undefined,
    status: row.status as PropStatus,
    winningOutcomeId: row.winning_outcome_id ?? undefined,
    locksAt: row.locks_at ? new Date(row.locks_at) : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    createdAt: new Date(row.created_at),
    holeNumber: row.hole_number ?? undefined,
  }
}

export function propBetToRow(pb: PropBet, userId: string) {
  return {
    id: pb.id,
    user_id: userId,
    round_id: pb.roundId,
    creator_id: pb.creatorId,
    title: pb.title,
    description: pb.description ?? null,
    category: pb.category,
    wager_model: pb.wagerModel,
    stake_cents: pb.stakeCents,
    outcomes: pb.outcomes,
    resolve_type: pb.resolveType,
    auto_resolve_config: pb.autoResolveConfig ?? null,
    target_player_id: pb.targetPlayerId ?? null,
    status: pb.status,
    winning_outcome_id: pb.winningOutcomeId ?? null,
    locks_at: pb.locksAt instanceof Date ? pb.locksAt.toISOString() : (pb.locksAt ?? null),
    resolved_at: pb.resolvedAt instanceof Date ? pb.resolvedAt.toISOString() : (pb.resolvedAt ?? null),
    hole_number: pb.holeNumber ?? null,
  }
}

export function rowToPropWager(row: any): PropWager {
  return {
    id: row.id,
    propBetId: row.prop_bet_id,
    roundId: row.round_id,
    playerId: row.player_id,
    userId: row.user_id,
    outcomeId: row.outcome_id,
    amountCents: row.amount_cents,
    createdAt: new Date(row.created_at),
  }
}

export function propWagerToRow(pw: PropWager, userId: string) {
  return {
    id: pw.id,
    user_id: userId,
    prop_bet_id: pw.propBetId,
    round_id: pw.roundId,
    player_id: pw.playerId,
    outcome_id: pw.outcomeId,
    amount_cents: pw.amountCents,
  }
}

// ─── Tournament mappers ────────────────────────────────────────────────────

export function rowToTournament(row: any): Tournament {
  return {
    id: row.id,
    name: row.name,
    format: row.format as TournamentFormat,
    status: row.status as TournamentStatus,
    courseId: row.course_id ?? undefined,
    courseSnapshot: row.course_snapshot ?? undefined,
    playerIds: row.player_ids,
    config: row.config ?? undefined,
    createdAt: new Date(row.created_at),
  }
}

export function tournamentToRow(t: Tournament, userId: string) {
  return {
    id: t.id,
    user_id: userId,
    name: t.name,
    format: t.format,
    status: t.status,
    course_id: t.courseId ?? null,
    course_snapshot: t.courseSnapshot ?? null,
    player_ids: t.playerIds,
    config: t.config ?? null,
  }
}

export function rowToTournamentRound(row: any): TournamentRound {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    roundId: row.round_id ?? undefined,
    roundNumber: row.round_number,
    bracketRound: row.bracket_round ?? undefined,
    status: row.status,
    createdAt: new Date(row.created_at),
  }
}

export function tournamentRoundToRow(tr: TournamentRound, userId: string) {
  return {
    id: tr.id,
    user_id: userId,
    tournament_id: tr.tournamentId,
    round_id: tr.roundId ?? null,
    round_number: tr.roundNumber,
    bracket_round: tr.bracketRound ?? null,
    status: tr.status,
  }
}

export function rowToTournamentMatchup(row: any): TournamentMatchup {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    tournamentRoundId: row.tournament_round_id ?? undefined,
    bracketRound: row.bracket_round,
    matchNumber: row.match_number,
    playerAId: row.player_a_id ?? undefined,
    playerBId: row.player_b_id ?? undefined,
    winnerId: row.winner_id ?? undefined,
    loserBracket: row.loser_bracket,
    status: row.status as MatchupStatus,
    createdAt: new Date(row.created_at),
  }
}

export function tournamentMatchupToRow(m: TournamentMatchup, userId: string) {
  return {
    id: m.id,
    user_id: userId,
    tournament_id: m.tournamentId,
    tournament_round_id: m.tournamentRoundId ?? null,
    bracket_round: m.bracketRound,
    match_number: m.matchNumber,
    player_a_id: m.playerAId ?? null,
    player_b_id: m.playerBId ?? null,
    winner_id: m.winnerId ?? null,
    loser_bracket: m.loserBracket,
    status: m.status,
  }
}

// ─── Event mappers ──────────────────────────────────────────────────────────

export function rowToEvent(row: any): GolfEvent {
  return {
    id: row.id,
    name: row.name,
    status: row.status as EventStatus,
    roundId: row.round_id ?? undefined,
    inviteCode: row.invite_code ?? undefined,
    groupScorekeepers: row.group_scorekeepers ?? {},
    createdBy: row.user_id,
    createdAt: new Date(row.created_at),
  }
}

export function eventToRow(e: GolfEvent, userId: string) {
  return {
    id: e.id,
    user_id: userId,
    name: e.name,
    status: e.status,
    round_id: e.roundId ?? null,
    invite_code: e.inviteCode ?? null,
    group_scorekeepers: e.groupScorekeepers,
  }
}

export function rowToEventParticipant(row: any): EventParticipant {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    playerId: row.player_id,
    role: row.role as EventRole,
    status: row.status ?? 'accepted',
    invitedBy: row.invited_by ?? undefined,
    invitedAt: row.invited_at ? new Date(row.invited_at) : undefined,
    groupNumber: row.group_number ?? undefined,
    joinedAt: row.joined_at ? new Date(row.joined_at) : undefined,
  }
}
