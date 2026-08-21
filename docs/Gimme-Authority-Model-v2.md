# Gimme · Authority Model

**v2.0 · August 21, 2026 · Supersedes Multiplayer Decision Authority v1.0**

> v1.0 was a Wolf fix with a role table on the front. It got the primitive right, decisions bound to a `player_id`, but applied it only to in-hole game decisions. This version covers every mutation in a round. Wolf is now one instance in §7, not the subject.

---

## 1. The problem, stated generally

Gimme has a multi-device join flow and no permissions layer. Authority is currently "whoever has the screen." That is defensible in a single-device round where one person keeps score for everyone. It stops being defensible the moment four people join, which the product actively encourages through Share link, QR, and Live Spectator Link.

Two instances verified live:

**Game decisions.** Signed in as `Test`, with `Admin` designated Wolf, the `Test` device rendered the full partner picker with all four options live. Any player can make any other player's decision.

**Settlement.** Signed in as `Test`, the settle screen rendered `Admin → A-Aron · 50 pts · Mark Paid` alongside `Test → A-Aron · 50 pts · Mark Paid`, plus `Mark all 2 paid`. A third party can clear a debt between two other people. Separately, the person who owes can clear their own debt with no confirmation from the person owed.

The second is the serious one. The Ledger carries balances across rounds, so a false `paid` does not expire. The product's central claim is that the scorecard settles itself, and that claim rests entirely on the settlement record being true.

---

## 2. The rule

**Authority scales with whose balance the action moves.**

Two corollaries generate nearly every answer below:

1. A person may always act against their own interest without asking anyone.
2. A person may never act in their own favour at someone else's expense without that person's confirmation.

Everything that moves no balance needs no permission at all.

---

## 3. Roles

| Role | Scope | Assigned |
|---|---|---|
| **Organizer** | Round lifecycle, roster, override of any decision | Round creator; transferable; survives disconnect |
| **Player** | Own score, own game decisions, own settlement confirmations | Joined via link, QR, or code |
| **Scorekeeper** | Entry and decisions by proxy for anyone not on a device | Organizer by default; delegable to any player |
| **Spectator** | Read only | Live Spectator Link |

Every participant carries a `device_bound` flag. A roster-added guest is not device bound; their actions fall to the scorekeeper as explicit proxy.

---

## 4. Mutation inventory

Every mutation carries an owner, a proxy path, a visibility rule, and a reversibility rule. Currently none of them do.

| Mutation | Owner | Proxy | Visible as | Reversible |
|---|---|---|---|---|
| Enter own score | Player | — | `entered by A-Aron` | Yes, logged |
| Enter another's score | Scorekeeper | — | `entered by Test for Mark` | Yes, logged, notifies owner |
| Edit a score after entry | Score owner or scorekeeper | — | `changed 5 → 4 by Test` | Yes, logged |
| Change a handicap | Self, or organizer pre-round | — | Visible to all | **Locked once round starts** |
| Wolf partner / Lone Wolf | The Wolf that hole | Scorekeeper if not device bound | `Admin picked Test` | **Locked on first score** |
| Declare a press | The player pressing | Scorekeeper | `A-Aron pressed on 7` | No |
| Add a player mid-round | Organizer | — | Visible to all | Yes, pre-scoring |
| Remove a player | Organizer | — | Visible to all, with settlement impact stated | Confirm required |
| Mark a debt **sent** | The payer only | — | `A-Aron marked sent · awaiting Test` | Yes, until confirmed |
| Mark a debt **received** | The payee only | — | `Test confirmed received` | Organizer override only |
| End round | Organizer | — | `Admin is ending the round` | Reopen: organizer, invalidates card |
| Discard round | Organizer | — | Confirm naming what is lost | **No** |
| Reopen a settled round | Organizer | — | Notifies everyone, invalidates shared card | Yes |

---

## 5. The four that matter most

### 5a. Settlement confirmation

This is the product. Replace the single `Mark Paid` with a two-step:

```
A-Aron → Test                                    50 pts
Sent · waiting on Test to confirm
```

- The **payer** taps `Mark sent`. State becomes pending. Nothing clears.
- The **payee** taps `Confirm received`. State clears and the Ledger updates.
- Nobody else sees either control. Remove `Mark all 2 paid` for debts you are not party to; keep it only for confirming multiple debts owed **to** you.
- If the payee is not device bound, the scorekeeper confirms by proxy, labelled `Confirming for Mark`.
- Organizer override exists, is logged, and is shown: `Admin cleared A-Aron → Test without confirmation.`

The asymmetry from §2 does the work: marking that you sent money is acting against your own interest, so it needs no approval. Marking that you received it is the part that clears someone's obligation, so only the person owed can do it.

### 5b. Score entry provenance

The score is the money. Every score needs an author.

- Any player may enter their own.
- Only the scorekeeper may enter another player's, and the entry is labelled on the owner's device.
- Edits are logged with before and after. The round holds an edit history the organizer can view.
- When someone else changes your score, you are told: `Test changed your 5 to a 4 on hole 7.`

Without this, a disputed score is unresolvable, and the settle screen's authority rests on nothing.

### 5c. Handicap lock

Handicap drives strokes, which drives net, which drives who owes whom. It is a money lever sitting in an unguarded field.

Lock every participant's handicap when the round starts. Pre-round, a player sets their own and the organizer may adjust with visibility. Mid-round changes require organizer override, are logged, and restate the settlement impact.

### 5d. Round lifecycle

`End round` and `Discard` currently sit on the Play tab.

**Needs testing before anything else ships:** does a joined non-organizer see these controls, and does their tap destroy the round for everyone? If yes, one wrong tap deletes a group's afternoon and it is the most urgent item in this document.

Target behaviour: both are organizer-only. `End round` broadcasts a heads-up and gives others a moment to flag a missing score. `Discard` is organizer-only, confirms by naming what is lost, and is irreversible.

---

## 6. Provenance and the record

A settlement product needs to answer "who said so." Add a per-round activity record capturing every mutation in §4 with actor, timestamp, and before/after.

It does not need a prominent screen. It needs to exist, be reachable by the organizer, and be the thing a group consults when someone says the number is wrong. It also gives the retroactive-edit case a clean answer: if a score changes after the card is shared, the card is stamped `revised` and everyone is notified, rather than the group silently holding two different versions of the truth.

---

## 7. Wolf, as one instance

Wolf is the first format where the missing layer becomes visible, because its central mechanic is a decision belonging to exactly one player.

- The picker binds to the Wolf's `player_id`. Other devices show `Admin is picking a partner.`
- Resolved teams broadcast immediately, since they are strategic information.
- Not device bound: scorekeeper picks, labelled `Picking for Mark`.
- Unreachable: after 60 seconds, or when any player taps `Next hole`, others gain `Pick for Admin`, confirmed and logged.
- No pick by lock time: stated default, recommended Lone Wolf, shown on screen when it fires.
- **Locked on first score.** The picker was observed still interactive after all four scores were entered. Whether a late pick recalculates is unverified and needs checking; if it does, it is a way to win money that should not exist.
- Show the rotation up front so people see their turn coming.

Also observed: a hole completed with all four scores and no partner selected produced no outcome, no warning, and no explanation. Every completed hole states a result, including `Admin still needs a partner. Pick one to settle hole 2.`

The same shape covers presses, Banker, and Bingo Bango Bongo ordering. Build the layer once, keyed on `player_id`, and let each format declare which decisions it owns.

---

## 8. Build order

| # | Item | Size | Notes |
|---|---|---|---|
| 1 | Test whether a non-organizer can discard a shared round (§5d) | XS | Test first, fix immediately if confirmed |
| 2 | Lock Wolf teams on first score; confirm late-pick recalculation (§7) | S | Game integrity |
| 3 | Settlement two-step: sent by payer, received by payee (§5a) | M | The product's core trust mechanic |
| 4 | Remove `Mark Paid` from third parties (§5a) | S | Ship with or before 3 |
| 5 | State an outcome for every completed hole (§7) | S | |
| 6 | Score provenance: author on every entry, edits logged and notified (§5b) | M | |
| 7 | Bind game decisions to `player_id` (§7) | M | |
| 8 | Handicap lock at round start (§5c) | S | |
| 9 | Organizer-only lifecycle controls (§5d) | S | |
| 10 | Proxy paths and labelling (§4) | M | |
| 11 | Timeout and override escalation (§7) | M | |
| 12 | Activity record (§6) | M | |
| 13 | Presence in the player list (§7) | M | |

Items 1, 2, 4, 5 and 8 are small. Item 3 is the one that determines whether the Ledger means anything.

---

## 9. Open product decisions

- **Does the organizer role transfer automatically** if the creator leaves mid-round, or does the round stall? Recommend transfer to the longest-connected player, announced.
- **Can a player leave mid-round,** and what happens to their scores and their share of the settlement?
- **Wolf variant.** Simplified single pick versus traditional take-or-pass after each tee shot. Recommend simplified as default with traditional as a setting, but this is a call about whether Gimme is a fast scorer or a faithful one.

**THAT'S GOOD.**
