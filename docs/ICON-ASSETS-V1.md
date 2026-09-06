# Gimme — Icon Asset Spec (Brand v1.0)

This document specifies the icon assets that need to be regenerated for Brand v1.0 (the navy/cream/brass premium identity). It exists so the person producing the seal SVG / icon PNGs has every constraint in one place and can deliver assets that drop directly into the repo.

> See also: `docs/brand/Gimme-ClaudeCode-Brand-Update.md` (the brand brief) and `docs/brand/Gimme-Native-App-Developer-Brief.md` (native partner brief).

---

## What needs to be produced

### 1. Source: `seal.svg`

The reusable brand mark — the oval signet "G" seal described in brief §5. All raster icons below are renders of this single SVG.

**Required deliverable:** `public/seal.svg`

**Spec:**
- Oval (slightly taller than wide), navy `#16263B` background tile underneath
- Outer ring: cream `#F2ECDD`, ~6% of seal height
- Inner ring: brass `#C2A24C`, ~2% of seal height, hairline between rings
- Centered "G" — high-contrast Didone-style serif (Playfair Display 900 is the interim stand-in; final mark should use the licensed display serif once chosen), cream `#F2ECDD`, optical alignment in the oval (not geometric — slight upward shift looks balanced)
- All paths, no text elements (so it renders consistently without web fonts)
- ViewBox `0 0 200 220` (or any 10:11 ratio) — code consumes this dimensionless
- No drop shadow, no gradient — flat brand mark only

### 2. App icons (raster)

Every PNG below is a render of `seal.svg` placed on a full-bleed navy `#16263B` tile.

| File | Size | Format | Notes |
|---|---|---|---|
| `public/icon-192.png` | 192 × 192 | PNG | Android / web — standard manifest icon |
| `public/icon-512.png` | 512 × 512 | PNG | Manifest large icon + iOS source |
| `public/icon-512-maskable.png` | 512 × 512 | PNG | Android maskable — seal centered inside the 80% safe zone (40px margin all sides), navy fills the bleed area outside |
| `public/apple-touch-icon.png` | 180 × 180 | PNG | iOS home-screen icon (referenced in `index.html`) |

**Safe-zone rules for the maskable version:** Android applies arbitrary masks (circle, squircle, rounded square, etc.) to a 512×512 PNG. The seal must sit inside the central 410×410 area; navy must extend to all four edges. If you crop tight to the seal, Android will chop it.

**No transparent backgrounds.** Every icon should have a full navy `#16263B` background fill — the install splash and dark home-screen wallpapers expect a solid tile.

### 3. iOS splash screens (defer for now — flag for review)

The three existing splash PNGs use the old palette and need regenerating *only* if the navy-cream-brass system is approved past the v1.0 interim. Current files:
- `public/splash-se.png` (640 × 1136)
- `public/splash-standard.png` (1170 × 2532 — for iPhone 12/13/14/15 standard, scaled)
- `public/splash-promax.png` (1290 × 2796 — for Pro Max)

**Spec if regenerated:** seal centered, navy background, brass "GIMME" wordmark below the seal (Playfair Display 800, cream `#F2ECDD`, tracked +0.15em), brass hairline under the wordmark, `THAT'S GOOD.` tracked caps under hairline.

Defer until the brand team confirms the Playfair Display interim is the right typographic call for splash. The current splash assets still load — they just don't match the navy system. Low-priority polish.

---

## Where the references live in code

If you (or whoever produces the assets) needs to confirm the paths are wired correctly:

| Reference | File | Line context |
|---|---|---|
| `apple-touch-icon` | `index.html` | `<link rel="apple-touch-icon" href="/icon-192.png" />` (note: currently points at the 192 — should be a dedicated 180px file once produced) |
| Splash entries (3) | `index.html` | `<link rel="apple-touch-startup-image" ...>` blocks |
| `icon-192.png` | `public/manifest.json` | inside `icons[]` array |
| `icon-512.png` | `public/manifest.json` | inside `icons[]` array — two entries (one for `purpose: "any"`, one currently re-using `icon-512.png` for `purpose: "maskable"` — switch the maskable entry to `icon-512-maskable.png` once it exists) |

---

## Delivery checklist

When the assets arrive, drop them into `public/` and update the references:

- [ ] `public/seal.svg` exists, valid SVG, paths-only
- [ ] `public/icon-192.png` exists, 192×192, navy bg
- [ ] `public/icon-512.png` exists, 512×512, navy bg
- [ ] `public/icon-512-maskable.png` exists, 512×512, seal inside safe zone, navy bleed
- [ ] `public/apple-touch-icon.png` exists, 180×180, navy bg
- [ ] `public/manifest.json` maskable entry switched from `icon-512.png` to `icon-512-maskable.png`
- [ ] `index.html` `apple-touch-icon` href switched from `icon-192.png` to `apple-touch-icon.png`
- [ ] Smoke test: PWA install on iOS Safari → icon shows navy/seal, not the prior flag-emoji default
- [ ] Smoke test: PWA install on Android Chrome → maskable icon renders correctly under both circle and squircle masks (use Chrome DevTools → Application → Manifest → Maskable preview)

Once all checks pass, the ⛳ emoji can be retired from in-app empty states (`App.tsx`, `Auth.tsx`, `Onboarding.tsx`, `ResetPassword.tsx`, `Scorecard.tsx`, offline page) and replaced with `<img src="/seal.svg">` or a `<Seal>` React component.

---

## Out of scope

- Wordmark SVG (a typeset GIMME mark — different from the seal). The brief mentions both; whoever produces the seal may also produce a wordmark SVG, but it's a separate file (`public/wordmark.svg`) and is not blocking icon work.
- Social Open Graph / Twitter Card images (`og-image.png` at 1200×630). Should be produced eventually for link-preview shares, but the app doesn't currently reference any.
- App Store / Play Store hero images. Tracked separately in `docs/APP-STORE-PLAN.md`.
