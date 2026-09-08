# Gimme · Game Settlement · Complete Specification

**v1.0 · September 8, 2026 · Supersedes the two separate notes of the same date**

> All eleven formats, the research behind each, and the work to fix them. Code read from `src/lib/gameLogic.ts`. Standard practice from Golf Digest, GOLF.com, The Fried Egg, 18Birdies, Wikipedia, and the competitor guides at Settle Up Golf, Stick, Cleek, BetWaggle and Rabbit Golf.
>
> Triggered by the September 7 round at Las Posas: four players, 25 tokens each, BBB, settling +11 / −1 / −3 / −7 with no way to check the number.

---

## Part 1 · The problem across all formats

### 1.1 Summary

| Format | How it is normally settled | What Gimme does | Verdict |
|---|---|---|---|
| **Skins** | Pot, divided by skins won | Pot, per skin | ✅ Correct |
| **Dots / junk** | Per dot, direct | Direct net settlement | ✅ Correct |
| **Hammer** | Per hole, direct, doubling | Direct net settlement | ✅ Correct |
| **Quota** | Points over/under target | Pot split by points over target | ⚠️ Defensible, one bug |
| **Nassau** | **Three separate bets of the stated amount** | One pot split into thirds | ❌ Wrong semantics |
| **Wolf** | **Value per point** | Pot split by positive units | ❌ Magnitude ignored |
| **Vegas** | **Value per point on the differential** | Winning team splits the pot | ❌ Magnitude ignored |
| **BBB** | **Value per point** | Pot split by points | ❌ Rate floats |
| **Stableford** | Competition, or per point vs field | Pot split by total points | ❌ Produces no result |
| **Banker** | Value per unit | Pot split by positive units | ❌ Magnitude ignored |
| **Best Ball** | Depends on wrapper, usually Nassau or match | Pot | ⚠️ Decide explicitly |

### 1.2 The single underlying flaw

Nine of eleven formats route through the same shape:

```ts
const totalPot = game.buyInCents * players.length
const share = Math.floor((metric / totalMetric) * totalPot)
```

**Proportional-to-total only behaves sensibly when the metric starts at zero.** Skins won, points over quota and units won all start at zero, so twice the metric earns twice the share. It fails two ways.

**a. Metrics with a large common base collapse.** Stableford scores 2 points for par, so everyone finishes near 30 to 38 regardless of the match. Four players, 25 each, finishing 38 / 36 / 34 / 30:

| Player | Points | Share of 100 | Net |
|---|---|---|---|
| A | 38 | 27.5 | **+2.5** |
| B | 36 | 26.1 | **+1.1** |
| C | 34 | 24.6 | **−0.4** |
| D | 30 | 21.7 | **−3.3** |

An eight-point win settles for 2.5 tokens on a 25 entry. The game produces no result.

**b. Magnitude of victory disappears.** In Wolf and Banker, `centsPerUnit = totalPot / positiveUnits`, so the per-unit value and the units won cancel. A one-unit win pays what a forty-unit win pays. In Vegas the winning team splits the pot whether they won by 5 points or 200.

**c. The rate is unknowable in advance,** because the denominator is produced during play. See §2.2.

### 1.3 The fix, in one line

Two settlement models, chosen per format:

| Model | Input | Settlement | Formats |
|---|---|---|---|
| **Pot** | tokens per player | Split by a zero-based metric | Skins, Quota |
| **Per unit** | tokens per point / unit / segment | Direct, zero-sum, unbounded | Wolf, Vegas, BBB, Stableford, Banker, Nassau, Dots, Hammer |

Dots and Hammer already do this, and the code says so: *"Dots is direct settlement, not pot-based"* and *"In hammer, there's no traditional pot."* The path exists. It needs to be the default for the seven formats misusing the pot.

---

## Part 2 · Bingo Bango Bongo, in full

### 2.1 How the game is actually settled

- Three points per hole, 54 in a full round. First on the green, closest to the pin once all are on, first to hole out.
- **Groups set a value per point before teeing off, not a buy-in.** Cited ranges are $0.25 to $2 and $1 to $5, with a dollar a point the default.
- Settle Up Golf documents three methods: straight payout against the field average, winner-take-all against a buy-in, and head-to-head on the point differential. Their worked example is 16 points against an average of 13.5, collecting $2.50.

Gimme uses none of these. It pools buy-ins and splits proportionally.

### 2.2 Why the September 7 card was confusing

The arithmetic was correct. Reconstruction:

| Player | Points | Payout | Net shown |
|---|---|---|---|
| A-Aron | 18 | 36 | **+11** |
| Jeff Logan | 12 | 24 | **−1** |
| Michael Ek | 11 | 22 | **−3** |
| Jeff Hirth | 9 | 18 | **−7** |
| | 50 | 100 | 0 |

Payouts sum to the 100 token pot, nets sum to zero, and the settle-up lines add to A-Aron's +11.

**But the rate floated.** Effective value is `(buy-in × players) ÷ total points awarded`:

| Scenario | Points | Value per point |
|---|---|---|
| Full 18 holes | 54 | 1.85 |
| **The actual round** | **50** | **2.00** |
| Nine holes | 27 | 3.70 |

The four assignments nobody tapped raised every other point by 8%. A model where data-entry gaps move the exchange rate cannot be defended to a group arguing about it.

Under the three models, on the same round:

| Player | Points | Gimme now | Per point vs avg (1/pt) | Head to head (1/pt) |
|---|---|---|---|---|
| A-Aron | 18 | +11 | +5.5 | +22 |
| Jeff Logan | 12 | −1 | −0.5 | −2 |
| Michael Ek | 11 | −3 | −1.5 | −6 |
| Jeff Hirth | 9 | −7 | −3.5 | −14 |

The objection is not that the spread is too small. It is that nobody could predict or verify the rate.

### 2.3 Setup screen

Replace `POINTS PER PLAYER` for BBB with:

```
VALUE PER POINT
[ 0.25 ]  [ 0.5 ]  [ 1 ]  [ 2 ]     Custom [    ]

54 points in a full round · about 13 each.
A typical round settles within ±10 tokens at 1 per point.
```

The second line is the important part. It tells the organizer what they are signing up for, which the current screen never does.

### 2.4 Settlement

```ts
export function calculateBBBSettlement(
  result: BBBResult,
  valuePerPoint: number,
  players: Player[],
): PlayerNet[] {
  const n = players.length
  const T = result.totalPoints
  // vs-average:   valuePerPoint × (p_i − T/n)
  // head-to-head: valuePerPoint × (n × p_i − T)   ← always integer
  return players.map(p => ({
    playerId: p.id,
    net: valuePerPoint * (result.pointsWon[p.id] - T / n),
  }))
}
```

**On fractions.** The vs-average method gives halves and quarters whenever `T` is not divisible by the player count, which is most rounds. Two options: allow fractional tokens displayed to one decimal, which is what standard practice does and what the competitor's own example shows; or use head-to-head, which is always integer but multiplies the stake by the player count and must be labelled `value per point, per opponent`.

Recommend fractions to one decimal. It keeps the number the group agreed on intact.

### 2.5 The scorecard grid

Traditional, and it solves two problems: unassigned points become visible, and the settlement gets an audit trail. Sized for a 393px viewport, four columns fit.

```
BINGO BANGO BONGO                          thru 17

HOLE   BINGO   BANGO   BONGO
  1     AA      JL      AA
  2     ME      ME      JH
  3     AA      AA      AA
  4     JL       —      ME        ← gap is visible
  5     JH      AA      AA
 ...
 17     AA      ME      JL

POINTS          AA 18 · JL 12 · ME 11 · JH 9
AWARDED         50 of 51 · 1 unassigned
```

- Unassigned renders as `—` in brass, not blank. It is a gap in the record and it changes the settlement.
- `50 of 51` would have told the group on the day that taps were missed.
- Tapping a cell opens the assignment picker for that hole, so the grid is also the correction surface.
- Tapping a player name filters to their points.

**Where it lives:** the `Grid` tab already exists and shows a stroke grid. For a BBB round it shows this instead, or offers `Points · Strokes` as a segmented control, since BBB rounds often have no stroke scores at all.

### 2.6 `0 HOLES` on the result card

The card printed `SEPTEMBER 7, 2026 · 0 HOLES` for a full round. Holes played is derived from stroke scores, BBB points are stored separately, and `Enter golf scores` is an optional collapsed section. So a complete BBB round produces a card claiming nothing happened.

**Fix:** derive holes played from any recorded activity, game points included.

### 2.7 Points summary on the card

Add above the settle block:

```
POINTS        BINGO   BANGO   BONGO   TOTAL
A-Aron          7       6       5       18
Jeff Logan      4       4       4       12
Michael Ek      4       3       4       11
Jeff Hirth      2       4       3        9

At 2.00 per point · 50 points awarded
```

That last line is the whole point. It states the rate, so the settlement is checkable rather than asserted.

---

## Part 3 · The other formats

### 3.1 Skins ✅ · Dots ✅ · Hammer ✅

No change. Dots and Hammer are the pattern the others should follow.

### 3.2 Nassau ❌ · wrong semantics

A "$5 Nassau" means five dollars on **each** of three bets, fifteen at stake, and presses add further bets of the same size. Sources are unanimous: three separate outcomes, three separate settlements.

```ts
const totalPot = game.buyInCents * players.length
const segPot = Math.floor(totalPot / 3)     // ← 25 becomes ~8 per segment
```

A golfer saying "25 Nassau" means 25 per segment, 75 at risk. **Off by a factor of three, understating exposure.** Presses are worse: exposure grows during the round, and a fixed pot cannot represent that. The elaborate refund logic for unwon segment pot exists precisely because the pot framing does not fit.

**Fix:** input is `value per segment`. Total exposure is three times that, stated at setup. Each press adds a bet of the same value. Settlement is the sum of the individual bets.

### 3.3 Wolf ❌ · magnitude ignored

Standard is a value per point, commonly a dollar, Lone Wolf at double and Blind Wolf at triple, settled against the field average or head-to-head. A competitor's worked round runs +$112 / +$32 / −$48 / −$96.

Gimme computes units correctly, including Lone Wolf at 2x, then discards magnitude at settlement.

**Fix:** input is `value per point`. Settle on net units directly, following the Dots pattern.

### 3.4 Vegas ❌ · magnitude ignored

Scores pair into a two-digit number, low digit first. The difference between team numbers is that hole's points. Points accumulate and multiply by an agreed value, commonly $0.10 to $1.00 because totals get large. A birdie flip can turn an 11-point hole into 29.

**Fix:** input is `value per point`. Settle on the accumulated differential. Offer the common double-bogey cap on individual scores as a setup option, since one hole can otherwise generate hundreds of points.

### 3.5 Stableford ❌ · produces no result

Standard Stableford is a competition format. With money attached it is a fixed prize for the winner or a per-point settlement against the field average. Never a proportional split of a base-heavy total. Arithmetic in §1.2a.

**Fix:** per point against the field average, or an explicit `winner takes the pot`.

### 3.6 Quota ⚠️ · one bug

Points over target is zero-based, so the proportional model is coherent here. But:

```ts
if (totalPositive === 0) {
  if (result.winner) {
    return [{ playerId: result.winner, amountCents: totalPot, ... }]
```

When nobody beats their quota, the player who came closest takes the **entire pot**. Missing by one on a day everyone missed should not pay 100%.

### 3.7 Banker ❌

Same shape as Wolf. Value per unit, settled directly.

### 3.8 Best Ball ⚠️

A scoring method rather than a settlement model, normally wrapped in a Nassau or a match. Decide the framing explicitly rather than inheriting the pot default.

---

## Part 4 · Cross-cutting requirements

### 4.1 State exposure at setup

Per-unit settlement is unbounded, which is the main argument for the pot and worth addressing rather than avoiding. Every per-unit setup screen states the realistic range:

```
VALUE PER POINT        [ 0.25 ]  [ 0.5 ]  [ 1 ]  [ 2 ]

Wolf rounds usually swing 10–30 points.
At 1 per point, expect ±10 to ±30 tokens.
```

That line does what a pot does, without breaking the game.

### 4.2 Keep the pot as a labelled alternative

```
HOW TO SETTLE
( ) Per point     Standard. Swings match the play.
( ) Split a pot   Everyone puts in 25. Nobody can lose more than that.
```

Two clearly labelled models chosen deliberately beats one model nobody recognises.

### 4.3 State the rate on every result card

`At 1.00 per point · 34 points` or `Pot of 100 · 12 skins`. The reason the September 7 card needed explaining is that it asserted a number with no way to check it.

---

## Part 5 · Build order

| # | Item | Size | Notes |
|---|---|---|---|
| 1 | Holes played from game activity, not stroke scores (§2.6) | S | Fixes `0 HOLES` |
| 2 | BBB points grid in the `Grid` tab, gaps shown (§2.5) | M | |
| 3 | Rate stated on every result card (§2.7, §4.3) | S | Makes settlements checkable |
| 4 | Wolf and Banker settle on net units (§3.3, §3.7) | S | Follow the Dots pattern |
| 5 | Vegas settles on accumulated differential (§3.4) | S | |
| 6 | Stableford: winner-takes or per point vs average (§3.5) | S | |
| 7 | Quota: fix winner-take-all when nobody beats quota (§3.6) | S | |
| 8 | BBB: `VALUE PER POINT` input and per-point settlement (§2.3, §2.4) | M | |
| 9 | Nassau: value per segment, presses add bets (§3.2) | M | Currently understates threefold |
| 10 | `Per point` / `Split a pot` explicit choice (§4.2) | S | |
| 11 | Expected-range line on per-unit setup screens (§4.1) | S | |
| 12 | Best Ball framing decision (§3.8) | S | Product call |

**Items 1 through 3 are worth doing regardless of which settlement model wins**, because they make the existing numbers verifiable. Items 4 through 7 are small, independent, and restore four formats to behaving like the games they are named after. Items 8 and 9 change what the number is and should ship together with 10 and 11.

---

## Part 6 · Sources

Golf Digest and Wikipedia on Nassau structure and presses · The Fried Egg on Wolf, Vegas and BBB point values · 18Birdies knowledge base on Wolf, Vegas and BBB scoring · GOLF.com and The Left Rough on BBB and Wolf · Settle Up Golf, Stick, Cleek, BetWaggle and Rabbit Golf on settlement methods and typical point values
