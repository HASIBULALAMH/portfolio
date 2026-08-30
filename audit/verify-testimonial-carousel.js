/**
 * Post-fix verification for the testimonial carousel.
 *
 * Re-runs the Phase 1 captures plus the two interactions that previously
 * produced the visible "repeat", and asserts:
 *   V1 - section height is constant across every card (no layout snap)
 *   V2 - >=5 autoplay cycles advance one card at a time, in order
 *   V3 - manual nav forward and backward lands on the card asked for and holds
 *        it for a full ~5s (autoplay clock restarts)
 *   V4 - clicking the dot of the currently-exiting card does not re-show it
 *   V5 - all four breakpoints: constant height, no zero-height collapse
 *   V6 - the invisible sizers are not exposed to a11y / hit-testing
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'testimonials-fixed')

const SNAP = `(() => {
  const s = document.querySelector('#testimonials')
  if (!s) return null
  // The animated card is the figure that is NOT inside the aria-hidden sizer.
  const sizer = s.querySelector('[aria-hidden="true"]')
  const allFigs = [...s.querySelectorAll('figure')]
  const visFigs = allFigs.filter((f) => !sizer || !sizer.contains(f))
  const vis = visFigs[0]
  const dots = [...s.querySelectorAll('button[aria-label^="Show testimonial"]')]
  const stack = s.querySelector('.grid')
  return {
    t: Math.round(performance.now()),
    author: vis?.querySelector('figcaption div')?.textContent?.trim() ?? null,
    op: vis ? +(+getComputedStyle(vis).opacity).toFixed(2) : null,
    visFigures: visFigs.length,
    allFigures: allFigs.length,
    dot: dots.findIndex((d) => d.getAttribute('aria-current') === 'true'),
    secH: Math.round(s.getBoundingClientRect().height),
    contH: Math.round(stack?.getBoundingClientRect().height ?? -1),
    // Position of the section itself, and of the dot row, measured relative to
    // the document (not the viewport) so page scroll does not pollute the
    // reading. A layout jump inside the section moves the dots; scrolling does
    // not.
    secTopDoc: Math.round(s.getBoundingClientRect().top + window.scrollY),
    dotsTopDoc: dots.length
      ? Math.round(dots[0].getBoundingClientRect().top + window.scrollY)
      : -1,
    scrollY: Math.round(window.scrollY),
  }
})()`

const WAIT_TICK = `new Promise((resolve) => {
  const s = document.querySelector('#testimonials')
  const dots = [...s.querySelectorAll('button[aria-label^="Show testimonial"]')]
  const active = () => dots.findIndex((d) => d.getAttribute('aria-current') === 'true')
  const start = active()
  const id = setInterval(() => {
    if (active() !== start) { clearInterval(id); resolve({ t: Math.round(performance.now()), from: start, to: active() }) }
  }, 4)
})`

const results = { checks: [] }
function check(name, pass, detail) {
  results.checks.push({ name, pass, detail })
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`)
}

async function settle(page) {
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1400)
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const consoleMsgs = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleMsgs.push(m.text())
  })
  page.on('pageerror', (e) => consoleMsgs.push('pageerror: ' + e.message))

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await settle(page)

  const dots = page.locator('#testimonials button[aria-label^="Show testimonial"]')
  const n = await dots.count()

  // ================= V1: constant height across every card =================
  console.log('\n=== V1: section height per card (was 724 / 695 / 695) ===')
  const perCard = []
  for (let i = 0; i < n; i++) {
    await dots.nth(i).click()
    await page.waitForTimeout(1200)
    const s = await page.evaluate(SNAP)
    perCard.push(s)
    console.log(`   dot ${i}: card=${String(s.author).padEnd(16)} secH=${s.secH} contH=${s.contH} dotsTopDoc=${s.dotsTopDoc}`)
  }
  const hs = [...new Set(perCard.map((p) => p.secH))]
  check(
    'V1 constant section height across all cards',
    hs.length === 1,
    `distinct heights: ${hs.join(', ')} (spread ${Math.max(...hs) - Math.min(...hs)}px; was 29-30px)`,
  )

  // ================= V2: >=5 autoplay cycles, one step at a time =================
  console.log('\n=== V2: autoplay, 6 consecutive ticks sampled at 40ms ===')
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  const frames = []
  {
    const end = Date.now() + 33000 // >6 ticks at 5s
    while (Date.now() < end) {
      const s = await page.evaluate(SNAP)
      if (s) frames.push(s)
      await page.waitForTimeout(40)
    }
  }
  // card order actually rendered
  const seq = []
  for (const f of frames) {
    if (!seq.length || seq[seq.length - 1] !== f.author) seq.push(f.author)
  }
  console.log('   rendered order: ' + seq.join(' -> '))
  const names = perCard.map((p) => p.author)
  let inOrder = true
  for (let i = 1; i < seq.length; i++) {
    const prev = names.indexOf(seq[i - 1])
    const cur = names.indexOf(seq[i])
    if (cur !== (prev + 1) % names.length) inOrder = false
  }
  check(
    'V2 autoplay advances exactly one card per tick, in order',
    inOrder && seq.length >= 6,
    `${seq.length - 1} advances observed, all single-step=${inOrder}`,
  )
  const noRepeat = seq.every((a, i) => i === 0 || a !== seq[i - 1])
  check('V2 no card repeats back-to-back during autoplay', noRepeat, `sequence: ${seq.join(' -> ')}`)
  const overlap = frames.filter((f) => f.visFigures > 1)
  check(
    'V2 never more than one visible card mounted',
    overlap.length === 0,
    `${overlap.length}/${frames.length} frames with >1 visible figure`,
  )
  const autoH = [...new Set(frames.map((f) => f.secH))]
  check(
    'V2 section height constant through all autoplay transitions',
    autoH.length === 1,
    `distinct heights over ${frames.length} frames: ${autoH.join(', ')}`,
  )
  let worst = 0
  let worstAt = null
  for (let i = 1; i < frames.length; i++) {
    const d = Math.abs(frames[i].dotsTopDoc - frames[i - 1].dotsTopDoc)
    if (d > worst) { worst = d; worstAt = [frames[i - 1], frames[i]] }
  }
  check(
    'V2 content below the card never shifts (jerk)',
    worst <= 1,
    `worst single-sample shift of the dot row in document space: ${worst}px (was 30px in 13ms)` +
      (worstAt && worst > 1 ? ` @ ${worstAt[0].author}->${worstAt[1].author}` : ''),
  )
  const scrolls = [...new Set(frames.map((f) => f.scrollY))]
  console.log(`   (scrollY during capture: ${scrolls.join(', ')} — document-space measurement is scroll-independent)`)

  // ================= V3: manual nav forward + backward, holds 5s =================
  console.log('\n=== V3: manual nav — click late in the cycle, then hold ===')
  const v3 = []
  for (const dir of ['forward', 'backward']) {
    await page.reload({ waitUntil: 'networkidle' })
    await settle(page)
    const tick = await page.evaluate(WAIT_TICK)
    await page.waitForTimeout(4300) // click 4.3s into the 5s cycle (the old failure window)
    const cur = (await page.evaluate(SNAP)).dot
    const target = dir === 'forward' ? (cur + 1) % n : (cur - 1 + n) % n
    const clickAt = await page.evaluate(() => Math.round(performance.now()))
    await dots.nth(target).click()

    // Sample for 4.2s: the requested card must appear and still be there.
    const trace = []
    const end = Date.now() + 4200
    while (Date.now() < end) {
      trace.push(await page.evaluate(SNAP))
      await page.waitForTimeout(50)
    }
    const wanted = names[target]
    const settled = trace.filter((f) => f.t > clickAt + 700)
    const held = settled.length > 0 && settled.every((f) => f.author === wanted)
    const rendered = []
    for (const f of trace) if (!rendered.length || rendered[rendered.length - 1] !== f.author) rendered.push(f.author)
    console.log(`   ${dir}: clicked dot ${target} (${wanted}) at tick+4300ms -> rendered ${rendered.join(' -> ')}`)
    check(
      `V3 ${dir} click lands on the requested card and holds it`,
      held,
      `requested "${wanted}"; held for ${((settled[settled.length - 1]?.t ?? 0) - clickAt)}ms after settle; sequence ${rendered.join(' -> ')}`,
    )
    // it must NOT be skipped past within 1s (the old bug advanced ~375ms later)
    const skippedEarly = trace.some((f) => f.t > clickAt + 200 && f.t < clickAt + 1200 && f.dot !== target)
    check(
      `V3 ${dir} autoplay does not fire immediately after the click`,
      !skippedEarly,
      skippedEarly ? 'index changed again within 1.2s of the click' : 'index stable for 1.2s+ after click (clock restarted)',
    )
    v3.push({ dir, target, rendered })
  }

  // ================= V4: click the dot of the exiting card =================
  console.log('\n=== V4: click the dot of the card that is mid-exit ===')
  await page.reload({ waitUntil: 'networkidle' })
  await settle(page)
  const tickE = await page.evaluate(WAIT_TICK)
  await page.waitForTimeout(180)
  await dots.nth(tickE.from).click()
  const traceE = []
  {
    const end = Date.now() + 2800
    while (Date.now() < end) {
      traceE.push(await page.evaluate(SNAP))
      await page.waitForTimeout(45)
    }
  }
  const renderedE = []
  for (const f of traceE) if (!renderedE.length || renderedE[renderedE.length - 1] !== f.author) renderedE.push(f.author)
  console.log(`   autoplay went dot ${tickE.from} -> ${tickE.to}; clicked dot ${tickE.from} 180ms into the exit`)
  console.log(`   rendered after: ${renderedE.join(' -> ')}`)
  const tail = traceE.filter((f) => f.t > traceE[0].t + 1200)
  const stableTail = tail.length > 0 && new Set(tail.map((f) => f.author)).size === 1
  check(
    'V4 clicking the exiting card settles on one card without oscillating',
    stableTail,
    `final card held: ${[...new Set(tail.map((f) => f.author))].join(', ')} (${renderedE.length - 1} swaps total)`,
  )

  // ================= V6: sizers hidden from a11y and hit-testing =================
  console.log('\n=== V6: invisible sizer copies ===')
  const a11y = await page.evaluate(() => {
    const s = document.querySelector('#testimonials')
    const sizer = s.querySelector('[aria-hidden="true"].invisible')
    const figs = s.querySelectorAll('figure')
    const quotes = [...s.querySelectorAll('blockquote')]
    return {
      sizerFound: !!sizer,
      sizerFigureCount: sizer ? sizer.querySelectorAll('figure').length : 0,
      sizerVisibility: sizer ? getComputedStyle(sizer).visibility : null,
      sizerPointerEvents: sizer ? getComputedStyle(sizer).pointerEvents : null,
      totalFigures: figs.length,
      totalBlockquotes: quotes.length,
      sizerImgLoading: sizer ? [...sizer.querySelectorAll('img')].length : 0,
    }
  })
  console.log('   ' + JSON.stringify(a11y))
  check(
    'V6 sizer copies are aria-hidden, invisible and non-interactive',
    a11y.sizerFound && a11y.sizerVisibility === 'hidden' && a11y.sizerPointerEvents === 'none',
    `visibility=${a11y.sizerVisibility} pointer-events=${a11y.sizerPointerEvents} sizerFigures=${a11y.sizerFigureCount}`,
  )
  // The a11y tree must expose only ONE quote. page.accessibility was removed in
  // Playwright 1.5x, so assert on the DOM contract that drives it instead:
  // every duplicate quote must sit inside an aria-hidden subtree.
  const quoteExposure = await page.evaluate(() => {
    const s = document.querySelector('#testimonials')
    const hidden = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.getAttribute?.('aria-hidden') === 'true') return true
        const cs = getComputedStyle(n)
        if (cs.visibility === 'hidden' || cs.display === 'none') return true
      }
      return false
    }
    const quotes = [...s.querySelectorAll('blockquote')]
    const exposed = quotes.filter((q) => !hidden(q))
    return {
      total: quotes.length,
      exposed: exposed.length,
      exposedText: exposed.map((q) => q.textContent.trim().slice(0, 40)),
    }
  })
  check(
    'V6 accessibility tree exposes the visible card only (no duplicate quotes)',
    quoteExposure.exposed === 1,
    `${quoteExposure.total} blockquotes in DOM, ${quoteExposure.exposed} exposed to a11y: ${JSON.stringify(quoteExposure.exposedText)}`,
  )

  // ================= V5: all four breakpoints =================
  const BPS = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'laptop', width: 1280, height: 800 },
    { name: 'desktop', width: 1920, height: 1080 },
  ]
  console.log('\n=== V5: per-breakpoint height constancy + transition frames ===')
  results.breakpoints = {}
  for (const bp of BPS) {
    await page.setViewportSize({ width: bp.width, height: bp.height })
    await page.reload({ waitUntil: 'networkidle' })
    await settle(page)
    const per = []
    for (let i = 0; i < n; i++) {
      await dots.nth(i).click()
      await page.waitForTimeout(1150)
      per.push(await page.evaluate(SNAP))
      await page
        .locator('#testimonials')
        .screenshot({ path: path.join(SHOTS, `${bp.name}-card-${i}.png`) })
        .catch(() => {})
    }
    // sample one transition at this breakpoint
    const tr = []
    await dots.nth(0).click()
    await page.waitForTimeout(1200)
    await dots.nth(1).click()
    {
      const end = Date.now() + 1300
      let k = 0
      while (Date.now() < end) {
        tr.push(await page.evaluate(SNAP))
        if (k < 8) {
          await page
            .locator('#testimonials')
            .screenshot({ path: path.join(SHOTS, `${bp.name}-transition-${String(k).padStart(2, '0')}.png`) })
            .catch(() => {})
        }
        k++
        await page.waitForTimeout(60)
      }
    }
    const bhs = [...new Set(per.map((p) => p.secH))]
    const ths = [...new Set(tr.map((p) => p.secH))]
    const dotRows = [...new Set([...per, ...tr].map((p) => p.dotsTopDoc))]
    const zero = per.some((p) => p.secH <= 0 || p.contH <= 0)
    const ov = tr.filter((f) => f.visFigures > 1).length
    results.breakpoints[bp.name] = { per, transitionHeights: ths, dotRows }
    console.log(
      `   ${bp.name.padEnd(8)} (${String(bp.width).padStart(4)}px): static heights [${bhs.join(', ')}]  ` +
        `transition heights [${ths.join(', ')}]  dotRowTop [${dotRows.join(', ')}]  overlapFrames=${ov}  collapsed=${zero}`,
    )
    check(
      `V5 ${bp.name} height constant (static + mid-transition), no collapse`,
      bhs.length === 1 && ths.length === 1 && ths[0] === bhs[0] && dotRows.length === 1 && !zero,
      `static=[${bhs.join(', ')}] transition=[${ths.join(', ')}] dotRowTop=[${dotRows.join(', ')}] collapsed=${zero} overlapFrames=${ov}`,
    )
  }

  results.consoleErrors = consoleMsgs
  check('no console errors or page exceptions', consoleMsgs.length === 0, consoleMsgs.slice(0, 5).join(' | ') || 'none')

  fs.writeFileSync(
    path.join(__dirname, 'logs', 'testimonial-verify.json'),
    JSON.stringify(results, null, 2),
  )
  await browser.close()

  const failed = results.checks.filter((c) => !c.pass)
  console.log(`\n================ ${results.checks.length - failed.length}/${results.checks.length} checks passed ================`)
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAILED: ${f.name} -> ${f.detail}`))
    process.exitCode = 1
  }
}

run().catch((e) => { console.error(e); process.exit(1) })
