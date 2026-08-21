# Gimme · Two-Device Acceptance Test

**Purpose:** verify the multi-device authority features that can't be tested on one phone. Most of these guard **money** (who can clear a debt, who can change a score), so this pass is the sign-off before the settlement two-step ships.

**Time:** ~30 minutes. **People:** 2 testers, 2 phones.

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

## Known gaps — please **do not** file these as bugs

These are **not built yet** and are expected to show old behavior. Note them if you like, but they're already on the roadmap:

- **Wolf picker appears on every phone.** Today any device can make the Wolf's pick (until the first score locks it). The intended "only the Wolf's phone shows the picker; others see *'{Wolf} is picking'*" is a later item.
- **No "your score was changed" notification.** Test 3 shows *who* entered a score, but there's no push/alert to the owner when someone edits it, and no per-round edit history yet.
- **End round / Discard on a joined round.** Device B (a joined non-organizer) should not see or be able to End/Discard the shared round — worth a quick check (B opens the round list): confirm B has **no** Discard control on a round they only joined. If B **can** discard a round they didn't create, that **is** a bug — flag it urgently.

---

## Reporting back

For each ❌, send: **test number**, **which device**, **what you saw**, and a **screenshot**. Anything in Test 1 or the Discard check above is high-priority (it touches money / data loss).
