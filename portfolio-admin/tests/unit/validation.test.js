import { describe, expect, it } from 'vitest'
import {
  aboutSchema,
  apiShowcaseSchema,
  contactInfoSchema,
  heroSchema,
  loginSchema,
  meetingRequestSchema,
  projectSchema,
  settingsSchema,
  skillSchema,
  testimonialSchema,
  timelineItemSchema,
} from '../../lib/validation.js'

/**
 * The zod schemas the admin forms validate against before any round trip.
 *
 * These are the client half of a two-sided contract — the backend FormRequests
 * are the authority, and tests/Unit/FormRequestValidationTest.php pins those. What
 * matters here is that the client half is not *stricter* than the server: a rule
 * that rejects something the API would have accepted blocks the admin from saving
 * with no way to override it, which is exactly the failure mode the empty-string
 * branches in `optionalUrl`/`optionalEmail` exist to prevent.
 */

/** True when the payload validates. */
const ok = (schema, payload) => schema.safeParse(payload).success

/** Field paths that failed, so a test can name the field it expects to fail. */
const failedFields = (schema, payload) => {
  const result = schema.safeParse(payload)
  if (result.success) return []
  return result.error.issues.map((issue) => issue.path.join('.'))
}

describe('loginSchema', () => {
  it('accepts a well-formed credential pair', () => {
    expect(ok(loginSchema, { email: 'admin@example.com', password: 'secret123' })).toBe(true)
  })

  it('rejects a malformed email', () => {
    expect(failedFields(loginSchema, { email: 'nope', password: 'secret123' })).toContain('email')
  })

  it('requires at least six password characters', () => {
    expect(failedFields(loginSchema, { email: 'a@b.com', password: '12345' })).toContain('password')
    expect(ok(loginSchema, { email: 'a@b.com', password: '123456' })).toBe(true)
  })
})

describe('settingsSchema', () => {
  const valid = {
    site_title: 'Portfolio',
    brand_name: 'Acme',
    accent_color: '#8B5CF6',
    logo_type: 'text',
  }

  it('accepts the minimum required set', () => {
    expect(ok(settingsSchema, valid)).toBe(true)
  })

  it('requires a six-digit hex accent colour', () => {
    for (const bad of ['8B5CF6', '#8B5CF', '#GGGGGG', 'purple', '#8B5CF6A']) {
      expect(failedFields(settingsSchema, { ...valid, accent_color: bad }), bad)
        .toContain('accent_color')
    }
  })

  it('accepts a lowercase hex accent colour', () => {
    // The regex carries the /i flag; a colour picker may emit either case.
    expect(ok(settingsSchema, { ...valid, accent_color: '#8b5cf6' })).toBe(true)
  })

  it('constrains logo_type to image or text', () => {
    expect(ok(settingsSchema, { ...valid, logo_type: 'image' })).toBe(true)
    expect(failedFields(settingsSchema, { ...valid, logo_type: 'svg' })).toContain('logo_type')
  })

  it('caps logo_text at 32 characters, matching SettingRequest', () => {
    expect(ok(settingsSchema, { ...valid, logo_text: 'x'.repeat(32) })).toBe(true)
    expect(failedFields(settingsSchema, { ...valid, logo_text: 'x'.repeat(33) }))
      .toContain('logo_text')
  })

  it('requires a site title and a brand name', () => {
    expect(failedFields(settingsSchema, { ...valid, site_title: '' })).toContain('site_title')
    expect(failedFields(settingsSchema, { ...valid, brand_name: '' })).toContain('brand_name')
  })

  it('lets the optional text fields be omitted entirely', () => {
    expect(ok(settingsSchema, valid)).toBe(true)
  })
})

describe('heroSchema', () => {
  const valid = { heading: 'Hi' }

  it('needs only a heading', () => {
    expect(ok(heroSchema, valid)).toBe(true)
  })

  it('accepts a blank email, which is the common case', () => {
    // `optionalEmail` carries an empty-string branch precisely because without
    // it a left-blank field blocks the whole form from submitting.
    expect(ok(heroSchema, { ...valid, email: '' })).toBe(true)
  })

  it('still rejects a malformed email when one is supplied', () => {
    expect(failedFields(heroSchema, { ...valid, email: 'not-an-email' })).toContain('email')
  })

  it('caps the roles list at twelve', () => {
    const roles = (n) => Array.from({ length: n }, (_, i) => ({ value: `Role ${i}` }))

    expect(ok(heroSchema, { ...valid, roles: roles(12) })).toBe(true)
    expect(ok(heroSchema, { ...valid, roles: roles(13) })).toBe(false)
  })

  it('caps the tech badge orbit at six', () => {
    // Past six the 48px badges start to touch at the mobile orbit radius, which
    // is why Hero::MAX_TECH_BADGES is 6 on the backend too.
    const badges = (n) => Array.from({ length: n }, (_, i) => ({ label: `B${i}` }))

    expect(ok(heroSchema, { ...valid, tech_badges: badges(6) })).toBe(true)
    expect(ok(heroSchema, { ...valid, tech_badges: badges(7) })).toBe(false)
  })

  it('requires a badge label but allows a null icon slug', () => {
    // A badge with no matching brand mark renders as text, so null is valid.
    expect(ok(heroSchema, { ...valid, tech_badges: [{ label: 'Redis', icon_slug: null }] }))
      .toBe(true)
    expect(failedFields(heroSchema, { ...valid, tech_badges: [{ label: '' }] }))
      .toContain('tech_badges.0.label')
  })

  it('requires both halves of a social link row', () => {
    expect(ok(heroSchema, { ...valid, social_links: [{ platform: 'github', url: 'https://x' }] }))
      .toBe(true)
    expect(failedFields(heroSchema, { ...valid, social_links: [{ platform: '', url: 'https://x' }] }))
      .toContain('social_links.0.platform')
    expect(failedFields(heroSchema, { ...valid, social_links: [{ platform: 'github', url: '' }] }))
      .toContain('social_links.0.url')
  })

  it('does not require a social url to be an absolute http url', () => {
    // The email platform legitimately stores a bare address here; the backend's
    // per-platform rule is the authority, and duplicating it client-side would
    // reject a valid email row.
    expect(ok(heroSchema, { ...valid, social_links: [{ platform: 'email', url: 'me@x.com' }] }))
      .toBe(true)
  })

  it('caps availability_label at 120 characters', () => {
    expect(ok(heroSchema, { ...valid, availability_label: 'x'.repeat(120) })).toBe(true)
    expect(ok(heroSchema, { ...valid, availability_label: 'x'.repeat(121) })).toBe(false)
  })
})

describe('aboutSchema', () => {
  it('requires the first bio paragraph only', () => {
    expect(ok(aboutSchema, { bio_paragraph_1: 'Hello' })).toBe(true)
    expect(failedFields(aboutSchema, { bio_paragraph_1: '' })).toContain('bio_paragraph_1')
  })

  it('accepts entirely blank stat rows', () => {
    // The About form ships four empty placeholder rows so there is something to
    // type into. Requiring min(1) on label/value made those default rows block
    // the whole form — they are stripped before submit instead.
    expect(ok(aboutSchema, {
      bio_paragraph_1: 'Hello',
      stats: [
        { label: '', value: '' },
        { label: '', value: '' },
        { label: '', value: '' },
        { label: '', value: '' },
      ],
    })).toBe(true)
  })

  it('accepts a partially filled stat row', () => {
    expect(ok(aboutSchema, {
      bio_paragraph_1: 'Hello',
      stats: [{ label: 'Years', value: '' }],
    })).toBe(true)
  })
})

describe('projectSchema', () => {
  const valid = { title: 'Site', description: 'A site', order: 0 }

  it('accepts the required set', () => {
    expect(ok(projectSchema, valid)).toBe(true)
  })

  it('requires a title and a description', () => {
    expect(failedFields(projectSchema, { ...valid, title: '' })).toContain('title')
    expect(failedFields(projectSchema, { ...valid, description: '' })).toContain('description')
  })

  it('accepts blank github and live urls', () => {
    expect(ok(projectSchema, { ...valid, github_url: '', live_url: '' })).toBe(true)
  })

  it('rejects a malformed url when one is supplied', () => {
    expect(failedFields(projectSchema, { ...valid, github_url: 'github.com/me' }))
      .toContain('github_url')
  })

  it('accepts tags as either a comma-separated string or an array', () => {
    // The input is text and is split on submit, but an edit form repopulates
    // from the API, which returns an array.
    expect(ok(projectSchema, { ...valid, tags: 'php, laravel' })).toBe(true)
    expect(ok(projectSchema, { ...valid, tags: ['php', 'laravel'] })).toBe(true)
  })

  it('requires order to be a non-negative integer', () => {
    expect(failedFields(projectSchema, { ...valid, order: -1 })).toContain('order')
    expect(failedFields(projectSchema, { ...valid, order: 1.5 })).toContain('order')
    expect(failedFields(projectSchema, { ...valid, order: '0' })).toContain('order')
  })
})

describe('timelineItemSchema', () => {
  const valid = {
    type: 'experience',
    institute_or_company: 'Acme',
    subject_or_role: 'Engineer',
    start_year: '2020',
    order: 0,
  }

  it('accepts both variants', () => {
    expect(ok(timelineItemSchema, valid)).toBe(true)
    expect(ok(timelineItemSchema, { ...valid, type: 'education' })).toBe(true)
  })

  it('rejects an unknown type', () => {
    expect(failedFields(timelineItemSchema, { ...valid, type: 'volunteering' })).toContain('type')
  })

  it('treats years as strings so "Present" is expressible', () => {
    expect(ok(timelineItemSchema, { ...valid, end_year: 'Present' })).toBe(true)
  })

  it('allows a missing end year', () => {
    expect(ok(timelineItemSchema, valid)).toBe(true)
  })

  it('requires a four-character start year', () => {
    expect(failedFields(timelineItemSchema, { ...valid, start_year: '20' }))
      .toContain('start_year')
  })
})

describe('skillSchema / apiShowcaseSchema / testimonialSchema', () => {
  it('requires a skill name but allows no icon slug', () => {
    expect(ok(skillSchema, { name: 'PHP' })).toBe(true)
    expect(ok(skillSchema, { name: 'PHP', icon_slug: null })).toBe(true)
    expect(failedFields(skillSchema, { name: '' })).toContain('name')
  })

  it('requires an api showcase title but neither icon field', () => {
    // A showcase with no mark falls back to a plug icon, so both are optional.
    expect(ok(apiShowcaseSchema, { title: 'Webhooks', order: 0 })).toBe(true)
    expect(failedFields(apiShowcaseSchema, { title: '', order: 0 })).toContain('title')
  })

  it('requires a testimonial quote and author name', () => {
    expect(ok(testimonialSchema, { quote: 'Great', author_name: 'Sam', order: 0 })).toBe(true)
    expect(failedFields(testimonialSchema, { quote: '', author_name: 'Sam', order: 0 }))
      .toContain('quote')
    expect(failedFields(testimonialSchema, { quote: 'Great', author_name: '', order: 0 }))
      .toContain('author_name')
  })
})

describe('contactInfoSchema', () => {
  it('accepts an entirely empty record', () => {
    // Every field is optional and a blank one must not block Save.
    expect(ok(contactInfoSchema, {})).toBe(true)
    expect(ok(contactInfoSchema, { email: '', calendly_link: '' })).toBe(true)
  })

  it('rejects a malformed email or calendly link when supplied', () => {
    expect(failedFields(contactInfoSchema, { email: 'nope' })).toContain('email')
    expect(failedFields(contactInfoSchema, { calendly_link: 'calendly.com/me' }))
      .toContain('calendly_link')
  })
})

describe('meetingRequestSchema', () => {
  it('requires a name and a valid email', () => {
    expect(ok(meetingRequestSchema, { name: 'Sam', email: 'sam@example.com' })).toBe(true)
    expect(failedFields(meetingRequestSchema, { name: '', email: 'sam@example.com' }))
      .toContain('name')
    expect(failedFields(meetingRequestSchema, { name: 'Sam', email: 'nope' })).toContain('email')
  })

  it('keeps admin_reply and admin_note optional', () => {
    expect(ok(meetingRequestSchema, { name: 'Sam', email: 'sam@example.com', admin_note: '' }))
      .toBe(true)
  })
})
