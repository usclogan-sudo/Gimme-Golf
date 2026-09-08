# Gimme · Teams, Best Ball tournaments and Nassau · Scope

**September 8, 2026 · BACKLOG — scoped, not scheduled**

> Status: on the backlog as of 8 September. Nothing here is committed to. Picked up
> when a real event needs 2-person teams; until then Best Ball remains limited to
> two teams and Nassau remains understated threefold, both known and both survivable.

> Two formats that cannot currently be played the way people play them. They look
> like separate jobs and are not: both need the same missing concept, and once that
> exists each is a thin screen on top of it.

---

## 1 · What is actually blocked

**Best Ball.** `BestBallConfig.teams` is typed `Record<string, 'A' | 'B'>` and
`BestBallResult` carries `{ A, B }`. Two teams, maximum. The tournament format —
a field of 2-person teams, best ball per hole, lowest 18-hole total wins a purse —
cannot be represented at all. Scoring is fine: the Match / Total toggle already
exists and `Total` is the right setting.

**Nassau.** One buy-in is split three ways (`segPot = totalPot / 3`), so "25
Nassau" puts about 8 on each segment when it should put 25 on each and risk 75.
Presses cannot be represented at all, because a press grows exposure during the
round and a fixed pot cannot grow.

---

## 2 · The one new concept

**A team is a set of players who share a score.** That is all. It is not a group.

Groups already exist and mean *who you walk the course with*. Teams mean *whose
score counts as one*. A foursome is usually two teams; sometimes it is four
individuals. Keeping them separate is the whole reason this stays simple — the
moment they are conflated, an organiser has to reason about both at once.

```ts
// today
teams: Record<string, 'A' | 'B'>
// proposed — 'A' and 'B' are already valid team ids, so nothing needs migrating
teams: Record<string, string>
```

That single type change is backward compatible: every stored Best Ball config
keeps working, because `'A'` and `'B'` are strings.

---

## 3 · The shared screen

One screen, one question, appears only when a format needs pairs.

```
┌──────────────────────────────────────────┐
│  ←   Teams                               │
│      Whose scores count together?        │
├──────────────────────────────────────────┤
│                                          │
│   [  Pair them for me  ]  [ I'll pick ]  │
│                                          │
│   ┌────────────────────────────────────┐ │
│   │ Team 1                             │ │
│   │ Jeff Logan  +  Bashar Bawab        │ │
│   └────────────────────────────────────┘ │
│   ┌────────────────────────────────────┐ │
│   │ Team 2                             │ │
│   │ A-Aron  +  Michael Ek              │ │
│   └────────────────────────────────────┘ │
│                                          │
├──────────────────────────────────────────┤
│         Next: Game Setup  →              │
└──────────────────────────────────────────┘
```

- **Pair them for me** is the default and draws at random. `shuffled()` already
  exists in `eventUtils` for the foursome draw; this reuses it.
- **I'll pick** turns the cards into a tap-two-names surface. Tapping a name in a
  full team removes it, so there is no separate delete.
- Odd player count leaves a team of one, which is legal and says so.

Nothing else. No captain, no team names to type, no colours.

---

## 4 · Flow A · Best Ball tournament

The format described: pairs, best ball each hole, lowest total over 18, purse to
the winners.

**Setup:** Course → Players → **Teams** → Game → Start. One new step.

```
┌──────────────────────────────────────────┐
│  BEST BALL                               │
│  Each hole counts the better score from  │
│  each pair.                              │
│                                          │
│  SCORING      [ Net ]  [ Gross ]         │
│                                          │
│  WINNER       Lowest total over 18       │
│               [ Most holes won instead ] │
│                                          │
│  ENTRY        [10]  [25]  [50]  Custom   │
│               4 teams · purse 200        │
│                                          │
│  PRIZE        ( ) Winning team takes all │
│               ( ) Pay 1st, 2nd, 3rd      │
└──────────────────────────────────────────┘
```

Three decisions, every one with a default that matches what people play. `Net`
and `Lowest total` are preselected; an organiser who taps nothing gets a correct
tournament.

**During the round:** nothing changes. Everyone enters their own score as now.
The leaderboard groups by team and shows the team's running total.

**At the end:** the result card ranks teams, not players.

### What it needs

| | |
|---|---|
| `teams: Record<string, string>` | type change, no migration |
| `calculateBestBall` over N teams | `holesWon` / `totalScore` become maps |
| `calculateBestBallPayouts` | purse to winning team; optional 1st/2nd/3rd split |
| Teams screen | §3, shared |
| Leaderboard + result card by team | display |

The purse is a genuine pot game — everyone antes, lowest total wins the lot — so
it keeps the existing `netFromPayouts` path and stays zero-sum for free. This is
the one format where the pot model is exactly right, and it is worth saying so.

---

## 5 · Flow B · Nassau

```
┌──────────────────────────────────────────┐
│  NASSAU                                  │
│  Three bets: front 9, back 9, and the    │
│  full 18.                                │
│                                          │
│  PER BET      [5]  [10]  [25]  Custom    │
│               Risking 75 if you lose     │
│               all three.                 │
│                                          │
│  PRESSES      [ Off ]  [ On ]            │
│               A press starts a new bet   │
│               of the same size from that │
│               hole on.                   │
│                                          │
│  PLAYING AS   ( ) Individuals            │
│               ( ) Teams of 2  → Teams    │
└──────────────────────────────────────────┘
```

One number. The exposure line under it is the important part and is the same
device used for per-point settlement: state what someone is agreeing to before
they agree to it.

`Teams of 2` routes to the same screen from §3, and that is the entire cost of
best-ball-wrapped Nassau — the format people mean when they say "a five-dollar
Nassau, best ball".

### What it needs

| | |
|---|---|
| `valueCentsPerSegment` replaces the split pot | config |
| Settlement = sum of independent bets | rewrite `calculateNassauPayouts` |
| A press appends a bet from its hole onward | the part a pot cannot express |
| Optional team scoring | reuses §3 and the Best Ball hole result |

Deleting the pot framing removes the refund machinery for unwon segment pot,
which exists only because a pot had to be made to fit something it did not fit.

---

## 6 · Why this is smaller than it looks

Both flows are **one screen each on top of one shared screen.** The team model is
a type widening with no migration. Best Ball keeps the pot path it already uses.
Nassau is the only real rewrite, and it gets simpler rather than more complex,
because three independent bets are easier to express than one pot pretending to be
three.

No new concept reaches a player who is not in one of these two formats.

---

## 7 · Order, and a recommendation

| # | Item | Size | Why here |
|---|---|---|---|
| 1 | Teams model + shared screen | M | Unblocks both; nothing ships without it |
| 2 | Best Ball tournament (§4) | M | The format actually played, currently impossible |
| 3 | Nassau (§5) | M | Wrong today rather than missing; 3 completed rounds exist |

**Recommendation: 1 → 2 → 3.**

Nassau is *wrong* and Best Ball is *limited*, which normally argues for fixing
Nassau first. It does not here, for two reasons. Best Ball is the format being
played in real tournaments, so the limitation is costing something now. And the
teams model has to land before either — building it against the format that
actually needs N teams keeps it honest, where building it against Nassau would
let a two-team assumption survive unnoticed.

Each is independently shippable and independently useful.
