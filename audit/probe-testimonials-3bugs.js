/**
 * Investigation probe for the three reported Testimonials bugs.
 *
 * B1 OVERLAP: sample INSIDE the page with requestAnimationFrame (every frame,
 *   ~16ms, not a 40ms Playwright round-trip) and record every mounted card's
 *   opacity + quote text. Real overlap = one frame where two DIFFERENT quotes
 *   are both above a visibility threshold. Also stress-tested with rapid nav,
 *   which is the most likely way to force simultaneous enter/exit.
 *
 * B2 PLACEHOLDER CENTERING: flexbox centers the LINE BOX, not the glyph ink.
 *   Uppercase initials have no descenders, so ink can sit visibly above the
 *   geometric centre even when items-center is applied. Measured with canvas
 *   TextMetrics actualBoundingBoxAscent/Descent against the circle's box.
 *
 * B3 HEIGHT/DOTS: container height + nav-dot Y in document space, before /
 *   during / after a shortest<->longest quote transition.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, 'logs')

// ---------------------------------------------------------------- B1
// Installs a per-frame recorder in the page. Distinguishes the animated card
// from the aria-hidden sizer copies added for the height fix.
const INSTALL_FRAME_RECORDER = `
window.__frames = []
window.__recOn = true
const sec = document.querySelector('#testimonials')
const sizer = () => sec.querySelector('[aria-hidden="true"]')
const liveFigures = () => {
  const sz = sizer()
  return [...sec.querySelectorAll('figure')].filter((f) => !sz || !sz.contains(f))
}
const dots = () => [...sec.querySelectorAll('button[aria-label^="Show testimonial"]')]
const t0 = performance.now()
const tick = () => {
  if (!window.__recOn) return
  const figs = liveFigures()
  window.__frames.push({
    t: Math.round(performance.now() - t0),
    cards: figs.map((f) => ({
      op: +(+getComputedStyle(f).opacity).toFixed(3),
      author: f.querySelector('figcaption div')?.textContent?.trim() ?? null,
      quote: (f.querySelector('blockquote')?.textContent ?? '').trim().slice(0, 24),
      top: Math.round(f.getBoundingClientRect().top),
      h: Math.round(f.getBoundingClientRect().height),
    })),
    dot: dots().findIndex((d) => d.getAttribute('aria-current') === 'true'),
    dotsY: dots().length ? Math.round(dots()[0].getBoundingClientRect().top + window.scrollY) : -1,
    contH: Math.round(sec.querySelector('.grid')?.getBoundingClientRect().height ?? -1),
    secH: Math.round(sec.getBoundingClientRect().height),
  })
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
true
`

// A frame counts as overlapping when two cards with DIFFERENT quotes are both
// rendered above `thr` opacity. 0.01 is deliberately strict.
function analyseOverlap(frames, thr = 0.01) {
  const bad = []
  for (const f of frames) {
    const visible = f.cards.filter((c) => c.op > thr)
    const distinct = new Set(visible.map((c) => c.quote))
    if (visible.length > 1 && distinct.size > 1) bad.push({ ...f, visible })
  }
  return bad
}

function summariseMounts(frames) {
  let maxMounted = 0
  let maxVisible = 0
  for (const f of frames) {
    maxMounted = Math.max(maxMounted, f.cards.length)
    maxVisible = Math.max(maxVisible, f.cards.filter((c) => c.op > 0.01).length)
  }
  return { maxMounted, maxVisible }
}

// ---------------------------------------------------------------- B2
// Ink-box vs container-box centring for the initials placeholder.
const MEASURE_PLACEHOLDER = `(() => {
  const sec = document.querySelector('#testimonials')
  const sz = sec.querySelector('[aria-hidden="true"]')
  const live = [...sec.querySelectorAll('figure')].filter((f) => !sz || !sz.contains(f))[0]
  if (!live) return { error: 'no live figure' }

  // The placeholder is the span sibling that replaces <img>.
  const wrap = live.querySelector('.mb-6.flex.justify-center') || live.firstElementChild
  const img = wrap.querySelector('img')
  const span = wrap.querySelector('span')
  const el = span || img
  if (!el) return { error: 'no avatar element' }

  const box = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const result = {
    kind: span ? 'initials-placeholder' : 'image',
    author: live.querySelector('figcaption div')?.textContent?.trim(),
    text: span ? span.textContent.trim() : null,
    container: {
      w: +box.width.toFixed(2), h: +box.height.toFixed(2),
      cx: +(box.left + box.width / 2).toFixed(2),
      cy: +(box.top + box.height / 2).toFixed(2),
    },
    display: cs.display, alignItems: cs.alignItems, justifyContent: cs.justifyContent,
    font: cs.font, fontFamily: cs.fontFamily, fontSize: cs.fontSize,
    fontWeight: cs.fontWeight, lineHeight: cs.lineHeight,
    padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
  }

  if (!span) return result

  // Line box, via a Range over the text node.
  const tn = [...span.childNodes].find((n) => n.nodeType === 3)
  if (tn) {
    const r = document.createRange()
    r.selectNodeContents(tn)
    const rb = r.getBoundingClientRect()
    result.lineBox = {
      w: +rb.width.toFixed(2), h: +rb.height.toFixed(2),
      cx: +(rb.left + rb.width / 2).toFixed(2),
      cy: +(rb.top + rb.height / 2).toFixed(2),
    }
    result.lineBoxOffset = {
      dx: +(rb.left + rb.width / 2 - (box.left + box.width / 2)).toFixed(2),
      dy: +(rb.top + rb.height / 2 - (box.top + box.height / 2)).toFixed(2),
    }

    // True glyph ink extents. Flexbox centres the line box; the ink inside it
    // is not necessarily centred, because ascent != descent for capitals.
    const c = document.createElement('canvas').getContext('2d')
    c.font = cs.font && cs.font !== '' ? cs.font : (cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily)
    const m = c.measureText(span.textContent.trim())
    const inkAsc = m.actualBoundingBoxAscent
    const inkDesc = m.actualBoundingBoxDescent
    result.textMetrics = {
      usedFont: c.font,
      width: +m.width.toFixed(2),
      actualAscent: +inkAsc.toFixed(2),
      actualDescent: +inkDesc.toFixed(2),
      fontAscent: +m.fontBoundingBoxAscent.toFixed(2),
      fontDescent: +m.fontBoundingBoxDescent.toFixed(2),
    }
    // Baseline sits at the line box centre + half the font box asymmetry.
    const lineCy = rb.top + rb.height / 2
    const baseline = lineCy + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
    const inkTop = baseline - inkAsc
    const inkBottom = baseline + inkDesc
    const inkCy = (inkTop + inkBottom) / 2
    result.inkBox = {
      top: +inkTop.toFixed(2), bottom: +inkBottom.toFixed(2),
      h: +(inkBottom - inkTop).toFixed(2), cy: +inkCy.toFixed(2),
    }
    result.inkOffsetY = +(inkCy - (box.top + box.height / 2)).toFixed(2)
    result.inkOffsetX = +(rb.left + rb.width / 2 - (box.left + box.width / 2)).toFixed(2)
  }
  return result
})()`

async function settle(page) {
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1400)
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await settle(page)

  const results = {}
  const dots = page.locator('#testimonials button[aria-label^="Show testimonial"]')
  const n = await dots.count()

  // ============ B1: autoplay, per-frame ============
  console.log('=== B1: per-frame overlap scan, autoplay (rAF sampling) ===')
  await page.evaluate(INSTALL_FRAME_RECORDER)
  await page.waitForTimeout(17000) // 3+ transitions
  let frames = await page.evaluate(() => { window.__recOn = false; return window.__frames })
  results.b1_autoplay = { frameCount: frames.length, ...summariseMounts(frames) }
  let bad = analyseOverlap(frames)
  console.log(`   frames: ${frames.length} (~${Math.round(17000 / frames.length)}ms apart)`)
  console.log(`   max cards mounted at once: ${results.b1_autoplay.maxMounted}`)
  console.log(`   max cards visible (op>0.01) at once: ${results.b1_autoplay.maxVisible}`)
  console.log(`   overlapping frames (2 different quotes both visible): ${bad.length}`)
  if (bad.length) console.log('   e.g. ' + JSON.stringify(bad[0].visible))
  results.b1_autoplay.overlapFrames = bad.length
  results.b1_autoplay.overlapSamples = bad.slice(0, 6)

  // transition timing: how long is the gap where NOTHING is visible
  const invisible = frames.filter((f) => f.cards.every((c) => c.op <= 0.01))
  console.log(`   frames with no card visible at all (exit->enter gap): ${invisible.length}`)
  results.b1_autoplay.blankFrames = invisible.length

  // ============ B1 stress: rapid manual nav ============
  console.log('\n=== B1 stress: rapid dot clicks during an active transition ===')
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  await page.evaluate(INSTALL_FRAME_RECORDER)
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < n; i++) {
      await dots.nth(i).click()
      await page.waitForTimeout(120) // click again mid-exit
    }
  }
  await page.waitForTimeout(2500)
  frames = await page.evaluate(() => { window.__recOn = false; return window.__frames })
  bad = analyseOverlap(frames)
  const mm = summariseMounts(frames)
  console.log(`   frames: ${frames.length}`)
  console.log(`   max cards mounted at once: ${mm.maxMounted}   max visible at once: ${mm.maxVisible}`)
  console.log(`   overlapping frames: ${bad.length}`)
  if (bad.length) {
    console.log('   FIRST OVERLAP:')
    bad.slice(0, 3).forEach((f) => console.log(`     t=${f.t}ms  ` + JSON.stringify(f.visible)))
  }
  results.b1_stress = { frameCount: frames.length, ...mm, overlapFrames: bad.length, overlapSamples: bad.slice(0, 8) }

  // ============ B2: placeholder centering, per card ============
  console.log('\n=== B2: avatar placeholder centering, measured per card ===')
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  results.b2 = []
  for (let i = 0; i < n; i++) {
    await dots.nth(i).click()
    await page.waitForTimeout(1200)
    const m = await page.evaluate(MEASURE_PLACEHOLDER)
    results.b2.push(m)
    if (m.error) { console.log(`   dot ${i}: ERROR ${m.error}`); continue }
    if (m.kind === 'image') {
      console.log(`   dot ${i} ${String(m.author).padEnd(16)} [image]  ${m.container.w}x${m.container.h}`)
      continue
    }
    console.log(`   dot ${i} ${String(m.author).padEnd(16)} [initials "${m.text}"]  circle ${m.container.w}x${m.container.h}`)
    console.log(`        flex=${m.display}/${m.alignItems}/${m.justifyContent}  lineHeight=${m.lineHeight}  font=${m.fontSize} ${m.fontWeight}`)
    console.log(`        line-box centre offset: dx=${m.lineBoxOffset.dx}px dy=${m.lineBoxOffset.dy}px`)
    console.log(`        GLYPH INK offset from circle centre: dx=${m.inkOffsetX}px  dy=${m.inkOffsetY}px`)
    console.log(`        ink asc=${m.textMetrics.actualAscent} desc=${m.textMetrics.actualDescent}  fontAsc=${m.textMetrics.fontAscent} fontDesc=${m.textMetrics.fontDescent}`)
  }

  // ============ B3: height + dot Y across shortest<->longest ============
  console.log('\n=== B3: container height + nav-dot Y, shortest <-> longest quote ===')
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  const quoteLens = await page.evaluate(() => {
    const sec = document.querySelector('#testimonials')
    const sz = sec.querySelector('[aria-hidden="true"]')
    return [...(sz ? sz.querySelectorAll('figure') : [])].map((f) => ({
      author: f.querySelector('figcaption div')?.textContent?.trim(),
      len: (f.querySelector('blockquote')?.textContent ?? '').trim().length,
    }))
  })
  console.log('   quote lengths: ' + quoteLens.map((q) => `${q.author}=${q.len}`).join('  '))
  const longest = quoteLens.reduce((a, b, i) => (b.len > quoteLens[a].len ? i : a), 0)
  const shortest = quoteLens.reduce((a, b, i) => (b.len < quoteLens[a].len ? i : a), 0)
  console.log(`   longest=#${longest} (${quoteLens[longest]?.author})  shortest=#${shortest} (${quoteLens[shortest]?.author})`)

  await dots.nth(longest).click()
  await page.waitForTimeout(1300)
  await page.evaluate(INSTALL_FRAME_RECORDER)
  const before = await page.evaluate(() => window.__frames[window.__frames.length - 1])
  await dots.nth(shortest).click()
  await page.waitForTimeout(1600)
  frames = await page.evaluate(() => { window.__recOn = false; return window.__frames })
  const after = frames[frames.length - 1]
  const during = frames.slice(1, -1)
  const dh = [...new Set(frames.map((f) => f.contH))]
  const dy = [...new Set(frames.map((f) => f.dotsY))]
  console.log(`   before: contH=${before.contH} secH=${before.secH} dotsY=${before.dotsY}`)
  console.log(`   after : contH=${after.contH} secH=${after.secH} dotsY=${after.dotsY}`)
  console.log(`   during (${during.length} frames): distinct contH=[${dh.join(', ')}]  distinct dotsY=[${dy.join(', ')}]`)
  results.b3 = { quoteLens, longest, shortest, before, after, distinctContH: dh, distinctDotsY: dy, frameCount: frames.length }

  fs.writeFileSync(path.join(OUT, 'testimonials-3bugs.json'), JSON.stringify(results, null, 2))
  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
