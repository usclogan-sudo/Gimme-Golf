// The ResultCard sub-line library (UX Build Spec v2.0 §3e).
//
// One line is auto-selected per round, deterministically from the round ID so it
// never changes on re-render. Voice rule: affectionate, never cruel; no gambling
// vocabulary ("bet", "wager", "pot", "odds"); no gendered address ("guys", "boys").
// Warmth and wit — this is the one place in the app wit is allowed to run.
//
// Placeholders resolved at selection time: {winner}, {runnerUp}, {lastPlace}.

export const SUBLINES = {
  // Winner's margin > 50% of the total points in play.
  blowout: [
    'Not particularly close.',
    '{winner} made it look routine.',
    'Everyone else was playing for second.',
    'A quiet, total dismantling.',
    'The rest were spectators.',
  ],

  // Margin between 1st and 2nd is a sliver of what was in play.
  squeaker: [
    'By a whisker.',
    '{runnerUp} will want that one back.',
    'Decided on the last hole, as it should be.',
    'A single putt the other way and this reads differently.',
    'Nobody exhale — that was too close.',
  ],

  // Everyone finished level; no one owes anyone.
  allSquare: [
    'Somehow, nobody owes anybody.',
    'Perfectly balanced. Deeply unsatisfying.',
    'A draw. Run it back next week.',
    'All even. The rarest scorecard there is.',
  ],

  // Winner's first recorded win with this group. Passed in explicitly.
  firstWin: [
    "{winner}'s first one. It counts.",
    'A maiden win for {winner}. Frame it.',
    "{winner} finally gets one. About time.",
  ],

  // The everyday case. This bucket carries the product; it needs depth so it does
  // not go stale inside a single season. (Spec asked for 20+ — there are 24.)
  standard: [
    "Lunch's on {lastPlace}.",
    '{winner} takes the day.',
    "That'll do.",
    'Signed, sealed, settled.',
    '{lastPlace} is getting the next tee time.',
    '{winner} had the number.',
    'Cards on the table. {winner} on top.',
    'Another one for {winner}.',
    '{lastPlace} buys the range balls.',
    'Well earned, {winner}.',
    'The card never lies.',
    '{winner} kept it clean.',
    'Paid in full, or about to be.',
    'A good walk, properly ruined for {lastPlace}.',
    '{winner} leaves with the bragging rights.',
    "That's how it's done.",
    'Somebody had to win. It was {winner}.',
    '{lastPlace} owes more than an apology.',
    'Steady all day. {winner} closes it out.',
    'Settle up and shake hands.',
    'The group agrees: {winner} earned it.',
    'Chalk one up for {winner}.',
    '{lastPlace} is quiet in the cart.',
    'Good round. Better result for {winner}.',
  ],

  // Mid-round (the leaderboard/in-progress share). No settling has happened, so the
  // copy stays open-ended — never declares a result.
  inProgress: [
    "Still anyone's round.",
    'Long way to go.',
    '{winner} out front — for now.',
    'The back nine will decide it.',
    'Plenty of golf left.',
    'Nothing settled yet.',
  ],
} as const

export type SublineBucket = keyof typeof SUBLINES

export interface SublineInput {
  /** Stable per-round salt so the choice never changes on re-render. */
  roundId: string
  winner: string | null
  runnerUp: string | null
  lastPlace: string | null
  /** Sum of the positive nets — the points actually in play. */
  pointsInPlay: number
  /** Winner net minus runner-up net. */
  margin: number
  /** No settlements and no positive winner. */
  isAllSquare: boolean
  /** Winner's first win with this group. Unknown to a pure card, so opt-in. */
  isFirstWin?: boolean
  /** Mid-round share — use the open-ended inProgress bucket, never a result line. */
  inProgress?: boolean
}

// Small, stable string hash (djb2-ish). Same input → same index, forever.
export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Priority: inProgress > firstWin > allSquare > blowout > squeaker > standard.
function selectBucket(input: SublineInput): SublineBucket {
  if (input.inProgress) return 'inProgress'
  if (input.isFirstWin && input.winner) return 'firstWin'
  if (input.isAllSquare) return 'allSquare'
  if (input.pointsInPlay > 0 && input.margin > 0.5 * input.pointsInPlay) return 'blowout'
  if (input.pointsInPlay > 0 && input.margin > 0 && input.margin <= 0.1 * input.pointsInPlay) return 'squeaker'
  return 'standard'
}

function fill(template: string, input: SublineInput): string {
  return template
    .replace(/\{winner\}/g, input.winner ?? 'The winner')
    .replace(/\{runnerUp\}/g, input.runnerUp ?? 'The runner-up')
    .replace(/\{lastPlace\}/g, input.lastPlace ?? 'last place')
}

/**
 * Pick the sub-line for a round. Deterministic per roundId, so the copy is stable
 * across the settle screen, the history archive, and the exported PNG.
 */
export function selectSubline(input: SublineInput): string {
  const bucket = selectBucket(input)
  let pool: readonly string[] = SUBLINES[bucket]

  // A bucket line may reference a name we don't have (2-player rounds have no
  // lastPlace). Drop templates whose placeholder can't be filled; never show a
  // literal "{lastPlace}". Fall back to standard, then to a safe constant.
  const canFill = (t: string) =>
    (input.lastPlace != null || !t.includes('{lastPlace}')) &&
    (input.runnerUp != null || !t.includes('{runnerUp}')) &&
    (input.winner != null || !t.includes('{winner}'))

  pool = pool.filter(canFill)
  if (pool.length === 0) pool = SUBLINES.standard.filter(canFill)
  if (pool.length === 0) return 'The card never lies.'

  const idx = hashStr(input.roundId + bucket) % pool.length
  return fill(pool[idx], input)
}
