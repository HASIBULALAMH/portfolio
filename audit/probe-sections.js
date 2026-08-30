/** Verify timeline + testimonial content actually renders, and case-study now that it is compiled. */
const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#contact', { timeout: 60000 })
  await page.waitForTimeout(3000)

  const info = await page.evaluate(() => {
    const journey = document.querySelector('#journey')
    const sections = [...document.querySelectorAll('section')].map((s) => ({
      id: s.id || '(no id)',
      h: Math.round(s.getBoundingClientRect().height),
      head: (s.querySelector('h1,h2,h3')?.innerText || '').slice(0, 45),
    }))
    return {
      journeyHeight: journey ? Math.round(journey.getBoundingClientRect().height) : null,
      journeyText: journey ? journey.innerText.replace(/\s+/g, ' ').slice(0, 220) : null,
      sections,
      hasTestimonialText: /testimonial|Auditor|client say/i.test(document.body.innerText),
    }
  })
  console.log('journey height:', info.journeyHeight)
  console.log('journey text:', info.journeyText)
  console.log('testimonial text present:', info.hasTestimonialText)
  console.log('--- sections ---')
  for (const s of info.sections) console.log(`  id=${s.id.padEnd(14)} h=${String(s.h).padStart(5)}  "${s.head}"`)

  // Case-study, now warm
  const r = await page.goto('http://localhost:3000/case-study/portfolio-cms', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  })
  await page.waitForTimeout(2500)
  const t = await page.textContent('body')
  console.log('\ncase-study status:', r.status())
  console.log('case-study text:', t.replace(/\s+/g, ' ').slice(0, 300))

  await browser.close()
})()
