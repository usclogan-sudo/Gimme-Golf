-- Web Push / native push groundwork: device subscriptions + per-user notification
-- preferences. NOTHING is sent yet — these tables are the storage layer that the
-- future Edge Function sender will read, and that the client `usePushRegistration`
-- hook + `sw.js` push handler will write to once VAPID keys are configured and the
-- WEB_PUSH_ENABLED flag is flipped on. See docs/PUSH-NOTIFICATIONS.md.

-- ── push_subscriptions ────────────────────────────────────────────────────────
-- One row per device per user. Web Push stores (endpoint, p256dh, auth); native
-- (Capacitor APNs/FCM) stores device_token. `platform` disambiguates so the sender
-- can be built once for both web and native.
create table if not exists public.push_subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'android')),
  endpoint text,          -- web push endpoint URL
  p256dh text,            -- web push client public key
  auth text,              -- web push auth secret
  device_token text,      -- native APNs / FCM registration token
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- A device is unique by its endpoint (web) or token (native); dedupe per user so a
-- re-subscribe upserts rather than piling up stale rows.
create unique index if not exists push_subscriptions_user_endpoint_key
  on public.push_subscriptions (user_id, endpoint) where endpoint is not null;
create unique index if not exists push_subscriptions_user_token_key
  on public.push_subscriptions (user_id, device_token) where device_token is not null;
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "own push subscriptions - select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "own push subscriptions - insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "own push subscriptions - update" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push subscriptions - delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ── notification_preferences ──────────────────────────────────────────────────
-- One row per user. Master `push_enabled` switch (off until the user opts in) plus
-- per-category toggles. A MISSING row means "in-app defaults on, push off" — the
-- sender must treat absence as push_enabled = false.
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  invites boolean not null default true,
  settle_up boolean not null default true,
  round_complete boolean not null default true,
  broadcasts boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create policy "own notification prefs - select" on public.notification_preferences
  for select using (auth.uid() = user_id);
create policy "own notification prefs - insert" on public.notification_preferences
  for insert with check (auth.uid() = user_id);
create policy "own notification prefs - update" on public.notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
