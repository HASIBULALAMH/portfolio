/**
 * Measures only the glyph shapes `initialsOf()` can actually emit, since the
 * synthetic "gy" descender case is unreachable through the real code path:
 *
 *   words.length === 0            -> "—"                (em dash)
 *   words.length === 1            -> first 2 chars, .toUpperCase()
 *   otherwise                     -> first+last initial, .toUpperCase()
 *
 * So: uppercase letters, digits, and the em dash. Everything is uppercased,
 * which is why no descender can occur. The em dash is the interesting one --
 * its ink sits near mid-x-height, so flex centring of the line box may leave
 * it visibly high even though capitals come out fine.
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const zlib = require('zlib')

// Reuse the PNG reader + analyser from the sibling probe.
const shared = fs.readFileSync(path.join(__dirname, 'probe-avatar-centering.js'), 'utf8')
const readPNGSrc = shared.slice(shared.indexOf('function readPNG'), shared.indexOf('async function shoot'))
eval(readPNGSrc)

const SHOTS = path.join(__dirname, '..', 'audit_screenshots', 'testimonials-avatar')
const SCALE = 4
const LIVE_AVATAR = '#testimonials div:not([aria-hidden="true"]) > figure .mb-6 > span'

/**
 * Clicking the ALREADY-ACTIVE dot restarts the 5s autoplay clock (the `cycle`
 * nonce) without changing `index`, so `current.id` is unchanged and
 * AnimatePresence does not swap the figure. That buys a stable 5s window to
 * screenshot in, without disabling autoplay or editing the component.
 */
async function resetClock(page) {
  const active = await page.evaluate(() => {
    const d = [...document.querySelectorAll('#testimonials button[aria-label^="Show testimonial"]')]
    return d.findIndex((x) => x.getAttribute('aria-current') === 'true')
  })
  await page.locator('#testimonials button[aria-label^="Show testimonial"]').nth(Math.max(0, active)).click()
  await page.waitForTimeout(650) // let the dot's own width transition finish
}

async function measure(page, file) {
  await page.locator(LIVE_AVATAR).screenshot({ path: file, animations: 'disabled', timeout: 8000 })
  const png = readPNG(fs.readFileSync(file))
  const a = analyse(png)
  if (a.error) return a
  return {
    inkBox: `${a.ink.x1 - a.ink.x0 + 1}x${a.ink.y1 - a.ink.y0 + 1}`,
    dx: +((a.ink.cx - a.circle.cx) / SCALE).toFixed(2),
    dy: +((a.ink.cy - a.circle.cy) / SCALE).toFixed(2),
    top: +((a.ink.y0 - a.circle.y0) / SCALE).toFixed(2),
    bottom: +((a.circle.y1 - a.ink.y1) / SCALE).toFixed(2),
  }
}

async function run() {
  const browser = await chromium.launch({ headless: false })
  const page = await (await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE,
  })).newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(1500)
  // land on a card that uses the initials fallback
  await page.locator('#testimonials button[aria-label^="Show testimonial"]').nth(1).click()
  await page.waitForTimeout(1100)

  const out = []
  console.log('=== reachable glyph shapes only (initialsOf always uppercases) ===')
  for (const text of ['TA', 'MW', 'FR', 'CH', 'II', 'QQ', '42', '—']) {
    await resetClock(page)
    await page.evaluate((t) => {
      const sec = document.querySelector('#testimonials')
      const sz = sec.querySelector('[aria-hidden="true"]')
      const live = [...sec.querySelectorAll('figure')].filter((f) => !sz || !sz.contains(f))[0]
      const span = live?.querySelector('.mb-6 span')
      if (span) span.textContent = t
    }, text)
    await page.waitForTimeout(120)
    const safe = text === '—' ? 'emdash' : text
    const m = await measure(page, path.join(SHOTS, `reachable-${safe}.png`))
    out.push({ text, ...m })
    console.log(`   "${text}"  ink ${m.inkBox}@4x   dx=${m.dx}  dy=${m.dy}   gapTop=${m.top} gapBottom=${m.bottom}`)
  }
  fs.writeFileSync(path.join(__dirname, 'logs', 'avatar-reachable.json'), JSON.stringify(out, null, 2))
  await browser.close()

  const caps = out.filter((o) => o.text !== '—')
  const em = out.find((o) => o.text === '—')
  const worstCap = caps.reduce((a, c) => (Math.abs(c.dy) > Math.abs(a.dy) ? c : a), caps[0])
  console.log(`\n  uppercase/digit worst vertical offset: ${worstCap.dy}px ("${worstCap.text}")`)
  console.log(`  em-dash vertical offset: ${em.dy}px`)
  console.log(`  => ${Math.abs(em.dy) > 1 ? 'em-dash IS off-centre and is reachable (blank author_name)' : 'all reachable shapes centred within 1px'}`)
}

run().catch((e) => { console.error(e); process.exit(1) })
