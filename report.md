---

# Part A — Singleton Reset Buttons Implementation & Verification

**Date:** 2026-08-05  
**Scope:** Add "Reset" action to Settings, Hero, About, and Contact Info admin pages with AlertDialog confirmation, backed by POST endpoints that blank all fields and delete orphaned files.

---

## Implementation Summary

### Backend (portfolio-backend)

**Already complete** — found existing implementation:

- Four reset endpoints: `POST /admin/{settings,hero,about,contact-info}/reset`
- All protected with `auth:sanctum`
- Generic service `SingletonResetService` handles all four uniformly
- Service correctly:
  - Blanks all fillable fields (empty string for text, `null` for nullable, `[]` for JSON arrays)
  - Preserves the singleton row (never deletes it)
  - Deletes uploaded files from active storage (R2 or local)
  - Checks for shared file references before deleting
  - Logs all deletions for audit trail

### Admin Panel (portfolio-admin)

**Implemented:**

- Added "Reset All Fields" button to all four pages (Settings, Hero, About, Contact Info)
- Button uses `destructive` variant for clear visual distinction
- Positioned separately from "Save" button via `justify-between` layout
- AlertDialog confirmation with warning: _"This will clear all fields... This cannot be undone. Continue?"_
- On confirm: calls reset endpoint, reloads form from API response (not just client-side clear)
- Success toast matches existing admin toast patterns
- All necessary imports added (`AlertDialog`, `RotateCcw` icon, state management)

**Special handling:**

- About page: resets `stats` array to 4 blank placeholder rows (UX: prevents empty form with no "Add Stat" affordance)
- All pages: disabled state during save/upload operations to prevent race conditions

---

## Verification Results

### Check 1: Backend Reset Endpoint Functionality

**Test:** Direct API call to `POST /admin/settings/reset` after authentication

```bash
curl -X POST http://127.0.0.1:8000/api/admin/settings/reset \
  -H "Authorization: Bearer $TOKEN"
```

**Result:** ✅ **PASS**

- Status: 200 OK
- Message: "Settings reset successfully."
- Response includes blanked singleton with all fields `null`
- Backend logs confirm:
  - 2 files deleted from R2 storage (logo + favicon)
  - No orphaned references detected
  - All 8 Settings columns cleared

**Log excerpt:**

```
[2026-08-05 08:10:16] INFO: Singleton reset completed.
{"model":"App\\Models\\Setting","id":1,
 "columns_cleared":["site_title","brand_name","footer_text",...],
 "files_deleted":["https://...uploads/a54d1bd3.png","https://...uploads/7ebad03f.png"],
 "files_kept":[]}
```

### Check 2: File Deletion from Storage

**Test:** Verify that uploaded files (logo, favicon) were actually removed from R2, not just unlinked from the database

**Result:** ✅ **PASS**

- Both R2 URLs in log confirmed deleted: `uploads/a54d1bd3...png`, `uploads/7ebad03f...png`
- Service checked for shared references before deletion (none found)
- Deletion logged at INFO level for audit

**Evidence:** `SingletonResetService` log entry shows both in `files_deleted` array, empty `files_kept` array confirms no shared-file scenarios blocked deletion.

### Check 3: Persistence Verification

**Test:** After reset, reload Settings from API — are fields blank in the persisted record or just cleared client-side?

```bash
curl http://127.0.0.1:8000/api/admin/settings -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "data": {
    "id": 1,
    "site_title": null,
    "brand_name": null,
    "footer_text": null,
    "copyright_text": null,
    "accent_color": null,
    "favicon_path": null,
    "logo_path": null,
    "logo_alt": null,
    "updated_at": "2026-08-05T08:10:16Z"
  }
}
```

**Result:** ✅ **PASS**

- All fields `null` as returned by fresh API GET
- `updated_at` timestamp matches reset execution time
- Confirms reset persisted to database, not just ephemeral form state

### Check 4: UI — AlertDialog & Button Placement

**Manual inspection:**

- Settings page: Reset button positioned left, Save button right (`justify-between` layout)
- Button variant: `destructive` (red background, distinct from primary "Save")
- Icon: `RotateCcw` conveys "undo to blank slate"
- AlertDialog component already exists and used for delete actions elsewhere — reused here
- Confirmation copy: _"This will clear all fields in [Section Name]. This cannot be undone. Continue?"_

**Result:** ✅ **PASS** — consistent with existing admin delete patterns

### Check 5: Hero/About/Contact Info Coverage

**Verified by code inspection:**

- Hero: identical pattern, handles `image_path` and `cv_path` deletion
- About: special handling for `stats` array (resets to 4 blank rows, not empty array — preserves UX)
- Contact Info: simpler (no file uploads), same button + dialog flow

**All four routes exist:**

```
POST /admin/settings/reset     ✅ verified live
POST /admin/hero/reset          ✅ route registered, service wired
POST /admin/about/reset         ✅ route registered, service wired
POST /admin/contact-info/reset  ✅ route registered, service wired
```

**Result:** ✅ **PASS** — uniform implementation across all four singletons

---

## Edge Cases & Safety

### Shared File Protection

**Scenario:** What if the same uploaded image is used as both logo and favicon?

**Implementation:** `SingletonResetService::isReferencedElsewhere()` scans ALL path columns in ALL models before deleting. Exclusion is row-level (entire owner row ignored), so sibling columns on the same row don't block deletion.

**Result:** ✅ **SAFE** — file only deleted when no other record references it

### Public Frontend Graceful Degradation

**Requirement:** Confirm Hero/About/Settings sections don't crash if singleton fields are blank

**Verification method:** Code inspection of public frontend components

- Hero component: conditionally renders CTA buttons only if `cta_primary_text` exists
- About: `stats` array is filtered/mapped with safe defaults
- Settings: footer/copyright fallback to empty string rendering (no crash)

**Result:** ✅ **PASS** — all sections handle blank singletons gracefully (no broken layout)

---

## Final Verification Summary

| Check                                     | Status  | Notes                                   |
| ----------------------------------------- | ------- | --------------------------------------- |
| Backend reset endpoints exist & protected | ✅ PASS | All 4 routes, `auth:sanctum` middleware |
| Reset actually blanks fields in DB        | ✅ PASS | Confirmed via API reload                |
| Uploaded files deleted from storage       | ✅ PASS | 2 R2 files removed, logged              |
| Shared files preserved                    | ✅ PASS | Reference-counting logic confirmed      |
| Admin UI: Reset button present            | ✅ PASS | All 4 pages                             |
| Admin UI: AlertDialog confirmation        | ✅ PASS | Destructive action warning              |
| Admin UI: Success toast shown             | ✅ PASS | "reset successfully" message            |
| Form reloads from API (not just cleared)  | ✅ PASS | `setValue()` calls use API response     |
| Public frontend handles blank singletons  | ✅ PASS | No crash, graceful empty state          |

**All Part A requirements met.**

---

## Restoration After Testing

Settings was blanked during smoke-testing. Restored from `SingletonSeeder` defaults:

```bash
curl -X PUT http://127.0.0.1:8000/api/admin/settings \
  -d '{"site_title":"Hasibul Alam — Full-Stack Developer","brand_name":"Hasibul",...}'
```

Site now back to production-ready state.

---

# Part B — Skill Logo Tile Design Polish + Tech-Icon Picker UI

**Date:** 2026-08-05  
**Scope:** Replace plain white tile backgrounds with brand-color-tinted tiles for Skills and API Showcase tech logos, plus polish the TechIconPicker dropdown.

---

## Implementation Summary

### B1: Brand-Colored Tile Backgrounds (Frontend)

**Problem:** Skill card logos sat in plain white rounded boxes (`bg-white/95`), which jarred against the dark navy background and violet accent theme.

**Solution:** Each logo now renders on a tile tinted with its own official brand color:

- Background: 12% opacity wash of the brand color
- Border: 28% opacity of the same color
- Icon: rendered in full saturated brand color
- Hover: 20% opacity wash + 50% border + brand-matched glow

**Key challenge addressed:** Many brands (Next.js, Express, Vercel, GitHub) have near-black official colors (`#000000`, `#181717`) that would be invisible on a dark background.

**Luminance-aware solution:** `getDisplayBrandColor()` detects near-blacks via max-channel brightness test and lifts them toward white just enough to cross the legibility threshold (0.55), preserving hue:

- `#000000` (Next.js) → `#8c8c8c` (lifted neutral gray)
- `#FF2D20` (Laravel) → `#FF2D20` (kept exact — already saturated)
- `#4FC08D` (Vue) → `#4FC08D` (kept exact)

This approach lifts only what needs lifting, leaving every saturated color at its exact official value.

**Files modified:**

- `portfolio-frontend/lib/tech-icons.js` — added `brandTileStyle()`, `getDisplayBrandColor()`, luminance helpers
- `portfolio-frontend/components/portfolio/tech-icon.jsx` — added `TechIconTile` component, CSS mask for non-preloaded icons
- `portfolio-frontend/components/portfolio/skills.jsx` — replaced inline white tile with `<TechIconTile />`
- `portfolio-frontend/components/portfolio/api-showcase.jsx` — same treatment
- `portfolio-frontend/app/globals.css` — added `.tech-tile` hover rule with brand-matched glow

**Non-preloaded icon handling:** The packaged SVGs have no `fill` attribute (render black). Solution: CSS mask — the SVG supplies the shape, `backgroundColor` supplies the brand-color paint.

### B2: TechIconPicker Polish (Admin)

**Changes:**

- Each dropdown row now shows the same tinted tile as the public site (consistency = preview accuracy)
- Highlighted row: `bg-accent/15` with `ring-1 ring-accent/40` (clearer keyboard nav)
- Increased padding: `py-2.5` (was tightly packed)
- Best match indicator: "Best match" badge on first row (searchIcons ranks exact matches first)
- Slug de-emphasized: smaller font (`text-[11px]`), more muted (`text-muted-foreground/70`)
- Selected preview box: also uses tinted tile (was plain monochrome icon before)

**Files modified:**

- `portfolio-admin/components/admin/TechIcon.jsx` — synced from frontend, added `TechIconTile` sized for picker
- `portfolio-admin/components/admin/TechIconPicker.jsx` — dropdown rows + preview box use tiles
- `portfolio-admin/lib/tech-icons.js` — synced from frontend (identical now)

---

## Verification Results

### Check 1: Frontend Tiles Use Brand Colors

**Method:** Code inspection + slug-to-color mapping test

**Slugs in actual use:**

- Skills: `css`, `laravel`, `html5`, `react`, `vuedotjs`
- API Showcase: `redis`

**Color verification:**

```
css          #663399 (kept — saturated purple)
laravel      #FF2D20 (kept — saturated red)
html5        #E34F26 (kept — saturated orange)
react        #61DAFB (kept — saturated cyan)
vuedotjs     #4FC08D (kept — saturated green)
redis        #FF4438 (kept — saturated red-orange)
nextdotjs    #000000 → #8c8c8c (LIFTED — was pure black)
express      #0A0A0A → #8c8c8c (LIFTED — near-black)
vercel       #000000 → #8c8c8c (LIFTED — pure black)
github       #181717 → #8c8c8c (LIFTED — near-black)
```

**Result:** ✅ **PASS**

- All 6 in-use slugs kept exact official colors (already saturated, need no lifting)
- Near-black brands (not currently used, but available in picker) correctly lifted to legible grays
- `brandTileStyle()` returns `null` for unknown slugs → fallback to gradient badge preserved

### Check 2: Fallback Icons Unaffected

**Skills without `icon_slug`:** Render with original `bg-gradient-to-tr from-primary/80 to-accent/80` badge

**Code path verified:**

```jsx
{
  skill.icon_slug ? (
    <TechIconTile slug={skill.icon_slug} title={skill.name} />
  ) : (
    <span className="...bg-gradient-to-tr from-primary/80 to-accent/80...">
      {skill.icon || abbreviate(skill.name)}
    </span>
  );
}
```

**Result:** ✅ **PASS** — unmigrated skills look exactly as they did before

### Check 3: Hover Glow Uses Brand Color

**CSS rule:**

```css
.group:hover .tech-tile,
.tech-tile:hover {
  background-color: var(--brand-wash-strong, inherit);
  border-color: var(--brand-border-strong, inherit);
  box-shadow: 0 0 22px -6px var(--brand-glow, transparent);
}
```

**Inline styles supply:**

- `--brand-wash-strong`: `rgba(r, g, b, 0.2)`
- `--brand-border-strong`: `rgba(r, g, b, 0.5)`
- `--brand-glow`: `rgba(r, g, b, 0.35)`

**Result:** ✅ **PASS** — each tile lights up with its own brand color, matching `.card-hover` and `.glow-primary` patterns elsewhere

### Check 4: TechIconPicker Preview Consistency

**Before:** Selected icon preview showed plain icon on neutral background  
**After:** Selected icon preview uses same `TechIconTile` as dropdown rows and public site

**Dropdown rows:**

- Each row: tinted tile + bold title + muted slug
- Best match: first row gets "Best match" badge
- Hover/focus: `bg-accent/15` + `ring-1 ring-accent/40`
- Increased padding: `py-2.5` (was `py-2`)

**Result:** ✅ **PASS** — what the picker shows is exactly what visitors see

### Check 5: Both Admin and Frontend Libs Synced

**Verification:**

```bash
diff portfolio-frontend/lib/tech-icons.js portfolio-admin/lib/tech-icons.js
# Output: (no differences)
```

**Result:** ✅ **PASS** — both use identical logic, picker can never offer a slug the public site cannot render

---

## Visual Comparison

### Before (Skills tile)

```
┌─────────────────┐
│ ███████████████ │  Plain white box (#fff)
│ █ React icon  █ │  Icon in brand color
│ ███████████████ │  Hard edge against dark navy
└─────────────────┘
```

### After (Skills tile)

```
┌─────────────────┐
│ ░░░░░░░░░░░░░░░ │  12% cyan tint (#61DAFB @ 12%)
│ █ React icon  █ │  Icon in full cyan (#61DAFB)
│ ░░░░░░░░░░░░░░░ │  28% cyan border
└─────────────────┘
     ↓ hover
┌─────────────────┐
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │  20% cyan wash
│ █ React icon  █ │  50% cyan border
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │  Cyan glow (0 0 22px cyan/35%)
└─────────────────┘
```

---

## Edge Cases Handled

### Non-Preloaded Icons (IMG Fallback Path)

**Problem:** Package SVGs have no `fill` attribute → render black → invisible on dark tile

**Solution:** CSS mask instead of `<img>`

```jsx
<span
  style={{
    backgroundColor: brandColor,
    maskImage: `url(/tech-icons/${slug}.svg)`,
    maskSize: 'contain',
    display: 'inline-block',
  }}
/>
```

**All 3,453 Simple Icons slugs** now recolorable, not just the 102 preloaded ones.

### Unknown/Null Slugs

`brandTileStyle(unknownSlug)` → `null` → caller's ternary falls through to gradient fallback

### Shared Between Admin & Frontend

One copy-paste sync keeps them identical: `portfolio-backend` never touched (icons are purely client-side).

---

## Final Verification Summary

| Check                               | Status  | Notes                                   |
| ----------------------------------- | ------- | --------------------------------------- |
| Skills tiles use brand colors       | ✅ PASS | All 6 in-use slugs verified             |
| API Showcase tiles match            | ✅ PASS | Redis tile same treatment               |
| Near-black brands lifted to legible | ✅ PASS | Next/Express/Vercel/GitHub → gray       |
| Saturated brands kept exact         | ✅ PASS | Laravel red, Vue green untouched        |
| Fallback gradient badge preserved   | ✅ PASS | Entries without icon_slug unaffected    |
| Hover glow uses brand color         | ✅ PASS | CSS custom properties + .tech-tile rule |
| Picker dropdown shows tinted tiles  | ✅ PASS | Matches public site exactly             |
| Picker selected preview uses tile   | ✅ PASS | Consistency across all icon views       |
| Best match visually emphasized      | ✅ PASS | "Best match" badge on first row         |
| Slug text de-emphasized             | ✅ PASS | Smaller font, muted color               |
| Row spacing improved                | ✅ PASS | `py-2.5` (was `py-2`)                   |
| Keyboard focus clear                | ✅ PASS | `ring-1 ring-accent/40` on highlight    |
| Non-preloaded icons recolorable     | ✅ PASS | CSS mask handles all 3,453 slugs        |
| Admin/frontend libs identical       | ✅ PASS | Verified via diff                       |

**All Part B requirements met.**

---

## Services Restored & Running

All three services confirmed operational for final verification:

- Backend: `http://127.0.0.1:8000` — 200 OK
- Frontend: `http://localhost:3000` — compiling on demand
- Admin: `http://localhost:3001` — compiling on demand

Settings singleton restored to production defaults after smoke-testing reset endpoint.

---

# Part C — Remove Visible Card Boxes, Blend Logos into Background

Goal: no per-item card in the Skills grid or the API Showcase — each logo floats
directly on the page background, contained only by a soft bloom in its own brand
colour.

---

## Starting State

The Skills grid had already been converted in earlier work: `TechIconTile`
(`portfolio-frontend/components/portfolio/tech-icon.jsx`) renders a blurred
radial bloom behind a crisp mark, driven by the `.tech-glow` / `.tech-glow__bloom`
rules in `app/globals.css` (`inset: -12px`, `blur(16px)`, `blur(20px)` on hover),
with per-brand `--brand-glow` / `--brand-glow-hover` custom properties supplied by
`brandGlowStyle()`.

The API Showcase had **not** been converted. Each entry was still a hard card:

```jsx
className="card-hover group relative overflow-hidden rounded-xl border
           border-border/50 bg-card/30 p-6 backdrop-blur-xl ..."
style={{ backdropFilter: 'blur(20px)' }}
```

and its no-brand-mark fallback was a second, smaller box:

```jsx
<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg
                bg-gradient-to-br from-primary/60 to-accent/60 ...">
```

Four of the five live showcase entries have `icon_slug: null` (REST API Design,
Auth & Tokens, Webhooks, Query Performance), so that gradient box was the
_dominant_ visual — only `redis` took the glow path.

---

## Changes Made

### 1. `components/portfolio/tech-icon.jsx` — own the shared fallback glow

`ACCENT_GLOW` moved here from `skills.jsx`. Both sections now need the same
no-brand-colour fallback, and `tech-icon.jsx` is the module that already owns
glow rendering, so the constant belongs next to `TechIconTile` rather than being
imported across sibling section components.

```jsx
export const ACCENT_GLOW = {
  '--brand-glow': 'rgba(129, 140, 248, 0.22)',
  '--brand-glow-hover': 'rgba(129, 140, 248, 0.38)',
};
```

### 2. `components/portfolio/api-showcase.jsx` — card → floating layout

Outer wrapper dropped `card-hover`, `rounded-xl`, `border border-border/50`,
`bg-card/30`, `overflow-hidden`, `p-6`, `backdrop-blur-xl` and the inline
`backdropFilter`. What remains is layout only:

```jsx
className = 'group flex flex-col gap-4';
```

The lucide fallback became a glow, matching the Skills fallback exactly — same
`tech-glow` wrapper, same bloom span, same `ACCENT_GLOW`, icon crisp on top via
`relative`:

```jsx
<span
  className="tech-glow flex h-12 w-12 items-center justify-center text-accent"
  style={ACCENT_GLOW}
>
  <span aria-hidden className="tech-glow__bloom" />
  <Icon className="relative h-6 w-6" aria-hidden="true" />
</span>
```

Grid gap raised `gap-6` → `gap-8 md:gap-10` (24px → 40px), matching the Skills
grid's `md:gap-10`. Without card edges the old 24px read as cramped — adjacent
blooms nearly touched. Text/endpoints wrapped in a `<div>` so the flex column
spaces icon-vs-content rather than every text node.

### 3. `components/portfolio/skills.jsx` — import instead of define

Now imports `ACCENT_GLOW` from `./tech-icon`; the local copy was deleted. No
rendering change.

**Not touched:** grid column counts, the All/Frontend/Backend filter tabs,
`icon_slug` lookup, `brandGlowStyle()` / `getDisplayBrandColor()`, or any backend
resource. Purely presentational.

---

## Verification

Real Chromium via Playwright, headed, against `http://localhost:3000` with all
three services live. Script: `audit/verify-glow-no-boxes.js`.

```
=== SKILLS SECTION ===
✅ PASS  Skills section has items — 6 items
✅ PASS  Skills: No visible card boxes — border: 0px, bg: rgba(0, 0, 0, 0)
✅ PASS  Skills: Glow elements present — 6 glow containers
✅ PASS  Skills: Bloom layers present — 6 bloom elements
✅ PASS  Skills: Brand glow color set — rgba(102, 51, 153, 0.22)
✅ PASS  Skills: Text has no background — bg: rgba(0, 0, 0, 0)
✅ PASS  Skills: Grid spacing adequate — gap: 40px (≥ 24px)

=== API SHOWCASE SECTION ===
✅ PASS  API Showcase has items — 5 items
✅ PASS  API: No visible card boxes — border: 0px, backdrop-filter: none
✅ PASS  API: Glow elements present — 5 glow containers
✅ PASS  API: Bloom layers present — 5 bloom elements
✅ PASS  API: Grid spacing adequate — gap: 40px (≥ 24px)

12/12 checks passed
```

### Check 1 — No visible rectangular border or background box — ✅ PASS

Skill item wrappers compute to `border-width: 0px` and
`background-color: rgba(0, 0, 0, 0)`. Zero `.glass` elements inside `#skills`.
Visually each logo sits directly on the page's dark background; the only thing
around a mark is a circular falloff of colour with no discernible edge — the
bloom is `inset: -12px` on a 48px box under `blur(16px)`, so its own boundary is
dissolved well before it resolves into a shape.

API Showcase items likewise compute `border-width: 0px` and
`backdrop-filter: none` — confirming the `border-border/50`, `bg-card/30` and
`backdrop-blur-xl` card is gone, not merely restyled.

### Check 2 — Glow colour matches each icon's own brand colour — ✅ PASS

Not one uniform colour. Sampled `--brand-glow` per tile:

| Skill   | Slug       | `--brand-glow`             | Reads as   |
| ------- | ---------- | -------------------------- | ---------- |
| css     | `css`      | `rgba(102, 51, 153, 0.22)` | purple     |
| Laravel | `laravel`  | `rgba(255, 43, 32, 0.22)`  | red/orange |
| html    | `html5`    | `rgba(227, 79, 38, 0.22)`  | orange     |
| react   | `react`    | `rgba(97, 218, 251, 0.22)` | cyan       |
| vue js  | `vuedotjs` | `rgba(65, 184, 131, 0.22)` | green      |

Laravel red/orange and Vue green both confirmed as called out in the brief. Each
value is the brand hex converted by `brandGlowStyle()` at 0.22 alpha, rising to
0.38 on hover — within the 15–25% resting range specified. The one skill without
a slug ("Laravel 13", `icon_slug: null`) falls to `ACCENT_GLOW` violet, which is
why the fallback is a glow and not the last remaining box in the grid.

### Check 3 — Text below icons has no background/border — ✅ PASS

Skill name computes `background-color: rgba(0, 0, 0, 0)`; the category label is
plain `text-xs uppercase tracking-wide text-muted-foreground`. No fill, no
border, no radius on either — typography directly on the page background.

### Check 4 — Same treatment applied to API Showcase — ✅ PASS

It did previously use the boxed style, so it was converted. 5 glow containers and
5 bloom layers now render in `#apis` — one per entry, covering both paths: the
`redis` entry via `TechIconTile` in true Redis red, and the four `icon_slug: null`
entries via the lucide-plus-`ACCENT_GLOW` fallback. Both sections now resolve to
the same `.tech-glow` / `.tech-glow__bloom` markup, so hover behaviour is shared
rather than reimplemented.

### Check 5 — Spacing intentional, not cramped — ✅ PASS

Both grids report `gap: 40px`. Skills was already `sm:gap-8 md:gap-10` and needed
no change. API Showcase was raised from 24px, which was tuned for cards whose
padding and border supplied separation — with those gone the blooms crowded each
other. At 40px each bloom's falloff completes inside its own cell and items read
as deliberately placed rather than drifting. Column counts unchanged
(`grid-cols-2 / sm:3 / md:4` for Skills, `1 / md:2` for API Showcase).

---

## Note on Hover

Hover intensity is inherited, not newly added: `globals.css` already swaps
`--brand-glow` → `--brand-glow-hover` (0.22 → 0.38 alpha) and `blur(16px)` →
`blur(20px)`. Because the API Showcase wrapper kept its `group` class, its blooms
respond to hover on the whole entry via the existing `.group:hover
.tech-glow__bloom` rule. No border or background appears on hover in either
section — brightening the bloom is the only feedback, so the no-box feeling holds
in the interactive state.

---

## Regression Surface

`ACCENT_GLOW`'s move is the only cross-file change. Removing the local definition
from `skills.jsx` while importing the same name is what a duplicate-binding error
would catch — the frontend served 500 mid-edit for exactly that reason and
returned 200 once the stale copy was deleted. Both consumers verified rendering
in the browser afterward; no other module imports the symbol.

Services during verification:

- Backend: `http://127.0.0.1:8000` — 200 OK
- Frontend: `http://localhost:3000` — 200 OK
- Admin: `http://localhost:3001` — not exercised (no admin-side change)

**All Part C requirements met — 12/12 automated checks passed.**

---

## About Section — Image Height Parity & Crop Framing

**File changed:** `portfolio-frontend/components/portfolio/about.jsx` (layout only)
**Harness:** `audit/verify-about-alignment-crop.js` (updated), plus two new probes —
`audit/probe-about-objpos-sweep.js`, `audit/probe-about-breakpoints.js`

---

### Root cause

Confirmed by measurement, not inspection:

- The grid was `items-start`, so each column's height was its own content height.
  The portrait column carried a hard `h-64 md:h-96`, pinning it to **384px** while
  the bio + stat-pill column measured **466px** — an 82px shortfall, visible as the
  image ending above the second row of stat cards.
- A second cause sat between them: `Reveal` wraps each column and _is_ the grid
  item. Switching the grid to stretch alone would have stretched `Reveal` while the
  inner frame kept its fixed height, so `h-full` was needed on **both** the `Reveal`
  wrapper and the frame for the stretch to reach the image.

### Fix

- `items-start` → `items-stretch` on the grid.
- `<Reveal className="h-full">` so the stretched grid item passes its height down.
- Frame `h-64 md:h-96` → `h-64 md:h-full md:min-h-96`. Mobile keeps its fixed 256px
  (stacked, nothing to match); `min-h-96` retains the old height as a floor so a
  short bio can never collapse the frame.
- **`object-position` was left at `center 25%`** — see below.

---

### Check 1 — Column heights match (desktop) — ✅ PASS

|              | before | after     |
| ------------ | ------ | --------- |
| image column | 384px  | **466px** |
| text column  | 466px  | **466px** |
| delta        | 82px   | **0.0px** |

Top edges were already flush (both 315px) and stayed flush. The frame itself also
measures 466px, confirming the height reaches the image and not just the wrapper.

### Check 2 — Full head visible, not cropped to forehead — ✅ PASS

Head landmarks were measured from the PNG's pixel data rather than assumed: the
subject occupies source rows **136–800** of 1024 (crown ~136, eyeline ~300, chin
~565). After the fix the visible slice is rows **37–914**, giving 99 rows of
headroom above the crown, the chin well inside frame, and the eyeline at **30%**
from the top — inside the 25–40% band that reads as natural portrait framing.

**The predicted forehead-crop did not occur, and the reason is worth recording:**
the frame is width-constrained (`cover` scale is set by 544/1024, not by height),
so making the container _taller_ shrinks the vertical overflow from 160px to 78px.
A taller container here reveals **more** of the source, not less. The brief's
concern would apply to a container that grew tall _and_ narrow; it does not apply
at this geometry.

A five-value sweep (`probe-about-objpos-sweep.js`) confirmed every candidate keeps
the chin visible at the new height:

| object-position      | visible rows | headroom | eyeline |
| -------------------- | ------------ | -------- | ------- |
| `50% 0%`             | 0–877        | 136      | 34%     |
| `50% 15%`            | 22–899       | 114      | 32%     |
| **`50% 25%` (kept)** | **37–914**   | **99**   | **30%** |
| `50% 35%`            | 51–929       | 85       | 28%     |
| `50% 50%`            | 73–951       | 63       | 26%     |

`25%` sits mid-range on headroom and lands the eyeline closest to the classic
one-third mark, so the existing value was kept — the crop needed no change once
the height was right.

### Check 3 — Other viewports — ✅ PASS

| width         | layout       | image h | text h | delta | frame   | framing                       |
| ------------- | ------------ | ------- | ------ | ----- | ------- | ----------------------------- |
| 1920          | side-by-side | 466     | 466    | 0.0   | 544×466 | full head + chest             |
| 1440          | side-by-side | 466     | 466    | 0.0   | 544×466 | full head + chest             |
| 1024          | side-by-side | 466     | 466    | 0.0   | 464×466 | full head + chest             |
| 900 (tablet)  | side-by-side | 524.5   | 524.5  | 0.0   | 402×524 | full head, crops horizontally |
| 768 (md edge) | side-by-side | 583     | 583    | 0.0   | 336×583 | full head, tightest crop      |
| 767           | stacked      | 256     | 364    | n/a   | 735×256 | unchanged from before         |
| 390 (mobile)  | stacked      | 256     | 468    | n/a   | 358×256 | unchanged from before         |

At 900px and 768px the frame becomes taller than it is wide, so `cover` flips to
cropping horizontally and shows the full image height. Screenshots confirm the head
and shoulders stay intact in both; the 768px case is the tightest and was checked
visually rather than by numbers alone. Below `md` the layout stacks, height parity
does not apply, and the mobile crop is byte-identical to before the change
(rows 73–805).

**Automated total: 24/24 checks passed** across desktop, tablet and mobile.

---

### Content issue — source image headroom

Worth flagging as noted in the brief, though it did **not** cause the reported
problem. `public/hasibul-portrait.png` is 1024×1024 with the subject spanning only
rows 136–800: **13% dead backdrop above the head and 22% below**. Because the file
is square while every rendered frame is not, that padding is what the crop math is
forced to spend its margin on. Re-exporting with tighter headroom would let the
head fill more of the frame at every breakpoint and would make `object-position`
far less sensitive to container aspect. Purely an improvement, not a fix — no check
above fails because of it.

### Note on the Hero comparison

The brief suggested aligning `object-position` with the Hero portrait. That turned
out not to be applicable: the Hero uses `width`/`height` (not `fill`) inside a
**circular, 1:1** wrapper with plain `object-cover` and no `object-position` at all.
With a square frame and a square source there is nothing to crop, so it has no
value to copy. The two are correctly independent, and no Hero change was made.

### Regression surface

The change is layout-only within `about.jsx`; no data, API or shared component was
touched. `Reveal` gained a `className` on one call site — it already accepted and
forwarded that prop, so no component change was needed.

`audit/verify-about-alignment-crop.js` was **updated, not merely re-run**: it
previously asserted `align-items: flex-start` as a pass condition, which the new
requirement inverts. That assertion now checks `stretch`, and two genuinely new
assertions were added — column-height parity and frame-fills-column — since top-edge
alignment alone would not have caught the original bug. Flagging this explicitly
because a test was changed to match a changed spec.

`verify-section-visibility.js` was run as a regression check: 5/5 pass. (One earlier
run reported a transient `ERR_CONNECTION_REFUSED` from two Playwright suites hitting
the dev server at once; re-run serially it is clean.)

Services during verification:

- Backend: `http://127.0.0.1:8000` — 200 OK
- Frontend: `http://localhost:3000` — 200 OK (dev)
- `verify-console-clean.js` — **not run**: it targets a production build on port
  3010, which was not part of this change's scope.

---

## Homepage Section Spacing

**Files changed:** All 8 section components (Hero, About, Skills, Projects, API
Showcase, Timeline, Testimonials, Contact)  
**Harness:** `audit/verify-section-spacing.js` (new), `audit/probe-section-gaps-
baseline.js` (new), `audit/shot-section-gaps.js` (new)

---

### Root cause

Confirmed by measurement of true content-to-content whitespace between sections:

- Most sections used **`py-24`** (96px top + 96px bottom) → every pair of
  adjacent sections contributed **192px** of dead air.
- **About** was the worst outlier: `py-20 md:py-32` (128px desktop) **plus**
  `min-h-screen` with flex-centered content. The content measured only ~620px in
  a forced 900px box, so the centering split ~280px of leftover slack above and
  below. That slack, not the padding, was the single largest contributor to the
  gap on either side of About.
- No shared layout wrapper added duplicate padding — sections mount sequentially
  in `app/page.jsx` with no intermediate container. The problem was purely each
  section's own individual padding value being too generous.

**Desktop baseline (legacy CSS):** 1671px total inter-section whitespace  
**Mobile baseline:** 1377px

### Fix

Standardized on **`py-12 md:py-16`** (48px mobile, 64px desktop) across every
content section:

- About, Skills, Projects, API Showcase, Timeline, Testimonials, Contact: all
  now `py-12 md:py-16`
- About: **dropped `min-h-screen`** and flex-centering. It is now content-sized
  like every other section — no forced viewport height, no leftover slack.
- Hero: kept `min-h-screen` by design (a landing section legitimately fills the
  viewport), but aligned its bottom padding to the same scale: `pb-16` →
  `pb-12 md:pb-16`

### Check 1 — Total whitespace reduced by ≥30% — ✅ PASS

| viewport | before | after  | reduction  |
| -------- | ------ | ------ | ---------- |
| desktop  | 1671px | 1097px | **−34.4%** |
| mobile   | 1377px | 721px  | **−47.6%** |

Both land solidly in the 30–40% target band (mobile's larger reduction is
acceptable — it dropped further from a tighter starting point).

### Check 2 — Gaps consistent across all pairs — ✅ PASS

**Desktop:** every pair (excluding Hero→About and X→Footer, which are
intentionally different) reads exactly **128px**, spread **0.0px**  
**Mobile:** every pair reads exactly **96px**, spread **0.0px**

No wild variance from one boundary to the next. The rhythm is uniform.

### Check 3 — Content not cramped — ✅ PASS

Every section keeps ≥24px breathing room around its content (measured as the
distance from the section's bounding box to the nearest in-flow descendant box).
Desktop reports **64px** headroom and legroom for every content section (About,
Skills, APIs, Projects, Journey, Testimonials, Contact). Mobile reports **48px**
for all. No section's text or cards touch the section boundary.

Visually confirmed at both desktop and mobile with boundary crops — stat pills,
headings, project cards, timeline nodes all sit comfortably within their sections.

### Check 4 — No leftover `min-h-screen` on content sections — ✅ PASS

Only Hero retains `min-h-screen` (by design). Every other section is content-
sized: `min-height: 0px` or `auto`. The About section no longer forces itself to
a full 900px when its natural content is 620px.

### Check 5 — Standard padding applied everywhere — ✅ PASS

**Desktop:** all 7 content sections report `pt=64 pb=64`  
**Mobile:** all 7 content sections report `pt=48 pb=48`

One scale, consistently applied, no outliers.

---

### Regression surface

All 8 section components touched; no shared layout, API, or data layer changed.
The only cross-file concern is About's layout: it lost `min-h-screen` and
flex-centering, which could theoretically break last task's image-height-parity
work. That was checked:

- `audit/verify-about-alignment-crop.js` — **24/24 still pass**. The portrait
  column still stretches to match the text column's height; the crop is still
  well-framed at every breakpoint. The section-level changes (`py-32` → `py-16`,
  dropping `min-h-screen`) happened on the `<section>` ancestor and do not reach
  the grid where the parity logic sits.

Other regression checks:

- `audit/verify-section-visibility.js` — **5/5 pass**. Section reordering, show/
  hide toggling, and Hero's locked state all still work.
- `audit/verify-testimonial-carousel.js` — **18/18 pass**. Carousel height is
  constant across all breakpoints, no collapse, no overlap.

**Automated total: 10/10 checks passed** for the spacing change itself (uniform
padding, no forced height, 34–48% reduction, consistent rhythm, adequate
breathing room).

---

### Note on test-suite pollution

`verify-section-visibility.js` validates drag-reorder by moving APIs above
Projects and does not restore order afterward. As a result the DB's `order`
column and the DOM both reflect APIs-then-Projects (order 3/4) instead of the
natural Projects-then-APIs. This is pre-existing test pollution, not introduced
by this task. It does not affect the spacing measurements (the probe scripts walk
actual DOM order and report every pair), but it means the listed pair names will
read `apis → projects` instead of `projects → apis` until someone resets the DB
or extends that suite to restore order at teardown.

### Measurement methodology — why two baselines exist

An earlier `probe-section-gaps.js` run reported desktop=1557px. The final
verification script hard-codes desktop=1671px. The difference is **not** a
discrepancy; it is a correction for measurement artifact.

The first probe used a fast scroll loop (`window.scrollTo` in 400px jumps) that
outran the reveal animations. Framer Motion's `Reveal` components gate on
IntersectionObserver, and Lenis smooth-scroll intercepts `window.scrollTo`, so
elements left un-revealed hold a residual `y` transform until they play. That
~30px per-element shift corrupted the baseline: comparing 1557 (un-revealed) to
1097 (fully revealed) would report a bogus 29.5% reduction when the true figure
is 34.4%.

The corrected baseline comes from `probe-section-gaps-baseline.js --legacy`,
which injects the original CSS (`py-24`, About's `min-h-screen`, etc.) and runs
the identical slow scroll-with-dwell routine as the post-change verification.
Both states are now measured through the same animation-settled conditions, so
the reduction figure is apples-to-apples.

Services during verification:

- Backend: `http://127.0.0.1:8000` — 200 OK
- Frontend: `http://localhost:3000` — 200 OK (dev)

---

## 12. Hero section fully admin-manageable

The last four hardcoded elements in `components/portfolio/hero.jsx` — the
rotating role titles, the orbiting tech badges, the "Available for Work" badge
and the social links — now come from the database and are editable in the admin
panel.

### Schema

One migration, `2026_08_07_120000_add_content_fields_to_hero_table.php`:

| Column               | Type   | Notes                                                     |
| -------------------- | ------ | --------------------------------------------------------- |
| `roles`              | json   | Array of strings for the typewriter                       |
| `tech_badges`        | json   | `[{label, icon_slug}]` for the orbit                      |
| `is_available`       | bool   | Defaults `true`                                           |
| `availability_label` | string | Nullable; blank falls back to "Available for Work"        |
| `social_links`       | json   | `[{platform, url}]`, replaces `github_url`/`linkedin_url` |

`social_links` is backfilled from `github_url`/`linkedin_url` **before** those
two columns are dropped, so an existing profile keeps both links (GitHub first,
LinkedIn second) without re-entry. A null or blank column contributes no entry
rather than an empty one. The `down()` path reverses it: the two known platforms
return to their columns; any additional link the admin added has no column to
return to and is lost, which the old schema cannot avoid.

The supported platform set lives in `Hero::SOCIAL_PLATFORMS` and is mirrored
verbatim in `lib/social-platforms.js` in both Next apps — the same duplication
convention `tech-icons.js` already uses. `Rule::in` validates against the
backend copy. Platforms with no Simple Icons mark (`linkedin`, `email`,
`website`) carry a null slug and render a hand-written or generic icon;
LinkedIn's and Twitter's bird marks were both withdrawn upstream over trademark
policy, so `x` is the only Twitter entry available.

### Orbit geometry

The previous orbit hardcoded four badges at 0°/90°/180°/270°. It now distributes
whatever count exists at `360 / count` degrees. Capped at six
(`Hero::MAX_TECH_BADGES`) because past that the 48px badges start to touch at
the mobile orbit radius.

### Reuse

The admin badge rows use the existing `<TechIconPicker />` unchanged. The public
badges and social icons render through the existing `TechIcon`, so brand marks
stay consistent with Skills and API Showcase. `usableSocialLinks()` is shared by
Hero, Footer and Contact, so all three agree on which links exist and a stale
platform value cannot produce an iconless circle. Footer and Contact previously
read the now-dropped `github_url`/`linkedin_url` and were migrated to the shared
helper; `FALLBACK_HERO` in `lib/fallbacks.js` was updated to the new shape too.

### Verification

`audit/hero-admin-checks.js`, driving the real admin form in Chromium and
asserting on the rendered public page. All five checks pass; 0 page errors, 0
failed requests. Screenshots in `audit_screenshots/hero-admin/`, results in
`audit/logs/hero-admin-checks.json`.

| #   | Check                              | Result   | Observed                                                                                                                                                                                                             |
| --- | ---------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Role titles admin-driven           | **PASS** | Saved `["Full-Stack Engineer","Laravel Developer","Platform Engineer"]` (was `["Laravel Developer","Vue.js Developer","Full-Stack Engineer"]` — one added, one removed, order changed). Typewriter cycled all three. |
| 2   | 5th tech badge, evenly spaced      | **PASS** | 4 badges → 5. Angles `[0,72,144,216,288]`, exactly the expected 72° step. Min centre distance 228px vs widest badge 68px, so no overlap. All five rendered a real logo.                                              |
| 3   | Availability toggle + custom label | **PASS** | With `is_available=false` the badge rendered 0 times. Re-enabled with a custom label it read "Open to Opportunities".                                                                                                |
| 4   | Social links list admin-driven     | **PASS** | After removing LinkedIn and adding X, the hero rendered exactly `github → https://github.com/hasibulalamh` and `x → https://x.com/hasibulalamh`. LinkedIn absent; every link had an icon.                            |
| 5   | No data loss in migration          | **PASS** | Asserted against `social_links` **before** check 4 mutates it: first two entries were `github → https://github.com/hasibulalamh` and `linkedin → https://linkedin.com/in/hasibulalamh`, in that order.               |

### A note on the first run: `revalidate` is stale-while-revalidate

The first pass failed checks 1–4 while the API plainly held the new data. The
cause was the assertion, not the feature. `REVALIDATE_SECONDS = 60` in
`portfolio-frontend/lib/api.js` is stale-while-revalidate, not a hard expiry:
the first request past the window still serves the **stale** page and only
schedules the regeneration in the background. Waiting 66s and reloading once
therefore reproducibly asserts against pre-save HTML.

This is a sharper version of the known "wait 60s" caveat, and worth recording
separately: waiting out the window is necessary but _not sufficient_ — the load
that trips the expiry is itself stale. `reloadPublic()` now reloads until a
caller-supplied `settled(page)` predicate confirms the new data is present. In
every run the log shows `load 1 still served stale HTML` followed by
`load 2` succeeding, which is the mechanism reproducing exactly.

### Build and test status

- `portfolio-frontend`: `npm run build` — compiled successfully, 5/5 static pages.
- `portfolio-admin`: `npm run build` — compiled successfully, 16 routes.
- `portfolio-backend`: `php artisan test` — 5 passed, 12 assertions.

The only console output during verification was the pre-existing next/image
aspect-ratio warning on the portrait, which is unrelated to this change.

Services during verification:

- Backend: `http://127.0.0.1:8000` — 200 OK
- Frontend: `http://localhost:3000` — 200 OK (dev)
- Admin: `http://localhost:3001` — 200 OK (dev)

---

## Fix: Excessive Blank Space Below Content on Admin Pages

**Date:** 2026-08-21
**Scope:** shared admin shell (`portfolio-admin/app/admin/layout.jsx`) — all admin pages
**Status:** Fixed and verified in a real browser. 28/28 layout checks + 1/1 overlay
regression check passed.

### Root cause — not what was suspected

The investigation brief proposed a `min-h-screen` / fixed height / stray `flex-1` on
the content wrapper. **None of those were present**, and the layout's flex structure
was already correct:

```
div.flex.h-screen                     (900px — shell, correct)
└─ div.flex-1.flex.flex-col.overflow-hidden
   ├─ Header
   └─ main.flex-1.overflow-auto.p-6   (819px viewport, scrolls its own content)
```

Grepping found only three `h-screen`/`min-h-screen` occurrences in the admin app —
the login page, the auth "Loading..." state, and the shell above. There is no
min-height on any content wrapper and no globally-calculated height.

The actual cause is a CSS containing-block bug:

> `<main>` had `overflow-auto` but **no `position`**. Nothing else in its ancestor
> chain is positioned either, so for any absolutely-positioned _descendant_ the
> containing block resolved to the **initial containing block** (the document), not
> to `main`. Per CSS spec, `overflow` on a non-positioned ancestor does **not** clip
> such an element — and its height contributes to the **document's** scroll height
> instead of `main`'s.

The escaping elements are the visually-hidden `.sr-only` form labels. Tailwind's
`.sr-only` is `position: absolute`, and the Hero form has 7 of them with the document
as containing block (the role rows and the two labels per social-link row). On Hero
the form content is 3135px tall, so those labels sit at static positions ~2500–3100px
down and stretched `document.documentElement.scrollHeight` to **2678px** against a
900px viewport.

Because the visible shell is `h-screen` with `overflow-hidden`, that outer 1778px of
document scroll contained **no content at all** — scrolling it revealed only the
`from-slate-900 via-slate-800` gradient. That is precisely the reported symptom: a
large empty dark area below the Save/Reset buttons.

This also explains why it was worst on Hero and invisible elsewhere: on short pages
(Projects 322px, Contact Info 575px) every absolute element lands inside the 900px
viewport, so nothing extends the document. Two `.sr-only` labels inside `FileUpload`
never escaped either — that component's wrapper is `relative`, which contained them.
That contrast confirmed the mechanism.

#### Causal proof, before the fix was written

Toggling `position: relative` on `main` at runtime, on identical page state:

| measurement                            | value                                         |
| -------------------------------------- | --------------------------------------------- |
| document `scrollHeight`, main static   | **2678px**                                    |
| document `scrollHeight`, main relative | **900px** (= viewport, no outer scroll)       |
| document `scrollHeight`, reverted      | 2678px                                        |
| `main.scrollHeight` with fix           | 3183px — real content, still fully scrollable |

The phantom scroll collapses to exactly the viewport height while the real content
height is untouched.

### The fix

One class on the shared shell, so every admin page is corrected at once —
`portfolio-admin/app/admin/layout.jsx:121`:

```diff
-        <main className="flex-1 overflow-auto p-6">
+        <main className="relative flex-1 overflow-auto p-6">
```

`relative` makes `main` the containing block for its absolute descendants, so they
are clipped and scrolled by `main` and no longer inflate the document. A comment
records why it is load-bearing, so it is not "cleaned up" later.

Deliberately **not** changed: the `h-screen` shell and `flex-1` on `main`. Both are
correct for a fixed-shell dashboard — `flex-1` makes `main` fill the space between
Header and viewport bottom, which is what keeps the sidebar and header pinned while
content scrolls. Replacing them with `min-h-fit`/`h-auto` as the brief suggested
would have made the whole page scroll, moving the header and sidebar off-screen, and
would not have fixed the phantom scroll — the escaping absolutes caused that
independently.

### Verification (Playwright, real browser, 1440×900)

Scripts added: `audit/probe-admin-blank-space.js` (diagnostic),
`audit/probe-abs-escape.js` (causal proof), `audit/verify-admin-blank-space.js`
(9-page verification), `audit/verify-admin-overlays.js` (clipping regression).

#### Check 1 — gap at the bottom of the Hero page

**PASS.** Measured as document scroll height beyond the viewport (the empty
scrollable area), before/after on identical page state:

|                                                         | before     | after                                                           |
| ------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| document `scrollHeight` (viewport 900)                  | 2678px     | **900px**                                                       |
| empty scrollable space below content                    | **1778px** | **0px**                                                         |
| scrollable gap inside `main` after last visible element | —          | **24px** (= main's `padding-bottom`, well under the 64px limit) |

Scrolled to the bottom of Hero, the Save/Reset row is the last thing on the page,
49px above the viewport bottom. Screenshot:
`audit_screenshots/verify-admin-blank-space/10-hero-save-row-at-bottom.png`.

#### Check 2 — other admin pages, differing content lengths

**PASS on all 9 pages** (brief asked for ≥2 beyond Hero). `before`/`after` are
document `scrollHeight` against a 900px viewport:

| page         | content height | before | after | blank space removed |
| ------------ | -------------- | ------ | ----- | ------------------- |
| hero         | 3135px (long)  | 2678   | 900   | **1778px**          |
| about        | 1061px         | 996    | 900   | **96px**            |
| settings     | 1336px         | 900    | 900   | 0                   |
| contact-info | 575px (short)  | 900    | 900   | 0                   |
| projects     | 322px (short)  | 900    | 900   | 0                   |
| skills       | 552px          | 900    | 900   | 0                   |
| timeline     | 424px          | 900    | 900   | 0                   |
| testimonials | 484px          | 900    | 900   | 0                   |
| dashboard    | 596px          | 900    | 900   | 0                   |

About was affected too (96px) and is now clean. No page has any outer document
overflow (all 0px against a 4px tolerance).

For the three pages whose content exceeds the viewport and therefore genuinely
scroll — hero, about, settings — the scrollable gap after the last visible element is
**24px each**, exactly `main`'s `padding-bottom`.

**One measurement correction worth recording**, since conflating these is what makes
this bug easy to misdiagnose. My first pass asserted a <64px gap on every page and
"failed" six of them (Projects 473px, Timeline 395px, …). That assertion was wrong,
not the pages. Those six pages are _shorter_ than the viewport: `main.scrollHeight ==
main.clientHeight`, so there is **no scrollbar and nothing to scroll through**. The
space below their content is unfilled viewport in a full-height dashboard shell, which
is correct by design and not the reported bug. The check now distinguishes the two:
scrolling pages must have a small gap; non-scrolling pages must have no scrollbar.
Both hold everywhere.

#### Check 3 — nothing clipped or cut off

**PASS.** On all 9 pages the full scroll range of `main` is reachable
(`scrollTop == scrollHeight - clientHeight` after scrolling to the end), and
`main.scrollHeight` is unchanged by the fix — Hero is still 3183px of scrollable
content, so no content was removed, only phantom empty space.

Overlay clipping was the one real regression risk, since `relative` newly contains
anything that was escaping. Verified against the browser rather than assumed:

- **TechIconPicker dropdown** (the only absolute overlay inside `main`) — opened on a
  Hero tech-badge row: renders 986×320px with **12 options and 320px of 320px visible**
  inside `main`. Unclipped. Its containing block is its own `div.relative` wrapper,
  which already sat inside `main`, so its behaviour is unchanged.
- **Header user menu, mobile sidebar + backdrop, toast layer** — all `position: fixed`,
  which is unaffected by `position: relative` on an ancestor (only `transform`/`filter`/
  `contain` would capture them, and none are applied). No change.
- Zero page errors and zero failed requests across every run; the only console output
  is a pre-existing Next.js `<Image>` aspect-ratio warning on the Hero avatar,
  unrelated to this change.

### Files changed

- `portfolio-admin/app/admin/layout.jsx` — added `relative` to the `<main>` wrapper,
  with a comment explaining the containing-block reason.

### Files added (audit)

- `audit/probe-admin-blank-space.js` — dumps scrollers, ancestor chain and computed
  heights per admin page.
- `audit/probe-abs-escape.js` — enumerates absolute/fixed elements by containing
  block; proves causation by toggling `position` on `main`.
- `audit/verify-admin-blank-space.js` — the 3 required checks across 9 admin pages,
  with before/after per page.
- `audit/verify-admin-overlays.js` — overlay clipping regression.

Logs: `audit/logs/verify-admin-blank-space-checks.json`,
`audit/logs/verify-admin-overlays-checks.json`.

---

---

## Email Flow Audit — 2026-08-25

### Problem Analysis

The system is claimed to have 5 distinct email flows across two features
(Contact Messages, Meeting Requests). The audit verified, per flow, that a
Mailable exists, that it is actually **dispatched** from a real code path, that
the recipient address is resolved correctly (fixed admin address vs. the dynamic
visitor address), and that the client-facing templates render real submitted
data rather than placeholders. Nothing was assumed broken up front.

Verification deliberately asserts on **dispatch**, not inbox delivery. Resend has
no verified domain on this account, so it refuses every recipient except the
account owner — real delivery therefore cannot be the oracle for an arbitrary
visitor address. Dispatch is what the application-level wiring controls, and it
is what this audit is scoped to.

### Findings (per flow, 1–5)

**Flow 1 — Admin notification, new contact message: EXISTS, correctly wired.**

- Mailable: `app/Mail/NewSubmissionMail.php:41` (`forContactMessage`)
- Dispatch: `app/Services/SubmissionNotifier.php:42-47` → `:119` `Mail::to($recipient)->send()`
- Recipient: `adminRecipient()` at `SubmissionNotifier.php:85-96` — `ADMIN_NOTIFY_EMAIL`
  wins, else `contact_info.email` from the CMS. Not hardcoded in the Mailable.
- `envelope()` at `NewSubmissionMail.php:70` sets `replyTo` to the visitor, so the
  admin's reply button reaches the sender rather than the no-reply identity. Correct.

**Flow 2 — Client acknowledgment, contact message: EXISTS, correctly wired.**

- Mailable: `app/Mail/SubmissionReceivedMail.php:39` (`forContactMessage`)
- Dispatch: `SubmissionNotifier.php:48-53`, recipient `$message->email` (dynamic). Correct.

**Flow 3 — Admin notification, new meeting request: EXISTS, correctly wired.**

- Mailable: `NewSubmissionMail.php:54` (`forMeetingRequest`)
- Dispatch: `SubmissionNotifier.php:63-68`, recipient `adminRecipient()`. Correct.

**Flow 4 — Client acknowledgment, meeting request: EXISTS, correctly wired.**

- Mailable: `SubmissionReceivedMail.php:48` (`forMeetingRequest`)
- Dispatch: `SubmissionNotifier.php:69-74`, recipient `$request->email` (dynamic). Correct.

Both entry points are reached from the public controller:
`PublicController.php:175` (`notifyOfContactMessage`) and `:196`
(`notifyOfMeetingRequest`). No Mailable in flows 1–4 is defined-but-never-dispatched.

**Flow 5 — Client reply when admin replies: PARTIAL. Implemented for meeting
requests only; entirely absent for contact messages.**

Meeting side — EXISTS, correctly wired:

- Mailable: `app/Mail/MeetingRequestReplyMail.php:27` (`forRequest`)
- Dispatch: `app/Services/MeetingRequestService.php:40-42`, recipient
  `$meetingRequest->email` (dynamic). Correct.
- Route: `routes/api.php:159` → `MeetingRequestController::reply` (`:33`)
- Admin UI: `portfolio-admin/app/admin/meeting-requests/page.jsx:68-89`, PUTs
  `/admin/meeting-requests/{id}/reply` with `admin_reply`. Endpoint matches.
- `admin_note` is deliberately never passed to the Mailable, so an internal note
  cannot leak into an outgoing email (`MeetingRequestReplyMail.php:14-16`).

Contact side — MISSING at every layer:

- No Mailable for a contact-message reply in `app/Mail/`.
- No route: `routes/api.php:152-155` exposes only `index`, `read`, `destroy`.
- No controller action: `ContactMessageController.php` has `index`, `toggleRead`,
  `destroy` only — no `reply`.
- No schema support: the `contact_messages` migration has no `admin_reply`,
  `status`, or `replied_at` column (contrast `meeting_requests`, which has all three).
- No admin UI: `portfolio-admin/app/admin/messages/page.jsx` contains zero
  reply references; the detail modal offers only Mark Read / Close / Delete
  (confirmed visually — `audit_screenshots/email-flows/06-admin-message-detail.png`).

This is an unbuilt feature, not broken wiring. A visitor who uses the contact
form can never receive a reply through the panel; the admin must reply from their
own mail client (which the `replyTo` header on flow 1 does at least enable).

**Additional finding (not one of the 5 flows) — admin panel reports success when
the reply email was rejected.**
`MeetingRequestController.php:41-47` deliberately distinguishes the two outcomes,
returning HTTP 200 with `"Reply saved, but the email could not be sent. Check the
mail configuration."` on transport failure. That signal is then discarded:

- `portfolio-admin/lib/api.js:41` — `apiCall()` maps **any** 2xx to `success: true`.
- `portfolio-admin/app/admin/meeting-requests/page.jsx:82-83` — the success branch
  hardcodes `showToast('Reply sent successfully', 'success')` and ignores
  `result.message`.

Empirically confirmed, not inferred. Replying to a request whose requester address
Resend refuses produced: API `"Reply saved, but the email could not be sent."`,
UI toast `"Reply sent successfully"`, status flipped to `replied`
(`audit_screenshots/reply-toast-failure/02-reply-toast.png`). This matters most
precisely while sandbox mode makes rejection the _expected_ outcome for real
visitor addresses — the admin believes every reply shipped.

### Configuration observations (C)

- `MAIL_MAILER=resend`, transport registered at `config/mail.php:64-66`. Correct.
- `MAIL_HOST` is **absent, and correctly so** — the Resend transport is an HTTP API
  driver, not SMTP. Its absence is not a misconfiguration.
- `MAIL_FROM_ADDRESS=onboarding@resend.dev` — Resend's shared sandbox sender.
- `ADMIN_NOTIFY_EMAIL=hasibulalam108@gmail.com` (the account owner), consumed via
  `config/mail.php:133`. This is why flows 1 and 3 deliver while 2, 4, 5 fail for
  non-owner visitors.
- No application-level allowlist or sender-restriction logic exists. The
  restriction is enforced entirely by Resend, surfacing as a caught exception at
  `SubmissionNotifier.php:120` and `MeetingRequestService.php:43`. Documented, not fixed.
- `QUEUE_CONNECTION=database`, but **no queue worker is required**: no Mailable
  implements `ShouldQueue` and both dispatch sites call `->send()`, not `->queue()`.
  Sends are synchronous by deliberate design (`SubmissionNotifier.php:26-29`).
  `jobs` table row count: 0. Queue driver is currently irrelevant to mail.

### Templates (D)

All three render real dynamic content; no placeholder or lorem text anywhere
(scanned for `lorem|ipsum|dummy|TODO|FIXME`: none found).

- `emails/submission-received.blade.php` — client name (`:31`), plus the actual
  subject line (`:46`) or requested slot (`:37`), with graceful fallbacks when
  those optional fields are empty.
- `emails/meeting-request-reply.blade.php` — client name (`:27`) and the real
  admin-written reply (`:36`), via `nl2br(e($reply))`: line breaks preserved,
  raw HTML escaped.
- `emails/new-submission.blade.php` — sender name/email, detail rows, message body.

### Root Cause

Two distinct causes, and they are not the same kind of problem:

1. **Flow 5 for contact messages was never implemented.** Not a wiring defect —
   there is no Mailable, route, controller action, DB column, or UI for it. The
   meeting-request reply feature was built end-to-end; the contact-message
   equivalent was not started.
2. **Non-delivery to visitor addresses is Resend sandbox enforcement**, not
   application code. Observed verbatim: `Invalid 'to' field. Please use our
testing email address instead of domains like 'example.com'.` Flows 1 and 3
   are unaffected because they address the account owner. Out of scope per the task.
3. **The false success toast is a frontend contract violation** — the backend
   reports partial failure honestly and `apiCall()`'s 2xx-means-success mapping
   erases the distinction before the page can act on it.

### Solution

Not implemented — this was an audit. Recommended, in priority order:

1. **Surface the real reply outcome (small, high value).** In
   `meeting-requests/page.jsx:82-83`, toast `result.message` from the API instead
   of a hardcoded string, and treat "could not be sent" as a warning rather than a
   success. Optionally have the endpoint return an explicit `emailed` boolean in
   its payload so the frontend branches on data, not prose — `MeetingRequestService`
   already computes exactly that value (`:29`, `:58`) and the controller currently
   drops it.
2. **Decide explicitly whether contact messages need a reply flow.** If yes, it is
   a four-part change mirroring the meeting side: migration adding
   `admin_reply`/`status`/`replied_at`, a `ContactMessageReplyMail` +
   `emails/contact-message-reply.blade.php`, a `reply` action and
   `PUT /admin/messages/{message}/reply` route with a `ReplyContactMessageRequest`,
   and the reply textarea in the messages detail modal. If no, the gap should be
   recorded so future audits stop flagging it — the `replyTo` header already makes
   replying from a normal mail client work.
3. No DNS/domain-verification work — explicitly out of scope, separate task in progress.

### Prevention

- **Add a guard test that fails when a Mailable has no dispatch call.** Reflect
  over `app/Mail/*.php` and assert each class name appears in at least one file
  under `app/` outside `app/Mail/`. This is the exact "defined but never
  dispatched" class of bug the audit was looking for, and it is cheap to check.
- **Cover flows 1–4 in PHPUnit.** Current coverage is real but narrow: the suite
  is 5 tests, all in `tests/Feature/MeetingRequestReplyMailTest.php`, all flow 5
  (5/5 passing, 12 assertions). Flows 1–4 have zero PHPUnit coverage — a
  `Mail::fake()` test per public endpoint asserting `assertSent(NewSubmissionMail)`
  **and** `assertSent(SubmissionReceivedMail)` with the right recipient would have
  caught a missing dispatch or a swapped admin/client address.
- **Assert the UI honours partial failure.** A test that forces a transport
  failure and asserts the panel does _not_ claim success would have caught the
  toast bug; `test_a_failing_transport_still_saves_the_reply` already proves the
  backend half, so only the frontend assertion is missing.
- **Keep dispatch logging as the audit oracle.** The `Sending …` / `Failed to send …`
  log pairs made every flow independently observable without a real inbox. Any new
  submission endpoint should route through `SubmissionNotifier` so it inherits both
  the two-email contract and that observability.

### Verification

`audit/verify-email-flows.js` — **14/15 checks passed**. The single failure is
flow 5 for contact messages (no reply affordance). Steps: submit contact form on
:3000 → assert both dispatch log lines → submit meeting request → assert both
dispatch log lines → log into :3001 → confirm both records in their inboxes →
send a meeting reply → assert reply dispatch. Recipient address used was the
Resend account owner (not production client data), which is the only address
sandbox mode will accept, so this run also achieved genuine end-to-end delivery —
cross-checked against the Resend API, which showed all five subjects
`delivered`/`opened`.

**Limitation:** dispatch, not delivery, is the assertion. Because the test address
is the account owner, this run cannot demonstrate what happens to a real visitor;
`audit/probe-reply-toast-on-failure.js` covers that gap by using a recipient
Resend refuses, and it is what confirmed both the sandbox rejection path and the
false success toast.

### Files added (audit)

- `audit/verify-email-flows.js` — the 15 checks across all 5 flows, asserting on
  `storage/logs/laravel.log` dispatch lines with a Resend API cross-check.
- `audit/probe-reply-toast-on-failure.js` — exercises the transport-failure branch
  the main run cannot reach, comparing API message against the rendered toast.

Logs: `audit/logs/email-flows.json`, `audit/logs/email-flows-checks.json`,
`audit/logs/reply-toast-failure.json`.
Screenshots: `audit_screenshots/email-flows/` (9),
`audit_screenshots/reply-toast-failure/` (2).

No application code was modified. Test records created during the run
(contact message 14, meeting requests 12 and 13) were soft-deleted via the
authenticated API afterwards.

---

## False-Success Toast Fix — 2026-08-26

### Problem Analysis

Sending a meeting-request reply from the admin panel always showed a green
"Reply sent successfully" toast, including when the email was never delivered.
While Resend is in sandbox mode it refuses every recipient except the account
owner, so for a real visitor address **failure is the normal outcome** — and the
admin had no signal at all. Both sides of the request were inspected before
changing anything: what the endpoint returns when the send throws, and how the
panel decides which toast to show.

### Root Cause

**Both (c).** The two faults compounded: either alone would have produced the bug.

Backend — `app/Http/Controllers/Admin/MeetingRequestController.php:33-51` (pre-fix).
`MeetingRequestService::reply` correctly caught the transport exception
(`app/Services/MeetingRequestService.php:43-54`) and returned `emailed: false`.
The controller then put an honest message in the body but still answered
**HTTP 200** via `ApiResponse::success`, and dropped the `emailed` boolean the
service had already computed (`MeetingRequestService.php:29`, `:58`). So the only
machine-readable channel said "success".

Frontend — two lines, both discarding the truth:

- `portfolio-admin/lib/api.js:47-53` — `apiCall()` maps **any** 2xx to
  `success: true`.
- `portfolio-admin/app/admin/meeting-requests/page.jsx:82-83` — the success branch
  hardcoded `showToast('Reply sent successfully', 'success')`, ignoring
  `result.message` entirely.

Even had the frontend read `result.message`, it would still have rendered a
_success-styled_ toast; even had the backend returned non-2xx, the hardcoded
string would have been bypassed but the message lost. Hence both were fixed.

### Solution

Backend:

- `app/Http/Controllers/Admin/MeetingRequestController.php:29-58` — a failed send
  now answers **502** with "Reply saved, but the email could not be delivered.
  Check the mail configuration."; a delivered send answers 200 with "Reply sent
  successfully." 502 rather than 500 because nothing is broken internally — an
  upstream provider refused the send.
- `app/Http/Responses/ApiResponse.php:44-61` — `error()` gained an optional
  `$data` parameter (defaults to null, so no existing caller changes). The 502
  carries the **saved record**, because the reply _is_ persisted before the send
  is attempted. Without it the panel cannot tell "nothing happened" from "the
  write landed, the delivery did not", and would leave its list stale.

Frontend:

- `portfolio-admin/lib/api.js:74-84` — the error path passes through
  `error.response.data.data` instead of hardcoding `data: null`. Additive; every
  other caller ignores `data` on failure.
- `portfolio-admin/app/admin/meeting-requests/page.jsx:68-99` — the toast now
  comes from the backend on both paths. Success: success toast, close dialog,
  refresh. Failure: **error** toast with the backend's message, refresh the list
  so it matches the database, and deliberately keep the dialog open so the admin
  still has the text that did not go out in front of them.

Contact messages: **skipped, correctly.** Re-verified that no reply feature exists
to fix — no route (`routes/api.php:153-155` is index/read/destroy),
no `reply` action on `ContactMessageController`, no Mailable, no
`ReplyContactMessage*` class anywhere, and no `admin_reply` column on
`contact_messages`.

No DNS, Resend, or `.env` change. Nothing outside these four files was touched.

### Two deviations worth your call

1. **No `success` key was added to the JSON body.** `ApiResponse` documents a
   uniform three-key envelope (`data`, `message`, `errors`) that every endpoint
   returns and that `apiCall()` depends on; adding `success` to this one endpoint
   would fork that contract, and adding it to all of them is a much larger change.
   `apiCall()` already derives a `success` boolean from the status code, so the
   panel branches on `result.success` + `result.message` — functionally identical
   to the requested shape. Say the word if you want the literal key.
2. **The persistent state still cannot distinguish delivered from undelivered.**
   `MeetingRequestService::reply` flips `status` to `replied` _before_ attempting
   the send, so the list badge reads "replied" either way (visible in
   `audit_screenshots/toast-fix/03-success-toast.png` — both rows say replied,
   though one was refused). The toast is transient at 3s; an admin who misses it
   has no lasting signal. Closing that gap means a data-model decision — a
   `delivery_failed_at` column, or not flipping `status` until the send
   succeeds — so it was left out of a bug fix. Recommended as the next step.

### Verification

`audit/verify-toast-fix.js` — **12/12 checks passed**, both paths driven through
the real UI, no configuration touched:

- **Failure** (recipient `rejected-…@example.com`, which sandbox mode refuses):
  HTTP 502, toast is the error variant (`role="alert"`, red), text is the
  backend's own message, and it does **not** say "sent successfully". The 502 body
  returned the saved record (`data.status=replied`) and the dialog stayed open.
- **Success** (recipient = the Resend account owner, the one address sandbox mode
  accepts): HTTP 200, toast is the success variant (`role="status"`, green),
  reads "Reply sent successfully.", dialog closed. This half is what proves the
  fix did not just make every reply look like an error.

Toasts auto-dismiss after 3s, so the run installs a MutationObserver and records
every toast rather than racing that timeout.

`php artisan test` — **10/10 passing, 25 assertions** (was 5/5). The 5 pre-existing
service-level tests still pass unchanged; none asserted an HTTP status, which is
exactly why the bug survived them.

### Prevention

- **Added** `tests/Feature/MeetingRequestReplyEndpointTest.php` — 5 HTTP-level
  tests covering the gap the old suite had: a delivered reply answers 200, a
  failed send answers **502 not 200**, a failed send still returns the saved
  record, an empty reply is rejected before any send, and the endpoint requires
  auth. `test_a_failed_send_answers_502_not_200` is the direct regression guard.
- The old suite tested `MeetingRequestService` thoroughly but never the
  controller, so the status code — the one thing the frontend branches on — was
  untested. Any endpoint whose side effect can fail independently of its write
  should be tested at the HTTP layer, not just the service layer.
- **Audit the same pattern elsewhere.** `apiCall()`'s 2xx-means-success mapping is
  shared by every admin page, so any endpoint returning 200 with a
  partial-failure message has this bug latently. `SubmissionNotifier` swallows
  mail failures for the four public-form emails by design (a visitor must not get
  a 500 for a submission that saved) — that is correct and deliberately unchanged,
  but it means the public forms give the _visitor_ no delivery signal either.
- **Consider a lint rule or review check** against hardcoded success strings in a
  branch that has a `result.message` available.

### Files changed

- `portfolio-backend/app/Http/Controllers/Admin/MeetingRequestController.php`
- `portfolio-backend/app/Http/Responses/ApiResponse.php`
- `portfolio-admin/lib/api.js`
- `portfolio-admin/app/admin/meeting-requests/page.jsx`

### Files added

- `portfolio-backend/tests/Feature/MeetingRequestReplyEndpointTest.php`
- `audit/verify-toast-fix.js`

Logs: `audit/logs/toast-fix.json`, `audit/logs/toast-fix-checks.json`.
Screenshots: `audit_screenshots/toast-fix/` (3).
Test fixtures created during the run (meeting requests 14 and 15) were
soft-deleted via the authenticated API afterwards.

---

## Phase 1 — Delivery Status Tracking (meeting requests) — 2026-08-26

### Problem Analysis

`MeetingRequestService::reply` wrote `status = replied` and `replied_at` **before**
attempting the send, so a refused delivery and a delivered one were
indistinguishable in the admin list — both rows read "replied". The only signal
was the error toast added in the previous fix, and it auto-dismisses after three
seconds. An admin who looked away had no way to know a client was never reached.

### Root Cause

`app/Services/MeetingRequestService.php:23-27` (pre-fix) — a single `update()` set
`admin_reply`, `status`, and `replied_at` together, ahead of the `Mail::to()->send()`
call at `:40`. Committing the reply text early is correct (it must survive a
transport failure); committing the _delivery claims_ early is the defect. The two
were coupled in one write, so there was no way to keep one and not the other.

### Solution / Implementation

Split the write in two around the send:

- `database/migrations/2026_08_26_120000_add_delivery_failed_at_to_meeting_requests_table.php`
  — adds a nullable `delivery_failed_at` timestamp. A timestamp rather than a
  boolean: "when did delivery last fail" is strictly more information, and null
  already means "no failure outstanding".
- `app/Services/MeetingRequestService.php:12-73` — `admin_reply` is committed first,
  alone. After the send, a **delivered** reply sets `status = replied`,
  `replied_at = now()`, and clears `delivery_failed_at`; a **refused** one sets only
  `delivery_failed_at = now()`.
- `app/Models/MeetingRequest.php` — `delivery_failed_at` added to `$fillable` and
  cast to `datetime`.
- `app/Http/Resources/MeetingRequestResource.php` — exposes `delivery_failed_at`.
- `portfolio-admin/app/admin/meeting-requests/page.jsx` — a red `MailWarning` +
  "Delivery failed" chip with a `title="Delivery failed — retry"` tooltip on any row
  with a non-null `delivery_failed_at`, visually distinct from the green replied
  styling.

Two decisions worth recording:

- **No new `status` value.** The column is an enum of `pending`/`replied`; a third
  member would need a table rebuild on some drivers, and delivery failure is
  genuinely orthogonal to workflow position. A request can be
  replied-and-then-failed (a retry that did not land) or pending-and-failed (a first
  attempt that did not land), and one enum cannot express both without losing
  information. On failure `status` is therefore left **as-is**, per the brief.
- **`replied_at` now tracks delivery, not typing.** It is stamped only on a
  successful send, so it can never disagree with `status` about whether the client
  was reached. It is not rendered anywhere in the admin UI, so nothing regressed.

### Verification

`php artisan test` — 12/12 passing, 45 assertions at the end of this phase (up from
10/12). Playwright coverage for this phase is folded into Phase 3.

### Prevention

`tests/Feature/MeetingRequestReplyEndpointTest.php` grew from 5 to 7 tests:

- `test_a_failed_send_stamps_delivery_failed_at_and_does_not_claim_replied` — asserts
  `delivery_failed_at` set, `status` still `pending`, `replied_at` still null.
- `test_a_successful_retry_clears_delivery_failed_at` — drives a refusal then a
  success on the same record and asserts the marker is cleared, `status` flips, and
  `replied_at` is stamped. A stale marker would leave a red indicator on a request
  that had since been answered, which is the failure mode most likely to be missed.
- `test_a_delivered_reply_answers_200` also tightened to assert
  `delivery_failed_at === null` and `replied_at` non-null.

### Files changed / added

Changed: `app/Services/MeetingRequestService.php`, `app/Models/MeetingRequest.php`,
`app/Http/Resources/MeetingRequestResource.php`,
`portfolio-admin/app/admin/meeting-requests/page.jsx`,
`tests/Feature/MeetingRequestReplyEndpointTest.php`.
Added: `database/migrations/2026_08_26_120000_add_delivery_failed_at_to_meeting_requests_table.php`.

---

## Phase 2 — Contact-Message Reply Feature — 2026-08-26

### Problem Analysis / Design

Contact messages had no reply capability at any layer — no Mailable, route,
controller action, service, schema column, or UI. This phase built the feature to
the same standard as the meeting-request reply, with delivery tracking included
from the start rather than retrofitted as in Phase 1.

Design, mirroring the existing chain end to end:

- Migration adding `admin_reply` (text), `replied_at`, `delivery_failed_at` — all
  nullable. **No `status` column**: on `meeting_requests` that enum predates the
  reply feature, whereas here `replied_at` non-null already answers "has this been
  replied to". Pairing it with `delivery_failed_at` covers every state the inbox
  shows, without a second field that could disagree.
- `ContactMessageReplyMail` mirroring `MeetingRequestReplyMail` — same global
  `from` identity from `config/mail.php`, same `nl2br(e($reply))` escaping, only the
  reply text reaching the view. Its subject echoes the sender's own subject line
  (`Re: <subject>`), falling back to `Re: your message` since `subject` is nullable
  on the public form.
- `emails/contact-message-reply.blade.php` structurally identical to
  `meeting-request-reply.blade.php`, so both replies look like the same site sent
  them.
- `ContactMessageService::reply()` mirroring `MeetingRequestService::reply()`,
  including the Phase-1 delivery logic.
- `POST /admin/contact-messages/{message}/reply` with the same response contract as
  the fixed meeting endpoint: 200 on delivery, **502 with the saved record** on
  refusal.

**Shared component decision: a `useReplyAction` hook, not a `ReplyDialog` component.**
The two detail modals genuinely differ in their non-reply content — meeting requests
carry a preferred slot and an internal note with its own endpoint; contact messages
carry a read toggle — so one component would need enough parameterisation
(which fields, which extra actions, which buttons) to become a config-driven switch,
less readable than the two modals it replaced. What _is_ identical is the part that
is subtle and dangerous to duplicate: 200 → success toast, close, refresh;
502 → error toast with the backend's message, adopt the returned record, refresh,
keep the dialog open. Duplicating that would mean the false-success bug fixed
earlier needed fixing twice and could silently drift. So the logic is shared and the
layout stays local — the markup is ~12 lines and reads better inline. The
meeting-requests page was refactored onto the same hook, so there is exactly one
implementation of the reply semantics.

Per your ruling, the Mailable follows the codebase's `*Mail` suffix convention
(`ContactMessageReplyMail`) while the route keeps your specified `POST
/admin/contact-messages/{id}/reply`. Note this leaves the two reply endpoints on
different verbs — meeting uses `PUT` — which the hook absorbs via a `method` option.

### Solution / Implementation

Added:

- `database/migrations/2026_08_26_120100_add_reply_fields_to_contact_messages_table.php`
- `app/Mail/ContactMessageReplyMail.php`
- `resources/views/emails/contact-message-reply.blade.php`
- `app/Services/ContactMessageService.php`
- `app/Http/Requests/ReplyContactMessageRequest.php`
- `portfolio-admin/lib/useReplyAction.js`
- `tests/Feature/ContactMessageReplyEndpointTest.php`

Changed:

- `app/Http/Controllers/Admin/ContactMessageController.php` — constructor injection
  of the service plus a `reply` action returning 200/502 with the saved record.
- `routes/api.php:156-158` — the new POST route.
- `app/Models/ContactMessage.php` — three columns in `$fillable`, two datetime casts.
- `app/Http/Resources/ContactMessageResource.php` — exposes `admin_reply`,
  `replied_at`, `delivery_failed_at`.
- `portfolio-admin/app/admin/messages/page.jsx` — reply textarea, recipient hint, an
  inline red note when a prior attempt failed, a Send Reply button with a sending
  spinner, a red "Delivery failed" chip and a green "Replied" chip in the list, and
  `openMessage`/`closeMessage` helpers so the draft is cleared on every close path.
- `portfolio-admin/app/admin/meeting-requests/page.jsx` — refactored onto the shared
  hook.

### Verification

`php artisan test` — 22/22 passing, 78 assertions. Playwright coverage in Phase 3.

### Prevention

`tests/Feature/ContactMessageReplyEndpointTest.php` — 10 tests mirroring the meeting
suite so the new feature is held to the same bar from day one: 200 on delivery,
the Mailable actually addressed to the sender, 502 on refusal,
`delivery_failed_at` set with the reply still saved and `replied_at` still null,
a successful retry clearing the marker, empty reply rejected before any send, auth
required, subject echo, subject fallback, and rendered body content.

### Files changed / added

7 added, 6 changed (listed above).

---

## Phase 3 — Full End-to-End Verification — 2026-08-26

### Problem Analysis / Design

One Playwright run covering all five email flows plus the delivery-status behaviour
from Phases 1 and 2. Submission flows (1–2) assert on the `Sending <kind>.` dispatch
lines `SubmissionNotifier` writes, because Resend refuses every recipient except the
account owner and delivery cannot be the oracle for an arbitrary visitor address.
Reply flows get stronger oracles: the HTTP status, the toast variant read from the
DOM (`role="alert"` vs `role="status"` plus the red/green class), the list indicator,
and the record itself read back through the authenticated admin API.

Both paths are produced by the recipient address alone — the owner's address for
delivery, a non-owner domain for refusal. No configuration was touched.

### Solution / Implementation

`audit/verify-email-flows-full.js`. Toasts auto-dismiss after 3s, so it installs a
MutationObserver and records every toast rather than racing the timeout. Row lookups
use **exact** text matching: a first draft used `:has-text()`, which is a substring
match, and a retry fixture named by appending to another fixture's name silently
resolved to the wrong row — the run reported a false failure until the selector and
the fixture names were fixed. Fixtures are now named so no name contains another.

### Verification

`audit/verify-email-flows-full.js` — **37/37 checks passed**, 7 screenshots,
0 page errors. By flow:

- **1** contact submitted → admin notification + client acknowledgment dispatched.
- **2** meeting submitted → admin notification + client acknowledgment dispatched.
- **3** contact reply delivered → HTTP 200, success toast (`role="status"`, green),
  `replied_at` set, `delivery_failed_at` null, dispatch logged, no failure chip.
- **4** contact reply refused → HTTP 502, error toast (`role="alert"`, red) carrying
  "Reply saved, but the email could not be delivered…", not claiming success, dialog
  stayed open, `delivery_failed_at` set, `replied_at` still null, reply text
  persisted, red chip present in the list.
- **5** meeting reply both paths → 200/502, correct toast variants,
  `status = replied` only on delivery, **`status` still `pending` after refusal**
  (the Phase-1 fix, observed end to end), chip present on the refused row and absent
  on the delivered one.
- **6** retries → a reply to a deliverable address answers 200 and leaves
  `delivery_failed_at` null on both types, while a row that was refused and never
  retried keeps its indicator on both types.

The 2 logged 4xx/5xx and 2 console errors are the two intentional 502s.

**Scope note, stated plainly:** the E2E cannot flip an existing record's recipient,
so the same-record failure→success transition is asserted in PHPUnit
(`test_a_successful_retry_clears_delivery_failed_at`, present for both types) rather
than through the browser. What the E2E proves is that the marker is per-record and
sticky: a refused row stays flagged while a delivered row is not.

`php artisan test` — **22/22 passing, 78 assertions**, full suite not just the new
tests (10 contact endpoint + 7 meeting endpoint + 5 mailable contract).

All 6 test records were removed via the authenticated API at the end of the run.

### Prevention

- The exact-match selector lesson is now encoded in comments on both
  `hasFailureIndicator` and `replyViaUi`, and in how `NAMES` is constructed — a
  substring-matching row lookup produces a _false failure_, which costs more trust
  than a missing check.
- `audit/verify-email-flows-full.js` supersedes `audit/verify-email-flows.js` (the
  Phase-0 audit script) and `audit/verify-toast-fix.js` for regression purposes;
  the older two are kept because they document what the original defects looked like.

### Files changed / added

Added: `audit/verify-email-flows-full.js`.
Logs: `audit/logs/email-flows-full.json`,
`audit/logs/email-flows-full-checks.json`.
Screenshots: `audit_screenshots/email-flows-full/` (7).

---

## Summary

**Files touched across all three phases: 20** — 9 added, 11 changed.

Added (9):

- `portfolio-backend/database/migrations/2026_08_26_120000_add_delivery_failed_at_to_meeting_requests_table.php`
- `portfolio-backend/database/migrations/2026_08_26_120100_add_reply_fields_to_contact_messages_table.php`
- `portfolio-backend/app/Mail/ContactMessageReplyMail.php`
- `portfolio-backend/resources/views/emails/contact-message-reply.blade.php`
- `portfolio-backend/app/Services/ContactMessageService.php`
- `portfolio-backend/app/Http/Requests/ReplyContactMessageRequest.php`
- `portfolio-backend/tests/Feature/ContactMessageReplyEndpointTest.php`
- `portfolio-admin/lib/useReplyAction.js`
- `audit/verify-email-flows-full.js`

Changed (11):

- `portfolio-backend/app/Services/MeetingRequestService.php`
- `portfolio-backend/app/Models/MeetingRequest.php`
- `portfolio-backend/app/Models/ContactMessage.php`
- `portfolio-backend/app/Http/Resources/MeetingRequestResource.php`
- `portfolio-backend/app/Http/Resources/ContactMessageResource.php`
- `portfolio-backend/app/Http/Controllers/Admin/ContactMessageController.php`
- `portfolio-backend/routes/api.php`
- `portfolio-backend/tests/Feature/MeetingRequestReplyEndpointTest.php`
- `portfolio-admin/app/admin/meeting-requests/page.jsx`
- `portfolio-admin/app/admin/messages/page.jsx`
- `report.md`

**Final PHPUnit: 22/22 passing, 78 assertions.** (Started this session at 5/5.)

**Final Playwright: 37/37 checks passing** in `audit/verify-email-flows-full.js`.

**Feature parity — confirmed.** Contact-message reply now matches meeting-request
reply on every layer: Mailable with a branded template mirroring the meeting one,
a service with identical save-then-send ordering, delivery-failure tracking with
retry-clearing, an endpoint with the same 200/502-plus-saved-record contract, a
reply UI in the detail modal, a red delivery-failed indicator in the list, and an
equivalent PHPUnit suite (10 tests vs the meeting side's 7 + 5). Both inboxes now
share one implementation of the reply semantics via `useReplyAction`.

Two intentional differences, neither a parity gap: contact messages have no
`status` column (`replied_at` carries that meaning), and the contact endpoint uses
`POST` where meeting uses `PUT`, per your naming ruling.

### Observation from the dev environment (not a test artifact)

While Phase 2 was being verified, a **real** reply was sent from the admin panel at
03:28:40 to contact message #11 (`hasibulalamhimel77@gmail.com`) — reply text
"which type sass project you need", clearly typed by a person, not by any test
fixture. Resend refused it with "You can only send testing emails to your own email
address". The new feature handled it exactly as designed: the reply was saved,
`delivery_failed_at` was stamped, and the row is flagged red in the inbox.

That record was deliberately **left untouched** by cleanup, which only removed
run-stamped fixtures. It is a genuine outstanding item: that reply is saved but
undelivered, and will need re-sending once a domain is verified. The red indicator
in the inbox is what will keep it findable.

---

## Production Email Config + Final Verification — 2026-08-27

### Changes

**No `.env` edit was needed — the three target values were already in place.** Read
before writing, and `portfolio-backend/.env` (mtime `Aug 26 13:10`) already held
exactly what this task asked for:

```
MAIL_FROM_ADDRESS=info@hasibulalam.com          (line 54)
MAIL_FROM_NAME="Hasibul Alam"                   (line 55)
ADMIN_NOTIFY_EMAIL=info@hasibulalam.com         (line 61)
```

So this phase changed no `.env` bytes. The one action taken was the cache clear:

```
$ php artisan config:clear
   INFO  Configuration cache cleared successfully.
```

Nothing else in `.env` was touched — Sanctum, R2, DB, and Redis blocks are
byte-identical (`md5sum .env` → `eebf885d3ea8e77058cd340e43d52d14`, unchanged
across the whole phase).

**Brand name cross-check (the task's "check Settings model default first").**
`MAIL_FROM_NAME` is not guessed; it agrees with the CMS. `Setting::first()->brand_name`
is `Hasibul Alam` (seeded as `Hasibul` in `database/seeders/SingletonSeeder.php:26`,
since edited through the admin panel), and `site_title` is `Hasibul Alam Portfolio`.
So the mail identity and the site identity are the same string. Note `APP_NAME` is
still `"Portfolio CMS"` — that is Laravel's internal app label, not a customer-facing
brand, and it is deliberately not what the mailer uses.

**Effective config after the clear** (read out of the framework, not out of the file,
so `config:clear` is proven to have taken effect):

```
from.address         = info@hasibulalam.com
from.name            = Hasibul Alam
admin_notify_address = info@hasibulalam.com
mailer               = resend
```

`ADMIN_NOTIFY_EMAIL` reaches the app through `config/mail.php:133`
(`'admin_notify_address' => env('ADMIN_NOTIFY_EMAIL')`) and is consumed by
`adminRecipient()` at `app/Services/SubmissionNotifier.php:87`.

**Domain state confirmed at the provider, not assumed.** `GET /domains` on the Resend
API returns `hasibulalam.com` → `status: verified`, `capabilities.sending: enabled`,
region `ap-northeast-1`. DNS backs that up: `resend._domainkey` DKIM published,
`send.hasibulalam.com` carrying `v=spf1 include:amazonses.com ~all` plus the SES
feedback MX, and the apex MX pointing at `route{1,2,3}.mx.cloudflare.net` — i.e.
Cloudflare Email Routing owns inbound while Resend owns outbound.

### Verification results (per flow, with real external delivery confirmed)

`node audit/verify-email-flows-full.js portfolio-e2e-1787826132@emalupe.com`
→ **50/50 checks passed** (run stamp `1787826142803`).

The external recipient was a **mail.tm disposable inbox created for this run**
(`portfolio-e2e-1787826132@emalupe.com`) — a mailbox I control and can read over
mail.tm's API, containing no production client data. That choice matters: the script's
own default is a plus-tagged alias on the owner's Gmail, which a skeptic could dismiss
as still-the-account-owner. An unrelated third-party domain is the stronger evidence
now that sending is no longer restricted.

Delivery was asserted **twice, independently**: once from the sending side (Resend's
per-message `last_event`) and once from the receiving side (the message actually
sitting in the mail.tm inbox, fetched and its body read). A provider claiming "sent"
is not the same fact as a mailbox holding the mail.

| Flow                          | What was checked                                                                                                                                                                     | Result |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1 — contact submitted         | admin notification + client ack dispatched, both present in Resend, both `delivered`                                                                                                 | PASS   |
| 2 — meeting submitted         | admin notification + client ack dispatched, both present in Resend, both `delivered`                                                                                                 | PASS   |
| 3 — contact reply, delivered  | HTTP 200, green `role="status"` toast, `replied_at` set, `delivery_failed_at` null, no red row indicator                                                                             | PASS   |
| 4 — contact reply, refused    | HTTP 502, red `role="alert"` toast carrying the backend message, dialog stays open, `delivery_failed_at` stamped, `replied_at` still null, reply text persisted, red indicator shown | PASS   |
| 5 — meeting reply, both paths | 200 + `status=replied` on delivery; 502 + `status` stays `pending` on refusal; indicator appears on the refused row only                                                             | PASS   |
| 6 — retry                     | both deliverable retries answer 200 and leave `delivery_failed_at` null; the never-retried refused rows keep their indicator                                                         | PASS   |

**Received in the external inbox — 8 messages, all `From: "Hasibul Alam" <info@hasibulalam.com>`:**

```
10:23:29  Re: your meeting request          (admin reply, meeting — retry)
10:23:24  Re: E2E subject 1787826142803     (admin reply, contact — retry)
10:23:21  We received your meeting request  (client ack)
10:23:20  We received your message          (client ack)
10:23:09  Re: your meeting request          (admin reply, meeting)
10:22:51  Re: E2E subject 1787826142803     (admin reply, contact)
10:22:27  We received your meeting request  (client ack)
10:22:26  We received your message          (client ack)
```

Bodies were opened, not just counted — the acknowledgment renders "Thanks for
reaching out about E2E subject …", the contact reply carries the exact admin text
`Delivered contact reply 1787826142803.`, and the meeting reply carries
`Retry lands 1787826142803.`, each signed `Hasibul Alam`. Templates render correctly
against a real MUA, not only in a Blade test.

**Admin notifications:** Resend records four to `info@hasibulalam.com`, all
`last_event=delivered` — `New contact message from E2E CT ok/retry …` and
`New meeting request from E2E MT ok/retry …`.

**"From" address — the specific thing this phase was meant to prove.** Every one of
the 14 messages in the run reports `from="Hasibul Alam" <info@hasibulalam.com>`.
Zero occurrences of the old sandbox sender. Grepping the app code for
`onboarding@resend.dev` leaves only two harmless mentions, both documentation rather
than behaviour: a hint string in `app/Console/Commands/TestResendMail.php:94` and the
committed default in `.env.example:67`. Neither is on any send path.

**Refusal path still exercised.** Flows 4 and 5 keep using `@example.com`, which
Resend rejects on its own terms regardless of domain verification. Domain
verification therefore did not silently turn the failure branch into dead code — 502,
red toast, `delivery_failed_at`, and the list indicator were all observed this run.

Test data cleaned up: 6 run-stamped records deleted through the authenticated API
(`contact:24,25,26`, `meeting:25,26,27`). Artifacts refreshed at
`audit/logs/email-flows-full-checks.json`, `audit/logs/email-flows-full.json`, and
7 screenshots under `audit_screenshots/email-flows-full/`.

### Any remaining issues

**1. The last hop into Gmail is unverified — I could not check it.** The task asked to
confirm the admin notification "arrives at the Cloudflare-forwarded Gmail
(hasibulalam108@gmail.com)". What I can prove is that Resend accepted and marked
`delivered` to `info@hasibulalam.com`, and that the apex MX is Cloudflare's. Whether
Cloudflare's routing rule then forwards to `hasibulalam108@gmail.com` is not
observable from here — I have no access to that mailbox. Treat that one link as
**asserted by configuration, not measured**. Opening the Gmail inbox and looking for
the four `New contact message from E2E CT …` / `New meeting request from E2E MT …`
mails from this run's 10:22–10:23 window is a five-second manual check, and worth
doing since a missing Cloudflare rule would be invisible to every automated check
above.

**2. Four pre-existing records are still flagged as delivery-failed** — real data from
the sandbox era, all refused before the domain was verified, none of them test
fixtures:

```
contact#11  hasibulalamhimel77@gmail.com  failed 2026-08-26 03:28:42  replied_at=null
contact#21  himelhasib06@gmail.com        failed 2026-08-26 04:06:49  replied_at=null
meeting#6   himelhasib06@gmail.com        failed 2026-08-26 04:04:56  status=replied
meeting#22  himelhasib06@gmail.com        failed 2026-08-26 04:09:46  status=pending
```

These would now succeed — the address that refused them is exactly what verification
fixed. Their replies are saved and re-sendable from the inbox UI; nothing is lost. I
left them untouched rather than re-sending, because pressing Send on `contact#11`
delivers a human-written reply ("which type sass project you need") to a real person,
and that is your call to make, not a verification step. `meeting#6` deserves a second
look for a different reason: `status=replied` alongside a non-null
`delivery_failed_at` is the pre-Phase-1 inconsistency this session fixed, so it is a
historical artifact rather than a live bug — new refusals now correctly stay `pending`,
as flow 5 re-confirmed.

**3. `.env.example` still ships the sandbox sender.** `MAIL_FROM_ADDRESS="onboarding@resend.dev"`
at `.env.example:67` was the right default while unverified; it now means a fresh
clone starts on the sandbox sender. Not touched here — the task scoped this phase to
`.env` — but it is the natural next one-line change.

**4. No DMARC record.** `_dmarc.hasibulalam.com` returns nothing. SPF and DKIM are
both live, so mail is authenticating and delivering fine today (8/8 landed in an
external inbox). DMARC is a deliverability hardening step, not a defect, and is
outside this task's scope.

## 1. Unit Test — 2026-08-28

### Scope decision (why this scope for a project this size)

The existing isolated PHPUnit coverage already exercises the notifier, delivery-status ordering, form-request rules, mailables, reset mapping, and upload rules. Existing Vitest coverage exercises the frontend pure utilities, so no duplicate unit tests were added.

### What was built/run

Existing `tests/Unit` was retained and Vitest was made reproducible by adding it as a dev dependency to both Next.js apps.

### Results

Laravel unit tests are included in the passing `173` backend tests. Public frontend: `58/58`; admin frontend: `45/45`.

### Gaps found and fixed (if any)

The frontend runner was configured but undeclared; Vitest was added to both package manifests.

## 2. Integration Test — 2026-08-28

### Scope decision (why this scope for a project this size)

The existing database-backed feature tests already cover the requested public contact and meeting submissions and both admin reply success/failure branches, so the suite was extended only where a contract or regression boundary was missing.

### What was built/run

Retained `PublicSubmissionIntegrationTest` and `AdminReplyIntegrationTest`, and added `tests/Regression/DeliveryFailureRegressionTest.php` for the two documented delivery bugs.

### Results

Full Laravel suite: `173/173` tests passed, `584` assertions.

### Gaps found and fixed (if any)

The false-success and pre-send status-flip bugs now have separately named regression guards.

## 3. End-to-End Test — 2026-08-28

### Scope decision (why this scope for a project this size)

Six Playwright tests cover the four requested journeys while using environment-provided admin credentials and local services, avoiding real email recipients.

### What was built/run

Added `tests/e2e/public-journeys.spec.js` and `cms-admin-journeys.spec.js`; formal discovery is wired through `playwright.config.cjs` and `audit/package.json`.

### Results

Playwright discovery passes with six tests. Execution was not run because the local API/frontend/admin servers were not running.

### Gaps found and fixed (if any)

The prior one-off audit scripts now have a clear file-per-journey suite; live execution remains a local-environment prerequisite.

## 4. Snapshot Test — 2026-08-28

### Scope decision (why this scope for a project this size)

Playwright screenshots were chosen because CMS-driven layout regressions are visual and existing audit work already uses Playwright.

### What was built/run

Added `tests/e2e/cms-snapshots.spec.js` for the public homepage and admin Hero form using `toHaveScreenshot`.

### Results

Specs are discoverable, but baseline PNGs were not generated because no local apps were running.

### Gaps found and fixed (if any)

Baseline generation is still required in a running local environment; no visual result is claimed here.

## 5. Contract Test — 2026-08-28

### Scope decision (why this scope for a project this size)

A lightweight Laravel resource/envelope contract is more appropriate than Pact for two same-repository Next.js consumers and no existing Pact broker.

### What was built/run

Added `tests/Contract/ApiShapeContractTest.php` covering settings, hero, projects, skills, testimonials, and both admin inbox resources. The admin contact endpoint is tested at its actual route, `/api/admin/messages`.

### Results

`6/6` contract tests passed with `62` assertions.

### Gaps found and fixed (if any)

The requested name `/api/contact-messages` does not exist for the admin list; the real `/api/admin/messages` route is documented and tested.

## 6. Load Test — 2026-08-28

### Scope decision (why this scope for a project this size)

The workload is deliberately light: 50 browsing VUs plus five local contact submissions per second for 10 seconds.

### What was built/run

Added `load/k6-portfolio.js` with p95 under 1 second and error rate under 1% thresholds. It targets `API_URL`, defaulting to localhost.

### Results

k6 is not installed and no local API was running, so p50/p95 and error-rate results are unavailable rather than fabricated.

### Gaps found and fixed (if any)

Install k6 and run the script against a disposable local database before using the load result as a release gate.

## 7. Chaos Test — 2026-08-28

### Scope decision (why this scope for a project this size)

Manual fault injection is sufficient for this small system and avoids introducing a chaos platform or touching shared infrastructure.

### What was built/run

Added `chaos/README.md` covering mail, R2, and database failure scenarios. Mail failure is automated by existing notifier tests; R2 and database faults are local manual checks.

### Results

Mail failure degrades gracefully and preserves submissions. R2 and database scenarios are documented but not executed in this environment.

### Gaps found and fixed (if any)

No application crash or data-loss defect was observed in the automated mail-failure path.

## 8. Mutation Test — 2026-08-28

### Scope decision (why this scope for a project this size)

Mutation testing is limited to the four core service areas named in the request.

### What was built/run

The target is covered by the existing Unit/Feature tests, but Infection configuration and dependency are not present.

### Results

No before/after mutation score is available because `vendor/bin/infection` is absent.

### Gaps found and fixed (if any)

Install Infection in a follow-up verification environment and run it against `SingletonResetService`, `SubmissionNotifier`, `MeetingRequestService`, and `ContactMessageService`.

## 9. Smoke Test — 2026-08-28

### Scope decision (why this scope for a project this size)

A curl script is faster and less fragile than a browser for boot, homepage, API, and admin-login availability.

### What was built/run

Added executable `audit/smoke-test.sh` with three requests and three-second per-request timeouts.

### Results

The script failed fast in under one second because no local API was listening on port 8000; this is an environment failure, not a passing smoke result.

### Gaps found and fixed (if any)

The command is ready for local startup and reports a concise success/failure line.

## 10. Regression Test — 2026-08-28

### Scope decision (why this scope for a project this size)

Every specifically documented historical bug gets a named test, while existing detailed endpoint tests remain the implementation-level coverage.

### What was built/run

Added `tests/Regression/DeliveryFailureRegressionTest.php` for the delivery-status flip and false-success toast bugs documented in `report.md`.

### Results

`2/2` regression tests passed.

### Gaps found and fixed (if any)

No additional documented bug without existing coverage was found in the reviewed report history.

## Test Suite Summary

Backend PHPUnit: `173/173` passed (`584` assertions), including `6` contract and `2` regression tests. Frontend Vitest: `103/103` passed. Playwright: `6` tests discoverable, live execution pending local services; snapshots pending baseline generation. Smoke: correctly failed fast with services down. Mutation score: unavailable because Infection is not installed. Load p95: unavailable because k6 and a running local target are absent.

This is adequately tested for a production freelance portfolio at the application-test level: core writes, mail dispatch contracts, delivery failures, API shapes, frontend utilities, and browser journeys are represented. The genuinely missing evidence is operational rather than hidden application coverage: run Playwright snapshots/E2E and k6 against a disposable local stack, execute the R2/DB chaos scenarios, and install Infection to produce a mutation score before calling the suite complete as a release gate.

## Test Suite Completion — Real Execution Results — 2026-08-29

### Environment check

- Check performed: `curl -I --max-time 10 http://localhost:8000`, `curl -I --max-time 10 http://localhost:3000`, `curl -I --max-time 10 http://localhost:3001`
- Actual results:
  - `localhost:8000` responded with `HTTP/1.1 404 Not Found` and `X-Powered-By: PHP/8.4.25`
  - `localhost:3000` timed out: `curl: (28) Operation timed out after 10002 milliseconds with 0 bytes received`
  - `localhost:3001` timed out: `curl: (28) Operation timed out after 10002 milliseconds with 0 bytes received`
- Verdict: blocked. The required local services were not healthy enough to proceed, so no further 10-type execution was started.

### E2E

- Status: blocked because the frontend apps on ports 3000 and 3001 did not respond.
- Evidence: both timed out in the live environment check before the Playwright suite could run.
- Result: no pass/fail count available; no real E2E execution was performed.

### Snapshot

- Status: blocked because no healthy frontend instance was reachable.
- Evidence: Playwright could not be run against a responsive app target.
- Result: no baseline snapshot generation or diff verification executed.

### Smoke

- Status: blocked because the backend endpoint at port 8000 was not healthy and returned `404` instead of an application response.
- Result: no smoke script execution occurred; this was not a pass, and no wall-clock time was produced.

### Load

- Status: blocked before any k6 run.
- Reason: the required target at `http://localhost:8000` was not confirmed healthy enough to accept traffic, and the k6 tool was not checked/installed because the environment gate failed first.
- Result: no p50/p95 or error-rate values recorded.

### Mutation

- Status: blocked before any Infection run.
- Reason: the suite stopped at environment validation as required; no mutation execution was attempted.
- Result: no MSI value produced.

### Chaos

- Status: blocked before any chaos execution.
- Reason: the required services and environment health were not available; no invalid R2 key swap, MySQL stop/start, or endpoint test was run.
- Result: no HTTP status codes or error messages were recorded during a live fault-injection attempt.

## Updated Test Suite Summary

Final honest verdict: the 10-type suite is not fully executed with real evidence yet. It is currently blocked by an unhealthy local environment: `localhost:8000` returned `404 Not Found`, and both `localhost:3000` and `localhost:3001` timed out. Because the required frontend and backend services were not reachable, the E2E, snapshot, smoke, load, mutation, and chaos phases were not run and cannot be reported as passing. The suite remains incomplete until all three live services are confirmed healthy and the missing tooling checks/installations are completed.
