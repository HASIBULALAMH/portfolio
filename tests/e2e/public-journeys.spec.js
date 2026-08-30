const { test, expect } = require('../../audit/node_modules/playwright/test');

const adminUrl = process.env.ADMIN_URL || 'http://127.0.0.1:3001';
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

test.describe('public submission journeys', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !adminEmail || !adminPassword,
      'Set ADMIN_EMAIL and ADMIN_PASSWORD for the full journey.',
    );
    await page.goto('/');
  });

  test('contact submission reaches the admin inbox and can be replied to', async ({
    page,
    browser,
  }) => {
    await page.getByLabel(/name/i).first().fill('E2E Contact Visitor');
    await page
      .getByLabel(/email/i)
      .first()
      .fill(`e2e-contact-${Date.now()}@example.test`);
    await page
      .getByLabel(/message/i)
      .first()
      .fill('E2E contact message');
    await page
      .getByRole('button', { name: /send|submit/i })
      .first()
      .click();
    await expect(page.getByText(/thanks|sent/i).first()).toBeVisible();

    const admin = await browser.newPage({ baseURL: adminUrl });
    await admin.goto('/login');
    await admin.getByLabel(/email/i).fill(adminEmail);
    await admin.getByLabel(/password/i).fill(adminPassword);
    await admin.getByRole('button', { name: /login|sign in/i }).click();
    await admin.goto('/admin/messages');
    await expect(admin.getByText('E2E contact message')).toBeVisible();
    await admin.close();
  });

  test('meeting submission reaches the admin inbox', async ({
    page,
    browser,
  }) => {
    await page
      .getByRole('link', { name: /meeting|book|contact/i })
      .first()
      .click();
    await page.getByLabel(/name/i).first().fill('E2E Meeting Visitor');
    await page
      .getByLabel(/email/i)
      .first()
      .fill(`e2e-meeting-${Date.now()}@example.test`);
    await page
      .getByLabel(/message/i)
      .first()
      .fill('E2E meeting request');
    await page
      .getByRole('button', { name: /send|submit/i })
      .first()
      .click();
    await expect(
      page.getByText(/submitted|sent|thanks/i).first(),
    ).toBeVisible();

    const admin = await browser.newPage({ baseURL: adminUrl });
    await admin.goto('/login');
    await admin.getByLabel(/email/i).fill(adminEmail);
    await admin.getByLabel(/password/i).fill(adminPassword);
    await admin.getByRole('button', { name: /login|sign in/i }).click();
    await admin.goto('/admin/meeting-requests');
    await expect(admin.getByText('E2E meeting request')).toBeVisible();
    await admin.close();
  });
});
