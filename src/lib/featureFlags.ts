/**
 * Feature flags for UI surfaces we want to ship dark but keep the code paths
 * intact. Flipping any of these to `true` re-surfaces the UI; the data model,
 * persistence, and downstream settlement logic remain wired either way.
 *
 * Pattern follows the High Roller / Points stakes-mode flag we shipped in
 * commit e853dbb (SHOW_ALT_STAKES_MODES inside NewRound.tsx).
 */

/**
 * Per-hole junks + side bets (sandy, greenie, snake, polecat, custom side bets).
 * When false:
 *   - NewRound game-setup step hides the "Junk Side Bets" section
 *   - Scorecard hides the in-round HoleBetsPanel
 *   - Existing rounds that already have junkConfig/junkRecords still settle
 *     correctly in SettleUp (only the in-round entry surface is hidden)
 */
export const SHOW_HOLE_BETS = false

/**
 * Prop bets (ad-hoc wagers — "anyone birdie 7?", "longest drive on 12").
 * When false:
 *   - Home screen hides the "Props" link on active-round cards
 *   - Scorecard hides the in-round PropBetsPanel + the standalone PropBetsScreen
 *     entry point on the home-screen active round
 *   - Existing prop bets in past rounds still resolve and settle in SettleUp
 */
export const SHOW_PROP_BETS = false

/**
 * "More Games" beyond the marketed launch 5 (Skins, Best Ball, Nassau, Wolf, BBB).
 * Re-enabled after the settlement-engine rework (unit games now settle head-to-head
 * from signed netCents; Quota's handicap double-application fixed). This un-gates
 * Hammer, Stableford, Banker, Quota. Dots stays behind SHOW_DOTS below (it has no
 * in-round dot-entry surface yet — playable only once that lands).
 */
export const SHOW_EXTRA_GAMES = true

/**
 * Dots specifically. Unlike the other extra games, Dots has no way to award dots
 * in-round: dot entry lives only in the SHOW_HOLE_BETS-gated HoleBetsPanel, and
 * DotsConfig.activeDots is configured there too — so with SHOW_HOLE_BETS off a Dots
 * round starts unplayable (nothing to award, always settles all-square). Keep hidden
 * until a dedicated dot-entry UI exists. Settlement for Dots is already correct.
 */
export const SHOW_DOTS = false

/**
 * Presses (Skins & Nassau — a new bet started when down, doubling stakes).
 * When false, the in-round Press button is hidden. Presses currently over-
 * distribute: the doubled winnings aren't funded by extra buy-ins, so the
 * treasurer covers the shortfall (docs/GAMEPLAY-QA-FINDINGS.md). Hidden until the
 * settlement rework funds presses as head-to-head bets. Calc logic preserved.
 */
export const SHOW_PRESSES = false

/**
 * Best Ball "Stroke Play" (total-strokes) scoring mode. When false, Best Ball is
 * Match Play only. Stroke-Play's winner is decided by total strokes but every
 * scoreboard shows only holes-won, so the display can contradict the payout.
 * Hidden until the display is fixed. Match Play (the default) is unaffected.
 */
export const SHOW_BEST_BALL_STROKE_PLAY = false
