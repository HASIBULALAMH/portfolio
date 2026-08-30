/**
 * Verifies the false-success toast fix on the meeting-request reply flow.
 *
 * Two paths, both driven through the real admin UI:
 *
 *   FAILURE — reply to a requester whose address Resend refuses (any non-owner
 *   domain, which is exactly what sandbox mode enforces). Expect HTTP 502 and an
 *   ERROR toast carrying the backend's own message.
 *
 *   SUCCESS — reply to a requester at the Resend account owner's address, the one
 *   recipient sandbox mode accepts. Expect HTTP 200 and a SUCCESS toast. This half
 *   is what proves the fix did not simply make every reply look like an error.
 *
 * Toasts auto-dismiss after 3s, so rather than racing that timeout the run installs
 * a MutationObserver up front and records every toast that appears — role="alert"
 * is the error variant, role="status" the success one.
 *
 * No configuration is touched. The failure path is produced by the recipient
 * address alone.
 *
 * Needs backend :8000 and admin :3001.
 */
const { session, adminLogin, URLS, CREDS } = require('./harness')
const fs = require('fs')
const path = require('path')

const API = 'http://127.0.0.1:8000/api'

// The only address Resend accepts without a verified domain.
const OWNER_EMAIL = 'hasibulalam108@gmail.com'
const STAMP = Date.now()

const FAIL_NAME = `ToastFix Reject ${STAMP}`
const PASS_NAME = `ToastFix Accept ${STAMP}`

async function createMeetingRequest(name, email) {
  const res = await fetch(`${API}/meeting-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name,
      email,
      preferred_date: '2026-09-22',
      preferred_time: '11:00',
      message: `Fixture for the toast-fix verification (${name}).`,
    }),
  })
  if (!res.ok) throw new Error(`fixture create failed for ${name}: HTTP ${res.status}`)
}

/** Record every toast that appears, so a 3s auto-dismiss cannot hide one. */
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

async function readToasts(page) {
  return page.evaluate(() => window.__toasts || [])
}

const results = []
function record(check, pass, observed) {
  results.push({ check, pass, observed })
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${check} :: ${observed}`)
}

/** Open a request by name, send a reply, return the PUT status and the toasts. */
async function replyTo(page, name, replyText, shot, label) {
  await installToastRecorder(page)

  const row = page.locator(`text=${name}`).first()
  if ((await row.count()) === 0) throw new Error(`no meeting request row named "${name}"`)
  await row.click()

  await page.waitForSelector('#meeting-reply', { timeout: 30000 })
  await page.fill('#meeting-reply', replyText)

  const putPromise = page.waitForResponse(
    (r) => r.url().includes('/reply') && r.request().method() === 'PUT',
    { timeout: 60000 }
  )
  await page.click('button:has-text("Send Reply")')
  const res = await putPromise
  const body = await res.json().catch(() => null)

  // Let the toast render and the list settle.
  await page.waitForTimeout(2000)
  await shot(label)

  return { status: res.status(), body, toasts: await readToasts(page) }
}

session('toast-fix', async ({ page, shot, log, note }) => {
  log('creating two fixtures: one recipient Resend refuses, one it accepts')
  await createMeetingRequest(FAIL_NAME, `rejected-${STAMP}@example.com`)
  await createMeetingRequest(PASS_NAME, OWNER_EMAIL)

  await adminLogin({ page, log, URLS, CREDS })
  await page.goto(`${URLS.admin}/admin/meeting-requests`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)
  await shot('inbox')

  // ------------------------------------------------------------ FAILURE path
  log('--- FAILURE path: recipient Resend refuses ---')
  const fail = await replyTo(
    page,
    FAIL_NAME,
    `Reply that cannot be delivered (${STAMP}).`,
    shot,
    'failure-toast'
  )

  record('failed send answers non-2xx', fail.status === 502, `HTTP ${fail.status}`)

  const failToast = fail.toasts[fail.toasts.length - 1]
  record('failure shows a toast at all', Boolean(failToast),
    failToast ? `"${failToast.text}"` : 'no toast captured')

  if (failToast) {
    record('failure toast is the ERROR variant',
      failToast.role === 'alert' && failToast.isError && !failToast.isSuccess,
      `role=${failToast.role} red=${failToast.isError} green=${failToast.isSuccess}`)

    record('failure toast does NOT claim success',
      !/sent successfully/i.test(failToast.text),
      `"${failToast.text}"`)

    record('failure toast carries the backend message',
      /could not be delivered/i.test(failToast.text),
      `"${failToast.text}"`)
  }

  // The reply is persisted even when delivery fails, so the body must hand the
  // saved record back — that is what lets the panel refresh instead of going stale.
  record('failure body returns the saved record',
    Boolean(fail.body && fail.body.data && fail.body.data.admin_reply),
    fail.body && fail.body.data
      ? `data.status=${fail.body.data.status}`
      : 'data was null')

  // Dialog stays open on failure by design: the admin needs the undelivered text.
  const dialogStillOpen = await page.locator('#meeting-reply').count()
  record('dialog stays open after a failed send', dialogStillOpen > 0,
    dialogStillOpen > 0 ? 'reply textarea still present' : 'dialog closed')

  // Close it before moving on.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)

  // ------------------------------------------------------------ SUCCESS path
  log('--- SUCCESS path: recipient Resend accepts ---')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)

  const ok = await replyTo(
    page,
    PASS_NAME,
    `Reply that should be delivered (${STAMP}).`,
    shot,
    'success-toast'
  )

  record('delivered send answers 200', ok.status === 200, `HTTP ${ok.status}`)

  const okToast = ok.toasts[ok.toasts.length - 1]
  record('success shows a toast at all', Boolean(okToast),
    okToast ? `"${okToast.text}"` : 'no toast captured')

  if (okToast) {
    record('success toast is the SUCCESS variant',
      okToast.role === 'status' && okToast.isSuccess && !okToast.isError,
      `role=${okToast.role} green=${okToast.isSuccess} red=${okToast.isError}`)

    record('success toast reports success',
      /sent successfully/i.test(okToast.text),
      `"${okToast.text}"`)
  }

  // Success closes the dialog, as before the fix.
  const dialogClosed = await page.locator('#meeting-reply').count()
  record('dialog closes after a delivered send', dialogClosed === 0,
    dialogClosed === 0 ? 'dialog closed' : 'dialog still open')

  if (fail.status === 200) {
    note({
      title: 'Reply endpoint still answers 200 on a failed send',
      detail: 'The backend half of the fix is not in effect.',
    })
  }
  if (failToast && failToast.isSuccess) {
    note({
      title: 'Failure still renders a success toast',
      detail: 'The frontend half of the fix is not in effect.',
    })
  }

  // ------------------------------------------------------------- summary
  const failed = results.filter((r) => !r.pass)
  console.log('\n  === TOAST FIX RESULTS ===')
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'} ${r.check} :: ${r.observed}`)
  }
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`)

  fs.writeFileSync(
    path.join(__dirname, 'logs', 'toast-fix-checks.json'),
    JSON.stringify(
      { stamp: STAMP, failure: { status: fail.status, toasts: fail.toasts },
        success: { status: ok.status, toasts: ok.toasts }, results },
      null,
      2
    )
  )
}).then(() => process.exit(0))
