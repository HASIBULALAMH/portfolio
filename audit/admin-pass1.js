/**
 * Admin audit, pass 1: login + visit every page read-only.
 *
 * Deliberately no writes here. The point is to find pages that fail to load or
 * fire failing API calls before any CRUD test muddies the data.
 */
const { session, adminLogin } = require('./harness')

const PAGES = [
  ['dashboard', '/admin/dashboard', 'Dashboard'],
  ['settings', '/admin/settings', 'Site Settings'],
  ['settings-nav', '/admin/settings/nav', 'Navigation Items'],
  ['hero', '/admin/hero', 'Hero Section'],
  ['about', '/admin/about', 'About Section'],
  ['skills', '/admin/skills', 'Skills'],
  ['timeline', '/admin/timeline', 'Timeline'],
  ['projects', '/admin/projects', 'Projects'],
  ['api-showcase', '/admin/api-showcase', 'API Showcase'],
  ['testimonials', '/admin/testimonials', 'Testimonials'],
  ['contact-info', '/admin/contact-info', 'Contact Information'],
  ['messages', '/admin/messages', 'Contact Messages'],
  ['meeting-requests', '/admin/meeting-requests', 'Meeting Requests'],
]

session('admin', async (ctx) => {
  const { page, shot, log, note, URLS, CREDS } = ctx

  // --- Login page, including a deliberate bad-credential check -------------
  await page.goto(`${URLS.admin}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 30000 })
  await shot('login-page')

  await page.fill('#email', 'wrong@example.com')
  await page.fill('#password', 'definitelywrong')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2500)
  const bodyAfterBad = await page.textContent('body')
  await shot('login-invalid-credentials')
  if (!/invalid|failed|incorrect|credential|wrong/i.test(bodyAfterBad)) {
    note({
      title: 'Invalid login shows no visible error message',
      area: 'admin/login',
      severity: 'medium',
      detail: 'Submitting bad credentials produced no user-visible error text.',
    })
  }
  if (page.url().includes('/admin/')) {
    note({
      title: 'Invalid credentials still granted access',
      area: 'admin/login',
      severity: 'critical',
      detail: `URL after bad login: ${page.url()}`,
    })
  }

  // --- Real login ---------------------------------------------------------
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 30000 })
  await page.fill('#email', CREDS.email)
  await page.fill('#password', CREDS.password)
  await page.click('button[type="submit"]')
  try {
    await page.waitForURL('**/admin/dashboard', { timeout: 30000 })
  } catch {
    note({
      title: 'Login did not redirect to dashboard',
      area: 'admin/login',
      severity: 'critical',
      detail: `Still at ${page.url()} after valid login.`,
    })
    await shot('login-redirect-failed')
    return
  }
  log('logged in OK')

  // --- Walk every admin page ---------------------------------------------
  for (const [slug, path, expectHeading] of PAGES) {
    log(`visiting ${path}`)
    await page.goto(`${URLS.admin}${path}`, { waitUntil: 'domcontentloaded' })

    // Wait for the auth gate to resolve and content to render.
    try {
      await page.waitForFunction(
        () => !document.body.innerText.trim().startsWith('Loading...'),
        { timeout: 30000 }
      )
    } catch {
      note({
        title: `Page stuck on "Loading..." — ${path}`,
        area: `admin${path}`,
        severity: 'high',
        detail: 'Auth gate or data fetch never resolved within 30s.',
      })
    }
    await page.waitForTimeout(1800)

    const text = await page.textContent('body')

    if (!text.includes(expectHeading)) {
      note({
        title: `Expected heading "${expectHeading}" missing on ${path}`,
        area: `admin${path}`,
        severity: 'high',
        detail: `Body did not contain "${expectHeading}". First 300 chars: ${text.trim().slice(0, 300)}`,
      })
    }

    // Next.js dev error overlay / thrown render errors.
    if (/Unhandled Runtime Error|Application error: a client-side exception/i.test(text)) {
      note({
        title: `Runtime error rendered on ${path}`,
        area: `admin${path}`,
        severity: 'critical',
        detail: text.trim().slice(0, 500),
      })
    }

    // Error empty-states the pages render when a GET fails.
    const failedToLoad = text.match(/Couldn't load [a-z ]+|Failed to load [a-z ]+/i)
    if (failedToLoad) {
      note({
        title: `Data load failed on ${path}: "${failedToLoad[0]}"`,
        area: `admin${path}`,
        severity: 'high',
        detail: 'Page rendered its load-error state instead of data.',
      })
    }

    await shot(`page-${slug}`)
  }

  // --- Sidebar link integrity --------------------------------------------
  await page.goto(`${URLS.admin}/admin/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const hrefs = await page.$$eval('a[href^="/"]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))])
  log(`sidebar/internal links: ${hrefs.join(', ')}`)
  const known = PAGES.map(([, p]) => p).concat(['/admin', '/login', '/'])
  for (const href of hrefs) {
    if (!known.includes(href)) {
      note({
        title: `Admin links to unknown route ${href}`,
        area: 'admin/navigation',
        severity: 'medium',
        detail: `No page.jsx corresponds to ${href}; likely a 404.`,
      })
    }
  }
})
