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
 * Dots. Now playable end-to-end: a dedicated dot-type picker in NewRound (Dots
 * Options) sets DotsConfig.activeDots independently of the junk section, and an
 * always-on in-round DotsPanel (Scorecard) awards dots — both independent of
 * SHOW_HOLE_BETS. Settlement was already correct (unit game).
 */
export const SHOW_DOTS = true

/**
 * Presses (Skins & Nassau — a new bet started when down, doubling stakes).
 * Re-enabled: settlement now derives each player's ante from the *distributed* pot
 * (`netFromPayouts`), so a press that inflates the winners' pot scales everyone's
 * exposure equally and the round still nets to zero (no treasurer shortfall).
 */
export const SHOW_PRESSES = true

/**
 * Best Ball "Stroke Play" (total-strokes) scoring mode. Re-enabled: every Best Ball
 * scoreboard (in-round status, leaderboard, Settle Up) now shows total strokes in
 * this mode so the display matches the total-strokes payout. Match Play (holes-won)
 * is unchanged.
 */
export const SHOW_BEST_BALL_STROKE_PLAY = true

/**
 * Web Push notifications. GROUNDWORK ONLY — leave false until the turn-on phase:
 * generate a VAPID keypair, set VITE_VAPID_PUBLIC_KEY (client) + the private key as
 * an Edge Function secret, deploy the sender + the notifications-INSERT webhook, and
 * device-test on real phones (iOS needs an installed PWA / native APNs).
 *
 * When false: usePushRegistration is a no-op (never prompts for permission, never
 * subscribes), so the storage layer (push_subscriptions, notification_preferences)
 * and the sw.js push handler sit inert. Flipping true only makes sense once the
 * server side above exists — otherwise the client would subscribe with no sender.
 */
export const WEB_PUSH_ENABLED = false
