import { test, expect } from '@playwright/test';

// These tests run at iPhone 14 viewport (390×844) with touch enabled
// Auth state is loaded from e2e/.auth/user.json (created by auth.setup.ts)

test.describe('Daily Pulse — Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await page.locator('h1').waitFor({ timeout: 10000 });
  });

  test('Pulse card is visible on home page', async ({ page }) => {
    const pulseCard = page.locator('[data-testid="pulse-card"], [data-testid="pulse-completed"]');
    await expect(pulseCard).toBeVisible();
  });

  test('Shows first question (alive) with textarea and next button', async ({ page }) => {
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed today');
      return;
    }

    // Should show alive textarea, NOT drained
    const alive = page.locator('[data-testid="pulse-alive"]');
    const drained = page.locator('[data-testid="pulse-drained"]');
    const next = page.locator('[data-testid="pulse-next"]');

    await expect(alive).toBeVisible();
    await expect(drained).not.toBeVisible();
    await expect(next).toBeVisible();
    await expect(next).toBeDisabled(); // Empty = disabled
  });

  test('Can navigate from alive to drained question', async ({ page }) => {
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed today');
      return;
    }

    // Fill alive and click next
    await page.locator('[data-testid="pulse-alive"]').fill('Building something creative');
    await page.locator('[data-testid="pulse-next"]').click();

    // Should now show drained textarea
    const drained = page.locator('[data-testid="pulse-drained"]');
    await expect(drained).toBeVisible();

    // Alive textarea should be gone
    await expect(page.locator('[data-testid="pulse-alive"]')).not.toBeVisible();

    // Submit button should be visible
    await expect(page.locator('[data-testid="pulse-submit"]')).toBeVisible();
  });

  test('Can submit a full pulse entry', async ({ page }) => {
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed today');
      return;
    }

    // Step 1: alive
    await page.locator('[data-testid="pulse-alive"]').fill('Built something creative today');
    await page.locator('[data-testid="pulse-next"]').click();

    // Step 2: drained
    await page.locator('[data-testid="pulse-drained"]').fill('Long meeting about nothing');
    await page.locator('[data-testid="pulse-submit"]').click();

    // Should transition to completed state
    const completedCard = page.locator('[data-testid="pulse-completed"]');
    await expect(completedCard).toBeVisible({ timeout: 10000 });
  });

  test('Completed pulse expands to show answers', async ({ page }) => {
    const completedCard = page.locator('[data-testid="pulse-completed"]');

    if (!(await completedCard.isVisible({ timeout: 2000 }).catch(() => false))) {
      // Submit one first
      await page.locator('[data-testid="pulse-alive"]').fill('Expansion test alive');
      await page.locator('[data-testid="pulse-next"]').click();
      await page.locator('[data-testid="pulse-drained"]').fill('Expansion test drained');
      await page.locator('[data-testid="pulse-submit"]').click();
      await expect(completedCard).toBeVisible({ timeout: 10000 });
    }

    // Click to expand
    await completedCard.click();
    await expect(completedCard).toContainText(/Alive|Vivo/i);
    await expect(completedCard).toContainText(/Drained|Agotado/i);
  });

  test('Pulse card fits within mobile viewport', async ({ page }) => {
    const pulseCard = page.locator('[data-testid="pulse-card"], [data-testid="pulse-completed"]');
    await expect(pulseCard).toBeVisible();

    const box = await pulseCard.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y).toBeGreaterThanOrEqual(0);
    }
  });

  test('Progress dots update when navigating', async ({ page }) => {
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed today');
      return;
    }

    // Should see progress dots (2 bars)
    const progressBars = page.locator('[data-testid="pulse-card"] .rounded-full.h-1');
    await expect(progressBars).toHaveCount(2);

    // Fill and go to step 2
    await page.locator('[data-testid="pulse-alive"]').fill('Test');
    await page.locator('[data-testid="pulse-next"]').click();

    // Both progress dots should now be primary colored
    const activeBars = page.locator('[data-testid="pulse-card"] .bg-primary.h-1');
    await expect(activeBars).toHaveCount(2);
  });
});
