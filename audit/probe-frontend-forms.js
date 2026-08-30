/** Verify frontend forms: no pre-hydration query-string leak, and still submit fine. */
const { chromium } = require('playwright')

const STAMP = Date.now().toString().slice(-6)

;(async () => {
  const browser = await chromium.launch({ headless: true })

  // --- Part 1: pre-hydration leak check (JS blocked) ---------------------
  {
    const page = await browser.newPage()
    await page.route('**/*.js', (r) => r.abort())
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.waitForTimeout(2000)

    const form = await page.$('form:has(textarea[name="message"])')
    if (!form) {
      console.log('PART1: contact form not server-rendered, skipping')
    } else {
      await page.fill('form input[name="name"]', 'Leak Probe')
      await page.fill('form input[name="email"]', 'leak@example.com')
      await page.fill('form textarea[name="message"]', 'secret-body-text')
      await page.click('form button[type="submit"]').catch(() => {})
      await page.waitForTimeout(2000)
      const url = page.url()
      console.log('PART1 url after pre-hydration submit:', url)
      console.log(
        /name=|email=|message=/.test(url)
          ? '*** PART1 LEAK: form data in query string ***'
          : 'PART1 OK: no form data in URL'
      )
    }
    await page.close()
  }

  // --- Part 2: normal contact submit still works ------------------------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const failed = []
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#contact', { timeout: 60000 })
    await page.waitForTimeout(3000)

    const scope = '#contact form:has(textarea#message)'
    await page.fill(`${scope} input[name="name"]`, `Reverify ${STAMP}`)
    await page.fill(`${scope} input[name="email"]`, `reverify${STAMP}@example.com`)
    const s = await page.$(`${scope} input[name="subject"]`)
    if (s) await s.fill(`Reverify subject ${STAMP}`)
    await page.fill(`${scope} textarea[name="message"]`, `Post-fix re-verification ${STAMP}.`)
    await page.click(`${scope} button[type="submit"]`)
    await page.waitForTimeout(4500)

    const txt = await page.textContent('#contact')
    console.log('\nPART2 url (must have no query):', page.url())
    console.log('PART2 success text:', /sent|thank|received/i.test(txt) ? 'YES' : 'NO')
    if (!/sent|thank|received/i.test(txt)) {
      console.log('PART2 section text:', txt.replace(/\s+/g, ' ').slice(0, 300))
    }
    console.log('PART2 failed requests:', failed.length ? failed.join(', ') : 'none')

    // --- Part 3: meeting form renders and submits ----------------------
    const toggle = await page.$('#contact button:has-text("Schedule"), #contact button:has-text("Book"), #contact button:has-text("Meeting")')
    if (toggle) {
      await toggle.click()
      await page.waitForTimeout(1500)
      const mform = await page.$('#contact form:has(#meeting-message)')
      console.log('\nPART3 meeting form shown:', Boolean(mform))
      if (mform) {
        await page.fill('#contact form input[name="name"]', `Meeting ${STAMP}`)
        await page.fill('#contact form input[name="email"]', `meeting${STAMP}@example.com`)
        await page.fill('#meeting-message', `Audit meeting request ${STAMP}.`)
        await page.click('#contact form button[type="submit"]')
        await page.waitForTimeout(4500)
        const t2 = await page.textContent('#contact')
        console.log('PART3 success text:', /sent|thank|received/i.test(t2) ? 'YES' : 'NO')
        if (!/sent|thank|received/i.test(t2)) console.log('PART3 text:', t2.replace(/\s+/g, ' ').slice(0, 300))
      }
    } else {
      console.log('\nPART3: no meeting-form toggle found')
    }
    console.log('PART3 failed requests total:', failed.length ? failed.join(', ') : 'none')
    await page.close()
  }

  await browser.close()
  console.log(`\nSTAMP=${STAMP}`)
})()
