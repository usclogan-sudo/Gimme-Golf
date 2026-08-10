# Gimme — Work Order for Claude Code (Aug 5)

Context docs: `Gimme-Per-Game-UX-Audit.md` (findings), `fix-payment-handle-merge.patch` (ready diff). Work top-down. Run `tsc -b` and the vitest suite before each commit — plain `tsc` is a no-op on this project.

## 1. Apply the payment-handle patch (ready — 10 min)
`git apply fix-payment-handle-merge.patch`. Three edits: `RoundPlayer.userId` type, `rowToRoundPlayer` maps `user_id`, SettleUp builds the player→user map from round_players ∪ accepted participants (was: accepted-only, so roster-added winners never got their Venmo/PayPal/Cash App links).
**Then verify the one assumption:** confirm the roster-add write path sets `round_players.user_id` for registered users. If it's null there, fix that insert too — otherwise the merge has nothing to join.
**Acceptance:** JL loses a round to Test (Test has a Venmo handle saved) → JL's Settle Up shows the Venmo button and the nudge message contains "Pay here: venmo.com/test".

## 2. Hunt the silent auth downgrade (P0 — the real "You/HCP 0" bug)
A signed-in session fell to anonymous with no sign-out; the app then correctly applied guest mode (guest "You", HCP 0, no ledger/notifications/pay linkage). Suspects: token refresh failure falling back to `signInAnonymously` (from the O1 guest-mode work, #21), or the guest path capturing an already-authed session. Add: never downgrade an authed session silently; if refresh fails, surface a re-auth prompt instead. Also verify "your guest data carries over" actually merges guest rounds on sign-in.
**Acceptance:** expire/invalidate a session artificially → app prompts sign-in, never becomes anonymous. Fresh signed-in round shows "Jeff Logan — YOU — HCP 25".

## 3. In-game presence for Stableford, Quota, Banker (one shared component)
All three have NO game panel during play (and the leaderboard ranks by strokes). Quota additionally renders nothing at settle — no section, no winner, no settlement. Build one "who's winning right now" panel (current points/targets/banker-of-the-hole + running tally) and a settle breakdown section that shows the math behind the payout number. Stableford/Dots settles currently print a payout with zero explanation — the breakdown is a trust requirement, not polish.
**Acceptance:** each game shows live standing on the scoring screen and an itemized game section at Settle Up; Quota produces a real settlement.

## 4. Nassau: live status + partial-round zero-sum bug
- Panel shows "F9 — · B9 — · 18 —" mid-nine → compute and show live leg status ("You 2UP front").
- Partial-round settle printed a NON-zero-sum card: "All square" headline with BOTH players at −25. Fix the refund path so standings sum to zero and the card says what happened ("Round ended early — no legs completed, entries returned").
- Kill the treasurer ghost copy in points mode ("gets 25 pts back from the treasurer" / "Treasurer: Not assigned").

## 5. Game-math verifications (trace, then fix if confirmed)
- **Dots:** in-game tally showed Test +3; settle paid 2. Trace the Snake accounting.
- **Wolf:** Lone-Wolf loss + wolf-team win settled You −200 / A-Aron +100 / Test +100 / Alayna E — the non-wolf losing partner (Alayna) paid nothing. Verify intended rules; likely the losing partner isn't being charged.

## 6. Small fixes (single sweep)
- Disabled game cards (Wolf <4p, Banker <3p): add "Needs 4 players" caption; don't leave the previous game's config showing on a dead tap.
- Hammer: "undefined×" in Max Presses; "You holds" → "You hold"; "1 pts" → "1 pt"; clarify respond model (playing on = accept) and clear the "to respond" banner once the hole resolves.
- Best Ball status: "Team B +4(0W · 0T · 4W)" → "Team B 4 UP thru 4".
- Dots: hide Greenie on non-par-3s.
- Copy sweep: "bets" (Nassau), "pot" (Skins/Stableford/History "pts pot") → settle/points language. Grammar/pluralization pass.
- Surface the five advertised games (Skins · Best Ball · Nassau · Wolf · BBB) in the grid instead of hiding 8 of 10 behind "More Games".

## Deferred (needs product decision or device)
- Mid-round add-guest + remove/substitute (removal math decision required first — see UX spec §3).
- Web Push (spec §6; sequence after confirming invite notifications write rows).
- iOS Universal Links / install-to-join (device testing).
