/**
 * The fixed set of social platforms the Hero's `social_links` may use.
 *
 * Kept in one module because the admin dropdown and the public icon renderer
 * must agree exactly: a platform the admin can pick but the frontend cannot
 * draw would render a blank circle.
 *
 * DUPLICATED VERBATIM in portfolio-admin/lib/ and portfolio-frontend/lib/, the
 * same convention tech-icons.js follows — edit both. The backend's source of
 * truth is `Hero::SOCIAL_PLATFORMS`, which the `Rule::in` check validates
 * against; keep all three in sync.
 *
 * `iconSlug: null` means Simple Icons ships no mark for that platform. LinkedIn
 * and Twitter's bird were both withdrawn upstream over trademark policy — `x` is
 * the only Twitter entry that survives — and email/website are not brands at
 * all. Those cases render a hand-written or generic icon instead.
 */
export const SOCIAL_PLATFORMS = [
  { value: 'github', label: 'GitHub', iconSlug: 'github', placeholder: 'https://github.com/username' },
  { value: 'linkedin', label: 'LinkedIn', iconSlug: null, placeholder: 'https://linkedin.com/in/username' },
  { value: 'facebook', label: 'Facebook', iconSlug: 'facebook', placeholder: 'https://facebook.com/username' },
  { value: 'x', label: 'X (Twitter)', iconSlug: 'x', placeholder: 'https://x.com/username' },
  { value: 'instagram', label: 'Instagram', iconSlug: 'instagram', placeholder: 'https://instagram.com/username' },
  { value: 'youtube', label: 'YouTube', iconSlug: 'youtube', placeholder: 'https://youtube.com/@channel' },
  { value: 'whatsapp', label: 'WhatsApp', iconSlug: 'whatsapp', placeholder: 'https://wa.me/8801700000000' },
  { value: 'telegram', label: 'Telegram', iconSlug: 'telegram', placeholder: 'https://t.me/username' },
  { value: 'email', label: 'Email', iconSlug: null, placeholder: 'you@example.com' },
  { value: 'website', label: 'Website', iconSlug: null, placeholder: 'https://example.com' },
]

const BY_VALUE = new Map(SOCIAL_PLATFORMS.map((platform) => [platform.value, platform]))

/** Platform descriptor for a stored value, or null when it is unrecognised. */
export function getSocialPlatform(value) {
  if (!value) return null
  return BY_VALUE.get(value) ?? null
}

/**
 * Human label for a platform, falling back to the raw stored value.
 *
 * A row saved before a platform was removed from this list still has to render
 * something in the admin table and something in the public link's aria-label.
 */
export function socialPlatformLabel(value) {
  return getSocialPlatform(value)?.label ?? value ?? 'Link'
}

/**
 * The href to put on an anchor for this platform.
 *
 * Only `email` needs rewriting: the admin may type a bare address, which has to
 * become a mailto: link or the browser resolves it as a relative path. Every
 * other platform stores a full URL already — the backend rejects anything that
 * is not http(s) for them.
 */
export function socialHref(platform, url) {
  const value = (url || '').trim()
  if (!value) return null

  if (platform === 'email') {
    return /^mailto:/i.test(value) ? value : `mailto:${value}`
  }

  return value
}

/**
 * Drop rows that cannot render: no URL, or a platform this build does not know.
 *
 * Used by every public consumer (Hero, Footer, Contact) so they agree on which
 * links exist, and so a stale platform value cannot produce an iconless circle.
 */
export function usableSocialLinks(links) {
  if (!Array.isArray(links)) return []

  return links
    .filter((link) => link && getSocialPlatform(link.platform) && (link.url || '').trim())
    .map((link) => ({
      platform: link.platform,
      url: link.url.trim(),
      href: socialHref(link.platform, link.url),
      label: socialPlatformLabel(link.platform),
      iconSlug: getSocialPlatform(link.platform).iconSlug,
    }))
}
