/**
 * Two questions about the scroll-reveal animation:
 *  1. Does content become visible when scrolled to? (expected: yes)
 *  2. With prefers-reduced-motion: reduce, is content still revealed?
 *     framer-motion's whileInView starts at opacity 0, so if the animation is
 *     suppressed rather than instant, content would stay invisible forever.
 */
const { chromium } = require('playwright')

async function check(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 150000 })
  await page.waitForSelector('#contact', { timeout: 60000 })
  await page.waitForTimeout(3000)

  // Scroll through the whole page so every section enters the viewport.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.6
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 260))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(2500)

  const vis = await page.evaluate(() => {
    const out = []
    for (const sel of ['#projects', '#journey', '#skills', '#about']) {
      const s = document.querySelector(sel)
      if (!s) { out.push([sel, 'MISSING', null]); continue }
      // Find the animated wrapper inside and read its computed opacity.
      const inner = s.querySelector('div[style*="opacity"]') || s
      out.push([sel, getComputedStyle(inner).opacity, s.innerText.replace(/\s+/g, ' ').slice(0, 60)])
    }
    return out
  })

  console.log(`\n--- reducedMotion=${reducedMotion ? 'reduce' : 'no-preference'} ---`)
  for (const [sel, op, txt] of vis) console.log(`  ${sel.padEnd(11)} opacity=${op}  "${txt}"`)

  await page.screenshot({
    path: `/media/hasibul-alam/D/portfolio/audit_screenshots/frontend/${reducedMotion ? 'reduced-motion' : 'scrolled'}.png`,
    fullPage: true,
  })
  await context.close()
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  await check(browser, false)
  await check(browser, true)
  await browser.close()
})()
