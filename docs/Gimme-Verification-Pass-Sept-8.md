# Gimme · Verification Pass · September 8, 2026

**Live run against production, bundle `index-DwkhoNrz.js`, 407 × 683 CSS viewport (iPhone class), signed in as Jeff Logan.**

> Every line below is either observed in the browser or measured from the DOM with `getBoundingClientRect` / `getComputedStyle`. Nothing is inferred from source. Items I could not test as the organizer are listed in §4 rather than guessed at.

---

## 1 · Confirmed fixed

### 1.1 Event creation and the RLS recursion ✅

Created event `Audit A` at Camarillo Springs, three players, Skins. `Create Event & Start` succeeded and issued code `7M8KKY`.

**Console clean at creation time.** The only `42P17` entries in the buffer are stale, timestamped 5:36 and 5:44 PM against the retired bundles `index-C7nQCRHC` and `index-DQZwwZDy`. No new errors on `index-DwkhoNrz`.

**The round is linked to the event.** The scorecard header reads `Audit A · Camarillo Springs · Organizer`. `rounds.event_id` is populated, which was the write that previously failed.

### 1.2 The join screen ✅

Entering `7M8KKY` now returns a complete, actionable screen:

```
EVENT FOUND
Audit A
Camarillo Springs
Skins · 3 players · 1 groups · Hole 1

Which player are you?
  You've already joined! Tap your name to continue.

  Jeff Logan   G1   Your player      Continue →
  A-Aron       G1                    Join as →
  Admin        G1                    Join as →
```

Compare with the September 6 state: `Unknown Course · 0 players` above an empty list. The roster resolves, group numbers show, the user's own claim is identified, and every row is actionable. **This was the failure that stopped thirteen people scoring. It is fixed.**

Row heights: own row 333 × 66, other rows 333 × 50. Both above the 44px minimum.

### 1.3 The Choose Game overlay ✅

The full-screen `position: fixed` container that covered 92% of the viewport is gone. Game tiles render on load. No fixed element exceeds 40% of viewport height on any screen tested.

### 1.4 Award chips ✅

BBB assignment chips measure **163 × 44**, two per row. Previously 63–85 × 26, four across. Verified on the BBB surface only; see §4.

### 1.5 Per-point settlement ✅

Selecting `Per point` reveals:

```
VALUE PER POINT
[ 0.25 ] [ 0.5 ] [ 1 ] [ 2 ]      ← each 76 × 44
[ 1                          ]

54 points in a full round — about 13 each in a foursome.
At 1 per point, expect to finish within about ±5.
```

Presets are correctly sized and the exposure guidance is present and accurate.

### 1.6 The BBB grid ✅

Built and behaving correctly. Assigned Bingo and Bango on hole 1, deliberately skipped Bongo:

```
Bingo Bango Bongo                              thru 1
HOLE    BINGO    BANGO    BONGO
  1      AA       JH        —          ← rgb(245,158,11), brass
POINTS   AA 1 · JH 1 · JL 0 · ME 0
AWARDED  2 of 3 · 1 unassigned
Every point changes the settlement. Tap a hole to fill the gaps.
```

**This is the surface that would have caught the four missing taps on September 7.**

### 1.7 `0 HOLES` on the result card ✅

The September 7 BBB card now reads:

```
SEPTEMBER 7, 2026 · 18 HOLES · POT OF 100 TOKENS
```

Previously `0 HOLES`. Holes played now derives from game activity, and the settlement basis is stated.

### 1.8 Settle Up styling ✅

Now navy, no money-bag emoji. `Delete round` demoted below the primary actions.

---

## 2 · Contradicted by the live build

### 2.1 `Split a pot` is still the default, with a `0.25` entry · **P0**

The Choose Game screen opens with:

```
POINTS PER PLAYER
tokens [ 0.25 ]

HOW TO SETTLE
( ) Per point     Standard. Swings match the play.
(•) Split a pot   Everyone puts in 0 tokens. Nobody can lose more than that.
```

Three defects in one block:

1. **`Split a pot` is preselected.** The spec calls per point the standard. A user who taps straight through gets the pot model.
2. **The default entry is `0.25`,** which floors to zero.
3. **The copy therefore reads "Everyone puts in 0 tokens. Nobody can lose more than that."** A player choosing the pot is told nobody can lose more than nothing.

Fix: default to `Per point`; default the entry to `1`; render the pot copy from the live value and block advancing when it resolves to zero.

### 2.2 `POINTS PER PLAYER` persists above the settle picker · **P1**

The old label and input remain visible regardless of which model is selected, so the screen shows two competing inputs. When `Per point` is chosen, `POINTS PER PLAYER` should be replaced, not supplemented.

### 2.3 `Total points` renders with no value · **P1**

Previously `0 tokens`; now the label appears with nothing after it.

### 2.4 The stepper still reads `Stakes` · **P1**

Step 4 of the single-round wizard is still labelled `Stakes`, against the terminology rules, and remains unreachable since the step-3 button reads `Next: Start Round`.

### 2.5 The grid says "Tap a hole" but rows are not tappable · **P1**

Helper text reads `Tap a hole to fill the gaps`. I checked the row elements for click handlers and cursor styling and found neither. The instruction currently leads nowhere.

### 2.6 No points breakdown or rate on the card · **P1**

The card states `POT OF 100 TOKENS` but carries no per-category points table and no rate line. `hasPointsTable` is false; no `per point` phrase anywhere in the card. The spec called for:

```
POINTS        BINGO   BANGO   BONGO   TOTAL
A-Aron          7       6       5       18
...
At 2.00 per point · 50 points awarded
```

Without it the settlement is still asserted rather than checkable, which is the reason this whole thread started. The summary below the card does now show `Entry 25 tokens · Total tokens 100 · BBB · 54 points`, which is close, but it sits outside the shareable card and reports 54 points where 50 were awarded.

### 2.7 Touch targets outside the award chips · **P1**

Measured on the scoring screen:

| Control | Size |
|---|---|
| Hole prev `‹` / next `›` | **28 × 28** |
| `Hole 1` title | 55 × **28** |
| `Share link` | 83 × **32** |
| `+ Add players` | 118 × **32** |
| `Hole` / `Grid` / `Leaderboard` | 122 × **36** |
| `Game · Hole 1` accordion | 375 × **42** |
| `?` info buttons (5 on Choose Game) | **28 × 28** |
| `More Games (5 more)` | 328 × **36** |
| `Cancel` on Join | **32** |

The award chips were fixed. Nothing else on these screens was.

### 2.8 Play tab does not show the event name · **P2**

The scorecard header correctly reads `Audit A · Camarillo Springs`, but the live round row on Play reads `Camarillo Springs · Live · 3 players · Hole 1`. The event name is dropped where the organizer most often looks.

---

## 3 · Regression watch

`Leave Scoring?` now intercepts the back arrow with `Your round is saved and you can resume from the Home screen.` Correct behaviour and good copy. Flagging only because it is new since the last pass and adds a step to every exit.

---

## 4 · Not verifiable as the organizer

State plainly rather than assume:

| Claim | Why not testable here |
|---|---|
| **Scoring rights come from identity, not membership** | `isCreator` covers the organizer on every path, which is the exact asymmetry that hid this bug originally. Needs a second account, or a source read of `permissions.ts` and `Scorecard.tsx:2765` |
| **Players are told which of six states they're in** | Only ever saw `Organizer`. The other five states need a non-creator account |
| **All four award-chip surfaces are 44px** | Measured BBB only. Wolf, Nassau and whichever the fourth is were not opened |
| **Score entry stays open** | Not clear enough on the intended behaviour to design a test |

I can read the repo for the first two, which is the more reliable route since the organizer path masks them regardless of how many browsers are used.

---

## 5 · Work order

| # | Item | Size | Ref |
|---|---|---|---|
| 1 | Default to `Per point`; entry default `1`; block advancing on a zero stake | S | §2.1 |
| 2 | Render pot copy from the live value, never a floored zero | S | §2.1 |
| 3 | Replace `POINTS PER PLAYER` when `Per point` is selected | S | §2.2 |
| 4 | Restore a value on `Total points` | XS | §2.3 |
| 5 | Make grid rows tappable, or change the helper text | S | §2.5 |
| 6 | Points breakdown and rate line on the card itself | M | §2.6 |
| 7 | Reconcile `54 points` against points actually awarded | S | §2.6 |
| 8 | Touch targets to 44px: steppers, tabs, `?` buttons, header actions | M | §2.7 |
| 9 | Remove the `Stakes` step | S | §2.4 |
| 10 | Event name on the Play tab round row | XS | §2.8 |

Items 1 through 4 are the same block of the same screen and should ship together. Item 1 is P0: the default path currently produces a round with nothing at stake and copy that says so.

---

## 6 · Assessment

The two failures that mattered are fixed. Events create cleanly, the round links to the event, and the join screen resolves a real roster with claimable names. That closes the September 6 field-test failure.

The new blocks both render correctly on a phone. The grid does exactly what it was built for, showing an unassigned point as a brass dash with a running `2 of 3` count.

What remains is concentrated in one place: the settle-model block on Choose Game ships with the wrong default, a fractional entry, and copy that reads `0 tokens`. Everything else is small.
