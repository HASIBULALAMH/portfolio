/**
 * Verify the navbar logo swap:
 *  1. With settings.logo_path set -> an <img> renders, sized ~40px tall, with
 *     the aspect ratio preserved and a non-empty alt.
 *  2. With logo_path cleared -> the text wordmark "[Hasibul.]" returns.
 *
 * The logo lives on an external R2 domain, so this also confirms next/image
 * actually loads it (naturalWidth > 0) rather than silently failing.
 */
const { chromium } = require('playwright')

const API = 'http://127.0.0.1:8000/api'
const CREDS = { email: 'info@hasib.com', password: '42862266' }

async function setLogoPath(request, token, value) {
  // PUT /admin/settings is a full-resource update, so read-modify-write.
  const cur = await request.get(`${API}/admin/settings`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const settings = (await cur.json()).data
  const payload = { ...settings, logo_path: value }
  delete payload.id
  delete payload.updated_at

  const res = await request.put(`${API}/admin/settings`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    data: payload,
  })
  return res.status()
}

async function inspect(page, label) {
  // Cache-bust: the homepage is ISR-cached for 60s.
  await page.goto(`http://localhost:3000/?cb=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 150000,
  })
  await page.waitForSelector('header', { timeout: 60000 })
  await page.waitForTimeout(2500)

  const state = await page.evaluate(() => {
    const brandLink = document.querySelector('header a[href="#home"]')
    if (!brandLink) return { error: 'no brand link found' }
    const img = brandLink.querySelector('img')
    return {
      text: brandLink.innerText.trim(),
      hasImg: Boolean(img),
      img: img
        ? {
            alt: img.getAttribute('alt'),
            renderedH: Math.round(img.getBoundingClientRect().height),
            renderedW: Math.round(img.getBoundingClientRect().width),
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            complete: img.complete,
            src: (img.currentSrc || img.src).slice(0, 90),
          }
        : null,
    }
  })

  console.log(`\n--- ${label} ---`)
  if (state.error) { console.log('  ' + state.error); return state }
  console.log(`  wordmark text : "${state.text}"`)
  console.log(`  <img> present : ${state.hasImg}`)
  if (state.img) {
    const i = state.img
    console.log(`  alt           : "${i.alt}"`)
    console.log(`  rendered      : ${i.renderedW}x${i.renderedH} px`)
    console.log(`  natural       : ${i.naturalW}x${i.naturalH} (loaded: ${i.complete && i.naturalW > 0})`)
    console.log(`  src           : ${i.src}`)
    const ratioOk =
      i.naturalW > 0 &&
      Math.abs(i.renderedW / i.renderedH - i.naturalW / i.naturalH) < 0.05
    console.log(`  aspect ratio preserved: ${ratioOk}`)
  }
  return state
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const request = page.request

  const login = await request.post(`${API}/login`, {
    headers: { Accept: 'application/json' },
    data: CREDS,
  })
  const token = (await login.json()).data.token

  // Remember the real value so we can restore it.
  const before = await request.get(`${API}/admin/settings`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const originalLogo = (await before.json()).data.logo_path
  console.log('original logo_path:', originalLogo)

  const withLogo = await inspect(page, 'CASE 1: logo_path SET')

  console.log(`\nclearing logo_path -> ${await setLogoPath(request, token, null)}`)
  const withoutLogo = await inspect(page, 'CASE 2: logo_path CLEARED (fallback)')

  console.log(`\nrestoring logo_path -> ${await setLogoPath(request, token, originalLogo)}`)
  await inspect(page, 'CASE 3: restored')

  console.log('\n=== VERDICT ===')
  console.log(`  logo renders when set        : ${withLogo.hasImg && withLogo.img?.naturalW > 0}`)
  console.log(`  wordmark returns when unset  : ${!withoutLogo.hasImg && /Hasibul/.test(withoutLogo.text)}`)

  await browser.close()
})()
