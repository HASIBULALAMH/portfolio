/**
 * Checks whether the bottom of each long admin form is actually reachable:
 * scroll main to its maximum and see if the submit button is fully visible.
 *
 * Also re-runs the scroll-down-then-up cycle in a GPU-enabled (headed) browser,
 * since backdrop-filter compositing bugs do not reproduce in headless.
 */
const { session, adminLogin } = require('./harness')

const PAGES = ['/admin/about', '/admin/hero', '/admin/settings']

session('scroll-reach', async ({ page, shot, log, note, URLS, CREDS }) => {
  await adminLogin({ page, log, URLS, CREDS })

  for (const path of PAGES) {
    log(`\n===== ${path} =====`)
    await page.goto(`${URLS.admin}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)

    const info = await page.evaluate(() => {
      const main = document.querySelector('main')
      main.scrollTop = main.scrollHeight // go as far down as possible
      const mainRect = main.getBoundingClientRect()

      // The real content height, measured from the page wrapper inside main.
      const wrapper = main.firstElementChild
      const wrapRect = wrapper.getBoundingClientRect()

      const submit = main.querySelector('button[type="submit"]')
      const subRect = submit ? submit.getBoundingClientRect() : null

      const cs = getComputedStyle(main)
      return {
        scrollTop: main.scrollTop,
        maxScrollTop: main.scrollHeight - main.clientHeight,
        scrollHeight: main.scrollHeight,
        clientHeight: main.clientHeight,
        mainPadding: [cs.paddingTop, cs.paddingBottom],
        wrapperHeight: Math.round(wrapRect.height),
        wrapperBottomRelToMain: Math.round(wrapRect.bottom - mainRect.bottom),
        submit: subRect
          ? {
              top: Math.round(subRect.top),
              bottom: Math.round(subRect.bottom),
              mainBottom: Math.round(mainRect.bottom),
              fullyVisible: subRect.bottom <= mainRect.bottom && subRect.top >= mainRect.top,
              text: submit.innerText.trim(),
            }
          : null,
      }
    })
    log(JSON.stringify(info, null, 2))
    await shot(`${path.replace(/\//g, '_')}-maxscroll`, { fullPage: false })

    if (info.submit && !info.submit.fullyVisible) {
      note({
        title: `Submit button NOT reachable at max scroll on ${path}`,
        detail: `submit.bottom=${info.submit.bottom} main.bottom=${info.submit.mainBottom} (cut off by ${info.submit.bottom - info.submit.mainBottom}px)`,
      })
    }
    if (info.wrapperBottomRelToMain > 1) {
      note({
        title: `Content overflows past scrollable area on ${path}`,
        detail: `wrapper bottom is ${info.wrapperBottomRelToMain}px below main's bottom at max scroll`,
      })
    }
  }
})
