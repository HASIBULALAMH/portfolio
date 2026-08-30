/**
 * Verification for the section-visibility feature.
 *
 * Drives the real admin UI in a real browser and reads the real public site
 * between each change — no direct API writes, because the point is to prove the
 * admin toggle is what moves the public page.
 *
 * The public site caches API reads for 60s (REVALIDATE_SECONDS in
 * portfolio-frontend/lib/api.js), and that cache is server-side, so a
 * cache-busting query string will not defeat it. Rather than sleeping a fixed
 * interval, each public read polls until the page reflects the change — see
 * waitForPublic for why a fixed sleep is unreliable here.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ADMIN = 'http://localhost:3001'
const PUBLIC = 'http://localhost:3000'
const CREDS = { email: 'info@hasib.com', password: '42862266' }
const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'section-visibility')

/**
 * Next serves the public page with `revalidate: 60` and stale-while-revalidate
 * semantics: the first request after expiry still returns the OLD html and only
 * schedules the rebuild, so the change shows up on a later request. Sleeping a
 * fixed 63s therefore lands on the stale response about as often as not.
 *
 * So poll until the page reports what we are waiting for, and only fail after
 * the budget runs out. `expect` receives the same shape readPublic returns.
 */
async function waitForPublic(page, label, expect, { budgetMs = 180000 } = {}) {
  const start = Date.now()
  let last = null

  while (Date.now() - start < budgetMs) {
    last = await readPublic(page, label, { screenshot: false })
    if (expect(last)) {
      console.log(`  (public page caught up after ${Math.round((Date.now() - start) / 1000)}s)`)
      await shot(page, label)
      return last
    }
    await page.waitForTimeout(5000)
  }

  console.log(`  (public page never caught up within ${budgetMs / 1000}s)`)
  await shot(page, `${label}-TIMEOUT`)
  return last
}

const results = []
let shotIndex = 0

function record(name, passed, detail) {
  results.push({ name, passed, detail })
  console.log(`\n${passed ? 'PASS' : 'FAIL'} — ${name}\n  ${detail}`)
}

async function shot(page, label) {
  fs.mkdirSync(SHOTS, { recursive: true })
  const file = path.join(SHOTS, `${String(++shotIndex).padStart(2, '0')}-${label}.png`)
  await page.screenshot({ path: file, fullPage: false })
}

/** Read what the public homepage actually renders right now. */
async function readPublic(page, label, { screenshot = true } = {}) {
  await page.goto(PUBLIC, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('nav', { timeout: 60000 })
  await page.waitForTimeout(1200)
  if (screenshot) await shot(page, label)

  return page.evaluate(() => {
    const nav = document.querySelector('header nav')
    const navLinks = [...(nav?.querySelectorAll('ul a') || [])]
      .map((a) => ({ label: a.textContent.trim(), href: a.getAttribute('href') }))
      .filter((l) => l.href?.startsWith('#'))

    const sectionIds = [...document.querySelectorAll('section')]
      .map((s) => s.id)
      .filter(Boolean)

    // A nav anchor with no matching element is the dangling-link failure.
    const dangling = navLinks
      .map((l) => l.href.slice(1))
      .filter((id) => !document.getElementById(id))

    return {
      navLinks,
      navOrder: navLinks.map((l) => l.href),
      sectionIds,
      dangling,
      bodyText: document.body.innerText.replace(/\s+/g, ' '),
    }
  })
}

async function login(page) {
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.fill('input[type="email"]', CREDS.email)
  await page.fill('input[type="password"]', CREDS.password)
  await page.click('button[type="submit"]')

  // Wait for the token rather than a URL shape: the post-login redirect target
  // has moved before, and a stored token is the thing the next step needs.
  await page.waitForFunction(() => Boolean(localStorage.getItem('auth_token')), {
    timeout: 60000,
  })
  await page.waitForTimeout(1000)
}

async function openSectionsPage(page) {
  await page.goto(`${ADMIN}/admin/settings/sections`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  // Wait for the list to populate rather than a fixed sleep.
  await page.waitForFunction(
    () => document.querySelectorAll('input[type="checkbox"]').length >= 8,
    { timeout: 60000 },
  )
  await page.waitForTimeout(500)
}

/**
 * A section's visibility toggle, addressed by its accessible name. Matching on
 * aria-label rather than a container class means the row markup can change
 * without breaking this, and it doubles as a check that the labels exist.
 */
function toggleFor(page, label) {
  return page.getByLabel(new RegExp(`^(Hide|Show) the ${label} section$`))
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const admin = await context.newPage()
  const site = await context.newPage()

  const consoleErrors = []
  for (const p of [admin, site]) {
    p.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(`${p.url()}: ${m.text().slice(0, 200)}`)
    })
    p.on('pageerror', (e) => consoleErrors.push(`${p.url()}: ${String(e).slice(0, 200)}`))
  }

  try {
    // ---------------------------------------------------------------------
    // Check 1 — API Showcase and Testimonials render with real admin data
    // ---------------------------------------------------------------------
    // All sections start visible (the harness resets them beforehand), so wait
    // for the page to actually reflect that before asserting on it — a leftover
    // cached render from a previous run would otherwise fail this spuriously.
    const initial = await waitForPublic(
      site,
      'initial-all-sections',
      (r) => r.sectionIds.includes('apis') && r.sectionIds.includes('testimonials'),
    )

    const hasApis = initial.sectionIds.includes('apis')
    const hasTestimonials = initial.sectionIds.includes('testimonials')
    const showsApiContent = /REST API Design/i.test(initial.bodyText)
    const showsQuote = /Farhana Rahman|Ledgerly/i.test(initial.bodyText)

    record(
      '1. API Showcase + Testimonials render on the homepage with real data',
      hasApis && hasTestimonials && showsApiContent && showsQuote,
      `#apis present=${hasApis}, #testimonials present=${hasTestimonials}, ` +
        `showcase copy "REST API Design" found=${showsApiContent}, ` +
        `testimonial author "Farhana Rahman" found=${showsQuote}. ` +
        `Sections in DOM: [${initial.sectionIds.join(', ')}]`,
    )

    // ---------------------------------------------------------------------
    // Check 2 — toggle Testimonials OFF; section AND nav link both disappear
    // ---------------------------------------------------------------------
    await login(admin)
    await openSectionsPage(admin)
    await shot(admin, 'admin-sections-page')

    await toggleFor(admin, 'Testimonials').click({ force: true })
    await admin.waitForTimeout(2500)
    await shot(admin, 'admin-testimonials-off')

    const afterOff = await waitForPublic(
      site,
      'public-testimonials-off',
      (r) => !r.sectionIds.includes('testimonials'),
    )

    const sectionGone = !afterOff.sectionIds.includes('testimonials')
    const navGone = !afterOff.navOrder.includes('#testimonials')
    const quoteGone = !/Farhana Rahman/i.test(afterOff.bodyText)

    record(
      '2. Toggling Testimonials OFF removes the section AND its nav link',
      sectionGone && navGone && quoteGone && afterOff.dangling.length === 0,
      `section removed=${sectionGone}, nav link removed=${navGone}, ` +
        `quote text gone=${quoteGone}, dangling anchors=[${afterOff.dangling.join(', ') || 'none'}]. ` +
        `Nav now: [${afterOff.navOrder.join(', ')}]`,
    )

    // ---------------------------------------------------------------------
    // Check 3 — toggle it back ON; both return
    // ---------------------------------------------------------------------
    await openSectionsPage(admin)
    await toggleFor(admin, 'Testimonials').click({ force: true })
    await admin.waitForTimeout(2500)

    const afterOn = await waitForPublic(
      site,
      'public-testimonials-on',
      (r) => r.sectionIds.includes('testimonials'),
    )

    record(
      '3. Toggling Testimonials back ON restores the section AND its nav link',
      afterOn.sectionIds.includes('testimonials') &&
        afterOn.navOrder.includes('#testimonials') &&
        /Farhana Rahman/i.test(afterOn.bodyText),
      `section restored=${afterOn.sectionIds.includes('testimonials')}, ` +
        `nav link restored=${afterOn.navOrder.includes('#testimonials')}, ` +
        `quote text back=${/Farhana Rahman/i.test(afterOn.bodyText)}. ` +
        `Nav now: [${afterOn.navOrder.join(', ')}]`,
    )

    // ---------------------------------------------------------------------
    // Check 4 — reorder APIs above Projects; page AND nav order both follow
    // ---------------------------------------------------------------------
    const beforeOrder = afterOn.navOrder
    const beforeSections = afterOn.sectionIds

    await openSectionsPage(admin)
    // APIs sits directly below Projects, so one "up" swaps them.
    await admin.getByLabel('Move APIs up').click()
    await admin.waitForTimeout(2500)
    await shot(admin, 'admin-apis-moved-up')

    const afterReorder = await waitForPublic(
      site,
      'public-apis-above-projects',
      (r) => r.sectionIds.indexOf('apis') < r.sectionIds.indexOf('projects'),
    )

    const navApis = afterReorder.navOrder.indexOf('#apis')
    const navProjects = afterReorder.navOrder.indexOf('#projects')
    const secApis = afterReorder.sectionIds.indexOf('apis')
    const secProjects = afterReorder.sectionIds.indexOf('projects')

    record(
      '4. Reordering APIs above Projects moves BOTH the section and the nav link',
      navApis < navProjects && secApis < secProjects,
      `nav order before: [${beforeOrder.join(', ')}]\n  ` +
        `nav order after:  [${afterReorder.navOrder.join(', ')}]  (#apis idx ${navApis} < #projects idx ${navProjects} = ${navApis < navProjects})\n  ` +
        `section order before: [${beforeSections.join(', ')}]\n  ` +
        `section order after:  [${afterReorder.sectionIds.join(', ')}]  (apis idx ${secApis} < projects idx ${secProjects} = ${secApis < secProjects})`,
    )

    // Put it back so the site is left as it was found.
    await openSectionsPage(admin)
    await admin.getByLabel('Move APIs down').click()
    await admin.waitForTimeout(2500)
    await waitForPublic(
      site,
      'public-order-restored',
      (r) => r.sectionIds.indexOf('projects') < r.sectionIds.indexOf('apis'),
    )

    // ---------------------------------------------------------------------
    // Check 5 — Hero is locked in the UI and refused by the API
    // ---------------------------------------------------------------------
    await openSectionsPage(admin)
    const heroToggle = toggleFor(admin, 'Home')

    const heroDisabled = await heroToggle.isDisabled()
    const heroChecked = await heroToggle.isChecked()
    const heroNote = await admin
      .locator('div.border.border-border.rounded-lg')
      .filter({ has: admin.getByLabel(/the Home section$/) })
      .first()
      .innerText()
      .then((t) => t.replace(/\s+/g, ' '))

    // The UI disables it; confirm the API refuses it too, since a disabled
    // input is a suggestion and not an enforcement boundary.
    const apiRefusal = await admin.evaluate(async () => {
      const token = localStorage.getItem('auth_token')
      const list = await fetch('http://127.0.0.1:8000/api/admin/section-visibility', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      }).then((r) => r.json())

      const payload = list.data.map((s) => ({
        id: s.id,
        is_visible: s.section_key === 'hero' ? false : s.is_visible,
        order: s.order,
      }))

      const res = await fetch('http://127.0.0.1:8000/api/admin/section-visibility', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ sections: payload }),
      })

      return { status: res.status, body: (await res.text()).slice(0, 300) }
    })

    const stillVisible = await fetch(`http://127.0.0.1:8000/api/section-visibility`)
      .then((r) => r.json())
      .then((j) => j.data.find((s) => s.section_key === 'hero').is_visible)

    record(
      '5. Hero is locked: disabled in the admin UI and rejected by the API',
      heroDisabled && heroChecked && apiRefusal.status === 422 && stillVisible === true,
      `admin toggle disabled=${heroDisabled}, shown as visible=${heroChecked}, ` +
        `row note: "${heroNote}"\n  ` +
        `hand-crafted API attempt to hide Hero returned HTTP ${apiRefusal.status} ` +
        `(expected 422): ${apiRefusal.body}\n  ` +
        `hero still visible in DB afterwards=${stillVisible}`,
    )
  } catch (error) {
    record('harness', false, `Threw before finishing: ${error.message}\n${error.stack}`)
  }

  console.log('\n\n================ SUMMARY ================')
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`)
  console.log(`\nconsole/page errors captured: ${consoleErrors.length}`)
  for (const e of consoleErrors.slice(0, 10)) console.log(`  ${e}`)

  fs.writeFileSync(
    path.join(__dirname, 'logs', 'section-visibility.json'),
    JSON.stringify({ results, consoleErrors }, null, 2),
  )

  await browser.close()
  process.exit(results.every((r) => r.passed) ? 0 : 1)
})()
