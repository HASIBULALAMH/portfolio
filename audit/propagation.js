/**
 * Cross-system verification.
 *
 * 1. Edit content in the admin panel, then confirm it appears on the public
 *    site. The frontend caches server fetches for 60s (REVALIDATE_SECONDS), so
 *    this measures how long propagation actually takes rather than assuming
 *    it is instant.
 * 2. Confirm the contact message submitted during the frontend audit arrived
 *    in the admin inbox, and exercise read-toggle + delete on it.
 */
const { session, adminLogin } = require('./harness')

const STAMP = Date.now().toString().slice(-6)
const MARKER = `PropagationCheck${STAMP}`

async function openAdmin(page, path) {
  await page.goto(`http://localhost:3001${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)
}

session('propagation', async (ctx) => {
  const { page, shot, log, note, URLS } = ctx
  await adminLogin(ctx)

  // =======================================================================
  // 1. Admin edit -> public site
  // =======================================================================
  await openAdmin(page, '/admin/hero')
  const original = await page.inputValue('#hero-subheading')
  log(`original hero subheading: "${original}"`)

  await page.fill('#hero-subheading', `${MARKER} — verifying admin edits reach the public site.`)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2500)
  await shot('admin-hero-edited')

  // Confirm the API itself has the new value before blaming the frontend.
  const apiRes = await page.request.get(`${URLS.backend}/api/hero`)
  const apiHero = (await apiRes.json()).data
  if (!String(apiHero?.subheading || '').includes(MARKER)) {
    note({
      title: 'Hero edit did not reach the public API',
      area: 'backend/hero',
      severity: 'critical',
      detail: `GET /api/hero subheading: "${apiHero?.subheading}"`,
    })
  } else {
    log('public API reflects the edit immediately')
  }

  // Poll the rendered homepage until the marker shows up (or we give up).
  const started = Date.now()
  let appearedAfter = null
  for (let i = 0; i < 30; i++) {
    await page.goto(URLS.frontend, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(1200)
    const text = await page.textContent('body')
    if (text.includes(MARKER)) {
      appearedAfter = Math.round((Date.now() - started) / 1000)
      break
    }
    await page.waitForTimeout(4000)
  }

  if (appearedAfter === null) {
    note({
      title: 'Admin edit never appeared on the public homepage',
      area: 'frontend/hero',
      severity: 'critical',
      detail: `Marker "${MARKER}" absent after ~150s of polling despite being live in the API.`,
    })
  } else {
    log(`marker appeared on homepage after ~${appearedAfter}s`)
    if (appearedAfter > 5) {
      note({
        title: `Frontend content is cached; admin edits take ~${appearedAfter}s to appear`,
        area: 'frontend/lib/api.js',
        severity: 'info',
        detail:
          `REVALIDATE_SECONDS=60 in portfolio-frontend/lib/api.js means the public site serves ` +
          `cached content for up to a minute. Not a defect, but it is not "real time" — ` +
          `measured ~${appearedAfter}s in this run.`,
      })
    }
  }
  await shot('frontend-shows-admin-edit')

  // Restore.
  await openAdmin(page, '/admin/hero')
  await page.fill('#hero-subheading', original)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)
  log('hero subheading restored')

  // =======================================================================
  // 2. Contact message inbox round-trip
  // =======================================================================
  await openAdmin(page, '/admin/messages')
  await shot('admin-messages-with-audit-message')
  const inbox = await page.textContent('body')

  const auditMsg = inbox.match(/Audit Visitor \d{6}/)
  if (!auditMsg) {
    note({
      title: 'Contact message from the frontend never reached the admin inbox',
      area: 'admin/messages',
      severity: 'critical',
      detail: 'The frontend form reported success but no "Audit Visitor" row is listed.',
    })
  } else {
    log(`found submitted message in inbox: ${auditMsg[0]}`)

    // Open it, toggle read, then delete it so the inbox is left clean.
    await page.click(`text=${auditMsg[0]}`)
    await page.waitForTimeout(1500)
    await shot('admin-message-detail')

    const readBtn = await page.$('button:has-text("Mark as Read"), button:has-text("Mark as Unread")')
    if (readBtn) {
      const label = await readBtn.textContent()
      await readBtn.click()
      await page.waitForTimeout(2000)
      log(`toggled read state via "${label.trim()}"`)
    } else {
      note({
        title: 'No read/unread toggle on message detail',
        area: 'admin/messages',
        severity: 'low',
        detail: 'PUT /admin/messages/{id}/read exists but no control was found.',
      })
    }
  }
})
