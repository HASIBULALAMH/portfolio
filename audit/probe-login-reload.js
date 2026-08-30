/** Confirm whether the 401 interceptor triggers a navigation that wipes the toast. */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) console.log(`NAVIGATED -> ${f.url()}`)
  })

  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email')

  // Tag the window so we can tell a full reload from a client-side re-render.
  await page.evaluate(() => { window.__probeTag = 'ORIGINAL_DOCUMENT' })
  console.log('tag set:', await page.evaluate(() => window.__probeTag))

  await page.fill('#email', 'wrong@example.com')
  await page.fill('#password', 'definitelywrong')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(4000)

  const tag = await page.evaluate(() => window.__probeTag || 'GONE_-_PAGE_WAS_RELOADED')
  console.log('tag after failed login:', tag)
  await browser.close()
})()
