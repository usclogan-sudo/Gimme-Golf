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
