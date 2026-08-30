/**
 * Shared Playwright harness for the portfolio E2E audit.
 *
 * Every flow script imports `session()` from here so that all runs capture the
 * same three things in the same format:
 *   - screenshots, numbered in execution order, under audit_screenshots/<area>/
 *   - console messages (errors/warnings) with the page URL they came from
 *   - every network response, so 4xx/5xx can be reported even when the UI
 *     silently swallows the failure
 *
 * Findings are appended to audit/logs/<area>.json for the report step.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SHOTS = path.join(ROOT, 'audit_screenshots')
const LOGS = path.join(ROOT, 'audit', 'logs')

const URLS = {
  backend: 'http://127.0.0.1:8000',
  frontend: 'http://localhost:3000',
  admin: 'http://localhost:3001',
}

const CREDS = { email: 'info@hasib.com', password: '42862266' }

async function session(area, fn, opts = {}) {
  fs.mkdirSync(path.join(SHOTS, area), { recursive: true })
  fs.mkdirSync(LOGS, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()

  const consoleMsgs = []
  const netEvents = []
  const pageErrors = []
  let shotIndex = 0

  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      consoleMsgs.push({ type, text: msg.text().slice(0, 500), url: page.url() })
    }
  })

  page.on('pageerror', (err) => {
    pageErrors.push({ message: String(err).slice(0, 500), url: page.url() })
  })

  page.on('response', (res) => {
    const status = res.status()
    const url = res.url()
    // Only record app traffic; skip static asset noise unless it failed.
    const isApi = url.includes('/api/')
    if (isApi || status >= 400) {
      netEvents.push({ status, method: res.request().method(), url, ok: status < 400 })
    }
  })

  const log = (msg) => console.log(`  [${area}] ${msg}`)

  // Screenshot helper: zero-padded ordering so files sort the way they ran.
  const shot = async (name, options = {}) => {
    shotIndex += 1
    const file = `${String(shotIndex).padStart(2, '0')}-${name}.png`
    const dest = path.join(SHOTS, area, file)
    await page.screenshot({ path: dest, fullPage: options.fullPage !== false })
    log(`shot -> ${area}/${file}`)
    return `audit_screenshots/${area}/${file}`
  }

  const findings = []
  const note = (finding) => {
    findings.push(finding)
    log(`FINDING: ${finding.title}`)
  }

  let error = null
  try {
    await fn({ page, context, shot, log, note, URLS, CREDS })
  } catch (e) {
    error = { message: String(e && e.stack ? e.stack : e).slice(0, 2000) }
    console.error(`  [${area}] FLOW ERROR: ${error.message}`)
    try {
      await shot('flow-error')
    } catch { /* page may be closed */ }
  }

  await browser.close()

  const failedRequests = netEvents.filter((e) => !e.ok)
  const result = {
    area,
    finishedAt: new Date().toISOString(),
    error,
    findings,
    consoleMsgs,
    pageErrors,
    failedRequests,
    apiCallCount: netEvents.length,
  }

  const out = path.join(LOGS, `${area}.json`)
  fs.writeFileSync(out, JSON.stringify(result, null, 2))

  console.log(`\n  [${area}] === SUMMARY ===`)
  console.log(`  [${area}] screenshots: ${shotIndex}`)
  console.log(`  [${area}] findings: ${findings.length}`)
  console.log(`  [${area}] page errors: ${pageErrors.length}`)
  console.log(`  [${area}] console errors/warnings: ${consoleMsgs.length}`)
  console.log(`  [${area}] failed requests (4xx/5xx): ${failedRequests.length}`)
  for (const f of failedRequests) console.log(`  [${area}]   ${f.status} ${f.method} ${f.url}`)
  for (const p of pageErrors) console.log(`  [${area}]   PAGEERROR ${p.message.split('\n')[0]}`)
  for (const c of consoleMsgs.slice(0, 25)) console.log(`  [${area}]   ${c.type}: ${c.text.split('\n')[0]}`)

  return result
}

/**
 * Log into the admin panel and land on the dashboard.
 *
 * Waits for hydration before submitting. Clicking earlier triggers the
 * browser's native form submission instead of React's handler, which in dev
 * happens easily because Turbopack may still be compiling the route.
 */
async function adminLogin({ page, log, URLS, CREDS }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`${URLS.admin}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#email', { timeout: 60000 })

    // React replays the value through its own state once hydrated, so a filled
    // input that keeps its value after a tick is a good hydration signal.
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button[type="submit"]')
        return btn && !btn.disabled
      },
      { timeout: 60000 }
    )
    await page.waitForTimeout(2500)

    await page.fill('#email', CREDS.email)
    await page.fill('#password', CREDS.password)
    await page.click('button[type="submit"]')

    try {
      await page.waitForURL('**/admin/dashboard', { timeout: 45000 })
      await page.waitForFunction(
        () => !document.body.innerText.trim().startsWith('Loading...'),
        { timeout: 45000 }
      )
      log(`logged in (attempt ${attempt})`)
      return
    } catch {
      log(`login attempt ${attempt} did not reach the dashboard (url=${page.url()}); retrying`)
    }
  }
  throw new Error(`adminLogin failed after 3 attempts; last URL ${page.url()}`)
}

module.exports = { session, adminLogin, URLS, CREDS, ROOT }
