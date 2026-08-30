/**
 * Captures the two interactions that produce a visible "repeated card", and
 * measures card heights at every breakpoint so the fix can be sized correctly.
 *
 * R1 - click the dot of the card that is CURRENTLY EXITING (a very natural
 *      action: autoplay advances just as the user reaches for the dot they
 *      were reading). Does that card exit and then re-enter = literal repeat?
 *
 * R2 - click ~1.2s before the free-running interval tick, so the newly chosen
 *      card mounts, partially fades in, and is then yanked away = the "flash
 *      of the wrong slide".
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const INSTRUMENT = `
window.__ev = []
const section = document.querySelector('#testimonials')
const dots = () => [...section.querySelectorAll('button[aria-label^="Show testimonial"]')]
const active = () => dots().findIndex((d) => d.getAttribute('aria-current') === 'true')
const fig = () => section.querySelector('figure')
const author = () => fig()?.querySelector('figcaption div')?.textContent?.trim() ?? null
window.__mark = (why) => window.__ev.push({
  t: Math.round(performance.now()), why, dot: active(), author: author(),
  op: fig() ? +(+getComputedStyle(fig()).opacity).toFixed(2) : null,
  n: section.querySelectorAll('figure').length,
  secH: Math.round(section.getBoundingClientRect().height),
})
window.__poll = setInterval(() => window.__mark('sample'), 25)
true
`

const WAIT_TICK = `new Promise((resolve) => {
  const section = document.querySelector('#testimonials')
  const dots = [...section.querySelectorAll('button[aria-label^="Show testimonial"]')]
  const active = () => dots.findIndex((d) => d.getAttribute('aria-current') === 'true')
  const start = active()
  const id = setInterval(() => {
    if (active() !== start) { clearInterval(id); resolve({ t: Math.round(performance.now()), from: start, to: active() }) }
  }, 4)
})`

// Collapse consecutive identical samples so the log is readable.
function condense(ev) {
  const out = []
  for (const e of ev) {
    const prev = out[out.length - 1]
    const same = prev && prev.author === e.author && prev.dot === e.dot &&
      prev.n === e.n && prev.secH === e.secH &&
      Math.abs((prev.op ?? 0) - (e.op ?? 0)) < 0.12 && e.why === 'sample' && prev.why === 'sample'
    if (same) { prev.tEnd = e.t; continue }
    out.push({ ...e })
  }
  return out
}

function show(ev, t0) {
  condense(ev).forEach((e) => {
    const span = e.tEnd ? `..${String(e.tEnd - t0).padStart(5)}` : '      '
    console.log(
      `   t=${String(e.t - t0).padStart(5)}${span} ${e.why.padEnd(22)} n=${e.n} dot=${e.dot} op=${String(e.op).padEnd(4)} secH=${e.secH} card=${e.author}`,
    )
  })
}

async function prep(page) {
  await page.reload({ waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1200)
  await page.evaluate(INSTRUMENT)
}

async function run() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })

  const results = {}

  // ---------------- R1: click the dot of the exiting card ----------------
  await prep(page)
  const tick1 = await page.evaluate(WAIT_TICK)
  // The card for `tick1.from` is now exiting (500ms exit). Click its dot 180ms in.
  await page.waitForTimeout(180)
  await page.evaluate((i) => window.__mark('CLICK-dot-of-EXITING-card-' + i), tick1.from)
  await page.locator('#testimonials button[aria-label^="Show testimonial"]').nth(tick1.from).click()
  await page.waitForTimeout(2600)
  results.R1 = { tick: tick1, ev: await page.evaluate(() => { clearInterval(window.__poll); return window.__ev }) }

  console.log(`\n=== R1: autoplay advanced dot ${tick1.from} -> ${tick1.to}; 180ms later user clicks dot ${tick1.from} (the exiting card) ===`)
  show(results.R1.ev, tick1.t)

  // ---------------- R2: click ~1.2s before the free-running tick ----------------
  await prep(page)
  const tick2 = await page.evaluate(WAIT_TICK)
  await page.waitForTimeout(3800)
  const target = await page.evaluate(() => {
    const d = [...document.querySelectorAll('#testimonials button[aria-label^="Show testimonial"]')]
    return (d.findIndex((x) => x.getAttribute('aria-current') === 'true') + 1) % d.length
  })
  await page.evaluate((i) => window.__mark('CLICK-dot-' + i), target)
  await page.locator('#testimonials button[aria-label^="Show testimonial"]').nth(target).click()
  await page.waitForTimeout(3200)
  results.R2 = { tick: tick2, target, ev: await page.evaluate(() => { clearInterval(window.__poll); return window.__ev }) }

  console.log(`\n=== R2: click dot ${target} at tick+3800ms (free-running interval fires at tick+5000ms) ===`)
  show(results.R2.ev, tick2.t)

  // ---------------- Breakpoint height survey ----------------
  const BPS = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'laptop', width: 1280, height: 800 },
    { name: 'desktop', width: 1920, height: 1080 },
  ]
  results.heights = {}
  console.log('\n=== card height per testimonial per breakpoint (drives the layout snap) ===')
  for (const bp of BPS) {
    await page.setViewportSize({ width: bp.width, height: bp.height })
    await page.reload({ waitUntil: 'networkidle' })
    await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(1000)
    const per = []
    const n = await page.locator('#testimonials button[aria-label^="Show testimonial"]').count()
    for (let i = 0; i < n; i++) {
      await page.locator('#testimonials button[aria-label^="Show testimonial"]').nth(i).click()
      await page.waitForTimeout(1300)
      const m = await page.evaluate(() => {
        const s = document.querySelector('#testimonials')
        const f = s.querySelector('figure')
        return {
          author: f?.querySelector('figcaption div')?.textContent?.trim(),
          figH: Math.round(f.getBoundingClientRect().height),
          contH: Math.round(f.parentElement.getBoundingClientRect().height),
          secH: Math.round(s.getBoundingClientRect().height),
        }
      })
      per.push(m)
    }
    results.heights[bp.name] = per
    const hs = per.map((p) => p.figH)
    console.log(
      `   ${bp.name.padEnd(8)} (${String(bp.width).padStart(4)}px): ` +
        per.map((p) => `${p.author.split(' ')[0]}=${p.figH}`).join('  ') +
        `   -> spread ${Math.max(...hs) - Math.min(...hs)}px (tallest ${Math.max(...hs)})`,
    )
  }

  fs.writeFileSync(path.join(__dirname, 'logs', 'testimonial-repeat2.json'), JSON.stringify(results, null, 2))
  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
