/**
 * Testimonial carousel transition probe.
 *
 * Samples the DOM every ~40ms while the carousel transitions (autoplay and
 * manual dot clicks) and records, per frame:
 *   - how many <figure> elements are mounted (>1 = overlap / "repeat")
 *   - each figure's author name, opacity and transform
 *   - the height of the carousel container and of the section below it,
 *     so a layout jump ("jerk") shows up as a numeric delta
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, 'logs')
const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'testimonials')

const SAMPLE_MS = 40

const PROBE = `(() => {
  const section = document.querySelector('#testimonials')
  if (!section) return null
  const container = section.querySelector('.relative.min-h-\\\\[18rem\\\\]')
    || section.querySelector('figure')?.parentElement
  const figures = [...section.querySelectorAll('figure')]
  const dots = [...section.querySelectorAll('button[aria-label^="Show testimonial"]')]
  return {
    t: performance.now(),
    figureCount: figures.length,
    figures: figures.map((f) => {
      const cs = getComputedStyle(f)
      const r = f.getBoundingClientRect()
      return {
        author: f.querySelector('figcaption div')?.textContent?.trim() || null,
        quote: (f.querySelector('blockquote')?.textContent || '').slice(0, 34),
        opacity: +(+cs.opacity).toFixed(3),
        transform: cs.transform,
        top: Math.round(r.top),
        height: Math.round(r.height),
      }
    }),
    containerHeight: container ? Math.round(container.getBoundingClientRect().height) : null,
    sectionHeight: Math.round(section.getBoundingClientRect().height),
    activeDot: dots.findIndex((d) => d.getAttribute('aria-current') === 'true'),
    dotWidths: dots.map((d) => Math.round(d.getBoundingClientRect().width)),
  }
})()`

async function sample(page, ms, label, frames) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const s = await page.evaluate(PROBE).catch(() => null)
    if (s) frames.push({ ...s, label })
    await page.waitForTimeout(SAMPLE_MS)
  }
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true })
  fs.mkdirSync(SHOTS, { recursive: true })

  const browser = await chromium.launch({
    headless: false,
    args: ['--force-device-scale-factor=1'],
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const consoleMsgs = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      consoleMsgs.push({ type: m.type(), text: m.text() })
    }
  })

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })

  // Scroll the section into view so whileInView reveals have settled and the
  // element is actually painting before we start sampling.
  await page.evaluate(() => {
    document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(2000)

  const frames = []

  // --- Phase A: pure autoplay, long enough for 3+ advances (5s interval) ---
  await sample(page, 17000, 'autoplay', frames)

  // --- Phase B: manual dot clicks, forward then backward ---
  const dots = page.locator('#testimonials button[aria-label^="Show testimonial"]')
  const dotCount = await dots.count()

  for (const i of [1, 2, 0]) {
    if (i >= dotCount) continue
    await dots.nth(i).click()
    await sample(page, 1400, `click-forward-${i}`, frames)
  }
  for (const i of [2, 1, 0]) {
    if (i >= dotCount) continue
    await dots.nth(i).click()
    await sample(page, 1400, `click-backward-${i}`, frames)
  }

  // --- Phase C: rapid clicks, to catch overlap / double-advance ---
  if (dotCount >= 3) {
    await dots.nth(1).click()
    await page.waitForTimeout(120)
    await dots.nth(2).click()
    await sample(page, 1600, 'rapid-click', frames)
  }

  // --- Phase D: click a dot then wait for the interval to fire, to see
  // whether a manual nav resets the autoplay timer ---
  await dots.nth(0).click()
  await sample(page, 6000, 'click-then-wait-interval', frames)

  // --- Phase E: high-rate screenshot burst across one autoplay transition ---
  const shots = []
  {
    // Wait until just before an advance, then burst.
    const before = await page.evaluate(PROBE)
    let last = before.activeDot
    const deadline = Date.now() + 7000
    while (Date.now() < deadline) {
      const s = await page.evaluate(PROBE)
      if (s.activeDot !== last) {
        for (let k = 0; k < 12; k++) {
          const file = path.join(SHOTS, `transition-frame-${String(k).padStart(2, '0')}.png`)
          await page.locator('#testimonials').screenshot({ path: file }).catch(() => {})
          const st = await page.evaluate(PROBE)
          shots.push({ k, file: path.basename(file), ...st })
          await page.waitForTimeout(50)
        }
        break
      }
      last = s.activeDot
      await page.waitForTimeout(30)
    }
  }

  fs.writeFileSync(
    path.join(OUT, 'testimonial-carousel.json'),
    JSON.stringify({ frames, shots, consoleMsgs }, null, 2),
  )

  await browser.close()

  // ---- summary ----
  const overlaps = frames.filter((f) => f.figureCount > 1)
  const heights = [...new Set(frames.map((f) => f.containerHeight))]
  const sectionHeights = [...new Set(frames.map((f) => f.sectionHeight))]

  console.log('frames sampled:', frames.length)
  console.log('frames with >1 figure mounted:', overlaps.length)
  if (overlaps.length) {
    console.log('  sample overlap frame:', JSON.stringify(overlaps[0], null, 2))
  }
  console.log('distinct container heights:', heights.join(', '))
  console.log('distinct section heights:', sectionHeights.join(', '))

  // Height jumps between consecutive frames
  const jumps = []
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].sectionHeight - frames[i - 1].sectionHeight
    if (Math.abs(d) >= 2) {
      jumps.push({
        label: frames[i].label,
        delta: d,
        from: frames[i - 1].sectionHeight,
        to: frames[i].sectionHeight,
        author: frames[i].figures[0]?.author,
      })
    }
  }
  console.log('section-height jumps >=2px:', jumps.length)
  jumps.slice(0, 30).forEach((j) =>
    console.log(`   [${j.label}] ${j.from} -> ${j.to} (${j.delta > 0 ? '+' : ''}${j.delta}) author=${j.author}`),
  )

  // Author sequence, to detect repeats / double-advance
  const seq = []
  for (const f of frames) {
    const a = f.figures.map((x) => x.author).join('+') || '(none)'
    if (seq.length === 0 || seq[seq.length - 1].a !== a) {
      seq.push({ a, label: f.label, dot: f.activeDot })
    }
  }
  console.log('\nauthor sequence:')
  seq.forEach((s) => console.log(`   ${s.a}  [${s.label}] dot=${s.dot}`))

  console.log('\nconsole errors/warnings:', consoleMsgs.length)
  consoleMsgs.slice(0, 10).forEach((m) => console.log(`   ${m.type}: ${m.text}`))
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
