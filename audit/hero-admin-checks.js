/**
 * Drives the five verification checks for the admin-manageable hero.
 *
 * Check 5 (migration backfill) is asserted FIRST, against the untouched
 * social_links, because check 4 mutates that list. It is still reported last.
 */
const H = require('./probe-hero-admin')
const { session, adminLogin, URLS } = H

const ROLES_AFTER = ['Full-Stack Engineer', 'Laravel Developer', 'Platform Engineer']

async function fillRoleRows(page, values) {
  const rows = page.locator('[data-testid="role-row"]')
  let count = await rows.count()

  while (count > values.length) {
    await page.click(`[aria-label="Remove role ${count}"]`)
    count -= 1
  }
  while (count < values.length) {
    await page.click('button:has-text("Add Role")')
    count += 1
  }
  for (let i = 0; i < values.length; i++) {
    await page.fill(`#role-${i}`, values[i])
  }
}

async function pickBadgeIcon(page, rowIndex, query, optionLabel) {
  const row = page.locator('[data-testid="badge-row"]').nth(rowIndex)
  const combo = row.locator('input[role="combobox"]')
  await combo.click()
  await combo.fill(query)
  const option = row.locator(`[role="option"]:has-text("${optionLabel}")`).first()
  await option.waitFor({ timeout: 20000 })
  await option.click()
}

session('hero-admin', async ({ page, shot, log, note }) => {
  // ---------- Check 5 (asserted before check 4 mutates social_links) ----------
  // Read straight from Node, not page.evaluate: the browser starts on
  // about:blank (origin "null"), and the backend's CORS policy only allows the
  // two configured app origins, so an in-page fetch is blocked before it runs.
  const apiBefore = await fetch('http://127.0.0.1:8000/api/hero').then((r) => r.json())
  const socialBefore = apiBefore?.data?.social_links || []
  log(`social_links before mutation: ${JSON.stringify(socialBefore)}`)

  const first = socialBefore[0] || {}
  const second = socialBefore[1] || {}
  const backfillOk =
    first.platform === 'github' &&
    /github\.com/.test(first.url || '') &&
    second.platform === 'linkedin' &&
    /linkedin\.com/.test(second.url || '')
  const check5Detail = `first two entries = ${JSON.stringify([first, second])}`

  await adminLogin({ page, log, URLS, CREDS: require('./harness').CREDS })
  await H.gotoHeroForm(page, log)
  await shot('admin-hero-initial')

  // ---------- Check 1: roles add / reorder / remove ----------
  const rolesBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="role-row"] input')).map((i) => i.value),
  )
  log(`roles before: ${JSON.stringify(rolesBefore)}`)

  await fillRoleRows(page, ROLES_AFTER)
  await shot('admin-roles-edited')
  const rolesSaved = await H.saveHeroForm(page, log)

  // "Platform Engineer" is unique to the new list, so its presence in the
  // rendered role markup is proof the page is no longer serving stale HTML.
  await H.reloadPublic(page, log, {
    settled: (p) =>
      p.evaluate(() => document.documentElement.innerHTML.includes('Platform Engineer')),
  })
  await shot('public-roles')
  const cycled = await H.observeTypewriter(page, ROLES_AFTER, log)
  const rolesPass =
    rolesSaved && ROLES_AFTER.every((r) => cycled.includes(r))
  H.record(
    'Check 1 — rotating role titles are admin-driven',
    rolesPass,
    `admin saved ${JSON.stringify(ROLES_AFTER)} (was ${JSON.stringify(rolesBefore)}); ` +
      `typewriter cycled ${JSON.stringify(cycled)}`,
  )

  // ---------- Check 2: add a 5th tech badge ----------
  await H.gotoHeroForm(page, log)
  const badgesBefore = await page.locator('[data-testid="badge-row"]').count()
  await page.click('button:has-text("Add Badge")')
  const newIndex = badgesBefore
  await page.fill(`#badge-label-${newIndex}`, 'Docker')
  await pickBadgeIcon(page, newIndex, 'docker', 'Docker')
  await shot('admin-badge-added')
  const badgeSaved = await H.saveHeroForm(page, log)

  await H.reloadPublic(page, log, {
    settled: (p) =>
      p.evaluate(
        (n) => document.querySelectorAll('[data-testid="orbit-badge"]').length === n,
        badgesBefore + 1,
      ),
  })
  const orbit = await H.readOrbit(page)
  await shot('public-orbit')

  const angles = orbit.map((b) => b.angle).sort((a, b) => a - b)
  const expectedStep = 360 / (orbit.length || 1)
  const gaps = angles.map((a, i) => (i === 0 ? a - (angles[angles.length - 1] - 360) : a - angles[i - 1]))
  const evenlySpaced = gaps.every((g) => Math.abs(g - expectedStep) < 0.5)

  // Overlap check on real rendered geometry, not just the angle math.
  let minCentreDist = Infinity
  for (let i = 0; i < orbit.length; i++) {
    for (let j = i + 1; j < orbit.length; j++) {
      const a = orbit[i].box
      const b = orbit[j].box
      if (!a || !b) continue
      minCentreDist = Math.min(minCentreDist, Math.hypot(a.cx - b.cx, a.cy - b.cy))
    }
  }
  const widest = Math.max(...orbit.map((b) => (b.box ? b.box.w : 0)))
  const noOverlap = minCentreDist > widest
  const allLogos = orbit.every((b) => b.hasLogo)
  const badgesPass = badgeSaved && orbit.length === badgesBefore + 1 && evenlySpaced && noOverlap && allLogos

  H.record(
    'Check 2 — 5th tech badge renders, evenly spaced with real logos',
    badgesPass,
    `${badgesBefore} badges before, ${orbit.length} after; angles ${JSON.stringify(angles)} ` +
      `(expected step ${expectedStep.toFixed(1)}°, even=${evenlySpaced}); ` +
      `min centre distance ${Math.round(minCentreDist)}px vs widest badge ${widest}px (noOverlap=${noOverlap}); ` +
      `all badges have a logo=${allLogos}; labels ${JSON.stringify(orbit.map((b) => b.label))}`,
  )

  // ---------- Check 3: availability toggle off, then on with custom label ----------
  await H.gotoHeroForm(page, log)
  const badgeTextBefore = await page.evaluate(() => {
    const el = document.querySelector('#hero-availability-label')
    return el ? el.value : null
  })
  await page.click('#hero-is-available')
  const offSaved = await H.saveHeroForm(page, log)
  await H.reloadPublic(page, log, {
    settled: (p) =>
      p.evaluate(
        () => document.querySelectorAll('[data-testid="availability-badge"]').length === 0,
      ),
  })
  const badgeHiddenCount = await page.locator('[data-testid="availability-badge"]').count()
  await shot('public-availability-off')

  await H.gotoHeroForm(page, log)
  await page.click('#hero-is-available')
  await page.fill('#hero-availability-label', 'Open to Opportunities')
  const onSaved = await H.saveHeroForm(page, log)
  await H.reloadPublic(page, log, {
    settled: (p) =>
      p.evaluate(() => {
        const el = document.querySelector('[data-testid="availability-badge"]')
        return !!el && el.textContent.includes('Open to Opportunities')
      }),
  })
  const badgeText = await page
    .locator('[data-testid="availability-badge"]')
    .innerText()
    .catch(() => '')
  await shot('public-availability-on')

  const availPass =
    offSaved && onSaved && badgeHiddenCount === 0 && /Open to Opportunities/i.test(badgeText)
  H.record(
    'Check 3 — availability toggle hides badge, custom label renders',
    availPass,
    `label field was ${JSON.stringify(badgeTextBefore)}; with is_available=false the badge ` +
      `rendered ${badgeHiddenCount} time(s); re-enabled with a custom label the badge read ` +
      `${JSON.stringify(badgeText.trim())}`,
  )

  // ---------- Check 4: remove LinkedIn, add Twitter/X ----------
  await H.gotoHeroForm(page, log)
  const socialRows = page.locator('[data-testid="social-row"]')
  const rowCount = await socialRows.count()
  let linkedinIndex = -1
  for (let i = 0; i < rowCount; i++) {
    const platform = await socialRows.nth(i).locator('select').inputValue()
    if (platform === 'linkedin') linkedinIndex = i
  }
  if (linkedinIndex >= 0) {
    await page.click(`[aria-label="Remove social link ${linkedinIndex + 1}"]`)
    log(`removed linkedin row at index ${linkedinIndex}`)
  }
  await page.click('button:has-text("Add Link")')
  const lastRow = (await socialRows.count()) - 1
  await socialRows.nth(lastRow).locator('select').selectOption('x')
  await page.fill(`#social-url-${lastRow}`, 'https://x.com/hasibulalamh')
  await shot('admin-socials-edited')
  const socialSaved = await H.saveHeroForm(page, log)

  await H.reloadPublic(page, log, {
    settled: (p) =>
      p.evaluate(() => {
        const links = [...document.querySelectorAll('[data-testid="hero-social-link"]')]
        return (
          links.some((a) => a.dataset.platform === 'x') &&
          !links.some((a) => a.dataset.platform === 'linkedin')
        )
      }),
  })
  const socials = await H.readHeroSocials(page)
  await shot('public-socials')

  const platforms = socials.map((s) => s.platform)
  const xLink = socials.find((s) => s.platform === 'x')
  const socialPass =
    socialSaved &&
    !platforms.includes('linkedin') &&
    platforms.includes('x') &&
    xLink?.href === 'https://x.com/hasibulalamh' &&
    socials.every((s) => s.hasIcon && s.href)
  H.record(
    'Check 4 — social links list is admin-driven',
    socialPass,
    `hero now renders ${JSON.stringify(socials.map((s) => ({ platform: s.platform, href: s.href })))}; ` +
      `linkedin absent=${!platforms.includes('linkedin')}; every link has an icon=${socials.every((s) => s.hasIcon)}`,
  )

  // ---------- Check 5 reported last ----------
  H.record(
    'Check 5 — github_url/linkedin_url backfilled into social_links without data loss',
    backfillOk,
    check5Detail,
  )

  for (const r of H.results) if (!r.pass) note({ title: r.name, detail: r.detail })

  console.log('\n  [hero-admin] === CHECK RESULTS ===')
  for (const r of H.results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`)
  require('fs').writeFileSync(
    require('path').join(__dirname, 'logs', 'hero-admin-checks.json'),
    JSON.stringify(H.results, null, 2),
  )
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
