# Gimme · Two-Device Acceptance Test

**Purpose:** Test 0 is a solo smoke pass — it checks that mid-round wagers still save at all after the storage change, and it gates everything else. Tests 1–7 verify the multi-device authority features that can't be checked on one phone. Most of these guard **money** (who can clear a debt, who can change a score), so this pass is the sign-off before the settlement two-step ships.

**Time:** ~10 minutes for Test 0 alone, ~40 for the full pass.
**People:** Test 0 needs **1 tester, 1 phone**. Tests 1–7 need **2 testers, 2 phones**.

---

## What you need

| | |
|---|---|
| **Device A** | The **organizer** — the person who creates the round. Signed in to their own account. |
| **Device B** | A **second player** — signed in to a *different* account. **Must join by scanning the Share link / QR**, not be added from the roster. (Joining on their own phone is what makes B "device-bound" — the thing every test below hinges on.) |

**Which build to use:**
- **Tests 1–2** (settlement two-step) are **not on production yet**. Run them on the preview build:
  **`https://gimme-golf-git-settlement-two-step-usclogan-8685s-projects.vercel.app`**
  Both phones must open **that same URL**.
- **Tests 3–6** are live on production: **`https://gimme.gg`**.
- **Test 0** (solo smoke pass) runs on the same combined preview build as Test 7, and needs only **one** phone.
- **Test 7** (Wolf ownership) is **not on production yet**. Run it on the **combined** preview build —
  it needs both the ownership fix and the storage change that lets a joined player's pick actually save:
  **`https://gimme-golf-git-config-hoist-usclogan-8685s-projects.vercel.app`**
  Both phones must open **that same URL**.

> Tip: take a screenshot whenever something doesn't match the **Expected** result, and note the test number.

---

## Setup (do this once per build)

1. **Device A:** Start New Round → pick a course → add yourself → **Continue**.
2. **Device A:** On the players step, tap **Invite to join** (or use **Share link** once the round starts) and send the link to Device B.
3. **Device B:** Open the link, sign in as a **different** account, and **join** the round.
4. **Device A:** Confirm the header shows **2 playing** and Device B's name appears.
5. Choose a game and start the round.

✅ **Setup pass:** both phones show the same round, 2 players, both names visible.

---

## Test 0 — Solo smoke pass · **one phone, ~10 minutes** · preview build

> **Run this first. If it fails, stop — nothing below is worth trying.**
>
> Presses, Wolf picks and Hammer states used to live inside the round's game record. They are now their own rows in a new `hole_declarations` table. That means the storage behind *every* mid-round wager changed, and none of it has been opened in the app by a human yet — only proved correct by automated tests, which cannot tell you whether a button still saves.
>
> This needs **no second person and no second phone**. Everything here is one device.

**Build:** `https://gimme-golf-git-config-hoist-usclogan-8685s-projects.vercel.app`

### It loads at all

| # | Do | Expected | Pass? |
|---|----|----------|-------|
| 0a | Open the preview and start a **Skins** round with 2–3 roster players | Scorecard opens normally. **No** endless spinner, no error screen. | ☐ |

> ⚠️ If 0a fails, the new table is missing from this build's database. Stop and report it — nothing else can pass.

### Presses survive a reload

| # | Do | Expected | Pass? |
|---|----|----------|-------|
| 0b | On a hole with no scores, tap **Press** | Counter shows **Press (1)**, pot value goes up. | ☐ |
| 0c | **Reload the page**, return to the round | Press is **still there** — count and pot unchanged. | ☐ |
| 0d | Tap the **↩ undo** next to Press | Press disappears; pot returns to its earlier value. | ☐ |

> 0c is the one that matters. A press that shows locally and vanishes on reload means it never reached the server.

### Wolf: declare, then score

| # | Do | Expected | Pass? |
|---|----|----------|-------|
| 0e | Start a **Wolf** round (3 players, all from the roster) | Wolf panel names the Wolf for hole 1. | ☐ |
| 0f | **Before** declaring, try to enter any score | Refused, with a message naming the Wolf. | ☐ |
| 0g | Pick a partner, then enter scores | Scores save normally. | ☐ |
| 0h | Reload, return to the hole | The pick is still shown. | ☐ |
| 0i | Advance a hole and tap **Lone Wolf** | Accepted as a decision — scoring unblocks without a partner. | ☐ |

### Hammer

| # | Do | Expected | Pass? |
|---|----|----------|-------|
| 0j | Start a **Hammer** round (2 players), throw the hammer | Value doubles, panel shows the throw. | ☐ |
| 0k | Reload | The thrown state persists. | ☐ |
| 0l | **Decline** it | Round records the decline and the value settles. | ☐ |

### Teams and settlement

| # | Do | Expected | Pass? |
|---|----|----------|-------|
| 0m | Start a **Best Ball** round (4 players), assign teams, play 2–3 holes | Team scores read correctly on the leaderboard. | ☐ |
| 0n | **End round** → **Settle Up** | Numbers appear. No blank screen, no `NaN`, no fractions of a point. | ☐ |
| 0o | Add up the settle lines | Winners' gains equal losers' losses — the round nets to **zero**. | ☐ |
| 0p | Open **My Stats** | Past rounds still show; nothing has become blank or zero. | ☐ |

> 0o is the §2.2 change in the open: rounding remainders now go to the player **lowest** in the standings instead of the leader. Totals should still net to zero, and no value should ever show a decimal.
>
> 0p is the known trade: rounds played **before** this build have no stored declarations, so an old Wolf or pressed-Skins round may settle to a slightly different number than it did at the time. That is expected and was accepted for beta. A round going **blank or erroring** is not.

---

## Test 1 — Settlement two-step *(the important one)* · preview build

> Goal: only the **person owed** can mark a debt received. The person who owes can only say they *sent* it. Nobody else can clear it.

First create a debt: play ~3 holes so one player owes the other, then **End round** (Device A) → open **Settle Up**. You should see a line like *"B → A · N pts"* (B owes A) or vice-versa.

Run these on the settlement that flows **from B to A** (B owes A):

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 1a | **Device B** (the payer) | Look at the B→A line | Sees a **"Mark sent"** button. Does **not** see any "confirm/paid" control. | ☐ |
| 1b | **Device B** | Tap **Mark sent** | Line shows **"Sent … waiting on A to confirm."** The debt is **not** cleared. | ☐ |
| 1c | **Device A** (the payee) | Look at the same line | Sees a **"Confirm received"** button. | ☐ |
| 1d | **Device A** | Tap **Confirm received** | Debt clears — shows **Received/Paid**, and the Ledger updates. | ☐ |

Now test that **third parties and the payer can't clear it** (use a fresh unpaid debt — play another hole or a second round if needed):

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 1e | **Device B** (payer) | On a debt **B owes A** | B has **no** way to mark it received/paid — only "Mark sent". | ☐ |
| 1f | **Device A** | On a debt between **two other** players (needs a 3rd player) | A (even as organizer) sees **read-only** status, **no** clear button. | ☐ |

> ⚠️ If **any** person other than the payee can clear a debt owed to a device-bound player, that's a **fail** — flag it.

---

## Test 2 — Roster guest is proxied · preview build

> Goal: a guest who is **not** on their own phone can still be settled by the organizer (so casual rounds still work).

1. **Device A:** add a **guest** from the roster (the "Add a guest" option — do **not** invite them to join).
2. Create a debt involving that guest and open Settle Up on **Device A**.

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 2a | **Device A** | Find the debt owed **to the guest** | Button reads **"Confirm for {guest name}"** (organizer confirms on their behalf). | ☐ |
| 2b | **Device A** | Tap it | Debt clears normally. | ☐ |

---

## Test 3 — Score provenance · production

> Goal: when someone enters **your** score, it's attributed. (Setup: A and B both joined on their own phones per Setup.)

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 3a | **Device A** | Enter a score **for Device B's player** | On **both** phones, B's row shows a small **"entered by {A's name}"** under the handicap. | ☐ |
| 3b | **Device B** | Enter B's **own** score (overwrite it) | The "entered by" note **disappears** (self-entry isn't labelled). | ☐ |
| 3c | either | Enter your **own** score | **No** "entered by" note appears on your own row. | ☐ |

---

## Test 4 — Wolf pick locks on first score · production

> Goal: the partner pick freezes once scoring starts, so nobody picks after seeing the result. (Start a **Wolf** round with 3+ players.)

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 4a | **Device A** | On a hole where you're the Wolf, pick a partner | Shows **"{Wolf} + {partner}"**. | ☐ |
| 4b | **Device A** | Enter any player's score for that hole | The partner buttons **disappear** and it shows **"Locked — scoring has started."** | ☐ |
| 4c | **Device B** | Look at the same hole | Also shows the **locked** state — the pick can't be changed from either phone. | ☐ |

---

## Test 5 — Handicap locks on first score · production

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 5a | **Device A** | **Before** any score on the round, tap a player's **HCP** | An edit box opens (pencil ✎ shown) — editable. | ☐ |
| 5b | **Device A** | Enter the first score of the round, then tap any **HCP** | HCP now shows a **🔒** and tapping does **nothing** — locked. | ☐ |
| 5c | **Device B** | Check a HCP after scoring started | Also shows **🔒**, not editable. | ☐ |

---

## Test 6 — Press locks on first score · production

> (Start a **Skins** round. The **Press** button is on the game-status row.)

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 6a | **Device A** | On a hole with **no scores yet** | **Press** button is dark/enabled. | ☐ |
| 6b | **Device A** | Enter any score for that hole | **Press** button greys out / disabled. | ☐ |

---

## Test 7 — Wolf ownership · preview build

> Goal: the partner pick belongs to **the Wolf**, and a Wolf hole cannot be scored until they've made it. This replaces the old behaviour where every phone could make anyone's pick.
>
> **This is the test that matters most in this pass.** Everything here is about *which phone* can do what, so it cannot be checked on one device — and a wrong result looks identical to a right one from a single phone.

**Build:** both phones must open the **same** preview URL:
**`https://gimme-golf-git-config-hoist-usclogan-8685s-projects.vercel.app`**

**Setup:** start a **Wolf** round with **3 players** — A, B, and a third. B must have joined **via the share link** (per Setup above), not been added from the roster. The Wolf rotates by hole, and the panel always names the current Wolf.

### The pick belongs to the Wolf

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 7a | **Device A** | Go to a hole where the panel says **Wolf: {A's name}** | A sees the **partner buttons** and **Lone Wolf**. | ☐ |
| 7b | **Device B** | Same hole, same moment | B sees **no buttons** — only *"Waiting on {A} to pick a partner or go Lone Wolf."* | ☐ |
| 7c | **Device A** | Declare a partner | Both phones show the pick. B's phone updates to *"{A} has decided."* | ☐ |

### Scoring is blocked until the Wolf declares

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 7d | **Device A** | Move to the **next** hole (a different Wolf), then try to enter **any** player's score before that Wolf declares | Score does **not** save. A message names the Wolf being waited on. | ☐ |
| 7e | **Device B** | Try the same thing from B's phone | Also refused, same message. | ☐ |
| 7f | whoever is Wolf | Make the declaration | Scoring works immediately on **both** phones, no reload. | ☐ |
| 7g | **Device A** | Open the **Grid** view and try to type a score into an undeclared Wolf hole | Also refused — the grid is not a way around it. | ☐ |

### It flips with the rotation

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 7h | both | Advance to a hole where the panel says **Wolf: {B's name}** | Now **B** has the buttons and **A** sees *"Waiting on {B}…"* — the exact reverse of 7a/7b. | ☐ |
| 7i | **Device A** | Try to pick B's partner anyway | No buttons to tap. A cannot set it, even as organizer. | ☐ |

### The roster guest still works

> A player added from the roster (never invited to join) has no phone of their own, so the organizer picks for them — otherwise the round would jam.

| # | On | Do | Expected | Pass? |
|---|----|----|----------|-------|
| 7j | **Device A** | Add a **guest** from the roster to a Wolf round, advance to a hole where the **guest** is Wolf | **A** sees the partner buttons and can declare on the guest's behalf. | ☐ |

> ⚠️ **The failure to watch for.** If on 7b or 7h the *non-Wolf* phone shows tappable partner buttons, ownership isn't binding and the fix is not working — even though the app will look completely normal. That is a **fail**; flag it with a screenshot of **both** phones on the same hole.
>
> The likely cause is the joined player's participant record not being marked accepted, which makes the app treat them as a guest and hand the pick to the organizer. Note in your report whether B joined by **link** or was **added from the roster** — that distinction is what the test hinges on.

---

## Known gaps — please **do not** file these as bugs

These are **not built yet** and are expected to show old behavior. Note them if you like, but they're already on the roadmap:

> The **Wolf picker on every phone** used to be listed here. It is now fixed and has become **Test 7** — please run it rather than skipping it.

- **No "your score was changed" notification.** Test 3 shows *who* entered a score, but there's no push/alert to the owner when someone edits it, and no per-round edit history yet.
- **End round / Discard on a joined round.** Device B (a joined non-organizer) should not see or be able to End/Discard the shared round — worth a quick check (B opens the round list): confirm B has **no** Discard control on a round they only joined. If B **can** discard a round they didn't create, that **is** a bug — flag it urgently.

---

## Reporting back

**Test 0 comes first and is a gate:** if it fails, report it and stop — the two-device tests are meaningless on a build where mid-round wagers do not save.

For each ❌, send: **test number**, **which device**, **what you saw**, and a **screenshot**. Anything in Test 1, Test 7, or the Discard check above is high-priority (it touches money / data loss).

For Test 7, a screenshot of **both phones on the same hole** is worth more than either one alone — the whole point is what the two devices show at the same moment.
