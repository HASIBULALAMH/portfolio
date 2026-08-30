/**
 * Sample the resolved --brand-glow on every glow tile in both sections, so the
 * "each glow uses its own brand colour" claim rests on measured values rather
 * than on the brand hex table alone.
 */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 })

  for (const section of ['#skills', '#apis']) {
    await page.locator(section).scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)

    const rows = await page.locator(`${section} .tech-glow`).evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el)
        const svg = el.querySelector('svg')
        const masked = el.querySelector('span[style*="mask"]')
        return {
          label:
            svg?.getAttribute('aria-label') ||
            masked?.getAttribute('aria-label') ||
            el.closest('.group')?.innerText.split('\n')[0] ||
            '(unlabelled)',
          glow: s.getPropertyValue('--brand-glow').trim(),
          hover: s.getPropertyValue('--brand-glow-hover').trim(),
        }
      })
    )

    console.log(`\n=== ${section} ===`)
    for (const r of rows) console.log(`  ${r.label.padEnd(28)} ${r.glow.padEnd(26)} hover ${r.hover}`)

    const distinct = new Set(rows.map((r) => r.glow))
    console.log(`  ${rows.length} tiles, ${distinct.size} distinct glow colours`)
  }

  await browser.close()
})()
