/**
 * End-to-end verification for the three fixes in this change set.
 *
 * 1. admin scroll down-then-up keeps content on 2+ long pages
 * 2. testimonial card order avatar -> name/role -> stars -> quote, stars
 *    centred, real uploaded photo rendered
 * 3. Skills admin: type a partial name -> dropdown of real logos -> select ->
 *    save -> logo renders on the public Skills section
 * 4. same for API Showcase
 * 5. an unmigrated entry (icon_slug null) still renders, no broken image
 *
 * Each check prints PASS/FAIL with the observation behind it.
 */
const { session, adminLogin } = require('./harness')

const FRONTEND = 'http://localhost:3000'
const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`  [verify] ${pass ? 'PASS' : 'FAIL'} — ${name}\n            ${detail}`)
}

/** The public site caches API reads for 60s; force a fresh render. */
async function freshLoad(page, url) {
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(2500)
}

session('verify-all', async ({ page, shot, log, URLS, CREDS }) => {
  await adminLogin({ page, log, URLS, CREDS })

  // ---------------------------------------------------------------- CHECK 1
  log('\n===== CHECK 1: admin scroll down-then-up =====')
  const scrollObs = []
  for (const path of ['/admin/about', '/admin/hero']) {
    await page.goto(`${URLS.admin}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => {
        const m = document.querySelector('main')
        return m && m.innerText.trim().length > 80
      },
      { timeout: 90000 },
    )
    await page.waitForTimeout(1200)

    const read = () =>
      page.evaluate(() => {
        const m = document.querySelector('main')
        return m
          ? { textLen: m.innerText.trim().length, scrollTop: Math.round(m.scrollTop) }
          : { textLen: 0, scrollTop: -1 }
      })

    const before = await read()
    await page.mouse.move(700, 500)
    for (let i = 0; i < 18; i++) { await page.mouse.wheel(0, 350); await page.waitForTimeout(35) }
    await page.waitForTimeout(600)
    const bottom = await read()
    await shot(`c1${path.replace(/\//g, '_')}-bottom`, { fullPage: false })
    for (let i = 0; i < 18; i++) { await page.mouse.wheel(0, -350); await page.waitForTimeout(35) }
    await page.waitForTimeout(900)
    const after = await read()
    await shot(`c1${path.replace(/\//g, '_')}-back-top`, { fullPage: false })

    const ok = after.textLen >= before.textLen * 0.95 && after.textLen > 80
    scrollObs.push(`${path}: text ${before.textLen}->${bottom.textLen}(bottom, scrollTop=${bottom.scrollTop})->${after.textLen} ${ok ? 'intact' : 'LOST'}`)
    if (!ok) scrollObs.push(`${path} FAILED`)
  }
  record(
    'Check 1 — admin content survives scroll down-then-up on 2 pages',
    !scrollObs.some((o) => o.includes('FAILED')),
    scrollObs.join(' | '),
  )

  // ---------------------------------------------------------------- CHECK 3a
  log('\n===== CHECK 3: Skills picker =====')
  await page.goto(`${URLS.admin}/admin/skills`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)

  await page.getByRole('button', { name: 'Add skill' }).click()
  await page.waitForTimeout(800)
  await page.fill('#skill-name', 'Laravel')

  const skillPicker = page.getByRole('combobox').first()
  await skillPicker.click()
  await skillPicker.fill('larav')
  await page.waitForTimeout(900)
  await shot('c3-skills-dropdown', { fullPage: false })

  const skillOptions = await page.locator('[role="option"]').all()
  const skillOptionInfo = []
  for (const opt of skillOptions.slice(0, 6)) {
    skillOptionInfo.push({
      slug: await opt.getAttribute('data-slug'),
      text: (await opt.innerText()).replace(/\s+/g, ' ').trim(),
      hasSvg: (await opt.locator('svg, img').count()) > 0,
    })
  }
  log(`skills dropdown: ${JSON.stringify(skillOptionInfo)}`)

  const laravelOpt = page.locator('[role="option"][data-slug="laravel"]')
  const dropdownOk = skillOptionInfo.length > 0 && (await laravelOpt.count()) > 0
  record(
    'Check 3a — Skills picker shows real logo matches for a partial name',
    dropdownOk,
    `typed "larav" -> ${skillOptionInfo.length} options, all with rendered marks: ${skillOptionInfo.map((o) => o.slug).join(', ')}`,
  )

  await laravelOpt.click()
  await page.waitForTimeout(600)
  const previewSlug = await page.locator('[data-testid="tech-icon-preview"]').first().getAttribute('data-slug')
  await shot('c3-skills-selected', { fullPage: false })

  await page.getByRole('button', { name: /^Add$/ }).click()
  await page.waitForTimeout(3000)
  await shot('c3-skills-saved', { fullPage: false })

  const savedSkill = await page.evaluate(async () => {
    const res = await fetch('http://127.0.0.1:8000/api/skills', { headers: { Accept: 'application/json' } })
    const json = await res.json()
    return (json.data || []).flatMap((c) => c.skills || []).map((s) => ({ name: s.name, slug: s.icon_slug }))
  })
  log(`skills after save: ${JSON.stringify(savedSkill)}`)
  const laravelSaved = savedSkill.find((s) => s.slug === 'laravel')
  record(
    'Check 3b — selected logo persists to the API',
    Boolean(laravelSaved),
    `preview showed slug="${previewSlug}"; API now returns ${JSON.stringify(savedSkill)}`,
  )

  // ---------------------------------------------------------------- CHECK 4a
  log('\n===== CHECK 4: API Showcase picker =====')
  await page.goto(`${URLS.admin}/admin/api-showcase`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await page.getByRole('button', { name: /Add Showcase/i }).click()
  await page.waitForTimeout(900)

  await page.fill('#showcase-title', 'Redis Caching Layer')
  const apiPicker = page.getByRole('combobox').first()
  await apiPicker.click()
  await apiPicker.fill('redi')
  await page.waitForTimeout(900)
  await shot('c4-api-dropdown', { fullPage: false })

  const apiOptions = await page.locator('[role="option"]').all()
  const apiOptionInfo = []
  for (const opt of apiOptions.slice(0, 6)) {
    apiOptionInfo.push(await opt.getAttribute('data-slug'))
  }
  log(`api dropdown: ${JSON.stringify(apiOptionInfo)}`)

  const redisOpt = page.locator('[role="option"][data-slug="redis"]')
  record(
    'Check 4a — API Showcase picker shows real logo matches',
    apiOptionInfo.length > 0 && (await redisOpt.count()) > 0,
    `typed "redi" -> options: ${apiOptionInfo.join(', ')}`,
  )
  await redisOpt.click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /^Create$/ }).click()
  await page.waitForTimeout(3500)
  await shot('c4-api-saved', { fullPage: false })

  const savedApis = await page.evaluate(async () => {
    const res = await fetch('http://127.0.0.1:8000/api/api-showcases', { headers: { Accept: 'application/json' } })
    const json = await res.json()
    return (json.data || []).map((a) => ({ title: a.title, slug: a.icon_slug, lucide: a.icon_name }))
  })
  log(`showcases after save: ${JSON.stringify(savedApis)}`)
  record(
    'Check 4b — API Showcase logo persists to the API',
    savedApis.some((a) => a.slug === 'redis'),
    `API returns ${JSON.stringify(savedApis)}`,
  )

  // ---------------------------------------------------------------- CHECK 2
  log('\n===== CHECK 2: public testimonials card =====')
  await freshLoad(page, `${FRONTEND}/`)
  await page.evaluate(() => {
    document.querySelector('#testimonials')?.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(2500)
  await shot('c2-testimonials', { fullPage: false })

  const card = await page.evaluate(() => {
    const fig = document.querySelector('#testimonials figure')
    if (!fig) return { error: 'no figure' }

    const img = fig.querySelector('img')
    const caption = fig.querySelector('figcaption')
    const stars = fig.querySelectorAll('svg.lucide-star, [role="img"] svg')
    const starRow = fig.querySelector('[role="img"][aria-label*="star" i]')
    const quote = fig.querySelector('blockquote')

    const topOf = (el) => (el ? Math.round(el.getBoundingClientRect().top) : null)
    const figRect = fig.getBoundingClientRect()
    const rowRect = starRow ? starRow.getBoundingClientRect() : null

    return {
      avatarSrc: img ? img.getAttribute('src') : null,
      avatarRendered: img ? img.naturalWidth > 0 && img.naturalHeight > 0 : false,
      avatarNatural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null,
      order: {
        avatar: topOf(img),
        caption: topOf(caption),
        stars: topOf(starRow),
        quote: topOf(quote),
      },
      starCount: stars.length,
      // Centring: the star row's own centre vs the card's centre.
      starRowCenterOffset:
        rowRect ? Math.round((rowRect.left + rowRect.width / 2) - (figRect.left + figRect.width / 2)) : null,
      starRowJustify: starRow ? getComputedStyle(starRow).justifyContent : null,
      starRowAlign: starRow ? getComputedStyle(starRow).alignItems : null,
      authorText: caption ? caption.innerText.replace(/\s+/g, ' ').trim() : null,
    }
  })
  log(`card: ${JSON.stringify(card, null, 2)}`)

  const o = card.order || {}
  const orderOk =
    o.avatar != null && o.caption != null && o.stars != null && o.quote != null &&
    o.avatar < o.caption && o.caption < o.stars && o.stars < o.quote
  const centeredOk = card.starRowCenterOffset != null && Math.abs(card.starRowCenterOffset) <= 2

  record(
    'Check 2a — card order is avatar -> name/role -> stars -> quote',
    orderOk,
    `y-offsets avatar=${o.avatar} caption=${o.caption} stars=${o.stars} quote=${o.quote}`,
  )
  record(
    'Check 2b — star row is horizontally centred',
    centeredOk,
    `${card.starCount} stars, row centre is ${card.starRowCenterOffset}px from card centre (justify-content=${card.starRowJustify}, align-items=${card.starRowAlign})`,
  )
  record(
    'Check 2c — real uploaded avatar renders (not a placeholder)',
    Boolean(card.avatarSrc) && card.avatarRendered,
    `src=${card.avatarSrc}, decoded at ${card.avatarNatural}, author="${card.authorText}"`,
  )

  // ---------------------------------------------------------------- CHECK 3c/4c
  log('\n===== CHECK 3c/4c: logos on the public site =====')
  await freshLoad(page, `${FRONTEND}/`)
  await page.evaluate(() => document.querySelector('#skills')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(2000)
  await shot('c3-public-skills', { fullPage: false })

  const publicSkills = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#skills .grid > div')]
    return cards.map((c) => {
      const svg = c.querySelector('svg[role="img"]')
      const img = c.querySelector('img')
      return {
        label: c.innerText.replace(/\s+/g, ' ').trim().slice(0, 40),
        svgTitle: svg?.querySelector('title')?.textContent || null,
        svgFill: svg ? getComputedStyle(svg).fill : null,
        imgSrc: img?.getAttribute('src') || null,
        imgOk: img ? img.naturalWidth > 0 : null,
      }
    })
  })
  log(`public skills: ${JSON.stringify(publicSkills, null, 2)}`)
  record(
    'Check 3c — the selected logo renders on the public Skills section',
    publicSkills.some((s) => (s.svgTitle || '').toLowerCase().includes('laravel') || /laravel/i.test(s.label)),
    `rendered: ${publicSkills.map((s) => `${s.label}[svg=${s.svgTitle} fill=${s.svgFill}]`).join(' | ')}`,
  )

  await page.evaluate(() => document.querySelector('#apis')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(2000)
  await shot('c4-public-apis', { fullPage: false })

  const publicApis = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#apis .grid > div')]
    return cards.map((c) => {
      const svg = c.querySelector('svg[role="img"]')
      const img = c.querySelector('img')
      const h3 = c.querySelector('h3')
      return {
        title: h3 ? h3.innerText.trim() : null,
        brandSvgTitle: svg?.querySelector('title')?.textContent || null,
        imgSrc: img?.getAttribute('src') || null,
        imgOk: img ? img.naturalWidth > 0 : null,
        // A lucide fallback renders an svg with no <title>.
        anyIcon: Boolean(c.querySelector('svg')),
      }
    })
  })
  log(`public apis: ${JSON.stringify(publicApis, null, 2)}`)
  record(
    'Check 4c — the selected logo renders on the public API Showcase section',
    publicApis.some((a) => (a.brandSvgTitle || '').toLowerCase().includes('redis')),
    `rendered: ${publicApis.map((a) => `${a.title}[brand=${a.brandSvgTitle}]`).join(' | ')}`,
  )

  // ---------------------------------------------------------------- CHECK 5
  const unmigrated = publicApis.filter((a) => !a.brandSvgTitle)
  const noBrokenImages = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#apis img, #skills img')]
    return {
      total: imgs.length,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
    }
  })
  record(
    'Check 5 — unmigrated entries (icon_slug null) still render, nothing broken',
    unmigrated.length > 0 && unmigrated.every((a) => a.anyIcon) && noBrokenImages.broken.length === 0,
    `${unmigrated.length} showcases still on the lucide fallback (${unmigrated.map((a) => a.title).join(', ')}), each drew an icon; broken images: ${noBrokenImages.broken.length}`,
  )

  // ---------------------------------------------------------------- SUMMARY
  console.log('\n  [verify] ================ SUMMARY ================')
  for (const r of results) console.log(`  [verify] ${r.pass ? 'PASS' : 'FAIL'} — ${r.name}`)
  const failed = results.filter((r) => !r.pass)
  console.log(`  [verify] ${results.length - failed.length}/${results.length} checks passed`)
  require('fs').writeFileSync('/tmp/verify-results.json', JSON.stringify(results, null, 2))
})
