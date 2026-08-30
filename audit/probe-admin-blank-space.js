/**
 * Diagnostic for the "large empty area below the form" report on admin pages.
 *
 * The point is to locate WHERE the extra vertical space comes from before
 * changing any CSS. For each admin page it:
 *   - finds every scrollable element on the page (scrollHeight > clientHeight)
 *   - measures the gap between the bottom of the last visible content element
 *     and the bottom of the scrollable content
 *   - walks the ancestor chain of the page content and dumps each ancestor's
 *     height plus the computed properties that could force extra height
 *     (height / min-height / flex / padding / margin)
 *
 * Nothing here asserts; it prints so the cause can be read off the output.
 */
const { session, adminLogin, URLS } = require('./harness')

const PAGES = [
  { name: 'hero', path: '/admin/hero', ready: '#hero-heading' },
  { name: 'contact-info', path: '/admin/contact-info', ready: 'form' },
  { name: 'projects', path: '/admin/projects', ready: 'h1' },
  { name: 'dashboard', path: '/admin/dashboard', ready: 'h1' },
]

/** Collect layout facts for the current page, in the browser. */
function collectLayout() {
  const out = {
    doc: {
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      bodyScrollHeight: document.body.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
    },
    scrollers: [],
    chain: [],
    lastVisible: null,
  }

  const describe = (el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 160),
      rectHeight: Math.round(r.height),
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      offsetHeight: el.offsetHeight,
      css: {
        height: cs.height,
        minHeight: cs.minHeight,
        maxHeight: cs.maxHeight,
        display: cs.display,
        flexGrow: cs.flexGrow,
        flexBasis: cs.flexBasis,
        flexDirection: cs.flexDirection,
        overflowY: cs.overflowY,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        marginBottom: cs.marginBottom,
        position: cs.position,
      },
    }
  }

  // Every element whose content overflows its box vertically.
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollHeight - el.clientHeight > 4 && el.clientHeight > 0) {
      const cs = getComputedStyle(el)
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll' || el === document.body ||
          el === document.documentElement) {
        out.scrollers.push({
          ...describe(el),
          overflowBy: el.scrollHeight - el.clientHeight,
        })
      }
    }
  }

  // The deepest last-visible element inside <main>: walk the last child that
  // actually paints, so we get the true bottom of rendered content.
  const main = document.querySelector('main')
  if (main) {
    const isPainted = (el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return cs.display !== 'none' && cs.visibility !== 'hidden' &&
             r.height > 0 && r.width > 0
    }

    // Bottom-most painted descendant by document position.
    let maxBottom = -Infinity
    let deepest = null
    for (const el of main.querySelectorAll('*')) {
      if (!isPainted(el)) continue
      const r = el.getBoundingClientRect()
      if (r.bottom > maxBottom) {
        maxBottom = r.bottom
        deepest = el
      }
    }

    if (deepest) {
      const mainRect = main.getBoundingClientRect()
      out.lastVisible = {
        ...describe(deepest),
        text: (deepest.innerText || '').trim().slice(0, 80),
        // Bottom of this element expressed in main's scroll-content coordinates.
        bottomInScrollContent: Math.round(
          maxBottom - mainRect.top + main.scrollTop,
        ),
      }
      out.mainScrollHeight = main.scrollHeight
      out.mainClientHeight = main.clientHeight
      out.mainScrollTop = main.scrollTop
      // The number the bug report is about: empty space after real content.
      out.gapBelowContent =
        main.scrollHeight - out.lastVisible.bottomInScrollContent
    }

    // Ancestor chain from main's first element child up to <html>.
    let node = main.firstElementChild || main
    const chain = []
    while (node) {
      chain.push(describe(node))
      node = node.parentElement
    }
    out.chain = chain
  }

  return out
}

async function run() {
  await session('admin-blank-space', async (ctx) => {
    const { page, log, shot } = ctx
    await adminLogin(ctx)

    for (const p of PAGES) {
      log(`\n===== ${p.name} (${p.path}) =====`)
      await page.goto(`${URLS.admin}${p.path}`, { waitUntil: 'domcontentloaded' })
      try {
        await page.waitForSelector(p.ready, { timeout: 60000 })
      } catch {
        log(`ready selector ${p.ready} never appeared; measuring anyway`)
      }
      // Let the data GET resolve and the form paint its rows.
      await page.waitForTimeout(3000)

      // Scroll the inner scroller to the very bottom so a screenshot shows
      // whatever empty space exists there.
      await page.evaluate(() => {
        const main = document.querySelector('main')
        if (main) main.scrollTop = main.scrollHeight
      })
      await page.waitForTimeout(600)

      const data = await page.evaluate(collectLayout)

      log(`document: scrollH=${data.doc.scrollHeight} clientH=${data.doc.clientHeight} ` +
          `body scrollH=${data.doc.bodyScrollHeight} clientH=${data.doc.bodyClientHeight}`)
      log(`main: scrollH=${data.mainScrollHeight} clientH=${data.mainClientHeight}`)
      if (data.lastVisible) {
        log(`last painted element: <${data.lastVisible.tag} class="${data.lastVisible.cls}"> ` +
            `text="${data.lastVisible.text.replace(/\n/g, ' / ')}"`)
        log(`  bottom in scroll content = ${data.lastVisible.bottomInScrollContent}`)
        log(`  >>> GAP BELOW CONTENT = ${data.gapBelowContent}px <<<`)
      }

      log(`scrollers (${data.scrollers.length}):`)
      for (const s of data.scrollers) {
        log(`  <${s.tag} class="${s.cls}"> clientH=${s.clientHeight} ` +
            `scrollH=${s.scrollHeight} overflowBy=${s.overflowBy} ` +
            `overflowY=${s.css.overflowY} h=${s.css.height} minH=${s.css.minHeight}`)
      }

      log('ancestor chain (content -> html):')
      for (const c of data.chain) {
        log(`  <${c.tag} class="${c.cls}">`)
        log(`     rectH=${c.rectHeight} clientH=${c.clientHeight} scrollH=${c.scrollHeight} ` +
            `| h=${c.css.height} minH=${c.css.minHeight} grow=${c.css.flexGrow} ` +
            `basis=${c.css.flexBasis} disp=${c.css.display} dir=${c.css.flexDirection} ` +
            `ovY=${c.css.overflowY} padB=${c.css.paddingBottom} mB=${c.css.marginBottom}`)
      }

      await shot(`${p.name}-bottom`, { fullPage: false })
    }
  })
}

run()
