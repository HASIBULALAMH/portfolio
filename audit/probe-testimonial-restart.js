/**
 * Targets the SPECIFIC reported signature of Bug 1: the incoming card's
 * entrance animation restarting 2-3x mid-flight.
 *
 * The earlier probe (probe-testimonials-3bugs.js) only asked "are two cards
 * visible at once" and "how many figures exist per frame". Both can be clean
 * while the entrance still restarts, because a restart is ONE element whose
 * own opacity/scale falls back toward its `initial` values partway through.
 * So here we measure monotonicity, not overlap.
 *
 * Three independent instruments:
 *   1. MutationObserver on the live card's container -> counts real DOM
 *      mounts of a <figure>. A restart caused by remounting shows up here.
 *   2. rAF sampler -> opacity + translateY of the live card every frame.
 *      A restart WITHOUT a remount (framer re-running keyframes on the same
 *      node) shows up as a non-monotonic dip.
 *   3. Height/dot-Y per frame, reused for Bug 3.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, 'logs')
const URL = process.env.URL || 'http://localhost:3000'

const INSTALL = `
window.__mounts = []
window.__frames = []
window.__recOn = true

const sec = document.querySelector('#testimonials')
const sizerRoot = sec.querySelector('[aria-hidden="true"]')
const isLive = (n) =>
  n.tagName === 'FIGURE' && (!sizerRoot || !sizerRoot.contains(n))
const liveFigures = () => [...sec.querySelectorAll('figure')].filter(isLive)

const t0 = performance.now()
const now = () => Math.round(performance.now() - t0)

// --- 1. real DOM mounts -------------------------------------------------
new MutationObserver((records) => {
  for (const r of records) {
    for (const n of r.addedNodes) {
      if (n.nodeType === 1 && isLive(n)) {
        window.__mounts.push({
          t: now(),
          type: 'add',
          author: n.querySelector('figcaption div')?.textContent?.trim() ?? null,
        })
      }
    }
    for (const n of r.removedNodes) {
      if (n.nodeType === 1 && n.tagName === 'FIGURE') {
        window.__mounts.push({ t: now(), type: 'remove' })
      }
    }
  }
}).observe(sec, { childList: true, subtree: true })

// --- 2 + 3. per-frame visual state --------------------------------------
// translateY is read out of the computed transform matrix: framer writes
// transform, and a restart resets y back toward its initial 20px.
const yOf = (cs) => {
  const t = cs.transform
  if (!t || t === 'none') return 0
  const m = t.match(/matrix\\(([^)]+)\\)/)
  if (m) return +m[1].split(',')[5]
  const m3 = t.match(/matrix3d\\(([^)]+)\\)/)
  if (m3) return +m3[1].split(',')[13]
  return 0
}

const dots = () => [...sec.querySelectorAll('button[aria-label^="Show testimonial"]')]
const grid = sec.querySelector('.grid')

const tick = () => {
  if (!window.__recOn) return
  const figs = liveFigures()
  const d = dots()
  window.__frames.push({
    t: now(),
    cards: figs.map((f) => {
      const cs = getComputedStyle(f)
      return {
        op: +(+cs.opacity).toFixed(4),
        y: +yOf(cs).toFixed(2),
        author: f.querySelector('figcaption div')?.textContent?.trim() ?? null,
        h: +f.getBoundingClientRect().height.toFixed(1),
      }
    }),
    gridH: grid ? +grid.getBoundingClientRect().height.toFixed(1) : -1,
    secH: +sec.getBoundingClientRect().height.toFixed(1),
    dotsY: d.length ? +(d[0].getBoundingClientRect().top + window.scrollY).toFixed(1) : -1,
    active: d.findIndex((x) => x.getAttribute('aria-current') === 'true'),
  })
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
true
`

/**
 * A restart = while ONE card is mounted and mid-entrance, its opacity drops
 * meaningfully below a level it had already reached (or its y jumps back
 * down toward the +20px initial). Tolerance absorbs sub-pixel/rounding noise.
 */
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
      // new card took over the slot -> reset the running extremes
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

/** Frames where zero cards are visible — the "blank gap" mode="wait" creates. */
function blankGaps(frames, thr = 0.01) {
  const gaps = []
  let run = null
  for (const f of frames) {
    const vis = f.cards.filter((c) => c.op > thr)
    if (vis.length === 0) {
      if (!run) run = { start: f.t, end: f.t, frames: 0 }
      run.end = f.t
      run.frames++
    } else if (run) {
      gaps.push({ ...run, ms: run.end - run.start })
      run = null
    }
  }
  if (run) gaps.push({ ...run, ms: run.end - run.start })
  return gaps
}

function summarise(frames) {
  const heights = frames.map((f) => f.gridH).filter((h) => h > 0)
  const dotsYs = frames.map((f) => f.dotsY).filter((y) => y > 0)
  const range = (a) => (a.length ? +(Math.max(...a) - Math.min(...a)).toFixed(2) : null)
  return {
    frameCount: frames.length,
    maxMountedPerFrame: Math.max(...frames.map((f) => f.cards.length), 0),
    gridH: { min: Math.min(...heights), max: Math.max(...heights), range: range(heights) },
    dotsY: { min: Math.min(...dotsYs), max: Math.max(...dotsYs), range: range(dotsYs) },
  }
}

module.exports = { INSTALL, findRestarts, blankGaps, summarise }

;(async () => {
  if (require.main !== module) return
  const mode = process.argv[2] || 'auto' // auto | click
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(URL, { waitUntil: 'networkidle' })

  await page.locator('#testimonials').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200) // let any scroll-reveal settle

  await page.evaluate(INSTALL)

  if (mode === 'click') {
    // Deterministic transition: click through every dot with enough dwell
    // time for a full 0.5s exit + 0.5s enter.
    const n = await page.locator('#testimonials button[aria-label^="Show testimonial"]').count()
    for (let i = 1; i < n; i++) {
      await page.locator(`#testimonials button[aria-label="Show testimonial ${i + 1}"]`).click()
      await page.waitForTimeout(1600)
    }
    await page.locator('#testimonials button[aria-label="Show testimonial 1"]').click()
    await page.waitForTimeout(1600)
  } else {
    // Two full autoplay cycles (5s interval).
    await page.waitForTimeout(16000)
  }

  await page.evaluate('window.__recOn = false')
  const frames = await page.evaluate('window.__frames')
  const mounts = await page.evaluate('window.__mounts')

  const restarts = findRestarts(frames)
  const gaps = blankGaps(frames)
  const result = {
    mode,
    url: URL,
    ...summarise(frames),
    mountEvents: mounts.length,
    mountsAdded: mounts.filter((m) => m.type === 'add').length,
    mounts,
    restartEvents: restarts.length,
    restarts: restarts.slice(0, 40),
    blankGaps: gaps.filter((g) => g.frames > 1),
  }

  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(
    path.join(OUT, `testimonial-restart-${mode}.json`),
    JSON.stringify({ ...result, frames }, null, 2),
  )
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
})()
