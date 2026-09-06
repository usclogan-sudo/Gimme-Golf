# Gimme Golf Tracker — Scope Document

**Last Updated:** September 6, 2026
**Repo:** https://github.com/usclogan-sudo/Gimme-Golf
**Live Site:** https://gimme.gg/

---

## 1. Project Overview

Gimme is a mobile-first web app for tracking golf side games, scores, handicaps, and money between friends. Players sign in, set up courses and player profiles, start a round with a chosen game type and buy-in, score hole-by-hole on the course, and settle up payouts at the end. The app supports 11 game types, multi-group events, tournaments, real-time collaborative scoring, and in-app payment integration.

---

## 2. Tech Stack

| Layer        | Technology                        |
|-------------|-----------------------------------|
| Frontend    | React 18 + TypeScript + Vite      |
| Styling     | Tailwind CSS v3                   |
| Database    | Supabase (PostgreSQL)             |
| Auth        | Supabase email/password + anonymous guest |
| Realtime    | Supabase Realtime (postgres_changes + presence) |
| Hosting     | Vercel (root path)                |
| CI/CD       | Vercel (auto-deploy on push to main) · Supabase GitHub integration applies migrations |

---

## 3. Current Features (What's Built)

### Authentication & Accounts
- Email/password sign-in (primary, inline on splash page)
- Anonymous guest sign-in (no account required)
- Guest-to-registered upgrade flow (preserves all data)
- Guest nudge banner with loss-aversion messaging
- Password reset flow
- 2-step onboarding wizard (profile + payment methods)
- Account deletion (cascades all user data)
- Row-level security on all tables

### User Profile
- Display name, avatar (presets + custom URL)
- Handicap index, default tee
- Payment methods: Venmo, Zelle, Cash App, PayPal (with preferred method)
- Dark mode toggle (persisted)
- Settings screen with account management

### Course Management
- Pre-loaded Ventura County course catalog (~15+ courses)
- Nationwide course search API with one-tap import
- GPS-based nearby course discovery (OpenStreetMap)
- Custom course creation (tees, ratings, slopes, pars, yardages, stroke index)
- Par templates (72/71/70) for quick setup
- Edit/delete saved courses
- Admin-managed shared course templates
- Course statistics (times played, best scores, averages)

### Player Management
- Add/edit/delete players with name, handicap, tee, GHIN, payment methods
- Quick-add player inline during round setup
- Player directory — browse all registered users and guest players
- Pinned friends for quick access
- Player stats and shared round history

### Round Creation (5-Step Wizard)
1. **Pick a course** — catalog, API search, custom, shared, or nearby
2. **Pick players** (up to 20) — registered users + guests, assign tees, auto-calculate course handicap
3. **Assign groups** — optional group assignment for multi-group play
4. **Configure game** — 11 game types with full configuration, optional junks/side bets, game presets
5. **Stakes & start** — buy-in amount, stakes mode, treasurer, game master, invite code generation, round invite notifications

### Supported Game Types (all 11 fully implemented)

| Game | Description | Options |
|------|-------------|---------|
| **Skins** | Lowest score wins the hole's pot | Gross/Net, Carryovers ON/OFF |
| **Best Ball** | 2v2 team format, best score per team | Match/Stroke play, Gross/Net, Team assignment |
| **Nassau** | 3 simultaneous bets (Front/Back/Total) | Gross/Net |
| **Wolf** | 4-player rotation, pick partner or Lone Wolf | Gross/Net, Custom wolf order |
| **Bingo Bango Bongo** | 3 points per hole | Gross/Net |
| **Hammer** | Escalating bet, can be "hammered" back | Base value, Max presses, Auto-hammer |
| **Vegas** | Team combined 2-digit scoring | Gross/Net, Team assignment |
| **Stableford** | Points-based (0 double+, 1 bogey, 2 par, 3 birdie, 4 eagle) | Gross/Net |
| **Dots** | Configurable junk bets alongside play | Dot types, Value per dot |
| **Banker** | Rotating banker per hole | Gross/Net, Banker order |
| **Quota** | Target based on handicap | Gross/Net, Per-player quotas |

### Stakes Modes
- **Standard:** Buy-in presets $5-$50
- **High Roller:** Buy-in presets $100-$1,000 with premium gold UI theme

### Live Scorecard
- Touch-optimized number pad score entry
- Hole navigator (1-18) with scored/unscored visual distinction
- Score badges (Eagle, Birdie, Par, Bogey, Double+)
- USGA handicap strokes displayed per player per hole
- Net score calculation and running totals (gross + vs-par)
- Game-specific live panels for all 11 game types
- Junk tracking (sandy, greenie, snake, barkie, CTP)
- Custom side bets per hole (description, amount, participants, resolution)
- Celebrations (hole-in-one, eagle, birdie — toast + fullscreen animation)
- Score validation (flags unlikely scores with warnings)
- Undo button, leave confirmation, network error handling
- Offline queue (scores saved locally, synced when connection restores)
- Invite code sharing for collaborative scoring
- Real-time score sync via Supabase Realtime

### Settle Up & Payments
- Game-specific results display (skins won, team winners, units, points)
- Unified settlements combining game + junk + side bet payouts
- Treasurer-based payout model
- Payment deep links: Venmo, Zelle, Cash App, PayPal (with pre-filled amounts, mobile detection)
- Settlement tracking (from/to player, amount, reason, status)
- Historical payment ledger by opponent with date range filtering
- Mark settlements as paid

### Events (Multi-Group Play)
- 6-step event creation wizard
- Multi-group events (up to 5 players per group)
- Group-specific scorekeepers
- Score approval workflow (pending/approved/rejected by scorekeeper)
- Event invite codes
- Live event leaderboard with group tabs
- Online presence indicators

### Tournaments
- Single elimination bracket
- Double elimination bracket (winners + losers brackets)
- Stroke play format
- Bye handling for non-power-of-2 player counts
- Visual bracket display
- Tournament list (active/completed)

### Notifications
- Real-time in-app notifications via Supabase Realtime
- Types: round_invite, score_update, unsettled_round, round_complete
- Toast popup with auto-dismiss
- Round invite toast with "Join" action button
- Unread badge count, mark read / mark all read

### Sharing & Social
- Join round via invite code (URL param or manual entry)
- Spectate mode (live leaderboard via spectator code, no account required)
- In-app round invite notifications with Join button
- Player directory with shared round history
- Pinned friends

### Analytics & Stats
- Personal dashboard (net winnings, scoring avg, head-to-head, monthly trends)
- Player stats (rounds, wins, payouts, score distribution, game breakdown)
- Round history with hole-by-hole scores, delete, play again
- Course statistics (times played, best scores, averages)
- WHS handicap calculation from round differentials
- Handicap progression chart

### Admin
- Admin dashboard with user/round/player/course management
- Create user accounts, set/revoke admin, delete users
- View/delete rounds, edit players, edit user profiles
- Shared course template management
- Game preset management with sorting
- System stats (total users, rounds, courses, active/completed)

### PWA & Offline
- Install banner/prompt
- Offline score entry queue (syncs on reconnect)

---

## 4. Data Model

### Database Tables (21 tables, Supabase PostgreSQL)

All tables have `user_id` with row-level security (`auth.uid() = user_id`).

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `courses` | Saved golf courses | name, tees (JSONB), holes (JSONB) |
| `players` | Guest player profiles | name, handicap_index, tee, ghin_number, payment fields |
| `rounds` | Round metadata & state | course_id, status, current_hole, game (JSONB), course_snapshot (JSONB), invite_code, created_by |
| `round_players` | Players in a round | round_id, player_id, tee_played, course_handicap, playing_handicap |
| `hole_scores` | Score per player per hole | round_id, player_id, hole_number, gross_score, score_status, submitted_by |
| `buy_ins` | Buy-in tracking | round_id, player_id, amount_cents, status, method |
| `bbb_points` | BBB game points | round_id, hole_number, bingo, bango, bongo |
| `user_profiles` | User account settings | display_name, handicap_index, tee, payment fields, avatar, is_admin, onboarding_complete |
| `shared_courses` | Admin-curated course library | name, tees (JSONB), holes (JSONB) |
| `game_presets` | Reusable game configurations | name, game_type, buy_in_cents, config (JSONB), sort_order |
| `junk_records` | Junk/dot game records | round_id, hole_number, player_id, junk_type |
| `pinned_friends` | User's saved contacts | user_id, friend_user_id |
| `round_participants` | Users who joined via invite code | round_id, user_id, player_id |
| `settlements` | Payment settlement records | round_id, from_player_id, to_player_id, amount_cents, source, status |
| `notifications` | In-app notifications | user_id, type, title, body, round_id, invite_code, read |
| `side_bets` | Per-hole side bets | round_id, hole_number, description, amount_cents, participants, winner_player_id, status |
| `tournaments` | Tournament configs | name, format, status, player_ids, config (JSONB) |
| `tournament_rounds` | Rounds within tournaments | tournament_id, round_id, round_number, bracket_round, status |
| `tournament_matchups` | Head-to-head match pairings | tournament_id, bracket_round, match_number, player_a_id, player_b_id, winner_id, loser_bracket |
| `events` | Multi-group golf events | name, status, round_id, invite_code, group_scorekeepers (JSONB), created_by |
| `event_participants` | Event members with roles | event_id, user_id, player_id, role, group_number |

### Key Types (TypeScript)

- `Course` — name, tees[], holes[]
- `Player` — name, handicapIndex, tee, ghinNumber?, payment fields
- `UserProfile` — displayName, handicapIndex, tee, payment fields, avatar, isAdmin
- `Round` — courseId, status, currentHole, game, courseSnapshot, inviteCode, players[], groups
- `Game` — type (11 types), buyInCents, stakesMode, config (type-specific)
- `HoleScore` — roundId, playerId, holeNumber, grossScore, scoreStatus
- `SettlementRecord` — roundId, from/to player, amountCents, source (game/junk/side_bet), status
- `AppNotification` — userId, type, title, body, roundId, inviteCode, read
- `Tournament` — name, format (single/double elim, stroke play), status, playerIds
- `GolfEvent` — name, status, roundId, inviteCode, groupScorekeepers

---

## 5. Architecture Notes

- **Single-page app** — screen state managed via `useState<Screen>` in App.tsx (27 screens)
- **No router** — all navigation is state-driven with pushState/popstate for browser back button
- **DB naming** — snake_case in Supabase, camelCase in TypeScript, mapped via functions in `src/lib/supabase.ts`
- **Auth states** — `undefined` = loading (spinner), `null` = not authenticated (Auth screen), `Session` = authenticated (app)
- **Handicap math** — USGA formula in `src/lib/gameLogic.ts`: `courseHcp = round(index * slope/113 + (rating - par))`
- **WHS handicap** — Full World Handicap System calculation in `src/lib/handicap.ts` using 20 most recent differentials
- **Game logic** — Complete scoring/payout engines for all 11 game types in `src/lib/gameLogic.ts` (~1,550 lines)
- **Realtime** — Supabase Realtime for score sync (hole_scores), notifications (INSERT events), and presence (online indicators in events)
- **Offline support** — `src/lib/offlineQueue.ts` queues score writes when offline, flushes on reconnect
- **Home refresh** — `homeKey` state incremented on navigation back, forces component remount + data refetch
- **SECURITY DEFINER RPCs** — Admin functions and cross-user operations (e.g., round invite notifications) use Supabase RPCs that bypass RLS with internal authorization checks
- **Env vars** — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set as GitHub repo variables

---

## 6. Future Features (Priority Order)

### P0 — High Value
1. **Press mechanics for Skins/Nassau** — Player-initiated double-or-nothing mid-round (core competitive feature)
2. **Push notifications** — Service worker push for round invites, score updates, settlement reminders
3. **GHIN handicap auto-sync** — Pull latest handicap from USGA GHIN API

### P1 — Nice to Have
4. **Share scorecard screenshot** — Generate image of scorecard/leaderboard for text/social sharing
5. **Email notifications** — Round invites, settlement reminders, weekly stats summary
6. **Treasurer audit dashboard** — Review all scores, payouts, payment statuses, flag disputes
7. **Full PWA service worker** — Offline caching beyond score entry, app icon and splash screen

### P2 — Future Vision
8. **Social login** — Google and Apple sign-in
9. **GPS-based "Find Games Near Me"** — Discover open events at nearby courses
10. **In-app payment processing** — Stripe/Venmo API for direct payments instead of deep linking
11. **Weather integration** — Current conditions and wind for the course location
12. **Data export** — CSV/PDF export of rounds, stats, and ledger
13. **AI caddie** — Course strategy suggestions based on handicap and hole layout
14. **Platform fees** — Optional admin/platform fee per round or per player

---

## 7. File Structure

```
Gimme-Golf/
├── .github/workflows/deploy.yml       # GitHub Pages deploy — DISABLED, kept for rollback
├── vercel.json                        # Rewrites, cache headers, SPA fallback
├── supabase/migrations/               # Schema history — the source of truth
├── public/
│   └── 404.html                       # Legacy SPA redirect from the Pages era
├── src/
│   ├── App.tsx                        # Main app: 27 screens, routing, Home dashboard
│   ├── main.tsx                       # React entry point
│   ├── types/index.ts                 # All TypeScript interfaces
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client + all row↔TypeScript mappers
│   │   ├── gameLogic.ts              # Scoring & payout engines for all 11 game types (~1,550 lines)
│   │   ├── handicap.ts              # WHS handicap calculation
│   │   ├── tournamentLogic.ts       # Bracket generation & tournament math
│   │   ├── golfCourseApi.ts         # Course search API integration
│   │   └── offlineQueue.ts          # Offline score entry queue
│   ├── hooks/
│   │   ├── useNotifications.ts      # Realtime notification subscription
│   │   ├── useOnlineStatus.ts       # Presence channel for online indicators
│   │   └── useDarkMode.ts           # Dark mode toggle persistence
│   ├── data/
│   │   ├── venturaCourses.ts        # Pre-loaded Ventura County courses
│   │   └── gameRules.ts             # Game rules content for all 11 types
│   └── components/
│       ├── Admin/AdminDashboard.tsx       # Admin: users, rounds, players, courses, presets
│       ├── Auth/
│       │   ├── Auth.tsx                   # Login/signup splash page
│       │   ├── ResetPassword.tsx          # Password reset flow
│       │   └── UpgradeAccount.tsx         # Guest → registered upgrade
│       ├── CourseCatalog/CourseCatalog.tsx # Browse, search, import courses
│       ├── CourseSetup/CourseSetup.tsx     # Custom course creation/editing
│       ├── CoursesDetail/CoursesDetail.tsx # Course statistics
│       ├── EventSetup/EventSetup.tsx      # Multi-group event creation
│       ├── EventLeaderboard/EventLeaderboard.tsx # Live event scoring with groups
│       ├── GuestBanner/GuestBanner.tsx    # Guest upgrade nudge
│       ├── HandicapDetail/HandicapDetail.tsx # WHS handicap history & chart
│       ├── JoinRound/JoinRound.tsx        # Join active round via invite code
│       ├── Ledger/Ledger.tsx              # Payment ledger by opponent
│       ├── LiveLeaderboard/LiveLeaderboard.tsx # Spectator live leaderboard
│       ├── NearMeCourses/NearMeCourses.tsx # GPS nearby course discovery
│       ├── NewRound/NewRound.tsx          # 5-step round creation wizard
│       ├── Onboarding/Onboarding.tsx      # First-time user setup
│       ├── PersonalDashboard/PersonalDashboard.tsx # Personal stats & trends
│       ├── PlayerDirectory/PlayerDirectory.tsx # Browse all players
│       ├── PlayerSetup/PlayerSetup.tsx    # Add/edit player profiles
│       ├── RoundHistory/RoundHistory.tsx  # Completed rounds archive
│       ├── RoundsDetail/RoundsDetail.tsx  # Aggregated round statistics
│       ├── Scorecard/
│       │   ├── Scorecard.tsx              # Live score entry + game panels
│       │   └── NumberPad.tsx              # Touch-optimized input
│       ├── Settings/Settings.tsx          # Profile, payments, dark mode, account
│       ├── SettleUp/SettleUp.tsx          # Post-round settlements & payments
│       ├── Stats/Stats.tsx                # Player statistics
│       ├── TournamentBracket/TournamentBracket.tsx # Visual bracket display
│       ├── TournamentDetail/TournamentDetail.tsx   # Tournament view & match play
│       ├── TournamentList/TournamentList.tsx       # Browse tournaments
│       ├── TournamentSetup/TournamentSetup.tsx     # Create tournament
│       ├── AvatarPicker.tsx               # Avatar selection
│       ├── Celebrations.tsx               # Score celebration animations
│       ├── ConfirmModal.tsx               # Generic confirmation dialog
│       ├── GameRulesModal.tsx             # Game rules reference
│       ├── HandicapChart.tsx              # Handicap progression chart
│       ├── InstallBanner.tsx              # PWA install prompt
│       ├── NotificationBadge.tsx          # Unread count indicator
│       ├── NotificationToast.tsx          # Toast popup with actions
│       ├── PaymentButtons.tsx             # Deep links for Venmo/Zelle/Cash App/PayPal
│       └── ui/Tooltip.tsx                 # Reusable tooltip
├── supabase-schema.sql                    # Core database schema (7 tables)
├── supabase-schema-phase3.sql             # user_profiles, shared_courses, game_presets
├── supabase-schema-phase4.sql             # Additional schema updates
├── supabase-schema-phase5.sql             # junk_records
├── supabase-schema-phase6.sql             # Schema updates
├── supabase-schema-phase7.sql             # Schema updates
├── supabase-schema-phase8.sql             # pinned_friends
├── supabase-schema-phase9.sql             # round_participants
├── supabase-schema-phase10.sql            # settlements
├── supabase-schema-phase12-17.sql         # notifications, side_bets, tournaments
├── supabase-schema-events.sql             # events, event_participants
├── supabase-schema-admin.sql              # Admin RPCs (SECURITY DEFINER)
├── supabase-schema-admin-only.sql         # Admin-only mode schema
├── supabase-migration-settlement-unique.sql # Settlement dedup migration
├── REQUIREMENTS.md                        # Functional requirements (v2.0)
├── SCOPE.md                               # This file
├── .env.local                             # Local Supabase credentials
├── vite.config.ts                         # Vite config (base: /)
├── tailwind.config.js                     # Tailwind theme
└── package.json
```

---

## 8. Dev Setup

```bash
# Clone and install
git clone https://github.com/usclogan-sudo/Gimme-Golf.git
cd Gimme-Golf
npm install

# Set up environment
cp .env.local.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Run locally
npm run dev
# Opens at http://localhost:5173/

# Build for production
npm run build
```

---

## 9. Supabase Setup

1. Create a Supabase project
2. Run `supabase-schema.sql` in the SQL Editor to create core tables with RLS
3. Run phase migration files in order (phase3 → phase5 → phase8 → phase9 → phase10 → phase12-17 → events)
4. Run `supabase-schema-admin.sql` for admin RPCs
5. Enable Email auth in Authentication > Providers (autoconfirm enabled)
6. Set Site URL to your deployed URL in Authentication > URL Configuration
7. Add your deployed URL to Redirect URLs
8. Enable Realtime for tables: `hole_scores`, `notifications`
9. Copy Project URL and anon key to `.env.local` and GitHub repo variables

---

## 10. Metrics

- **55 source files** (41 components + 6 lib + 3 hooks + 2 data + 3 core)
- **27 screens** in the app
- **21 database tables** with RLS
- **11 game types** with full scoring/payout engines
- **~1,550 lines** of game logic
- **3 tournament formats** (single elim, double elim, stroke play)
- Clean TypeScript build, no errors
