/**
 * Pixel-truth centering check for the avatar placeholder.
 *
 * The font-metric pass said dy=0, but that is arithmetic on TextMetrics. This
 * one crops the actual rendered circle out of a screenshot and finds the ink
 * extents from real pixel data, which is the only measurement that cannot be
 * fooled by a wrong assumption about baselines or line boxes.
 *
 * Method: screenshot the 64x64 circle at deviceScaleFactor 4 (256x256 of real
 * samples), classify each pixel as "ink" (the light initials) vs "circle" (the
 * indigo/violet gradient) by luminance, then compare the ink bounding box
 * centre to the circle's own bounding box centre.
 *
 * Also renders a single-letter and a descender case ("J", "gy") to prove the
 * result is not an accident of the two-uppercase-letter dataset.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'testimonials-avatar')

// ---- minimal PNG reader (no deps): returns {w,h,px:(x,y)=>[r,g,b,a]} ----
function readPNG(buf) {
  let pos = 8
  let w = 0, h = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth)
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error('unsupported color type ' + colorType)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const out = Buffer.alloc(h * stride)
  let rp = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++]
    const line = raw.subarray(rp, rp + stride); rp += stride
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const A = x >= channels ? cur[x - channels] : 0
      const B = prev[x]
      const C = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v += A
      else if (filter === 2) v += B
      else if (filter === 3) v += (A + B) >> 1
      else if (filter === 4) {
        const p = A + B - C
        const pa = Math.abs(p - A), pb = Math.abs(p - B), pc = Math.abs(p - C)
        v += pa <= pb && pa <= pc ? A : pb <= pc ? B : C
      }
      cur[x] = v & 0xff
    }
  }
  return {
    w, h, channels,
    px(x, y) {
      const i = y * stride + x * channels
      if (channels >= 3) return [out[i], out[i + 1], out[i + 2], channels === 4 ? out[i + 3] : 255]
      return [out[i], out[i], out[i], channels === 2 ? out[i + 1] : 255]
    },
  }
}

/**
 * Find the ink bbox (the light glyphs) and the circle bbox (any non-transparent,
 * non-page-background pixel) inside a cropped avatar screenshot.
 */
function analyse(png) {
  const { w, h } = png
  let inkMinX = 1e9, inkMinY = 1e9, inkMaxX = -1, inkMaxY = -1, inkN = 0
  let cirMinX = 1e9, cirMinY = 1e9, cirMaxX = -1, cirMaxY = -1, cirN = 0
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

  // Sample the gradient's own luminance from a ring near the circle edge so the
  // ink threshold adapts to the gradient instead of being hardcoded.
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2
  let ringSum = 0, ringN = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy)
    if (d > R * 0.72 && d < R * 0.9) {
      const [r, g, b, a] = png.px(x, y)
      if (a > 200) { ringSum += lum(r, g, b); ringN++ }
    }
  }
  const bg = ringN ? ringSum / ringN : 90
  const thr = bg + 45 // ink is markedly lighter than the gradient

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = png.px(x, y)
      if (a < 30) continue
      const d = Math.hypot(x - cx, y - cy)
      if (d <= R) {
        if (x < cirMinX) cirMinX = x; if (x > cirMaxX) cirMaxX = x
        if (y < cirMinY) cirMinY = y; if (y > cirMaxY) cirMaxY = y
        cirN++
      }
      // ink must be inside the disc and clearly lighter than the gradient
      if (d < R * 0.95 && lum(r, g, b) > thr) {
        if (x < inkMinX) inkMinX = x; if (x > inkMaxX) inkMaxX = x
        if (y < inkMinY) inkMinY = y; if (y > inkMaxY) inkMaxY = y
        inkN++
      }
    }
  }
  if (inkN === 0) return { error: 'no ink pixels found', bg: +bg.toFixed(1), thr: +thr.toFixed(1) }
  return {
    bgLum: +bg.toFixed(1), inkThreshold: +thr.toFixed(1), inkPixels: inkN, circlePixels: cirN,
    circle: { x0: cirMinX, y0: cirMinY, x1: cirMaxX, y1: cirMaxY, cx: (cirMinX + cirMaxX) / 2, cy: (cirMinY + cirMaxY) / 2 },
    ink: { x0: inkMinX, y0: inkMinY, x1: inkMaxX, y1: inkMaxY, cx: (inkMinX + inkMaxX) / 2, cy: (inkMinY + inkMaxY) / 2 },
  }
}

async function shoot(page, sel, file, scale) {
  await page.locator(sel).screenshot({ path: file })
  const png = readPNG(fs.readFileSync(file))
  const a = analyse(png)
  if (a.error) return { file: path.basename(file), ...a }
  const dx = (a.ink.cx - a.circle.cx) / scale
  const dy = (a.ink.cy - a.circle.cy) / scale
  return {
    file: path.basename(file),
    imagePx: `${png.w}x${png.h}`,
    inkPixels: a.inkPixels,
    circleCentre: [+a.circle.cx.toFixed(1), +a.circle.cy.toFixed(1)],
    inkCentre: [+a.ink.cx.toFixed(1), +a.ink.cy.toFixed(1)],
    inkBox: `${a.ink.x1 - a.ink.x0 + 1}x${a.ink.y1 - a.ink.y0 + 1}`,
    offsetCssPx: { dx: +dx.toFixed(3), dy: +dy.toFixed(3) },
    gapTopCssPx: +((a.ink.y0 - a.circle.y0) / scale).toFixed(2),
    gapBottomCssPx: +((a.circle.y1 - a.ink.y1) / scale).toFixed(2),
    gapLeftCssPx: +((a.ink.x0 - a.circle.x0) / scale).toFixed(2),
    gapRightCssPx: +((a.circle.x1 - a.ink.x1) / scale).toFixed(2),
  }
}

async function run() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const SCALE = 4
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: SCALE,
  })
  const page = await context.newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1500)

  const out = { scale: SCALE, cards: [], synthetic: [] }
  const dots = page.locator('#testimonials button[aria-label^="Show testimonial"]')
  const n = await dots.count()

  // The live (non-sizer) avatar element.
  const LIVE_AVATAR = '#testimonials div:not([aria-hidden="true"]) > figure .mb-6 > span'

  console.log('=== pixel-truth centering of the initials placeholder (4x DPR) ===')
  for (let i = 0; i < n; i++) {
    await dots.nth(i).click()
    await page.waitForTimeout(1200)
    const info = await page.evaluate(() => {
      const sec = document.querySelector('#testimonials')
      const sz = sec.querySelector('[aria-hidden="true"]')
      const live = [...sec.querySelectorAll('figure')].filter((f) => !sz || !sz.contains(f))[0]
      const span = live?.querySelector('.mb-6 span')
      return {
        author: live?.querySelector('figcaption div')?.textContent?.trim(),
        hasSpan: !!span,
        text: span?.textContent?.trim() ?? null,
      }
    })
    if (!info.hasSpan) { console.log(`   card ${i} ${info.author}: real image, skipped`); continue }
    const file = path.join(SHOTS, `card-${i}-${info.text}.png`)
    const r = await shoot(page, LIVE_AVATAR, file, SCALE)
    out.cards.push({ ...info, ...r })
    console.log(`   card ${i} ${String(info.author).padEnd(16)} "${info.text}"  ink ${r.inkBox}px@4x`)
    console.log(`        offset from circle centre: dx=${r.offsetCssPx.dx}px  dy=${r.offsetCssPx.dy}px  (CSS px)`)
    console.log(`        gaps  top=${r.gapTopCssPx}  bottom=${r.gapBottomCssPx}  left=${r.gapLeftCssPx}  right=${r.gapRightCssPx}`)
  }

  // ---- synthetic stress: shapes the real dataset never produces ----
  console.log('\n=== synthetic glyph cases (single letter, descender, wide) ===')
  for (const text of ['J', 'gy', 'WW', 'I']) {
    await page.evaluate((t) => {
      const sec = document.querySelector('#testimonials')
      const sz = sec.querySelector('[aria-hidden="true"]')
      const live = [...sec.querySelectorAll('figure')].filter((f) => !sz || !sz.contains(f))[0]
      const span = live?.querySelector('.mb-6 span')
      if (span) span.textContent = t
    }, text)
    await page.waitForTimeout(320)
    const file = path.join(SHOTS, `synthetic-${text}.png`)
    const r = await shoot(page, LIVE_AVATAR, file, SCALE)
    out.synthetic.push({ text, ...r })
    console.log(`   "${text}"  ink ${r.inkBox}px@4x  dx=${r.offsetCssPx.dx}  dy=${r.offsetCssPx.dy}   top=${r.gapTopCssPx} bottom=${r.gapBottomCssPx}`)
  }

  fs.writeFileSync(path.join(__dirname, 'logs', 'avatar-centering.json'), JSON.stringify(out, null, 2))
  await browser.close()

  const all = [...out.cards, ...out.synthetic].filter((c) => c.offsetCssPx)
  const worstY = all.reduce((a, c) => (Math.abs(c.offsetCssPx.dy) > Math.abs(a.offsetCssPx.dy) ? c : a), all[0])
  const worstX = all.reduce((a, c) => (Math.abs(c.offsetCssPx.dx) > Math.abs(a.offsetCssPx.dx) ? c : a), all[0])
  console.log(`\n  worst vertical offset:   ${worstY.offsetCssPx.dy}px  (${worstY.text ?? worstY.file})`)
  console.log(`  worst horizontal offset: ${worstX.offsetCssPx.dx}px  (${worstX.text ?? worstX.file})`)
  console.log(`  verdict: ${Math.abs(worstY.offsetCssPx.dy) <= 1 && Math.abs(worstX.offsetCssPx.dx) <= 1 ? 'CENTERED (<=1px both axes)' : 'OFF-CENTRE'}`)
}

run().catch((e) => { console.error(e); process.exit(1) })
