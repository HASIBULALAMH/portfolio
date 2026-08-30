/**
 * Decide which logo a settings record should render, and with what value.
 *
 * Four places render the logo — the public Navbar and Footer, the admin Sidebar
 * and the admin login screen — and the Settings page previews it. Without one
 * helper, each would carry its own copy of the image-vs-text decision and
 * fallback chain, which is how five call sites end up disagreeing about what an
 * empty logo_text should do.
 *
 * Copy of portfolio-frontend/lib/logo.js — the two apps are separate builds with
 * no shared package. Keep them in sync so the admin preview and the public site
 * cannot disagree about which logo a record renders.
 *
 * Returns `{ kind: 'image', src, alt }` or `{ kind: 'text', text }`.
 *
 * The text branch never returns a blank string: `logo_text` falls back to
 * `brand_name`, then to a literal default. That is what keeps the wordmark
 * styled in every state — the point of routing the fallback through TextLogo
 * rather than dropping to unstyled plain text.
 *
 * 'image' additionally requires a non-blank `logo_path`. A record whose type is
 * 'image' but whose upload was cleared would otherwise render a broken <img>;
 * it falls through to text instead, which always renders.
 */
export const DEFAULT_LOGO_TEXT = 'Hasibul'

export function resolveLogo(settings = {}, { defaultText = DEFAULT_LOGO_TEXT } = {}) {
  // Treat null and empty string alike throughout: an unset singleton column
  // comes back null from the API, but clearing a field in the admin form sends
  // ''. Both mean "not set".
  const path = typeof settings.logo_path === 'string' ? settings.logo_path.trim() : ''
  const brand = typeof settings.brand_name === 'string' ? settings.brand_name.trim() : ''
  const text = typeof settings.logo_text === 'string' ? settings.logo_text.trim() : ''
  const alt = typeof settings.logo_alt === 'string' ? settings.logo_alt.trim() : ''

  // Anything other than an explicit 'image' with a usable file is text. That
  // covers logo_type being null on a record written before this column existed.
  if (settings.logo_type === 'image' && path) {
    return {
      kind: 'image',
      src: path,
      alt: alt || brand || defaultText,
    }
  }

  return {
    kind: 'text',
    text: text || brand || defaultText,
  }
}
