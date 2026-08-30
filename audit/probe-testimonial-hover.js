/**
 * The path the earlier probes never exercised: a transition that happens while
 * the pointer is PARKED OVER the card.
 *
 * Why that matters here. The card is
 *   <motion.figure whileHover={{ y: -4 }} className="card-hover ... transition-all duration-300">
 * and `.card-hover` itself expands to `transition-all duration-300` plus a
 * `:hover { -translate-y-1 }`. So during a hovered transition there are FOUR
 * writers fighting over one transform:
 *   1. framer's entrance keyframes  (y: 20 -> 0)
 *   2. framer's whileHover          (y: -4)
 *   3. CSS :hover translate-y-1     (-4px, via the class)
 *   4. CSS transition-all           (re-interpolates 1-3 over 300ms)
 * A CSS transition on `transform` re-animates every inline transform framer
 * writes, which can read on screen as the entrance stuttering / replaying.
 *
 * Modes:
 *   hover  - park the pointer on the card, let autoplay advance underneath it
 *   stress - rapid nav clicks, no dwell, to force enter/exit collisions
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, 'logs')
const URL = process.env.URL || 'http://localhost:3000'

// Import the recorder rather than regex-scraping it out of the other file's
// source: scraping re-processes the backslash escapes in the transform-matrix
// regex, which silently broke the y column (every frame read y=0) in an
// earlier run of this probe.
const { INSTALL } = require('./probe-testimonial-restart.js')

function findRestarts(frames, { opTol = 0.06, yTol = 3 } = {}) {
  const events = []
  let peakOp = 0
  let minY = Infinity
  let author = null
  for (const f of frames) {
    if (f.cards.length !== 1) {
      peakOp = 0
      minY = Infinity
      author = f.cards[0]?.author ?? null
      continue
    }
    const c = f.cards[0]
    if (c.author !== author) {
      author = c.author
      peakOp = c.op
      minY = c.y
      continue
    }
    if (peakOp - c.op > opTol && peakOp > 0.15 && peakOp < 0.995) {
      events.push({ t: f.t, kind: 'opacity-drop', author: c.author, from: peakOp, to: c.op })
    }
    if (c.y - minY > yTol && minY < 18) {
      events.push({ t: f.t, kind: 'y-reset', author: c.author, from: minY, to: c.y })
    }
    peakOp = Math.max(peakOp, c.op)
    minY = Math.min(minY, c.y)
  }
  return events
}

;(async () => {
  const mode = process.argv[2] || 'hover'
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.locator('#testimonials').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)

  const card = page.locator('#testimonials figure').last()

  if (mode === 'hover') {
    // Park the pointer dead centre of the card BEFORE recording, so the
    // hover state is already settled and we only observe the transition.
    const box = await card.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(600)
    await page.evaluate(INSTALL)
    await page.waitForTimeout(12000) // two autoplay advances under the cursor
  } else {
    await page.evaluate(INSTALL)
    const n = await page.locator('#testimonials button[aria-label^="Show testimonial"]').count()
    // No dwell: hammer the dots so an exit is still running when the next
    // enter is requested.
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < n; i++) {
        await page
          .locator(`#testimonials button[aria-label="Show testimonial ${i + 1}"]`)
          .click({ force: true })
        await page.waitForTimeout(120)
      }
    }
    await page.waitForTimeout(1500)
  }

  await page.evaluate('window.__recOn = false')
  const frames = await page.evaluate('window.__frames')
  const mounts = await page.evaluate('window.__mounts')
  const restarts = findRestarts(frames)

  const heights = frames.map((f) => f.gridH).filter((h) => h > 0)
  const dotsYs = frames.map((f) => f.dotsY).filter((y) => y > 0)
  const ys = frames.flatMap((f) => f.cards.map((c) => c.y))

  const out = {
    mode,
    url: URL,
    frameCount: frames.length,
    maxMountedPerFrame: Math.max(...frames.map((f) => f.cards.length), 0),
    mountsAdded: mounts.filter((m) => m.type === 'add').length,
    gridHRange: +(Math.max(...heights) - Math.min(...heights)).toFixed(2),
    dotsYRange: +(Math.max(...dotsYs) - Math.min(...dotsYs)).toFixed(2),
    yObserved: { min: Math.min(...ys), max: Math.max(...ys) },
    restartEvents: restarts.length,
    restarts: restarts.slice(0, 40),
  }
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(
    path.join(OUT, `testimonial-hover-${mode}.json`),
    JSON.stringify({ ...out, frames }, null, 2),
  )
  console.log(JSON.stringify(out, null, 2))
  await browser.close()
})()
