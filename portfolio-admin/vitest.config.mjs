import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest for the admin panel's pure-logic modules.
 *
 * Scope is the zod form schemas and the modules duplicated from
 * portfolio-frontend. React components are excluded on purpose: every admin form
 * bug in this project's history was either a validation rule that blocked a
 * legitimately-blank field or a layout/containing-block problem, and neither is
 * something a shallow component render would surface. The first is covered here,
 * the second by the Playwright suite in ../tests.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    exclude: ['node_modules/**'],
  },
})
