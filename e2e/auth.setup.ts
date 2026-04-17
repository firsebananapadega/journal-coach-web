import { test as setup } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const TEST_EMAIL = 'pulse-test@journalcoach.test';
const TEST_PASSWORD = 'TestPulse2026!';

// Load env vars from .env.local (Playwright doesn't do this automatically)
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

setup('authenticate test user', async ({ page }) => {
  // Try signing in — if user exists this works directly
  await page.goto('/auth/sign-in');
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Wait for either redirect to /home or /auth/onboarding (success) or error text (failure)
  const result = await Promise.race([
    page.waitForURL('**/home', { timeout: 10000 }).then(() => 'home' as const),
    page.waitForURL('**/onboarding', { timeout: 10000 }).then(() => 'onboarding' as const),
    page.locator('.text-error').waitFor({ timeout: 10000 }).then(() => 'error' as const),
  ]);

  if (result === 'error') {
    // User doesn't exist — create via Supabase admin API
    // Uses the service role key from .env.local
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'Cannot create test user: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local'
      );
    }

    // Create user via admin API (skips email confirmation)
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Failed to create test user: ${createRes.status} ${body}`);
    }

    // Now sign in again
    await page.goto('/auth/sign-in');
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').click();

    const signInResult = await Promise.race([
      page.waitForURL('**/home', { timeout: 10000 }).then(() => 'home' as const),
      page.waitForURL('**/onboarding', { timeout: 10000 }).then(() => 'onboarding' as const),
    ]);

    // If redirected to onboarding, complete minimal onboarding
    if (signInResult === 'onboarding') {
      await completeOnboarding(page);
    }
  } else if (result === 'onboarding') {
    await completeOnboarding(page);
  }

  // Should now be on /home — save auth state
  await page.waitForURL('**/home', { timeout: 10000 });
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});

async function completeOnboarding(page: import('@playwright/test').Page) {
  // Step 1: Name
  const nameInput = page.locator('input[placeholder="Your name"]');
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await nameInput.fill('Test User');
    // Click next/continue button
    const nextBtn = page.getByRole('button', { name: /next|continue|siguiente/i });
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click();
    }
  }

  // Wait briefly for each step and skip through
  await page.waitForTimeout(500);

  // Try to skip through remaining onboarding steps by clicking next/skip/finish buttons
  for (let i = 0; i < 5; i++) {
    const skipBtn = page.getByRole('button', { name: /skip|next|finish|done|start|comenzar|siguiente|listo/i });
    if (await skipBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    } else {
      break;
    }
  }
}
