/**
 * Verification: About section — column height parity + portrait crop framing.
 *
 * Head landmarks in the 1024x1024 source, measured from pixel data rather than
 * assumed (see probe output): the subject occupies rows ~136..800, so the file
 * carries dead backdrop above and below. Crown ~136, eyeline ~300, chin ~565.
 * A correct crop keeps the crown and the chin, with visible headroom above.
 *
 * The grid is `items-stretch` (was `items-start`): the portrait column now
 * matches the full height of the bio+stats column rather than stopping short.
 */
const { chromium } = require('playwright')
const fs = require('fs')

const FRONTEND = 'http://localhost:3000'

const HEAD = { crown: 136, eyes: 300, chin: 565 }

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, sideBySide: true },
  { name: 'tablet', width: 900, height: 1000, sideBySide: true },
  { name: 'mobile', width: 390, height: 844, sideBySide: false },
]

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`)
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 60000 })
    await page.locator('#about').scrollIntoViewIfNeeded()
    // Let entrance animations settle so measured y is the resting value.
    await page.waitForTimeout(2500)

    const d = await page.evaluate(() => {
      const about = document.querySelector('#about')
      const grid = about.querySelector('.grid')
      const cols = Array.from(grid.children)
      const img = about.querySelector('img')
      const frame = img?.closest('div')
      const box = (el) => {
        const r = el.getBoundingClientRect()
        return { top: +r.top.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) }
      }
      const cs = getComputedStyle(img)
      const fs_ = getComputedStyle(frame)
      return {
        align: getComputedStyle(grid).alignItems,
        cols: cols.length,
        col0: box(cols[0]),
        col1: box(cols[1]),
        col0Transform: getComputedStyle(cols[0]).transform,
        frame: box(frame),
        frameMarginTop: fs_.marginTop,
        framePaddingTop: fs_.paddingTop,
        objectFit: cs.objectFit,
        objectPosition: cs.objectPosition,
        nw: img.naturalWidth,
        nh: img.naturalHeight,
        src: img.getAttribute('src'),
      }
    })

    // --- Check 1: the two columns share a top edge AND a height ---
    if (vp.sideBySide) {
      const delta = Math.abs(d.col0.top - d.col1.top)
      record(
        `[${vp.name}] Image and bio columns share a top edge`,
        delta <= 2,
        `image top=${d.col0.top}px, text top=${d.col1.top}px, delta=${delta.toFixed(1)}px; align-items=${d.align}`
      )
      const hDelta = Math.abs(d.col0.height - d.col1.height)
      record(
        `[${vp.name}] Image column matches the text column's height`,
        hDelta <= 2,
        `image h=${d.col0.height}px, text h=${d.col1.height}px, delta=${hDelta.toFixed(1)}px`
      )
      record(
        `[${vp.name}] Portrait frame fills the stretched column`,
        Math.abs(d.frame.height - d.col0.height) <= 2,
        `frame h=${d.frame.height}px vs column h=${d.col0.height}px`
      )
      record(
        `[${vp.name}] Grid uses items-stretch`,
        d.align === 'stretch' || d.align === 'normal',
        `align-items: ${d.align}`
      )
    } else {
      // grid-cols-1 stacks the columns, so there is no side-by-side edge to
      // compare; assert instead that nothing pushes the image down on its own.
      const stacked = d.col0.top < d.col1.top
      record(
        `[${vp.name}] Columns stack (no side-by-side alignment applicable)`,
        stacked,
        `image top=${d.col0.top}px above text top=${d.col1.top}px — single-column layout`
      )
    }

    record(
      `[${vp.name}] No stray top margin/padding on image wrapper`,
      parseFloat(d.frameMarginTop) === 0 && parseFloat(d.framePaddingTop) === 0,
      `margin-top: ${d.frameMarginTop}, padding-top: ${d.framePaddingTop}`
    )

    record(
      `[${vp.name}] Entrance animation settles to y=0`,
      d.col0Transform === 'none' || /matrix\([^)]*,\s*0\)$/.test(d.col0Transform),
      `transform: ${d.col0Transform}`
    )

    // --- Check 2: crop keeps the whole head ---
    const scale = Math.max(d.frame.width / d.nw, d.frame.height / d.nh)
    const overflow = d.nh * scale - d.frame.height
    const posY = d.objectPosition.split(' ')[1] || '50%'
    const frac = parseFloat(posY) / 100
    const srcTop = (overflow * frac) / scale
    const srcBottom = (overflow * frac + d.frame.height) / scale

    const crownVisible = srcTop < HEAD.crown
    const chinVisible = srcBottom > HEAD.chin
    const headroom = HEAD.crown - srcTop

    record(
      `[${vp.name}] Top of head visible (not cropped to forehead)`,
      crownVisible,
      `crop starts at source row ${srcTop.toFixed(0)}, crown at ${HEAD.crown} → ${headroom.toFixed(0)} rows of headroom`
    )
    record(
      `[${vp.name}] Chin visible`,
      chinVisible,
      `crop ends at source row ${srcBottom.toFixed(0)}, chin at ${HEAD.chin}`
    )

    const eyePct = ((HEAD.eyes - srcTop) / (srcBottom - srcTop)) * 100
    record(
      `[${vp.name}] Eyeline in upper third (natural portrait framing)`,
      eyePct > 25 && eyePct < 40,
      `eyes at ${eyePct.toFixed(0)}% from frame top`
    )

    console.log(
      `  geometry: frame ${d.frame.width}x${d.frame.height}, object-position ${d.objectPosition}, visible source rows ${srcTop.toFixed(0)}..${srcBottom.toFixed(0)} of ${d.nh}`
    )

    await page.screenshot({ path: `/tmp/about-verify-${vp.name}.png` })
    await page.locator('#about img').first().screenshot({
      path: `/tmp/about-verify-portrait-${vp.name}.png`,
    })

    await page.close()
  }

  await browser.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  fs.writeFileSync('/tmp/about-verify-results.json', JSON.stringify(results, null, 2))
  process.exit(failed.length ? 1 : 0)
})()
