/**
 * The one real failure captured so far: after navigating away and back, the
 * admin shell showed a centred "Loading..." with no <main> at all.
 *
 * Two candidate explanations:
 *   E1 transient  — dev-only Turbopack recompile; content arrives if we wait.
 *   E2 stuck      — AdminShell is wedged in isLoading with the redirect
 *                   suppressed by redirectedRef, so it never recovers.
 *
 * Distinguished by waiting a long time and polling. Also records every
 * /admin/me response so an exhausted-retry path would be visible.
 */
const { chromium } = require('playwright')
const { adminLogin, URLS, CREDS } = require('./harness')

const log = (m) => console.log(`  [stuck] ${m}`)

const state = (page) =>
  page.evaluate(() => {
    const m = document.querySelector('main')
    const body = document.body.innerText.trim()
    return {
      hasMain: !!m,
      mainTextLen: m ? m.innerText.trim().length : 0,
      bodyStartsLoading: body.startsWith('Loading'),
      bodyLen: body.length,
      url: location.pathname,
    }
  })

async function pollUntilContent(page, label, budgetMs) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < budgetMs) {
    last = await state(page)
    if (last.hasMain && last.mainTextLen > 80) {
      log(`${label}: recovered after ${Date.now() - started}ms -> ${JSON.stringify(last)}`)
      return { recovered: true, ms: Date.now() - started, last }
    }
    await page.waitForTimeout(1000)
  }
  log(`${label}: STILL not rendered after ${budgetMs}ms -> ${JSON.stringify(last)}`)
  return { recovered: false, ms: budgetMs, last }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const meCalls = []
  const findings = []

  page.on('response', (r) => {
    if (r.url().includes('/admin/me')) meCalls.push(`${r.status()} ${r.url()}`)
  })
  page.on('pageerror', (e) => log(`PAGEERROR ${String(e).split('\n')[0]}`))

  await adminLogin({ page, log, URLS, CREDS })
  log(`/admin/me calls so far: ${meCalls.length}`)

  // --- Reproduce the exact original sequence, then wait generously ---
  log('\n=== goto about, scroll to bottom, goto skills, goBack ===')
  await page.goto(`${URLS.admin}/admin/about`, { waitUntil: 'domcontentloaded' })
  await pollUntilContent(page, 'about initial', 90000)
  await page.evaluate(() => { document.querySelector('main').scrollTop = 99999 })
  await page.waitForTimeout(600)

  await page.goto(`${URLS.admin}/admin/skills`, { waitUntil: 'domcontentloaded' })
  await pollUntilContent(page, 'skills', 90000)

  await page.goBack({ waitUntil: 'domcontentloaded' })
  const back = await pollUntilContent(page, 'after goBack (90s budget)', 90000)
  if (!back.recovered) {
    findings.push(`E2 STUCK CONFIRMED: after goBack the shell never rendered <main> within 90s (state=${JSON.stringify(back.last)})`)
  } else if (back.ms > 6000) {
    findings.push(`E1 TRANSIENT: after goBack content took ${back.ms}ms — the earlier 3.5s wait was simply too short (dev recompile)`)
  }
  log(`/admin/me calls after goBack: ${meCalls.length} -> ${JSON.stringify(meCalls)}`)

  // --- Repeat with browser back/forward several times to stress it ---
  log('\n=== repeated back/forward cycles ===')
  for (let i = 1; i <= 3; i++) {
    await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {})
    await pollUntilContent(page, `forward #${i}`, 60000)
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
    const r = await pollUntilContent(page, `back #${i}`, 60000)
    if (!r.recovered) findings.push(`STUCK on back/forward cycle #${i}: ${JSON.stringify(r.last)}`)
  }

  // --- Client-side (SPA) nav away and back, which keeps AdminShell mounted ---
  log('\n=== SPA nav away and back via sidebar (AdminShell stays mounted) ===')
  await page.goto(`${URLS.admin}/admin/about`, { waitUntil: 'domcontentloaded' })
  await pollUntilContent(page, 'about', 90000)
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollTop = 99999 })
    await page.waitForTimeout(400)
    await page.getByRole('link', { name: 'Hero Section', exact: true }).first().click()
    const a = await pollUntilContent(page, `SPA -> hero #${i}`, 60000)
    if (!a.recovered) findings.push(`SPA nav to hero blanked on cycle #${i}: ${JSON.stringify(a.last)}`)
    await page.evaluate(() => { const m = document.querySelector('main'); if (m) m.scrollTop = 99999 })
    await page.waitForTimeout(400)
    await page.getByRole('link', { name: 'About', exact: true }).first().click()
    const b = await pollUntilContent(page, `SPA -> about #${i}`, 60000)
    if (!b.recovered) findings.push(`SPA nav to about blanked on cycle #${i}: ${JSON.stringify(b.last)}`)
  }
  log(`total /admin/me calls: ${meCalls.length}`)

  log('\n=== RESULT ===')
  if (!findings.length) log('no findings')
  findings.forEach((f) => log(`FINDING: ${f}`))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
