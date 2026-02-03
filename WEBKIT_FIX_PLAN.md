# WebKit E2E Test Fix Plan

## Problem Summary

**Status**: 13/19 tests failing on WebKit (all auth tests pass, all quest/task tests fail)

**Primary Issue**: Quest cards (`.bg-white.rounded-xl.cursor-pointer`) not visible in WebKit
- Elements either don't render OR render but aren't "visible" per Playwright
- Auth tests pass, proving cookies/authentication work
- Same selectors work in Chromium and Firefox

**Secondary Issue**: Occasional login redirect timeout (1 test)
- Suggests timing/race condition issue

## Root Cause Analysis

### Likely Causes (in order of probability)

1. **WebKit API timing differences**
   - WebKit may handle async requests differently than Chromium/Firefox
   - `waitForLoadState('networkidle')` may resolve before quest API completes
   - React state updates may take longer to trigger re-renders

2. **CSS/Layout rendering differences**
   - Elements may exist in DOM but not be "visible" (Playwright checks offsetWidth/Height, opacity, display, visibility)
   - WebKit may apply CSS transitions/animations differently
   - `group` class with hover effects may cause initial render issues

3. **Cookie/CORS timing**
   - While auth works, subsequent API calls might have cookie timing issues
   - CSRF token may not be set in time for quest API calls

4. **React hydration timing**
   - Server-side rendering or initial React mount may behave differently in WebKit
   - `useEffect` hooks may fire in different order

## Fix Strategy

### Phase 1: Diagnostic Tests (DONE)
- ✅ Created `webkit-diagnostics.spec.js` with extensive logging
- ✅ Added network request monitoring
- ✅ Added screenshot capture at key points

### Phase 2: Implement Robust Wait Strategies

#### Fix 1: Wait for API response instead of networkidle
```javascript
// OLD (unreliable in WebKit)
await page.waitForLoadState('networkidle');

// NEW (wait for actual API response)
await page.waitForResponse(response =>
  response.url().includes('/api/quests') && response.status() === 200,
  { timeout: 15000 }
);
```

#### Fix 2: Wait for quest cards to exist before checking visibility
```javascript
// OLD (fails if cards haven't rendered yet)
const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
await expect(questCards.first()).toBeVisible({ timeout: 15000 });

// NEW (wait for at least one card to exist first)
await page.waitForSelector('.bg-white.rounded-xl.cursor-pointer', {
  state: 'attached',
  timeout: 20000
});
const questCards = page.locator('.bg-white.rounded-xl.cursor-pointer');
await expect(questCards.first()).toBeVisible({ timeout: 5000 });
```

#### Fix 3: Add explicit wait for React render
```javascript
// After navigation, wait for React to finish rendering
await page.waitForFunction(() => {
  // Check if quest cards exist in DOM
  const cards = document.querySelectorAll('.bg-white.rounded-xl.cursor-pointer');
  return cards.length > 0;
}, { timeout: 20000 });
```

#### Fix 4: Use data-testid instead of CSS class selectors (long-term fix)
```jsx
// QuestCardSimple.jsx
<div
  data-testid="quest-card"
  className="group bg-white rounded-xl overflow-hidden cursor-pointer..."
>
```

```javascript
// Tests
await page.waitForSelector('[data-testid="quest-card"]', { state: 'visible', timeout: 20000 });
```

### Phase 3: Frontend Code Fixes

#### Fix 5: Add loading indicator for quest data
```javascript
// QuestBadgeHub.jsx - Make sure loading state is accurate
// Check if there's a race condition where questsLoading becomes false before render
```

#### Fix 6: Ensure consistent CSRF token handling
```javascript
// Verify CSRF token is set before first API call
// May need to fetch /api/auth/csrf before navigating to quest-hub
```

### Phase 4: Test Configuration

#### Fix 7: Increase WebKit-specific timeouts
```javascript
// playwright.config.js
use: {
  browserName: 'webkit',
  timeout: 30000, // Increase from default
  navigationTimeout: 20000,
  actionTimeout: 15000
}
```

#### Fix 8: Add retry logic for flaky tests
```javascript
test.describe.configure({ retries: 2 }); // For WebKit-specific flakiness
```

## Implementation Order

### Immediate (Quick Wins)
1. ✅ Create diagnostic tests
2. Update all quest-related tests to use `waitForResponse` instead of `waitForLoadState('networkidle')`
3. Add explicit `waitForSelector` before visibility checks
4. Increase timeouts for WebKit

### Short-term (Robust Solution)
1. Add `data-testid` attributes to QuestCardSimple
2. Update tests to use test IDs
3. Add loading state verification in tests

### Long-term (Architecture)
1. Implement test helpers for common patterns
2. Add E2E test debugging utilities
3. Consider WebKit-specific test configuration

## Success Criteria

- All 19 E2E tests pass on WebKit
- No flaky failures (tests pass consistently on multiple runs)
- Test execution time remains reasonable (< 6 minutes total)

## Rollback Plan

If fixes cause regressions:
1. Revert to original test files
2. Mark WebKit tests as skipped temporarily
3. Focus on Chromium/Firefox until root cause identified

## Testing Plan

1. Run diagnostic tests locally with `npx playwright test webkit-diagnostics.spec.js --project=webkit`
2. Analyze screenshots and logs to confirm root cause
3. Apply fixes one at a time
4. Run full test suite after each fix: `npx playwright test --project=webkit`
5. Verify fixes don't break Chromium/Firefox
6. Push to develop branch for GitHub Actions verification