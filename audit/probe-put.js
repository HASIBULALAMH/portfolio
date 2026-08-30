const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch({ headless: true })
  const p = await b.newPage()
  await p.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' })
  await p.fill('input[type="email"]', 'info@hasib.com')
  await p.fill('input[type="password"]', '42862266')
  await p.click('button[type="submit"]')
  await p.waitForFunction(() => Boolean(localStorage.getItem('auth_token')), { timeout: 60000 })

  p.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('section-visibility')) {
      console.log('PUT BODY >>>', r.postData())
    }
  })
  p.on('response', async (r) => {
    if (r.request().method() === 'PUT' && r.url().includes('section-visibility')) {
      console.log('STATUS >>>', r.status())
      console.log('RESP >>>', (await r.text()).slice(0, 600))
    }
  })

  await p.goto('http://localhost:3001/admin/settings/sections', { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => document.querySelectorAll('input[type="checkbox"]').length >= 8, { timeout: 60000 })
  await p.getByLabel(/^(Hide|Show) the Testimonials section$/).click({ force: true })
  await p.waitForTimeout(4000)
  await b.close()
})()
