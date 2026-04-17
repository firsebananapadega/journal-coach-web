import { test, expect } from '@playwright/test';

// These tests run at iPhone 14 viewport (390×844) with touch enabled
// Auth state is loaded from e2e/.auth/user.json (created by auth.setup.ts)

test.describe('Daily Pulse — Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    // Wait for the page to be fully loaded (greeting should be visible)
    await page.locator('h1').waitFor({ timeout: 10000 });
  });

  test('Pulse card is visible on home page', async ({ page }) => {
    // The pulse card should render before the bubble grid
    const pulseCard = page.locator('[data-testid="pulse-card"], [data-testid="pulse-completed"]');
    await expect(pulseCard).toBeVisible();
  });

  test('Pulse card shows both input fields and submit button', async ({ page }) => {
    // If already completed today, skip this test
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed today');
      return;
    }

    const alive = page.locator('[data-testid="pulse-alive"]');
    const drained = page.locator('[data-testid="pulse-drained"]');
    const submit = page.locator('[data-testid="pulse-submit"]');

    await expect(alive).toBeVisible();
    await expect(drained).toBeVisible();
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled(); // Empty fields = disabled
  });

  test('Can submit a pulse entry', async ({ page }) => {
    // If already completed today, skip
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed today');
      return;
    }

    const alive = page.locator('[data-testid="pulse-alive"]');
    const drained = page.locator('[data-testid="pulse-drained"]');
    const submit = page.locator('[data-testid="pulse-submit"]');

    // Fill in both fields
    await alive.fill('Built something creative today');
    await drained.fill('Long meeting about nothing');

    // Submit should now be enabled
    await expect(submit).toBeEnabled();
    await submit.click();

    // Wait for transition to completed state
    const completedCard = page.locator('[data-testid="pulse-completed"]');
    await expect(completedCard).toBeVisible({ timeout: 10000 });

    // Input fields should be gone
    await expect(alive).not.toBeVisible();
    await expect(drained).not.toBeVisible();
  });

  test('Completed pulse expands to show answers', async ({ page }) => {
    const completedCard = page.locator('[data-testid="pulse-completed"]');

    // If no completed pulse, submit one first
    if (!(await completedCard.isVisible({ timeout: 2000 }).catch(() => false))) {
      const alive = page.locator('[data-testid="pulse-alive"]');
      const drained = page.locator('[data-testid="pulse-drained"]');
      await alive.fill('Expansion test alive moment');
      await drained.fill('Expansion test drained moment');
      await page.locator('[data-testid="pulse-submit"]').click();
      await expect(completedCard).toBeVisible({ timeout: 10000 });
    }

    // Click to expand
    await completedCard.click();

    // Should show the alive and drained labels
    await expect(page.locator('[data-testid="pulse-completed"]')).toContainText(/Alive|Vivo/i);
    await expect(page.locator('[data-testid="pulse-completed"]')).toContainText(/Drained|Agotado/i);
  });

  test('Pulse card fits within mobile viewport', async ({ page }) => {
    const pulseCard = page.locator('[data-testid="pulse-card"], [data-testid="pulse-completed"]');
    await expect(pulseCard).toBeVisible();

    const box = await pulseCard.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      // Card should be within the 390px viewport width (with some padding)
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      // Card should be visible (not cut off at the top)
      expect(box.y).toBeGreaterThanOrEqual(0);
    }
  });

  test('Submit button is not disabled when at least one field has content', async ({ page }) => {
    // If already completed today, skip
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed today');
      return;
    }

    const alive = page.locator('[data-testid="pulse-alive"]');
    const submit = page.locator('[data-testid="pulse-submit"]');

    // Fill only alive field
    await alive.fill('Just one answer');
    await expect(submit).toBeEnabled();
  });
});
