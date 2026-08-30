/**
 * Verification: Skills section — floating logos with brand-color glows,
 * no visible card boxes.
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

  await page.goto(`${FRONTEND}/#skills`, { waitUntil: 'networkidle', timeout: 60000 })

  // Scroll the section into view so framer-motion's whileInView animations run.
  await page.locator('#skills').scrollIntoViewIfNeeded()
  await page.waitForTimeout(2000)

  // Check 1: No visible card boxes around skill items. Scoped to #skills —
  // other sections legitimately still use .glass cards.
  const skillItems = page.locator('#skills .tech-glow').first()
  await skillItems.waitFor({ timeout: 15000 })

  const glassTiles = await page.locator('#skills .glass').count()
  record(
    'No .glass card boxes around skill items',
    glassTiles === 0,
    glassTiles > 0 ? `Found ${glassTiles} .glass elements` : 'none found'
  )

  // Computed-style proof that no box remains: the grid item wrapping each
  // logo must have a transparent background and zero-width border.
  const itemBox = await page.locator('#skills .grid > div').first().evaluate((el) => {
    const s = window.getComputedStyle(el)
    return {
      background: s.backgroundColor,
      borderTopWidth: s.borderTopWidth,
      borderRadius: s.borderTopLeftRadius,
    }
  })
  const noBox =
    (itemBox.background === 'rgba(0, 0, 0, 0)' || itemBox.background === 'transparent') &&
    parseFloat(itemBox.borderTopWidth) === 0
  record(
    'Skill item wrapper has no background fill or border',
    noBox,
    `bg: ${itemBox.background}, border: ${itemBox.borderTopWidth}, radius: ${itemBox.borderRadius}`
  )

  // Check 2: Glow elements exist
  const glowCount = await page.locator('.tech-glow__bloom').count()
  record(
    'Brand-color glow elements present',
    glowCount > 0,
    `${glowCount} bloom elements rendered`
  )

  // Check 3: Icons still visible and crisp
  const iconCount = await page.locator('.tech-glow svg, .tech-glow span[style*="mask"]').count()
  record(
    'Tech icons rendered (SVG or CSS mask)',
    iconCount > 0,
    `${iconCount} icons found`
  )

  // Check 4: Text has no background box
  const skillNames = page.locator('span.font-medium.text-foreground')
  const firstNameBg = await skillNames.first().evaluate(el =>
    window.getComputedStyle(el).backgroundColor
  )
  record(
    'Skill name text has no solid background',
    firstNameBg === 'rgba(0, 0, 0, 0)' || firstNameBg === 'transparent',
    `background-color: ${firstNameBg}`
  )

  // Check 5: Grid spacing adequate without card boundaries
  const gridGap = await page.locator('.grid').first().evaluate(el =>
    window.getComputedStyle(el).gap
  )
  record(
    'Grid spacing increased for floating layout',
    parseFloat(gridGap) >= 24, // 6 × 4 = 24px minimum
    `gap: ${gridGap}`
  )

  await page.screenshot({ path: '/tmp/floating-logos-skills.png', fullPage: false })
  console.log('\nScreenshot saved: /tmp/floating-logos-skills.png')

  await browser.close()

  const failed = results.filter(r => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  require('fs').writeFileSync('/tmp/floating-logos-results.json', JSON.stringify(results, null, 2))
  process.exit(failed.length ? 1 : 0)
})()
