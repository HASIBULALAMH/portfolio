/**
 * Two hypotheses that headless Chromium cannot test:
 *
 *  H1 (compositing): the `glass-header` / `glass-sidebar` siblings use
 *      backdrop-filter. In GPU-composited Chrome that can invalidate the
 *      backdrop root of an adjacent scroller and blank its content on scroll.
 *      Detected by PNG byte size of the main region, since the DOM stays intact
 *      when the failure is purely a paint failure.
 *
 *  H2 (scroll leak): `main` is the scroll container, not the document. Next's
 *      App Router scroll restoration targets documentElement, so main.scrollTop
 *      survives a client-side navigation and the next page opens scrolled past
 *      its own heading — which reads as "content is blank/broken".
 *
 * Run headed (under xvfb-run) so the real compositor is exercised.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { adminLogin, URLS, CREDS } = require('./harness')

const SHOTS = path.resolve(__dirname, '..', 'audit_screenshots', 'scroll-headed')
const log = (m) => console.log(`  [headed] ${m}`)

let n = 0
async function shotMain(page, name) {
  n += 1
  const box = await page.evaluate(() => {
    const m = document.querySelector('main')
    if (!m) return null
    const r = m.getBoundingClientRect()
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: r.width, height: r.height }
  })
  const file = path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, clip: box || undefined })
  const bytes = fs.statSync(file).size
  log(`shot ${path.basename(file)} — ${bytes} bytes`)
  return bytes
}

const measure = (page) =>
  page.evaluate(() => {
    const m = document.querySelector('main')
    if (!m) return { error: 'no main' }
    return {
      scrollTop: Math.round(m.scrollTop),
      maxScroll: Math.round(m.scrollHeight - m.clientHeight),
      textLen: m.innerText.trim().length,
      firstHeading: (m.querySelector('h1') || {}).innerText || null,
      h1Top: m.querySelector('h1')
        ? Math.round(m.querySelector('h1').getBoundingClientRect().top - m.getBoundingClientRect().top)
        : null,
    }
  })

async function waitContent(page) {
  await page.waitForFunction(
    () => {
      const m = document.querySelector('main')
      return m && m.innerText.trim().length > 80
    },
    { timeout: 90000 },
  )
  await page.waitForTimeout(1500)
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch({
    headless: false,
    args: ['--enable-gpu', '--disable-gpu-driver-bug-workarounds'],
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const findings = []
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]))

  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl')
    if (!gl) return 'no webgl'
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'
  }).catch(() => 'n/a')
  log(`GL renderer: ${renderer}`)

  await adminLogin({ page, log, URLS, CREDS })

  // ---------- H1: GPU-composited scroll down / up ----------
  for (const p of ['/admin/about', '/admin/hero', '/admin/settings']) {
    log(`\n===== H1 ${p} =====`)
    await page.goto(`${URLS.admin}${p}`, { waitUntil: 'domcontentloaded' })
    await waitContent(page)
    const slug = p.replace(/\//g, '_')

    const baseline = await shotMain(page, `${slug}-A-top`)
    log(`initial ${JSON.stringify(await measure(page))}`)

    // Three full wheel cycles: compositing faults often need a repeat.
    await page.mouse.move(760, 520)
    for (let cycle = 1; cycle <= 3; cycle++) {
      for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, 300)
        await page.waitForTimeout(40)
      }
      await page.waitForTimeout(500)
      if (cycle === 1) await shotMain(page, `${slug}-B-bottom`)
      for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, -300)
        await page.waitForTimeout(40)
      }
      await page.waitForTimeout(700)
      const bytes = await shotMain(page, `${slug}-C-back-top-cycle${cycle}`)
      const m = await measure(page)
      log(`cycle ${cycle} back at top: ${bytes} bytes, ${JSON.stringify(m)}`)
      if (bytes < baseline * 0.5) {
        findings.push(`H1 CONFIRMED on ${p}: main region PNG fell from ${baseline} to ${bytes} bytes after scroll cycle ${cycle} (content stopped painting)`)
      }
    }
  }

  // ---------- H2: scroll position leaking across SPA navigation ----------
  const navPairs = [
    ['/admin/about', 'Hero Section'],
    ['/admin/hero', 'About'],
    ['/admin/settings', 'Skills'],
  ]
  for (const [from, linkName] of navPairs) {
    log(`\n===== H2 ${from} -> "${linkName}" =====`)
    await page.goto(`${URLS.admin}${from}`, { waitUntil: 'domcontentloaded' })
    await waitContent(page)

    await page.evaluate(() => {
      const m = document.querySelector('main')
      m.scrollTop = m.scrollHeight
    })
    await page.waitForTimeout(600)
    log(`before nav: ${JSON.stringify(await measure(page))}`)

    await page.getByRole('link', { name: linkName, exact: true }).first().click()
    await page.waitForTimeout(6000) // dev compile of the target route
    await waitContent(page).catch(() => log('content wait timed out'))

    const after = await measure(page)
    log(`after nav:  ${JSON.stringify(after)}`)
    await shotMain(page, `H2-${from.replace(/\//g, '_')}-to-${linkName.replace(/\s+/g, '')}`)

    if (after.scrollTop > 8) {
      findings.push(`H2 CONFIRMED ${from} -> ${linkName}: main.scrollTop stayed at ${after.scrollTop}px after client-side nav (h1 sits ${after.h1Top}px above the visible area)`)
    }
  }

  log('\n=== RESULT ===')
  log(`page errors: ${pageErrors.length}`)
  pageErrors.forEach((e) => log(`  PAGEERROR ${e}`))
  if (findings.length === 0) log('no findings')
  findings.forEach((f) => log(`  FINDING: ${f}`))

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
