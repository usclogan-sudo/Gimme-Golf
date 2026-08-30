# Gimme: Deferred Game Selection

**Build spec for the coding team · v1.1 · August 30, 2026**

> Paste into Claude Code at the repo root. Work in the order given. Phase 1 ships alone and is independently valuable and requires nothing from Phase 0. Do not start Phase 2 until the Phase 0 audit report is delivered and reviewed, because Phase 0 determines whether Phase 2 is a feature or a refactor.

**Changes from v1.0:** handicap freeze is now a hard requirement (§2.1). Rounding convention is specified (§2.2). Partial-round eligibility is specified (§2.3). Phase 0 is rewritten as a scoped work order with a defined output format (§3).

---

## 0. What this changes and why

Today the group picks the side game during setup, before the first tee shot. That is a tap-cost problem at the exact moment a group is standing on the first tee with a starter watching them.

The instinct to move game selection to the end of the round is directionally right but cannot be applied to every game. The correct split is not "beginning versus end." It is whether a game is **score-derived** or **decision-derived**.

- **Score-derived games** are a pure function of hole scores, frozen handicaps, and teams. They can be computed at any time, including after the round.
- **Decision-derived games** depend on choices or events that never enter the scorecard. They cannot be reconstructed afterward and must be armed in advance.

This spec introduces a five-state round lifecycle, a settlement engine contract, a post-round game rack, and a group consent step that prevents outcome-shopping.

**Scope note.** This changes round lifecycle, settlement computation, and the settle screen. It does not change payment routing, the deep-link layer, handicap calculation, or auth. Flag anything that would.

---

## 1. Game taxonomy

Implement as a static registry. Every game declares its class. The class drives every downstream behavior in this spec.

### Class A: score-derived (eligible for the post-round rack)

| Game | Inputs required | Notes |
|---|---|---|
| Skins | hole scores, handicaps | carryover is a config flag, still deterministic |
| Nassau | hole scores, handicaps, teams | front / back / total |
| Best Ball (Four Ball) | hole scores, handicaps, teams | lower net per team per hole |
| Match Play | hole scores, handicaps, teams | |
| Stableford | hole scores, handicaps, point table | |
| Modified Stableford | hole scores, handicaps, point table | |
| Quota | hole scores, handicaps, target | |
| Vegas (Daytona) | hole scores, handicaps, teams | |
| Nines (9-Point) | hole scores, handicaps | 3 or 4 players |
| Rabbit | hole scores, handicaps | catch-and-hold resolves from the card |
| Auto-press | hole scores, handicaps, teams, trigger rule | deterministic only if the trigger rule is fixed at setup |

### Class B: decision-derived (must be armed before the hole it applies to)

| Game | Why it cannot be deferred |
|---|---|
| Wolf | partner selection and Lone Wolf are commitments made before the hole resolves |
| Manual press | a press is a declaration at a specific match state |
| Snake | requires three-putt event capture |
| Greenies / Sandies / Barkies / Closest to pin | require per-hole event capture, not scores |
| Bingo Bango Bongo | requires shot-order data (first on, closest, first in) |

**Registry shape:**

```ts
type GameClass = 'score_derived' | 'decision_derived';

interface GameDefinition {
  id: GameId;
  label: string;
  class: GameClass;
  minPlayers: number;
  maxPlayers: number | null;
  requiresTeams: boolean;
  configSchema: ZodSchema;
  settle: SettlementFn;   // see §2
}
```

`class: 'decision_derived'` makes a game invisible in the post-round rack and mandatory in the arm gate. No other code should branch on game id for this purpose.

---

## 2. Settlement engine contract

Every Class A game must expose settlement as a pure function. No network calls, no reads from round state, no writes.

```ts
type SettlementFn = (input: {
  holes: HoleResult[];               // par, index, per-player gross
  players: PlayerRef[];
  handicaps: Record<PlayerId, number>;  // frozen snapshot, see §2.1
  teams: Team[] | null;
  config: GameConfig;                // stake, carryover, point table, etc.
}) => Settlement;

interface Settlement {
  gameId: GameId;
  standings: { playerId: PlayerId; net: number; rank: number }[];
  transfers: { from: PlayerId; to: PlayerId; amount: number }[];  // integers, zero-sum
  holeDetail: HoleAttribution[];     // for the expandable breakdown
}
```

Given identical input, a `SettlementFn` must return an identical result on every invocation, forever. That property is what makes the rack possible. Sections 2.1 through 2.3 are the three requirements that protect it.

### 2.1 Handicap freeze (decided)

**Handicaps snapshot at `setup` and are immutable for the life of the round. They adjust between rounds only.**

Store the snapshot on the round record, not by reference to the player profile. Settlement reads the snapshot. It must never read a live handicap value.

Without this, settlement is a function of the card plus whatever handicap happened to be live at read time, and the same round settles differently on two different days. This is the most consequential requirement in the spec and it is also the easiest to miss during audit, because it does not look like game logic.

**Acceptance:**

- [ ] Round record carries a frozen handicap map written at `setup`
- [ ] No `SettlementFn` reads a handicap from the player profile
- [ ] A GHIN sync or manual handicap edit during an active round does not alter that round's settlement
- [ ] Recomputing a completed round any number of days later produces byte-identical output

### 2.2 Rounding convention (decided)

**Transfers round to whole units. Any remainder goes to the player lowest in the standings, undivided.**

Rationale for the team: the app is points-first by default, and fractional values read as a defect even when the math is correct. Splitting remainders reproduces fractions. Rounding toward the winner looks like the app is picking favorites. Pushing the remainder to the bottom of the standings is the only version that is defensible out loud.

**Ordering matters.** Round first, then verify the ledger balances, then correct the final transfer if it does not. Do not verify before rounding.

Implement the balance check as an assertion inside the settlement function, not in the UI layer. A game that produces a non-zero-sum ledger must fail loudly in development rather than quietly on a card.

```ts
// after rounding, before return
const sum = transfers.reduce((a, t) => a + t.amount, 0);
if (sum !== 0) throw new SettlementError(gameId, 'ledger not zero-sum after rounding');
```

**Acceptance:**

- [ ] Every transfer amount is an integer
- [ ] Transfers sum to exactly zero under every game, at every player count
- [ ] Remainder allocation is to the last-place player, verified by unit test at 3, 4, and 5 players
- [ ] The assertion is present in the settlement path and covered by a deliberate failing test

### 2.3 Partial-round eligibility (decided)

**The rack requires a complete card. An incomplete card blocks the rack and names what is missing.**

A card is complete when every roster player has a score on every hole in the round's configured hole set. A round configured as nine holes is complete at nine.

Do not attempt partial settlement, and do not hide games that cannot compute. Blocking is clearer to the group and simpler to build, and a walked-in round is an edge case rather than the norm.

**Acceptance:**

- [ ] Rack is unreachable while any score is missing
- [ ] The block state names every player and hole with a missing entry
- [ ] The block resolves the instant the last score is entered, with no manual refresh
- [ ] Nine-hole rounds are treated as complete at nine

---

## 3. Phase 0: settlement purity audit

**Report only. No code changes. Two-day timebox.**

If the audit cannot be completed in two days, that is itself the finding, and Phase 2 is a refactor rather than a feature. Say so in the report and stop.

Do not repair findings during the audit. Repairing as you go destroys the sizing signal, which is the entire purpose of this phase.

### 3.1 What to inspect

For every game currently implemented:

1. Everything the game writes to Supabase during scoring: carryover pointers, running match status, press markers, running totals, cached standings, anything else.
2. Everything settlement reads at computation time, and whether it reads outside scores, roster, frozen handicaps, teams, and game config.
3. Whether handicaps are read from a round-level snapshot or from the live player profile (§2.1).
4. How the game resolves odd splits and ties today, and whether that matches §2.2.

### 3.2 The dirty line

Not every stored value is a problem. Apply one test.

**Clean:** the stored value can be recalculated from the scorecard alone. A running total is a cache. Delete it and the settlement is unchanged.

**Dirty:** the stored value captures information the scorecard does not contain. Which player was Wolf on hole 7 exists nowhere in the scores. That value is not a cache, it is the game.

Only dirty findings block anything. Report clean findings in one line each and move on.

### 3.3 Dispositions

Every dirty finding resolves one of three ways.

| Disposition | When | Approval |
|---|---|---|
| **Derive it.** Compute from the card, delete the stored value. | Default. Prefer this. | Team decides |
| **Reclassify as Class B.** The game moves to the arm gate with Wolf. | The information genuinely cannot come from the card. | Team decides, note the rationale |
| **Cut from the launch rack.** Game stays as-is, excluded from Phase 2. | Last resort only. | **Requires founder approval. Do not self-approve.** |

Cutting is the path of least resistance and it is the one that quietly hollows out the feature. Skins in particular is the likely rack default and the likeliest dirty finding, because carryover is commonly stored as a running pot. Skins gets derived, not cut.

### 3.4 Required output format

One row per implemented game. Deliver as a table, nothing else.

| Game | Class | Writes during scoring | Reads at settlement | Handicap source | Rounding today | Verdict | Proposed disposition | Est. |
|---|---|---|---|---|---|---|---|---|

`Verdict` is `clean` or `dirty` per §3.2. `Est.` is a rough size for the proposed disposition.

This format exists so that the Phase 2a estimate falls out of the report by summing a column, rather than requiring a follow-up meeting.

---

## 4. Round lifecycle

Replace the current lifecycle with five explicit states.

| State | What happens | Locked after |
|---|---|---|
| `setup` | course, roster, teams, handicap snapshot, stake | first score entered |
| `armed` | optional Class B gate (see §5) | end of hole 2 |
| `scoring` | hole-by-hole score entry only | last hole entered |
| `rack` | all Class A settlements computed and shown | group confirmation |
| `settled` | confirmed game locked, result card generated, settle links live | permanently |

**Rules:**

- Teams, handicaps, and stake are set in `setup` and cannot change after `scoring` begins. Choosing a partner after seeing the card is a worse integrity problem than choosing the game.
- Class B games can be armed or disarmed through the end of hole 2. After hole 2, the armed set is frozen. This matches category convention and closes the outcome-shopping window.
- Class A game selection has no deadline. It resolves in `rack`.
- A round can reach `settled` with zero Class B games armed. That is the expected default path.
- `rack` is unreachable until the card is complete per §2.3.

---

## 5. Arm gate (Phase 1)

Single screen, appears once, between setup and hole 1.

**Content:** the Class B list with off toggles. Nothing preselected.

**Copy:** headline `Anything running live today?` Sub-line `Wolf, presses, and side stakes need to be set before you tee off. Everything else you can decide at the end.` Primary action `Start scoring`. Secondary action `Skip`.

**Behavior:**

- Both `Start scoring` and `Skip` advance to hole 1. `Skip` is present so the screen never reads as a required decision.
- Any game armed here gets an owner assignment in the same interaction. Wolf specifically requires an owner per hole (rotating captain) resolved from roster order at arm time.
- The gate is reachable again from the scoring screen through the end of hole 2, then hidden.

**Acceptance:**

- [ ] Default state of every toggle is off
- [ ] A group tapping `Skip` reaches score entry in one tap from setup completion
- [ ] Arming Wolf writes a per-hole owner map to round state at arm time
- [ ] Gate is unreachable from hole 3 onward
- [ ] No Class A game appears on this screen

---

## 6. Wolf ownership (Phase 1, fixes a live defect)

Current live behavior: the Wolf partner picker is visible and interactive on all devices simultaneously with no ownership binding, and a completed hole with no partner selected resolves silently. This spec fixes it as a side effect of arming.

**Required:**

- The partner picker renders as interactive only on the device of the current hole's Wolf. All other devices show a read-only pending state.
- A hole cannot be marked complete while Wolf is armed and no partner or Lone Wolf declaration exists. Block advance with an inline prompt naming whose decision is outstanding.
- The Wolf's declaration is written before any score on that hole is accepted. Enforce this in the write path, not the UI.

**Acceptance:**

- [ ] Non-Wolf devices cannot mutate partner selection
- [ ] Hole advance is blocked pending declaration, with the blocking player named
- [ ] Score writes on a Wolf hole reject if no declaration exists for that hole

---

## 7. The rack (Phase 2)

Post-round screen between the last score and the result card. This is the highest-value surface in the spec.

**Layout:**

- Navy ground, brass hairline frame, seal at top, per existing result card treatment.
- Context line in tracked caps: course · date · players.
- A single primary settlement shown large: standings and who-owes-who, in the existing result card component.
- Below it, a horizontally scrolling row of alternative games, each showing game name and the leader under that game. Tapping one swaps the primary settlement with a crossfade.
- Any armed Class B game appears pinned first in the row and is not swappable out. Its settlement is additive, not alternative.

**Default selection, in priority order:**

1. The last Class A game this group confirmed
2. The most-confirmed Class A game across this group's history
3. Skins

The default must be preselected and correct often enough that the common path is zero taps.

**Class B disclosure:** if any Class B game exists in the registry but was not armed, do not hide it silently. Show one muted line beneath the rack: `Wolf, presses, and side stakes are set before the round.` This teaches the model without reading as a broken feature.

**Acceptance:**

- [ ] All Class A settlements compute from a single card read, no refetch per game
- [ ] Swapping games does not trigger a network request
- [ ] Default is preselected on mount
- [ ] Transfers are integer and zero-sum under every game in the rack (§2.2)
- [ ] Rack renders correctly at 2, 3, 4, and 5+ players, hiding games that fail min/max player constraints
- [ ] An incomplete card blocks the rack per §2.3

---

## 8. Group confirmation (Phase 2, authority model)

This is the mechanism that makes deferred selection socially legitimate. Without it the feature manufactures the argument the product exists to end.

**Rule:** a Class A game selected in `rack` requires acceptance from every participant before the round moves to `settled` and settle links go live.

**Flow:**

- The round organizer selects a game in the rack and taps `Lock it in`.
- Every other participant receives the selection with two actions: `That's good` and `Not that one`.
- On unanimous acceptance, the round moves to `settled`, the result card generates, and settle links activate.
- On any dissent, the round returns to `rack` and the dissenting player is named. No auto-resolution, no majority rule. The group settles it in person, which is what happens anyway.
- Roster-added players without accounts are auto-accepted. Do not block settlement on a player who cannot respond.

**Timeout:** if acceptance is outstanding for 30 minutes, the organizer gets an override with an explicit record on the card: `Locked by {organizer}.` Do not let a non-responding player strand the settle moment.

**Acceptance:**

- [ ] Settle links are inert until state is `settled`
- [ ] Dissent returns to `rack` and names the dissenter
- [ ] Roster-added participants do not block
- [ ] Override after 30 minutes is available to the organizer only and is recorded on the card
- [ ] Confirmation adds no more than one tap for the organizer on the happy path

---

## 9. Copy

All strings follow existing brand rules. No gambling-coded language (bet, wager, winnings, odds, buy-in). No gendered address. Serif for brand moments, Inter for functional UI.

| Surface | String |
|---|---|
| Arm gate headline | `Anything running live today?` |
| Arm gate sub | `Wolf, presses, and side stakes need to be set before you tee off. Everything else you can decide at the end.` |
| Arm gate skip | `Skip` |
| Wolf pending, other devices | `{name} is picking.` |
| Wolf block prompt | `{name} still has to call it.` |
| Rack headline | `That's good. Here's where everyone landed.` |
| Rack swap affordance | `Run it as…` |
| Class B disclosure | `Wolf, presses, and side stakes are set before the round.` |
| Lock action | `Lock it in` |
| Accept action | `That's good` |
| Dissent action | `Not that one` |
| Dissent state | `{name} wants a different one. Pick again.` |
| Override record | `Locked by {name}.` |
| Incomplete card block | `Still need scores from {names}. Fill those in to see the card.` |

---

## 10. Build order and sizing

| Phase | Work | Size | Depends on | Ships alone |
|---|---|---|---|---|
| **0** | Settlement purity audit (§3). Report only, two-day timebox. | S | none | n/a |
| **1a** | Game registry with class field (§1) | S | none | no |
| **1b** | Five-state lifecycle (§4) | M | 1a | no |
| **1c** | Arm gate (§5) | M | 1b | **yes** |
| **1d** | Wolf ownership fix (§6) | M | 1a | **yes** |
| **1e** | Handicap freeze (§2.1) | S | 1b | **yes** |
| **2a** | Refactor Class A games to `SettlementFn`, including §2.2 rounding | sized by Phase 0 | 0, 1a, 1e | no |
| **2b** | Rack screen (§7) | L | 2a | no |
| **2c** | Group confirmation (§8) | M | 2b | **yes** |

**Phase 0 and Phase 1 run in parallel.** Phase 1 depends on nothing in the audit. Ship it first: it captures most of the setup friction, fixes a live defect, and establishes the handicap freeze that Phase 2 requires.

**Phase 2 is not sized until the Phase 0 report is delivered.** Do not commit it to a sprint before then.

---

## 11. Instrumentation

The north-star metric is settled rounds, defined as a result card generated plus at least one settle link tapped. Deferred selection inserts a decision immediately before that tap, so it has to be measured directly.

Emit:

- `arm_gate_shown`, `arm_gate_skipped`, `arm_gate_armed` with game ids
- `rack_shown` with default game id and count of eligible games
- `rack_swapped` with from / to game ids and swap count for the round
- `game_locked` with game id, whether it was the default, and taps to lock
- `confirmation_dissent` with game id
- `settle_link_tapped` with the confirmed game id

**Guardrail to watch after Phase 2c ships:** settle link taps per completed round, against the pre-launch baseline. If that number falls, the rack is costing more than it earns and the default selection logic is wrong.

---

## 12. Do not change

Payment deep-link construction, the payment handle merge behavior, handicap calculation itself, auth and sync, the token/points display layer, routing outside the round lifecycle. Flag anything in this spec that would require touching those rather than doing it silently.

---

**THAT'S GOOD.**
