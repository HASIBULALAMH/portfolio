/**
 * Verify the TextLogo wordmark's styling is actually APPLIED in the rendered
 * CSS, not merely written in the component's className.
 *
 * Reading the JSX only proves the class names are requested. This reads
 * getComputedStyle on the live nodes, so it catches the failure modes the
 * source cannot show: a Tailwind class that did not survive compilation (v4
 * renamed several, and a mistyped arbitrary value fails silently), a
 * conflicting utility winning the cascade, or a gradient that is present but
 * painted over an opaque colour.
 *
 * The wordmark is two nested elements by design: the outer carries the
 * drop-shadow glow and the type, the inner carries the gradient fill. They
 * cannot be merged — background-clip:text plus filter on one element can
 * rasterise the clip and lose the gradient. Both are measured separately.
 *
 * The inner gradient span is the anchor (`.bg-clip-text`) and the outer is its
 * parent, so the probe does not depend on any presentational class name that
 * might be retuned later.
 */
const { chromium } = require('playwright')

const FRONTEND = 'http://localhost:3000'
const ADMIN = 'http://localhost:3001'

const INNER = '.bg-clip-text'

// Reads the outer glow element and the inner gradient element as one record.
function readMark(root) {
  const inner = root.querySelector('.bg-clip-text')
  if (!inner) return { error: 'no .bg-clip-text gradient element found' }
  const outer = inner.parentElement
  const co = getComputedStyle(outer)
  const ci = getComputedStyle(inner)
  return {
    text: outer.innerText,
    outer: {
      filter: co.filter,
      fontWeight: co.fontWeight,
      fontFamily: co.fontFamily.slice(0, 60),
      letterSpacing: co.letterSpacing,
      textTransform: co.textTransform,
      fontSize: co.fontSize,
    },
    inner: {
      backgroundImage: ci.backgroundImage,
      backgroundClip: ci.webkitBackgroundClip || ci.backgroundClip,
      color: ci.color,
      fontWeight: ci.fontWeight,
    },
  }
}

function report(label, s) {
  console.log(`\n--- ${label} ---`)
  if (!s || s.error) {
    console.log(`  ${s ? s.error : 'element not reachable'}`)
    return null
  }
  console.log(`  text rendered   : "${s.text}"`)
  console.log(`  [outer: glow + type]`)
  console.log(`    filter          : ${s.outer.filter}`)
  console.log(`    font-weight     : ${s.outer.fontWeight}`)
  console.log(`    font-family     : ${s.outer.fontFamily}`)
  console.log(`    letter-spacing  : ${s.outer.letterSpacing}`)
  console.log(`    text-transform  : ${s.outer.textTransform}`)
  console.log(`    font-size       : ${s.outer.fontSize}`)
  console.log(`  [inner: gradient fill]`)
  console.log(`    background-img  : ${s.inner.backgroundImage}`)
  console.log(`    background-clip : ${s.inner.backgroundClip}`)
  console.log(`    color           : ${s.inner.color}`)

  // Everything that must hold for the wordmark to read as a styled brand mark.
  const hasGradient = /gradient/.test(s.inner.backgroundImage)
  const clipsToText = s.inner.backgroundClip === 'text'
  const inkTransparent =
    s.inner.color === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(s.inner.color)
  const hasGlow = /drop-shadow/.test(s.outer.filter)
  const isExtrabold = parseInt(s.outer.fontWeight, 10) >= 800
  const capitalized = s.outer.textTransform === 'capitalize'
  // Confirm the specified violet stops actually landed, not some other gradient.
  const violetStops =
    /167, 139, 250/.test(s.inner.backgroundImage) &&
    /124, 58, 237/.test(s.inner.backgroundImage)
  // A vertical gradient. Chrome OMITS "to bottom" when serialising, because it
  // is the CSS default — it only prints a direction when one differs (verified:
  // `to right` and `110deg` both serialise explicitly, `to bottom` does not).
  // So "vertical" means no competing direction token is present.
  const vertical =
    /to bottom|180deg/.test(s.inner.backgroundImage) ||
    !/to (top|left|right)|\d+deg/.test(s.inner.backgroundImage)

  console.log(`  => gradient painted    : ${hasGradient}`)
  console.log(`  => clipped to glyphs   : ${clipsToText}`)
  console.log(`  => ink transparent     : ${inkTransparent}`)
  console.log(`  => GRADIENT VISIBLE    : ${hasGradient && clipsToText && inkTransparent}`)
  console.log(`  => violet stops (#A78BFA/#7C3AED): ${violetStops}`)
  console.log(`  => vertical (to bottom): ${vertical}`)
  console.log(`  => GLOW DECLARED       : ${hasGlow}`)
  console.log(`  => EXTRABOLD (>=800)   : ${isExtrabold}`)
  console.log(`  => CAPITALIZED         : ${capitalized}`)
  return {
    gradientVisible: hasGradient && clipsToText && inkTransparent,
    violetStops,
    vertical,
    hasGlow,
    isExtrabold,
    capitalized,
    text: s.text,
  }
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto(`${FRONTEND}/?cb=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 150000,
  })
  await page.waitForSelector('header', { timeout: 60000 })
  await page.waitForTimeout(2500)

  const nav = await page.evaluate(
    (fn) => new Function('return ' + fn)()(document.querySelector('header')),
    readMark.toString()
  )
  const navVerdict = report('PUBLIC navbar wordmark', nav)

  const foot = await page.evaluate(
    (fn) => new Function('return ' + fn)()(document.querySelector('footer') || document.body),
    readMark.toString()
  )
  report('PUBLIC footer wordmark', foot)

  // Sample the page background so the glow's contrast target is on the record.
  const bg = await page.evaluate((sel) => {
    const inner = document.querySelector(`header ${sel}`)
    if (!inner) return 'mark not found'
    let n = inner.parentElement
    while (n) {
      const c = getComputedStyle(n).backgroundColor
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
      n = n.parentElement
    }
    return 'none found'
  }, INNER)
  console.log(`\n  page background behind mark: ${bg}`)

  // Pixel-level proof the glow is VISIBLE, not just declared. Declaring a filter
  // says nothing about whether it survives against #0f172a, so rasterise the
  // mark twice — as shipped, then with the filter forced off — and compare. A
  // glow too faint to register would produce identical bytes.
  const markHandle = await page.evaluateHandle(
    (sel) => document.querySelector(`header ${sel}`)?.parentElement || null,
    INNER
  )
  const markEl = markHandle.asElement()
  let glowVisible = null
  if (markEl) {
    const box = await markEl.boundingBox()
    // Pad the clip so the halo OUTSIDE the glyphs is captured, not cropped off.
    const clip = {
      x: Math.max(0, box.x - 12),
      y: Math.max(0, box.y - 12),
      width: box.width + 24,
      height: box.height + 24,
    }
    const withGlow = await page.screenshot({ clip })
    await page.evaluate((sel) => {
      const el = document.querySelector(`header ${sel}`).parentElement
      el.style.setProperty('filter', 'none', 'important')
    }, INNER)
    await page.waitForTimeout(200)
    const withoutGlow = await page.screenshot({ clip })
    await page.evaluate((sel) => {
      const el = document.querySelector(`header ${sel}`).parentElement
      el.style.removeProperty('filter')
    }, INNER)

    glowVisible = Buffer.compare(withGlow, withoutGlow) !== 0
    console.log(`  glow changes rendered pixels : ${glowVisible}`)
    console.log(`  png bytes with/without glow  : ${withGlow.length} / ${withoutGlow.length}`)
  }

  // Admin renders its own copy of the component; the Settings preview is only
  // trustworthy if it matches the public site exactly.
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded', timeout: 150000 })
  await page.waitForTimeout(3500)
  const adminMark = await page.evaluate(
    (fn) => new Function('return ' + fn)()(document.body),
    readMark.toString()
  )
  const adminVerdict = report('ADMIN login wordmark', adminMark)

  console.log('\n=== VERDICT ===')
  const rows = [
    ['gradient visible (public)', navVerdict?.gradientVisible],
    ['violet stops applied      ', navVerdict?.violetStops],
    ['gradient runs to bottom   ', navVerdict?.vertical],
    ['glow declared             ', navVerdict?.hasGlow],
    ['glow visible (pixel diff) ', glowVisible],
    ['extrabold (>=800)         ', navVerdict?.isExtrabold],
    ['capitalized               ', navVerdict?.capitalized],
    ['admin matches public      ',
      Boolean(
        adminVerdict &&
          navVerdict &&
          adminVerdict.gradientVisible === navVerdict.gradientVisible &&
          adminVerdict.violetStops === navVerdict.violetStops &&
          adminVerdict.isExtrabold === navVerdict.isExtrabold &&
          adminVerdict.capitalized === navVerdict.capitalized
      )],
  ]
  for (const [k, v] of rows) console.log(`  ${k} : ${v}`)
  console.log(`  text as rendered          : "${navVerdict?.text}"`)

  const allPass = rows.every(([, v]) => v === true)
  console.log(`\n  ALL CHECKS PASS: ${allPass}`)

  await browser.close()
  process.exit(allPass ? 0 : 1)
})()
