import { test, expect } from '@playwright/test';

// These tests run at iPhone 14 viewport (390×844) with touch enabled
// Auth state is loaded from e2e/.auth/user.json (created by auth.setup.ts)

// The pulse is time-aware: morning (<18:00) = 1 question, evening (>=18:00) = 2 questions
// Tests use data-testid="pulse-q0" for first question, "pulse-q1" for second

test.describe('Daily Pulse — Mobile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/home');
    await page.locator('h1').waitFor({ timeout: 10000 });
  });

  test('Pulse card is visible on home page', async ({ page }) => {
    const pulseCard = page.locator('[data-testid="pulse-card"], [data-testid="pulse-completed"]');
    await expect(pulseCard).toBeVisible();
  });

  test('Shows first question with textarea', async ({ page }) => {
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed for this period');
      return;
    }

    const q0 = page.locator('[data-testid="pulse-q0"]');
    await expect(q0).toBeVisible();
  });

  test('Can submit a pulse entry', async ({ page }) => {
    const completed = page.locator('[data-testid="pulse-completed"]');
    if (await completed.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'Pulse already completed for this period');
      return;
    }

    // Fill first question
    await page.locator('[data-testid="pulse-q0"]').fill('Test answer for first question');

    // Check if there's a next button (evening mode has 2 questions)
    const nextBtn = page.locator('[data-testid="pulse-next"]');

    if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Evening mode: go to Q2
      await nextBtn.click();
      await page.locator('[data-testid="pulse-q1"]').fill('Test answer for second question');
    }

    // Re-locate submit after potential step change
    await page.locator('[data-testid="pulse-submit"]').click();

    // Should transition to completed state
    const completedCard = page.locator('[data-testid="pulse-completed"]');
    await expect(completedCard).toBeVisible({ timeout: 10000 });
  });

  test('Completed pulse expands to show answers', async ({ page }) => {
    const completedCard = page.locator('[data-testid="pulse-completed"]');

    if (!(await completedCard.isVisible({ timeout: 2000 }).catch(() => false))) {
      // Submit a pulse first
      await page.locator('[data-testid="pulse-q0"]').fill('Expansion test Q1');
      const nextBtn = page.locator('[data-testid="pulse-next"]');
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click();
        await page.locator('[data-testid="pulse-q1"]').fill('Expansion test Q2');
      }
      await page.locator('[data-testid="pulse-submit"]').click();
      await expect(completedCard).toBeVisible({ timeout: 10000 });
    }

    // Click to expand
    await completedCard.click();
    // Should show content (the answer text or a label)
    const cardText = await completedCard.textContent();
    expect(cardText?.length).toBeGreaterThan(20); // More than just the header
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
});
