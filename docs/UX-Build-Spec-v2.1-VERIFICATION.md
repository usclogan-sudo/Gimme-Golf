# UX Build Spec v2.1 — Claim Verification

**Purpose:** `docs/Gimme-UX-Build-Spec-v2_1.md` is a design audit whose findings assert specific facts about the code. Several drove P0 priority and one was tagged "blocking." Before building tickets off it, every concrete, checkable claim was verified against the source on branch `main` (Aug 10, 2026). This document records what held up, what was exaggerated, and what was wrong — with `file:line` evidence.

**Headline:** the audit is directionally sound but imprecise. Its core P0 brand complaints are real; it is padded with exaggerations, a few outright-wrong specifics, and its scariest "blocking" claim (§12) is overstated. Two of its root-cause attributions are wrong even where the symptom is real. Treat it as leads, not gospel — the remediation *directions* are mostly fine even where the diagnosis is off.

Rough tally: ~55% solidly valid · ~25% overstated/partial · ~20% wrong on specifics.

---

## Verdicts

| § | Claim | Verdict | Evidence / correction |
|---|---|---|---|
| **11** | Rules modals full of prohibited language, in a content file (not JSX), no max-width | ✅ **Valid** | All 7 quoted strings live verbatim in `src/data/gameRules.ts:16–31` (e.g. "Total pot = buy-in x number of players.", "Optional presses let players double down mid-round.", "Each hole has one skin up for grabs."). Rendered by `GameRulesModal.tsx`, which sets **no `max-w-*`**. Nits: **11 formats, not "~10"**; the Skins header glyph is 🎰 (slot machine), not a "bank building" (🏦 is on the *Banker* format) — the point stands, the glyph was misnamed |
| **13** | Live `$0` money leak from "a surviving `fmtMoney()` call" | ✅ **Symptom valid, cause wrong** | The `$0` is real, but from a **hardcoded `'$0'` literal** in `PersonalDashboard.tsx:37` (`fmtSigned`'s zero case), **not** a `fmtMoney()` call. `fmtMoney` (`gameLogic.ts:2130`) is only called in `NewRound` (setup). **Fixed** in this branch → returns `'0 pts'`. It was the only literal-`$` leak in a user-facing string |
| **16.2** | Batch entry can silently lose data | ✅ **Valid (serious)** | Standard entry auto-saves via a 250ms debounce (`Scorecard.tsx:749–793`). Batch entry holds edits in local `batchScores` state and only writes on the explicit "Save All Scores" button (`~2445–2467`). `useUnsavedChangesPrompt` guards `pendingCount`, **not** `batchScores` (`Scorecard.tsx:252`) → filling the grid and navigating away loses the work with no warning. This is only a P1 in the doc; it is the most consequential correctness finding and should be pulled forward |
| **16.1 / 16.4** | Two saturated blue buttons; sub-44px cells | ✅ **Valid** | Both buttons `bg-blue-600` (`Scorecard.tsx:2421–2422, 2518`); grid cell is `h-10` = **40px** tall (`:2506`), under the 44px touch minimum (width `w-12`/48px is fine) |
| **17** | `Reset Stats` in two places, red | ✅ **Valid** | Stats/Leaderboard header (`Stats.tsx:296–301`) **and** Settings (`Settings.tsx:416–425`), plus `Delete All Courses`. (Both Settings actions *do* have confirm modals; only account-delete requires typed confirmation) |
| **14** | Dark-mode `Save Profile`/`Update Password` lose their fill | ✅ **Valid** | Both are `bg-gray-800` with no `dark:` override (`Settings.tsx:289–295, 402–408`); cards go `dark:bg-gray-800` → buttons blend in. Dark bg is Tailwind `gray-900` (#111827), a generic near-black, not brand navy — matches the audit's point |
| **18** | Ledger: red owe-panel, **no settle action (dead end)**, full-width `← Back` bar, raw checkbox | ⚠️ **Partly — one claim FALSE** | Red panel ✓ (`Ledger.tsx:289–292`), full-width Back bar ✓ (`:382–386`). But **"no settle action" is FALSE** — `PaymentButtons` on balance rows (`:355`) + "Mark All Settled" (`:360–371`). The "raw unstyled checkbox" is Tailwind-styled (`:258–266`) |
| **12** | "The record contradicts itself" — Stats/Leaderboard/Ledger disagree (**blocking; don't ship the card**) | ⚠️ **Overstated** | Stats and Leaderboard load from the **same** Supabase query (no "cache vs aggregate" split). The win-rate gap is a **by-design denominator difference** — Stats uses all rounds (`Stats.tsx:321`), PersonalDashboard uses rounds-with-a-game (`PersonalDashboard.tsx:283`); score distributions differ because one is personal and one is aggregate. This is confusing/unlabeled semantics, **not** conflicting math. The head-to-head +1950 vs −75 (lifetime net vs outstanding balance) is plausibly legitimate but can't be confirmed statically. **Recommendation:** label the figures (`Lifetime net` vs `Outstanding balance`); this is not a hard blocker on the ResultCard |
| **12 (adjacent)** | (agent hypothesis) Ledger shows dollars as points — a 100× error | ❌ **Not an unconditional bug** | `Ledger.tsx:355` passes `Math.abs(b.netCents) * 100` as real cents to `PaymentButtons`, i.e. `netCents` actually **holds points**; `fmtAmount(value, 'points')` then renders it correctly. The 100× only occurs for legacy money-mode rounds mixed into the ledger — the **known, pre-existing cross-mode limitation**, not a regression. Do **not** naively "fix" it: a change would break the correct points-mode common case |
| **16.3** | Grid "only shows Front 9, no way to reach 10–18" | ⚠️ **Partly** | Grid shows the half containing the current hole and labels it (`Scorecard.tsx:2430–2436, 2472`); the ← › hole-nav buttons switch halves. "No visible way" is overstated |
| **15** | Live Spectator Link produces **no** feedback | ❌ **Mostly wrong** | The handler sets `inviteToast('Spectator link copied!')` (`Scorecard.tsx:~1513`). Feedback exists; it's just less prominent than the modal-based menu items |
| **19** | Players: `REGISTERED` on **every** row; brand-colored chips; avatars purple/blue/red/magenta | ❌ **Mostly wrong** | Badge is **conditional** on `player.isRegistered` (`PlayerDirectory.tsx:236–238`), not every row. Avatars are emerald/teal/cyan/blue/violet/rose (`AvatarPicker.tsx:148–151`), not the claimed colors. Payment chips *are* Tailwind blue/purple/green/yellow (partly valid). "No invite action on the screen" ✓ |

---

## Implications for sequencing

1. **The ResultCard is not blocked the way §24 claims.** §12 is a labeling cleanup on a shared data source, not a settlement-math emergency. Downgrade "don't ship the card until §12" to "label the figures." The card (PR #39) can proceed on its own merits.
2. **Pull §16.2 (batch-entry data loss) forward.** It's a genuine "fill the grid, hit back, lose the round" bug, mis-prioritized as P1.
3. **Fix the root causes the audit named wrong.** §13 is a literal, not `fmtMoney` (done here). The §12 "Ledger 100×" is the known cross-mode limitation, not a fresh bug — leave it or address it deliberately with per-round mode plumbing, never as a drive-by.
4. **Discount §15, §18 "dead end", and §19 specifics** — verify before writing those tickets.

## Recommended (not done here)
- Add a CI grep guard for literal `$` in user-facing strings (§13/§22) — but first whitelist `NewRound`'s legitimate setup-time `fmtMoney` usage so it doesn't red the build.
- Add a regression test for `fmtSigned` (requires exporting it from `PersonalDashboard`).

---

*Verification by four parallel read-only code audits, Aug 10 2026. Line numbers are against `main` at time of writing.*
