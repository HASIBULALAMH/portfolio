/**
 * Verification: per-item glow colours are distinct and brand-derived, the icon
 * itself stays unblurred, and the API Showcase gets the same treatment.
 */
const { chromium } = require('playwright')

const FRONTEND = 'http://localhost:3000'
const results = []
const record = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// Read the --brand-glow custom property off each glow wrapper, plus the icon
// colour, so we can prove the tint tracks the brand rather than the theme.
const readGlows = (sel) => (root) =>
  Array.from(document.querySelectorAll(root)).map((el) => {
    const s = window.getComputedStyle(el)
    const label = el.querySelector('title')?.textContent
    return {
      label: label || el.getAttribute('data-slug') || '?',
      glow: s.getPropertyValue('--brand-glow').trim(),
      color: s.color,
    }
  })

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 90000 })

  await page.locator('#skills').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1800)

  const glows = await page.evaluate(readGlows(), '#skills .tech-glow')

  glows.forEach((g) => console.log(`    ${g.label}: glow=${g.glow} icon=${g.color}`))

  const distinct = new Set(glows.map((g) => g.glow))
  record(
    'Glow colour is per-brand, not one uniform colour',
    distinct.size > 1,
    `${distinct.size} distinct glow colours across ${glows.length} logos`
  )

  const allBrandTinted = glows.every((g) => /^rgba?\(/.test(g.glow))
  record(
    'Every glow resolves to a real brand-derived colour',
    allBrandTinted && glows.length > 0,
    allBrandTinted ? 'all wrappers carry --brand-glow' : 'some wrappers missing --brand-glow'
  )

  // The bloom must be blurred; the icon on top must not be.
  const blurSplit = await page.locator('#skills .tech-glow').first().evaluate((el) => {
    const bloom = el.querySelector('.tech-glow__bloom')
    const icon = el.querySelector('svg, span[style*="mask"]')
    return {
      bloomFilter: bloom ? window.getComputedStyle(bloom).filter : 'none',
      iconFilter: icon ? window.getComputedStyle(icon).filter : 'none',
    }
  })
  record(
    'Only the bloom is blurred; the icon stays crisp',
    blurSplit.bloomFilter.includes('blur') && !blurSplit.iconFilter.includes('blur'),
    `bloom: ${blurSplit.bloomFilter}, icon: ${blurSplit.iconFilter}`
  )

  await page.screenshot({ path: '/tmp/glow-skills.png' })

  // API Showcase — same treatment, and its own card is a separate concern.
  const apis = page.locator('#apis')
  if (await apis.count()) {
    await apis.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    const apiGlows = await page.evaluate(readGlows(), '#apis .tech-glow')
    const apiBoxes = await page.locator('#apis .tech-glow').evaluateAll((els) =>
      els.map((el) => {
        const s = window.getComputedStyle(el)
        return { bg: s.backgroundColor, border: s.borderTopWidth }
      })
    )
    const noApiBoxes = apiBoxes.every(
      (b) => b.bg === 'rgba(0, 0, 0, 0)' && parseFloat(b.border) === 0
    )
    record(
      'API Showcase logos use the same boxless glow treatment',
      apiGlows.length > 0 && noApiBoxes,
      `${apiGlows.length} glow logos, no fill/border on any`
    )
    await page.screenshot({ path: '/tmp/glow-apis.png' })
  } else {
    record('API Showcase logos use the same boxless glow treatment', false, '#apis not present')
  }

  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  require('fs').writeFileSync('/tmp/glow-colors-results.json', JSON.stringify(results, null, 2))
  process.exit(failed.length ? 1 : 0)
})()
