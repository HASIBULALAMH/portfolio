# Portfolio — public site

The public-facing portfolio. A Next.js App Router site that renders content
fetched from the Laravel API in `portfolio-backend`.

**Runs on port 3000.** See `../project-run.md` for the full three-service
startup (backend :8000, this app :3000, admin :3001).

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
```

`.env.local` needs one variable, including the `/api` suffix:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

## How content flows

`app/page.jsx` is a **server component**. It calls `getHomePageData()` once and
passes the result down as props, so the page ships as HTML rather than fetching
on the client.

- `lib/api.js` never throws. If the backend is down, slow, or returns an
  unexpected shape, each helper returns its fallback instead — a portfolio that
  renders stale-but-complete content beats one that 500s because the API
  restarted. Responses are cached for 60 seconds (`REVALIDATE_SECONDS`).
- `lib/fallbacks.js` holds fallbacks only for the singleton sections (settings,
  hero, about, contact info, section list). List-backed sections deliberately
  have none: `fetchList()` already defaults to `[]`, and those sections render
  an empty state until real content is entered in the admin panel.
- Which sections appear, in what order, and which nav links exist all come from
  `section_visibility` via `SECTION_REGISTRY` in `app/page.jsx`. Adding a
  section means adding a row there plus an entry in the registry; the nav link
  then follows automatically.

## This is a JavaScript project

100% `.js`/`.jsx` — no TypeScript. There is a `jsconfig.json` and deliberately
no `tsconfig.json`. Tools that scaffold components sometimes reintroduce `.tsx`;
convert them rather than adding a TS config.

## Layout

```
app/
├── page.jsx              # server component; fetches once, composes sections
├── layout.jsx            # title/favicon from Site Settings
└── projects/[slug]/      # case-study pages
components/portfolio/     # one component per section, all prop-driven
lib/
├── api.js                # server-side fetch helpers (never throw)
├── fallbacks.js          # singleton-section fallbacks
├── tech-icons.js         # simple-icons lookup
└── simple-icons-*.js     # generated icon index/paths
public/tech-icons/        # SVGs resolved by slug at runtime
```
