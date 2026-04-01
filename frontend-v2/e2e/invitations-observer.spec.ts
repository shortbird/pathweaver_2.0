import { test, expect } from '@playwright/test';
import { loginAsStudent, loginAsObserver, navigateTo } from './helpers';

test.describe('Observer Invitations', () => {
  test.skip('INV1: Student can access observer invite flow (requires interaction)', async ({ page }) => {
    // Skipped: observer invite flow requires specific profile interaction
  });

  test.skip('INV2: Observer invite form shows email field (requires interaction)', async ({ page }) => {
    // Skipped: requires navigating into invite form
  });

  test.skip('INV3: Invalid email shows validation error (requires interaction)', async ({ page }) => {
    // Skipped: requires form interaction
  });

  test.skip('INV4: Observer can see pending invitations (requires seeded data)', async ({ page }) => {
    // Skipped: requires pending invitation data
  });

  test.skip('INV5: Observer can accept invitation (requires seeded data)', async ({ page }) => {
    // Skipped: requires pending invitation
  });

  test.skip('INV6: Observer can decline invitation (requires seeded data)', async ({ page }) => {
    // Skipped: requires pending invitation
  });

  test.skip('INV7: Student sees observer status after invite (requires seeded data)', async ({ page }) => {
    // Skipped: requires existing observer link
  });

  test.skip('INV8: Student can remove linked observer (requires seeded data)', async ({ page }) => {
    // Skipped: requires existing observer link
  });
});
