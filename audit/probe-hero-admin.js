/**
 * Verification for the "Hero fully admin-manageable" feature: rotating role
 * titles, orbiting tech badges, the availability badge and the social links.
 *
 * Each check drives the real admin form, saves, then reloads the public page
 * and asserts on what the browser actually rendered.
 *
 * The public site caches API reads for 60s (REVALIDATE_SECONDS in
 * portfolio-frontend/lib/api.js) and that cache is server-side, keyed on the
 * API URL — so a query string on the page URL does not bust it. Every reload
 * after a save therefore waits out the window rather than trying to dodge it.
 */
const { session, adminLogin, URLS } = require('./harness')

const CACHE_WAIT_MS = 66000

const results = []

function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`  [hero-admin] ${pass ? 'PASS' : 'FAIL'} — ${name}: ${detail}`)
}

/**
 * Load the public homepage showing data saved after the last load.
 *
 * `revalidate: 60` is stale-while-revalidate, not a hard expiry: the first
 * request past the window still serves the STALE page and only schedules the
 * refresh in the background. A single reload after waiting 60s therefore
 * reproducibly asserts against the pre-save HTML. So: wait out the window,
 * then reload until `settled(page)` reports the new data is present, giving
 * the background regeneration the extra passes it needs.
 *
 * `settled` is optional — without it this is one plain post-wait load.
 */
async function reloadPublic(page, log, { wait = true, settled = null, tries = 8 } = {}) {
  if (wait) {
    log(`waiting ${CACHE_WAIT_MS / 1000}s for the 60s ISR window to lapse`)
    await page.waitForTimeout(CACHE_WAIT_MS)
  }

  for (let attempt = 1; attempt <= tries; attempt++) {
    await page.goto(URLS.frontend, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#home', { timeout: 60000 })
    await page.waitForTimeout(1500)

    if (!settled) return true
    if (await settled(page)) {
      log(`public page reflects the new data (load ${attempt})`)
      return true
    }
    log(`load ${attempt} still served stale HTML; revalidating`)
    await page.waitForTimeout(2500)
  }

  log(`public page never reflected the new data after ${tries} loads`)
  return false
}

async function gotoHeroForm(page, log) {
  await page.goto(`${URLS.admin}/admin/hero`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#hero-heading', { timeout: 60000 })
  // The form paints before the GET resolves; roles/badges/social rows only
  // exist after applyHero runs, so wait for the list containers to be present.
  await page.waitForSelector('[data-testid="roles-list"]', { timeout: 60000 })
  await page.waitForTimeout(2000)
  log('hero form ready')
}

async function saveHeroForm(page, log) {
  await page.click('button[type="submit"]')
  // The toast is the only save confirmation the form gives.
  await page.waitForFunction(
    () => /updated|failed/i.test(document.body.innerText),
    { timeout: 45000 },
  )
  const text = await page.evaluate(() => document.body.innerText)
  const ok = /Hero section updated/i.test(text)
  log(`save ${ok ? 'succeeded' : 'FAILED'}`)
  if (!ok) {
    const errs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.text-destructive'))
        .map((n) => n.innerText.trim())
        .filter(Boolean)
        .join(' | '),
    )
    log(`validation errors on page: ${errs || '(none surfaced)'}`)
  }
  await page.waitForTimeout(1500)
  return ok
}

/**
 * Sample the typewriter span over time and return the set of complete role
 * strings it settled on. A role counts as "cycled" when a sample equals it
 * exactly — the typing animation holds the full string for 1.4s before it
 * starts deleting, so a 250ms sampling interval cannot miss it.
 */
async function observeTypewriter(page, expected, log, budgetMs = 46000) {
  const seen = new Set()
  const deadline = Date.now() + budgetMs

  while (Date.now() < deadline) {
    const text = await page
      .locator('[data-testid="typed-role"]')
      .innerText()
      .catch(() => '')
    const trimmed = (text || '').trim()
    if (expected.includes(trimmed)) seen.add(trimmed)
    if (seen.size === expected.length) break
    await page.waitForTimeout(250)
  }

  log(`typewriter cycled: ${JSON.stringify([...seen])}`)
  return [...seen]
}

/** Geometry of the orbit badges, read straight off the DOM. */
async function readOrbit(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[data-testid="orbit-badge"]'))
    return nodes.map((n) => {
      const badge = n.firstElementChild
      const rect = badge ? badge.getBoundingClientRect() : null
      const logo = badge ? badge.querySelector('svg[role="img"], span[role="img"]') : null
      return {
        label: n.getAttribute('data-label'),
        angle: Number(n.getAttribute('data-angle')),
        hasLogo: Boolean(logo),
        logoLabel: logo ? logo.getAttribute('aria-label') : null,
        box: rect
          ? { cx: Math.round(rect.left + rect.width / 2), cy: Math.round(rect.top + rect.height / 2), w: Math.round(rect.width), h: Math.round(rect.height) }
          : null,
      }
    })
  })
}

/** The social anchors rendered in the hero, in DOM order. */
async function readHeroSocials(page) {
  return page.evaluate(() => {
    const home = document.querySelector('#home')
    if (!home) return []
    return Array.from(home.querySelectorAll('a[data-platform]')).map((a) => ({
      platform: a.getAttribute('data-platform'),
      href: a.getAttribute('href'),
      label: a.getAttribute('aria-label'),
      hasIcon: Boolean(a.querySelector('svg, span[role="img"]')),
    }))
  })
}

module.exports = {
  CACHE_WAIT_MS,
  results,
  record,
  reloadPublic,
  gotoHeroForm,
  saveHeroForm,
  observeTypewriter,
  readOrbit,
  readHeroSocials,
  session,
  adminLogin,
  URLS,
}
