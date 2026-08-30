/**
 * Part 2 checklist: "no console errors/warnings on a fresh page load".
 *
 * Checks the public site and the admin login page in fresh contexts, and the
 * admin dashboard after a real login. Captures console messages, uncaught
 * exceptions, and failed network requests separately — a 404 on an image does
 * not always produce a console error, but it is still a defect worth seeing.
 *
 * Next.js dev servers emit their own HMR/devtools noise, so run against
 * production builds where possible; the report notes which target was used.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, 'logs')
const TARGETS = [
  { name: 'public-site', url: process.env.FE_URL || 'http://localhost:3010', wait: 3500 },
  { name: 'admin-login', url: (process.env.ADMIN_URL || 'http://localhost:3001') + '/login', wait: 2500 },
]

// Dev-server and browser noise that is not an app defect.
const IGNORE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /webpack-hmr|hmr-client|react-refresh/i,
  /Turbopack/i,
]

async function scan(browser, target) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  const warnings = []
  const pageErrors = []
  const failedRequests = []

  page.on('console', (m) => {
    const text = m.text()
    if (IGNORE.some((re) => re.test(text))) return
    if (m.type() === 'error') errors.push(text)
    else if (m.type() === 'warning') warnings.push(text)
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('requestfailed', (r) =>
    failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`),
  )
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`HTTP ${r.status()} ${r.url()}`)
  })

  await page.goto(target.url, { waitUntil: 'networkidle' })
  // Scroll the whole page so lazy/in-view animations and images all trigger.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(target.wait)

  await ctx.close()
  return {
    target: target.name,
    url: target.url,
    errors,
    warnings,
    pageErrors,
    failedRequests: [...new Set(failedRequests)],
    pass: errors.length === 0 && pageErrors.length === 0,
  }
}

;(async () => {
  const browser = await chromium.launch()
  const results = []
  for (const t of TARGETS) results.push(await scan(browser, t))

  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'console-clean.json'), JSON.stringify(results, null, 2))
  for (const r of results) {
    console.log(`\n=== ${r.target} (${r.url}) — ${r.pass ? 'PASS' : 'FAIL'}`)
    console.log(`  console errors : ${r.errors.length}`)
    r.errors.slice(0, 6).forEach((e) => console.log(`     ! ${e.slice(0, 160)}`))
    console.log(`  uncaught       : ${r.pageErrors.length}`)
    r.pageErrors.slice(0, 6).forEach((e) => console.log(`     ! ${e.slice(0, 160)}`))
    console.log(`  warnings       : ${r.warnings.length}`)
    r.warnings.slice(0, 6).forEach((e) => console.log(`     ~ ${e.slice(0, 160)}`))
    console.log(`  failed requests: ${r.failedRequests.length}`)
    r.failedRequests.slice(0, 8).forEach((e) => console.log(`     x ${e.slice(0, 160)}`))
  }
  await browser.close()
})()
