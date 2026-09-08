# Gimme — App Store & Google Play Launch Playbook

The step-by-step to get the (already-built) Capacitor app **live on both stores**.
Assumes the native shell exists (`ios/`, `android/`, bundle id **`com.gimme.golf`**),
the web app is live at **gimme.gg**, and push/deep-link plumbing is built but not yet
configured. Companion docs: `NATIVE-BUILD.md` (build/signing mechanics), `APP-STORE-PLAN.md`
(strategy/costs), `NATIVE-APP-REQUIREMENTS.md` (deep detail).

> **Legend:** 🧑 = you (accounts/decisions/dashboards) · 🤖 = Claude can do it · 🍏 Apple · 🤖‍🟢 Google

---

## ⚠️ Read this first — the three things that sink launches

1. **Gambling / real-money classification (biggest risk).** Gimme tracks money owed on
   golf side-games. Both stores scrutinize anything betting-adjacent (Apple Guideline 5.3,
   Google's Real-Money Gambling policy). **Mitigations already in place:** points/tokens is
   the default (no $ surfaced), the app **never moves money** (links out to Venmo/etc. only),
   and copy leads with "side games · scores · settle up." **What this means for you:** answer
   the age-rating questionnaires honestly but precisely — this is a **social score-tracker
   among friends**, not a betting product. Do **not** describe it with "wager/bet/gamble/odds/
   casino." Keep it 4+/12+, not 17+/18+. If a reviewer pushes back, the defense is: no money
   changes hands in-app, no odds/house, no prizes of value awarded by the app.

2. **Apple "Minimum Functionality" (Guideline 4.2).** Apple rejects apps that are "just a
   website in a wrapper." **Mitigation in place:** native push notifications, native camera
   (photo scorecard import), and Universal Links. In the App Review notes, explicitly list
   these native capabilities so the reviewer doesn't have to hunt.

3. ~~**Google's new closed-testing gate (adds ~2 weeks).**~~ **✅ RESOLVED for Gimme.**
   The 14-day / 12-tester closed-test rule applies to **personal** accounts only. Gimme is
   enrolling as an **Organization** (LLC + D-U-N-S on hand), which is **exempt** — Android
   goes straight to production after review. The former long-pole is gone.

   **New #3 risk — Organization identity match.** Both Apple and Google verify your org
   against the D-U-N-S record. Your **legal entity name + address must EXACTLY match** what
   Dun & Bradstreet has on file (abbreviations, "LLC" vs "L.L.C.", suite numbers all matter).
   Confirm/refresh your D&B record *before* enrolling — mismatches are the #1 cause of
   multi-day org-enrollment stalls.

---

## Critical path & realistic timeline

```
Week 0    Org enrollment: Apple (D-U-N-S verify, 2–10d) + Google (ID verify) 🧑
Week 0–1  Compliance prep, listing assets, technical finalize                🧑+🤖
Week 1    iOS → TestFlight → review; Android → straight to production review  🧑+🤖
Week 1–2  Store review (Apple 1–7d, Google 1–3d)                             ⏳
Week 2    LIVE on both 🎉
```
**End-to-end: ~2–3 weeks** (org route — no 14-day Android gate). The pacing item is now
**Apple's Organization verification** against your D-U-N-S record, so get that exactly right.
iOS review may still take one cycle; Android is no longer the long pole.

---

## Phase 0 — Accounts & legal (do TODAY; everything blocks on these)

| # | Task | Who | Notes |
|---|------|-----|-------|
| 0.1 | **Apple Developer Program** — $99/yr | 🧑 | developer.apple.com/enroll. **Individual** = fast (24–48h). **Organization** needs a free D-U-N-S number (adds days) but shows your company as seller. Pick individual for speed unless you want the LLC as seller. |
| 0.2 | **Google Play Console** — $25 one-time | 🧑 | play.google.com/console. Now requires **identity verification** (ID + address, 1–3 days). Note whether it's a **personal** account (→ 14-day closed-test rule) or **organization** (exempt). |
| 0.3 | **Store app name** | 🧑 | "Gimme" is likely taken on the App Store → use **"Gimme Golf"** (or "Gimme: Golf Side Games"). Verify availability before finalizing icons. Confirm the **trademark** isn't held by someone else (not yet filed — see brand notes). |
| 0.4 | **Privacy Policy + Terms of Service** | 🤖 | Both stores require these at public URLs. I can generate Gimme-specific pages and host them at **gimme.gg/privacy** and **gimme.gg/terms** (route in the app / static). Must cover: email, scores, payment handles, how to delete an account. |
| 0.5 | **Support contact** | 🧑 | Required on both listings. `support@gimme.gg` (needs email on the domain) or a personal address to start. |
| 0.6 | **In-app account deletion** | 🤖 | Apple requires apps with login to offer in-app account deletion (Settings → Delete account → wipes profile/rounds). I'll build the button + the delete RPC. |

---

## Phase 1 — Compliance & positioning (the rejection-proofing)

- **Age rating questionnaires** (Apple's rating flow + Google's IARC): answer as a social
  utility. Frankly: no simulated gambling, no user-generated unrestricted content, no ads.
  Target **4+ (Apple) / Everyone or Teen (Google)**. 🧑 (I'll draft the exact answers.)
- **Apple App Privacy "nutrition label"** + **Google Data Safety form**: declare what
  Supabase stores (email, name, scores, optional payment handles), that it's not sold, and
  that data is encrypted in transit. 🤖 draft → 🧑 submit.
- **App Review notes** (Apple) — pre-write the "why this isn't just a website" paragraph
  (push, camera, Universal Links) + a **demo account** login so review can get in without
  creating a round. 🤖 draft.
- **Data deletion URL** (Google now asks for one even outside the app). Point to the same
  account-deletion flow / a gimme.gg/delete page. 🤖.

---

## Phase 2 — Technical finalize (mostly built; needs your accounts to complete)

1. **Merge the native branch** — `feat/capacitor-native` (PR #7) into `main`. 🤖 (on your OK)
2. **iOS signing (Xcode)** — `npx cap open ios` → Signing & Capabilities → select your Team,
   bundle id `com.gimme.golf`; add **Associated Domains** `applinks:gimme.gg`, **Push
   Notifications**, **Background Modes → Remote notifications**. 🧑 (needs your Apple Team;
   I'll sit alongside / document exact clicks).
3. **Android release keystore** — generate signing key (`keytool`), add `signingConfig` in
   `android/app/build.gradle`. 🤖 can script it; 🧑 stores the keystore + passwords safely
   (losing it = can never update the app).
4. **Finish `.well-known`** (currently stubs) and redeploy on gimme.gg:
   - `apple-app-site-association`: replace `PLACEHOLDER_TEAMID` with your real **Apple Team ID**.
   - `assetlinks.json`: replace fingerprint with the Android release cert **SHA-256**.
   🤖 does the edit + deploy the moment you give me Team ID + SHA-256.
5. **Push delivery (Firebase/FCM)** — create Firebase project, add iOS+Android apps, upload
   **APNs Auth Key (.p8)**; set `FCM_SERVICE_ACCOUNT` + `FCM_PROJECT_ID` secrets; deploy
   `send-push`; add the `notify_push` trigger (see `NATIVE-BUILD.md`). 🧑 Firebase console +
   Apple key → 🤖 wires the rest. *(Push is optional for v1 launch — can ship without it and
   add later, but it strengthens the 4.2 defense, so recommended.)*
6. **Icons & splash** — regenerate from the brand seal: `npx capacitor-assets generate`. 🤖.

---

## Phase 3 — Store listings (assets + metadata)

| Asset | Spec | Who |
|-------|------|-----|
| App icon | 1024×1024 (Apple), 512×512 (Google) — from brand seal | 🤖 generate |
| Screenshots | iPhone 6.7"/6.5" + iPad; Android phone/tablet. 5–8 each. **Highest-leverage sales asset** — show scorecard, side-games, settle-up card | 🤖 capture on sim/emulator → 🧑 polish/caption |
| Description | 4000 chars; subtitle 30 chars; keywords 100 chars. Lead with games/scores/settle-up | 🤖 draft from brand voice |
| Category | Primary **Sports**, secondary Lifestyle | 🧑 |
| Age rating | 4+ / Everyone (per Phase 1) | 🧑 |
| Privacy/ToS/support URLs | from Phase 0 | 🤖 |

---

## Phase 4 — Build, upload, test

**iOS** 🍏
1. `npm run build && npx cap sync ios`
2. Xcode → **Product → Archive** → Distribute → **App Store Connect**.
3. Build appears in **TestFlight** → invite your testers (fast, no 14-day rule).
4. Fill the App Store Connect listing → **Submit for Review**.

**Android** 🤖‍🟢
1. `npm run build && npx cap sync android`
2. Android Studio → **Generate Signed Bundle (.aab)** with the release keystore.
3. Play Console → **Closed testing** track → upload `.aab` → add ≥12 testers →
   **START THE 14-DAY CLOCK** (personal accounts). Recruit from your gimme.gg beta list.
4. After 14 continuous days + Google's checks → apply for **Production access** → submit.

---

## Phase 5 — Review & launch

- **Apple:** 1–7 days. Expect a *possible* 4.2 (minimum functionality) or 5.3 (gambling)
  question. Reply with the pre-written native-value + no-money-movement defense; usually
  clears in one cycle.
- **Google:** review 1–3 days *after* the 14-day closed test completes.
- **Launch:** approve → choose phased/immediate release → live. 🎉

---

## Who does what — the honest split

**Only you can do (accounts, money, legal identity):**
- Buy Apple Developer + Google Play accounts (0.1, 0.2)
- Xcode signing with your Team; store the Android keystore safely (2.2, 2.3)
- Create the Firebase project + upload the APNs key (2.5)
- Answer/submit age-rating, privacy, and data-safety forms (I draft; you attest) (Phase 1)
- Recruit the 12 Android testers (Phase 4)
- Decide: individual vs org account, final store name, free vs paid

**I can do (and will, on your go):**
- Merge PR #7; finish `.well-known` (once you give Team ID + SHA-256); wire push backend
- Build the in-app account-deletion flow
- Generate Privacy Policy + ToS pages hosted on gimme.gg
- Generate icons/splash; capture + arrange screenshots
- Write all listing copy, review notes, questionnaire answers, and a demo login

---

## Immediate next actions (this week)

1. 🧑 **Enroll in Apple Developer** (24–48h clock) and **Google Play Console** (ID verify).
2. 🧑 **Decide the store name** ("Gimme Golf"?) and whether accounts are personal or org.
3. 🧑 **Line up ~12 testers** for the Android closed test (your gimme.gg beta users).
4. 🤖 While that's in flight, I'll: draft Privacy/ToS, build account-deletion, prep icons +
   listing copy, and stage the `.well-known` edits so they're one-command once you have the IDs.

The accounts are the true bottleneck (approval lead time + Google's 14-day test). Start those
today; everything else can proceed in parallel.
