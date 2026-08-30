# Portfolio CMS — Admin Panel

Next.js admin panel for the portfolio. It is a pure client of the Laravel API in
`portfolio-backend` and owns no data of its own.

**Runs on port 3001.** This app and `portfolio-frontend` are both Next.js and
would each default to 3000, so this one must be started with `-p 3001` — that is
the port `ADMIN_URL` and `SANCTUM_STATEFUL_DOMAINS` in the backend `.env`
expect. See `../project-run.md` for the full three-service startup.

## Quick start

```bash
npm install
npm run dev -- -p 3001        # http://localhost:3001
```

`.env.local` needs one variable, and it must include the `/api` suffix because
`lib/api.js` appends paths like `/login` to it:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

Sign in at `http://localhost:3001/login` with the seeded admin account — see
`../portfolio-backend/BACKEND-SETUP.md`. There are no demo credentials. Visiting
`/` redirects to `/login` or `/admin/dashboard` depending on whether a token is
in localStorage.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS v4, React Hook Form + Zod,
Axios, Sanctum bearer-token auth, file uploads to Cloudflare R2 through the
backend's `POST /admin/upload`.

## Modules

Thirteen pages, each reachable from the sidebar: Dashboard, Site Settings
(General, Sections), Hero, About, Skills, Timeline, Projects, API Showcase,
Testimonials, and Contact (Info, Messages, Meeting Requests).

Section visibility and ordering live under Site Settings → Sections. That
replaced the old Header Navigation module: every nav item pointed at a homepage
section, so keeping both meant two places to edit and no guarantee they agreed.

## Layout

```
app/
├── (auth)/login/       # sign-in; outside the admin shell
├── admin/
│   ├── layout.jsx      # auth gate + Sidebar/Header shell + providers
│   └── <module>/       # one page per module
└── layout.jsx          # title/favicon from Site Settings
components/
├── admin/              # Sidebar, Header, FileUpload, TechIcon(+Picker),
│                       # EmptyState, Skeleton
└── ui/                 # button, card, input, textarea, dialog,
                        # alert-dialog, toast
lib/
├── api.js              # Axios wrapper; returns {success, data, message, errorType}
├── settings.js         # client SettingsProvider/useSettings
├── settings-server.js  # server-side fetch for generateMetadata
├── settings-fallback.js
├── tech-icons.js       # simple-icons lookup
└── validation.js       # Zod schemas
```

## Conventions

**Forms** use React Hook Form with a Zod resolver from `lib/validation.js`, and
report outcomes through the shared toast:

```jsx
const onSubmit = async (data) => {
  const result = await apiCall('PUT', '/admin/hero', data)
  showToast(result.success ? 'Saved' : result.message, result.success ? 'success' : 'error')
}
```

**Toasts** come from `useToast()`. Under the admin shell it resolves to the
shared `ToastProvider` queue; the login page is outside that shell, so it
renders its own `<ToastContainer>`.

**Errors** are surfaced to the user via toast. Use `console.error` for the
underlying exception — never `console.log`.

## Troubleshooting

- **401 → redirected to login.** The token is expired or invalid. The shell
  retries `/admin/me` up to 3 times on transient network/server failures only;
  a 401 is definitive and is not retried.
- **CORS errors.** The backend's `FRONTEND_URL`/`ADMIN_URL` must list
  `http://localhost:3001` for this app.
- **Uploads fail.** Check the backend's `R2_*` variables. While they are blank
  the backend falls back to its local `public` disk, so uploads still work in
  development.
- **Token check:** `localStorage.getItem('auth_token')`.
