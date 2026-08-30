/**
 * Final frontend capture: clean data, scrolled so every reveal animation has
 * played, at each breakpoint. Replaces the earlier shots that caught stale
 * cached audit content and unrevealed (opacity 0) sections.
 */
const { session } = require('./harness')

const BREAKPOINTS = [
  ['desktop-1440', 1440, 900],
  ['laptop-1024', 1024, 768],
  ['tablet-768', 768, 1024],
  ['mobile-390', 390, 844],
]

/** Scroll top-to-bottom so whileInView reveals fire, then return to top. */
async function revealAll(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.5
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 220))
    }
  })
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1200)
}

session('frontend', async (ctx) => {
  const { page, shot, log, note, URLS } = ctx

  for (const [name, w, h] of BREAKPOINTS) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(URLS.frontend, { waitUntil: 'domcontentloaded', timeout: 150000 })
    await page.waitForSelector('#contact', { timeout: 60000 })
    await page.waitForTimeout(2500)
    await revealAll(page)
    await shot(`final-${name}`)

    const stale = await page.evaluate(() =>
      /Audit |Auditor |PropagationCheck|Reverify /.test(document.body.innerText)
    )
    if (stale) {
      note({
        title: `Stale audit test data still visible at ${name}`,
        area: 'frontend/',
        severity: 'medium',
        detail: 'Records were deleted but the cached page still serves them.',
      })
    }

    const of = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }))
    if (of.s > of.c + 5) {
      note({
        title: `Horizontal overflow at ${name}`,
        area: 'frontend/',
        severity: 'medium',
        detail: `scrollWidth ${of.s} > clientWidth ${of.c}.`,
      })
    }
    log(`${name}: overflow ${of.s}/${of.c}, stale data: ${stale}`)
  }

  // Section-by-section closeups at desktop width.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(URLS.frontend, { waitUntil: 'domcontentloaded', timeout: 150000 })
  await page.waitForSelector('#contact', { timeout: 60000 })
  await page.waitForTimeout(2500)
  await revealAll(page)

  for (const id of ['home', 'about', 'skills', 'projects', 'journey', 'contact']) {
    const el = await page.$(`#${id}`)
    if (!el) continue
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1200)
    await shot(`section-${id}`, { fullPage: false })
  }

  // Case study, warm.
  await page.goto(`${URLS.frontend}/case-study/portfolio-cms`, {
    waitUntil: 'domcontentloaded',
    timeout: 150000,
  })
  await page.waitForTimeout(2500)
  await revealAll(page)
  await shot('case-study-portfolio-cms')

  await page.goto(`${URLS.frontend}/case-study/no-such-project-xyz`, {
    waitUntil: 'domcontentloaded',
    timeout: 150000,
  })
  await page.waitForTimeout(2000)
  await shot('case-study-404')
})
