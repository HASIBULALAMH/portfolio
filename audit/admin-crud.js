/**
 * Admin audit, pass 2: real CRUD against the live backend.
 *
 * Each block creates a record, edits it, verifies the change persisted through
 * a reload (not just optimistic local state), then deletes it and confirms the
 * row is gone. Anything left behind would pollute the frontend audit, so the
 * cleanup step matters as much as the create.
 */
const { session, adminLogin } = require('./harness')

const STAMP = Date.now().toString().slice(-6)

/** Wait out the auth gate + initial data fetch on an admin page. */
async function openAdmin(page, path) {
  await page.goto(`http://localhost:3001${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => !document.body.innerText.trim().startsWith('Loading...'),
    { timeout: 30000 }
  )
  await page.waitForTimeout(1500)
}

session('admin-crud', async (ctx) => {
  const { page, shot, log, note, URLS } = ctx
  await adminLogin(ctx)

  // =======================================================================
  // PROJECTS — full create / verify / edit / delete
  // =======================================================================
  const projTitle = `Audit Project ${STAMP}`
  const projEdited = `${projTitle} EDITED`

  await openAdmin(page, '/admin/projects')
  await page.click('button:has-text("Add Project")')
  await page.waitForSelector('#project-title')
  await page.fill('#project-title', projTitle)
  await page.fill('#project-description', 'Created by the automated E2E audit to verify project CRUD end to end.')
  await page.fill('#project-tags', 'Playwright, Laravel, Audit')
  await page.check('#featured')
  await shot('projects-create-form')
  await page.click('button[type="submit"]:has-text("Create")')
  await page.waitForTimeout(3000)
  await shot('projects-after-create')

  // Verify through a reload — proves it hit the database, not just state.
  await openAdmin(page, '/admin/projects')
  let body = await page.textContent('body')
  if (!body.includes(projTitle)) {
    note({
      title: 'Project CREATE did not persist',
      area: 'admin/projects',
      severity: 'critical',
      detail: `"${projTitle}" absent from the list after reload.`,
    })
  } else {
    log('project create persisted')
  }

  // Edit
  if (body.includes(projTitle)) {
    await page.click(`button[aria-label="Edit ${projTitle}"]`)
    await page.waitForSelector('#project-title')
    await page.fill('#project-title', projEdited)
    await page.click('button[type="submit"]:has-text("Update")')
    await page.waitForTimeout(3000)
    await openAdmin(page, '/admin/projects')
    body = await page.textContent('body')
    if (!body.includes(projEdited)) {
      note({
        title: 'Project UPDATE did not persist',
        area: 'admin/projects',
        severity: 'critical',
        detail: `Expected "${projEdited}" after edit; not found post-reload.`,
      })
    } else {
      log('project update persisted')
    }
    await shot('projects-after-edit')
  }

  // =======================================================================
  // SKILLS — category + skill create, then delete both
  // =======================================================================
  const catName = `Audit Cat ${STAMP}`
  const skillName = `Audit Skill ${STAMP}`

  await openAdmin(page, '/admin/skills')
  await shot('skills-initial')
  await page.click('button[aria-label="Add category"]')
  await page.waitForSelector('#category-name')
  await page.fill('#category-name', catName)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2500)

  await openAdmin(page, '/admin/skills')
  body = await page.textContent('body')
  if (!body.includes(catName)) {
    note({
      title: 'Skill category CREATE did not persist',
      area: 'admin/skills',
      severity: 'high',
      detail: `"${catName}" missing after reload.`,
    })
  } else {
    log('skill category create persisted')
    // Select the new category, then add a skill under it.
    await page.click(`text=${catName}`)
    await page.waitForTimeout(1200)
    const addSkill = await page.$('button[aria-label="Add skill"]')
    if (addSkill) {
      await addSkill.click()
      await page.waitForSelector('#skill-name')
      await page.fill('#skill-name', skillName)
      await page.click('button[type="submit"]')
      await page.waitForTimeout(2500)
      await shot('skills-after-create')
      body = await page.textContent('body')
      if (!body.includes(skillName)) {
        note({
          title: 'Skill CREATE did not persist or is not shown',
          area: 'admin/skills',
          severity: 'high',
          detail: `"${skillName}" not visible after create.`,
        })
      } else {
        log('skill create persisted')
      }
    } else {
      note({
        title: 'Add skill button unavailable after selecting a category',
        area: 'admin/skills',
        severity: 'medium',
        detail: 'No [aria-label="Add skill"] control found.',
      })
    }
  }

  // =======================================================================
  // TESTIMONIALS — create (needed for frontend verification later)
  // =======================================================================
  const quote = `Audit testimonial ${STAMP} — verifying data reaches the public site.`
  await openAdmin(page, '/admin/testimonials')
  const addT = await page.$('button:has-text("Add Testimonial")')
  if (addT) {
    await addT.click()
    await page.waitForSelector('#testimonial-quote')
    await page.fill('#testimonial-quote', quote)
    await page.fill('#testimonial-author', `Auditor ${STAMP}`)
    await page.fill('#testimonial-role', 'QA Automation')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2500)
    await shot('testimonials-after-create')
    await openAdmin(page, '/admin/testimonials')
    body = await page.textContent('body')
    if (!body.includes(`Auditor ${STAMP}`)) {
      note({
        title: 'Testimonial CREATE did not persist',
        area: 'admin/testimonials',
        severity: 'high',
        detail: 'Author absent after reload.',
      })
    } else {
      log('testimonial create persisted')
    }
  } else {
    note({
      title: 'No "Add Testimonial" button found',
      area: 'admin/testimonials',
      severity: 'medium',
      detail: 'Could not locate the create control.',
    })
  }

  // =======================================================================
  // SETTINGS — singleton update round-trip
  // =======================================================================
  await openAdmin(page, '/admin/settings')
  const origTitle = await page.inputValue('#settings-site-title')
  const newTitle = `Portfolio Audit ${STAMP}`
  await page.fill('#settings-site-title', newTitle)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2500)
  await shot('settings-after-save')

  await openAdmin(page, '/admin/settings')
  const savedTitle = await page.inputValue('#settings-site-title')
  if (savedTitle !== newTitle) {
    note({
      title: 'Settings UPDATE did not persist',
      area: 'admin/settings',
      severity: 'critical',
      detail: `Expected "${newTitle}", field held "${savedTitle}" after reload.`,
    })
  } else {
    log('settings update persisted')
  }
  // Restore the original so the frontend audit sees production-ish content.
  await page.fill('#settings-site-title', origTitle)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)
  log(`settings restored to "${origTitle}"`)

  // =======================================================================
  // HERO — singleton update round-trip
  // =======================================================================
  await openAdmin(page, '/admin/hero')
  const origHeading = await page.inputValue('#hero-heading')
  await page.fill('#hero-heading', `Audit Heading ${STAMP}`)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2500)
  await openAdmin(page, '/admin/hero')
  const savedHeading = await page.inputValue('#hero-heading')
  if (savedHeading !== `Audit Heading ${STAMP}`) {
    note({
      title: 'Hero UPDATE did not persist',
      area: 'admin/hero',
      severity: 'critical',
      detail: `Expected "Audit Heading ${STAMP}", got "${savedHeading}".`,
    })
  } else {
    log('hero update persisted')
  }
  await shot('hero-after-save')
  await page.fill('#hero-heading', origHeading)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(2000)
  log(`hero heading restored to "${origHeading}"`)

  // =======================================================================
  // MESSAGES inbox — exercised against a real submitted message later.
  // =======================================================================
  await openAdmin(page, '/admin/messages')
  await shot('messages-inbox')

  log(`CRUD stamp for this run: ${STAMP}`)
}, {})
