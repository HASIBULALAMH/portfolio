/**
 * End-to-end check that the meeting-request reply email goes out via Resend.
 *
 * Creates a meeting request addressed to the Resend account owner (test mode
 * only delivers there), replies to it through the real admin endpoint, and reads
 * back the API's own message — which distinguishes "reply sent" from "reply
 * saved, but the email could not be sent".
 */
const { chromium } = require('playwright')

const API = 'http://127.0.0.1:8000/api'
const OWNER = 'hasibulalam108@gmail.com'
const STAMP = Date.now().toString().slice(-6)

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const request = page.request

  // 1. Public submission, as a visitor would.
  const created = await request.post(`${API}/meeting-requests`, {
    headers: { Accept: 'application/json' },
    data: {
      name: `Mail Probe ${STAMP}`,
      email: OWNER,
      preferred_date: '2026-09-20',
      preferred_time: '11:00',
      message: `Verifying Resend delivery for the reply mailable (${STAMP}).`,
    },
  })
  console.log(`POST /meeting-requests -> ${created.status()}`)

  // 2. Authenticate as the admin.
  const token = (
    await (
      await request.post(`${API}/login`, {
        headers: { Accept: 'application/json' },
        data: { email: 'info@hasib.com', password: '42862266' },
      })
    ).json()
  ).data.token
  const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' }

  // 3. Find the row we just made.
  const list = await (await request.get(`${API}/admin/meeting-requests`, { headers: auth })).json()
  const row = (list.data || []).find((r) => r.name === `Mail Probe ${STAMP}`)
  if (!row) {
    console.log('FAIL: could not find the meeting request just created')
    await browser.close()
    return
  }
  console.log(`found request #${row.id} (status=${row.status})`)

  // 4. Reply — this is the call that triggers MeetingRequestReplyMail.
  const replyRes = await request.put(`${API}/admin/meeting-requests/${row.id}/reply`, {
    headers: auth,
    data: { admin_reply: `Resend delivery check ${STAMP}. Tuesday 11:00 works.` },
  })
  const replyBody = await replyRes.json()
  console.log(`PUT .../reply -> ${replyRes.status()}`)
  console.log(`API message: "${replyBody.message}"`)

  const emailed = /sent successfully/i.test(replyBody.message || '')
  console.log(`\nemail dispatched via Resend: ${emailed}`)
  console.log(`status now: ${replyBody.data?.status}`)
  console.log(`admin_reply persisted: ${Boolean(replyBody.data?.admin_reply)}`)

  // 5. Clean up the probe record.
  const del = await request.delete(`${API}/admin/meeting-requests/${row.id}`, { headers: auth })
  console.log(`\ncleanup DELETE -> ${del.status()}`)
  await request.post(`${API}/logout`, { headers: auth })

  console.log(`\n=== VERDICT: ${emailed ? 'reply email sent through Resend' : 'EMAIL FAILED — check laravel.log'} ===`)
  await browser.close()
})()
