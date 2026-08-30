/**
 * Throwaway E2E verification for the mail flows and the footer logo.
 *
 * Covers all four issues: admin notification, admin reply delivery, footer
 * logo + fallback, and the new client acknowledgment.
 *
 * Every mail assertion is cross-checked against the Resend API rather than the
 * UI's success toast — a UI that reported success while nothing shipped was the
 * original bug.
 *
 * Needs backend :8000, frontend :3000, admin :3001.
 */
const { session, adminLogin, URLS, CREDS, ROOT } = require('./harness')
const fs = require('fs')
const path = require('path')

// Resend has no verified domain, so the account owner is the only recipient it
// accepts. Using it as the visitor address is what makes the client-facing
// emails (acknowledgment + reply) observably deliverable at all.
const TEST_EMAIL = 'hasibulalam108@gmail.com'
const STAMP = Date.now()
const CONTACT_NAME = `E2E Contact ${STAMP}`
const CONTACT_SUBJECT = `E2E subject ${STAMP}`
const MEETING_NAME = `E2E Meeting ${STAMP}`
const REPLY_TEXT = `Automated reply body ${STAMP}`
const NOTE_TEXT = `INTERNAL-NOTE-${STAMP}-must-not-be-emailed`

const RESEND_KEY = (() => {
  const env = fs.readFileSync(path.join(ROOT, 'portfolio-backend', '.env'), 'utf8')
  const m = env.match(/^RESEND_API_KEY=(.*)$/m)
  return m ? m[1].trim().replace(/^"|"$/g, '') : null
})()

async function resendList() {
  const res = await fetch('https://api.resend.com/emails', {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  })
  if (!res.ok) throw new Error(`Resend list failed: ${res.status}`)
  return (await res.json()).data || []
}

/** Poll Resend until an email matching `pred` appears. */
async function waitForResend(pred, { tries = 14, delayMs = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const hit = (await resendList()).find(pred)
    if (hit) return hit
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return null
}

async function resendDetail(id) {
  const res = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  })
  return res.ok ? await res.json() : null
}

const results = []
function record(check, pass, observed) {
  results.push({ check, pass, observed })
  console.log(`\n${pass ? '  ✅ PASS' : '  ❌ FAIL'} — ${check}`)
  console.log(`     ${String(observed).replace(/\n/g, '\n     ')}`)
}

async function openContact(page, log) {
  await page.goto(`${URLS.frontend}/#contact`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#name', { timeout: 120000 })
  // A pre-hydration click falls back to native form submission; wait so the
  // React fetch path is what actually gets exercised.
  await page.waitForTimeout(4000)
  log('contact form ready')
}

session('verify-mail-all', async ({ page, shot, log }) => {
  log(`stamp=${STAMP} test email=${TEST_EMAIL}`)

  // ══ Check 1: contact form → admin notification + client acknowledgment ══
  await openContact(page, log)
  await shot('contact-form-empty')

  await page.fill('#name', CONTACT_NAME)
  await page.fill('#email', TEST_EMAIL)
  await page.fill('#subject', CONTACT_SUBJECT)
  await page.fill('#message', `Automated contact body ${STAMP}`)
  await shot('contact-form-filled')

  const contactPost = page.waitForResponse(
    (r) => r.url().includes('/contact-messages') && r.request().method() === 'POST',
    { timeout: 60000 },
  )
  await page.click('form button[type="submit"]')
  const contactRes = await contactPost
  log(`POST /contact-messages -> ${contactRes.status()}`)
  await page.waitForTimeout(1500)
  await shot('contact-submitted')

  const contactAdminMail = await waitForResend(
    (e) => (e.subject || '').includes(CONTACT_NAME) && (e.to || []).includes(TEST_EMAIL),
  )
  const contactClientMail = await waitForResend(
    (e) => e.subject === 'We received your message'
      && (e.to || []).includes(TEST_EMAIL)
      && new Date(e.created_at).getTime() > STAMP,
  )

  // Confirm the acknowledgment actually names what they submitted.
  let ackBodyInfo = 'no body fetched'
  if (contactClientMail) {
    const d = await resendDetail(contactClientMail.id)
    const html = `${d?.html || ''}${d?.text || ''}`
    ackBodyInfo = `body names the submitted subject "${CONTACT_SUBJECT}": ${html.includes(CONTACT_SUBJECT)}; `
      + `greets by name: ${html.includes(CONTACT_NAME)}`
  }

  record(
    '1. Contact submission sends BOTH an admin notification and a client acknowledgment',
    contactRes.status() === 201 && !!contactAdminMail && !!contactClientMail,
    `POST /contact-messages -> ${contactRes.status()}\n`
      + `  ADMIN  : ${contactAdminMail
        ? `id=${contactAdminMail.id}, to=${JSON.stringify(contactAdminMail.to)}, subject="${contactAdminMail.subject}", last_event=${contactAdminMail.last_event}`
        : 'NOT FOUND in Resend'}\n`
      + `  CLIENT : ${contactClientMail
        ? `id=${contactClientMail.id}, to=${JSON.stringify(contactClientMail.to)}, subject="${contactClientMail.subject}", last_event=${contactClientMail.last_event}`
        : 'NOT FOUND in Resend'}\n`
      + `  ${ackBodyInfo}`,
  )

  // ══ Check 2: meeting request → admin notification + client acknowledgment ══
  await openContact(page, log)
  await page.click('button:has-text("Schedule a meeting")')
  await page.waitForTimeout(1200)
  await page.waitForSelector('#preferred_date', { timeout: 30000 })

  await page.fill('#name', MEETING_NAME)
  await page.fill('#email', TEST_EMAIL)
  await page.fill('#preferred_date', '2026-09-15')
  await page.selectOption('#preferred_time', { index: 1 }).catch(async () => {
    await page.fill('#preferred_time', '10:00')
  })
  await page.fill('#meeting-message', `Automated meeting body ${STAMP}`)
  await shot('meeting-form-filled')

  const meetingPost = page.waitForResponse(
    (r) => r.url().includes('/meeting-requests') && r.request().method() === 'POST',
    { timeout: 60000 },
  )
  await page.click('form button[type="submit"]')
  const meetingRes = await meetingPost
  log(`POST /meeting-requests -> ${meetingRes.status()}`)
  await page.waitForTimeout(1500)
  await shot('meeting-submitted')

  const meetingAdminMail = await waitForResend(
    (e) => (e.subject || '').includes(MEETING_NAME) && (e.to || []).includes(TEST_EMAIL),
  )
  const meetingClientMail = await waitForResend(
    (e) => e.subject === 'We received your meeting request'
      && (e.to || []).includes(TEST_EMAIL)
      && new Date(e.created_at).getTime() > STAMP,
  )

  let meetingAckInfo = 'no body fetched'
  if (meetingClientMail) {
    const d = await resendDetail(meetingClientMail.id)
    const html = `${d?.html || ''}${d?.text || ''}`
    meetingAckInfo = `body states the requested slot: ${html.includes('Sep 15, 2026')}; `
      + `greets by name: ${html.includes(MEETING_NAME)}`
  }

  record(
    '2. Meeting request sends BOTH an admin notification and a client acknowledgment',
    meetingRes.status() === 201 && !!meetingAdminMail && !!meetingClientMail,
    `POST /meeting-requests -> ${meetingRes.status()}\n`
      + `  ADMIN  : ${meetingAdminMail
        ? `id=${meetingAdminMail.id}, to=${JSON.stringify(meetingAdminMail.to)}, subject="${meetingAdminMail.subject}", last_event=${meetingAdminMail.last_event}`
        : 'NOT FOUND in Resend'}\n`
      + `  CLIENT : ${meetingClientMail
        ? `id=${meetingClientMail.id}, to=${JSON.stringify(meetingClientMail.to)}, subject="${meetingClientMail.subject}", last_event=${meetingClientMail.last_event}`
        : 'NOT FOUND in Resend'}\n`
      + `  ${meetingAckInfo}`,
  )

  // ══ Check 5a: footer renders the uploaded logo ═════════════════════════
  await page.goto(URLS.frontend, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('footer', { timeout: 120000 })
  await page.waitForTimeout(2500)
  const footerEl = await page.$('footer')
  if (footerEl) await footerEl.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)

  const footerLogo = await page.evaluate(() => {
    const brand = document.querySelector('footer a[href="#home"]')
    if (!brand) return { found: false }
    const img = brand.querySelector('img')
    return {
      found: true,
      outerHTML: brand.outerHTML.slice(0, 400),
      hasImg: !!img,
      src: img?.getAttribute('src') || null,
      alt: img?.getAttribute('alt') || null,
      naturalWidth: img?.naturalWidth ?? null,
      text: brand.innerText.trim(),
    }
  })
  await shot('footer-with-logo', { fullPage: false })
  log(`footer logo: ${JSON.stringify(footerLogo)}`)

  record(
    '5a. Footer brand renders the uploaded logo as an image, not hardcoded text',
    footerLogo.hasImg === true && !!footerLogo.src && footerLogo.naturalWidth > 0,
    `hasImg=${footerLogo.hasImg}, src=${footerLogo.src}, alt="${footerLogo.alt}", `
      + `naturalWidth=${footerLogo.naturalWidth} (>0 means it actually loaded), `
      + `visible text="${footerLogo.text}"\nDOM: ${footerLogo.outerHTML}`,
  )

  // ══ Checks 3 & 4: admin replies through the real UI ════════════════════
  await adminLogin({ page, log, URLS, CREDS })
  await shot('admin-dashboard')

  await page.goto(`${URLS.admin}/admin/messages`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await shot('admin-messages')

  const messagesInfo = await page.evaluate((needle) => ({
    hasTestMessage: document.body.innerText.includes(needle),
    replyControls: [...document.querySelectorAll('button, a')]
      .map((b) => (b.innerText || '').trim())
      .filter((t) => /reply|respond/i.test(t)),
  }), CONTACT_NAME)
  log(`messages inbox: ${JSON.stringify(messagesInfo)}`)

  record(
    '3. Admin Messages inbox shows the test contact message / reply capability',
    messagesInfo.hasTestMessage,
    `Test message "${CONTACT_NAME}" visible in inbox: ${messagesInfo.hasTestMessage}. `
      + `Reply-like controls found: ${JSON.stringify(messagesInfo.replyControls)}. `
      + `(Backend exposes no reply route for contact messages — only read-toggle `
      + `and delete — so there is no reply flow to trigger here.)`,
  )

  await page.goto(`${URLS.admin}/admin/meeting-requests`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  await shot('admin-meeting-requests')

  let replyOutcome = 'reply UI not reachable'
  let replyApiStatus = null
  let noteApiStatus = null

  try {
    const row = page.locator('div[role="button"]', { hasText: MEETING_NAME }).first()
    await row.scrollIntoViewIfNeeded()
    await row.click({ timeout: 20000 })
    await page.waitForSelector('#meeting-reply', { timeout: 30000 })
    await page.waitForTimeout(1200)
    await shot('meeting-row-open')

    // Note saved first, so it exists on the record when the reply renders —
    // that is what makes the leak check meaningful.
    await page.fill('#meeting-admin-note', NOTE_TEXT)
    const noteWait = page.waitForResponse(
      (r) => /\/meeting-requests\/\d+\/note/.test(r.url()) && r.request().method() === 'PUT',
      { timeout: 60000 },
    )
    await page.locator('button', { hasText: /^Save note$/ }).first().click()
    noteApiStatus = (await noteWait).status()
    log(`PUT note -> ${noteApiStatus}`)
    await page.waitForTimeout(1200)
    await shot('note-saved')

    await page.fill('#meeting-reply', REPLY_TEXT)
    const replyWait = page.waitForResponse(
      (r) => /\/meeting-requests\/\d+\/reply/.test(r.url()) && r.request().method() === 'PUT',
      { timeout: 60000 },
    )
    await page.locator('button', { hasText: /Send Reply/i }).first().click()
    const replyRes = await replyWait
    replyApiStatus = replyRes.status()
    const body = await replyRes.text().catch(() => '')
    replyOutcome = `PUT reply -> ${replyApiStatus}; body=${body.slice(0, 240)}`
    log(replyOutcome)
    await page.waitForTimeout(2500)
    await shot('reply-sent')
  } catch (e) {
    replyOutcome = `reply UI interaction failed: ${String(e).slice(0, 250)}`
    log(replyOutcome)
  }

  // Exact subject match — the acknowledgment emails also went to TEST_EMAIL.
  const replyMail = await waitForResend(
    (e) => e.subject === 'Re: your meeting request'
      && (e.to || []).includes(TEST_EMAIL)
      && new Date(e.created_at).getTime() > STAMP,
  )

  let replyDetailInfo = 'no detail fetched'
  let noteLeaked = null
  if (replyMail) {
    const d = await resendDetail(replyMail.id)
    if (d) {
      const html = `${d.html || ''}${d.text || ''}`
      noteLeaked = html.includes(NOTE_TEXT)
      replyDetailInfo = `contains reply text: ${html.includes(REPLY_TEXT)}; contains internal note: ${noteLeaked}`
    }
  }

  record(
    '4. Admin reply to the meeting request is delivered to the client address',
    !!replyMail && replyApiStatus === 200,
    replyMail
      ? `${replyOutcome}\nResend id=${replyMail.id}, to=${JSON.stringify(replyMail.to)}, `
        + `subject="${replyMail.subject}", last_event=${replyMail.last_event}\n${replyDetailInfo}`
      : `${replyOutcome}\nNo reply email observed in Resend for ${TEST_EMAIL}.`,
  )

  record(
    '4b. Internal note does NOT appear in the reply email',
    noteLeaked === false,
    noteLeaked === null
      ? `Could not verify — no reply email body available (note API status=${noteApiStatus}).`
      : `Note API status=${noteApiStatus}. Reply email body contains the note marker `
        + `"${NOTE_TEXT}": ${noteLeaked} (false is correct).`,
  )

  fs.writeFileSync('/tmp/mail-verify.json', JSON.stringify(results, null, 2))
  console.log('\n\n  ══════ SUMMARY (checks 1-4) ══════')
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.check}`)
  const failed = results.filter((r) => !r.pass).length
  console.log(`\n  ${results.length - failed}/${results.length} passed`)
  console.log(`\n  Cleanup needles: ${CONTACT_NAME} / ${MEETING_NAME}\n`)
})
