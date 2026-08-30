/**
 * Repro probe for the admin "content goes blank after scroll down then up" bug.
 *
 * Isolates the trigger by running three variants on the About page:
 *   A. plain scroll down -> up, no interaction
 *   B. scroll down -> click "Add Stat" -> scroll up
 *   C. scroll down -> click "Save Changes" -> scroll up
 *
 * After each, it measures whether the main content is actually painted:
 * element count, main's scrollHeight, and the bounding box of the first Card.
 */
const { session, adminLogin } = require('./harness')

const PAGES = ['/admin/about', '/admin/hero', '/admin/projects', '/admin/timeline', '/admin/settings']

async function measure(page, label, log) {
  const m = await page.evaluate(() => {
    const main = document.querySelector('main')
    if (!main) return { error: 'no main' }
    const card = main.querySelector('[class*="rounded-lg"][class*="border"]')
    const cardBox = card ? card.getBoundingClientRect() : null
    const mainBox = main.getBoundingClientRect()
    return {
      mainScrollTop: main.scrollTop,
      mainScrollHeight: main.scrollHeight,
      mainClientHeight: main.clientHeight,
      mainBox: { w: Math.round(mainBox.width), h: Math.round(mainBox.height) },
      childCount: main.querySelectorAll('*').length,
      textLen: main.innerText.trim().length,
      cardBox: cardBox
        ? { w: Math.round(cardBox.width), h: Math.round(cardBox.height), top: Math.round(cardBox.top) }
        : null,
      // Is anything actually visible in the viewport region main occupies?
      visibleAtCenter: (() => {
        const x = mainBox.left + mainBox.width / 2
        const y = mainBox.top + mainBox.height / 2
        const el = document.elementFromPoint(x, y)
        return el ? el.tagName + '.' + (el.className || '').toString().slice(0, 60) : null
      })(),
    }
  })
  log(`${label}: ${JSON.stringify(m)}`)
  return m
}

session('scroll-blank', async ({ page, shot, log, note, URLS, CREDS }) => {
  await adminLogin({ page, log, URLS, CREDS })

  for (const path of PAGES) {
    log(`\n===== ${path} =====`)
    await page.goto(`${URLS.admin}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    await page.waitForFunction(
      () => {
        const m = document.querySelector('main')
        return m && m.innerText.trim().length > 50
      },
      { timeout: 60000 },
    ).catch(() => log('timed out waiting for content'))

    const slug = path.replace(/\//g, '_')
    const before = await measure(page, `${path} initial`, log)
    await shot(`${slug}-1-initial`, { fullPage: false })

    // --- Variant A: plain scroll down then up ---
    await page.evaluate(() => {
      const m = document.querySelector('main')
      m.scrollTop = m.scrollHeight
    })
    await page.waitForTimeout(1200)
    await measure(page, `${path} A@bottom`, log)
    await shot(`${slug}-2-bottom`, { fullPage: false })

    await page.evaluate(() => {
      const m = document.querySelector('main')
      m.scrollTop = 0
    })
    await page.waitForTimeout(1200)
    const afterA = await measure(page, `${path} A@top-again`, log)
    await shot(`${slug}-3-back-top`, { fullPage: false })

    if (afterA.textLen < before.textLen * 0.5 || afterA.cardBox?.h === 0) {
      note({
        title: `Content blank after plain scroll down/up on ${path}`,
        detail: JSON.stringify({ before, afterA }),
      })
    }

    // --- Variant B: real mouse-wheel scroll (differs from programmatic) ---
    await page.mouse.move(700, 500)
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(60)
    }
    await page.waitForTimeout(800)
    await measure(page, `${path} B@wheel-bottom`, log)
    await shot(`${slug}-4-wheel-bottom`, { fullPage: false })

    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, -400)
      await page.waitForTimeout(60)
    }
    await page.waitForTimeout(1000)
    const afterB = await measure(page, `${path} B@wheel-top`, log)
    await shot(`${slug}-5-wheel-top`, { fullPage: false })

    if (afterB.textLen < before.textLen * 0.5 || afterB.cardBox?.h === 0) {
      note({
        title: `Content blank after wheel scroll down/up on ${path}`,
        detail: JSON.stringify({ before, afterB }),
      })
    }
  }

  // --- Variant C: About page with interactions ---
  log('\n===== About + interactions =====')
  await page.goto(`${URLS.admin}/admin/about`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  const addStat = page.getByRole('button', { name: /Add Stat/i })
  if (await addStat.count()) {
    await page.evaluate(() => { document.querySelector('main').scrollTop = 99999 })
    await page.waitForTimeout(600)
    await addStat.click()
    await page.waitForTimeout(800)
    await measure(page, 'after Add Stat @bottom', log)
    await shot('about-6-after-addstat', { fullPage: false })
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0 })
    await page.waitForTimeout(1000)
    const m = await measure(page, 'after Add Stat @top', log)
    await shot('about-7-addstat-top', { fullPage: false })
    if (m.textLen < 100) note({ title: 'Blank after Add Stat + scroll up', detail: JSON.stringify(m) })
  } else {
    log('Add Stat button not found')
  }

  const save = page.getByRole('button', { name: /Save Changes/i })
  if (await save.count()) {
    await page.evaluate(() => { document.querySelector('main').scrollTop = 99999 })
    await page.waitForTimeout(600)
    await save.click()
    await page.waitForTimeout(3000)
    await measure(page, 'after Save @bottom', log)
    await shot('about-8-after-save', { fullPage: false })
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0 })
    await page.waitForTimeout(1200)
    const m = await measure(page, 'after Save @top', log)
    await shot('about-9-save-top', { fullPage: false })
    if (m.textLen < 100) note({ title: 'Blank after Save + scroll up', detail: JSON.stringify(m) })
  } else {
    log('Save button not found')
  }

  // --- Variant D: navigate away and back ---
  log('\n===== navigate away and back =====')
  await page.evaluate(() => { document.querySelector('main').scrollTop = 99999 })
  await page.waitForTimeout(600)
  await page.goto(`${URLS.admin}/admin/skills`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const m = await measure(page, 'after back-nav', log)
  await shot('about-10-after-back', { fullPage: false })
  if (m.textLen < 100) note({ title: 'Blank after navigating away and back', detail: JSON.stringify(m) })
})
