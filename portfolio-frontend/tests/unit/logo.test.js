import { describe, expect, it } from 'vitest'
import { DEFAULT_LOGO_TEXT, resolveLogo } from '../../lib/logo.js'

/**
 * resolveLogo() — the image-vs-text decision shared by the public Navbar and
 * Footer, the admin Sidebar and the admin login screen.
 *
 * Five call sites read this one function precisely so they cannot disagree about
 * what an empty logo_text should do, which makes its fallback chain worth pinning
 * directly rather than through any one of them.
 */
describe('resolveLogo', () => {
  describe('the image branch', () => {
    it('renders an image when the type is image and a path is present', () => {
      const logo = resolveLogo({
        logo_type: 'image',
        logo_path: 'https://cdn.example.com/logo.png',
        logo_alt: 'Acme',
      })

      expect(logo).toEqual({
        kind: 'image',
        src: 'https://cdn.example.com/logo.png',
        alt: 'Acme',
      })
    })

    it('falls through to text when the type is image but the upload was cleared', () => {
      // A record left on 'image' after its file was removed would otherwise
      // render a broken <img>. Text always renders, so it is the safe branch.
      const logo = resolveLogo({
        logo_type: 'image',
        logo_path: '',
        brand_name: 'Acme',
      })

      expect(logo).toEqual({ kind: 'text', text: 'Acme' })
    })

    it('treats a whitespace-only path as cleared', () => {
      const logo = resolveLogo({ logo_type: 'image', logo_path: '   ', brand_name: 'Acme' })

      expect(logo.kind).toBe('text')
    })

    it('treats a null path as cleared', () => {
      // An unset singleton column arrives as null from the API, where the admin
      // form sends '' for the same state. Both must mean "not set".
      const logo = resolveLogo({ logo_type: 'image', logo_path: null, brand_name: 'Acme' })

      expect(logo.kind).toBe('text')
    })

    it('walks the alt fallback chain: alt, then brand, then the default', () => {
      const withPath = (extra) =>
        resolveLogo({ logo_type: 'image', logo_path: '/logo.png', ...extra })

      expect(withPath({ logo_alt: 'Alt', brand_name: 'Brand' }).alt).toBe('Alt')
      expect(withPath({ logo_alt: '', brand_name: 'Brand' }).alt).toBe('Brand')
      expect(withPath({ logo_alt: null, brand_name: null }).alt).toBe(DEFAULT_LOGO_TEXT)
    })
  })

  describe('the text branch', () => {
    it('prefers logo_text', () => {
      expect(resolveLogo({ logo_type: 'text', logo_text: 'HA', brand_name: 'Hasibul' }).text)
        .toBe('HA')
    })

    it('falls back to brand_name when logo_text is blank', () => {
      expect(resolveLogo({ logo_type: 'text', logo_text: '', brand_name: 'Hasibul' }).text)
        .toBe('Hasibul')
    })

    it('never returns a blank string', () => {
      // The point of routing the fallback through TextLogo rather than dropping
      // to plain text is that the wordmark stays styled in every state; a blank
      // string would render nothing at all.
      for (const settings of [
        {},
        { logo_type: 'text' },
        { logo_type: 'text', logo_text: '', brand_name: '' },
        { logo_type: 'text', logo_text: '   ', brand_name: '   ' },
        { logo_type: null, logo_text: null, brand_name: null },
      ]) {
        const logo = resolveLogo(settings)

        expect(logo.kind).toBe('text')
        expect(logo.text.trim()).not.toBe('')
      }
    })

    it('trims surrounding whitespace off a real value', () => {
      expect(resolveLogo({ logo_type: 'text', logo_text: '  HA  ' }).text).toBe('HA')
    })

    it('accepts a caller-supplied default', () => {
      expect(resolveLogo({}, { defaultText: 'Fallback' }).text).toBe('Fallback')
    })
  })

  describe('unknown and legacy logo_type values', () => {
    it('treats a null logo_type as text', () => {
      // Rows written before the logo_type column existed hold null, and they
      // must not be read as "image" by accident.
      expect(resolveLogo({ logo_type: null, logo_path: '/logo.png', brand_name: 'Acme' }))
        .toEqual({ kind: 'text', text: 'Acme' })
    })

    it('treats an unrecognised logo_type as text even with a usable path', () => {
      expect(resolveLogo({ logo_type: 'svg', logo_path: '/logo.png', brand_name: 'Acme' }).kind)
        .toBe('text')
    })

    it('is called safely with no argument at all', () => {
      expect(resolveLogo()).toEqual({ kind: 'text', text: DEFAULT_LOGO_TEXT })
    })

    it('ignores non-string field types instead of throwing', () => {
      // Defensive: these arrive from an API response, not from typed code.
      expect(() => resolveLogo({ logo_path: 42, brand_name: {}, logo_text: [] })).not.toThrow()
      expect(resolveLogo({ logo_path: 42, brand_name: {}, logo_text: [] }).kind).toBe('text')
    })
  })
})
