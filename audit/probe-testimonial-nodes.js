/**
 * Definitive Bug 1 probe: counts ENTRANCE RESTARTS per DOM node, not per author.
 *
 * Why the earlier detector was wrong. It flagged "opacity fell below a peak
 * this author had already reached". Under rapid nav that fires constantly and
 * innocently: with AnimatePresence mode="wait" the outgoing card stays mounted
 * (same author, same node) while its exit animation runs opacity DOWN. A
 * falling opacity is therefore expected, and 4 such "drops" were reported on
 * the dev server that were really just one normal exit.
 *
 * The rigorous signature of the reported bug is a DIRECTION REVERSAL on a
 * single persistent node: opacity climbs, falls back toward `initial`, then
 * climbs again. One entrance = 1 rising run. A card that "restarts its
 * entrance twice" = 3 rising runs on the same node. So:
 *
 *   risingRuns(node) == 1                -> clean single entrance
 *   risingRuns(node) >= 2                -> the reported flicker
 *   monotonic fall at end of life        -> normal exit, ignored
 *
 * Each live <figure> is stamped with a unique __cardId on mount so a remount
 * is never confused with a re-animation of the same element.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, 'logs')
const URL = process.env.URL || 'http://localhost:3000'

const INSTALL = `
window.__frames = []
window.__mounts = []
window.__recOn = true
let __seq = 0

const sec = document.querySelector('#testimonials')
const sizerRoot = sec.querySelector('[aria-hidden="true"]')
const isLive = (n) => n.tagName === 'FIGURE' && (!sizerRoot || !sizerRoot.contains(n))
const liveFigures = () => [...sec.querySelectorAll('figure')].filter(isLive)

const t0 = performance.now()
const now = () => Math.round(performance.now() - t0)

// Stamp every live figure with a stable per-node id so the analysis can tell
// "same element re-animated" from "new element mounted".
const stamp = (n) => {
  if (!n.dataset.cardId) n.dataset.cardId = 'c' + (++__seq)
  return n.dataset.cardId
}
liveFigures().forEach(stamp)

new MutationObserver((recs) => {
  for (const r of recs) {
    for (const n of r.addedNodes) {
      if (n.nodeType === 1 && isLive(n)) {
        window.__mounts.push({
          t: now(),
          type: 'add',
          id: stamp(n),
          author: n.querySelector('figcaption div')?.textContent?.trim() ?? null,
        })
      }
    }
    for (const n of r.removedNodes) {
      if (n.nodeType === 1 && n.tagName === 'FIGURE') {
        window.__mounts.push({ t: now(), type: 'remove', id: n.dataset?.cardId ?? null })
      }
    }
  }
}).observe(sec, { childList: true, subtree: true })

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
  const d = dots()
  window.__frames.push({
    t: now(),
    cards: liveFigures().map((f) => {
      const cs = getComputedStyle(f)
      return {
        id: stamp(f),
        op: +(+cs.opacity).toFixed(4),
        y: +yOf(cs).toFixed(2),
        author: f.querySelector('figcaption div')?.textContent?.trim() ?? null,
      }
    }),
    gridH: grid ? +grid.getBoundingClientRect().height.toFixed(1) : -1,
    secH: +sec.getBoundingClientRect().height.toFixed(1),
    dotsY: d.length ? +(d[0].getBoundingClientRect().top + window.scrollY).toFixed(1) : -1,
  })
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
true
`

/**
 * Per node: split its opacity history into monotonic runs and count how many
 * times it rose. `eps` ignores sub-frame jitter; a run must gain at least
 * `minGain` total opacity to count as a real entrance attempt (so a 0.02
 * wobble during an exit is not mistaken for a replay).
 */
function analyseNodes(frames, { eps = 0.02, minGain = 0.12 } = {}) {
  const series = new Map()
  for (const f of frames) {
    for (const c of f.cards) {
      if (!series.has(c.id)) series.set(c.id, { id: c.id, author: c.author, pts: [] })
      series.get(c.id).pts.push({ t: f.t, op: c.op, y: c.y })
    }
  }

  const out = []
  for (const s of series.values()) {
    const runs = []
    let dir = 0
    let start = s.pts[0]
    let last = s.pts[0]

    for (const p of s.pts) {
      const d = p.op - last.op
      if (Math.abs(d) > eps) {
        const nd = Math.sign(d)
        if (nd !== dir && dir !== 0) {
          runs.push({ dir, from: start.op, to: last.op, t0: start.t, t1: last.t })
          start = last
        }
        dir = nd
      }
      last = p
    }
    if (dir !== 0) runs.push({ dir, from: start.op, to: last.op, t0: start.t, t1: last.t })

    const rising = runs.filter((r) => r.dir > 0 && r.to - r.from >= minGain)
    const falling = runs.filter((r) => r.dir < 0 && r.from - r.to >= minGain)
    out.push({
      id: s.id,
      author: s.author,
      frames: s.pts.length,
      opStart: s.pts[0].op,
      opEnd: s.pts[s.pts.length - 1].op,
      opMax: Math.max(...s.pts.map((p) => p.op)),
      risingRuns: rising.length,
      fallingRuns: falling.length,
      // A restart requires >1 rising run on one node. A trailing fall is a
      // normal exit and is deliberately not counted.
      restarts: Math.max(0, rising.length - 1),
      runs,
    })
  }
  return out
}

;(async () => {
  const mode = process.argv[2] || 'click'
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.locator('#testimonials').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)

  const nDots = await page.locator('#testimonials button[aria-label^="Show testimonial"]').count()

  if (mode === 'hover') {
    const box = await page.locator('#testimonials figure').last().boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(500)
  }
  await page.evaluate(INSTALL)

  if (mode === 'click') {
    for (let i = 1; i <= nDots; i++) {
      await page
        .locator(`#testimonials button[aria-label="Show testimonial ${(i % nDots) + 1}"]`)
        .click()
      await page.waitForTimeout(1600)
    }
  } else if (mode === 'stress') {
    // Interrupt mid-entrance: 250ms is inside the 500ms enter, so each click
    // lands while the previous transition is still running.
    for (let r = 0; r < 8; r++) {
      for (let i = 0; i < nDots; i++) {
        await page
          .locator(`#testimonials button[aria-label="Show testimonial ${i + 1}"]`)
          .click({ force: true })
        await page.waitForTimeout(250)
      }
    }
    await page.waitForTimeout(1600)
  } else {
    await page.waitForTimeout(mode === 'hover' ? 12000 : 16000)
  }

  await page.evaluate('window.__recOn = false')
  const frames = await page.evaluate('window.__frames')
  const mounts = await page.evaluate('window.__mounts')
  const nodes = analyseNodes(frames)

  const heights = frames.map((f) => f.gridH).filter((h) => h > 0)
  const dotsYs = frames.map((f) => f.dotsY).filter((y) => y > 0)
  const adds = mounts.filter((m) => m.type === 'add')
  const perAuthorMounts = {}
  for (const a of adds) perAuthorMounts[a.author] = (perAuthorMounts[a.author] || 0) + 1

  const summary = {
    mode,
    url: URL,
    frameCount: frames.length,
    avgFrameGapMs: +(
      frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1) : 0
    ).toFixed(1),
    maxMountedPerFrame: Math.max(...frames.map((f) => f.cards.length), 0),
    distinctNodes: nodes.length,
    mountsAdded: adds.length,
    perAuthorMounts,
    totalRestarts: nodes.reduce((n, x) => n + x.restarts, 0),
    nodesWithRestart: nodes.filter((x) => x.restarts > 0).length,
    gridHRange: +(Math.max(...heights) - Math.min(...heights)).toFixed(2),
    gridH: Math.max(...heights),
    dotsYRange: +(Math.max(...dotsYs) - Math.min(...dotsYs)).toFixed(2),
    nodes: nodes.map((n) => ({
      id: n.id,
      author: n.author,
      risingRuns: n.risingRuns,
      fallingRuns: n.fallingRuns,
      restarts: n.restarts,
      opMax: n.opMax,
    })),
  }

  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(
    path.join(OUT, `testimonial-nodes-${mode}-${URL.split(':').pop()}.json`),
    JSON.stringify({ summary, nodes, mounts, frames }, null, 2),
  )
  console.log(JSON.stringify(summary, null, 2))
  await browser.close()
})()
