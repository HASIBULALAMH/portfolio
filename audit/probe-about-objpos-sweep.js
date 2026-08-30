/**
 * Probe: sweep object-position Y on the About portrait at its new stretched
 * height, to pick a crop from measurements instead of taste.
 *
 * Source landmarks measured from the PNG's pixels (not assumed): the subject
 * occupies rows 136..800 of 1024, so everything above 136 and below 800 is
 * empty backdrop. Chin sits at ~565.
 */
const { chromium } = require('playwright')

const VALUES = ['50% 0%', '50% 15%', '50% 25%', '50% 35%', '50% 50%']
const CROWN = 136
const CHIN = 565
const SUBJECT_BOTTOM = 800

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('#about').scrollIntoViewIfNeeded()
  await page.waitForTimeout(2500)

  for (const value of VALUES) {
    await page.evaluate((v) => {
      document.querySelector('#about img').style.objectPosition = v
    }, value)
    await page.waitForTimeout(250)

    const geo = await page.evaluate(() => {
      const img = document.querySelector('#about img')
      const f = img.closest('div').getBoundingClientRect()
      const scale = Math.max(f.width / img.naturalWidth, f.height / img.naturalHeight)
      const overflow = img.naturalHeight * scale - f.height
      const frac = parseFloat(getComputedStyle(img).objectPosition.split(' ')[1]) / 100
      return {
        top: (overflow * frac) / scale,
        bottom: (overflow * frac + f.height) / scale,
      }
    })

    const headroom = CROWN - geo.top
    const belowSubject = geo.bottom - SUBJECT_BOTTOM
    const eyePct = ((300 - geo.top) / (geo.bottom - geo.top)) * 100

    console.log(
      `${value.padEnd(9)} rows ${geo.top.toFixed(0).padStart(3)}..${geo.bottom.toFixed(0)}` +
        `  headroom=${headroom.toFixed(0).padStart(4)}` +
        `  deadBelow=${belowSubject.toFixed(0).padStart(4)}` +
        `  chinVisible=${geo.bottom > CHIN}` +
        `  eyeline=${eyePct.toFixed(0)}%`
    )

    await page
      .locator('#about img')
      .first()
      .screenshot({ path: `/tmp/objpos-${value.replace(/[^0-9]/g, '_')}.png` })
  }

  await browser.close()
})()
