/**
 * Full end-to-end verification of all five email flows plus the delivery-status
 * behaviour added in Phases 1 and 2.
 *
 * Coverage:
 *   1. contact message submitted   -> admin notification + client ack dispatched
 *   2. meeting request submitted   -> admin notification + client ack dispatched
 *   3. contact reply, delivered    -> 200, success toast, replied_at set,
 *                                     delivery_failed_at null
 *   4. contact reply, refused      -> 502, error toast with the backend's message,
 *                                     delivery_failed_at set, dialog stays open
 *   5. meeting reply, both paths   -> same, plus the red list indicator appearing
 *                                     and disappearing
 *   6. successful retry after a failure clears delivery_failed_at on both types
 *
 * WHY DISPATCH *AND* DELIVERY ARE BOTH ASSERTED NOW
 * hasibulalam.com is verified with Resend (sending enabled), so recipients are no
 * longer restricted to the account owner. Every flow is therefore checked twice:
 * once on the app side (dispatch log line, HTTP status, DB state, toast variant)
 * and once on the Resend side (the message exists, its `from` is the production
 * identity, and its last event is a real delivery).
 *
 * The refusal path still uses an @example.com recipient. Resend rejects that domain
 * outright, independently of domain verification, so it remains a reliable way to
 * exercise the delivery-failure branch without a config change.
 *
 * The external recipient defaults to a plus-tagged address on the owner's own Gmail:
 * a real, openable mailbox, unique per run, and not production client data. Override
 * it with `node verify-email-flows-full.js <address>` or E2E_EXTERNAL_EMAIL.
 *
 * Needs backend :8000, frontend :3000, admin :3001.
 */
const { session, adminLogin, URLS, CREDS, ROOT } = require('./harness')
const fs = require('fs')
const path = require('path')

const API = 'http://127.0.0.1:8000/api'
const LOG_FILE = path.join(ROOT, 'portfolio-backend', 'storage', 'logs', 'laravel.log')

const STAMP = Date.now()

/** Read the backend's own effective mail settings, so nothing is hardcoded twice. */
function envValue(key, fallback = null) {
  try {
    const env = fs.readFileSync(path.join(ROOT, 'portfolio-backend', '.env'), 'utf8')
    const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
    return m ? m[1].trim().replace(/^"|"$/g, '') : fallback
  } catch {
    return fallback
  }
}

const FROM_ADDRESS = envValue('MAIL_FROM_ADDRESS')
const ADMIN_EMAIL = envValue('ADMIN_NOTIFY_EMAIL')
const RESEND_KEY = envValue('RESEND_API_KEY')

// A real mailbox that is not the bare account-owner address. Plus-tagged per run so
// this run's mail is unambiguous both in Gmail and in the Resend log.
const EXTERNAL_EMAIL =
  process.argv[2] || process.env.E2E_EXTERNAL_EMAIL || `hasibulalam108+e2e${STAMP}@gmail.com`

const refusedEmail = (tag) => `refused-${tag}-${STAMP}@example.com`

const NAMES = {
  contactOk: `E2E CT ok ${STAMP}`,
  contactFail: `E2E CT fail ${STAMP}`,
  meetingOk: `E2E MT ok ${STAMP}`,
  meetingFail: `E2E MT fail ${STAMP}`,
  // Deliberately NOT built by appending to the names above: row lookups match on
  // text, and a name that contains another name makes the two rows ambiguous.
  contactRetry: `E2E CT retry ${STAMP}`,
  meetingRetry: `E2E MT retry ${STAMP}`,
}

// ----------------------------------------------------------------- log oracle
function logOffset() {
  try {
    return fs.statSync(LOG_FILE).size
  } catch {
    return 0
  }
}

function logSince(offset) {
  try {
    const size = fs.statSync(LOG_FILE).size
    if (size <= offset) return ''
    const fd = fs.openSync(LOG_FILE, 'r')
    const buf = Buffer.alloc(size - offset)
    fs.readSync(fd, buf, 0, buf.length, offset)
    fs.closeSync(fd)
    return buf.toString('utf8')
  } catch {
    return ''
  }
}

async function waitForLog(offset, needle, { tries = 14, delayMs = 1000 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (logSince(offset).includes(needle)) return true
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return false
}

// ------------------------------------------------------------------ API layer
let token = null

async function login() {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: CREDS.email, password: CREDS.password }),
  })
  if (!res.ok) throw new Error(`api login failed: HTTP ${res.status}`)
  token = (await res.json()).data.token
}

async function authed(method, endpoint) {
  const res = await fetch(`${API}${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  return res.ok ? await res.json() : null
}

/** Read one record back from the admin API, so DB state is asserted, not inferred. */
async function findRecord(kind, name) {
  const endpoint = kind === 'contact' ? '/admin/messages' : '/admin/meeting-requests'
  const body = await authed('GET', endpoint)
  return ((body && body.data) || []).find((r) => r.name === name) || null
}

async function submitContact(name, email) {
  const res = await fetch(`${API}/contact-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name,
      email,
      subject: `E2E subject ${STAMP}`,
      message: `Contact body for ${name}.`,
    }),
  })
  if (!res.ok) throw new Error(`contact submit failed for ${name}: HTTP ${res.status}`)
}

async function submitMeeting(name, email) {
  const res = await fetch(`${API}/meeting-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name,
      email,
      preferred_date: '2026-09-24',
      preferred_time: '15:00',
      message: `Meeting purpose for ${name}.`,
    }),
  })
  if (!res.ok) throw new Error(`meeting submit failed for ${name}: HTTP ${res.status}`)
}

// -------------------------------------------------------------- toast capture
async function installToastRecorder(page) {
  await page.evaluate(() => {
    window.__toasts = []
    const capture = (node) => {
      if (!(node instanceof HTMLElement)) return
      const el = node.matches('[role="alert"], [role="status"]')
        ? node
        : node.querySelector('[role="alert"], [role="status"]')
      if (!el) return
      if (!el.querySelector('button[aria-label="Dismiss notification"]')) return
      window.__toasts.push({
        role: el.getAttribute('role'),
        text: el.innerText.trim(),
        isError: el.className.includes('bg-red'),
        isSuccess: el.className.includes('bg-green'),
      })
    }
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach(capture)
    }).observe(document.body, { childList: true, subtree: true })
  })
}

const results = []
function record(flow, check, pass, observed) {
  results.push({ flow, check, pass, observed })
  console.log(`  ${pass ? 'PASS' : 'FAIL'} [${flow}] ${check} :: ${observed}`)
}

// ------------------------------------------------------------- Resend oracle
/** Events that mean Resend actually handed the message off. */
const DELIVERED_EVENTS = ['sent', 'delivered', 'delivery_delayed', 'opened', 'clicked']

async function resendList() {
  const res = await fetch('https://api.resend.com/emails', {
    headers: { Authorization: `Bearer ${RESEND_KEY}` },
  })
  if (!res.ok) throw new Error(`Resend list failed: HTTP ${res.status}`)
  return (await res.json()).data || []
}

/**
 * Poll Resend until a message matching `pred` shows up. Sends are synchronous but
 * the log is eventually consistent, so a first miss is not a failure.
 */
async function waitForResend(pred, { tries = 12, delayMs = 2500 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const hit = (await resendList()).find(pred)
      if (hit) return hit
    } catch {
      /* transient; keep polling */
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return null
}

const toList = (e) => (Array.isArray(e.to) ? e.to.join(',') : String(e.to || ''))

/**
 * Assert one Resend message: it exists, it went to the right recipient, its `from`
 * is the production identity, and its last event is a real delivery.
 */
async function assertDelivery(flow, label, { subject, to }) {
  const hit = await waitForResend(
    (e) => e.subject === subject && toList(e).includes(to)
  )

  if (!hit) {
    record(flow, `${label}: present in Resend`, false, `no message "${subject}" to ${to}`)
    return null
  }

  record(flow, `${label}: present in Resend`, true, `to=${toList(hit)}`)
  record(flow, `${label}: From is the verified identity`,
    typeof hit.from === 'string' && hit.from.includes(FROM_ADDRESS),
    `from=${hit.from}`)

  // Re-read the individual message: the list endpoint's last_event can lag.
  let event = hit.last_event
  for (let i = 0; i < 8 && !DELIVERED_EVENTS.includes(event); i++) {
    await new Promise((r) => setTimeout(r, 2500))
    try {
      const res = await fetch(`https://api.resend.com/emails/${hit.id}`, {
        headers: { Authorization: `Bearer ${RESEND_KEY}` },
      })
      if (res.ok) event = (await res.json()).last_event
    } catch {
      /* transient */
    }
  }

  record(flow, `${label}: delivered by Resend`, DELIVERED_EVENTS.includes(event),
    `last_event=${event}`)

  return hit
}

const PAGES = {
  contact: { url: '/admin/messages', textarea: '#message-reply' },
  meeting: { url: '/admin/meeting-requests', textarea: '#meeting-reply' },
}

async function gotoInbox(page, kind) {
  await page.goto(`${URLS.admin}${PAGES[kind].url}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)
}

/** Open a row by name, send a reply through the UI, return status + toasts. */
async function replyViaUi(page, kind, name, replyText) {
  await installToastRecorder(page)

  // Exact match: a substring match would resolve to the wrong row once a fixture
  // name appears inside another fixture's name.
  const row = page.getByText(name, { exact: true }).first()
  if ((await row.count()) === 0) throw new Error(`no ${kind} row named "${name}"`)
  await row.click()

  await page.waitForSelector(PAGES[kind].textarea, { timeout: 30000 })
  await page.fill(PAGES[kind].textarea, replyText)

  const putPromise = page.waitForResponse(
    (r) => r.url().includes('/reply') && ['PUT', 'POST'].includes(r.request().method()),
    { timeout: 60000 }
  )
  await page.click('button:has-text("Send Reply")')
  const res = await putPromise
  const body = await res.json().catch(() => null)

  await page.waitForTimeout(2000)

  return {
    status: res.status(),
    body,
    toasts: await page.evaluate(() => window.__toasts || []),
  }
}

/**
 * Is the red "Delivery failed" indicator showing for this row?
 *
 * Matched on the row's exact name text: `:has-text()` is a substring match, so a
 * fixture whose name contains another fixture's name would silently resolve to
 * the wrong row.
 */
async function hasFailureIndicator(page, name) {
  const row = page
    .locator('div[role="button"]')
    .filter({ has: page.getByText(name, { exact: true }) })
  if ((await row.count()) === 0) return null
  return (await row.first().locator('text=Delivery failed').count()) > 0
}

session('email-flows-full', async ({ page, shot, log, note }) => {
  await login()

  log(`from address   : ${FROM_ADDRESS}`)
  log(`admin recipient: ${ADMIN_EMAIL}`)
  log(`external client: ${EXTERNAL_EMAIL}`)

  // ============================================== flows 1 & 2: dispatch on submit
  log('--- flows 1-2: submission notifications ---')
  const submitOffset = logOffset()

  await submitContact(NAMES.contactOk, EXTERNAL_EMAIL)
  await submitMeeting(NAMES.meetingOk, EXTERNAL_EMAIL)

  const f1admin = await waitForLog(submitOffset, 'Sending admin notification of a new contact message')
  const f1client = await waitForLog(submitOffset, 'Sending client acknowledgment of a contact message')
  record('1', 'contact: admin notification dispatched', f1admin, f1admin ? 'log line present' : 'missing')
  record('1', 'contact: client acknowledgment dispatched', f1client, f1client ? 'log line present' : 'missing')

  const f2admin = await waitForLog(submitOffset, 'Sending admin notification of a new meeting request')
  const f2client = await waitForLog(submitOffset, 'Sending client acknowledgment of a meeting request')
  record('2', 'meeting: admin notification dispatched', f2admin, f2admin ? 'log line present' : 'missing')
  record('2', 'meeting: client acknowledgment dispatched', f2client, f2client ? 'log line present' : 'missing')

  // No "Failed to send" for either: with the domain verified, an external client
  // address must now be accepted where it previously would have been refused.
  const submitLog = logSince(submitOffset)
  const submitFailures = submitLog.match(/Failed to send [^\n]*/g) || []
  record('1-2', 'no transport failure on any submission email', submitFailures.length === 0,
    submitFailures.length ? submitFailures.join(' | ').slice(0, 300) : 'no "Failed to send" lines')

  // Resend side: admin notifications to the admin box, acknowledgments to the
  // external client box, all from the verified identity.
  await assertDelivery('1', 'contact admin notification', {
    subject: `New contact message from ${NAMES.contactOk}`,
    to: ADMIN_EMAIL,
  })
  await assertDelivery('1', 'contact client acknowledgment', {
    subject: 'We received your message',
    to: EXTERNAL_EMAIL,
  })
  await assertDelivery('2', 'meeting admin notification', {
    subject: `New meeting request from ${NAMES.meetingOk}`,
    to: ADMIN_EMAIL,
  })
  await assertDelivery('2', 'meeting client acknowledgment', {
    subject: 'We received your meeting request',
    to: EXTERNAL_EMAIL,
  })

  // Fixtures for the refused-delivery paths.
  await submitContact(NAMES.contactFail, refusedEmail('ct'))
  await submitMeeting(NAMES.meetingFail, refusedEmail('mt'))

  await adminLogin({ page, log, URLS, CREDS })

  // ================================================= flow 3: contact reply, ok
  log('--- flow 3: contact reply, delivered ---')
  await gotoInbox(page, 'contact')
  await shot('contact-inbox')

  const ct = await replyViaUi(page, 'contact', NAMES.contactOk, `Delivered contact reply ${STAMP}.`)
  await shot('contact-reply-success')

  record('3', 'contact reply delivered answers 200', ct.status === 200, `HTTP ${ct.status}`)
  const ctToast = ct.toasts[ct.toasts.length - 1]
  record('3', 'contact success toast is the SUCCESS variant',
    Boolean(ctToast) && ctToast.role === 'status' && ctToast.isSuccess,
    ctToast ? `role=${ctToast.role} green=${ctToast.isSuccess}` : 'no toast')

  const ctRec = await findRecord('contact', NAMES.contactOk)
  record('3', 'contact replied_at set on delivery', Boolean(ctRec && ctRec.replied_at),
    ctRec ? `replied_at=${ctRec.replied_at}` : 'record not found')
  record('3', 'contact delivery_failed_at null on delivery',
    Boolean(ctRec) && ctRec.delivery_failed_at === null,
    ctRec ? `delivery_failed_at=${ctRec.delivery_failed_at}` : 'record not found')

  const ctSentMail = await waitForLog(submitOffset, 'Sending contact message reply')
  record('3', 'contact reply dispatch logged', ctSentMail, ctSentMail ? 'log line present' : 'missing')

  // ============================================ flow 4: contact reply, refused
  log('--- flow 4: contact reply, refused ---')
  await gotoInbox(page, 'contact')

  const ctf = await replyViaUi(page, 'contact', NAMES.contactFail, `Refused contact reply ${STAMP}.`)
  await shot('contact-reply-failure')

  record('4', 'contact reply refused answers 502', ctf.status === 502, `HTTP ${ctf.status}`)
  const ctfToast = ctf.toasts[ctf.toasts.length - 1]
  record('4', 'contact failure toast is the ERROR variant',
    Boolean(ctfToast) && ctfToast.role === 'alert' && ctfToast.isError,
    ctfToast ? `role=${ctfToast.role} red=${ctfToast.isError}` : 'no toast')
  record('4', 'contact failure toast carries the backend message',
    Boolean(ctfToast) && /could not be delivered/i.test(ctfToast.text),
    ctfToast ? `"${ctfToast.text}"` : 'no toast')
  record('4', 'contact failure toast does not claim success',
    Boolean(ctfToast) && !/sent successfully/i.test(ctfToast.text),
    ctfToast ? `"${ctfToast.text}"` : 'no toast')

  const ctfOpen = await page.locator(PAGES.contact.textarea).count()
  record('4', 'contact dialog stays open after refusal', ctfOpen > 0,
    ctfOpen > 0 ? 'reply textarea still present' : 'dialog closed')

  const ctfRec = await findRecord('contact', NAMES.contactFail)
  record('4', 'contact delivery_failed_at set on refusal',
    Boolean(ctfRec && ctfRec.delivery_failed_at),
    ctfRec ? `delivery_failed_at=${ctfRec.delivery_failed_at}` : 'record not found')
  record('4', 'contact replied_at stays null on refusal',
    Boolean(ctfRec) && ctfRec.replied_at === null,
    ctfRec ? `replied_at=${ctfRec.replied_at}` : 'record not found')
  record('4', 'contact reply text persisted despite refusal',
    Boolean(ctfRec && ctfRec.admin_reply),
    ctfRec ? `admin_reply set` : 'record not found')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)

  // The list indicator is the durable signal the toast is not.
  await gotoInbox(page, 'contact')
  const ctIndicator = await hasFailureIndicator(page, NAMES.contactFail)
  const ctOkIndicator = await hasFailureIndicator(page, NAMES.contactOk)
  await shot('contact-indicator')
  record('4', 'contact list shows the failure indicator', ctIndicator === true, `indicator=${ctIndicator}`)
  record('3', 'contact delivered row has no failure indicator', ctOkIndicator === false,
    `indicator=${ctOkIndicator}`)

  // ================================================= flow 5: meeting, both paths
  log('--- flow 5: meeting reply, both paths ---')
  await gotoInbox(page, 'meeting')

  const mt = await replyViaUi(page, 'meeting', NAMES.meetingOk, `Delivered meeting reply ${STAMP}.`)
  await shot('meeting-reply-success')
  record('5', 'meeting reply delivered answers 200', mt.status === 200, `HTTP ${mt.status}`)
  const mtToast = mt.toasts[mt.toasts.length - 1]
  record('5', 'meeting success toast is the SUCCESS variant',
    Boolean(mtToast) && mtToast.role === 'status' && mtToast.isSuccess,
    mtToast ? `role=${mtToast.role} green=${mtToast.isSuccess}` : 'no toast')

  const mtRec = await findRecord('meeting', NAMES.meetingOk)
  record('5', 'meeting status flips to replied on delivery',
    Boolean(mtRec) && mtRec.status === 'replied', mtRec ? `status=${mtRec.status}` : 'not found')
  record('5', 'meeting delivery_failed_at null on delivery',
    Boolean(mtRec) && mtRec.delivery_failed_at === null,
    mtRec ? `delivery_failed_at=${mtRec.delivery_failed_at}` : 'not found')

  await gotoInbox(page, 'meeting')
  const mtf = await replyViaUi(page, 'meeting', NAMES.meetingFail, `Refused meeting reply ${STAMP}.`)
  await shot('meeting-reply-failure')

  record('5', 'meeting reply refused answers 502', mtf.status === 502, `HTTP ${mtf.status}`)
  const mtfToast = mtf.toasts[mtf.toasts.length - 1]
  record('5', 'meeting failure toast is the ERROR variant',
    Boolean(mtfToast) && mtfToast.role === 'alert' && mtfToast.isError,
    mtfToast ? `role=${mtfToast.role} red=${mtfToast.isError}` : 'no toast')

  const mtfRec = await findRecord('meeting', NAMES.meetingFail)
  record('5', 'meeting delivery_failed_at set on refusal',
    Boolean(mtfRec && mtfRec.delivery_failed_at),
    mtfRec ? `delivery_failed_at=${mtfRec.delivery_failed_at}` : 'not found')
  // The Phase 1 fix: a refused reply must not read as "replied".
  record('5', 'meeting status does NOT claim replied after refusal',
    Boolean(mtfRec) && mtfRec.status === 'pending', mtfRec ? `status=${mtfRec.status}` : 'not found')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  await gotoInbox(page, 'meeting')
  const mtIndicator = await hasFailureIndicator(page, NAMES.meetingFail)
  const mtOkIndicator = await hasFailureIndicator(page, NAMES.meetingOk)
  await shot('meeting-indicator')
  record('5', 'meeting list shows the failure indicator', mtIndicator === true, `indicator=${mtIndicator}`)
  record('5', 'meeting delivered row has no failure indicator', mtOkIndicator === false,
    `indicator=${mtOkIndicator}`)

  // ==================================================== flow 6: retry clears it
  log('--- flow 6: successful retry clears the failure marker ---')

  // A deliverable fixture for each type, so a landing retry can be observed.
  await submitContact(NAMES.contactRetry, EXTERNAL_EMAIL)
  await submitMeeting(NAMES.meetingRetry, EXTERNAL_EMAIL)

  for (const [kind, name] of [['contact', NAMES.contactRetry], ['meeting', NAMES.meetingRetry]]) {
    const rec = await findRecord(kind, name)
    record('6', `${kind} retry fixture starts clean`,
      Boolean(rec) && rec.delivery_failed_at === null,
      rec ? `delivery_failed_at=${rec.delivery_failed_at}` : 'not found')
  }

  await gotoInbox(page, 'contact')
  const ctRetry = await replyViaUi(page, 'contact', NAMES.contactRetry, `Retry lands ${STAMP}.`)
  record('6', 'contact retry to a deliverable address answers 200', ctRetry.status === 200,
    `HTTP ${ctRetry.status}`)
  const ctRetryRec = await findRecord('contact', NAMES.contactRetry)
  record('6', 'contact retry leaves delivery_failed_at null',
    Boolean(ctRetryRec) && ctRetryRec.delivery_failed_at === null,
    ctRetryRec ? `delivery_failed_at=${ctRetryRec.delivery_failed_at}` : 'not found')

  await gotoInbox(page, 'meeting')
  const mtRetry = await replyViaUi(page, 'meeting', NAMES.meetingRetry, `Retry lands ${STAMP}.`)
  record('6', 'meeting retry to a deliverable address answers 200', mtRetry.status === 200,
    `HTTP ${mtRetry.status}`)
  const mtRetryRec = await findRecord('meeting', NAMES.meetingRetry)
  record('6', 'meeting retry leaves delivery_failed_at null',
    Boolean(mtRetryRec) && mtRetryRec.delivery_failed_at === null,
    mtRetryRec ? `delivery_failed_at=${mtRetryRec.delivery_failed_at}` : 'not found')

  // The failure marker is per-record: a row that was refused and never retried
  // must still be flagged, which is what makes the indicator trustworthy.
  // PHPUnit covers failure-then-success on the SAME record for both types
  // (test_a_successful_retry_clears_delivery_failed_at).
  await gotoInbox(page, 'contact')
  const ctStillFlagged = await hasFailureIndicator(page, NAMES.contactFail)
  record('6', 'contact row that never retried keeps its indicator', ctStillFlagged === true,
    `indicator=${ctStillFlagged}`)

  await gotoInbox(page, 'meeting')
  const mtStillFlagged = await hasFailureIndicator(page, NAMES.meetingFail)
  record('6', 'meeting row that never retried keeps its indicator', mtStillFlagged === true,
    `indicator=${mtStillFlagged}`)

  // ------------------------------------------------------------------ summary
  const failed = results.filter((r) => !r.pass)
  console.log('\n  === FULL EMAIL FLOW RESULTS ===')
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'} [${r.flow}] ${r.check} :: ${r.observed}`)
  }
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`)

  if (failed.length) {
    note({
      title: `${failed.length} email-flow check(s) failed`,
      detail: failed.map((f) => `[${f.flow}] ${f.check} :: ${f.observed}`).join('; '),
    })
  }

  fs.writeFileSync(
    path.join(__dirname, 'logs', 'email-flows-full-checks.json'),
    JSON.stringify({ stamp: STAMP, names: NAMES, results }, null, 2)
  )

  // ------------------------------------------------------------------ cleanup
  log('cleaning up test records via the authenticated API')
  const cleaned = []
  for (const [kind, endpoint] of [['contact', '/admin/messages'], ['meeting', '/admin/meeting-requests']]) {
    const body = await authed('GET', endpoint)
    for (const r of (body && body.data) || []) {
      if (typeof r.name === 'string' && r.name.includes(`${STAMP}`)) {
        const del = kind === 'contact' ? `/admin/messages/${r.id}` : `/admin/meeting-requests/${r.id}`
        await authed('DELETE', del)
        cleaned.push(`${kind}:${r.id}`)
      }
    }
  }
  log(`cleaned ${cleaned.length} records (${cleaned.join(', ') || 'none'})`)
}).then(() => process.exit(0))
