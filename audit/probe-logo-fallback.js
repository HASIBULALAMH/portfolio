/**
 * Verify ONLY the fallback branch, working with the ISR cache instead of
 * against it.
 *
 * The homepage is a static route with revalidate=60, so a query string does not
 * bust it: the first request after expiry serves stale HTML and regenerates in
 * the background, meaning the new content can take two requests plus the window
 * to appear. So: clear logo_path, then poll until the wordmark shows up.
 */
const { chromium } = require('playwright')

const API = 'http://127.0.0.1:8000/api'

async function putLogo(request, token, value) {
  const cur = await request.get(`${API}/admin/settings`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const s = (await cur.json()).data
  const payload = { ...s, logo_path: value }
  delete payload.id
  delete payload.updated_at
  const res = await request.put(`${API}/admin/settings`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    data: payload,
  })
  return { status: res.status(), body: (await res.json()).data?.logo_path }
}

async function readBrand(page) {
  await page.goto('http://localhost:3000/', {
    waitUntil: 'domcontentloaded',
    timeout: 150000,
  })
  await page.waitForSelector('header a[href="#home"]', { timeout: 60000 })
  await page.waitForTimeout(1200)
  return page.evaluate(() => {
    const a = document.querySelector('header a[href="#home"]')
    const img = a.querySelector('img')
    return {
      text: a.textContent.trim(),
      hasImg: Boolean(img),
      alt: img?.getAttribute('alt') ?? null,
      h: img ? Math.round(img.getBoundingClientRect().height) : null,
      w: img ? Math.round(img.getBoundingClientRect().width) : null,
      natural: img ? `${img.naturalWidth}x${img.naturalHeight}` : null,
    }
  })
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const request = page.request

  const token = (
    await (
      await request.post(`${API}/login`, {
        headers: { Accept: 'application/json' },
        data: { email: 'info@hasib.com', password: '42862266' },
      })
    ).json()
  ).data.token

  const original = (
    await (
      await request.get(`${API}/admin/settings`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
    ).json()
  ).data.logo_path
  console.log('original logo_path:', original ? original.slice(0, 70) + '…' : original)

  // ---- Clear it, and confirm the API really persisted null ----------------
  const cleared = await putLogo(request, token, null)
  console.log(`PUT logo_path=null -> ${cleared.status}, API now returns: ${JSON.stringify(cleared.body)}`)

  const check = await request.get(`${API}/settings`, { headers: { Accept: 'application/json' } })
  console.log('public GET /settings logo_path:', JSON.stringify((await check.json()).data.logo_path))

  // ---- Poll the rendered page until the wordmark appears ------------------
  let state = null
  const started = Date.now()
  for (let i = 0; i < 30; i++) {
    state = await readBrand(page)
    if (!state.hasImg) break
    await page.waitForTimeout(5000)
  }
  const waited = Math.round((Date.now() - started) / 1000)

  console.log(`\n--- FALLBACK (logo_path null), after ~${waited}s of polling ---`)
  console.log(`  <img> present : ${state.hasImg}`)
  console.log(`  wordmark text : "${state.text}"`)

  const fallbackOk = !state.hasImg && state.text === '[Hasibul.]'
  console.log(`  fallback correct: ${fallbackOk}`)
  await page.screenshot({ path: '/tmp/navbar-fallback.png', clip: { x: 0, y: 0, width: 700, height: 70 } })

  // ---- Restore and confirm the image comes back --------------------------
  const restored = await putLogo(request, token, original)
  console.log(`\nPUT restore -> ${restored.status}`)

  let back = null
  for (let i = 0; i < 30; i++) {
    back = await readBrand(page)
    if (back.hasImg) break
    await page.waitForTimeout(5000)
  }
  console.log(`--- RESTORED ---`)
  console.log(`  <img> present : ${back.hasImg}  alt="${back.alt}"  ${back.w}x${back.h}px  natural=${back.natural}`)
  await page.screenshot({ path: '/tmp/navbar-logo.png', clip: { x: 0, y: 0, width: 700, height: 70 } })

  console.log('\n=== VERDICT ===')
  console.log(`  fallback wordmark when logo_path null : ${fallbackOk}`)
  console.log(`  logo image when logo_path set         : ${back.hasImg && back.natural !== '0x0'}`)

  await browser.close()
})()
