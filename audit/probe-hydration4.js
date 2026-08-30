/**
 * Replay admin-pass1's exact opening sequence to pin down when the hydration
 * warning fires: load login -> submit bad creds -> reload -> submit good creds.
 */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  let stage = 'initial-load'
  const hits = []
  page.on('console', (m) => {
    if (/hydrat/i.test(m.text())) hits.push(stage)
  })

  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 60000 })
  await page.waitForTimeout(3000)
  console.log(`after ${stage}: ${hits.length} warning(s)`)

  stage = 'bad-credential-submit'
  await page.fill('#email', 'wrong@example.com')
  await page.fill('#password', 'definitelywrong')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(3000)
  console.log(`after ${stage}: ${hits.length} warning(s) total`)

  stage = 'reload'
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 60000 })
  await page.waitForTimeout(3500)
  console.log(`after ${stage}: ${hits.length} warning(s) total`)

  stage = 'good-credential-submit'
  await page.fill('#email', 'info@hasib.com')
  await page.fill('#password', '42862266')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/admin/dashboard', { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(3000)
  console.log(`after ${stage}: ${hits.length} warning(s) total`)

  console.log('\nstages that produced warnings:', hits.length ? [...new Set(hits)].join(', ') : 'none')
  await browser.close()
})()
