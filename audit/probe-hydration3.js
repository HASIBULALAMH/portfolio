/**
 * Is the hydration warning caused by the app, or by the test filling inputs
 * before React hydrates? Run the same page twice: once filling immediately,
 * once after waiting for hydration.
 */
const { chromium } = require('playwright')

async function run(browser, label, fillImmediately) {
  const page = await browser.newPage()
  const hydrationWarnings = []
  page.on('console', (m) => {
    if (/hydrat/i.test(m.text())) hydrationWarnings.push(m.text().slice(0, 80))
  })

  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 60000 })

  if (!fillImmediately) await page.waitForTimeout(4000)
  await page.fill('#email', 'probe@example.com')
  await page.fill('#password', 'somepassword')
  await page.waitForTimeout(5000)

  console.log(`${label}: hydration warnings = ${hydrationWarnings.length}`)
  if (hydrationWarnings.length) console.log(`   ${hydrationWarnings[0]}...`)
  await page.close()
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  // Fill the instant the selector appears — hydration may still be pending.
  await run(browser, 'fill IMMEDIATELY (pre-hydration)', true)
  // Same page, but give React time to hydrate first.
  await run(browser, 'fill AFTER 4s (post-hydration) ', false)
  await browser.close()
})()
