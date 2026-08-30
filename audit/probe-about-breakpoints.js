/** Probe: About column height parity across the md breakpoint edge. */
const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch({ headless: true })
  for (const w of [767, 768, 1024, 1920]) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 } })
    await p.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })
    await p.locator('#about').scrollIntoViewIfNeeded()
    await p.waitForTimeout(2000)
    const d = await p.evaluate(() => {
      const g = document.querySelector('#about .grid')
      const c = [...g.children].map((e) => {
        const r = e.getBoundingClientRect()
        return { t: +r.top.toFixed(1), h: +r.height.toFixed(1) }
      })
      const img = document.querySelector('#about img')
      const f = img.closest('div').getBoundingClientRect()
      return { align: getComputedStyle(g).alignItems, c, fw: +f.width.toFixed(1), fh: +f.height.toFixed(1) }
    })
    const side = d.c[0].t === d.c[1].t
    console.log(
      `w=${String(w).padStart(4)} ${side ? 'side-by-side' : 'stacked     '}` +
        ` img h=${String(d.c[0].h).padStart(6)} text h=${String(d.c[1].h).padStart(6)}` +
        ` delta=${Math.abs(d.c[0].h - d.c[1].h).toFixed(1).padStart(5)}` +
        ` frame=${d.fw}x${d.fh} align=${d.align}`
    )
    await p.screenshot({ path: `/tmp/edge-${w}.png` })
    await p.close()
  }
  await b.close()
})()
