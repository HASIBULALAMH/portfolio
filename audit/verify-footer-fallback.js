/**
 * Check 5b — the footer's text fallback when logo_path is cleared.
 *
 * Separate script because it has to outlast the public site's ISR window:
 * lib/api.js fetches with `next: { revalidate: 60 }`, cached server-side against
 * the backend URL, so a `?cachebust=` on the page URL does not invalidate it.
 *
 * Restores logo_path in a `finally` block — PUT /admin/settings is a full
 * replace and requires site_title and brand_name, so the whole record goes back.
 */
const { session, adminLogin, URLS, CREDS } = require('./harness')

const API = 'http://127.0.0.1:8000/api'

async function readSettings() {
  return (await (await fetch(`${API}/settings`)).json()).data
}

session('verify-footer-fallback', async ({ page, shot, log }) => {
  await adminLogin({ page, log, URLS, CREDS })
  const token = await page.evaluate(
    () => localStorage.getItem('auth_token') || localStorage.getItem('token'),
  )

  const original = await readSettings()
  log(`original logo_path=${original.logo_path}`)

  const put = (logoPath) =>
    fetch(`${API}/admin/settings`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        site_title: original.site_title,
        brand_name: original.brand_name,
        footer_text: original.footer_text,
        copyright_text: original.copyright_text,
        accent_color: original.accent_color,
        favicon_path: original.favicon_path,
        logo_alt: original.logo_alt,
        logo_path: logoPath,
      }),
    })

  const readFooter = async () => {
    await page.waitForSelector('footer', { timeout: 120000 })
    await page.waitForTimeout(2000)
    const f = await page.$('footer')
    if (f) await f.scrollIntoViewIfNeeded()
    await page.waitForTimeout(800)
    return page.evaluate(() => {
      const brand = document.querySelector('footer a[href="#home"]')
      return brand
        ? {
            hasImg: !!brand.querySelector('img'),
            text: brand.innerText.trim(),
            outerHTML: brand.outerHTML.slice(0, 320),
          }
        : { hasImg: null, text: null, outerHTML: null }
    })
  }

  try {
    const cleared = await put(null)
    log(`clear logo_path -> ${cleared.status}`)
    const afterApi = await readSettings()
    log(`API now reports logo_path=${JSON.stringify(afterApi.logo_path)}`)

    log('waiting 70s for the ISR cache to expire...')
    await new Promise((r) => setTimeout(r, 70000))

    await page.goto(URLS.frontend, { waitUntil: 'domcontentloaded' })
    let fb = await readFooter()

    // The first load after expiry can still serve stale-while-revalidate.
    if (fb.hasImg) {
      log('still stale, reloading once more')
      await page.waitForTimeout(4000)
      await page.reload({ waitUntil: 'domcontentloaded' })
      fb = await readFooter()
    }

    await shot('footer-fallback-text')
    log(`FALLBACK RESULT: ${JSON.stringify(fb)}`)

    const compact = (fb.text || '').replace(/\s+/g, '')
    const pass = fb.hasImg === false && compact === '[Hasibul.]'
    console.log(`\n  ${pass ? '✅ PASS' : '❌ FAIL'} — 5b. Footer falls back to the text wordmark`)
    console.log(`     API logo_path=${JSON.stringify(afterApi.logo_path)}`)
    console.log(`     hasImg=${fb.hasImg}, text="${fb.text}"`)
    console.log(`     DOM: ${fb.outerHTML}`)
  } finally {
    const restored = await put(original.logo_path)
    log(`restore logo_path -> ${restored.status}`)
    const check = await readSettings()
    log(`restored value matches original: ${check.logo_path === original.logo_path}`)
  }
})
