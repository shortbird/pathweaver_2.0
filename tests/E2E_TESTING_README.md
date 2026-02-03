# E2E Testing with Playwright

**Created**: December 19, 2025
**Status**: Active
**Test Environment**: https://optio-dev-frontend.onrender.com

## Overview

End-to-End (E2E) tests validate the entire Optio platform by simulating real user interactions in the browser. Tests run against the live dev environment, ensuring the deployed application works correctly.

## Why E2E Testing?

- **Tests Real User Flows**: Simulates actual user behavior (login, quest enrollment, task completion)
- **Catches Integration Issues**: Verifies frontend + backend + database work together
- **No Local Setup Required**: Tests run against deployed dev environment
- **Automated on Every Push**: GitHub Actions runs tests automatically
- **Cross-Browser Testing**: Tests on Chrome, Firefox, Safari, and mobile devices

## Test Coverage

### Current Tests (4 Test Suites, 24+ Tests)

1. **Authentication** (`auth.spec.js`)
   - Login with valid credentials
   - Login with invalid credentials
   - Logout
   - Protected route access
   - Session persistence

2. **Quest Enrollment** (`quest-enrollment.spec.js`)
   - Browse available quests
   - View quest details
   - Enroll in quest (pick up)
   - Quest personalization
   - Drop quest (set down)

3. **Task Completion** (`task-completion.spec.js`)
   - View quest tasks
   - Submit text evidence
   - Submit link evidence
   - Track completion progress
   - View XP earned

4. **Badge System** (`badge-claiming.spec.js`)
   - View available badges
   - Track badge progress
   - Claim completed badges
   - View diploma
   - Filter badges by pillar

## Setup

### 1. Install Dependencies

```bash
npm install
```

This installs Playwright and all test dependencies.

### 2. Install Playwright Browsers

```bash
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browsers for testing.

## Running Tests

### Run All Tests

```bash
npm test
```

or

```bash
npx playwright test
```

### Run Specific Test Suite

```bash
npx playwright test auth.spec.js
npx playwright test quest-enrollment.spec.js
npx playwright test task-completion.spec.js
npx playwright test badge-claiming.spec.js
```

### Run Tests in UI Mode (Interactive)

```bash
npx playwright test --ui
```

Great for debugging - shows browser, test steps, and allows time travel debugging.

### Run Tests in Headed Mode (See Browser)

```bash
npx playwright test --headed
```

### Run Tests on Specific Browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Debug Mode (Step Through Tests)

```bash
npx playwright test --debug
```

## GitHub Actions (CI/CD)

Tests run automatically on every push to `develop` or `main` branches.

**Workflow**: `.github/workflows/e2e-tests.yml`

**What happens:**
1. Push code to GitHub
2. GitHub Actions triggers workflow
3. Tests run against https://optio-dev-frontend.onrender.com
4. Results posted in PR (if applicable)
5. Test reports and videos saved as artifacts

**View Results:**
- Go to GitHub repository → Actions tab
- Click on latest workflow run
- View test results and download artifacts

## Test Results & Artifacts

After tests run, you can download:
- **HTML Report**: Visual test results with screenshots
- **Videos**: Recordings of failed tests
- **Traces**: Step-by-step debugging info

### View HTML Report Locally

```bash
npx playwright show-report
```

## Writing New Tests

### Test Structure

```javascript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    // Navigate to page
    await page.goto('/some-page');

    // Interact with elements
    await page.click('button:has-text("Click Me")');
    await page.fill('input[type="text"]', 'Some value');

    // Assert expectations
    await expect(page.locator('.result')).toBeVisible();
    await expect(page).toHaveURL(/success/);
  });
});
```

### Useful Playwright APIs

**Navigation:**
```javascript
await page.goto('/path');
await page.waitForURL(/pattern/);
```

**Finding Elements:**
```javascript
page.locator('button')  // CSS selector
page.locator('text=Login')  // Text content
page.locator('button:has-text("Login")')  // Combined
page.locator('[data-testid="my-element"]')  // Test ID
```

**Interactions:**
```javascript
await page.click('button');
await page.fill('input', 'value');
await page.check('checkbox');
await page.selectOption('select', 'option');
```

**Assertions:**
```javascript
await expect(page.locator('.element')).toBeVisible();
await expect(page.locator('.element')).toHaveText('Expected');
await expect(page).toHaveURL(/pattern/);
```

## Best Practices

### 1. Use Resilient Selectors

✅ **Good:**
```javascript
page.locator('[data-testid="login-button"]')
page.locator('button:has-text("Login")')
```

❌ **Avoid:**
```javascript
page.locator('.btn-primary-md')  // Fragile CSS classes
page.locator('div > div > button')  // Fragile structure
```

### 2. Wait for Elements Properly

✅ **Good:**
```javascript
await expect(page.locator('.result')).toBeVisible();
await page.waitForURL(/success/);
```

❌ **Avoid:**
```javascript
await page.waitForTimeout(5000);  // Arbitrary waits
```

### 3. Test User Flows, Not Implementation

✅ **Good:**
```javascript
test('should complete quest enrollment', async ({ page }) => {
  // Test the entire user journey
});
```

❌ **Avoid:**
```javascript
test('should call POST /api/quests endpoint', async ({ page }) => {
  // Too implementation-focused
});
```

### 4. Keep Tests Independent

Each test should:
- Set up its own data (login, navigate, etc.)
- Not depend on other tests running first
- Clean up after itself (if needed)

### 5. Add data-testid Attributes

In your React components, add stable test IDs:

```jsx
<button data-testid="submit-evidence">Submit</button>
<div data-testid="quest-card">...</div>
```

Then use them in tests:
```javascript
await page.click('[data-testid="submit-evidence"]');
```

## Troubleshooting

### Tests Failing Locally But Passing on CI

- Different browser versions
- Network timing differences
- Try running in headed mode: `npx playwright test --headed`

### "Timeout" Errors

- Element not found within timeout
- Check selector is correct
- Increase timeout for slow operations:
  ```javascript
  await expect(element).toBeVisible({ timeout: 10000 });
  ```

### "Element is not clickable" Errors

- Element might be covered by another element
- Wait for animations to complete
- Use `page.locator().click({ force: true })` as last resort

### Debugging Failed Tests

1. Run in debug mode: `npx playwright test --debug`
2. View trace: `npx playwright show-trace trace.zip`
3. Check screenshots in `test-results/`
4. View videos in `test-results/`

## Configuration

**Config File**: `playwright.config.js`

Key settings:
- `baseURL`: Test environment URL
- `timeout`: Max time for test
- `retries`: Retry failed tests (CI only)
- `projects`: Browser configurations

## Adding Test Credentials

For tests to work, you need a test account:

**Test Account:**
- Email: `test@optioeducation.com`
- Password: `TestPassword123!`

Make sure this account exists in your dev database.

## Next Steps

### Expand Test Coverage

1. **Parent Features**: Parent dashboard, dependent management
2. **Observer Features**: Observer invitations, student viewing
3. **Admin Features**: User management, quest creation
4. **Advisor Features**: Check-ins, student tracking
5. **Social Features**: Friendships, connections

### Add Visual Regression Testing

Use Playwright's screenshot comparison:

```javascript
await expect(page).toHaveScreenshot('homepage.png');
```

### Add API Testing

Test API endpoints directly:

```javascript
const response = await page.request.post('/api/quests');
expect(response.status()).toBe(200);
```

## Resources

- **Playwright Docs**: https://playwright.dev
- **Best Practices**: https://playwright.dev/docs/best-practices
- **Debugging Guide**: https://playwright.dev/docs/debug
- **Selectors Guide**: https://playwright.dev/docs/selectors

## Questions?

Check existing test files for examples or refer to Playwright documentation.

Happy testing! 🎭
