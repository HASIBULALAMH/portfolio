/**
 * Site Settings access for the admin panel.
 *
 * The admin shows the same brand as the public site, so it reads the same
 * public `GET /settings` row rather than keeping its own branding fields.
 *
 * Two consumers with different needs:
 *   - `fetchSettings()` runs on the server for `generateMetadata` (title and
 *     favicon), which cannot use the axios client in lib/api.js because that
 *     reads localStorage for the bearer token.
 *   - `SettingsProvider` / `useSettings()` serve the client shell (sidebar
 *     wordmark), so one fetch is shared instead of one per component.
 */
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { apiCall } from './api'
import { SETTINGS_FALLBACK } from './settings-fallback'

export { SETTINGS_FALLBACK }

const SettingsContext = createContext(SETTINGS_FALLBACK)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(SETTINGS_FALLBACK)

  useEffect(() => {
    let cancelled = false

    // Public endpoint — no token needed, so this works even before the auth
    // check resolves. A failure is not worth surfacing: the wordmark falls back
    // to text and nothing else in the panel depends on it.
    apiCall('GET', '/settings').then((result) => {
      if (!cancelled && result.success && result.data) {
        setSettings({ ...SETTINGS_FALLBACK, ...result.data })
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
