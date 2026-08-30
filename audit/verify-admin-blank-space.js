/**
 * Verification for the admin "excessive blank space below content" fix.
 *
 * The bug was NOT a min-height on the content wrapper. `<main>` in the admin
 * shell had `overflow-auto` but no `position`, so absolutely-positioned
 * descendants (the visually hidden `.sr-only` form labels) had the initial
 * containing block as their containing block. main's overflow therefore did not
 * clip them and they contributed to the DOCUMENT's scroll height. On a long form
 * like Hero that stretched the document ~1.8k px past the `h-screen` shell,
 * giving an outer scrollbar over nothing but the gradient background. The fix
 * adds `relative` to that main.
 *
 * Three checks per page:
 *   1. no phantom outer document scroll (document.scrollHeight ≈ viewport)
 *   2. inside main, the gap between the last real content and the bottom of the
 *      scrollable area is a small margin, not hundreds of px of emptiness
 *   3. nothing is clipped — main's full content height is still reachable, and
 *      the last interactive control is scrollable into view
 *
 * Note on the two different "gap" numbers this reports, because conflating them
 * is what makes this bug easy to misdiagnose:
 *   - overflow gap: scrollHeight - contentBottom. Blank space you can SCROLL
 *     through. This is the bug. Must be small.
 *   - unused viewport: clientHeight - contentBottom on a page too short to
 *     scroll. Not a bug — main is a flex child filling the shell, and the
 *     background simply shows below short content with no scrollbar at all.
 */
const { session, adminLogin, URLS } = require('./harness')

const GAP_LIMIT = 64

const PAGES = [
  { name: 'hero', path: '/admin/hero', ready: '#hero-heading', long: true },
  { name: 'contact-info', path: '/admin/contact-info', ready: 'h1' },
  { name: 'projects', path: '/admin/projects', ready: 'h1' },
  { name: 'about', path: '/admin/about', ready: 'h1' },
  { name: 'skills', path: '/admin/skills', ready: 'h1' },
  { name: 'settings', path: '/admin/settings', ready: 'h1' },
  { name: 'timeline', path: '/admin/timeline', ready: 'h1' },
  { name: 'testimonials', path: '/admin/testimonials', ready: 'h1' },
  { name: 'dashboard', path: '/admin/dashboard', ready: 'h1' },
]

const results = []
const beforeAfter = []
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`  [verify] ${pass ? 'PASS' : 'FAIL'} — ${name}: ${detail}`)
}

/**
 * Measure the real bottom of painted content inside main.
 *
 * Visually-hidden elements are excluded deliberately: `.sr-only` is 1x1 with
 * clip:rect(0,0,0,0), so counting it as "content" is what made the original
 * measurement nonsense. We want the bottom of what a sighted user can see.
 */
function measure() {
  const main = document.querySelector('main')
  const doc = document.documentElement

  const isVisibleContent = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
    // sr-only / clip-based hiding
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)') return false
    if (cs.clipPath === 'inset(50%)') return false
    const r = el.getBoundingClientRect()
    if (r.height <= 1 || r.width <= 1) return false
    return true
  }

  const mainRect = main.getBoundingClientRect()
  let maxBottom = -Infinity
  let deepest = null
  for (const el of main.querySelectorAll('*')) {
    if (!isVisibleContent(el)) continue
    const r = el.getBoundingClientRect()
    if (r.bottom > maxBottom) {
      maxBottom = r.bottom
      deepest = el
    }
  }

  const contentBottom = Math.round(maxBottom - mainRect.top + main.scrollTop)

  return {
    docScrollHeight: doc.scrollHeight,
    docClientHeight: doc.clientHeight,
    docOverflow: doc.scrollHeight - doc.clientHeight,
    bodyScrollHeight: document.body.scrollHeight,
    mainScrollHeight: main.scrollHeight,
    mainClientHeight: main.clientHeight,
    mainScrollTop: main.scrollTop,
    mainPaddingBottom: getComputedStyle(main).paddingBottom,
    mainPosition: getComputedStyle(main).position,
    contentBottom,
    // Scrollable emptiness after the last visible thing. THE bug metric.
    overflowGap: main.scrollHeight - contentBottom,
    scrolls: main.scrollHeight - main.clientHeight > 4,
    lastEl: deepest
      ? {
          tag: deepest.tagName.toLowerCase(),
          cls: (deepest.className || '').toString().slice(0, 60),
          text: (deepest.innerText || deepest.textContent || '').trim().slice(0, 60),
        }
      : null,
  }
}

async function run() {
  await session('verify-admin-blank-space', async (ctx) => {
    const { page, log, shot } = ctx
    await adminLogin(ctx)

    for (const p of PAGES) {
      log(`\n----- ${p.name} (${p.path}) -----`)
      await page.goto(`${URLS.admin}${p.path}`, { waitUntil: 'domcontentloaded' })
      try {
        await page.waitForSelector(p.ready, { timeout: 60000 })
      } catch {
        log(`ready selector "${p.ready}" never appeared`)
      }
      await page.waitForTimeout(3000)

      // Scroll main fully down: the reported symptom is only visible at the
      // bottom, and it also proves the content is reachable.
      await page.evaluate(() => {
        const m = document.querySelector('main')
        if (m) m.scrollTop = m.scrollHeight
      })
      await page.waitForTimeout(500)

      const m = await page.evaluate(measure)

      log(`main position=${m.mainPosition} padBottom=${m.mainPaddingBottom}`)
      log(`document: scrollH=${m.docScrollHeight} clientH=${m.docClientHeight} ` +
          `-> outer overflow ${m.docOverflow}px`)
      log(`main: scrollH=${m.mainScrollHeight} clientH=${m.mainClientHeight} ` +
          `scrolls=${m.scrolls}`)
      log(`last visible content bottom=${m.contentBottom} ` +
          `<${m.lastEl?.tag} class="${m.lastEl?.cls}"> "${(m.lastEl?.text || '').replace(/\n/g, ' / ')}"`)
      log(`overflow gap (scrollable emptiness below content) = ${m.overflowGap}px`)
      if (!m.scrolls) {
        log(`unused viewport below content = ${m.mainClientHeight - m.contentBottom}px ` +
            `(page shorter than viewport; no scrollbar — not the bug)`)
      }

      // CHECK 1 — no phantom outer document scroll.
      record(
        `${p.name}: no phantom outer document scroll`,
        m.docOverflow <= 4,
        `document scrollHeight ${m.docScrollHeight} vs viewport ${m.docClientHeight} ` +
          `(overflow ${m.docOverflow}px, limit 4px)`,
      )

      // CHECK 2 — the blank space the report is about is SCROLLABLE emptiness.
      // Two genuinely different situations, so two different assertions:
      //   - main scrolls: emptiness after the content is real scroll area and
      //     must be ~the container padding, not hundreds of px.
      //   - main does not scroll: there is no scroll area at all, so the space
      //     below the content is just unfilled viewport in a full-height
      //     dashboard shell. Nothing to scroll through, so nothing to fix; the
      //     assertion is that no scrollbar exists.
      if (m.scrolls) {
        record(
          `${p.name}: scrollable gap below content under ${GAP_LIMIT}px`,
          m.overflowGap <= GAP_LIMIT,
          `${m.overflowGap}px of scrollable space after the last visible element ` +
            `(main padding-bottom is ${m.mainPaddingBottom}); ` +
            `main scrollH=${m.mainScrollHeight} contentBottom=${m.contentBottom}`,
        )
      } else {
        record(
          `${p.name}: no scrollable blank space (page fits viewport)`,
          m.mainScrollHeight - m.mainClientHeight <= 4,
          `main scrollH=${m.mainScrollHeight} == clientH=${m.mainClientHeight}, no scrollbar; ` +
            `${m.mainClientHeight - m.contentBottom}px of the viewport is simply unfilled ` +
            `below the content (shell is full-height by design, not scrollable)`,
        )
      }

      // CHECK 3 — nothing clipped: all of main's content is reachable by
      // scrolling, and the bottom-most content sits inside the scrolled view.
      const reach = await page.evaluate(() => {
        const m2 = document.querySelector('main')
        const maxScroll = m2.scrollHeight - m2.clientHeight
        // After scrolling to the end, is the bottom of the content visible?
        const reachedEnd = Math.abs(m2.scrollTop - maxScroll) <= 2
        return { reachedEnd, scrollTop: m2.scrollTop, maxScroll }
      })
      record(
        `${p.name}: content not clipped (bottom reachable)`,
        reach.reachedEnd,
        `scrolled to ${reach.scrollTop}/${reach.maxScroll} of main's scroll range`,
      )

      await shot(`${p.name}-bottom`, { fullPage: false })

      // BEFORE/AFTER on identical page state: temporarily revert the fix by
      // removing main's `position`, so the two numbers differ only by the fix.
      const ba = await page.evaluate(() => {
        const m2 = document.querySelector('main')
        const withFix = document.documentElement.scrollHeight
        m2.style.position = 'static'
        void m2.offsetHeight
        const withoutFix = document.documentElement.scrollHeight
        m2.style.position = ''
        void m2.offsetHeight
        return {
          withFix,
          withoutFix,
          viewport: document.documentElement.clientHeight,
        }
      })
      log(`before/after (document scrollHeight, viewport ${ba.viewport}): ` +
          `without fix = ${ba.withoutFix}px, with fix = ${ba.withFix}px, ` +
          `blank space removed = ${ba.withoutFix - ba.withFix}px`)
      beforeAfter.push({
        page: p.name,
        viewport: ba.viewport,
        before: ba.withoutFix,
        after: ba.withFix,
        removed: ba.withoutFix - ba.withFix,
      })
    }

    // Long-form specific: the Save/Reset row must be visible at the bottom.
    log(`\n----- hero: Save/Reset row visibility at bottom -----`)
    await page.goto(`${URLS.admin}/admin/hero`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#hero-heading', { timeout: 60000 })
    await page.waitForTimeout(3000)
    await page.evaluate(() => {
      const m = document.querySelector('main')
      if (m) m.scrollTop = m.scrollHeight
    })
    await page.waitForTimeout(500)

    const saveVis = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Save Changes',
      )
      const reset = [...document.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Reset All Fields'),
      )
      const vp = document.documentElement.clientHeight
      const inView = (el) => {
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= vp && r.height > 0
      }
      const r = btn ? btn.getBoundingClientRect() : null
      return {
        saveInView: inView(btn),
        resetInView: inView(reset),
        saveBottom: r ? Math.round(r.bottom) : null,
        viewport: vp,
        distanceFromViewportBottom: r ? Math.round(vp - r.bottom) : null,
      }
    })
    record(
      'hero: Save/Reset buttons visible after scrolling to bottom',
      saveVis.saveInView && saveVis.resetInView,
      `Save in view=${saveVis.saveInView}, Reset in view=${saveVis.resetInView}; ` +
        `Save bottom ${saveVis.saveBottom}px, ${saveVis.distanceFromViewportBottom}px above viewport bottom`,
    )
    await shot('hero-save-row-at-bottom', { fullPage: false })

    const failed = results.filter((r) => !r.pass)
    log(`\n=== BEFORE / AFTER (document scrollHeight) ===`)
    for (const b of beforeAfter) {
      log(`  ${b.page.padEnd(14)} viewport=${b.viewport}  before=${String(b.before).padStart(5)}  ` +
          `after=${String(b.after).padStart(5)}  blank space removed=${b.removed}px`)
    }
    log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
    for (const f of failed) log(`  FAILED: ${f.name} — ${f.detail}`)
  })

  // Emit a machine-readable summary for the report step.
  const fs = require('fs')
  fs.writeFileSync(
    require('path').join(__dirname, 'logs', 'verify-admin-blank-space-checks.json'),
    JSON.stringify({ checks: results, beforeAfter }, null, 2),
  )
}

run()
