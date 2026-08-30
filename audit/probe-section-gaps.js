/**
 * Probe: vertical rhythm between homepage sections.
 *
 * Sections stack flush (no margins), so the bounding-box "gap" is always 0 —
 * the visible whitespace is section A's padding-bottom plus section B's
 * padding-top, and, where a section is `min-h-screen` with centred content,
 * the extra slack that centring leaves above and below.
 *
 * So this measures the honest number: the distance from the lowest real
 * content pixel in one section to the highest real content pixel in the next.
 * Decorative layers (aria-hidden backdrops, absolutely-positioned glows) are
 * excluded, otherwise a full-bleed background would report a gap of zero.
 */
const { chromium } = require('playwright')

const FRONTEND = process.env.FE_URL || 'http://localhost:3000'
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

const measure = () => {
  const blocks = [
    ...document.querySelectorAll('main > section'),
    ...document.querySelectorAll('main > footer'),
  ]

  // The union of in-flow descendant boxes. Absolutely-positioned and
  // aria-hidden nodes are backdrops; they span the whole section and would mask
  // the real whitespace. Everything still in flow contributes, so form fields
  // and icon tiles count as content even though they carry no text.
  const contentBounds = (root) => {
    let top = Infinity
    let bottom = -Infinity
    const walk = (el, isRoot) => {
      if (!isRoot) {
        if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') return
        if (cs.position === 'absolute' || cs.position === 'fixed') return
        const r = el.getBoundingClientRect()
        if (r.height > 0) {
          top = Math.min(top, r.top)
          bottom = Math.max(bottom, r.bottom)
        }
      }
      for (const c of el.children) walk(c, false)
    }
    walk(root, true)
    return { top, bottom }
  }

  return blocks.map((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const c = contentBounds(el)
    return {
      id: el.id || el.tagName.toLowerCase(),
      top: +r.top.toFixed(1),
      bottom: +r.bottom.toFixed(1),
      height: +r.height.toFixed(1),
      pt: parseFloat(cs.paddingTop),
      pb: parseFloat(cs.paddingBottom),
      minH: cs.minHeight,
      contentTop: isFinite(c.top) ? +c.top.toFixed(1) : null,
      contentBottom: isFinite(c.bottom) ? +c.bottom.toFixed(1) : null,
    }
  })
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const out = {}

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 60000 })

    // Reveal animations gate on scroll; walk the page so every section settles
    // at its resting height before anything is measured.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(1200)

    const data = await page.evaluate(measure)
    out[vp.name] = data

    console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ===\n`)
    console.log('Section        Height     PT     PB   min-height')
    console.log('─'.repeat(52))
    data.forEach((d) =>
      console.log(
        `${d.id.padEnd(13)} ${String(d.height).padStart(8)} ${String(d.pt).padStart(6)} ` +
          `${String(d.pb).padStart(6)}   ${d.minH}`
      )
    )

    console.log(`\n${'Adjacent pair'.padEnd(30)} ${'pad band'.padStart(9)} ${'content gap'.padStart(12)}`)
    console.log('─'.repeat(54))
    let total = 0
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i]
      const b = data[i + 1]
      const padBand = a.pb + b.pt
      const contentGap = b.contentTop - a.contentBottom
      total += contentGap
      console.log(
        `${`${a.id} → ${b.id}`.padEnd(30)} ${String(padBand).padStart(9)} ${contentGap.toFixed(1).padStart(12)}`
      )
    }
    console.log('─'.repeat(54))
    console.log(`${'TOTAL content whitespace'.padEnd(30)} ${''.padStart(9)} ${total.toFixed(1).padStart(12)}`)
    console.log(`page scrollHeight: ${await page.evaluate(() => document.body.scrollHeight)}px`)

    await page.close()
  }

  await browser.close()
  require('fs').writeFileSync('/tmp/section-gaps.json', JSON.stringify(out, null, 2))
})()
