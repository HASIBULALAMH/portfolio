/** Verify the read toggle now keeps the detail panel open and shows a toast. */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  // login
  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.fill('#email', 'info@hasib.com')
  await page.fill('#password', '42862266')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/admin/dashboard', { timeout: 60000 })

  await page.goto('http://localhost:3001/admin/messages', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !document.body.innerText.trim().startsWith('Loading...'), { timeout: 60000 })
  await page.waitForTimeout(2000)

  const row = await page.$('[role="button"]')
  if (!row) { console.log('no messages to test'); await browser.close(); return }
  await row.click()
  await page.waitForTimeout(1500)

  for (const pass of [1, 2]) {
    const btn = await page.$('button:has-text("Mark Read"), button:has-text("Mark Unread")')
    if (!btn) { console.log(`pass ${pass}: toggle button MISSING`); break }
    const before = (await btn.textContent()).trim()
    await btn.click()
    await page.waitForTimeout(2500)

    const state = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Mark (Read|Unread)/.test(x.innerText))
      return {
        toggle: b ? b.innerText.trim() : '(gone)',
        panelOpen: Boolean(document.querySelector('button[aria-label="Close details"]')),
        toasts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map((n) => n.innerText.trim()),
      }
    })
    console.log(`pass ${pass}: "${before}" -> "${state.toggle}" | panel open: ${state.panelOpen} | toasts: ${JSON.stringify(state.toasts)}`)
  }

  await page.screenshot({ path: '/tmp/read-toggle-after.png' })
  await browser.close()
})()
