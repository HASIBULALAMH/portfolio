/**
 * Admin audit, pass 3: the CRUD pages not covered by pass 2, plus every DELETE
 * flow — including cleanup of the records the audit itself created.
 *
 * Covers nav-items, timeline, api-showcase, about, contact-info; then deletes
 * the audit project, skill, skill category and testimonial via the UI.
 */
const { session, adminLogin } = require('./harness')

const STAMP = Date.now().toString().slice(-6)

async function openAdmin(page, path) {
  await page.goto(`http://localhost:3001${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 60000 }
  )
  await page.waitForTimeout(1500)
}

/** Click the AlertDialog confirm button and wait for the list to settle. */
async function confirmDialog(page) {
  await page.waitForTimeout(800)
  const btn = await page.$('button:has-text("Delete"):not([aria-label])')
  if (btn) {
    await btn.click()
  } else {
    // Fall back to the last Delete-labelled button (the dialog's).
    const all = await page.$$('button:has-text("Delete")')
    if (all.length) await all[all.length - 1].click()
  }
  await page.waitForTimeout(3000)
}

session('admin-crud2', async (ctx) => {
  const { page, shot, log, note } = ctx
  await adminLogin(ctx)

  // =======================================================================
  // NAV ITEMS — create then delete (the table was empty, so this also fixes
  // the fact that the public site was falling back to hardcoded nav)
  // =======================================================================
  const navLabel = `AuditNav${STAMP}`
  await openAdmin(page, '/admin/settings/nav')
  await shot('nav-initial')

  const addNav = await page.$('button:has-text("Add Nav Item"), button:has-text("Add Item"), button:has-text("Add")')
  if (!addNav) {
    note({
      title: 'No add control on Navigation Items page',
      area: 'admin/settings/nav',
      severity: 'medium',
      detail: 'Could not find a button to create a nav item.',
    })
  } else {
    await addNav.click()
    await page.waitForSelector('#nav-label', { timeout: 15000 })
    await page.fill('#nav-label', navLabel)
    await page.fill('#nav-href', '#contact')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2500)

    await openAdmin(page, '/admin/settings/nav')
    let t = await page.textContent('body')
    if (!t.includes(navLabel)) {
      note({
        title: 'Nav item CREATE did not persist',
        area: 'admin/settings/nav',
        severity: 'high',
        detail: `"${navLabel}" absent after reload.`,
      })
    } else {
      log('nav item create persisted')
      await shot('nav-after-create')

      const del = await page.$(`button[aria-label="Delete ${navLabel}"]`)
      if (del) {
        await del.click()
        await confirmDialog(page)
        await openAdmin(page, '/admin/settings/nav')
        t = await page.textContent('body')
        if (t.includes(navLabel)) {
          note({
            title: 'Nav item DELETE did not remove the record',
            area: 'admin/settings/nav',
            severity: 'high',
            detail: `"${navLabel}" still listed after delete + reload.`,
          })
        } else {
          log('nav item delete persisted')
        }
      } else {
        note({
          title: `No delete control for nav item "${navLabel}"`,
          area: 'admin/settings/nav',
          severity: 'medium',
          detail: 'Expected button[aria-label="Delete <label>"].',
        })
      }
    }
  }

  // =======================================================================
  // TIMELINE — create + delete
  // =======================================================================
  const tlTitle = `AuditRole${STAMP}`
  await openAdmin(page, '/admin/timeline')
  const addTl = await page.$('button:has-text("Add Timeline"), button:has-text("Add Item"), button:has-text("Add")')
  if (addTl) {
    await addTl.click()
    await page.waitForSelector('#timeline-title', { timeout: 15000 })
    await page.fill('#timeline-year', '2026')
    await page.fill('#timeline-title', tlTitle)
    await page.fill('#timeline-company', 'Audit Corp')
    await page.fill('#timeline-description', 'Created by the automated audit.')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2500)

    await openAdmin(page, '/admin/timeline')
    let t = await page.textContent('body')
    if (!t.includes(tlTitle)) {
      note({
        title: 'Timeline item CREATE did not persist',
        area: 'admin/timeline',
        severity: 'high',
        detail: `"${tlTitle}" absent after reload.`,
      })
    } else {
      log('timeline create persisted')
      await shot('timeline-after-create')
      const del = await page.$(`button[aria-label="Delete ${tlTitle}"]`)
      if (del) {
        await del.click()
        await confirmDialog(page)
        await openAdmin(page, '/admin/timeline')
        t = await page.textContent('body')
        if (t.includes(tlTitle)) {
          note({
            title: 'Timeline item DELETE did not remove the record',
            area: 'admin/timeline',
            severity: 'high',
            detail: `"${tlTitle}" still present after delete.`,
          })
        } else {
          log('timeline delete persisted')
        }
      }
    }
  }

  // =======================================================================
  // API SHOWCASE — create + delete
  // =======================================================================
  const scTitle = `AuditApi${STAMP}`
  await openAdmin(page, '/admin/api-showcase')
  const addSc = await page.$('button:has-text("Add Showcase"), button:has-text("Add API"), button:has-text("Add")')
  if (addSc) {
    await addSc.click()
    await page.waitForSelector('#showcase-title', { timeout: 15000 })
    await page.fill('#showcase-icon', 'Zap')
    await page.fill('#showcase-title', scTitle)
    await page.fill('#showcase-description', 'Created by the automated audit.')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2500)

    await openAdmin(page, '/admin/api-showcase')
    let t = await page.textContent('body')
    if (!t.includes(scTitle)) {
      note({
        title: 'API showcase CREATE did not persist',
        area: 'admin/api-showcase',
        severity: 'high',
        detail: `"${scTitle}" absent after reload.`,
      })
    } else {
      log('api showcase create persisted')
      await shot('api-showcase-after-create')
      const del = await page.$(`button[aria-label="Delete ${scTitle}"]`)
      if (del) {
        await del.click()
        await confirmDialog(page)
        await openAdmin(page, '/admin/api-showcase')
        t = await page.textContent('body')
        if (t.includes(scTitle)) {
          note({
            title: 'API showcase DELETE did not remove the record',
            area: 'admin/api-showcase',
            severity: 'high',
            detail: `"${scTitle}" still present after delete.`,
          })
        } else {
          log('api showcase delete persisted')
        }
      }
    }
  }

  // =======================================================================
  // ABOUT + CONTACT INFO — singleton round-trips
  // =======================================================================
  await openAdmin(page, '/admin/about')
  await shot('about-page')
  const aboutInputs = await page.$$('input[type="text"], textarea')
  if (aboutInputs.length === 0) {
    note({
      title: 'About page renders no editable fields',
      area: 'admin/about',
      severity: 'high',
      detail: 'Expected the bio/stat fields to be present.',
    })
  } else {
    const submit = await page.$('button[type="submit"]')
    if (submit) {
      await submit.click()
      await page.waitForTimeout(2500)
      const t = await page.textContent('body')
      if (/failed|error/i.test(t) && !/no error/i.test(t)) {
        note({
          title: 'Saving the About section reported an error',
          area: 'admin/about',
          severity: 'high',
          detail: t.replace(/\s+/g, ' ').slice(0, 300),
        })
      } else {
        log('about save OK (no-change save accepted)')
      }
    }
  }

  await openAdmin(page, '/admin/contact-info')
  const origEmail = await page.inputValue('#contact-email')
  await page.fill('#contact-email', `audit${STAMP}@example.com`)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2500)
  await openAdmin(page, '/admin/contact-info')
  const savedEmail = await page.inputValue('#contact-email')
  if (savedEmail !== `audit${STAMP}@example.com`) {
    note({
      title: 'Contact info UPDATE did not persist',
      area: 'admin/contact-info',
      severity: 'critical',
      detail: `Expected audit${STAMP}@example.com, got "${savedEmail}".`,
    })
  } else {
    log('contact info update persisted')
  }
  await shot('contact-info-after-save')
  await page.fill('#contact-email', origEmail)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)
  log(`contact email restored to "${origEmail}"`)

  // =======================================================================
  // CLEANUP — delete everything pass 2 created
  // =======================================================================
  log('--- cleanup ---')

  // Projects
  await openAdmin(page, '/admin/projects')
  let body = await page.textContent('body')
  const projMatch = body.match(/Audit Project \d+ EDITED|Audit Project \d+/)
  if (projMatch) {
    const del = await page.$(`button[aria-label="Delete ${projMatch[0]}"]`)
    if (del) {
      await del.click()
      await confirmDialog(page)
      await openAdmin(page, '/admin/projects')
      body = await page.textContent('body')
      if (body.includes(projMatch[0])) {
        note({
          title: 'Project DELETE did not remove the record',
          area: 'admin/projects',
          severity: 'critical',
          detail: `"${projMatch[0]}" still listed after delete + reload.`,
        })
      } else {
        log(`deleted audit project "${projMatch[0]}"`)
      }
      await shot('projects-after-delete')
    }
  } else {
    log('no audit project left to clean up')
  }

  // Testimonials
  await openAdmin(page, '/admin/testimonials')
  body = await page.textContent('body')
  const tMatch = body.match(/Auditor \d+/)
  if (tMatch) {
    const del = await page.$(`button[aria-label="Delete testimonial from ${tMatch[0]}"]`)
      || await page.$(`button[aria-label*="${tMatch[0]}"]`)
    if (del) {
      await del.click()
      await confirmDialog(page)
      await openAdmin(page, '/admin/testimonials')
      body = await page.textContent('body')
      if (body.includes(tMatch[0])) {
        note({
          title: 'Testimonial DELETE did not remove the record',
          area: 'admin/testimonials',
          severity: 'high',
          detail: `"${tMatch[0]}" still listed after delete.`,
        })
      } else {
        log(`deleted audit testimonial "${tMatch[0]}"`)
      }
    } else {
      const labels = await page.$$eval('button[aria-label]', (bs) => bs.map((b) => b.getAttribute('aria-label')))
      log(`could not find testimonial delete button; labels: ${labels.join(' | ').slice(0, 300)}`)
    }
  } else {
    log('no audit testimonial left to clean up')
  }

  // Skills: skill first, then its category
  await openAdmin(page, '/admin/skills')
  body = await page.textContent('body')
  const catMatch = body.match(/Audit Cat \d+/)
  if (catMatch) {
    await page.click(`text=${catMatch[0]}`)
    await page.waitForTimeout(1500)
    body = await page.textContent('body')
    const skillMatch = body.match(/Audit Skill \d+/)
    if (skillMatch) {
      const del = await page.$(`button[aria-label="Delete ${skillMatch[0]}"]`)
      if (del) {
        await del.click()
        await confirmDialog(page)
        log(`deleted audit skill "${skillMatch[0]}"`)
      }
    }
    await openAdmin(page, '/admin/skills')
    const delCat = await page.$(`button[aria-label="Delete ${catMatch[0]}"]`)
    if (delCat) {
      await delCat.click()
      await confirmDialog(page)
      await openAdmin(page, '/admin/skills')
      body = await page.textContent('body')
      if (body.includes(catMatch[0])) {
        note({
          title: 'Skill category DELETE did not remove the record',
          area: 'admin/skills',
          severity: 'high',
          detail: `"${catMatch[0]}" still listed after delete.`,
        })
      } else {
        log(`deleted audit skill category "${catMatch[0]}"`)
      }
    }
    await shot('skills-after-cleanup')
  } else {
    log('no audit skill category left to clean up')
  }

  log(`crud2 stamp: ${STAMP}`)
})
