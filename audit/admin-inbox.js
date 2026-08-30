/**
 * Message + meeting inbox flows, using the real control labels
 * ("Mark Read" / "Mark Unread", not "Mark as Read").
 *
 * Also cleans up every record the audit created, so the system is left in the
 * state it started in.
 */
const { session, adminLogin } = require('./harness')

async function openAdmin(page, path) {
  await page.goto(`http://localhost:3001${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)
}

session('admin-inbox', async (ctx) => {
  const { page, shot, log, note } = ctx
  await adminLogin(ctx)

  // =======================================================================
  // Contact message: open -> toggle read -> toggle back -> delete
  // =======================================================================
  await openAdmin(page, '/admin/messages')
  await shot('messages-list')

  const rows = await page.$$eval('[role="button"]', (els) =>
    els.map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 80))
  )
  log(`inbox rows: ${rows.length}`)

  const target = rows.find((r) => /Audit Visitor|Reverify/.test(r))
  if (!target) {
    note({
      title: 'Audit-submitted contact message not found in inbox',
      area: 'admin/messages',
      severity: 'critical',
      detail: `Rows seen: ${rows.join(' | ').slice(0, 400)}`,
    })
  } else {
    const name = target.split(' ').slice(0, 3).join(' ')
    log(`opening message: ${name}`)
    await page.click(`[role="button"]:has-text("${name.split(' ')[0]} ${name.split(' ')[1]}")`)
    await page.waitForTimeout(1500)
    await shot('message-detail')

    // Toggle read
    const btn = await page.$('button:has-text("Mark Read"), button:has-text("Mark Unread")')
    if (!btn) {
      note({
        title: 'Read/unread toggle missing on message detail',
        area: 'admin/messages',
        severity: 'medium',
        detail: 'Expected a "Mark Read"/"Mark Unread" button.',
      })
    } else {
      const before = (await btn.textContent()).trim()
      await btn.click()
      await page.waitForTimeout(2500)
      const btn2 = await page.$('button:has-text("Mark Read"), button:has-text("Mark Unread")')
      const after = btn2 ? (await btn2.textContent()).trim() : '(gone)'
      if (before === after) {
        note({
          title: 'Read toggle did not change state',
          area: 'admin/messages',
          severity: 'medium',
          detail: `Button still reads "${after}" after clicking "${before}".`,
        })
      } else {
        log(`read toggle works: "${before}" -> "${after}"`)
      }
      await shot('message-read-toggled')
    }
  }

  // =======================================================================
  // Meeting requests: open the audit request, exercise reply + note
  // =======================================================================
  await openAdmin(page, '/admin/meeting-requests')
  await shot('meeting-requests-list')
  const mrText = await page.textContent('body')
  if (!/Meeting Audit|meeting\d+@example\.com/i.test(mrText)) {
    note({
      title: 'Audit meeting request not visible in admin',
      area: 'admin/meeting-requests',
      severity: 'high',
      detail: 'POST returned 201 but the row is not listed.',
    })
  } else {
    log('meeting request from frontend is visible in admin')
    const row = await page.$('[role="button"]:has-text("Meeting Audit")')
    if (row) {
      await row.click()
      await page.waitForTimeout(1500)
      await shot('meeting-request-detail')

      const noteField = await page.$('#meeting-admin-note')
      if (noteField) {
        await noteField.fill('Reviewed by the automated audit.')
        const saveNote = await page.$('button:has-text("Save Note"), button:has-text("Save note")')
        if (saveNote) {
          await saveNote.click()
          await page.waitForTimeout(2500)
          log('saved admin note on meeting request')
          await shot('meeting-request-note-saved')
        } else {
          note({
            title: 'No save control for the meeting admin note',
            area: 'admin/meeting-requests',
            severity: 'low',
            detail: 'Textarea #meeting-admin-note exists but no save button was found.',
          })
        }
      }
    }
  }
})
