# Gimme · Game Formats vs Standard Practice

**September 8, 2026 · Research and code review of all eleven formats**

> Code read from `src/lib/gameLogic.ts`. Standard practice from Golf Digest, GOLF.com, The Fried Egg, 18Birdies, Wikipedia, and the competitor guides at Settle Up Golf, Stick, Cleek and BetWaggle.
>
> Companion to the BBB settlement note of the same date. This covers the other ten.

---

## 1 · Summary

| Format | How it is normally settled | What Gimme does | Verdict |
|---|---|---|---|
| **Skins** | Pot, divided by skins won | Pot, per skin | ✅ Correct |
| **Dots / junk** | Per dot, direct | Direct net settlement | ✅ Correct |
| **Hammer** | Per hole, direct, doubling | Direct net settlement | ✅ Correct |
| **Quota** | Points over/under target | Pot split by points over target | ⚠️ Defensible, not standard |
| **Nassau** | **Three separate bets of the stated amount** | One pot split into thirds | ❌ Wrong semantics |
| **Wolf** | **Value per point** | Pot split by positive units | ❌ Magnitude ignored |
| **Vegas** | **Value per point on the differential** | Winning team splits the pot | ❌ Magnitude ignored |
| **BBB** | **Value per point** | Pot split by points | ❌ Rate floats |
| **Stableford** | Competition, or per point vs field | Pot split by total points | ❌ Produces almost no result |
| **Banker** | Value per unit | Pot split by positive units | ❌ Magnitude ignored |
| **Best Ball** | Depends on wrapper (usually Nassau or match) | Pot | ⚠️ Depends on §4.2 |

Three correct, one arguable, seven that do not behave the way the game is meant to.

---

## 2 · The single underlying flaw

Nine of eleven formats route through the same shape:

```ts
const totalPot = game.buyInCents * players.length
const share = Math.floor((metric / totalMetric) * totalPot)
```

**Proportional-to-total only behaves sensibly when the metric starts at zero.** Skins won, points over quota, and units won all start at zero, so a player with twice the metric gets twice the share, which is the intuition the model relies on.

It fails in two distinct ways.

### 2a. Metrics with a large common base collapse

Stableford is the clearest case. Par scores 2 points, so every player accumulates roughly 30 to 38 points over a round regardless of how the match went. The differences between players are small relative to the base.

Four players, 25 tokens each, 100 in the pot, finishing on 38 / 36 / 34 / 30 points, total 138:

| Player | Points | Share of pot | Net |
|---|---|---|---|
| A | 38 | 27.5 | **+2.5** |
| B | 36 | 26.1 | **+1.1** |
| C | 34 | 24.6 | **−0.4** |
| D | 30 | 21.7 | **−3.3** |

An eight-point Stableford margin, which is a comfortable win, settles for two and a half tokens on a 25 token entry. **The game produces no result.** BBB has the same problem in milder form: a base of about 12.5 points per player against a spread of 9 to 18.

### 2b. Magnitude of victory disappears entirely

Wolf, Banker and Vegas all pay out the whole pot to whoever is positive, regardless of how far ahead they are.

```ts
// Wolf and Banker
const centsPerUnit = Math.floor(totalPot / positiveUnits)
```

The per-unit value is the pot divided by however many units were won, so the two cancel. **A one-unit win and a forty-unit win pay exactly the same.** In Vegas it is starker still: the winning team splits the pot whether they won by 5 points or 200.

That removes the entire point of these games. Wolf's appeal is that a Lone Wolf call swings the round. Vegas is described everywhere as the high-volatility format where one blow-up hole is catastrophic. Gimme flattens both to a binary outcome.

### 2c. The rate is not knowable in advance

Because the denominator is the total metric produced during play, the value of a point is unknown until the round ends, and it moves if assignments are missed. Documented in the BBB note: four unassigned points raised the value of every other point by 8%.

---

## 3 · Format by format

### 3.1 Skins ✅

Standard is a pot divided by skins won, with carryovers. Gimme matches. No change.

### 3.2 Dots and Hammer ✅

Both settle directly rather than from a pot, and the code says so:

```ts
// Dots is direct settlement, not pot-based. Use net cents directly.
// In hammer, there's no traditional pot. Settlements are direct.
```

Correct, and evidence the team already knows the distinction. These two are the model the others should follow.

### 3.3 Nassau ❌ · wrong semantics

A "$5 Nassau" means **five dollars on each of three bets**, fifteen at stake, and presses add further bets of the same size. Sources are unanimous: three separate outcomes, three separate settlements, each standing on its own.

Gimme takes one buy-in and splits it three ways:

```ts
const totalPot = game.buyInCents * players.length
const segPot = Math.floor(totalPot / 3)
```

So a 25 token Nassau puts about 8 tokens on each segment, when a golfer saying "25 Nassau" means 25 per segment and 75 at risk. **Off by a factor of three, in the direction of understating exposure.**

Presses are worse. A press is an additional bet of the original size, so exposure grows during the round. A fixed pot cannot represent that. The current code has an elaborate refund mechanism for unwon segment pot precisely because the pot framing does not fit.

**Fix:** input is `value per segment`. Total exposure is three times that, stated on the setup screen. Each press adds another bet of the same value. Settlement is the sum of the individual bets.

### 3.4 Wolf ❌ · magnitude ignored

Standard is a value per point, commonly a dollar, with Lone Wolf at double and Blind Wolf at triple. Settlement is either against the field average or head-to-head on point differential. One competitor's worked example runs to +$112 / +$32 / −$48 / −$96 on a round.

Gimme computes units correctly, including Lone Wolf at 2x, then discards the magnitude at settlement per §2b.

**Fix:** input is `value per point`. Settle on net units directly, exactly as Dots already does.

### 3.5 Vegas ❌ · magnitude ignored

Scores pair into a two-digit number, low digit first. The difference between team numbers is the points for that hole. Points accumulate across 18 holes and are multiplied by an agreed value, commonly $0.10 to $1.00 because totals get large. Birdie flips the opponent's number and can turn an 11-point hole into a 29-point hole.

Gimme computes the differential and then pays the winning team a fixed pot share. A 200-point Vegas beating and a 5-point squeaker settle identically.

**Fix:** input is `value per point`. Settle on the accumulated differential. Note the competitor guidance that most groups cap individual scores at double bogey to stop one hole generating hundreds of points; worth offering as a setup option.

### 3.6 Stableford ❌ · produces no result

Standard Stableford is a competition format, not a betting one. When money is attached it is usually a fixed prize for the winner, or a per-point settlement against the field average, never a proportional split of a base-heavy total. See §2a for the arithmetic.

**Fix:** either per point against the field average, or an explicit `winner takes the pot`. Proportional split is the one model that cannot work here.

### 3.7 Quota ⚠️ · defensible

Gimme splits the pot in proportion to points **over** the target, which is a zero-based metric, so §2a does not apply. Standard practice is closer to a per-point settlement on the over/under, but the current model is coherent.

One real bug: when nobody beats their quota, the entire pot goes to whoever came closest.

```ts
if (totalPositive === 0) {
  if (result.winner) {
    return [{ playerId: result.winner, amountCents: totalPot, reason: 'Quota — closest to target' }]
  }
```

A player who missed their quota by one, in a round where everyone missed, takes 100% of the pot. Under a per-point model they would be up slightly. Winner-take-all on a bad day for everyone is a surprising outcome to hand a group.

### 3.8 Banker ❌

Same shape as Wolf. Value per unit, settled directly.

### 3.9 Best Ball ⚠️

Best Ball is a scoring method rather than a settlement model; it is normally wrapped in a Nassau or a match. Whether the current pot treatment is right depends on how it is framed in the UI. Worth deciding explicitly rather than inheriting the pot default.

---

## 4 · Recommendation

### 4.1 Two settlement models, chosen per format

| Model | Input | Settlement | Formats |
|---|---|---|---|
| **Pot** | tokens per player | Pot split by a zero-based metric | Skins, Quota, Best Ball if framed as a pot |
| **Per unit** | tokens per point / per unit / per segment | Direct, zero-sum, unbounded | Wolf, Vegas, BBB, Stableford, Banker, Nassau, Dots, Hammer |

Dots and Hammer already work this way. The per-unit path exists in the codebase; it needs to be the default for the seven formats that currently misuse the pot.

### 4.2 State exposure at setup

Per-unit settlement is unbounded, which is the main argument for the pot model and worth addressing directly rather than avoiding. Every per-unit setup screen should state the realistic range before the round:

```
VALUE PER POINT        [ 0.25 ]  [ 0.5 ]  [ 1 ]  [ 2 ]

Wolf rounds usually swing 10–30 points.
At 1 per point, expect ±10 to ±30 tokens.
```

That single line does what a pot does — sets expectations — without breaking the game.

### 4.3 Keep the pot as a labelled alternative

For groups who want capped downside, offer it as an explicit choice rather than a silent default:

```
HOW TO SETTLE
( ) Per point     Standard. Swings match the play.
( ) Split a pot   Everyone puts in 25. Nobody can lose more than that.
```

### 4.4 Show the rate on the result card

Whichever model is used, the card should state it: `At 1.00 per point · 34 points` or `Pot of 100 · 12 skins`. The reason yesterday's BBB card needed explaining is that it asserted a number with no way to check it.

---

## 5 · Priority

| # | Item | Size | Notes |
|---|---|---|---|
| 1 | Nassau: value per segment, presses add bets | M | Currently understates the stake threefold |
| 2 | Wolf and Banker: settle on net units directly | S | Restores magnitude. Follow the Dots pattern |
| 3 | Vegas: settle on accumulated differential | S | Same |
| 4 | Stableford: winner-takes or per point vs average | S | Currently produces no result |
| 5 | BBB: value per point (see companion note) | M | |
| 6 | Quota: fix winner-take-all when nobody beats quota | S | |
| 7 | `Per point` / `Split a pot` as an explicit choice | S | |
| 8 | Expected-range line on every per-unit setup screen | S | Replaces the pot's reassurance |
| 9 | State the rate on the result card | S | Makes every settlement checkable |

Items 2, 3 and 4 are small, independent, and restore three formats to behaving like the games they are named after.

---

## 6 · Sources

Golf Digest and Wikipedia on Nassau structure and presses · The Fried Egg on Wolf, Vegas and BBB point values · 18Birdies knowledge base on Wolf, Vegas and BBB scoring · GOLF.com on BBB · The Left Rough on Wolf and BBB · Settle Up Golf, Stick, Cleek, BetWaggle and Rabbit Golf on settlement methods and typical point values
