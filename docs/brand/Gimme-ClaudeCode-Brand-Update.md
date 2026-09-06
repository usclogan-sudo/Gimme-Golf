# Gimme — Brand Update Handoff for Claude Code

**Apply the new Gimme identity to the live PWA (`gimme.gg`)**

Prepared by: Head of Brand · Date: May 31, 2026 · v1.0

> Paste this into Claude Code in the project repo. Work top-down: P0 first. This updates **brand and copy only** — do not change app logic, features, or data flow. When unsure, ask before altering behavior.

> **Update (July 2026 — post token/points pivot):** Beta now operates in **token/points mode** — points are a friendlier synonym for money (**1 pt = $1**). In-app, amounts render as **"X pts"**; only outbound payment deep-links (Venmo/Zelle/Cash App/PayPal) show real dollars. Apply this throughout: prefer **pts** in result cards, standings, and settle-up copy; keep dollar framing only where an actual payment link is involved. This supersedes the money-forward `+$X` examples in §6.

---

## 0. Context

Gimme's brand has been rebuilt as a premium "social club" identity — a luxury-house look (navy + cream + brass, high-contrast serif wordmark, oval signet "G" seal), settlement-first positioning (the app calculates who owes who; it does **not** move money), and an inclusive, premium-but-playful voice. The live app currently contradicts this in several places (legacy "Fore Skins" strings, money-forward taglines, conflicting theme colors). Fix those and apply the new system.

---

## 1. Design tokens (implement as CSS variables / theme constants)

```
--navy:   #16263B   /* primary base, app background, theme-color */
--cream:  #F2ECDD   /* primary light, text on navy, wordmark */
--brass:  #C2A24C   /* metallic accent: rules, highlights, winner */
--slate:  #2E4257   /* secondary/support, hairlines */
--volt:   #C6F24E   /* DROP ONLY — limited apparel. Never in app/icon. Do not use here. */
```
Replace the existing slate `#1f2937` and forest `#051a0e` everywhere with `--navy`. There must be **one** primary brand color.

---

## 2. Typography

- **Display / wordmark / headlines:** a high-contrast (Didone-style) serif. Interim: load **Playfair Display** (Google Fonts) as the stand-in until a licensed display serif is chosen. Use for the GIMME wordmark, the result-card headline, and major screen titles — tracked wide, often uppercase.
- **UI / body:** keep **Inter**. Drop **Outfit** (the old display font) in favor of the serif for brand moments.
- Rule: serif = brand voice moments; Inter = functional UI.

---

## 3. P0 — fix now (actively contradicts the brand)

### 3a. Remove every "Fore Skins" trace
- `grep -ri "foreskins\|fore skins\|fore_skins" src/ public/` and replace all.
- Feedback mailto subject `Fore Skins Beta Feedback` → `Gimme Beta Feedback`.
- localStorage key `foreskins_beta_dismissed` → `gimme_beta_dismissed`.

### 3b. Kill money-forward positioning (string changes)

| Location | Old | New |
|---|---|---|
| Hero tagline (Auth, Onboarding, Home header) | `GOLF · SIDE GAMES · MONEY` | `SIDE GAMES · SCORES · SETTLED` |
| Onboarding value prop | "Track golf side games, collect buy-ins, and settle up — all in one place." | "Track your side games, keep score, and settle up clean — all in one place." |
| `<meta name="description">` + manifest `description` | "Golf side games, money, and scores — all in one place." | "Golf side games and scores, settled automatically — all in one place." |
| Payment step subtitle | "So your buddies can pay you when you win." | "So your group can settle up after the round. Optional — add it anytime." |

Rule across the app: minimize **money / buy-in / wager / bet / winnings**; prefer **settle up / square / result / the card**. Inclusive language: replace **buddies / guys / boys** with **your group / everyone**.

### 3c. Unify theme colors
- `<meta name="theme-color">`: `#1f2937` → `#16263B`
- manifest `theme_color` and `background_color`: `#051a0e` → `#16263B`
- App header gradient: rebuild on `--navy` / `--slate`.

---

## 4. Manifest & icons

- `manifest.json`: `name` "Gimme Golf", `short_name` "Gimme" (keep), update `description` per 3b, `theme_color`/`background_color` → `#16263B`.
- Regenerate `icon-192.png`, `icon-512.png`, `apple-touch-icon`, and a maskable 512 from the **new seal** (navy tile, cream/brass oval signet G). Maskable version: seal inside the Android safe zone, navy background bleed.
- Replace the `⛳` emoji used as a logo/empty-state mark with the seal (SVG) or the wordmark.

---

## 5. The brand wordmark & seal (add as reusable components)

- `Wordmark`: "GIMME" in the serif, tracked (~0.15em), cream on navy / navy on cream. Optional sub-line "THAT'S GOOD." in tracked caps, brass.
- `Seal`: inline SVG of the oval signet G (cream outer ring, brass inner ring, serif G). Use as the in-app mark, header, and watermark.

---

## 6. The result card (highest-value build)

Implement the post-round **shareable result card** as the settlement/share screen. Spec:
- Navy card, thin brass inner frame, the seal stamped at top.
- Context line (course · games · date) in tracked caps.
- Headline: `{winner} takes it.` in the serif + winner's `+X pts` in brass (points mode; `+$X` only in dollar-stakes rounds).
- A single auto-generated **witty sub-line** (tasteful, affectionate — never cruel; keep a small rotating library, e.g. "Lunch's on {last place}.").
- **Standings**: ranked rows, name + net `+/− pts`, winner in brass, others cream/muted.
- **Settle up**: the who-owes-who lines (`{from} → {to}  X pts`), zero-sum. (The card is a display artifact → show pts; the actual Venmo/etc. links elsewhere carry the dollar amount.)
- Footer: hairline + `THAT'S GOOD.` tracked, brass.
- Must export/screenshot cleanly at portrait (story) ratio for sharing.

This is the growth surface — prioritize it.

---

## 7. Voice pass on key strings (apply the three registers)

Default to **warmth + clarity** for functional/newcomer/money moments; **confident wit** only at the win/result/share. Examples:
- Pending approval: `STATUS: PENDING` → "Hang tight — {name}'s confirming the card. You're in."
- Score saved: → "Saved. You're good."
- Settlement reveal: → "That's good. Here's where everyone landed."
- Returning user / session expired: → "Welcome back. Everything's right where you left it."
- Never jokey at confusing or money moments; never "guys/boys."

---

## 8. Do NOT change

App logic, settlement math, data model, auth/sync, feature set, routes. This is a **brand-and-copy** pass. Flag anything that would require behavior changes instead of doing it silently.

---

## 9. File checklist

- [ ] `index.html` — theme-color, meta description, fonts (add Playfair, keep Inter)
- [ ] `manifest.json` — description, theme/background colors, icons
- [ ] theme/CSS — token variables, replace slate/green, header gradient
- [ ] `Auth.tsx`, `Onboarding.tsx`, `App.tsx` — tagline, value prop, voice strings
- [ ] `offline.html` — already on-palette; confirm `#16263B`
- [ ] icon assets — regenerate from the seal
- [ ] new `Wordmark` + `Seal` components
- [ ] result-card / share screen — build per §6
- [ ] `grep` sweep for "foreskins", "MONEY", "buy-in", "buddies", "guys"
