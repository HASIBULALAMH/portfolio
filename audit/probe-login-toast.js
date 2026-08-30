/** Focused probe: does a failed login ever render a visible error toast? */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`CONSOLE ERROR: ${m.text().slice(0, 200)}`)
  })
  page.on('pageerror', (e) => console.log(`PAGEERROR: ${String(e).slice(0, 300)}`))

  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email')
  await page.fill('#email', 'wrong@example.com')
  await page.fill('#password', 'definitelywrong')
  await page.click('button[type="submit"]')

  // Poll every 150ms for 6s looking for any alert role or error-ish text.
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150)
    const state = await page.evaluate(() => ({
      alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map((n) => n.innerText),
      btn: document.querySelector('button[type=submit]')?.innerText,
    }))
    if (state.alerts.length) {
      console.log(`t=${(i + 1) * 150}ms ALERTS: ${JSON.stringify(state.alerts)}`)
      break
    }
    if (i % 8 === 0) console.log(`t=${(i + 1) * 150}ms no alert yet (button="${state.btn}")`)
  }

  const final = await page.evaluate(() => ({
    alerts: [...document.querySelectorAll('[role="alert"],[role="status"]')].map((n) => n.innerText),
    url: location.href,
  }))
  console.log('FINAL:', JSON.stringify(final))
  await browser.close()
})()
