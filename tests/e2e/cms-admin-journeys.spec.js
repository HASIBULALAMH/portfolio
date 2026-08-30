const { test, expect } = require('../../audit/node_modules/playwright/test');

test.describe('CMS propagation', () => {
  test.skip(
    !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
    'Admin credentials are required.',
  );

  test('section visibility toggles off and back on publicly', async ({
    page,
  }) => {
    await page.goto(
      `${process.env.ADMIN_URL || 'http://127.0.0.1:3001'}/admin/sections`,
    );
    await page
      .getByRole('button', { name: /toggle|hide/i })
      .first()
      .click();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /about/i })).toBeHidden();
    await page.goto(
      `${process.env.ADMIN_URL || 'http://127.0.0.1:3001'}/admin/sections`,
    );
    await page
      .getByRole('button', { name: /toggle|show/i })
      .first()
      .click();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /about/i })).toBeVisible();
  });

  test('edited hero content renders publicly', async ({ page }) => {
    await page.goto(
      `${process.env.ADMIN_URL || 'http://127.0.0.1:3001'}/admin/hero`,
    );
    await page.getByLabel(/heading/i).fill('E2E Hero Heading');
    await page.getByRole('button', { name: /save|update/i }).click();
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'E2E Hero Heading' }),
    ).toBeVisible();
  });
});
