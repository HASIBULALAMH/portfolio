/**
 * Probe: About section — column top alignment and portrait crop geometry.
 *
 * Reports the rendered container box, the natural size of the loaded portrait,
 * and derives which slice of the source survives object-cover, so crop claims
 * rest on numbers rather than on eyeballing a screenshot.
 */
const { chromium } = require('playwright')

const FRONTEND = 'http://localhost:3000'

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

;(async () => {
  const browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 60000 })

    await page.locator('#about').scrollIntoViewIfNeeded()
    // Let the entrance animations settle so measured y is the resting value.
    await page.waitForTimeout(2500)

    const data = await page.evaluate(() => {
      const about = document.querySelector('#about')
      const grid = about.querySelector('.grid')
      const cols = Array.from(grid.children)
      const img = about.querySelector('img')

      // The motion.div carrying the fixed height is the visual portrait frame.
      const frame = img?.closest('div')

      const box = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          top: +r.top.toFixed(1),
          left: +r.left.toFixed(1),
          width: +r.width.toFixed(1),
          height: +r.height.toFixed(1),
        }
      }

      const imgStyle = img ? getComputedStyle(img) : null

      return {
        gridAlign: getComputedStyle(grid).alignItems,
        colCount: cols.length,
        col0: box(cols[0]),
        col1: box(cols[1]),
        col0Transform: getComputedStyle(cols[0]).transform,
        col1Transform: getComputedStyle(cols[1]).transform,
        frame: box(frame),
        img: box(img),
        objectFit: imgStyle?.objectFit,
        objectPosition: imgStyle?.objectPosition,
        naturalWidth: img?.naturalWidth,
        naturalHeight: img?.naturalHeight,
        src: img?.getAttribute('src'),
        bioText: Array.from(about.querySelectorAll('p'))
          .map((p) => p.innerText.trim())
          .filter(Boolean)
          .slice(0, 2),
      }
    })

    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`)
    console.log(`  align-items: ${data.gridAlign}`)
    console.log(`  col0 (image): top=${data.col0?.top} h=${data.col0?.height} transform=${data.col0Transform}`)
    console.log(`  col1 (text):  top=${data.col1?.top} h=${data.col1?.height} transform=${data.col1Transform}`)
    console.log(`  top delta: ${(data.col0.top - data.col1.top).toFixed(1)}px`)
    console.log(`  frame: ${data.frame?.width}x${data.frame?.height} at top=${data.frame?.top}`)
    console.log(`  object-fit: ${data.objectFit}  object-position: ${data.objectPosition}`)
    console.log(`  natural: ${data.naturalWidth}x${data.naturalHeight}  src=${data.src?.slice(0, 80)}`)
    console.log(`  bio paragraphs rendered: ${data.bioText.length}`)

    // Derive the surviving vertical slice of the source under object-cover.
    if (data.frame && data.naturalWidth) {
      const { width: cw, height: ch } = data.frame
      const scale = Math.max(cw / data.naturalWidth, ch / data.naturalHeight)
      const scaledH = data.naturalHeight * scale
      const overflow = scaledH - ch
      const posY = data.objectPosition.split(' ')[1] || '50%'
      const frac = posY.endsWith('%') ? parseFloat(posY) / 100 : 0.5
      const offset = overflow * frac
      const srcTop = offset / scale
      const srcBottom = (offset + ch) / scale
      console.log(`  cover scale=${scale.toFixed(3)} scaledH=${scaledH.toFixed(1)} overflow=${overflow.toFixed(1)}px`)
      console.log(`  visible source rows: ${srcTop.toFixed(0)} .. ${srcBottom.toFixed(0)} of ${data.naturalHeight}`)
    }

    await page.locator('#about').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `/tmp/about-${vp.name}.png` })
    const frameEl = page.locator('#about img').first()
    await frameEl.screenshot({ path: `/tmp/about-portrait-${vp.name}.png` })

    await page.close()
  }

  await browser.close()
  console.log('\nScreenshots: /tmp/about-{desktop,mobile}.png, /tmp/about-portrait-{desktop,mobile}.png')
})()
