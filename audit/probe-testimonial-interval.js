/**
 * Precisely tests the autoplay-interval interaction with manual navigation.
 *
 * Method: detect the exact wall-clock moment of an autoplay tick (via
 * aria-current changing), then wait a KNOWN offset into the next 5s cycle and
 * click a dot. Log every subsequent index change with its timestamp.
 *
 * If the interval is reset on manual nav, the next automatic advance comes
 * ~5000ms after the click. If it is NOT reset, it comes (5000 - offset)ms
 * after the click -- i.e. a second advance lands while the first is still
 * animating, and the intermediate card is never seen.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const INSTRUMENT = `
window.__ev = []
const section = document.querySelector('#testimonials')
const dotsOf = () => [...section.querySelectorAll('button[aria-label^="Show testimonial"]')]
const activeDot = () => dotsOf().findIndex((d) => d.getAttribute('aria-current') === 'true')
const author = () => section.querySelector('figure figcaption div')?.textContent?.trim() ?? null
window.__mark = (why) => window.__ev.push({ t: Math.round(performance.now()), why, dot: activeDot(), author: author() })
let lastDot = activeDot()
let lastAuthor = author()
window.__poll = setInterval(() => {
  const d = activeDot(), a = author()
  if (d !== lastDot) { window.__ev.push({ t: Math.round(performance.now()), why: 'INDEX-CHANGE', dot: d, author: a }); lastDot = d }
  if (a !== lastAuthor) { window.__ev.push({ t: Math.round(performance.now()), why: 'CARD-CHANGE', dot: d, author: a }); lastAuthor = a }
}, 8)
true
`

// Resolve once the aria-current index changes, returning the timestamp.
const WAIT_TICK = `new Promise((resolve) => {
  const section = document.querySelector('#testimonials')
  const dots = [...section.querySelectorAll('button[aria-label^="Show testimonial"]')]
  const active = () => dots.findIndex((d) => d.getAttribute('aria-current') === 'true')
  const start = active()
  const id = setInterval(() => {
    if (active() !== start) { clearInterval(id); resolve(Math.round(performance.now())) }
  }, 5)
})`

async function scenario(page, offsetMs, label) {
  await page.reload({ waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1200)
  await page.evaluate(INSTRUMENT)

  // Sync to an autoplay tick so we know exactly where we are in the 5s cycle.
  const tickAt = await page.evaluate(WAIT_TICK)
  await page.evaluate((t) => window.__mark('autoplay-tick-sync@' + t), tickAt)

  // Wait `offsetMs` into the fresh cycle, then click the NEXT dot manually.
  await page.waitForTimeout(offsetMs)
  const target = await page.evaluate(() => {
    const dots = [...document.querySelectorAll('#testimonials button[aria-label^="Show testimonial"]')]
    const cur = dots.findIndex((d) => d.getAttribute('aria-current') === 'true')
    return (cur + 1) % dots.length
  })
  await page.evaluate((i) => window.__mark('CLICK-dot-' + i), target)
  const clickAt = await page.evaluate(() => Math.round(performance.now()))
  await page.locator('#testimonials button[aria-label^="Show testimonial"]').nth(target).click()

  // Watch for 6.5s: long enough to see whether the next auto advance lands at
  // click+5000 (interval reset) or at tick+10000 (interval free-running).
  await page.waitForTimeout(6500)
  const ev = await page.evaluate(() => { clearInterval(window.__poll); return window.__ev })

  console.log(`\n=== ${label} : manual click at +${offsetMs}ms into the 5s cycle ===`)
  console.log(`   tick synced at t=${tickAt}ms, click issued at t=${clickAt}ms (offset ${clickAt - tickAt}ms)`)
  ev.forEach((e) =>
    console.log(`   t=${String(e.t).padStart(6)} (tick+${String(e.t - tickAt).padStart(5)}) (click+${String(e.t - clickAt).padStart(5)}) ${e.why.padEnd(22)} dot=${e.dot} card=${e.author}`),
  )

  const idxChanges = ev.filter((e) => e.why === 'INDEX-CHANGE')
  const cardChanges = ev.filter((e) => e.why === 'CARD-CHANGE')
  const afterClick = idxChanges.filter((e) => e.t > clickAt)
  console.log(`   -> index changes after click: ${afterClick.length}`)
  afterClick.forEach((e) => console.log(`        dot=${e.dot} at click+${e.t - clickAt}ms  (tick+${e.t - tickAt}ms)`))
  console.log(`   -> cards actually rendered after click: ${cardChanges.filter((e) => e.t > clickAt).map((e) => e.author).join(' -> ') || '(none)'}`)

  return { label, offsetMs, tickAt, clickAt, ev }
}

async function run() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })

  const out = []
  // Click late in the cycle: the free-running interval should fire ~200-700ms later.
  out.push(await scenario(page, 4300, 'LATE CLICK'))
  // Click early in the cycle: plenty of time, so one clean advance expected.
  out.push(await scenario(page, 800, 'EARLY CLICK'))

  fs.writeFileSync(path.join(__dirname, 'logs', 'testimonial-interval.json'), JSON.stringify(out, null, 2))
  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
