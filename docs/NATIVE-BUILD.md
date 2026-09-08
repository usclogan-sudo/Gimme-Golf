> **Historical — read before following.** This describes the Capacitor shell as it
> existed on the `feat/capacitor-native` branch in July 2026. **That shell was never
> merged** and the branch has been closed (PR #7). Main has moved a long way since:
> the app now deploys to Vercel rather than GitHub Pages, and `src/main.tsx`,
> `package-lock.json` and the push-notification edge function have all diverged.
>
> Treat this as a record of the decisions taken, not a runbook. When native
> submission is scheduled, regenerate the shell with `npx cap add ios android`
> against current main and use this to remember *why* each choice was made.

# Gimme — Native app build (Capacitor)

The native iOS & Android apps wrap the **existing React PWA + Supabase backend** via
[Capacitor](https://capacitorjs.com). Nothing about the web app or backend changed —
the same `dist/` bundle runs inside a native shell, talks to the same Supabase, and
reuses the offline queue, game logic, invite flows, token mode, everything.

Bundle / package id: **`com.gimme.golf`** (matches `public/.well-known/`).

## What's already set up (in this repo)
- `capacitor.config.ts` — appId, navy splash/status bar, https scheme, plugin config.
- `ios/` and `android/` — native Xcode + Android Studio projects (checked in; build
  artifacts are gitignored).
- App icons + splash for both platforms, generated from the brand seal on navy
  (`assets/logo.png` is the source; regenerate with `npx capacitor-assets generate`).
- `src/lib/native.ts` — native-only init: status bar, splash hide, **deep-link routing**
  (Universal/App Links → the app's existing `?join=` / `?spectate=` flow), and **push
  registration**. No-op on web.
- Service worker is disabled in the native shell (Capacitor serves assets locally).
- Plugins installed: `@capacitor/app`, `status-bar`, `splash-screen`, `keyboard`,
  `push-notifications`, `camera`.

## Dev workflow (every time the web app changes)
```bash
npm run build          # produce dist/
npx cap sync           # copy web + update native deps
npx cap open ios       # opens Xcode
npx cap open android   # opens Android Studio
```

## Prerequisites (your machine)
- **Full Xcode** (not just Command Line Tools) for iOS.
- **Android Studio** + JDK 17 for Android.
- **Apple Developer Program** membership ($99/yr) — signing + App Store Connect.
- **Google Play Console** account ($25 one-time).

---

## iOS — first build & submit
1. `npx cap open ios` → Xcode.
2. **Signing & Capabilities** → select your Team; set the bundle id to `com.gimme.golf`.
3. Add capability **Associated Domains** → `applinks:app.gimme.golf` (or your prod domain).
   This creates `App.entitlements`.
4. Add capability **Push Notifications** (and **Background Modes → Remote notifications**).
5. Run on a simulator/device to smoke-test. Then **Product → Archive** → distribute to
   **App Store Connect**.

## Android — first build & submit
1. `npx cap open android` → Android Studio.
2. Create a **release signing key** (`keytool`) and add a `signingConfig` in
   `android/app/build.gradle`.
3. Build → **Generate Signed Bundle (.aab)** → upload to **Play Console**.
4. Note the signing cert's **SHA-256** — you need it for `assetlinks.json` (below).

## Deep links — finish the `.well-known` files
`public/.well-known/` currently ships **stubs**. Replace and redeploy on the prod domain:
- `apple-app-site-association`: replace `PLACEHOLDER_TEAMID.com.gimme.golf` with your real
  **Apple Team ID** + bundle id. (Already served as `application/json` via `vercel.json`.)
- `assetlinks.json`: replace the `sha256_cert_fingerprints` placeholder with your Android
  release signing cert's SHA-256.
Apple/Google fetch these from `https://<domain>/.well-known/…` to verify link ownership.

## Push notifications — finish the delivery path
**Already built:** the `device_tokens` table (migration), the token upsert in
`src/lib/native.ts` (`registration` listener), and the **`send-push` Edge Function**
(`supabase/functions/send-push/`, FCM v1 — covers iOS + Android via Firebase).

Remaining (your Firebase/Apple config + a device to validate):
1. **Firebase:** create a project; add iOS + Android apps; **upload an APNs Auth Key
   (.p8)** to Firebase (this is what lets FCM deliver to iOS). Drop
   `google-services.json` into `android/app/`; for iOS add `GoogleService-Info.plist`
   in Xcode and the Firebase iOS SDK (or use the FCM-via-APNs path).
2. **Secrets + deploy:**
   ```bash
   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
   supabase secrets set FCM_PROJECT_ID=<firebase-project-id>
   supabase functions deploy send-push --no-verify-jwt
   ```
3. **Fire pushes on in-app notifications** — the app already writes `notifications`
   rows for invites / nudges / approvals. Add a trigger so each also sends a native
   push (uses pg_net; enable the extension first):
   ```sql
   create extension if not exists pg_net;
   create or replace function public.notify_push() returns trigger
     language plpgsql security definer set search_path = public, pg_temp as $$
   begin
     perform net.http_post(
       url := '<your-project>.functions.supabase.co/send-push',
       headers := jsonb_build_object('Content-Type','application/json',
         'Authorization','Bearer ' || current_setting('app.service_role_key', true)),
       body := jsonb_build_object('userId', NEW.user_id, 'title', NEW.title,
         'body', coalesce(NEW.body,''), 'data', jsonb_build_object('round_id', coalesce(NEW.round_id,'')))
     );
     return NEW;
   end $$;
   create trigger notifications_push after insert on public.notifications
     for each row execute function public.notify_push();
   ```
   Set `app.service_role_key` (e.g. via `alter database ... set`) or store it in Vault
   and read it in the function — don't hardcode the key. `send-push` only accepts the
   service-role key as its bearer, so it can't be called by clients.

## Store listing / compliance (from the MVP positioning)
- Lead copy with **side games · scores · settle up**; minimize bet/wager/gamble/money.
- Target a **mainstream age rating** (4+/12+), not 18+ gambling — the app links out to
  payment apps and never moves money (token/points mode reinforces this).
- Icons/screenshots/brand: navy/cream/brass, Playfair + Inter (assets in
  `docs/brand/gimme-brand-handoff/`).
- Confirm the **"Gimme" trademark** before submission.

## Optional native enhancement — camera for photo import
`@capacitor/camera` is installed. The photo-import UI uses a web `<input type=file>` which
works inside the webview; swapping to `Camera.getPhoto()` on native gives a nicer picker.
Low priority — the current flow already works in the shell.
