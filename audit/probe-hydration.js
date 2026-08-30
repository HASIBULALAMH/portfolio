/** Capture the full hydration mismatch report on the admin login page. */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  page.on('console', (m) => {
    const t = m.text()
    if (/hydrat/i.test(t)) {
      console.log('=== FULL CONSOLE MESSAGE ===')
      console.log(t)
      console.log('=== END ===')
    }
  })
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 1500)))

  await page.goto('http://localhost:3001/login', { waitUntil: 'load' })
  await page.waitForTimeout(6000)

  // Compare the server HTML with the hydrated DOM for the form subtree.
  const res = await page.request.get('http://localhost:3001/login')
  const serverHtml = await res.text()
  const m = serverHtml.match(/<form[^>]*>/i)
  console.log('\nSERVER <form> tag:', m ? m[0] : '(no form in SSR output)')

  const clientForm = await page.evaluate(() => {
    const f = document.querySelector('form')
    if (!f) return null
    return {
      outer: f.outerHTML.slice(0, 200),
      attrs: [...f.attributes].map((a) => `${a.name}="${a.value}"`),
    }
  })
  console.log('CLIENT form attrs:', clientForm && clientForm.attrs.join(' '))

  // Also check html/body attrs, the usual culprits.
  const htmlAttrs = await page.evaluate(() =>
    [...document.documentElement.attributes].map((a) => `${a.name}="${a.value}"`).join(' ')
  )
  console.log('CLIENT <html> attrs:', htmlAttrs)
  const sm = serverHtml.match(/<html[^>]*>/i)
  console.log('SERVER <html> tag:', sm ? sm[0] : '(none)')

  await browser.close()
})()
