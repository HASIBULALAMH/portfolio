/**
 * Bug 3 across breakpoints: the card container must keep ONE height per
 * viewport while cycling every testimonial, and the nav dots must not move.
 *
 * Run against a dataset with a deliberately wide quote-length spread — a
 * fixed pixel height would pass at the breakpoint it was tuned for and fail
 * at the others, so a single-viewport check cannot tell a real solution from
 * a lucky magic number.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, 'logs')
const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'testimonials-height')
const URL = process.env.URL || 'http://localhost:3010'

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
]

const MEASURE = `(() => {
  const sec = document.querySelector('#testimonials')
  const sizer = sec.querySelector('[aria-hidden="true"]')
  const grid = sec.querySelector('.grid')
  const fig = [...sec.querySelectorAll('figure')].filter((f) => !sizer || !sizer.contains(f))[0]
  const dots = [...sec.querySelectorAll('button[aria-label^="Show testimonial"]')]
  return {
    author: fig?.querySelector('figcaption div')?.textContent?.trim() ?? null,
    quoteLen: (fig?.querySelector('blockquote')?.textContent ?? '').length,
    gridH: +grid.getBoundingClientRect().height.toFixed(2),
    secH: +sec.getBoundingClientRect().height.toFixed(2),
    cardH: fig ? +fig.getBoundingClientRect().height.toFixed(2) : null,
    dotsY: dots.length ? +(dots[0].getBoundingClientRect().top + window.scrollY).toFixed(2) : -1,
    docH: +document.documentElement.scrollHeight.toFixed(2),
  }
})()`

;(async () => {
  const browser = await chromium.launch()
  fs.mkdirSync(SHOTS, { recursive: true })
  const report = {}

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.locator('#testimonials').scrollIntoViewIfNeeded()
    await page.waitForTimeout(1000)

    const n = await page.locator('#testimonials button[aria-label^="Show testimonial"]').count()
    const rows = []
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        await page.locator(`#testimonials button[aria-label="Show testimonial ${i + 1}"]`).click()
        await page.waitForTimeout(1500) // full swap + gate margin
      }
      rows.push(await page.evaluate(MEASURE))
      await page
        .locator('#testimonials')
        .screenshot({ path: path.join(SHOTS, `${vp.name}-card-${i}.png`) })
    }

    const uniq = (k) => [...new Set(rows.map((r) => r[k]))]
    const spread = (k) => +(Math.max(...rows.map((r) => r[k])) - Math.min(...rows.map((r) => r[k]))).toFixed(2)
    report[vp.name] = {
      viewport: vp,
      cards: rows,
      gridHValues: uniq('gridH'),
      dotsYValues: uniq('dotsY'),
      gridHSpread: spread('gridH'),
      dotsYSpread: spread('dotsY'),
      docHSpread: spread('docH'),
      quoteLenRange: [Math.min(...rows.map((r) => r.quoteLen)), Math.max(...rows.map((r) => r.quoteLen))],
      pass: spread('gridH') === 0 && spread('dotsY') === 0,
    }
    await page.close()
  }

  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, 'testimonial-height-breakpoints.json'), JSON.stringify(report, null, 2))
  for (const [name, r] of Object.entries(report)) {
    console.log(
      `${name.padEnd(8)} ${r.pass ? 'PASS' : 'FAIL'}  gridH=${JSON.stringify(r.gridHValues)} spread=${r.gridHSpread}px  dotsY=${JSON.stringify(r.dotsYValues)} spread=${r.dotsYSpread}px  quoteLen=${r.quoteLenRange[0]}..${r.quoteLenRange[1]}`,
    )
  }
  await browser.close()
})()
