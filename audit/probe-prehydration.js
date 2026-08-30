/**
 * Reproduce the pre-hydration native form submit on the login page.
 *
 * Submitting before React attaches its onSubmit handler makes the browser do a
 * default GET submission. The form has no action/method, so the fields land in
 * the query string — including the password.
 */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Block the JS chunks so hydration can never happen — this deterministically
  // simulates "user was faster than hydration".
  await page.route('**/*.js', (route) => route.abort())

  await page.goto('http://localhost:3001/login', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(1500)

  const hasForm = await page.$('#email')
  if (!hasForm) {
    console.log('form not server-rendered; cannot test pre-hydration')
    await browser.close()
    return
  }

  await page.fill('#email', 'info@hasib.com')
  await page.fill('#password', 'SuperSecret123')

  const btn = await page.$('button[type="submit"]')
  console.log('submit button disabled before hydration?', await btn.isDisabled())

  await btn.click().catch(() => {})
  await page.waitForTimeout(2000)

  const url = page.url()
  console.log('URL after pre-hydration submit:', url)
  if (url.includes('password=')) {
    console.log('*** LEAK CONFIRMED: password present in URL query string ***')
  } else {
    console.log('OK: no credentials in URL')
  }

  await browser.close()
})()
