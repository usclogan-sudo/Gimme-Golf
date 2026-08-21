# Gimme · Full Re-Audit

**v4.0 · August 21, 2026 · Supersedes v3.2**

> Complete live pass against production: Play, Rounds, Group, You, scoring, leaderboard, history, result card, Ledger, Players, My Stats. Everything below was observed directly this session. Nothing here is carried forward on report.

---

## 1. What shipped, and it is a lot

The build has moved substantially since August 10. Verified live:

**The result card is built and it is right.** Navy field, brass inner frame, oval G seal stamped at top, tracked-caps eyebrow (`CAMARILLO SPRINGS · SKINS` / `AUGUST 5, 2026 · 1 HOLE`), Playfair headline reading `Test / takes it.` with `+25` in brass, an italic sub-line (`Everyone else was playing for second.`), ranked standings with the winner in brass, a `SETTLE UP` block with a brass arrow, and a `THAT'S GOOD. / gimme.gg` footer on a hairline. It renders inside Round History as the expanded row. This is the flagship artifact and it looks like the brand.

Also shipped: the four-tab bar; `Hole · Grid · Leaderboard`; the invite strip (`4 playing · Share link · + Add players`); compact live-round rows; the destructive inversion fixed; par-anchored score chips with a brass par marker; a single navy selected state; commit-on-tap with a `Saved. You're good.` toast; the non-blocking incomplete-hole warning; `Share the standings`; a Wolf in-game panel; history rows leading with outcome (`You won +3 pts`, `You lost 50 pts`, `You broke even`); the Ledger's red panel replaced with brass and neutral; Ledger rows now expanding to a per-round breakdown with `Pay A-Aron`; and the `$0` on the Nassau row now reading `0 pts`.

That is most of v2.1 and a good part of v3.

---

## 2. P0 · The record still contradicts itself, and I can now localize it

Measured this session, same account, same minute.

| Metric | My Stats | Leaderboard |
|---|---|---|
| Rounds | 9 | 9 |
| Win rate | **29%** | **22%** |
| Net | +1925 pts | +1925 pts |
| Eagles+ | 2 | 2 |
| Birdies | **0** | **2** |
| Pars | **1** | **8** |
| Bogeys | **3** | **10** |
| Doubles | **3** | **4** |
| Worse | **0** | **1** |
| Distribution total | **9 holes** | **27 holes** |

Net now agrees, which is progress. Two things still do not, and the arithmetic points at both causes.

**Win rate.** Both screens agree on 2 wins. 2/9 = 22%. 2/7 = 29%. The denominators differ: Leaderboard divides by 9 rounds, My Stats divides by 7. Something in the Stats query is excluding two rounds from the denominator while the header still reports 9.

**Scoring distribution.** My Stats totals exactly 9 holes across 9 rounds. Leaderboard totals exactly 27 across the same 9 rounds. That ratio is not noise. My Stats appears to be counting one hole per round, which is the signature of an index or a `find` where a `filter` belongs. The one category that matches, Eagles+ at 2, matches by coincidence of small numbers.

**Third contradiction, unchanged.** Ledger says you owe A-Aron 75 pts. My Stats head-to-head says A-Aron +1950 pts in your favour. Opposite signs on the same relationship. If these measure different things, lifetime net versus outstanding balance, the labels must say so, because no user can reconcile them.

**This still blocks the card.** The card publishes these figures into a group chat where four people check them against each other. Everything else in this document is secondary to it.

---

## 3. P0 · Two dead navigation layers, not one

`Group` and `Rounds` are both menus rather than destinations.

`Group` renders a single card, `Players · Everyone you've played with`, above an empty screen. Confirmed exactly as you described.

`Rounds` renders four rows: `Round History`, `Leaderboard`, `Ledger`, `Tournaments`. The old `More` tile grid was not deleted. It was split across two tabs and restyled as rows.

So the tab bar shipped, but the layer it was meant to remove is still there, one level down. Every destination is two taps, same as before.

**Fix:**

- `Group` becomes `Players` and lands directly on the roster.
- `Rounds` lands directly on Round History, which is what the tab means. `Leaderboard` becomes a segmented control at the top of that screen. `Ledger` merges into `Players` per §7. `Tournaments` is a product decision (§9).

**Also:** Players rows are not tappable. Tapping `A-Aron` does nothing. There is no add action, no balance, and no head-to-head. The roster is a read-only list.

**Also:** the header back arrow on Ledger returns to `Play`, not to the `Rounds` tab it was opened from. Back should return to origin.

---

## 4. P0 · The confirm panel

Confirmed live. `Next Hole` does not advance. It appends an inline panel titled `Confirm Hole 2 Scores`, listing the same four scores visible about 200px above it, with `Confirm & Next` and `Edit Scores`. Because it appends below the player rows it lands below the fold, so advancing costs a tap, a scroll, and a second tap.

`Edit Scores` is the tell: its only job is to dismiss a panel that should not have opened.

**Fix.** `Next Hole` advances. When the last empty score is filled, resolve the outcome, hold 400ms, advance automatically. Footer shows `Hole 2 saved · Undo` for five seconds. Never auto-advance with a blank score, and never on an edit to a complete hole. `Confirm & Next` is iOS blue and off-palette regardless. Confirm once per round, at `End Round`, and name the consequence there.

---

## 5. P0 · The leaderboard names the wrong winner

Las Posas, hole 3, Wolf, four players:

```
POS  PLAYER    THRU  GROSS  NET  VS PAR
1    Alayna    2     8      4    +1     ← brass highlight
2    A-Aron    2     8      7    +1
2    Test      2     6      7    −1
4    Admin     2     8      8    +1

WOLF (NET) — UNITS
Alayna: +2   Test: +2   A-Aron: −2   Admin: −2
```

A-Aron is ranked second while tied last in the game. Admin is ranked fourth with an identical game standing. The table sorts, positions, and brass-highlights by stroke score, and prints the actual result underneath as four chips. Brass means winning per the token rules, and it is on the wrong row.

Two related faults. The units print twice, `WOLF (NET)` and `WOLF (GROSS)`, with identical values. And hole 2 completed with all four scores and produced no outcome line at all, because no partner had been picked, with nothing on screen saying so.

**Fix.** Rank by game result. Tabs become `Enter · Wolf · Card`, the middle tab named for the game in play or `Games` when several run. `Card` holds gross, net, vs par. Print units once. Every completed hole states an outcome, including `Admin still needs a partner. Pick one to settle hole 2.`

---

## 6. P1 · The settle path is still three taps and still gold

Round History row, expand, then `Settle Up`. The expanded row shows the card, then a gross/net table, then three buttons: `Settle Up` in a gold gradient with a money-bag emoji, `Play Again` in navy, and `Delete` at equal visual weight.

- `Settle Up` should be navy primary. The gold gradient and the 💰 are the last money-coded elements in the flow and they sit directly under a card that gets the tone exactly right.
- `Delete` should not be a peer of the primary action. Move it into an overflow.
- The gross/net table below the card duplicates what the card already says. Collapse it.
- Settling from history should be one tap, not three.

---

## 7. P1 · Ledger and Players are the same screen

The Ledger improved: the red panel is gone, `OWED TO YOU` and `YOU OWE` are brass and neutral, rows expand to a per-round breakdown, and `Pay A-Aron` appears with `Copy settle message`.

But `Copy settle message` is the only option, because A-Aron has no payment handle. The Players screen confirms it: A-Aron shows no rail chips, while Alayna shows Zelle and Danny shows Venmo. So the degradation is correct, and the missing piece is an `Ask A-Aron for their handle` action that opens a prefilled message. Never show a dead end where a capability is missing.

Merge the two screens. The roster and the balance list are the same people:

```
A-Aron                                   −75
HCP 12 · 9 rounds · no handle        Ask A-Aron

Tam Tam                                   +3
HCP 8 · 1 round · Venmo             they owe you
```

Removes a dead-end screen, puts a settle action one tap from anywhere, makes rows tappable, and surfaces missing handles before the round rather than after.

The full-width `← Back` bar at the bottom of Ledger is still there, still styled as a primary action, still duplicating the header arrow, and it currently overlaps the `Copy settle message` button. Remove it everywhere.

---

## 8. P1 · Smaller confirmed items

- **Header.** Wordmark, tagline, avatar, and `Sign Out` on every screen at roughly 150px. `Sign Out` belongs in `You`. The tagline belongs on `Play` and auth only.
- **`Gimme Golf · Beta`** floats as orphaned text at the bottom of `Group`, `Rounds`, and `Play`.
- **Emoji** persist in Game Breakdown and history rows: ⛳ 📊 📖 📋 🐺 🔴. Replace with the monogram markers.
- **Wolf panel** is lavender and purple, from no part of the brand system. It is structurally the best game surface in the app and should become the pattern for the other formats, on the right palette.
- **`Saved. You're good.`** is correct in voice, green in colour, and overlays the invite strip while visible.
- **Handicap notation.** `HCP 54 · +2 strokes` sits eight rows above `HCP +6`. The first `+` means strokes received, the second means a plus handicap. Render strokes received as `receives 2`.
- **Player rows** are roughly 166px. Four players puts the advance action below the fold on every hole. Target 88px.
- **Tab icons.** `Group` and `You` are near-identical silhouettes and adjacent. Give `You` the avatar.
- **VS PAR** still renders over-par in red on both the leaderboard and the history table.

---

## 9. Product decisions still open

`Create Event`, `Tournaments`, `Leaderboard`, and `Play Again` coexist with no stated relationship. Settle on `Round`, `Game`, `Season`. Fold `Event` into `Round` as a property. Remove `Tournament` or define it.

`Play Again` still sits below the fold on `Play`, styled as a minor row, though it now correctly shows 4 players. Promote it to the primary action when a previous round exists. Six taps to one.

---

## 10. Revised priority

| # | Item | Size | Notes |
|---|---|---|---|
| 1 | Fix the Stats/Leaderboard denominators and hole counting (§2) | ? | Blocking. Leads: denominator 7 vs 9, one hole per round vs three |
| 2 | Label or reconcile Ledger vs head-to-head sign (§2) | S | Blocking |
| 3 | Remove the confirm panel, auto-advance with undo (§4) | S | Two taps and a scroll per hole |
| 4 | `Group` → `Players`, lands on roster; `Rounds` → history (§3) | S | Two dead layers |
| 5 | Always state the hole outcome, including unresolved (§5) | S | Fixes a silent failure |
| 6 | Rank the leaderboard by game result, rename the tab (§5) | M | Needs 1 |
| 7 | `Settle Up` to navy, `Delete` to overflow, collapse the duplicate table (§6) | S | Last money-coded surface |
| 8 | Players rows tappable, add action, balances, handle prompts (§7) | M | Direct north-star lever |
| 9 | Remove `← Back` bars, fix back-to-origin (§3, §7) | S | |
| 10 | Header reclaim, toast colour, handicap notation (§8) | S | |
| 11 | Wolf panel on-palette, emoji sweep (§8) | M | |
| 12 | Compact player rows to 88px (§8) | M | |
| 13 | `Play Again` as primary (§9) | S | Six taps to one |
| 14 | Object model (§9) | M | Product decision |

Items 3, 4, 5, 7, 9 and 10 are all S, independent, and fix everything a user would notice in a first round. Items 1 and 2 gate the card going anywhere near a real group.

**THAT'S GOOD.**
