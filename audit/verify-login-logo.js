/**
 * Verifies the admin login page renders the real uploaded logo from Site
 * Settings, in a FRESH (logged-out) browser context.
 *
 * The point of the fresh context is that `GET /settings` is public: if the fix
 * accidentally depended on an auth token in localStorage, a logged-out visitor
 * would silently fall back to the text wordmark and the bug would look fixed
 * only for someone already signed in. So this asserts with storage cleared.
 *
 * Also re-checks that real login still round-trips after the cleanup pass.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ADMIN = process.env.ADMIN_URL || 'http://localhost:3001'
const API = process.env.API_URL || 'http://127.0.0.1:8000/api'
const EMAIL = process.env.ADMIN_EMAIL || 'info@hasib.com'
const PASSWORD = process.env.ADMIN_PASSWORD || '42862266'
const OUT = path.join(__dirname, 'logs')
const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'admin-login-logo')

;(async () => {
  const res = await fetch(`${API}/settings`)
  const expected = (await res.json()).data
  const browser = await chromium.launch()
  const results = {}
  fs.mkdirSync(SHOTS, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })

  // ---- 1. logged-out login page shows the uploaded logo -------------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' })
  // Prove nothing is authenticated.
  const storage = await page.evaluate(() => ({
    token: localStorage.getItem('auth_token'),
    user: localStorage.getItem('admin_user'),
  }))
  await page.waitForTimeout(1200) // settings fetch + image decode

  const brand = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    const img = h1?.querySelector('img')
    const r = img?.getBoundingClientRect()
    return {
      h1Text: h1?.textContent?.trim() ?? null,
      hasImg: !!img,
      src: img?.getAttribute('src') ?? null,
      currentSrc: img?.currentSrc ?? null,
      alt: img?.getAttribute('alt') ?? null,
      naturalWidth: img?.naturalWidth ?? 0,
      naturalHeight: img?.naturalHeight ?? 0,
      box: r ? { w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null,
      complete: img?.complete ?? false,
    }
  })
  await page.screenshot({ path: path.join(SHOTS, 'login-logged-out.png') })

  results.loggedOutLogo = {
    storageWasEmpty: !storage.token && !storage.user,
    expectedLogoPath: expected.logo_path,
    ...brand,
    // naturalWidth > 0 proves the bitmap actually decoded, not just that a
    // matching <img> tag exists in the DOM.
    pass:
      brand.hasImg &&
      brand.complete &&
      brand.naturalWidth > 0 &&
      !!expected.logo_path &&
      (brand.src === expected.logo_path || brand.currentSrc === expected.logo_path),
    consoleErrors: [...consoleErrors],
  }

  // ---- 2. real login still round-trips ------------------------------------
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASSWORD)
  await Promise.all([
    page.waitForURL(/\/admin\/dashboard/, { timeout: 20000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(2500)

  const after = await page.evaluate(() => ({
    url: location.pathname,
    hasToken: !!localStorage.getItem('auth_token'),
    sidebarImg: !!document.querySelector('aside img, nav img, h1 img'),
    bodyText: document.body.innerText.slice(0, 120),
  }))
  await page.screenshot({ path: path.join(SHOTS, 'after-login.png') })
  results.loginRoundTrip = {
    ...after,
    pass: after.url.includes('/admin/dashboard') && after.hasToken,
  }

  // ---- 3. fallback path: wordmark when settings has no logo ---------------
  // Route-intercept the settings call so this does not mutate real data.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page2 = await ctx2.newPage()
  await page2.route('**/api/settings', async (route) => {
    const r = await route.fetch()
    const body = await r.json()
    body.data = { ...body.data, logo_path: null }
    await route.fulfill({ response: r, body: JSON.stringify(body) })
  })
  await page2.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' })
  await page2.waitForTimeout(1000)
  const fb = await page2.evaluate(() => {
    const h1 = document.querySelector('h1')
    return {
      text: h1?.textContent?.replace(/\s+/g, '') ?? null,
      hasImg: !!h1?.querySelector('img'),
    }
  })
  await page2.screenshot({ path: path.join(SHOTS, 'login-fallback-wordmark.png') })
  results.fallbackWordmark = {
    ...fb,
    pass: !fb.hasImg && !!fb.text && fb.text.includes('['),
  }

  fs.writeFileSync(path.join(OUT, 'admin-login-logo.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
  await browser.close()
})()
