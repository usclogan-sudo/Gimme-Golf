# Gimme — Per-Game UX Audit (Setup → In-Game → Settle)

**Date:** Aug 5, 2026 · **Build:** gimme.gg production · **Method:** live browser walkthrough, 2-player rounds (JL + Test), batch scoring, full end-to-settle per game
**Coverage:** all 10 games end-to-end (Wolf & Banker completed with a 4-player roster after the initial session).
**Yardstick:** the three pillars — ease of setup, in-game competition, settle-up. "Simple, intuitive, thoughtless."

---

## P0 — Fix before anything else

### 1. The wizard no longer plays you as *you* — root cause is likely a silent guest-session downgrade
Every round created this session added a guest named **"You" with HCP 0** instead of the logged-in account player (JL, HCP 25). Verified across all 10 games.
**Post-audit discovery that reframes this:** once History was emptied, the home screen showed **"👤 Playing as guest — Create an account to save your rounds & settle up."** The session — which began signed in as JL — had silently become an **anonymous guest session**, with no explicit sign-out. So the "You / HCP 0" behavior is probably correct *guest-mode* behavior (from UX O1's "let guests play" work, #21/#22) being applied to a session that should still be JL. The bug to hunt is the **auth downgrade**: how does a signed-in session fall into anonymous mode? (Token refresh failure falling back to `signInAnonymously`? A deploy mid-session? The O1 guest path capturing an authed user?)
**Consequences while degraded:** wrong handicap everywhere; Quota targets off HCP 0; no Ledger, notifications, or payment-handle linkage for the "host." The account holder is silently severed from the settle loop.
**Also check:** whether rounds created during such a degraded session can be reclaimed on sign-in ("your guest data carries over" implies yes — verify).

### 2. Stableford and Quota have no in-game presence; Quota has no settle either
- **Stableford:** no "Game · Hole" panel at all during play — zero points visible; the leaderboard ranks by strokes. The settle produces a number (e.g. "You owe 19 pts") with **no points breakdown anywhere**, so the payout is unverifiable.
- **Quota:** same missing panel, **plus nothing at settle** — no Quota section, no winner, no settlement. Result card printed "All square / E / E" over clearly lopsided scores. The game is currently decorative.
A points-race game with invisible points fails the in-game-competition pillar outright; an unexplained payout fails the settle pillar at the exact moment trust matters most.

### 3. Nassau: dead in-game status + non-zero-sum settle on partial rounds
- In-game panel shows **"F9 — · B9 — · 18 —"** four holes into the front nine. No live "who's up," which is the entire point of a Nassau.
- Partial-round settle: card printed **"All square"** while STANDINGS showed **You −25 AND Test −25** — both negative, not zero-sum. Plus the treasurer ghost copy ("Each player gets 25 pts back from the treasurer" / "Treasurer: Not assigned").

---

## P1 — Real friction on core surfaces

### 4. Payment buttons still absent everywhere (known, unmerged)
All 8 settles fell back to "Copy Payment Text" — no Venmo/PayPal/Cash App buttons in any game. This is the previously-traced `mergePaymentInfo` scoping bug (profile join gated on `round_participants.status='accepted'`), still not in main — now compounded by P0 #1 (a guest "You" can never link a profile).

### 5. Dots: settle doesn't match the in-game tally
In-game showed **Test +3** (2 dots awarded + Snake against You); settle paid **2 pts** ("Per unit 1 · Total won 2"). One unit vanished — likely Snake accounting. Needs a math trace. Dots also settles with no breakdown section (same trust gap as Stableford).

### 6. Wolf & Banker — now tested (4-player roster)
- **Silent disable stands** as a setup finding: at 2–3 players they gray out with no "needs 4 / needs 3" caption, and tapping leaves the previous game's config visible. Minimum fix: a one-line caption on the disabled card.
- **Wolf (tested):** setup is good (rotation order + clear explainer). The in-game **partner-pick UI is excellent** — "🐺 Wolf: You · pick a partner or go Lone Wolf," rotation advanced correctly hole to hole ("A-Aron + Test"). Two gaps: **no per-hole outcome or running points tally** renders after scores land (same in-game-competition gap as Nassau), and a **settlement math flag**: after a Lone-Wolf loss (hole 1) and a wolf-team win (hole 2), the settle produced You −200 / A-Aron +100 / Test +100 / **Alayna E** — zero-sum overall, but Alayna was on the losing side of hole 2 and paid nothing while "You" absorbed everything. Trace whether non-wolf losing partners are being charged.
- **Wolf settle structure is right:** multi-creditor rows ("You → A-Aron 100 · You → Test 100") with a "Mark all 2 paid" bulk action.
- **Banker (tested):** setup good (rotation + explainer). **No in-game panel at all** — during play there is no indication of who the banker even is; the rotation exists only in setup. Settle math was **correct** (banker lost all three matchups, paid 25 to each, "Mark all 3 paid"), but with no breakdown section explaining it.

### 7. Hammer: setup bug + muddy response model
- Setup shows a literal **"undefined×"** in Max Presses Per Hole.
- In-game: throw works (hole doubled, points moved ±2 correctly at settle) but the response model is unclear — banner says "Test to respond" with **only a Decline button** (no Accept; accepting is implicit by playing on, but nothing says so), and the banner **stays on "to respond" after the hole has resolved**.
- Copy: "**You holds** the hammer," "Hole value: **1 pts**."

---

## P2 — Polish, copy, thoughtfulness

8. **Best Ball status is cryptic:** "Team B +4(0W · 0T · 4W)" — two different W's in one string. Say "**Team B 4 UP thru 4**" (match play) or "Team B by 4" (stroke).
9. **Game grid hides 8 of 10 games** behind "More Games" while the home card advertises Skins · Best Ball · Nassau · Wolf · BBB. Surface at least the advertised five.
10. **Gambling-coded copy in points mode:** Nassau config says "3 separate **bets**"; Stableford "wins the **pot**"; Skins carryover "carry the **pot** forward." The brand scrub missed the game-config layer.
11. **Dots offers Greenie (par-3s only) on a Par 4.** Award rows should adapt to the hole.
12. **Grammar/pluralization sweep:** "1 pts," "1 holes," "You holds."

---

## What's genuinely working — protect these

- **The settle screen's new shape is right:** personal headline ("You owe 25 pts → To Test"), settlement list with progress ("0 of 1 settled"), Mark Paid / reminder actions, and a correct card. Skins, Best Ball, BBB, Hammer end-to-end were clean and zero-sum.
- **BBB and Dots tap-to-award interfaces** are the best interactions in the app — fast, obvious, fun. This is the in-game-competition bar every game should hit.
- **Skins live trophy line** ("🏆 Test wins 1 skin") delivers the moment-to-moment stakes.
- **Batch Entry** is a reliable, fast scoring path.
- **Settlement engine** (PRs #15/#17) computes magnitude-based, zero-sum results for unit games — Nassau-partial and the Dots unit are the only leaks found.

---

## Pillar scorecard

| Game | Setup | In-game | Settle |
|---|---|---|---|
| Skins | ✅ | ✅ | ✅ (minus pay buttons) |
| Best Ball | ✅ | ⚠️ cryptic status | ✅ |
| Nassau | ⚠️ "bets" copy | ❌ no live status | ❌ non-zero-sum partial |
| Wolf | ⚠️ silent disable <4p | ⚠️ great pick UI, no live tally | ⚠️ math verify (Alayna E) |
| BBB | ✅ | ✅ best-in-app | ✅ |
| Hammer | ⚠️ undefined× | ⚠️ response model | ✅ |
| Stableford | ✅ | ❌ no panel | ⚠️ no breakdown |
| Dots | ✅ | ✅ (Greenie nit) | ⚠️ tally mismatch |
| Banker | ⚠️ silent disable <3p | ❌ no panel | ✅ math correct, no breakdown |
| Quota | ⚠️ HCP-0 targets | ❌ no panel | ❌ nothing renders |

---

## Recommended order of attack

1. **P0 #1 — find and fix the silent guest-session downgrade.** Everything else (handicaps, ledger, notifications, pay links) hangs off the session staying who it is.
2. **P0 #2 — Stableford/Quota/Banker in-game panel + settle breakdown.** One shared "who's winning right now" panel component likely covers all three.
3. **P0 #3 — Nassau live status + partial-round zero-sum fix.**
4. **P1 #4 — merge the payment-handle fix** (patch written and validated: `fix-payment-handle-merge.patch`, tsc -b clean, 246/246 tests).
5. **P1 #5–7** (Dots math, Wolf losing-partner math, disabled-game captions, Hammer cleanup), then the P2 copy sweep.

**Housekeeping — done:** all 11 audit rounds were deleted from the (guest) session's History; the older JL-account rounds were not visible in guest scope and were not touched. **Jeff: sign back in on this browser** — the session is currently anonymous.
