/** Meeting-request form, with every required field filled. */
const { chromium } = require('playwright')

const STAMP = Date.now().toString().slice(-6)

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  const posts = []
  page.on('response', async (r) => {
    if (r.request().method() === 'POST' || r.status() >= 400) {
      posts.push(`${r.status()} ${r.request().method()} ${r.url()}`)
    }
  })

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#contact', { timeout: 60000 })
  await page.waitForTimeout(3000)

  await page.evaluate(() => document.querySelector('#contact').scrollIntoView())
  await page.waitForTimeout(800)

  const toggle = await page.$('#contact button:has-text("Schedule"), #contact button:has-text("Book"), #contact button:has-text("Meeting")')
  await toggle.click()
  await page.waitForTimeout(1500)

  await page.fill('#contact form input[name="name"]', `Meeting Audit ${STAMP}`)
  await page.fill('#contact form input[name="email"]', `meeting${STAMP}@example.com`)
  await page.fill('#contact form input[name="preferred_date"]', '2026-09-15')
  await page.selectOption('#preferred_time', '10:00')
  await page.fill('#meeting-message', `Automated audit meeting request ${STAMP}.`)

  await page.screenshot({ path: '/tmp/meeting-filled.png', fullPage: false })

  await page.click('#contact form button[type="submit"]')
  await page.waitForTimeout(5000)

  const txt = await page.textContent('#contact')
  console.log('POSTs/errors:', posts.length ? posts.join('\n  ') : 'NONE')
  console.log('success text:', /sent|thank|received|submitted/i.test(txt) ? 'YES' : 'NO')
  if (!/sent|thank|received|submitted/i.test(txt)) {
    console.log('section text:', txt.replace(/\s+/g, ' ').slice(0, 400))
  }
  console.log('url:', page.url())
  console.log(`STAMP=${STAMP}`)

  await browser.close()
})()
