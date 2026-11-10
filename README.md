# Gimme

Gimme is a golf scorecard app with side games. A group picks a course and a
game, scores hole by hole on their phones, watches the standings move in real
time, and sees who owes who when the round ends. Settlement is displayed, never
collected: the app holds no funds and routes payment outward through each
player's own payment app.

Live at [www.gimme.gg](https://www.gimme.gg). Installable as a PWA. Built and
operated by PELORUS HX LLC.

## Games

Skins, Best Ball, Nassau, Wolf, Bingo Bango Bongo, Hammer, Vegas, Stableford,
Dots, Banker and Quota. Handicaps freeze at setup. Rounds can run as a single
group or as an event with several groups, a scorekeeper per group and an event
wide leaderboard. Players join a round from a six character code, a link or a
QR code, as a registered account or as a guest.

## Stack

| Layer | Technology |
|---|---|
| Client | React 18, TypeScript, Vite 5, Tailwind CSS 3 |
| Data and auth | Supabase: Postgres with row level security, email and anonymous auth, Realtime |
| Edge functions | Supabase Deno functions in `supabase/functions` |
| Errors | Sentry, no op when the DSN is unset |
| Hosting | Vercel, production deploys from `main` |
| Tests | Vitest, Testing Library, happy-dom |

## Local setup

Node 24 is what CI uses.

```sh
npm install
cp .env.example .env    # fill in the two Supabase values
npm run dev
```

`.env.example` lists every variable. Only `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are required; the client module throws at import
without them. The rest are optional.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | Full suite once, then exits |
| `npm run test:watch` | Suite in watch mode |
| `npm run build` | `tsc -b` then a production bundle in `dist` |
| `npm run preview` | Serve the production bundle locally |

The test suite never contacts Supabase, but it needs the two required
variables set to any non empty value so the client module can load:

```sh
VITE_SUPABASE_URL=http://localhost VITE_SUPABASE_ANON_KEY=test npm test
```

## Deploying

Every pull request and every push to `main` runs the CI workflow in
`.github/workflows/ci.yml`: the suite, then the production build. Branch
protection on `main` requires that check, so nothing merges on a red suite.
Vercel builds and deploys `main` on its own.

Database changes live in `supabase/migrations` with idempotent guards and are
applied through the Supabase SQL Editor. The migration history on the project
is the record of what has been applied.

## Environments

Gimme runs in three places. Each has its own database, and data never moves
between them.

| Environment | Where | Database | Who uses it |
|---|---|---|---|
| Local | `npm run dev` on your machine | a local Supabase stack, or staging | whoever is writing code |
| Staging | the staging Vercel project | the staging Supabase project | testing before a release, with made up accounts |
| Production | www.gimme.gg | the production Supabase project | real players |

**How to tell them apart.** Staging shows a thin brass line reading Staging
across the top of every screen. Production never shows it. The line is driven
by `VITE_APP_ENV`, which is set per environment in Vercel and in your `.env`.

**Staging accounts.** The seed creates three sign ins, all on example.com and
all with the password `staging-pass-123`:

| Email | Role in the seed |
|---|---|
| organizer@example.com | owns the rounds, the event and eight guest players |
| joiner@example.com | a second registered player in every round |
| admin@example.com | has the Admin dashboard |

It also creates the course catalogue, two game presets, a finished Skins round
with settlement rows, an open Wolf round on hole 7, and an event with two
groups of four (join code SEEDEV).

**Scripts.** Both need `psql` installed and `SUPABASE_DB_URL` set to the
staging database connection string from the Supabase dashboard (Connect, then
the direct connection string). Both refuse to run if that string names the
production project.

| Command | What it does |
|---|---|
| `npm run seed:staging` | adds the seed data; safe to run again, it skips rows that already exist |
| `npm run reset:staging` | empties every app table, removes the example.com accounts, then seeds again |

Neither script touches production. There is no script that writes to
production, by design.

**Previews.** Every pull request gets a Vercel preview build. Previews use
whatever environment variables the Vercel project holds for the Preview
environment. Point the Preview environment at the staging database and set
`VITE_APP_ENV=staging` there so previews show the ribbon and never write to
production. Previews are behind Vercel's sign in, so only the team can open
them.

**The QA harness.** `/?preview=result-card` renders the result card scenarios
without signing in. It works on staging and local builds only.

## Admin

One flag, `user_profiles.is_admin`, grants the Admin dashboard. Only an
existing admin can grant it, through the Users tab, and a trigger blocks every
other route.

**Audit.** Every admin action that changes data writes a row to
`admin_audit_log` inside the same database transaction, so the row exists
exactly when the change committed. The Audit tab shows the last two hundred.
Shared course and preset deletes, which are direct table writes, still log
from the client.

**Kill switches.** The Switches tab holds five rows in `feature_switches`:

| Switch | Off means | Where it is enforced |
|---|---|---|
| New rounds | nobody can start a round or create an event | the rounds insert policy |
| Joining | nobody can join a round or event | triggers on both participant tables |
| Scoring | hole scores cannot be entered or changed | a trigger on hole_scores |
| Settle Up payments | pay links and handles are hidden | client only; the app holds no funds |
| Notice | a banner shows on the home screen | client only |

Admins are never blocked. Each switch carries an optional message that players
see in place of the thing they cannot do. A missing row counts as on, so a
broken read can never lock players out. Every flip is logged.

## Layout

```
src/
  components/   screens and shared UI, one folder per screen
  lib/          game engines, settlement, handicaps, realtime, Sentry
  types/        shared TypeScript types
  hooks/
public/
  sw.js         service worker: shell precache, cache first hashed assets
  .well-known/  Apple and Android app link association files
supabase/
  migrations/   schema and RPCs
  functions/    edge functions
docs/           product, UX, store and native build notes
```

Start with `SCOPE.md` for the product picture, `docs/PRODUCT-OVERVIEW.md` for
the player's view, and `docs/NATIVE-BUILD.md` for the store shell.
