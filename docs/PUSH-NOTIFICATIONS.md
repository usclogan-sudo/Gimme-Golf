# Push Notifications

Status: **groundwork in place, sending is OFF.** Nothing pushes to a device yet.
This doc is the map of what exists and the exact steps to turn it on.

## What Gimme already had (in-app only)

- `public.notifications` table (recipient-scoped by RLS). Real writers today:
  - **round_invite** — server RPC `send_round_invite_notifications` (atomic with the invite).
  - **unsettled_round** — `SettleUp`: auto-notify every debtor, the "Send Reminder"
    nudge, and payment-reported.
  - **round_complete** — `SettleUp`: non-debtor participants when a round settles
    (added with the groundwork; previously this type was dead).
  - **broadcast** — Admin dashboard.
- `useNotifications(userId)` — fetches unread + a realtime `INSERT` subscription, so
  notifications already appear **in-app** (bell + toast) the moment a row lands.
- Removed the dead `score_update` type (was in the enum with an icon, never written).

## What the groundwork added (this PR — all inert)

| Piece | File | Notes |
|-------|------|-------|
| `push_subscriptions` table | `supabase/migrations/20260807120000_*.sql` | web (endpoint/p256dh/auth) **and** native (device_token) in one table via `platform`. RLS: own rows only. |
| `notification_preferences` table | same migration | master `push_enabled` (default **false**) + per-category toggles. Absence ⇒ push off. |
| TS types + mappers | `types/index.ts`, `lib/supabase.ts` | `PushDeviceSubscription`, `NotificationPreferences`. |
| Service-worker handlers | `public/sw.js` | `push` (show notification) + `notificationclick` (focus/open tab). Harmless with no sender. |
| Client subscribe/unsubscribe | `lib/push.ts` | VAPID subscribe → upsert `push_subscriptions`. No-op without `VITE_VAPID_PUBLIC_KEY`. |
| Registration hook | `hooks/usePushRegistration.ts` | Guarded by `WEB_PUSH_ENABLED`; reports `disabled` and never prompts while off. |
| Feature flag | `lib/featureFlags.ts` | `WEB_PUSH_ENABLED = false`. |

## Turn-on checklist (the deferred phase)

The **sender is already written** — `supabase/functions/send-push/index.ts` (reads a
notification row → checks prefs → sends Web Push to the user's web subscriptions,
prunes 404/410 dead ones). It's inert until deployed with secrets. Remaining steps:

1. **Generate a VAPID keypair** (`npx web-push generate-vapid-keys`).
   - Public key → `VITE_VAPID_PUBLIC_KEY` (client build env, e.g. Vercel).
   - Private key + public key → Supabase function secrets:
     `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@gimme.gg`
   - Optional: `PUSH_WEBHOOK_SECRET=…` (the function checks it as `x-webhook-secret`).
2. **Deploy the sender:** `supabase functions deploy send-push` (config already sets
   `verify_jwt = false` since it's webhook-invoked).
3. **Wire the trigger.** Add a **Database Webhook** (Dashboard → Database → Webhooks):
   table `public.notifications`, event `INSERT`, type *Supabase Edge Function* →
   `send-push`; add header `x-webhook-secret: <PUSH_WEBHOOK_SECRET>` if you set one.
   (Client-side inserts stay as-is; the webhook just fans them out to devices.)
4. **Settings UI.** A toggle that calls `usePushRegistration().subscribe()` (already
   built, no-op while the flag is off) and writes `notification_preferences`. Only
   request permission on an explicit tap.
5. **Flip `WEB_PUSH_ENABLED = true`** and set `VITE_VAPID_PUBLIC_KEY`.
6. **Device-test.** iOS Safari only supports Web Push for an **installed** PWA
   (iOS 16.4+). For the App Store (Capacitor) build, prefer **native APNs via the
   Capacitor Push Notifications plugin**, storing its token as `platform='ios'` in
   the same `push_subscriptions` table — the sender's native branch is the one TODO
   left in `send-push` (web is done).

## Design choices worth remembering

- **One row = one push-worthy event.** Debtors get `unsettled_round`, everyone else
  gets `round_complete`, so a settled round never double-notifies a person.
- **Web + native share `push_subscriptions`** (via `platform`) so the sender is
  written once.
- **`push_enabled` defaults false** — no one is subscribed until they opt in, so
  flipping the flag can't surprise-blast existing users.
