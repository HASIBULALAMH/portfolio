/**
 * Verification: Skills & API Showcase — no visible card boxes, only glowing logos.
 */
const { chromium } = require('playwright')

const FRONTEND = 'http://localhost:3000'

const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

;(async () => {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 60000 })

  // === SKILLS SECTION ===
  console.log('\n=== SKILLS SECTION ===')
  await page.locator('#skills').scrollIntoViewIfNeeded()
  await page.waitForTimeout(2000)

  // Check 1: No visible rectangular border or solid background box around skill items
  const skillItems = page.locator('#skills .group')
  const skillCount = await skillItems.count()

  if (skillCount === 0) {
    record('Skills section has items', false, 'No skill items found')
  } else {
    record('Skills section has items', true, `${skillCount} items`)

    const firstSkillBox = await skillItems.first().evaluate((el) => {
      const s = window.getComputedStyle(el)
      return {
        border: s.borderWidth,
        bg: s.backgroundColor,
        borderRadius: s.borderRadius,
      }
    })

    const noBox =
      (firstSkillBox.bg === 'rgba(0, 0, 0, 0)' || firstSkillBox.bg === 'transparent') &&
      parseFloat(firstSkillBox.border) === 0

    record(
      'Skills: No visible card boxes',
      noBox,
      `border: ${firstSkillBox.border}, bg: ${firstSkillBox.bg}`
    )
  }

  // Check 2: Glow elements exist with brand colors
  const skillGlows = await page.locator('#skills .tech-glow').count()
  record(
    'Skills: Glow elements present',
    skillGlows > 0,
    `${skillGlows} glow containers`
  )

  const skillBlooms = await page.locator('#skills .tech-glow__bloom').count()
  record(
    'Skills: Bloom layers present',
    skillBlooms > 0,
    `${skillBlooms} bloom elements`
  )

  // Check 3: Verify brand color variables are set
  if (skillGlows > 0) {
    const brandGlow = await page.locator('#skills .tech-glow').first().evaluate(el => {
      return getComputedStyle(el).getPropertyValue('--brand-glow')
    })
    record(
      'Skills: Brand glow color set',
      brandGlow && brandGlow.includes('rgba'),
      brandGlow || 'no --brand-glow variable'
    )
  }

  // Check 4: Text (name/category) has no background/border
  const skillName = page.locator('#skills .font-medium.text-foreground').first()
  if (await skillName.count() > 0) {
    const textBg = await skillName.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    )
    record(
      'Skills: Text has no background',
      textBg === 'rgba(0, 0, 0, 0)' || textBg === 'transparent',
      `bg: ${textBg}`
    )
  }

  // Check 5: Grid spacing adequate
  const skillsGrid = page.locator('#skills .grid')
  const gridGap = await skillsGrid.evaluate(el => window.getComputedStyle(el).gap)
  const gapPx = parseFloat(gridGap)
  record(
    'Skills: Grid spacing adequate',
    gapPx >= 24,
    `gap: ${gridGap} (${gapPx >= 24 ? '≥ 24px' : '< 24px'})`
  )

  // === API SHOWCASE SECTION ===
  console.log('\n=== API SHOWCASE SECTION ===')
  await page.locator('#apis').scrollIntoViewIfNeeded()
  await page.waitForTimeout(2000)

  const apiItems = page.locator('#apis .group')
  const apiCount = await apiItems.count()

  if (apiCount === 0) {
    console.log('⊘ No API showcase items found, skipping API checks')
  } else {
    record('API Showcase has items', true, `${apiCount} items`)

    // Check 6: API items have no card-style boxes
    const firstApiBox = await apiItems.first().evaluate((el) => {
      const s = window.getComputedStyle(el)
      return {
        border: s.borderWidth,
        bg: s.backgroundColor,
        borderRadius: s.borderRadius,
        backdropFilter: s.backdropFilter,
        overflow: s.overflow,
      }
    })

    const noApiBox =
      parseFloat(firstApiBox.border) === 0 &&
      !firstApiBox.backdropFilter.includes('blur')

    record(
      'API: No visible card boxes',
      noApiBox,
      `border: ${firstApiBox.border}, backdrop-filter: ${firstApiBox.backdropFilter}`
    )

    // Check 7: API glow elements
    const apiGlows = await page.locator('#apis .tech-glow').count()
    record(
      'API: Glow elements present',
      apiGlows > 0,
      `${apiGlows} glow containers`
    )

    const apiBlooms = await page.locator('#apis .tech-glow__bloom').count()
    record(
      'API: Bloom layers present',
      apiBlooms > 0,
      `${apiBlooms} bloom elements`
    )

    // Check 8: API grid spacing
    const apisGrid = page.locator('#apis .grid')
    const apiGridGap = await apisGrid.evaluate(el => window.getComputedStyle(el).gap)
    const apiGapPx = parseFloat(apiGridGap)
    record(
      'API: Grid spacing adequate',
      apiGapPx >= 24,
      `gap: ${apiGridGap} (${apiGapPx >= 24 ? '≥ 24px' : '< 24px'})`
    )
  }

  // Take screenshots
  await page.locator('#skills').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({
    path: '/tmp/verify-glow-skills.png',
    fullPage: false
  })

  if (apiCount > 0) {
    await page.locator('#apis').scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await page.screenshot({
      path: '/tmp/verify-glow-api.png',
      fullPage: false
    })
  }

  await browser.close()

  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)

  require('fs').writeFileSync(
    '/tmp/verify-glow-no-boxes.json',
    JSON.stringify(results, null, 2)
  )

  process.exit(failed.length ? 1 : 0)
})()
