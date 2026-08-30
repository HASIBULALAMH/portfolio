/**
 * Does the back/forward wedge survive a production build?
 *
 * In dev the shell sat on "Loading..." indefinitely after goBack, with the RSC
 * flight payload present in the HTML but `window.__next_f` empty — i.e. React
 * never hydrated. Turbopack's dev runtime is a plausible culprit, so this runs
 * the identical sequence against `next start` on :3005.
 *
 * A pass here means the user-visible bug is dev-only; a fail means it ships.
 */
const { chromium } = require('playwright')

const ADMIN = process.env.ADMIN_URL || 'http://localhost:3005'
const CREDS = { email: 'info@hasib.com', password: '42862266' }
const log = (m) => console.log(`  [prod-nav] ${m}`)

const state = (page) =>
  page.evaluate(() => {
    const m = document.querySelector('main')
    return {
      hasMain: !!m,
      mainTextLen: m ? m.innerText.trim().length : 0,
      body: document.body.innerText.trim().slice(0, 40),
      nextFLen: (window.__next_f || []).length,
      url: location.pathname,
    }
  })

async function waitForContent(page, label, budget = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < budget) {
    const s = await state(page)
    if (s.hasMain && s.mainTextLen > 80) {
      log(`${label}: OK in ${Date.now() - t0}ms (nextFLen=${s.nextFLen})`)
      return { ok: true, ms: Date.now() - t0, s }
    }
    await page.waitForTimeout(500)
  }
  const s = await state(page)
  log(`${label}: FAILED after ${budget}ms -> ${JSON.stringify(s)}`)
  return { ok: false, s }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const failures = []
  page.on('pageerror', (e) => log(`PAGEERROR ${String(e).split('\n')[0]}`))

  // Login
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.fill('#email', CREDS.email)
  await page.fill('#password', CREDS.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/admin/dashboard', { timeout: 30000 })
  log('logged in')

  // The exact dev-failing sequence.
  await page.goto(`${ADMIN}/admin/about`, { waitUntil: 'domcontentloaded' })
  if (!(await waitForContent(page, 'about initial')).ok) failures.push('about initial')

  await page.evaluate(() => { document.querySelector('main').scrollTop = 99999 })
  await page.waitForTimeout(500)

  await page.goto(`${ADMIN}/admin/skills`, { waitUntil: 'domcontentloaded' })
  if (!(await waitForContent(page, 'skills')).ok) failures.push('skills')

  await page.goBack({ waitUntil: 'domcontentloaded' })
  if (!(await waitForContent(page, 'after goBack')).ok) failures.push('after goBack')

  for (let i = 1; i <= 3; i++) {
    await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {})
    if (!(await waitForContent(page, `forward #${i}`)).ok) failures.push(`forward #${i}`)
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
    if (!(await waitForContent(page, `back #${i}`)).ok) failures.push(`back #${i}`)
  }

  // Scroll down/up on two pages, per the verification requirement.
  for (const path of ['/admin/about', '/admin/hero']) {
    await page.goto(`${ADMIN}${path}`, { waitUntil: 'domcontentloaded' })
    if (!(await waitForContent(page, `${path} load`)).ok) failures.push(`${path} load`)
    const before = (await state(page)).mainTextLen
    await page.mouse.move(700, 500)
    for (let i = 0; i < 18; i++) { await page.mouse.wheel(0, 350); await page.waitForTimeout(35) }
    await page.waitForTimeout(600)
    for (let i = 0; i < 18; i++) { await page.mouse.wheel(0, -350); await page.waitForTimeout(35) }
    await page.waitForTimeout(800)
    const after = await state(page)
    log(`${path} scroll down/up: textLen ${before} -> ${after.mainTextLen}`)
    if (!after.hasMain || after.mainTextLen < before * 0.9) failures.push(`${path} scroll cycle`)
  }

  log('\n=== RESULT ===')
  if (failures.length === 0) log('ALL PASS — no wedge in production build')
  else log(`FAILURES: ${failures.join(', ')}`)

  await browser.close()
  process.exitCode = failures.length ? 1 : 0
}

main().catch((e) => { console.error(e); process.exit(2) })
