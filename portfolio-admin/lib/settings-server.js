/**
 * Server-side Site Settings read, for `generateMetadata` in app/layout.jsx.
 *
 * Kept separate from lib/settings.js because that file is a client module (it
 * holds the React context) and a server component cannot import from it.
 *
 * Deliberately not cached: the admin editing its own site title should see the
 * browser tab update on the next reload, not up to a minute later like the
 * public site's ISR-cached reads.
 */
import { SETTINGS_FALLBACK } from './settings-fallback'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

export async function fetchSettings() {
  try {
    const res = await fetch(`${API_BASE_URL}/settings`, { cache: 'no-store' })
    if (!res.ok) return SETTINGS_FALLBACK

    const json = await res.json()
    return { ...SETTINGS_FALLBACK, ...(json.data || {}) }
  } catch {
    // The admin must still render with the backend down — otherwise a mail or
    // DB outage would take the whole panel offline instead of one page.
    return SETTINGS_FALLBACK
  }
}
