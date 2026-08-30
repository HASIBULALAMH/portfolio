import { describe, expect, it } from 'vitest'
import {
  SOCIAL_PLATFORMS,
  getSocialPlatform,
  socialHref,
  socialPlatformLabel,
  usableSocialLinks,
} from '../../lib/social-platforms.js'

/**
 * The platform set the Hero's `social_links` may use, and the three helpers that
 * turn stored rows into renderable links.
 *
 * Hero, Footer and Contact all read `usableSocialLinks()`, so a row this function
 * lets through without an icon becomes a blank circle in three places at once.
 */
describe('SOCIAL_PLATFORMS', () => {
  it('has unique values', () => {
    const values = SOCIAL_PLATFORMS.map((p) => p.value)

    expect(new Set(values).size).toBe(values.length)
  })

  it('gives every platform a label and a placeholder', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      expect(platform.label, `${platform.value} has no label`).toBeTruthy()
      expect(platform.placeholder, `${platform.value} has no placeholder`).toBeTruthy()
    }
  })

  it('declares iconSlug explicitly on every platform, null included', () => {
    // null means "Simple Icons ships no mark for this brand" and is a real
    // decision (LinkedIn and Twitter's bird were withdrawn upstream). undefined
    // would mean somebody forgot, and the two must stay distinguishable.
    for (const platform of SOCIAL_PLATFORMS) {
      expect(platform, `${platform.value} is missing an iconSlug key`).toHaveProperty('iconSlug')
      expect(platform.iconSlug === null || typeof platform.iconSlug === 'string').toBe(true)
    }
  })

  it('keeps x as the only Twitter entry', () => {
    const values = SOCIAL_PLATFORMS.map((p) => p.value)

    expect(values).toContain('x')
    expect(values).not.toContain('twitter')
  })
})

describe('getSocialPlatform', () => {
  it('resolves a known value', () => {
    expect(getSocialPlatform('github')).toMatchObject({ value: 'github', iconSlug: 'github' })
  })

  it('returns null for an unknown value', () => {
    expect(getSocialPlatform('myspace')).toBeNull()
  })

  it('returns null rather than throwing on empty input', () => {
    expect(getSocialPlatform('')).toBeNull()
    expect(getSocialPlatform(null)).toBeNull()
    expect(getSocialPlatform(undefined)).toBeNull()
  })
})

describe('socialPlatformLabel', () => {
  it('gives the human label for a known platform', () => {
    expect(socialPlatformLabel('x')).toBe('X (Twitter)')
  })

  it('falls back to the raw stored value for an unknown platform', () => {
    // A row saved before a platform was removed from the list still has to
    // render something in the admin table and in the public aria-label.
    expect(socialPlatformLabel('myspace')).toBe('myspace')
  })

  it('falls back to a generic word when there is no value at all', () => {
    expect(socialPlatformLabel(null)).toBe('Link')
    expect(socialPlatformLabel(undefined)).toBe('Link')
  })
})

describe('socialHref', () => {
  it('turns a bare address into a mailto link', () => {
    // Without this the browser resolves the bare address as a relative path.
    expect(socialHref('email', 'you@example.com')).toBe('mailto:you@example.com')
  })

  it('leaves an existing mailto link alone', () => {
    expect(socialHref('email', 'mailto:you@example.com')).toBe('mailto:you@example.com')
  })

  it('recognises a mailto scheme regardless of case', () => {
    expect(socialHref('email', 'MailTo:you@example.com')).toBe('MailTo:you@example.com')
  })

  it('passes every other platform through untouched', () => {
    expect(socialHref('github', 'https://github.com/me')).toBe('https://github.com/me')
  })

  it('trims surrounding whitespace', () => {
    expect(socialHref('github', '  https://github.com/me  ')).toBe('https://github.com/me')
  })

  it('returns null for a blank url so the caller can drop the anchor', () => {
    expect(socialHref('github', '')).toBeNull()
    expect(socialHref('github', '   ')).toBeNull()
    expect(socialHref('github', null)).toBeNull()
    expect(socialHref('github', undefined)).toBeNull()
  })
})

describe('usableSocialLinks', () => {
  it('projects a valid row into everything a renderer needs', () => {
    expect(usableSocialLinks([{ platform: 'github', url: 'https://github.com/me' }])).toEqual([
      {
        platform: 'github',
        url: 'https://github.com/me',
        href: 'https://github.com/me',
        label: 'GitHub',
        iconSlug: 'github',
      },
    ])
  })

  it('drops rows whose platform this build does not know', () => {
    // The failure this prevents is an iconless circle: a stale platform value
    // would otherwise reach the icon renderer, which has no mark for it.
    const links = usableSocialLinks([
      { platform: 'github', url: 'https://github.com/me' },
      { platform: 'myspace', url: 'https://myspace.com/me' },
    ])

    expect(links.map((l) => l.platform)).toEqual(['github'])
  })

  it('drops rows with no url', () => {
    const links = usableSocialLinks([
      { platform: 'github', url: '' },
      { platform: 'linkedin', url: '   ' },
      { platform: 'x', url: null },
      { platform: 'facebook' },
    ])

    expect(links).toEqual([])
  })

  it('keeps a platform that legitimately has no icon slug', () => {
    // LinkedIn has iconSlug: null by upstream policy, and must still render.
    const links = usableSocialLinks([
      { platform: 'linkedin', url: 'https://linkedin.com/in/me' },
    ])

    expect(links).toHaveLength(1)
    expect(links[0].iconSlug).toBeNull()
  })

  it('rewrites the email row to a mailto href while keeping the raw url', () => {
    const [link] = usableSocialLinks([{ platform: 'email', url: 'you@example.com' }])

    expect(link.url).toBe('you@example.com')
    expect(link.href).toBe('mailto:you@example.com')
  })

  it('preserves the stored order', () => {
    const links = usableSocialLinks([
      { platform: 'x', url: 'https://x.com/me' },
      { platform: 'github', url: 'https://github.com/me' },
    ])

    expect(links.map((l) => l.platform)).toEqual(['x', 'github'])
  })

  it('returns an empty array for anything that is not an array', () => {
    // The field is JSON on the model and arrives as null on an unset Hero row,
    // so every caller relies on this to keep `.map` safe.
    expect(usableSocialLinks(null)).toEqual([])
    expect(usableSocialLinks(undefined)).toEqual([])
    expect(usableSocialLinks({})).toEqual([])
    expect(usableSocialLinks('github')).toEqual([])
  })

  it('survives null entries inside the array', () => {
    expect(usableSocialLinks([null, { platform: 'github', url: 'https://github.com/me' }]))
      .toHaveLength(1)
  })
})
