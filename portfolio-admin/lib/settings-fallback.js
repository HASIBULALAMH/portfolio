/**
 * Shared Site Settings fallback.
 *
 * Its own module, with no `'use client'` directive and no React imports, so
 * both the client context (lib/settings.js) and the server-side metadata fetch
 * (lib/settings-server.js) can import it. Importing it from settings.js instead
 * would drag `createContext` into the server bundle, where calling it throws.
 */
export const SETTINGS_FALLBACK = {
  site_title: 'Portfolio Admin',
  brand_name: 'Hasibul',
  // See the public site's FALLBACK_SETTINGS: with no API there is no uploaded
  // file to render, so the text logo is the only option that can appear.
  logo_type: 'text',
  logo_text: null,
  logo_path: null,
  logo_alt: null,
  favicon_path: null,
}
