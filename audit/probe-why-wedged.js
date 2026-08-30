/**
 * The stuck state reproduces 100% on back/forward. Narrow WHY hydration never
 * completes by capturing, at the moment of the wedge:
 *   - whether the HTML shipped by the server is itself just "Loading..."
 *   - every request the page made (esp. the JS chunks) and their status
 *   - any console output, including React hydration errors, from load onward
 *   - whether React ever attached (probe for a React root / hydration marker)
 */
const { chromium } = require('playwright')
const { adminLogin, URLS, CREDS } = require('./harness')

const log = (m) => console.log(`  [why] ${m}`)

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const consoleAll = []
  const requests = []
  page.on('console', (m) => consoleAll.push(`${m.type()}: ${m.text().slice(0, 300)}`))
  page.on('pageerror', (e) => consoleAll.push(`PAGEERROR: ${String(e).split('\n')[0]}`))
  page.on('requestfailed', (r) =>
    requests.push(`FAILED ${r.method()} ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`),
  )
  page.on('response', (r) => {
    const u = r.url()
    if (u.includes('.js') || u.includes('/api/') || u.endsWith('/admin/about') || u.includes('_next')) {
      requests.push(`${r.status()} ${r.request().method()} ${u.slice(0, 140)}`)
    }
  })

  await adminLogin({ page, log, URLS, CREDS })

  await page.goto(`${URLS.admin}/admin/about`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  log(`about loaded, main present: ${await page.evaluate(() => !!document.querySelector('main'))}`)

  await page.goto(`${URLS.admin}/admin/skills`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)

  log('\n--- clearing instrumentation, then goBack ---')
  consoleAll.length = 0
  requests.length = 0

  await page.goBack({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(20000)

  const diag = await page.evaluate(() => {
    const hasReactRoot = !!document.querySelector('#__next, [data-reactroot]')
    // Next 15/16 hydration marker: React attaches internal props to the root.
    const bodyKeys = Object.keys(document.body).filter((k) => k.startsWith('__react'))
    const firstDiv = document.body.firstElementChild
    const divKeys = firstDiv
      ? Object.keys(firstDiv).filter((k) => k.startsWith('__react'))
      : []
    return {
      bodyText: document.body.innerText.trim().slice(0, 120),
      bodyHTMLLen: document.body.innerHTML.length,
      bodyHTMLHead: document.body.innerHTML.slice(0, 400),
      hasReactRoot,
      reactPropsOnBody: bodyKeys,
      reactPropsOnFirstChild: divKeys,
      scriptCount: document.querySelectorAll('script').length,
      readyState: document.readyState,
      nextDataPresent: !!document.getElementById('__NEXT_DATA__'),
      hasSelfNextF: typeof window.__next_f !== 'undefined',
      nextFLen: (window.__next_f || []).length,
    }
  })
  log(`\nDIAGNOSTIC AT WEDGE:\n${JSON.stringify(diag, null, 2)}`)

  log(`\n--- requests since goBack (${requests.length}) ---`)
  requests.slice(0, 40).forEach((r) => log(`  ${r}`))

  log(`\n--- console since goBack (${consoleAll.length}) ---`)
  consoleAll.slice(0, 40).forEach((c) => log(`  ${c}`))

  // What did the SERVER actually send for this URL?
  const raw = await page.evaluate(async () => {
    const res = await fetch(location.href, { headers: { Accept: 'text/html' } })
    const text = await res.text()
    return { status: res.status, len: text.length, hasLoading: text.includes('Loading...') }
  })
  log(`\nraw server HTML for ${page.url()}: ${JSON.stringify(raw)}`)

  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
