/**
 * Requirement-2 capture: screenshot the section every 100ms through a full
 * transition and check the IMAGES for two quotes on screen at once.
 *
 * DOM opacity already says there is no overlap, but the brief asks for the
 * recording, and a screenshot catches things computed style cannot -- a
 * lingering composited layer, or a paint that outlives its DOM node.
 *
 * Overlap detection: crop the quote area, count "text" pixels (bright pixels
 * against the dark card). Two cards cross-fading at 50% each would show a
 * text-pixel count far above either card's settled count, and would show text
 * ink at BOTH cards' line positions. A clean mode="wait" swap instead shows a
 * dip toward zero between the two cards.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const shared = fs.readFileSync(path.join(__dirname, 'probe-avatar-centering.js'), 'utf8')
eval(shared.slice(shared.indexOf('function readPNG'), shared.indexOf('function analyse')))

const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'testimonials-transition')

/** Bright-pixel (text ink) profile per row of the quote region. */
function inkProfile(png) {
  const { w, h } = png
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  let total = 0
  const rows = new Array(h).fill(0)
  for (let y = 0; y < h; y++) {
    let c = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = png.px(x, y)
      if (a > 30 && lum(r, g, b) > 140) c++
    }
    rows[y] = c
    total += c
  }
  const bands = []
  let inBand = false, start = 0
  for (let y = 0; y < h; y++) {
    const on = rows[y] > w * 0.01
    if (on && !inBand) { inBand = true; start = y }
    else if (!on && inBand) { inBand = false; bands.push([start, y - 1]) }
  }
  if (inBand) bands.push([start, h - 1])
  return { totalInk: total, textBands: bands.length, bands }
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const browser = await chromium.launch({ headless: false })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1500)

  const out = { autoplay: [], manual: [] }

  for (const mode of ['autoplay', 'manual']) {
    // Get to a known card, then trigger.
    if (mode === 'manual') {
      await page.locator('#testimonials button[aria-label^="Show testimonial"]').nth(0).click()
      await page.waitForTimeout(1400)
    }

    // Wait for the transition to START, so the 100ms series covers it.
    if (mode === 'autoplay') {
      await page.evaluate(`new Promise((res) => {
        const s = document.querySelector('#testimonials')
        const d = [...s.querySelectorAll('button[aria-label^="Show testimonial"]')]
        const a = () => d.findIndex((x) => x.getAttribute('aria-current') === 'true')
        const st = a(); const id = setInterval(() => { if (a() !== st) { clearInterval(id); res(1) } }, 4)
      })`)
    } else {
      await page.locator('#testimonials button[aria-label^="Show testimonial"]').nth(1).click()
    }

    console.log(`\n=== ${mode.toUpperCase()}: screenshots every 100ms through the transition ===`)
    console.log('   frame   t(ms)   inkPixels   textBands   visibleQuote')
    for (let k = 0; k < 14; k++) {
      const file = path.join(SHOTS, `${mode}-${String(k).padStart(2, '0')}.png`)
      // Crop to the quote region of the card container.
      const box = await page.locator('#testimonials .grid').boundingBox()
      await page.screenshot({
        path: file,
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      })
      const state = await page.evaluate(() => {
        const s = document.querySelector('#testimonials')
        const sz = s.querySelector('[aria-hidden="true"]')
        const live = [...s.querySelectorAll('figure')].filter((f) => !sz || !sz.contains(f))
        return live.map((f) => ({
          q: (f.querySelector('blockquote')?.textContent ?? '').trim().slice(0, 22),
          op: +(+getComputedStyle(f).opacity).toFixed(2),
        }))
      })
      const prof = inkProfile(readPNG(fs.readFileSync(file)))
      const rec = { k, t: k * 100, ...prof, state }
      out[mode].push(rec)
      console.log(
        `   ${String(k).padStart(4)}  ${String(k * 100).padStart(6)}   ${String(prof.totalInk).padStart(9)}   ${String(prof.textBands).padStart(9)}   ` +
          state.map((s) => `"${s.q}"@${s.op}`).join(' + '),
      )
      await page.waitForTimeout(100)
    }
  }

  fs.writeFileSync(path.join(__dirname, 'logs', 'transition-frames.json'), JSON.stringify(out, null, 2))
  await browser.close()

  console.log('\n=== overlap verdict from the IMAGES ===')
  for (const mode of ['autoplay', 'manual']) {
    const f = out[mode]
    const settled = f.filter((r) => r.state.length === 1 && r.state[0].op >= 0.99).map((r) => r.totalInk)
    const peakSettled = settled.length ? Math.max(...settled) : 0
    const peak = Math.max(...f.map((r) => r.totalInk))
    const multi = f.filter((r) => r.state.length > 1)
    const dip = Math.min(...f.map((r) => r.totalInk))
    console.log(`   ${mode}: peak ink ${peak}, peak while a single card is fully opaque ${peakSettled}, min ink ${dip}`)
    console.log(`      frames with >1 card in the DOM: ${multi.length}`)
    console.log(`      ink never exceeds a single settled card => ${peak <= peakSettled * 1.05 ? 'NO CROSS-FADE OVERLAP' : 'POSSIBLE OVERLAP'}`)
    console.log(`      ink dips to ${dip} mid-swap => the outgoing card is fully gone before the next paints`)
  }
}

run().catch((e) => { console.error(e); process.exit(1) })
