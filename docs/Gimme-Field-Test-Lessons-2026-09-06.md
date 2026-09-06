# Gimme · Field test lessons — 6 September 2026

**Event:** 13 players, four foursomes, one round. First time the app carried a real group.
**Outcome:** the round was played and scored. Getting there took roughly two hours of live SQL surgery against production while people stood on tees.

This is written to shape the next iteration, so it is organised by cause rather than by
chronology. The individual bugs are mostly fixed; the patterns behind them are not.

---

## 1. The failure that actually cost the day

Deleting the event out from under a live round.

A cleanup statement — `delete from public.events where created_at >= current_date` — removed the
event backing an in-progress round. Nothing stopped it, and nothing repaired what it broke:

- `rounds.event_id` still pointed at the deleted row. Nothing nulls it, because there is **no
  foreign key** from `rounds.event_id` to `events.id`.
- `isEventRound` is `!!round.eventId` — it trusts the *column*, not whether the event exists. So
  the app stayed in event mode with no event.
- `event_participants` cascaded away, so every player lost their membership at once.
- With no membership row, `readOnly` is true. **Eleven of thirteen players could not enter a
  score**, and the two who could were only covered by `isCreator`.

Every symptom after that — "only two people can enter scores", "scorekeepers won't assign",
diagnostic queries returning nothing — traced back here. Queries keyed on
`(select round_id from events where id = ...)` returned NULL and therefore zero rows, which read
as "nobody joined" rather than "the event is gone".

**Fixes for the next iteration**

- Add the missing FK: `rounds.event_id references events(id) on delete set null`. A deleted event
  should degrade a round to an ordinary round, not strand it.
- Derive `isEventRound` from the loaded event, not from the column. A dangling id should behave as
  "no event", which is recoverable, rather than "event with nothing in it", which is not.
- Never bulk-delete rows belonging to an active round. If a maintenance path needs it, scope it to
  `status = 'complete'` by default.

---

## 2. Signing up is not joining, and the app does not say so

Six of thirteen players never claimed a roster slot. They had accounts, they were signed in, they
could see the round and their own name on the card — and they were read-only.

The roster (`rounds.players`) is a JSON list of names. Membership (`round_participants`) is a
separate table recording which account owns which name. Only the join flow creates it, and only
tapping your own name in that flow counts. Nothing on screen distinguishes a claimed name from an
unclaimed one, so nobody knew anything was missing until they tried to type.

**Fixes**

- Show claim state on the scorecard: an unclaimed name should look unclaimed, with a "this is me"
  affordance.
- When a signed-in user opens a round they have not claimed, offer the claim directly instead of
  silently rendering read-only.
- The organiser needs a roster view showing who has claimed and who has not — today that is only
  visible in SQL.

---

## 3. Errors were discarded, so failures looked like successes

The admin catalogue import awaited its insert, **discarded the error**, updated local state anyway
and closed the panel. Since `shared_courses` did not exist in production at all, every import ever
attempted through that screen failed silently while appearing to work. It was reported as "there
isn't an import button".

This is a pattern, not a one-off: optimistic local update, unchecked `error`, no rollback.

The admin dashboard is the same story from the other direction. `admin_get_all_players` and
`admin_get_all_rounds` both failed with `42702 — column reference "user_id" is ambiguous`: each
declares `user_id` as an OUT column and then checks admin rights with a bare
`where user_id = auth.uid()`. The client reported every failure as **"make sure the RPC is
deployed"**, which is shown for a missing function, a permission error and an empty result alike.
That message sent the investigation to deployment, then to the admin flag, before the browser
console gave up the real error in one line. The functions were deployed and the caller was an
admin throughout.

**Fixes**

- Audit every `await supabase.from(...)` that ignores `error`. Treat an unchecked write as a bug.
- Local state should follow a confirmed write, or roll back visibly on failure.
- Empty state and failure state must not share a message. "No players found" is a fact;
  "you are not an admin" is a different fact; "this function does not exist" is a third.
- When something is inexplicable, read the console before theorising. Two hours of inference lost
  to an error string that was sitting there the whole time.

---

## 4. Migrations do not reach production

`shared_courses` existed in `supabase/legacy-sql` and in the app's queries, but **not in the
production database and not in any migration**. The app tolerated this because the failed query's
`error` was ignored (see §3), so the shared course catalogue had silently never worked.

Separately, `20260907120000_admin_delete_user.sql` applied cleanly to the PR preview branch and had
to be run by hand against production after merge.

**Fixes — do this before the deferred-selection stack (#84–#86) merges**

- Establish how migrations reach production, and verify it with a trivial one.
- `hole_declarations` in #86 will **not** degrade gracefully the way a missing `shared_courses`
  did — the Scorecard queries it on load and would fail outright.
- Reconcile `legacy-sql` into the migration history, or delete it. Right now the repo's schema and
  production's schema disagree and nothing detects that.

---

## 5. Roles can only be set before anyone arrives

Group scorekeepers are chosen in EventSetup — before anyone has joined, before the organiser knows
who is in which cart, and before the day rearranges itself. There is no way to change it afterwards.

Worse, `join_event` stamps the role onto `event_participants` at join time from the event's
`group_scorekeepers` map. Editing that map later does nothing for anyone already in.

The result was that assigning three scorekeepers mid-round required recreating a deleted event,
backfilling membership from `round_participants`, and updating roles by hand.

**Fixes**

- Ship the mid-round scorekeeper picker (branch `midround-scorekeeper`, commit `02f2d8d`) — it
  writes both the participant row and the event map.
- Consider whether `group_scorekeepers` should exist at all, given the participant row is what
  every permission check actually reads. Two sources of truth for one fact caused real confusion.
- Multiple managers work today but only through SQL. If that is wanted, surface it.

---

## 6. Nothing had been exercised by a human

Every defect fixed on the day passed types, 287 unit tests and a clean build. Several were
structurally invisible to that suite:

- The **password reset** failed twice for ordering reasons — the Supabase client parses and strips
  the recovery hash in its *constructor*, before React mounts, so the `PASSWORD_RECOVERY` listener
  registered too late and the hash fallback found nothing. Then a newly deployed service worker
  reloaded the page ten seconds in, losing the hash again. Neither is testable without clicking a
  real emailed link.
- The **per-skin Skins model** settled correctly while every display still described a pot,
  because none of that is settlement and no test touched it.
- The **catalogue import** wrote to a table that did not exist.

**Fixes**

- A smoke pass on the preview build is not optional before a live event. `Test 0` now exists in
  `Gimme-Two-Device-Test-Script.md` for exactly this and takes ten minutes.
- Treat "all tests pass" as evidence about logic only. It says nothing about whether a button saves.

---

## 7. Preview builds are not shareable

QR codes generated from the Vercel preview URL sent testers to a Vercel login wall — preview
deployments are protected by default. This is not a code issue but it burned time on the day.

**Fix:** generate invite QR codes from production only, and merge before an event rather than
testing on a preview URL that outsiders cannot reach.

---

## 8. Diagnosis notes (process, not product)

Two things slowed the live debugging and are worth remembering:

- **"Success. No rows returned" is the normal output of an `INSERT`/`UPDATE`/`DO` block.** It was
  repeatedly read as "nothing happened", which sent the investigation down at least one wrong path.
  Verify writes with a follow-up `select`, not by the absence of returned rows.
- **Diagnostic queries keyed on a possibly-missing parent return zeroes that look like data.**
  Every count joined through `events` reported zero because the event was gone. Prefer queries
  keyed on the entity you are certain exists — here, the round.

---

## What worked

- The **join blocker**, **manual/random foursomes**, **optional treasurer** and **group-scoped
  approval** fixes shipped that morning all held.
- `submit_event_score` already implements exactly the right scorekeeper rule — group-scoped, scores
  approved on entry. The permission model was sound; only the means of assigning it was missing.
- Self-entered scores default to `approved`, so once a player claimed a slot they could score with
  no further friction.
- The settlement engine stayed correct throughout, including the new per-skin model.

---

## Priority for the next iteration

1. **`rounds.event_id` FK with `on delete set null`**, and derive `isEventRound` from the loaded
   event. This is the one that broke the day.
2. **Resolve migration delivery to production** before #84–#86 merge.
3. **Claim state visible on the scorecard**, plus a claim prompt for signed-in non-members.
4. **Ship the mid-round scorekeeper picker** (`02f2d8d`).
5. **Audit unchecked Supabase writes**, and split empty states from failure states.
6. **Make Test 0 a release gate** for any build a group will use.
