/** Did the About save actually fail, or did my heuristic match stray text? */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const net = []
  page.on('response', (r) => {
    if (r.url().includes('/api/')) net.push(`${r.status()} ${r.request().method()} ${r.url().split('/api')[1]}`)
  })

  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.fill('#email', 'info@hasib.com')
  await page.fill('#password', '42862266')
  await page.click('button[type="submit"]')
  await page.waitForURL('**/admin/dashboard', { timeout: 60000 })

  await page.goto('http://localhost:3001/admin/about', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !document.body.innerText.trim().startsWith('Loading...'), { timeout: 60000 })
  await page.waitForTimeout(2500)

  net.length = 0
  await page.click('button[type="submit"]')
  await page.waitForTimeout(4000)

  const state = await page.evaluate(() => {
    const txt = (n) => (n && typeof n.innerText === 'string' ? n.innerText.trim() : '')
    return {
      toasts: Array.from(document.querySelectorAll('[role="alert"],[role="status"]')).map(txt),
      // Any inline validation messages currently rendered
      inline: Array.from(document.querySelectorAll('.text-destructive')).map(txt).filter(Boolean),
    }
  })

  console.log('API calls during save:', net.length ? net.join('\n  ') : 'NONE')
  console.log('toasts:', JSON.stringify(state.toasts))
  console.log('inline validation errors:', JSON.stringify(state.inline))

  await page.screenshot({ path: '/tmp/about-save.png', fullPage: true })
  await browser.close()
})()
