# Gimme native shell (Capacitor)

The iOS and Android apps wrap the same Vite build that serves gimme.gg. Nothing
moves into native code: the shell loads `dist`, talks to the same Supabase, and
reuses every screen, the offline queue, invites and settlement. Added on
2026-11-10 (Spec 1). The July 2026 attempt on `feat/capacitor-native` was never
merged; this shell was regenerated from current main.

Bundle and package id: `gg.gimme.app`. Apple Team ID `M35SV96877`.
Legal entity: PELORUS HX LLC.

## What is in the repo

| Piece | Where |
|---|---|
| Capacitor config: app id, name, navy splash and status bar | `capacitor.config.ts` |
| Xcode project, entitlements, privacy manifest, icons, launch screen | `ios/App` |
| Android Studio project, App Links intent filter, icons, splash | `android` |
| Native init: status bar, splash hide, deep link replay | `src/lib/native.ts` |
| Sign in with Apple: native sheet on iOS, hosted flow elsewhere | `src/lib/appleAuth.ts`, `src/components/Auth/Auth.tsx` |
| Account deletion that keeps finished rounds readable | `delete_account` migration, Settings |
| Icon and splash source, 1024 px seal on navy | `assets/logo.png` |
| Link association files | `public/.well-known` |

Inside the shell the service worker is not registered and the Update ready
line never shows; a new build reaches those users through the store.

## Every time the web app changes

```sh
npm run native:sync      # build dist, copy into both platforms, pod install
npm run native:ios       # opens Xcode
npm run native:android   # opens Android Studio
```

Regenerate icons and splash only when the seal changes:

```sh
npm run native:assets
```

## Machine prerequisites

- Full Xcode (26.6 at the time of writing) and CocoaPods, for iOS.
- Android Studio with an installed SDK and its bundled JDK, for Android. The
  first launch of Android Studio downloads the SDK; until then `android`
  opens but does not build.
- Apple Developer Program and Google Play Console memberships, both in place.

## Supabase: Sign in with Apple

Dashboard, Authentication, Providers, Apple. Three things from the Apple
Developer portal:

1. **Services ID** for the web flow, for example `gg.gimme.web`, with Sign in
   with Apple enabled, domain `www.gimme.gg`, and the return URL Supabase shows
   on the provider page.
2. **Key** with Sign in with Apple enabled, downloaded once as a `.p8`. Supabase
   needs the key id, the team id and the file contents, which it turns into the
   client secret.
3. **Authorized client ids** on the Supabase provider page: the bundle id
   `gg.gimme.app` for the native sheet and the Services ID for the web flow,
   comma separated.

The iOS target already carries the Sign in with Apple entitlement. Nothing else
in the app changes when these are filled in.

## iOS: first build and submit

1. `npm run native:sync`, then `npm run native:ios`.
2. Signing and Capabilities already names the team and the entitlements file,
   which holds Sign in with Apple and Associated Domains for `gimme.gg` and
   `www.gimme.gg`. Xcode registers the app id and capabilities with the portal
   on first build when automatic signing is on.
3. Run on a simulator to smoke test, then Product, Archive, and distribute to
   App Store Connect for TestFlight.

Universal Links need nothing more: `public/.well-known/apple-app-site-association`
already names the team and bundle id and is served with the JSON content type by
`vercel.json`. Apple fetches it from both hosts when the app is installed.

## Android: first build and submit

1. `npm run native:sync`, then `npm run native:android`.
2. Build, Generate Signed Bundle. Create an **upload key** when asked and keep
   the keystore and its password outside the repo. Play App Signing then holds
   the release key.
3. Upload the `.aab` to Play Console, internal testing.
4. In Play Console, Setup, App integrity, copy the **app signing key
   certificate SHA-256**. Put it in `public/.well-known/assetlinks.json` in
   place of the placeholder and deploy. App Links verify against that file on
   both hosts; until it is deployed, links open in the browser instead of the app.

## Deep links

`gimme.gg/?join=CODE` and `?spectate=CODE` open the installed app. The shell
replays the URL as the same query the web app reads on load, so Join Round and
the spectator view are the existing screens with no native routing.

## Store listing

Copy, keywords, category and questionnaire answers are in `STORE-LISTING.md`.
Screenshots: ten per platform from token mode, scoring first, then the
standings bar, then the result card; payment handles in one settle screenshot
at most, labelled Square up. Category Sports. No gambling content declared; the
app holds no funds and token mode is the default.

## Privacy

`ios/App/App/PrivacyInfo.xcprivacy` declares email, name and user id as linked
app functionality data, and crash, performance and diagnostic data for Sentry
as not linked. No tracking. Location and contacts are added with Specs 6 and 5.
