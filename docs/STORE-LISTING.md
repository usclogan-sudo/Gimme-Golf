# Gimme — Store Listing Package (App Store + Google Play)

Copy-paste-ready metadata for both stores, plus the compliance questionnaire
answers. Written to the brand voice (side games · scores · settled; money
demoted) and the real feature set. Seller/legal entity: **PELORUS HX LLC**.

> Fill-ins marked `⟨…⟩`. Character limits noted so nothing gets truncated.

---

## 1. Names & short copy

| Field | Value | Limit |
|---|---|---|
| **App name (Apple)** | `Gimme Golf` | ≤30 (10) |
| **Title (Google Play)** | `Gimme Golf: Scores & Games` | ≤30 (26) |
| **Subtitle (Apple)** | `Side games, scores, settled` | ≤30 (27) |
| **Promotional text (Apple)** | `Keep score and settle your golf side games — skins, Nassau, Wolf and more, tallied automatically as you play.` | ≤170 |
| **Short description (Google)** | `Keep score, play side games, and settle up clean with your foursome.` | ≤80 (68) |

### Keywords (Apple, ≤100 chars, comma-separated, no spaces)
```
golf,scorecard,skins,nassau,handicap,side game,golf score,best ball,wolf,settle up,foursome,tee times
```
*(Apple ignores spaces after commas; don't repeat words from the app name/subtitle — they're already indexed.)*

---

## 2. Full description (both stores, ≤4000 chars)

```
Gimme is the easiest way to keep score and settle up on your golf side games — so you can stop doing math in the parking lot and just enjoy the round.

Pick your games, tap in scores as you play, and Gimme tallies everything automatically. When you're done, it shows exactly who owes who — clean and settled.

KEEP SCORE, EFFORTLESSLY
• Fast hole-by-hole scorecard for your whole group
• Live leaderboard updates as everyone plays
• Snap a photo of a paper scorecard to import it
• Handicaps tracked round over round

ALL YOUR FAVORITE SIDE GAMES
• Skins
• Nassau
• Best Ball
• Wolf
• Bingo Bango Bongo
• Junk / props (greenies, sandies, and more)

SETTLE UP, CLEAN
• Automatic tally of who owes who
• One tap to open Venmo, PayPal, Zelle, or Cash App to square up
• Play in points if you'd rather keep it casual — no dollars required

PLAY TOGETHER
• Invite your group by name, link, or QR code
• Run multi-group outings and events with self-scoring
• Everyone sees the same live scorecard

NO FUSS
• Start a round as a guest — no account required
• Your data syncs across your devices when you sign in

Gimme keeps score and helps friends settle up among themselves. It is not a gambling service and never handles, holds, or transfers money — payments happen directly between players in the apps they already use.

Questions? support@gimme.gg
```
*(~1,500 chars — room to expand. Keeps "money/bet/wager/gamble" out of hero copy; the closing line is deliberate reviewer-facing reassurance.)*

---

## 3. Category & URLs

| Field | Value |
|---|---|
| Primary category | **Sports** |
| Secondary (Apple) | Lifestyle |
| Support URL | `https://gimme.gg` (or a support page) |
| Marketing URL | `https://gimme.gg` |
| Privacy Policy URL | `https://gimme.gg/privacy` |
| Terms URL (Google EULA optional) | `https://gimme.gg/terms` |
| Support email | `support@gimme.gg` |

---

## 4. Age rating questionnaire answers  ⚠️ read carefully

The goal is an honest **4+ (Apple) / Everyone (Google)** rating. Gimme is a
score tracker; it is **not** simulated gambling and does **not** facilitate
real-money gambling (no money moves in-app).

### Apple (App Store Connect → Age Rating)
Answer **None / No** to every content category, specifically:
- Cartoon/Fantasy/Realistic Violence → **None**
- Sexual Content, Nudity, Profanity → **None**
- Alcohol, Tobacco, Drug Use → **None**
- **Simulated Gambling → NONE** (Gimme has no casino/betting mini-games)
- **Contests → None**
- Unrestricted Web Access → **No** (the app is not a general browser)
- Medical/Treatment info → **No**
→ Result: **4+**

### Google Play (IARC questionnaire)
- App category: **Utility / Reference / Other** (a tool), not a "Game"
- Does the app contain or facilitate **gambling / betting with real money**? → **No** (no money is handled; players settle directly in third-party apps)
- Simulated gambling? → **No**
- Violence / sexual / profanity / controlled substances → **No**
- User-generated content / user interaction → **Yes** (users share scores within their group); shared content is limited to golf scores and names
→ Result: **Everyone**

> If either store asks a free-text follow-up about the "settle up" feature:
> *"Gimme is a scorekeeping tool. It records who owes whom for friendly golf
> side games and links out to third-party payment apps so players can settle
> directly. Gimme never accepts, holds, or transfers money and does not set
> odds or operate as a gambling service."*

---

## 5. Data collection disclosures

Based on what the app actually stores (see `public/privacy.html`).

### Apple — App Privacy ("nutrition label")
Data **linked to the user's identity**, used for **App Functionality only**
(not tracking, not advertising, not sold):
- **Contact Info:** Email address
- **User Content:** Name (display name), golf scores/rounds, and payment
  usernames the user chooses to add (Venmo/PayPal/Zelle/Cash App handles)
- **Identifiers:** Device push token (for notifications)
- **Diagnostics:** Crash/diagnostic data (if applicable)
- **Tracking:** **No** — data is not used to track across other companies' apps/sites.

### Google Play — Data Safety
- **Data collected, encrypted in transit, not sold, not shared for ads:**
  - Personal info: **Email**, **Name**
  - App activity / User content: **golf scores & rounds**, **payment usernames**
    (treat as user-provided text identifiers, *not* financial account numbers)
  - Device/other IDs: **push token**
- **Account/data deletion:** Yes — users can delete their account in-app
  (Settings → Delete My Account) and via request. Deletion URL/instructions:
  `https://gimme.gg/privacy` (Section 5).
- **Data used for tracking:** No.

> Note for the "Financial info" question: do **not** check credit card / bank
> categories. Gimme stores only public payment *usernames*, never card or bank
> credentials, and moves no money — so it's user content/identifiers, not
> financial data.

---

## 6. App Review notes (Apple — "Notes for Review")

```
Gimme is a native iOS app (Capacitor) that wraps our web experience and adds
native capabilities: push notifications (round invites, score approvals,
settle-up reminders), native camera access (import a paper scorecard by photo),
and Universal Links (invite links open the app directly). It is not merely a
website — these features require the native container.

You can evaluate the app WITHOUT creating an account: on the welcome screen,
choose "Try it first" to use it as a guest.

Optional demo account:
  email:    ⟨demo@gimme.gg⟩
  password: ⟨set a demo password⟩

Note on the "settle up" feature: Gimme is a scorekeeping and settle-up TRACKER
for friendly golf side games. It does NOT accept, hold, or transfer money and
is NOT a gambling service. When players choose to pay each other, the app links
out to third-party payment apps (Venmo, PayPal, Zelle, Cash App); all money
moves outside Gimme. A points/tokens mode is the default so no dollar amounts
are surfaced.
```

⚠️ **Before submitting:** create the demo account (or rely on guest mode) and
fill in the credentials above.

---

## 7. Screenshots plan (I can capture these from the simulator/emulator)

Apple needs 6.7" (iPhone) at minimum; iPad if shipping there. Google needs
phone + optional tablet. 5–6 each, captioned. Suggested set:

1. **Home / Start a Round** — caption: "Start a round in seconds"
2. **Game picker** (Skins/Nassau/Wolf/…) — "All your side games, one tap"
3. **Live scorecard** — "Tap in scores as you play"
4. **Live leaderboard** — "See who's winning, live"
5. **Settle-up / who-owes-who** — "Settled clean when you finish"
6. **Invite (QR/link)** — "Get your whole group in"

Captions avoid money/bet/gamble wording. I'll capture these from a seeded round
once we decide device frames.

---

## 8. Pre-submission checklist
- [x] `support@gimme.gg` deliverable — Porkbun email forwarding (done 2026-07-09)
- [ ] Demo account created (or confirm guest mode is enough for review)
- [ ] Screenshots captured + framed
- [ ] App icon 1024² (Apple) / 512² (Google) exported from brand seal
- [x] Apple Team ID `M35SV96877` → `apple-app-site-association` set (done 2026-07-09)
- [ ] Android keystore SHA-256 → finish `.well-known/assetlinks.json`
- [ ] Native branch merged up to `main` (account-deletion + points fix + privacy links)
- [ ] Set Play **developer name** to a brand (currently "usclogan" → Gimme / PELORUS HX)
- [ ] **Register package name `gg.gimme.app`** — Android Developer Verification (required by Sept 2026; deferred 2026-07-09)
