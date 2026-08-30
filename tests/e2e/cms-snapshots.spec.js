const { test, expect } = require('../../audit/node_modules/playwright/test');

test.describe('CMS visual snapshots', () => {
  test('public homepage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: 'test-results/homepage.png',
      fullPage: true,
    });
    await expect(page).toHaveScreenshot('homepage.png', { fullPage: true });
  });

  test('admin hero form', async ({ page }) => {
    test.skip(
      !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD,
      'Admin credentials are required.',
    );
    await page.goto(
      `${process.env.ADMIN_URL || 'http://127.0.0.1:3001'}/login`,
    );
    await page.getByLabel(/email/i).fill(process.env.ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(process.env.ADMIN_PASSWORD);
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await page.goto(
      `${process.env.ADMIN_URL || 'http://127.0.0.1:3001'}/admin/hero`,
    );
    await expect(page).toHaveScreenshot('admin-hero.png', { fullPage: true });
  });
});
