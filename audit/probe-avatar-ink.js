/**
 * Bug 2 — is the fallback avatar's GLYPH visually centred in its circle?
 *
 * Reading computed styles is not enough. `items-center` centres the LINE BOX,
 * and a line box is taller than the ink of uppercase initials (no descenders),
 * so a placeholder can be "flex centred" per the CSSOM and still look high.
 * The only honest measurement is pixels, so this screenshots the element at
 * deviceScaleFactor 4 and finds the bounding box of glyph-coloured pixels.
 *
 * Classification: the circle is a primary->accent gradient, the glyphs are
 * `text-primary-foreground` (near-white). Ink = pixels whose min channel is
 * high AND which are close to greyscale, which separates white text from the
 * saturated indigo/violet background regardless of where in the gradient it
 * sits.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUT = path.join(__dirname, 'logs')
const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'testimonials-avatar-ink')
const URL = process.env.URL || 'http://localhost:3010'
const DPR = 4

/** Minimal PNG reader: returns {w,h,rgba} for 8-bit RGB/RGBA non-interlaced. */
function decodePNG(buf) {
  let pos = 8
  let w = 0
  let h = 0
  let colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = colorType === 6 ? 4 : 3
  const stride = w * ch
  const out = Buffer.alloc(w * h * 4)
  let prev = Buffer.alloc(stride)
  let o = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[o++]
    const line = Buffer.from(raw.subarray(o, o + stride))
    o += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0
      const b = prev[x]
      const c = x >= ch ? prev[x - ch] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      line[x] = v & 0xff
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 4 + 0] = line[x * ch + 0]
      out[(y * w + x) * 4 + 1] = line[x * ch + 1]
      out[(y * w + x) * 4 + 2] = line[x * ch + 2]
      out[(y * w + x) * 4 + 3] = ch === 4 ? line[x * ch + 3] : 255
    }
    prev = line
  }
  return { w, h, rgba: out }
}

/**
 * Bounding box of the CIRCLE itself: any pixel that is either saturated
 * (the indigo->violet gradient) or near-white (the glyphs sitting on it).
 *
 * Needed because a Playwright element screenshot is NOT exactly the element:
 * the card sits at a fractional y (580.89px), so at DPR 4 the clip rounds
 * outward and a 64x64 span comes back 256x260. Taking the container centre as
 * imageHeight/2 therefore carries up to ~0.5 CSS px of clipping bias — which
 * is the same order as the offset being measured. Deriving the disc's own
 * bbox from the same bitmap as the ink cancels that bias entirely.
 */
function discBox({ w, h, rgba }) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = rgba[i]
      const g = rgba[i + 1]
      const b = rgba[i + 2]
      const a = rgba[i + 3]
      if (a < 128) continue
      const mn = Math.min(r, g, b)
      const mx = Math.max(r, g, b)
      const saturated = mx - mn >= 40
      const nearWhite = mn > 170 && mx - mn < 40
      if (saturated || nearWhite) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return {
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    center: { x: minX + (maxX - minX + 1) / 2, y: minY + (maxY - minY + 1) / 2 },
  }
}

/** Bounding box + centroid of near-white (glyph) pixels. */
function inkBox({ w, h, rgba }) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  let sx = 0
  let sy = 0
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = rgba[i]
      const g = rgba[i + 1]
      const b = rgba[i + 2]
      const a = rgba[i + 3]
      if (a < 128) continue
      const mn = Math.min(r, g, b)
      const mx = Math.max(r, g, b)
      // near-white: bright in every channel and low saturation
      if (mn > 170 && mx - mn < 40) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        sx += x
        sy += y
        n++
      }
    }
  }
  if (!n) return null
  return {
    pixels: n,
    // +1 because max is an inclusive pixel index
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    bboxCenter: { x: minX + (maxX - minX + 1) / 2, y: minY + (maxY - minY + 1) / 2 },
    centroid: { x: sx / n, y: sy / n },
  }
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: DPR,
  })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.locator('#testimonials').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  fs.mkdirSync(SHOTS, { recursive: true })
  fs.mkdirSync(OUT, { recursive: true })

  const nDots = await page.locator('#testimonials button[aria-label^="Show testimonial"]').count()
  const results = []

  for (let i = 0; i < nDots; i++) {
    if (i > 0) {
      await page.locator(`#testimonials button[aria-label="Show testimonial ${i + 1}"]`).click()
      // Full swap + gate margin before measuring a settled card.
      await page.waitForTimeout(1500)
    }

    const info = await page.evaluate(() => {
      const sec = document.querySelector('#testimonials')
      const sizer = sec.querySelector('[aria-hidden="true"]')
      const fig = [...sec.querySelectorAll('figure')].filter(
        (f) => !sizer || !sizer.contains(f),
      )[0]
      if (!fig) return null
      const author = fig.querySelector('figcaption div')?.textContent?.trim() ?? null
      const img = fig.querySelector('img')
      const ph = [...fig.querySelectorAll('span')].find(
        (s) => getComputedStyle(s).borderRadius.includes('9999') || s.className.includes('rounded-full'),
      )
      const el = img || ph
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        author,
        kind: img ? 'image' : 'placeholder',
        text: img ? null : el.textContent.trim(),
        box: { w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
        display: cs.display,
        alignItems: cs.alignItems,
        justifyContent: cs.justifyContent,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
      }
    })
    if (!info) continue

    const sel = info.kind === 'image' ? '#testimonials figure img' : null
    const loc = sel
      ? page.locator(sel).last()
      : page.locator('#testimonials figure span.rounded-full').last()

    const file = path.join(SHOTS, `avatar-${i}-${info.kind}.png`)
    await loc.screenshot({ path: file })
    const png = decodePNG(fs.readFileSync(file))
    const ink = info.kind === 'placeholder' ? inkBox(png) : null

    const disc = info.kind === 'placeholder' ? discBox(png) : null
    // Measure against the circle's own painted bbox, not the screenshot
    // bitmap's midpoint, so fractional-clip padding cannot skew the result.
    const containerCenter = disc ? disc.center : { x: png.w / 2, y: png.h / 2 }
    const entry = {
      ...info,
      shot: path.relative(path.join(__dirname, '..'), file),
      imagePx: { w: png.w, h: png.h },
      dpr: DPR,
      disc,
      containerCenterPx: containerCenter,
      ink,
    }
    if (ink) {
      entry.offsetPx = {
        bboxDx: +(ink.bboxCenter.x - containerCenter.x).toFixed(2),
        bboxDy: +(ink.bboxCenter.y - containerCenter.y).toFixed(2),
        centroidDx: +(ink.centroid.x - containerCenter.x).toFixed(2),
        centroidDy: +(ink.centroid.y - containerCenter.y).toFixed(2),
      }
      // Convert back to CSS px so the number is comparable to design intent.
      entry.offsetCss = {
        bboxDx: +(entry.offsetPx.bboxDx / DPR).toFixed(3),
        bboxDy: +(entry.offsetPx.bboxDy / DPR).toFixed(3),
      }
    }
    results.push(entry)
  }

  fs.writeFileSync(path.join(OUT, 'avatar-ink.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
  await browser.close()
})()
