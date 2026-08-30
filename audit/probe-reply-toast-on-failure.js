/**
 * Focused probe for one question the main email-flow run could not answer:
 *
 * MeetingRequestController returns HTTP 200 with
 *   "Reply saved, but the email could not be sent. Check the mail configuration."
 * when the transport rejects the recipient. Does the admin panel surface that,
 * or does it claim success anyway?
 *
 * The main verify-email-flows.js run always addressed the Resend account owner,
 * so the send succeeded and this branch never executed. This probe replies to a
 * meeting request whose requester address Resend refuses (a non-owner domain),
 * which is exactly the sandbox condition, and compares the API's message with
 * the toast the admin actually sees. No config is modified.
 *
 * Pass the target meeting request name as argv[2].
 */
const { session, adminLogin, URLS, CREDS } = require('./harness')

const TARGET_NAME = process.argv[2]
if (!TARGET_NAME) {
  console.error('usage: node probe-reply-toast-on-failure.js "<meeting request name>"')
  process.exit(1)
}

const REPLY_TEXT = `Probe reply for a recipient Resend will refuse (${TARGET_NAME}).`

session('reply-toast-failure', async ({ page, shot, log, note }) => {
  await adminLogin({ page, log, URLS, CREDS })

  await page.goto(`${URLS.admin}/admin/meeting-requests`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)

  const row = page.locator(`text=${TARGET_NAME}`).first()
  if ((await row.count()) === 0) throw new Error(`no meeting request row named "${TARGET_NAME}"`)
  await row.click()

  await page.waitForSelector('#meeting-reply', { timeout: 30000 })
  await page.fill('#meeting-reply', REPLY_TEXT)
  await shot('reply-filled')

  const replyPut = page.waitForResponse(
    (r) => r.url().includes('/reply') && r.request().method() === 'PUT',
    { timeout: 60000 }
  )
  await page.click('button:has-text("Send Reply")')
  const res = await replyPut
  const body = await res.json().catch(() => null)
  const apiMessage = body && body.message

  // Toast renders after the response resolves.
  await page.waitForTimeout(1500)
  const uiText = await page.locator('body').innerText()
  await shot('reply-toast')

  const apiSaysFailed = Boolean(apiMessage && apiMessage.includes('could not be sent'))
  const uiClaimsSent = uiText.includes('Reply sent successfully')

  log(`HTTP ${res.status()}`)
  log(`API message : ${apiMessage}`)
  log(`UI claims success : ${uiClaimsSent}`)

  if (apiSaysFailed && uiClaimsSent) {
    note({
      title: 'Admin sees "Reply sent successfully" although the email was rejected',
      detail:
        `API returned HTTP ${res.status()} with "${apiMessage}", but the panel toasted ` +
        '"Reply sent successfully". apiCall() maps every 2xx to success:true and ' +
        'handleSendReply ignores result.message on the success path.',
    })
  } else if (apiSaysFailed && !uiClaimsSent) {
    log('OK — the UI surfaced the partial failure.')
  } else {
    log(`Inconclusive: the transport did not reject this recipient (api="${apiMessage}").`)
  }

  console.log('\n  === RESULT ===')
  console.log(`  api_says_failed = ${apiSaysFailed}`)
  console.log(`  ui_claims_sent  = ${uiClaimsSent}`)
  console.log(`  false_positive  = ${apiSaysFailed && uiClaimsSent}`)
}).then(() => process.exit(0))
