/**
 * Locate the hydration mismatch. The warning includes a diff after the generic
 * advice text; capture every arg of the console message, plus React's own
 * error digest, and compare the SSR HTML against the hydrated DOM.
 */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  page.on('console', async (m) => {
    const t = m.text()
    if (!/hydrat/i.test(t)) return
    console.log('=== console.' + m.type() + ' ===')
    // The diff usually lives in later args, not the first format string.
    for (const [i, a] of m.args().entries()) {
      try {
        const v = await a.jsonValue()
        const s = typeof v === 'string' ? v : JSON.stringify(v)
        if (s && s.length > 2) console.log(`--- arg[${i}] ---\n${s.slice(0, 2500)}`)
      } catch {
        console.log(`--- arg[${i}] --- (unserialisable)`)
      }
    }
  })

  await page.goto('http://localhost:3001/login', { waitUntil: 'load' })
  await page.waitForTimeout(7000)

  // Diff the SSR markup against the hydrated DOM for the whole card.
  const res = await page.request.get('http://localhost:3001/login')
  const html = await res.text()

  const ssrBody = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [])[1] || ''
  const strip = (s) =>
    s
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const clientBody = await page.evaluate(() => document.body.innerHTML)

  const a = strip(ssrBody)
  const b = strip(clientBody)
  console.log('\nSSR body length:', a.length, ' client body length:', b.length)

  // Find the first divergence and show context around it.
  let i = 0
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++
  if (i < Math.min(a.length, b.length)) {
    console.log(`first divergence at char ${i}:`)
    console.log('  SSR   : ...' + a.slice(Math.max(0, i - 120), i + 200))
    console.log('  CLIENT: ...' + b.slice(Math.max(0, i - 120), i + 200))
  } else {
    console.log('no textual divergence found in body markup')
  }

  await browser.close()
})()
