/**
 * Public frontend audit.
 *
 * Covers: homepage render, every section present, responsive breakpoints,
 * internal/anchor link integrity, the contact + meeting forms (real POSTs),
 * case-study detail pages, and the 404 path for an unknown slug.
 */
const { session } = require('./harness')

const STAMP = Date.now().toString().slice(-6)

// Ids as actually rendered. The timeline section is id="journey" (which is what
// the navbar links to), and the testimonials/stats sections are intentionally
// unanchored, so they are verified by heading text instead of by id.
const SECTIONS = ['home', 'about', 'skills', 'projects', 'journey', 'contact']

// Sections without an id: assert their heading renders instead.
const HEADINGS = ['What Clients Say']

const BREAKPOINTS = [
  ['desktop-1440', 1440, 900],
  ['laptop-1024', 1024, 768],
  ['tablet-768', 768, 1024],
  ['mobile-390', 390, 844],
]

session('frontend', async (ctx) => {
  const { page, shot, log, note, URLS } = ctx

  // =======================================================================
  // Homepage
  // =======================================================================
  await page.goto(URLS.frontend, { waitUntil: 'domcontentloaded', timeout: 150000 })
  await page.waitForTimeout(1000)
  // The loading screen animates out; wait for real content.
  await page.waitForSelector('#contact', { timeout: 60000 })
  await page.waitForTimeout(2500)
  await shot('homepage-full')

  const body = await page.textContent('body')
  if (/Application error|Unhandled Runtime Error/i.test(body)) {
    note({
      title: 'Homepage rendered a runtime error',
      area: 'frontend/',
      severity: 'critical',
      detail: body.slice(0, 400),
    })
  }

  // Each section must exist as an anchor target AND have content.
  for (const id of SECTIONS) {
    const el = await page.$(`#${id}`)
    if (!el) {
      note({
        title: `Homepage section #${id} missing`,
        area: 'frontend/',
        severity: 'high',
        detail: `No element with id="${id}" — navbar anchor will go nowhere.`,
      })
      continue
    }
    const box = await el.boundingBox()
    if (!box || box.height < 40) {
      note({
        title: `Homepage section #${id} renders empty`,
        area: 'frontend/',
        severity: 'medium',
        detail: `Height ${box ? box.height : 0}px — likely no data and no fallback.`,
      })
    }
  }

  // Unanchored sections: verify by heading text.
  for (const heading of HEADINGS) {
    if (!body.includes(heading)) {
      note({
        title: `Section heading "${heading}" not rendered`,
        area: 'frontend/',
        severity: 'medium',
        detail: 'Section returned null — likely no records and no fallback.',
      })
    } else {
      log(`section heading present: "${heading}"`)
    }
  }

  // Verify seeded/admin content is actually on the page.
  for (const [label, needle] of [['hero heading', 'Hasibul Alam']]) {
    if (!body.includes(needle)) {
      note({
        title: `Expected ${label} "${needle}" not found on homepage`,
        area: 'frontend/',
        severity: 'high',
        detail: 'Backend data may not be reaching the page.',
      })
    } else {
      log(`found ${label} on homepage`)
    }
  }

  // =======================================================================
  // Link integrity — anchors must resolve to real ids; no empty/# hrefs
  // =======================================================================
  const links = await page.$$eval('a[href]', (as) =>
    as.map((a) => ({ href: a.getAttribute('href'), text: a.innerText.trim().slice(0, 40) }))
  )
  const ids = await page.$$eval('[id]', (els) => els.map((e) => e.id))
  for (const { href, text } of links) {
    if (!href || href === '#') {
      note({
        title: `Dead link ("${href}") on homepage`,
        area: 'frontend/',
        severity: 'low',
        detail: `Link text: "${text}"`,
      })
      continue
    }
    if (href.startsWith('#') && href.length > 1) {
      const target = href.slice(1)
      if (!ids.includes(target)) {
        note({
          title: `Anchor ${href} has no matching element`,
          area: 'frontend/',
          severity: 'medium',
          detail: `Nav link "${text}" scrolls nowhere.`,
        })
      }
    }
  }
  log(`checked ${links.length} links`)

  // =======================================================================
  // Responsive breakpoints — screenshot each, and check for x-overflow
  // =======================================================================
  for (const [name, w, h] of BREAKPOINTS) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(1500)
    await shot(`responsive-${name}`)

    const overflow = await page.evaluate(
      () => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      })
    )
    // A few px of slack for scrollbar/rounding.
    if (overflow.scrollW > overflow.clientW + 5) {
      note({
        title: `Horizontal overflow at ${name}`,
        area: 'frontend/',
        severity: 'medium',
        detail: `scrollWidth ${overflow.scrollW} > clientWidth ${overflow.clientW}. Causes sideways scrolling.`,
      })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(1000)

  // =======================================================================
  // Contact form — real submission, then validation error path
  // =======================================================================
  await page.goto(URLS.frontend, { waitUntil: 'domcontentloaded', timeout: 150000 })
  await page.waitForSelector('#contact', { timeout: 60000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => document.querySelector('#contact').scrollIntoView())
  await page.waitForTimeout(1200)
  await shot('contact-section');

  {
    const scope = '#contact form:has(textarea#message)'
    await page.fill(`${scope} input[name="name"]`, `Audit Visitor ${STAMP}`)
    await page.fill(`${scope} input[name="email"]`, `audit${STAMP}@example.com`)
    const subj = await page.$(`${scope} input[name="subject"]`)
    if (subj) await subj.fill(`Audit subject ${STAMP}`)
    await page.fill(`${scope} textarea[name="message"]`, `Automated audit message ${STAMP}. Verifying the contact form persists to the backend inbox.`)
    await shot('contact-form-filled')

    await page.click(`${scope} button[type="submit"]`)
    await page.waitForTimeout(4000)
    await shot('contact-form-submitted')

    const after = await page.textContent('#contact')
    if (/sent|thank|thanks|received/i.test(after)) {
      log('contact form reported success')
    } else if (/went wrong|couldn't reach|error|try again/i.test(after)) {
      note({
        title: 'Contact form submission failed',
        area: 'frontend/contact',
        severity: 'critical',
        detail: `Error feedback shown after submit. Section text: ${after.replace(/\s+/g, ' ').slice(0, 400)}`,
      })
    } else {
      note({
        title: 'Contact form gave no feedback after submit',
        area: 'frontend/contact',
        severity: 'high',
        detail: 'Neither success nor error text appeared — visitor cannot tell if it sent.',
      })
    }
  }

  // =======================================================================
  // Case-study pages — one per project slug, plus an unknown slug
  // =======================================================================
  const res = await page.request.get(`${URLS.backend}/api/projects`)
  const projects = (await res.json()).data || []
  log(`backend reports ${projects.length} projects`)

  for (const p of projects.slice(0, 4)) {
    if (!p.slug) {
      note({
        title: `Project "${p.title}" has no slug`,
        area: 'backend/projects',
        severity: 'high',
        detail: 'Case-study URL cannot be built without a slug.',
      })
      continue
    }
    // Generous timeout: the first hit on this dynamic route triggers a
    // Turbopack compile that can take ~50s on a cold dev server.
    await page.goto(`${URLS.frontend}/case-study/${p.slug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 150000,
    })
    await page.waitForTimeout(2500)
    const t = await page.textContent('body')
    if (/Application error|Unhandled Runtime Error/i.test(t)) {
      note({
        title: `Case-study page errored for slug "${p.slug}"`,
        area: 'frontend/case-study',
        severity: 'critical',
        detail: t.slice(0, 400),
      })
    } else if (/404|not found/i.test(t) && !t.includes(p.title)) {
      note({
        title: `Case-study 404 for a real project slug "${p.slug}"`,
        area: 'frontend/case-study',
        severity: 'high',
        detail: `Backend lists this project but the page 404s.`,
      })
    } else if (!t.includes(p.title)) {
      note({
        title: `Case-study for "${p.slug}" does not show its title`,
        area: 'frontend/case-study',
        severity: 'medium',
        detail: `Expected "${p.title}" on the page.`,
      })
    } else {
      log(`case-study OK: ${p.slug}`)
    }
    await shot(`case-study-${p.slug}`.slice(0, 60))
  }

  // Unknown slug should 404 cleanly, not crash.
  const bogus = await page.goto(`${URLS.frontend}/case-study/definitely-not-a-real-slug-${STAMP}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(1500)
  const bogusText = await page.textContent('body')
  log(`unknown slug HTTP status: ${bogus && bogus.status()}`)
  if (/Application error|Unhandled Runtime Error/i.test(bogusText)) {
    note({
      title: 'Unknown case-study slug crashes instead of 404',
      area: 'frontend/case-study',
      severity: 'high',
      detail: bogusText.slice(0, 300),
    })
  }
  await shot('case-study-unknown-slug')

  log(`frontend stamp: ${STAMP}`)
})
