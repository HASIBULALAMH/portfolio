import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The modules deliberately duplicated between portfolio-admin and
 * portfolio-frontend.
 *
 * `tech-icons.js` and `social-platforms.js` are copied verbatim rather than shared
 * through a package, and both files say so in their own header comments ("edit
 * both"). That convention is only safe if something notices when it is broken:
 * if the admin picker offers a slug the public site cannot render, or a platform
 * the public icon renderer has no mark for, the result is a blank circle on the
 * live site with no error anywhere.
 *
 * A byte comparison is the whole test. It is also the cheapest possible guard
 * against the drift, which is why it is here rather than left to code review.
 */
const REPO = path.resolve(import.meta.dirname, '..', '..', '..')

const DUPLICATED = [
  'lib/tech-icons.js',
  'lib/social-platforms.js',
  'lib/simple-icons-index.js',
  'lib/simple-icons-paths.js',
]

const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

describe('modules duplicated across the two Next apps', () => {
  it.each(DUPLICATED)('%s is byte-identical in both apps', (relative) => {
    const admin = path.join(REPO, 'portfolio-admin', relative)
    const frontend = path.join(REPO, 'portfolio-frontend', relative)

    expect(digest(admin)).toBe(digest(frontend))
  })

  it('lib/logo.js exposes the same resolveLogo behaviour in both apps', async () => {
    // Not byte-identical by design — the admin copy has its own header comment —
    // so this compares behaviour on the cases where the two must agree rather
    // than comparing text.
    const [{ resolveLogo: adminResolve }, { resolveLogo: frontendResolve }] = await Promise.all([
      import(path.join(REPO, 'portfolio-admin', 'lib/logo.js')),
      import(path.join(REPO, 'portfolio-frontend', 'lib/logo.js')),
    ])

    const cases = [
      {},
      { logo_type: 'text', logo_text: 'HA', brand_name: 'Hasibul' },
      { logo_type: 'text', logo_text: '', brand_name: 'Hasibul' },
      { logo_type: 'text', logo_text: '', brand_name: '' },
      { logo_type: 'image', logo_path: '/logo.png', logo_alt: 'Acme' },
      { logo_type: 'image', logo_path: '', brand_name: 'Acme' },
      { logo_type: null, logo_path: '/logo.png', brand_name: 'Acme' },
    ]

    for (const settings of cases) {
      expect(adminResolve(settings), JSON.stringify(settings))
        .toEqual(frontendResolve(settings))
    }
  })
})
