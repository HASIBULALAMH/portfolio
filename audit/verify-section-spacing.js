/**
 * Verification: homepage section vertical rhythm.
 *
 * Sections stack flush, so the visible gap is section A's padding-bottom plus
 * section B's padding-top — measured here as the distance between the lowest
 * in-flow content box in A and the highest in B. Decorative absolutely-
 * positioned/aria-hidden backdrops are excluded; they span the whole section
 * and would report a gap of zero.
 *
 * Baseline (pre-change) totals are hard-coded from probe-section-gaps.js so the
 * reduction can be asserted rather than eyeballed.
 */
const { chromium } = require('playwright')
const fs = require('fs')

const FRONTEND = process.env.FE_URL || 'http://localhost:3000'

// Measured before the change with probe-section-gaps-baseline.js --legacy,
// which injects the original CSS and runs the identical scroll-and-settle
// routine. Taking the baseline any other way understates the reduction: the
// reveal animations hold a residual y-transform until they have played, which
// shifts every content box by ~30px and corrupts the comparison.
const BASELINE = { desktop: 1671.0, mobile: 1377.0 }

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, expectPad: 64 },
  { name: 'mobile', width: 390, height: 844, expectPad: 48 },
]

// Hero keeps min-h-screen by design, so it is excluded from the uniform-padding
// assertion; its bottom padding is still expected to match the scale.
const CONTENT_SECTIONS = ['about', 'skills', 'apis', 'projects', 'journey', 'testimonials', 'contact']

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const measure = () => {
  const blocks = [
    ...document.querySelectorAll('main > section'),
    ...document.querySelectorAll('main > footer'),
  ]
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
      contentTop: +c.top.toFixed(1),
      contentBottom: +c.bottom.toFixed(1),
    }
  })
}

;(async () => {
  const browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ===`)
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForTimeout(1200)

    // Lenis intercepts window.scrollTo; wheel events in small steps are what
    // actually drive the reveal animations to their resting state.
    const total = await page.evaluate(() => document.body.scrollHeight)
    for (let y = 0; y < total; y += Math.round(vp.height / 3)) {
      await page.mouse.wheel(0, Math.round(vp.height / 3))
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(1000)

    const data = await page.evaluate(measure)
    const byId = Object.fromEntries(data.map((d) => [d.id, d]))

    // --- Check 1: every content section shares one padding value ---
    const pads = CONTENT_SECTIONS.filter((id) => byId[id]).map((id) => ({
      id,
      pt: byId[id].pt,
      pb: byId[id].pb,
    }))
    const uniform = pads.every((p) => p.pt === vp.expectPad && p.pb === vp.expectPad)
    record(
      `[${vp.name}] All content sections use the same ${vp.expectPad}px vertical padding`,
      uniform,
      pads.map((p) => `${p.id}=${p.pt}/${p.pb}`).join(' ')
    )

    // --- Check 2: no leftover min-height on content sections ---
    const stillFullHeight = CONTENT_SECTIONS.filter(
      (id) => byId[id] && byId[id].minH !== '0px' && byId[id].minH !== 'auto'
    )
    record(
      `[${vp.name}] No content section is forced to viewport height`,
      stillFullHeight.length === 0,
      stillFullHeight.length ? `still min-height: ${stillFullHeight.join(', ')}` : 'all content-sized'
    )

    // --- Check 3: total whitespace meaningfully reduced ---
    const gaps = []
    for (let i = 0; i < data.length - 1; i++) {
      gaps.push({
        pair: `${data[i].id}→${data[i + 1].id}`,
        gap: +(data[i + 1].contentTop - data[i].contentBottom).toFixed(1),
      })
    }
    const totalGap = +gaps.reduce((s, g) => s + g.gap, 0).toFixed(1)
    const reduction = ((BASELINE[vp.name] - totalGap) / BASELINE[vp.name]) * 100
    record(
      `[${vp.name}] Total inter-section whitespace reduced by ≥30%`,
      reduction >= 30,
      `${BASELINE[vp.name]}px → ${totalGap}px (−${reduction.toFixed(1)}%)`
    )

    // --- Check 4: gaps consistent across pairs ---
    // home→about is excluded: Hero is min-h-screen by design, so its centring
    // slack is intentional and not part of the padding rhythm.
    const rhythm = gaps.filter((g) => !g.pair.startsWith('home→') && !g.pair.endsWith('→footer'))
    const min = Math.min(...rhythm.map((g) => g.gap))
    const max = Math.max(...rhythm.map((g) => g.gap))
    record(
      `[${vp.name}] Inter-section gaps consistent (spread ≤40px)`,
      max - min <= 40,
      `min=${min}px max=${max}px spread=${(max - min).toFixed(1)}px across ${rhythm.length} pairs`
    )

    // --- Check 5: content is not cramped against section edges ---
    const cramped = CONTENT_SECTIONS.filter((id) => {
      const d = byId[id]
      if (!d) return false
      const headroom = d.contentTop - d.top
      const legroom = d.bottom - d.contentBottom
      return headroom < 24 || legroom < 24
    })
    record(
      `[${vp.name}] Every section keeps ≥24px breathing room around its content`,
      cramped.length === 0,
      cramped.length
        ? `cramped: ${cramped.join(', ')}`
        : CONTENT_SECTIONS.filter((id) => byId[id])
            .map((id) => `${id}=${(byId[id].contentTop - byId[id].top).toFixed(0)}/${(byId[id].bottom - byId[id].contentBottom).toFixed(0)}`)
            .join(' ')
    )

    console.log(`  gaps: ${gaps.map((g) => `${g.pair} ${g.gap}`).join('  |  ')}`)
    console.log(`  page scrollHeight: ${total}px`)

    await page.close()
  }

  await browser.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  fs.writeFileSync('/tmp/section-spacing-results.json', JSON.stringify(results, null, 2))
  process.exit(failed.length ? 1 : 0)
})()
