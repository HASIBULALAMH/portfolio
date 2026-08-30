import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest for the public site's pure-logic modules only.
 *
 * `environment: 'node'` on purpose — nothing under test touches the DOM. The
 * three modules covered (logo, social-platforms, tech-icons) are plain functions
 * that decide what the components render, and they are where the render bugs in
 * this project's history actually lived. Component rendering is covered visually
 * by the Playwright snapshot suite in ../tests, which catches the layout
 * regressions a markup snapshot would not.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    // The repo has three node_modules trees; without this Vitest walks them.
    exclude: ['node_modules/**'],
  },
})
