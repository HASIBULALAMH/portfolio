/**
 * Isolates the two suspected mechanisms behind the reported "repeat" + "jerk".
 *
 * Test 1 (swallowed click / double advance): click a dot, then watch whether the
 *   index changes again on its own before the 500ms exit animation completes.
 *   Uses a MutationObserver so nothing is missed between polls.
 *
 * Test 2 (same-card re-mount): click the dot for the card that is CURRENTLY
 *   showing, timed so the autoplay interval fires mid-exit. If the same author
 *   exits and then re-enters, that is a literal repeated card.
 *
 * Test 3 (layout snap): measure the height of the element below the section
 *   during a transition, to quantify the jerk in pixels and in frames.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OBSERVE = `
window.__log = []
window.__t0 = performance.now()
const section = document.querySelector('#testimonials')
const record = (why) => {
  const figs = [...section.querySelectorAll('figure')]
  const dots = [...section.querySelectorAll('button[aria-label^="Show testimonial"]')]
  window.__log.push({
    t: Math.round(performance.now() - window.__t0),
    why,
    n: figs.length,
    authors: figs.map((f) => f.querySelector('figcaption div')?.textContent?.trim()),
    opacities: figs.map((f) => +(+getComputedStyle(f).opacity).toFixed(2)),
    dot: dots.findIndex((d) => d.getAttribute('aria-current') === 'true'),
    secH: Math.round(section.getBoundingClientRect().height),
    nextTop: Math.round(section.nextElementSibling?.getBoundingClientRect().top ?? -1),
  })
}
window.__record = record
new MutationObserver((muts) => {
  const added = muts.some((m) => m.addedNodes.length)
  const removed = muts.some((m) => m.removedNodes.length)
  record(added && removed ? 'mut:swap' : added ? 'mut:add' : removed ? 'mut:remove' : 'mut:attr')
}).observe(section, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] })
record('init')
true
`

async function run() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1500)

  const results = {}

  // ---------- Test 1: swallowed click / double advance ----------
  await page.evaluate(OBSERVE)
  // Land the click roughly 300ms before the next interval tick.
  const dots = page.locator('#testimonials button[aria-label^="Show testimonial"]')
  await page.waitForTimeout(4600)
  await page.evaluate(() => window.__record('about-to-click'))
  await dots.nth(1).click()
  await page.evaluate(() => window.__record('clicked-dot-1'))
  await page.waitForTimeout(1500)
  results.test1 = await page.evaluate(() => window.__log)

  // ---------- Test 2: same-card re-mount ----------
  await page.reload({ waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1200)
  await page.evaluate(OBSERVE)
  // Wait until the interval is about to fire, then click the dot of the card
  // that is currently displayed (a no-op click, index unchanged).
  await page.waitForTimeout(4500)
  const activeNow = await page.evaluate(() => {
    const dots = [...document.querySelectorAll('#testimonials button[aria-label^="Show testimonial"]')]
    return dots.findIndex((d) => d.getAttribute('aria-current') === 'true')
  })
  await page.evaluate((i) => window.__record('about-to-click-active-' + i), activeNow)
  await dots.nth(activeNow).click()
  await page.waitForTimeout(2000)
  results.test2 = { activeNow, log: await page.evaluate(() => window.__log) }

  // ---------- Test 3: layout snap, per animation frame ----------
  await page.reload({ waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1200)
  const snap = await page.evaluate(async () => {
    const section = document.querySelector('#testimonials')
    const container = section.querySelector('figure').parentElement
    const out = []
    const t0 = performance.now()
    return await new Promise((resolve) => {
      const tick = () => {
        const fig = section.querySelector('figure')
        out.push({
          t: Math.round(performance.now() - t0),
          author: fig?.querySelector('figcaption div')?.textContent?.trim() ?? null,
          figH: fig ? Math.round(fig.getBoundingClientRect().height) : null,
          contH: Math.round(container.getBoundingClientRect().height),
          secH: Math.round(section.getBoundingClientRect().height),
          nextTop: Math.round(section.nextElementSibling?.getBoundingClientRect().top ?? -1),
        })
        if (performance.now() - t0 < 7000) requestAnimationFrame(tick)
        else resolve(out)
      }
      requestAnimationFrame(tick)
    })
  })
  results.test3 = snap

  // ---------- computed styles / min-height check ----------
  results.styles = await page.evaluate(() => {
    const section = document.querySelector('#testimonials')
    const fig = section.querySelector('figure')
    const container = fig.parentElement
    const cs = getComputedStyle(container)
    return {
      containerClass: container.className,
      containerMinHeight: cs.minHeight,
      containerHeight: cs.height,
      containerPosition: cs.position,
      figureHeight: getComputedStyle(fig).height,
      figurePosition: getComputedStyle(fig).position,
      figureTransition: getComputedStyle(fig).transition,
    }
  })

  fs.writeFileSync(
    path.join(__dirname, 'logs', 'testimonial-repeat.json'),
    JSON.stringify(results, null, 2),
  )
  await browser.close()

  // ---- report ----
  console.log('=== computed styles ===')
  console.log(JSON.stringify(results.styles, null, 2))

  const show = (log) =>
    log.forEach((e) =>
      console.log(
        `  t=${String(e.t).padStart(5)} ${e.why.padEnd(20)} n=${e.n} dot=${e.dot} secH=${e.secH} nextTop=${e.nextTop} authors=${JSON.stringify(e.authors)} op=${JSON.stringify(e.opacities)}`,
      ),
    )

  console.log('\n=== TEST 1: click dot 1 ~300ms before interval tick ===')
  show(results.test1.filter((e, i, a) => i === 0 || JSON.stringify(e) !== JSON.stringify(a[i - 1])))

  console.log(`\n=== TEST 2: click the ALREADY-ACTIVE dot (${results.test2.activeNow}) just before tick ===`)
  show(results.test2.log)

  console.log('\n=== TEST 3: rAF layout trace, height changes only ===')
  let prev = null
  const changes = []
  for (const f of results.test3) {
    const k = `${f.author}|${f.figH}|${f.contH}|${f.secH}`
    if (k !== prev) {
      changes.push(f)
      prev = k
    }
  }
  changes.forEach((f) =>
    console.log(
      `  t=${String(f.t).padStart(5)}ms author=${String(f.author).padEnd(16)} figH=${f.figH} contH=${f.contH} secH=${f.secH} nextTop=${f.nextTop}`,
    ),
  )

  // Quantify the snap: largest single-frame jump in nextTop
  let worst = { d: 0 }
  for (let i = 1; i < results.test3.length; i++) {
    const d = results.test3[i].nextTop - results.test3[i - 1].nextTop
    if (Math.abs(d) > Math.abs(worst.d)) {
      worst = { d, from: results.test3[i - 1], to: results.test3[i] }
    }
  }
  if (worst.from) {
    const dt = worst.to.t - worst.from.t
    console.log(
      `\n  worst single-frame shift of content below section: ${worst.d}px in ${dt}ms ` +
        `(${worst.from.author} -> ${worst.to.author})`,
    )
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
