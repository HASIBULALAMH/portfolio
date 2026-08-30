/**
 * Probe: pre-change baseline for homepage section rhythm.
 *
 * Re-creates the original spacing by injecting the legacy CSS rather than by
 * reverting eight files, so the baseline is measured through the exact same
 * scroll-and-settle routine as the post-change run. Measuring the two states
 * with different reveal conditions produces a bogus reduction figure — the
 * reveal animations hold a residual y-transform until they have played, which
 * shifts every content box by ~30px.
 *
 * Legacy values: hero pt-24 pb-16; about min-h-screen + flex-centred +
 * py-20 md:py-32; every other section py-24.
 */
const { chromium } = require('playwright')

const FRONTEND = process.env.FE_URL || 'http://localhost:3000'

const LEGACY_CSS = `
  #home { padding-bottom: 64px !important; }
  #about {
    min-height: 100vh !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding-top: 80px !important;
    padding-bottom: 80px !important;
  }
  @media (min-width: 768px) {
    #about { padding-top: 128px !important; padding-bottom: 128px !important; }
  }
  #skills, #apis, #projects, #journey, #testimonials, #contact {
    padding-top: 96px !important;
    padding-bottom: 96px !important;
  }
`

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

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
      height: +r.height.toFixed(1),
      pt: parseFloat(cs.paddingTop),
      pb: parseFloat(cs.paddingBottom),
      contentTop: +c.top.toFixed(1),
      contentBottom: +c.bottom.toFixed(1),
    }
  })
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const legacy = process.argv.includes('--legacy')

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 60000 })
    if (legacy) await page.addStyleTag({ content: LEGACY_CSS })
    await page.waitForTimeout(1200)

    const total = await page.evaluate(() => document.body.scrollHeight)
    for (let y = 0; y < total; y += Math.round(vp.height / 3)) {
      await page.mouse.wheel(0, Math.round(vp.height / 3))
      await page.waitForTimeout(200)
    }
    await page.waitForTimeout(1000)

    const data = await page.evaluate(measure)
    console.log(`\n=== ${vp.name} (${vp.width}×${vp.height}) ${legacy ? '[LEGACY]' : '[CURRENT]'} ===`)
    console.log(`${'pair'.padEnd(28)} ${'gap'.padStart(8)}`)
    console.log('─'.repeat(38))
    let sum = 0
    for (let i = 0; i < data.length - 1; i++) {
      const gap = +(data[i + 1].contentTop - data[i].contentBottom).toFixed(1)
      sum += gap
      console.log(`${`${data[i].id} → ${data[i + 1].id}`.padEnd(28)} ${gap.toFixed(1).padStart(8)}`)
    }
    console.log('─'.repeat(38))
    console.log(`${'TOTAL'.padEnd(28)} ${sum.toFixed(1).padStart(8)}`)
    console.log(`scrollHeight: ${await page.evaluate(() => document.body.scrollHeight)}px`)
    await page.close()
  }

  await browser.close()
})()
