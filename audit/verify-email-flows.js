/**
 * E2E verification for the 5 claimed email flows across Contact Messages and
 * Meeting Requests.
 *
 *   1. admin notification  — new contact message
 *   2. client acknowledgment — new contact message
 *   3. admin notification  — new meeting request
 *   4. client acknowledgment — new meeting request
 *   5. client reply        — admin replies from the admin panel
 *
 * WHY THIS ASSERTS ON LOGS, NOT INBOXES
 * Resend has no verified domain on this account, so it refuses every recipient
 * except the account owner. Real delivery therefore cannot be the oracle for an
 * arbitrary visitor address. Instead this script tails storage/logs/laravel.log
 * and matches the dispatch lines that SubmissionNotifier and
 * MeetingRequestService write around each send:
 *
 *   "Sending <kind>."          -> a send was attempted (dispatch happened)
 *   "Failed to send <kind>."   -> the transport rejected it (delivery failed)
 *
 * The distinction matters: dispatch proves the application wiring is correct,
 * which is what this audit is scoped to. Delivery is a separate, DNS-level
 * concern and is reported but never asserted on.
 *
 * As a secondary signal the run also queries the Resend API, so when the test
 * address IS the account owner we get real end-to-end confirmation too.
 *
 * Needs backend :8000, frontend :3000, admin :3001.
 */
const { session, adminLogin, URLS, CREDS, ROOT } = require('./harness')
const fs = require('fs')
const path = require('path')

const LOG_FILE = path.join(ROOT, 'portfolio-backend', 'storage', 'logs', 'laravel.log')

// Resend accepts only the account owner until a domain is verified. Using the
// owner address as the "visitor" is what makes the client-facing mails
// observably deliverable at all — and it is not production client data.
const TEST_EMAIL = 'hasibulalam108@gmail.com'

const STAMP = Date.now()
const CONTACT_NAME = `EmailAudit Contact ${STAMP}`
const CONTACT_SUBJECT = `EmailAudit subject ${STAMP}`
const CONTACT_BODY = `Contact body ${STAMP} — automated email-flow audit.`
const MEETING_NAME = `EmailAudit Meeting ${STAMP}`
const MEETING_BODY = `Meeting purpose ${STAMP} — automated email-flow audit.`
const REPLY_TEXT = `Automated reply body ${STAMP}`

/** Byte offset of the log at start, so we only ever read lines this run caused. */
function logOffset() {
  try {
    return fs.statSync(LOG_FILE).size
  } catch {
    return 0
  }
}

function logSince(offset) {
  try {
    const fd = fs.openSync(LOG_FILE, 'r')
    const size = fs.statSync(LOG_FILE).size
    if (size <= offset) {
      fs.closeSync(fd)
      return ''
    }
    const buf = Buffer.alloc(size - offset)
    fs.readSync(fd, buf, 0, buf.length, offset)
    fs.closeSync(fd)
    return buf.toString('utf8')
  } catch {
    return ''
  }
}

/** Poll the log until `needle` shows up, so we do not race the HTTP response. */
async function waitForLog(offset, needle, { tries = 12, delayMs = 1000 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (logSince(offset).includes(needle)) return true
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

const RESEND_KEY = (() => {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'portfolio-backend', '.env'), 'utf8')
    const m = env.match(/^RESEND_API_KEY=(.*)$/m)
    return m ? m[1].trim().replace(/^"|"$/g, '') : null
  } catch {
    return null
  }
})()

async function resendSubjects() {
  if (!RESEND_KEY) return null
  try {
    const res = await fetch('https://api.resend.com/emails', {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    })
    if (!res.ok) return null
    return ((await res.json()).data || []).map((e) => ({
      subject: e.subject,
      to: Array.isArray(e.to) ? e.to.join(',') : e.to,
      last_event: e.last_event,
    }))
  } catch {
    return null
  }
}

const results = []
function record(flow, check, pass, observed) {
  results.push({ flow, check, pass, observed })
  console.log(`  ${pass ? 'PASS' : 'FAIL'} [flow ${flow}] ${check} :: ${observed}`)
}

/** Fill a form field by name within a specific form element. */
async function fillIn(page, formSel, name, value) {
  await page.fill(`${formSel} [name="${name}"]`, value)
}

session('email-flows', async ({ page, shot, log, note }) => {
  // ---------------------------------------------------------------- contact
  log('--- Contact message: submit via public frontend ---')
  const contactOffset = logOffset()

  await page.goto(`${URLS.frontend}/#contact`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('form [name="message"]', { timeout: 60000 })
  // Hydration guard: submitting before React attaches falls back to a native
  // POST and the XHR we are measuring never happens.
  await page.waitForTimeout(2500)

  const contactForm = 'form:has([name="subject"])'
  await fillIn(page, contactForm, 'name', CONTACT_NAME)
  await fillIn(page, contactForm, 'email', TEST_EMAIL)
  await fillIn(page, contactForm, 'subject', CONTACT_SUBJECT)
  await fillIn(page, contactForm, 'message', CONTACT_BODY)
  await shot('contact-filled')

  const contactPost = page.waitForResponse(
    (r) => r.url().includes('/contact-messages') && r.request().method() === 'POST',
    { timeout: 60000 }
  )
  await page.click(`${contactForm} button[type="submit"]`)
  const contactRes = await contactPost
  record('1-4', 'POST /api/contact-messages accepted', contactRes.status() === 201,
    `HTTP ${contactRes.status()}`)
  await shot('contact-submitted')

  // Flow 1 — admin notification
  const f1 = await waitForLog(contactOffset, 'Sending admin notification of a new contact message')
  record('1', 'admin notification dispatched', f1,
    f1 ? 'log line present' : 'no dispatch log line found')

  // Flow 2 — client acknowledgment
  const f2 = await waitForLog(contactOffset, 'Sending client acknowledgment of a contact message')
  record('2', 'client acknowledgment dispatched', f2,
    f2 ? 'log line present' : 'no dispatch log line found')

  const contactLog = logSince(contactOffset)
  const contactFailures = (contactLog.match(/Failed to send [^"]*contact message/g) || [])
  record('1-2', 'no transport failure on contact sends', contactFailures.length === 0,
    contactFailures.length ? contactFailures.join('; ') : 'no "Failed to send" lines')

  // ---------------------------------------------------------------- meeting
  log('--- Meeting request: submit via public frontend ---')
  const meetingOffset = logOffset()

  await page.goto(`${URLS.frontend}/#contact`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('form [name="message"]', { timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.click('button:has-text("Schedule a meeting")')
  await page.waitForSelector('[name="preferred_date"]', { timeout: 30000 })

  const meetingForm = 'form:has([name="preferred_date"])'
  await fillIn(page, meetingForm, 'name', MEETING_NAME)
  await fillIn(page, meetingForm, 'email', TEST_EMAIL)
  await fillIn(page, meetingForm, 'preferred_date', '2026-09-15')
  await page.selectOption(`${meetingForm} [name="preferred_time"]`, '14:00')
  await fillIn(page, meetingForm, 'message', MEETING_BODY)
  await shot('meeting-filled')

  const meetingPost = page.waitForResponse(
    (r) => r.url().includes('/meeting-requests') && r.request().method() === 'POST',
    { timeout: 60000 }
  )
  await page.click(`${meetingForm} button[type="submit"]`)
  const meetingRes = await meetingPost
  record('3-4', 'POST /api/meeting-requests accepted', meetingRes.status() === 201,
    `HTTP ${meetingRes.status()}`)
  await shot('meeting-submitted')

  // Flow 3 — admin notification
  const f3 = await waitForLog(meetingOffset, 'Sending admin notification of a new meeting request')
  record('3', 'admin notification dispatched', f3,
    f3 ? 'log line present' : 'no dispatch log line found')

  // Flow 4 — client acknowledgment
  const f4 = await waitForLog(meetingOffset, 'Sending client acknowledgment of a meeting request')
  record('4', 'client acknowledgment dispatched', f4,
    f4 ? 'log line present' : 'no dispatch log line found')

  const meetingLog = logSince(meetingOffset)
  const meetingFailures = (meetingLog.match(/Failed to send [^"]*meeting request/g) || [])
  record('3-4', 'no transport failure on meeting sends', meetingFailures.length === 0,
    meetingFailures.length ? meetingFailures.join('; ') : 'no "Failed to send" lines')

  // ------------------------------------------------------------ admin panel
  log('--- Admin panel: inbox + reply ---')
  await adminLogin({ page, log, URLS, CREDS })

  // Contact inbox
  await page.goto(`${URLS.admin}/admin/messages`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)
  const contactVisible = await page.locator(`text=${CONTACT_NAME}`).count()
  record('1-2', 'submitted message appears in admin inbox', contactVisible > 0,
    contactVisible > 0 ? 'row found' : 'row NOT found')
  await shot('admin-messages-list')

  // Flow 5 for contact messages — is there a reply affordance at all?
  await page.locator(`text=${CONTACT_NAME}`).first().click()
  await page.waitForTimeout(1200)
  await shot('admin-message-detail')
  const contactReplyUi = await page.locator(
    'textarea[placeholder*="reply" i], button:has-text("Send Reply")'
  ).count()
  record('5-contact', 'reply affordance exists for contact messages', contactReplyUi > 0,
    contactReplyUi > 0 ? 'reply control present' : 'NO reply control in message detail modal')
  if (contactReplyUi === 0) {
    note({
      title: 'Contact messages have no admin reply flow',
      detail:
        'The message detail modal exposes only Mark Read / Close / Delete. There is no ' +
        'reply textarea, no PUT /admin/messages/{id}/reply route, no Mailable, and the ' +
        'contact_messages table has no admin_reply column.',
    })
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  // Meeting inbox + reply (flow 5, meeting side)
  const replyOffset = logOffset()
  await page.goto(`${URLS.admin}/admin/meeting-requests`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)
  const meetingVisible = await page.locator(`text=${MEETING_NAME}`).count()
  record('3-4', 'submitted meeting appears in admin inbox', meetingVisible > 0,
    meetingVisible > 0 ? 'row found' : 'row NOT found')
  await shot('admin-meetings-list')

  await page.locator(`text=${MEETING_NAME}`).first().click()
  await page.waitForSelector('#meeting-reply', { timeout: 30000 })
  await page.fill('#meeting-reply', REPLY_TEXT)
  await shot('admin-meeting-reply-filled')

  const replyPut = page.waitForResponse(
    (r) => r.url().includes('/reply') && r.request().method() === 'PUT',
    { timeout: 60000 }
  )
  await page.click('button:has-text("Send Reply")')
  const replyRes = await replyPut
  const replyBody = await replyRes.json().catch(() => null)
  record('5', 'PUT /admin/meeting-requests/{id}/reply accepted', replyRes.status() === 200,
    `HTTP ${replyRes.status()}`)

  const f5 = await waitForLog(replyOffset, 'Sending meeting request reply')
  record('5', 'reply email dispatched', f5,
    f5 ? 'log line present' : 'no dispatch log line found')

  const replyLog = logSince(replyOffset)
  const replyFailed = replyLog.includes('Failed to email meeting request reply')
  record('5', 'no transport failure on reply send', !replyFailed,
    replyFailed ? 'Failed to email meeting request reply' : 'no failure line')

  // The backend distinguishes "sent" from "saved but not emailed" in its
  // message. Check whether the UI honours that distinction.
  await page.waitForTimeout(1500)
  await shot('admin-meeting-reply-result')
  const apiMessage = replyBody && replyBody.message
  const uiText = await page.locator('body').innerText()
  const uiClaimsSent = uiText.includes('Reply sent successfully')
  const apiSaysNotEmailed = Boolean(apiMessage && apiMessage.includes('could not be sent'))
  record('5', 'UI toast matches API outcome', !(apiSaysNotEmailed && uiClaimsSent),
    `api="${apiMessage}" uiClaimsSent=${uiClaimsSent}`)
  if (apiSaysNotEmailed && uiClaimsSent) {
    note({
      title: 'Admin panel reports "Reply sent successfully" when the email actually failed',
      detail:
        'MeetingRequestController returns HTTP 200 with message "Reply saved, but the email ' +
        'could not be sent." on transport failure. apiCall() maps any 2xx to success:true, ' +
        'and handleSendReply hardcodes the success toast instead of showing result.message.',
    })
  }

  // ------------------------------------------------------- delivery (info)
  const subjects = await resendSubjects()
  if (subjects) {
    const seen = subjects.slice(0, 25)
    log(`Resend recent sends (${seen.length}):`)
    for (const s of seen) log(`   [${s.last_event}] ${s.to} :: ${s.subject}`)
  } else {
    log('Resend API not queried (no key or request failed) — dispatch assertions stand alone.')
  }

  // ------------------------------------------------------------- summary
  const failed = results.filter((r) => !r.pass)
  console.log('\n  === EMAIL FLOW RESULTS ===')
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'} [${r.flow}] ${r.check} :: ${r.observed}`)
  }
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`)

  fs.writeFileSync(
    path.join(ROOT, 'audit', 'logs', 'email-flows-checks.json'),
    JSON.stringify({ stamp: STAMP, testEmail: TEST_EMAIL, results }, null, 2)
  )
}).then(() => process.exit(0))
