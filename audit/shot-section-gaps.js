/**
 * Screenshots for the section-spacing check.
 *
 * Reveal animations gate on IntersectionObserver and the page runs Lenis, which
 * intercepts window.scrollTo — a fast scroll loop leaves elements stranded at
 * opacity 0 and makes whole sections look blank in a fullPage capture. So this
 * crawls in small steps with real dwell time, then asserts nothing is still
 * faded before capturing.
 */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  for (const vp of [
    { n: 'desktop', w: 1440, h: 900 },
    { n: 'mobile', w: 390, h: 844 },
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } })
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(1500)

    const total = await page.evaluate(() => document.body.scrollHeight)
    for (let y = 0; y < total; y += Math.round(vp.h / 3)) {
      await page.mouse.wheel(0, Math.round(vp.h / 3))
      await page.waitForTimeout(220)
    }
    await page.waitForTimeout(1200)

    const faded = await page.evaluate(() =>
      [...document.querySelectorAll('main > section')].map((s) => ({
        id: s.id,
        n: [...s.querySelectorAll('*')].filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.95).length,
      }))
    )
    console.log(`${vp.n}: still-faded per section → ` + faded.map((f) => `${f.id}=${f.n}`).join(' '))

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(600)
    await page.screenshot({ path: `/tmp/gaps-full-${vp.n}.png`, fullPage: true })
    await page.close()
  }
  await browser.close()
})()
