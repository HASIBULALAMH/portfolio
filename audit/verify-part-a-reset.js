/**
 * Part A verification — reset buttons on the four singleton admin pages.
 *
 * For each page: fill a known test value, save, reload to prove it persisted,
 * then click Reset -> confirm in the AlertDialog, then reload AGAIN and assert
 * the fields come back blank from the API rather than merely being cleared in
 * the form.
 */
const { chromium } = require('playwright')

const ADMIN = 'http://localhost:3001'
const EMAIL = 'info@hasib.com'
const PASSWORD = '42862266'

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const PAGES = [
  {
    slug: 'settings',
    label: 'Settings',
    probe: '#settings-site-title',
    testValue: 'RESET-TEST-SETTINGS',
    extra: ['#settings-copyright'],
  },
  {
    slug: 'hero',
    label: 'Hero',
    probe: '#hero-heading',
    testValue: 'RESET-TEST-HERO',
    extra: ['#hero-cta-primary-text'],
  },
  {
    slug: 'about',
    label: 'About',
    probe: '#about-bio-1',
    testValue: 'RESET-TEST-ABOUT',
    extra: ['#about-bio-2'],
  },
  {
    slug: 'contact-info',
    label: 'Contact Info',
    probe: '#contact-email',
    testValue: 'reset-test@example.com',
    extra: ['#contact-location'],
  },
]

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  // --- log in -------------------------------------------------------------
  await page.goto(`${ADMIN}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/admin/, { timeout: 30000 })
  record('Admin login', true, 'reached /admin')

  for (const cfg of PAGES) {
    const url = `${ADMIN}/admin/${cfg.slug}`

    // --- seed a known value and save ------------------------------------
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForSelector(cfg.probe, { timeout: 30000 })

    await page.fill(cfg.probe, cfg.testValue)
    for (const sel of cfg.extra) {
      if (await page.locator(sel).count()) await page.fill(sel, 'filled-before-reset')
    }
    await page.click('button[type="submit"]')
    await page.waitForTimeout(1500)

    // --- reload: did the save persist? ----------------------------------
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector(cfg.probe, { timeout: 30000 })
    const afterSave = await page.inputValue(cfg.probe)
    record(
      `${cfg.label}: test value persisted before reset`,
      afterSave === cfg.testValue,
      `field = ${JSON.stringify(afterSave)}`,
    )

    // --- the Reset button exists and is distinct from Save ---------------
    const resetBtn = page.getByRole('button', { name: /Reset All Fields/i })
    const hasReset = (await resetBtn.count()) > 0
    record(`${cfg.label}: Reset button present`, hasReset)
    if (!hasReset) continue

    // --- click Reset -> confirmation dialog appears ----------------------
    await resetBtn.click()
    const dialog = page.locator('[role="alertdialog"]')
    await dialog.waitFor({ state: 'visible', timeout: 10000 })
    const dialogText = await dialog.innerText()
    record(
      `${cfg.label}: AlertDialog confirmation shown`,
      /cannot be undone/i.test(dialogText),
      dialogText.replace(/\s+/g, ' ').slice(0, 90),
    )

    // --- confirm ---------------------------------------------------------
    await dialog.getByRole('button', { name: /^Reset$/ }).click()
    await page.waitForTimeout(2000)

    // --- success toast ---------------------------------------------------
    const bodyText = await page.locator('body').innerText()
    record(
      `${cfg.label}: success toast shown`,
      /reset successfully/i.test(bodyText),
      (bodyText.match(/[^\n]*reset successfully[^\n]*/i) || [''])[0].trim(),
    )

    // --- reload: is the blank state actually PERSISTED? ------------------
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector(cfg.probe, { timeout: 30000 })
    const afterReset = await page.inputValue(cfg.probe)
    record(
      `${cfg.label}: fields blank after reload (persisted)`,
      afterReset === '',
      `field = ${JSON.stringify(afterReset)}`,
    )
  }

  record('No uncaught page errors in admin', pageErrors.length === 0, pageErrors.join(' | ') || 'none')

  await browser.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  require('fs').writeFileSync('/tmp/partA-results.json', JSON.stringify(results, null, 2))
  process.exit(failed.length ? 1 : 0)
})()
