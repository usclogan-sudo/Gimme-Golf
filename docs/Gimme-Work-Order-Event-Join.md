# Gimme · Work Order · Event Creation and Join

**September 6, 2026 · Verified live against production build `index-DQZwwZDy.js`**

> Everything below was reproduced in the browser with console evidence, not inferred. Item 1 is a production blocker: events can be created but cannot be joined. Items 2 and 3 are why it reached production looking like it worked.

---

## 1 · P0 · Recursive RLS policy on `event_participants`

### Symptom

Creating an event succeeds and shows `Event Created!` with a code and QR. Two writes fail silently underneath:

```
[safeWrite] link event to round:
  infinite recursion detected in policy for relation "event_participants" (42P17)
[safeWrite] insert event manager participant:
  infinite recursion detected in policy for relation "event_participants" (42P17)
```

Reproduced on two consecutive builds (`index-C7nQCRHC`, `index-DQZwwZDy`) at 5:36 PM and 5:44 PM.

### Downstream effects, all traced to this one cause

- `rounds.event_id` is never set, so `isEventRound` is false and the round runs in ordinary single-round mode.
- No `event_participants` row for the organizer. Masked for them by `isCreator`, which is why it is invisible to whoever tests.
- **The join screen is unusable.** Entering the code renders:
  ```
  EVENT FOUND
  Retest 5
  Unknown Course
  Unknown · 0 players · Hole 1

  Which player are you?
     (empty)
  ```
  `Unknown Course` and `0 players` because the join lookup follows `events.round_id` to reach the round and its roster, and that link was never written. **No names to claim means no way to join.** This is the failure from the September 6 field test.

### Cause

`supabase/migrations/20260703050000_event_invite_acceptance_filtering.sql:130`

```sql
create policy event_participants_read on public.event_participants for select using (
  (user_id = auth.uid())
  or (exists (select 1 from public.event_participants ep2      -- ← self-reference
        where ep2.event_id = event_participants.event_id
          and ep2.user_id = auth.uid()
          and ep2.status = 'accepted'))
  or (exists (select 1 from public.events e
        where e.id = event_participants.event_id and e.user_id = auth.uid()))
);
```

The second clause selects from `event_participants` inside a policy on `event_participants`. Postgres applies RLS to that subquery, which re-enters the same policy, which recurses. `42P17`.

The baseline policy at `20260630120000_baseline_remote_schema.sql:2818` has the identical shape, so this predates the July migration; the July rewrite preserved it.

`events_participant_read` at line 139 of the same file compounds it: reading `events` requires reading `event_participants`, whose policy reads `event_participants`.

### Fix

Break the cycle with a `security definer` helper that bypasses RLS for the membership test. No such helper exists in the repo today.

```sql
-- Membership test that does NOT re-enter event_participants RLS.
create or replace function public.is_event_member(p_event_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id
      and ep.user_id = auth.uid()
      and ep.status = 'accepted'
  );
$$;

revoke all on function public.is_event_member(text) from public;
grant execute on function public.is_event_member(text) to authenticated;

drop policy if exists event_participants_read on public.event_participants;
create policy event_participants_read on public.event_participants for select using (
  user_id = auth.uid()
  or public.is_event_member(event_participants.event_id)
  or exists (select 1 from public.events e
       where e.id = event_participants.event_id and e.user_id = auth.uid())
);

drop policy if exists events_participant_read on public.events;
create policy events_participant_read on public.events for select using (
  public.is_event_member(events.id)
  or user_id = auth.uid()          -- the organizer must always read their own event
);
```

Note the added `user_id = auth.uid()` on `events_participant_read`. Without it an organizer with no participant row cannot read the event they just created, which is the state every event is currently in.

Check `event_participants_owner` (baseline line 2809) as well: it has no `FOR` clause, so it applies to all commands including `INSERT`, and it may be what rejects the manager insert. Confirm whether `event_participants_self_insert` is being ANDed against it.

### Verify

1. Create an event. Console clean, no `42P17`.
2. `select event_id from rounds where id = '<new round>'` returns non-null.
3. `select * from event_participants where event_id = '<new event>'` returns the manager row.
4. Enter the code on Play. The join screen shows the real course, the real player count, and a list of names.
5. Second account, second device: claim a name, enter a score.

---

## 2 · P0 · A failed write must not render a success screen

`EventSetup.tsx` wraps both failing calls in `safeWrite`, logs the error, and continues to `setStep('share')`. The user gets a party emoji and a QR code for an event that cannot be joined.

This is the third instance of the pattern in two days. The post-mortem's §3 names it: optimistic local update, unchecked error, no rollback.

**Required behaviour**

- Creation is not complete until the round exists, `rounds.event_id` is set, and the manager participant row exists. If any of the three fails, do not advance to the share screen.
- On failure, show what failed and what to do:
  > **Event not created.**
  > Could not link the round to the event. Nothing was saved. [ Try again ]
- Clean up partial rows, or write all three in one RPC so the failure is atomic. An event row with no round is the exact artifact that stranded the September 6 round.
- `safeWrite` already has the constraint name and SQLSTATE. Surface a distinguishable code in the UI (`Error 42P17`) so a field report is actionable rather than "it said try again."

---

## 3 · P1 · The join screen must not present a broken state as found

Current failure mode renders `EVENT FOUND` in confident capitals above `Unknown Course · 0 players` and an empty `Which player are you?` list.

**Required behaviour**

- If the event resolves but its round does not, that is a failure, not a find. Show:
  > **This event isn't ready yet.** Ask the organizer to re-share the code.
- Never render an empty selection list under a question. If the roster is empty, say so and offer `I'm not on the list` as a self-add.
- `Unknown Course` and `Unknown` are placeholders leaking to users. Any field that renders `Unknown` should suppress the row instead.

The screen's design is otherwise right. `Which player are you?` is the correct claim model and should be kept.

---

## 4 · P1 · Baseline scoring rights from identity, not membership

`Scorecard.tsx:2765` falls back to self-entry when there is no scorekeeper:

```ts
} else {
  isEditable = isMyEventPlayer   // requires myEventParticipant
}
```

`isMyEventPlayer` needs an accepted `event_participants` row, and `permissions.ts:54` has already set `readOnly` when that row is missing. **The fallback for "no scorekeeper" depends on the record whose absence is the problem**, so it cannot rescue the case it exists for.

**Required behaviour:** if the signed-in user's id matches a roster player's id, they may enter that player's score, with or without a participant row. Membership grants additional powers (scorekeeper, manager, cross-group editing), never the baseline right to score yourself.

This is defence in depth. Even with item 1 fixed, this prevents a missing membership row from silently producing a read-only round again.

---

## 5 · P2 · Confirmed fixed, no action needed

Verified working on `index-DQZwwZDy`:

- Event creation FK ordering (was `fk_events_round`)
- Organizer pre-selected as a player
- Player selection no longer reflows; uses `+` and checkmarks
- `Scorekeeper: None` → `Everyone keeps their own`, with explanation and the mid-round note
- `Pot` → `In play`
- `(1 players)` → `(1 player)`
- Error boundary caught a stale dynamic import cleanly and recovered

---

## 6 · P2 · Deploy hygiene

A deploy landing mid-session caused `Failed to fetch dynamically imported module: /assets/Scorecard-BG-unN3t.js`. The error boundary handled it well, but the fix is to register a service-worker update handler that prompts a reload when a new build is available.

---

## 7 · Release gate

Do not deploy a schema or policy change without running this, from a browser, with the console open:

1. Create an event → console clean, no red.
2. Enter the code on a second account → roster appears, claim a name.
3. Enter one score on each device → both appear on both.

Ninety seconds. Every failure in this document would have been caught by step 1 alone.

**Do not run a live event on the current build.** It creates a round, shows a code, and produces an event nobody can join.
