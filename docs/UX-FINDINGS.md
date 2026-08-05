# UX Findings — hands-on sweep

**Method:** drove the real app (gimme.gg dev, logged in) through the core journeys —
onboarding, create-round wizard, each game's scorecard, Settle Up, History — and
logged every friction point. Severity is from a first-time-user lens. "Fixed" items
were resolved during this session (PR # noted); "Open" items are the remaining
backlog. A recording of the create-round journey is in `ux-create-round-journey.gif`.

Re-run this sweep after UX changes; add rows as new friction surfaces.

---

## Open (not yet addressed) — ranked

| # | Journey | Severity | What's rough | Suggested fix |
|---|---------|----------|--------------|---------------|
| O3 | Create round | Low | Every new round re-walks **Course → Players → Game → (Stakes)**. "Play Again" exists on home, but starting *fresh* always restarts the full wizard even for your usual course/group. | Surface a "recent course" quick-pick at the top of Select Course, and remember last-used tee/group. |
| O4 | Create round | Low | **Hammer** is greyed out at 3+ players with no inline reason; you have to already know it's 2-player only. | Add a one-line hint under the disabled button ("Hammer is 2 players only"), like the Best Ball even-count hint. |
| O6 | Onboarding | Low | A brand-new guest isn't **auto-added as a player** in the round wizard until they finish profile setup — a first-time guest lands on Select Players with nobody pre-selected. | Auto-create a lightweight player from the guest's session (or prompt a quick name) so they're pre-selected, like a logged-in user's "YOU". |
| O5 | BBB (multi-group) | Note | In a single group the **score master enters all** Bingo/Bango/Bongo results (works). There's **no per-player self-entry** in a single round — for a big multi-group outing the score master can't know what other groups got. | That's the **Events** (multi-group, players self-score) flow — steer BBB-for-events users there, or add self-entry to BBB. Copy/onboarding, not a bug. |

---

## Fixed this session (was rough → resolved)

| Journey | Was | Fix (PR) |
|---------|-----|----------|
| Onboarding (O1) | "Try it first — no account needed" dead-ended at an "Account Required" wall on Start New Round | Guests play real rounds (persist under the anon session, upgrade in place); banner nudges "Save" (#21); guest auto-added as "You" (#22) |
| Home (O2) | Abandoned "Round in Progress" cards piled up, no bulk cleanup | Collapse to recent 2 + "Show N more"; per-card Discard (delete_own_round) (#23) |
| BBB scorecard | Treated like stroke play — golf scores required + a "not all players have scores" nag, standings/leaderboard showed strokes not points | Golf entry optional/collapsed, nag suppressed, points-first standings + leaderboard (#20) |
| Best Ball (Stroke Play) | Scoreboard showed holes-won while payout used total strokes — could contradict | All displays show total strokes in Stroke Play (#20) |
| Settle Up | Impersonal "Total in play <pot>"; duplicate Winners/Checklist/Settlements sections; sprawl | Personal "You owe/collect" hero (always fires), one consolidated "Settle Up" section, deduped (#17) |
| Settle Up (unit games) | "Per unit 0 pts", phantom "Total pot", Winners showed pot-model amount | Reads the real per-unit value + unit net; History drops the phantom pot (#17, #18) |
| Dots | Selectable but **unplayable** — no in-round dot entry | Dedicated dot-type picker + always-on `DotsPanel`; playable end-to-end (#18) |
| History | vs-par read "−68" on a partial round | Uses played-holes par (#17) |

## Correctness fixes (trust, not just polish)

| Was | Fix (PR) |
|-----|----------|
| Unit games (Wolf/Banker/Hammer/Dots) mis-settled by the flat-pot model | Single net-based engine, settle by true magnitude (#15, #17) |
| Quota double-applied handicap | Scores gross (handicap already in the target) (#18) |
| Presses over-distributed → treasurer shortfall | Ante derived from the distributed pot → net-zero (#19) |

---

## How to keep experiencing this
- **This sweep + GIF** is repeatable: drive the journeys, record with the browser GIF tool, drop findings here.
- Highest-value next journeys to record: **Events / multi-group self-score**, and a **full 18-hole settle** end-to-end.
