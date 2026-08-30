/**
 * Pin down which elements extend document.documentElement.scrollHeight past the
 * viewport on the admin Hero page.
 *
 * Hypothesis under test: absolutely-positioned descendants inside
 * <main class="overflow-auto"> escape main's clipping because no ancestor
 * establishes a containing block (nothing in the chain is position:relative).
 * Their containing block therefore becomes the initial containing block, so
 * they contribute to the DOCUMENT's scroll height instead of main's — giving an
 * outer scrollbar over ~1.8k px of pure background.
 *
 * If true, every offender is position:absolute|fixed and its nearest positioned
 * ancestor is null (i.e. <html>).
 */
const { session, adminLogin, URLS } = require('./harness')

function findOffenders() {
  const vh = document.documentElement.clientHeight
  const docScroll = document.documentElement.scrollHeight
  const offenders = []
  const positioned = []

  const nearestPositionedAncestor = (el) => {
    let p = el.parentElement
    while (p) {
      const cs = getComputedStyle(p)
      if (cs.position !== 'static') return p
      p = p.parentElement
    }
    return null
  }

  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      const anc = nearestPositionedAncestor(el)
      positioned.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        position: cs.position,
        ancestor: anc
          ? `${anc.tagName.toLowerCase()}.${(anc.className || '').toString().slice(0, 40)}`
          : 'NONE (initial containing block)',
      })
    }

    // Anything painting below the viewport is a candidate for extending the doc.
    const r = el.getBoundingClientRect()
    if (r.bottom > vh + 2 && r.height > 0) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 70),
        position: cs.position,
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        text: (el.textContent || '').trim().slice(0, 40),
        escapes: cs.position === 'absolute' && !nearestPositionedAncestor(el),
      })
    }
  }

  // Group the escaping absolutes by class so the output stays readable.
  const byClass = {}
  for (const p of positioned) {
    const key = `${p.position} | ${p.cls} | CB=${p.ancestor}`
    byClass[key] = (byClass[key] || 0) + 1
  }

  return {
    vh,
    docScroll,
    docOverflow: docScroll - vh,
    offenderCount: offenders.length,
    offenders: offenders.sort((a, b) => b.bottom - a.bottom).slice(0, 15),
    positionedSummary: byClass,
  }
}

/** Re-measure after making main a containing block, to prove causation. */
function measureWithRelativeMain() {
  const main = document.querySelector('main')
  const before = document.documentElement.scrollHeight
  main.style.position = 'relative'
  // Force reflow.
  void main.offsetHeight
  const after = document.documentElement.scrollHeight
  const mainScroll = main.scrollHeight
  main.style.position = ''
  void main.offsetHeight
  const restored = document.documentElement.scrollHeight
  return { before, after, restored, mainScroll, vh: document.documentElement.clientHeight }
}

async function run() {
  await session('admin-abs-escape', async (ctx) => {
    const { page, log } = ctx
    await adminLogin(ctx)

    await page.goto(`${URLS.admin}/admin/hero`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#hero-heading', { timeout: 60000 })
    await page.waitForSelector('[data-testid="social-list"]', { timeout: 60000 })
    await page.waitForTimeout(3000)

    const data = await page.evaluate(findOffenders)
    log(`viewport height = ${data.vh}`)
    log(`document scrollHeight = ${data.docScroll}  (overflow = ${data.docOverflow}px)`)
    log(`\nelements painting below the viewport (${data.offenderCount} total, top 15 by bottom):`)
    for (const o of data.offenders) {
      log(`  bottom=${o.bottom} h=${o.height} pos=${o.position} escapes=${o.escapes} ` +
          `<${o.tag} class="${o.cls}"> "${o.text.replace(/\n/g, ' ')}"`)
    }

    log('\nall absolutely/fixed positioned elements, grouped (count | position | class | containing block):')
    for (const [key, count] of Object.entries(data.positionedSummary)) {
      log(`  ${String(count).padStart(3)} x  ${key}`)
    }

    const proof = await page.evaluate(measureWithRelativeMain)
    log(`\n=== CAUSATION TEST (toggle position:relative on <main>) ===`)
    log(`  doc scrollHeight before      = ${proof.before}`)
    log(`  doc scrollHeight with rel    = ${proof.after}   (viewport = ${proof.vh})`)
    log(`  doc scrollHeight after undo  = ${proof.restored}`)
    log(`  main scrollHeight with rel   = ${proof.mainScroll} (real content, still scrollable)`)
  })
}

run()
