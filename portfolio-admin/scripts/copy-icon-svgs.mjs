/**
 * Copies Simple Icons SVGs into each app's `public/tech-icons/` directory.
 *
 * Only ~100 icons have their path data bundled (see generate-icon-index.mjs);
 * the remaining ~3350 resolve through `iconSvgUrl(slug)` instead. Serving them
 * as static files keeps the JS bundle small while still letting an admin pick
 * any icon in the catalogue and have it render on the public site.
 *
 * Copying the whole set is 15 MB on disk but zero bytes of JS, and Next serves
 * `public/` without processing it. Disk is the cheaper resource here.
 *
 * Usage: node scripts/copy-icon-svgs.mjs
 */
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const SOURCE = resolve(ROOT, 'node_modules', 'simple-icons', 'icons')

const TARGETS = [
  resolve(ROOT, '..', 'portfolio-frontend', 'public', 'tech-icons'),
  resolve(ROOT, '..', 'portfolio-admin', 'public', 'tech-icons'),
]

const svgs = readdirSync(SOURCE).filter((name) => name.endsWith('.svg'))

if (svgs.length === 0) {
  throw new Error(`no SVGs found in ${SOURCE} — is simple-icons installed?`)
}

for (const target of TARGETS) {
  // Rebuild from scratch so icons removed upstream do not linger and keep
  // resolving to a stale brand mark.
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  cpSync(SOURCE, target, { recursive: true })
  console.log(`copied ${svgs.length} SVGs -> ${target}`)
}
