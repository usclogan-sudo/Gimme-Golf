// Supabase Edge Function: send-push
//
// Turns a `notifications` row into an actual Web Push. Designed to be invoked by a
// Database Webhook on `notifications` INSERT (payload: { type, record, ... }); can
// also be POSTed a raw notification row for testing.
//
// SCAFFOLDING — inert until you:
//   1. Set secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//      (e.g. `mailto:you@gimme.gg`), and optionally PUSH_WEBHOOK_SECRET.
//   2. Deploy:  supabase functions deploy send-push
//   3. Add a Database Webhook: table=public.notifications, event=INSERT,
//      type=Supabase Edge Function → send-push, and (if set) send the
//      PUSH_WEBHOOK_SECRET as an `x-webhook-secret` header.
//   4. Flip WEB_PUSH_ENABLED in the client + have at least one push_subscriptions row.
//
// It reads notification_preferences and skips if the recipient hasn't opted into
// push or muted that category — so it's safe to wire before every user has a
// preference row (absence ⇒ push off). Native (APNs/FCM) tokens are skipped here;
// that's a separate integration (see docs/PUSH-NOTIFICATIONS.md).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface NotificationRow {
  id: string
  user_id: string
  type: 'unsettled_round' | 'round_invite' | 'round_complete' | 'broadcast'
  title: string
  body: string | null
  round_id: string | null
}

// notification type → the notification_preferences column that gates it.
const CATEGORY: Record<NotificationRow['type'], 'invites' | 'settle_up' | 'round_complete' | 'broadcasts'> = {
  round_invite: 'invites',
  unsettled_round: 'settle_up',
  round_complete: 'round_complete',
  broadcast: 'broadcasts',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // Optional shared-secret gate (set PUSH_WEBHOOK_SECRET + send it as x-webhook-secret).
  const expectedSecret = Deno.env.get('PUSH_WEBHOOK_SECRET')
  if (expectedSecret && req.headers.get('x-webhook-secret') !== expectedSecret) {
    return json({ error: 'unauthorized' }, 401)
  }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@gimme.gg'
  if (!vapidPublic || !vapidPrivate) return json({ error: 'VAPID keys not configured' }, 500)
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid JSON' }, 400)
  }
  // Database Webhook wraps the row in { record }; a direct test POST may send the row itself.
  const row: NotificationRow | undefined = payload?.record ?? payload
  if (!row?.user_id || !row?.type) return json({ error: 'missing notification row' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Respect preferences: absence ⇒ push off (defaults were push_enabled=false).
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('push_enabled, invites, settle_up, round_complete, broadcasts')
    .eq('user_id', row.user_id)
    .maybeSingle()

  if (!prefs || !prefs.push_enabled || prefs[CATEGORY[row.type]] === false) {
    return json({ skipped: true, reason: 'push disabled or category muted' })
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', row.user_id)
    .eq('platform', 'web')
    .not('endpoint', 'is', null)

  if (!subs || subs.length === 0) return json({ skipped: true, reason: 'no web subscriptions' })

  const message = JSON.stringify({
    title: row.title,
    body: row.body ?? '',
    url: row.round_id ? '/' : '/',   // SPA route; the client can deep-link off data.roundId
    tag: row.id,
    data: { notificationId: row.id, roundId: row.round_id, type: row.type },
  })

  let sent = 0
  const staleIds: string[] = []
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint!, keys: { p256dh: sub.p256dh!, auth: sub.auth! } },
        message,
      )
      sent++
    } catch (err: any) {
      // 404/410 ⇒ the browser dropped the subscription; prune it.
      if (err?.statusCode === 404 || err?.statusCode === 410) staleIds.push(sub.id)
      else console.error('web push send failed', sub.id, err?.statusCode, err?.message)
    }
  }

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds)
  }

  return json({ sent, pruned: staleIds.length, total: subs.length })
})
