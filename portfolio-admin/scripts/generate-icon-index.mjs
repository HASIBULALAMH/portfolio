/**
 * Generates the shared Simple Icons index used by the admin picker and both
 * public sections.
 *
 * Why generate instead of importing `simple-icons` at runtime:
 * the package ships 3453 icons whose SVG path data totals ~4.6 MB raw
 * (~1.9 MB gzipped). Importing the barrel pulls all of it into the client
 * bundle. Slug + title + brand colour alone is ~112 KB raw / ~43 KB gzipped,
 * which is affordable and is all the search needs.
 *
 * So the output is two files per app:
 *   simple-icons-index.js  — every icon as [slug, title, hex]. Drives search.
 *   simple-icons-paths.js  — SVG path data, but only for a curated set of
 *                            technologies a portfolio realistically lists.
 *
 * Anything outside the curated set still resolves through the index and
 * renders from `/api/tech-icon/<slug>.svg`-style lazy loading in the picker,
 * so search covers all 3453 while the bundle stays small.
 *
 * Usage: node scripts/generate-icon-index.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as simpleIcons from 'simple-icons'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/**
 * Technologies whose path data is inlined so the public site can render them
 * without a network round trip. Chosen to cover a web-developer portfolio's
 * realistic stack; everything else lazy-loads in the admin picker only.
 *
 * Every slug here is verified present in the installed simple-icons version —
 * the script warns loudly if one goes missing after an upgrade. Note that
 * several well-known marks (AWS, Heroku, Slack, VS Code, Playwright, Pest)
 * are deliberately absent from this list because Simple Icons has removed
 * them over trademark/licensing policy; they resolve to the generic fallback.
 */
const PRELOAD = new Set([
  'php', 'laravel', 'livewire', 'symfony', 'composer',
  'javascript', 'typescript', 'nodedotjs', 'express', 'deno', 'bun',
  'react', 'nextdotjs', 'vuedotjs', 'nuxt', 'angular', 'svelte', 'astro',
  'jquery', 'alpinedotjs', 'htmx',
  'html5', 'css', 'sass', 'tailwindcss', 'bootstrap',
  'mysql', 'mariadb', 'postgresql', 'sqlite', 'mongodb', 'redis',
  'elasticsearch', 'supabase', 'firebase', 'prisma',
  'docker', 'kubernetes', 'nginx', 'apache', 'linux', 'ubuntu', 'debian',
  'git', 'github', 'gitlab', 'bitbucket', 'githubactions',
  'python', 'django', 'flask', 'fastapi', 'go', 'rust', 'ruby',
  'rubyonrails', 'swift', 'kotlin', 'flutter', 'dart', 'openjdk',
  'graphql', 'socketdotio', 'jsonwebtokens', 'openapiinitiative', 'swagger',
  'googlecloud', 'cloudflare', 'vercel', 'netlify',
  'digitalocean', 'render',
  'jest', 'vitest', 'cypress', 'phpstorm',
  'npm', 'yarn', 'pnpm', 'vite', 'webpack', 'esbuild', 'babel',
  'figma', 'postman', 'insomnia', 'stripe', 'paypal',
  'jira', 'trello', 'notion', 'wordpress', 'shopify',
  'sublimetext', 'eslint', 'prettier',
  'rabbitmq', 'apachekafka', 'natsdotio', 'sentry', 'grafana', 'prometheus',
])

const all = Object.values(simpleIcons)
  .filter((icon) => icon && typeof icon.slug === 'string' && typeof icon.path === 'string')
  .sort((a, b) => a.slug.localeCompare(b.slug))

if (all.length === 0) {
  throw new Error('simple-icons exported no usable icons — aborting rather than writing an empty index')
}

const index = all.map((icon) => [icon.slug, icon.title, icon.hex])

const paths = {}
for (const icon of all) {
  if (PRELOAD.has(icon.slug)) paths[icon.slug] = icon.path
}

const missing = [...PRELOAD].filter((slug) => !(slug in paths)).sort()

const banner = (extra) => `/**
 * GENERATED FILE — do not edit by hand.
 * Produced by scripts/generate-icon-index.mjs from simple-icons.
 * Re-run that script after bumping the simple-icons dependency.
 *
${extra}
 */
`

const indexFile =
  banner(` * ${index.length} icons as [slug, title, hex]. Powers fuzzy search in the
 * admin's TechIconPicker and brand-colour lookup on the public site.`) +
  `export const ICON_INDEX = ${JSON.stringify(index)}\n`

const pathsFile =
  banner(` * SVG path data for ${Object.keys(paths).length} preloaded technologies.
 * Icons outside this set resolve their path lazily; see tech-icon.jsx.`) +
  `export const ICON_PATHS = ${JSON.stringify(paths)}\n`

const targets = [
  resolve(ROOT, '..', 'portfolio-frontend', 'lib'),
  resolve(ROOT, '..', 'portfolio-admin', 'lib'),
]

for (const dir of targets) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'simple-icons-index.js'), indexFile)
  writeFileSync(resolve(dir, 'simple-icons-paths.js'), pathsFile)
  console.log(`wrote ${dir}/simple-icons-index.js  (${(indexFile.length / 1024).toFixed(0)} KB)`)
  console.log(`wrote ${dir}/simple-icons-paths.js  (${(pathsFile.length / 1024).toFixed(0)} KB)`)
}

console.log(`\n${index.length} icons indexed, ${Object.keys(paths).length} paths preloaded`)
if (missing.length) {
  console.log(`WARNING: ${missing.length} preload slugs not found in simple-icons: ${missing.join(', ')}`)
}
