/**
 * Regression check for the `relative` added to the admin shell's <main>.
 *
 * Making main a containing block could in principle clip an absolutely
 * positioned overlay that previously escaped main's `overflow-auto`. The only
 * such overlay inside main is the TechIconPicker dropdown on the Hero form, so
 * open it and confirm it still paints at a usable size.
 *
 * (Its containing block is its own `div.relative` wrapper, which already sat
 * inside main, so main's overflow clipped it before this change too — this
 * verifies that reasoning against the real browser rather than assuming it.)
 */
const { session, adminLogin, URLS } = require('./harness')

const results = []
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`  [overlay] ${pass ? 'PASS' : 'FAIL'} — ${name}: ${detail}`)
}

async function run() {
  await session('verify-admin-overlays', async (ctx) => {
    const { page, log, shot } = ctx
    await adminLogin(ctx)

    await page.goto(`${URLS.admin}/admin/hero`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#hero-heading', { timeout: 60000 })
    await page.waitForSelector('[data-testid="badges-list"]', { timeout: 60000 })
    await page.waitForTimeout(3000)

    const mainPos = await page.evaluate(
      () => getComputedStyle(document.querySelector('main')).position,
    )
    log(`main position = ${mainPos}`)

    // Scroll a tech badge row into view and open its logo dropdown.
    const inputs = await page.$$('[data-testid="badge-row"] input[role="combobox"], ' +
                                '[data-testid="badge-row"] input[aria-autocomplete]')
    log(`found ${inputs.length} tech-icon combobox inputs`)

    if (inputs.length === 0) {
      // Fall back to any text input inside the picker wrapper.
      const alt = await page.$$('[data-testid="badge-row"] input')
      log(`falling back to ${alt.length} inputs inside badge rows`)
    }

    const target = inputs[inputs.length - 1] || (await page.$$('[data-testid="badge-row"] input')).pop()
    if (!target) {
      record('tech icon dropdown opens unclipped', false, 'no picker input found on the Hero form')
      return
    }

    await target.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await target.click()
    await target.fill('react')
    await page.waitForTimeout(1200)

    const drop = await page.evaluate(() => {
      const ul = document.querySelector('ul[role="listbox"]')
      if (!ul) return null
      const r = ul.getBoundingClientRect()
      const main = document.querySelector('main')
      const mr = main.getBoundingClientRect()
      const cs = getComputedStyle(ul)
      // How much of the dropdown falls inside main's visible box.
      const visibleHeight = Math.max(
        0,
        Math.min(r.bottom, mr.bottom) - Math.max(r.top, mr.top),
      )
      return {
        height: Math.round(r.height),
        width: Math.round(r.width),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        mainTop: Math.round(mr.top),
        mainBottom: Math.round(mr.bottom),
        visibleHeight: Math.round(visibleHeight),
        optionCount: ul.querySelectorAll('[role="option"]').length,
        zIndex: cs.zIndex,
        position: cs.position,
      }
    })

    if (!drop) {
      record('tech icon dropdown opens unclipped', false, 'listbox never appeared after typing "react"')
    } else {
      log(`dropdown: ${drop.width}x${drop.height} at top=${drop.top} bottom=${drop.bottom}, ` +
          `main box ${drop.mainTop}..${drop.mainBottom}, position=${drop.position} z=${drop.zIndex}`)
      log(`options rendered: ${drop.optionCount}, visible height inside main = ${drop.visibleHeight}`)
      // Usable means: options exist and a meaningful slice is on screen.
      record(
        'tech icon dropdown opens and is usable (not clipped away)',
        drop.optionCount > 0 && drop.visibleHeight >= 80,
        `${drop.optionCount} options, ${drop.visibleHeight}px of the dropdown visible ` +
          `inside main (dropdown is ${drop.height}px tall)`,
      )
    }

    await shot('hero-tech-dropdown-open', { fullPage: false })

    // The header user menu and the toast layer are `fixed`, which position:relative
    // on an ancestor does not affect — confirm the menu still opens on top.
    await page.click('button[aria-haspopup], header button:last-of-type').catch(() => {})
    await page.waitForTimeout(800)
    const menu = await page.evaluate(() => {
      const m = document.querySelector('[role="menu"]')
      if (!m) return null
      const r = m.getBoundingClientRect()
      return { h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top) }
    })
    if (menu) {
      record(
        'header user menu still renders',
        menu.h > 0 && menu.w > 0,
        `menu ${menu.w}x${menu.h} at top=${menu.top}`,
      )
    } else {
      log('header user menu not opened by the generic selector; skipping (not affected by the fix)')
    }
    await shot('header-menu', { fullPage: false })

    const failed = results.filter((r) => !r.pass)
    log(`\n=== ${results.length - failed.length}/${results.length} overlay checks passed ===`)
  })

  require('fs').writeFileSync(
    require('path').join(__dirname, 'logs', 'verify-admin-overlays-checks.json'),
    JSON.stringify(results, null, 2),
  )
}

run()
