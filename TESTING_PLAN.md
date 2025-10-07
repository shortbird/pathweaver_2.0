# Optio Platform - Testing Plan

## Overview
Comprehensive testing strategy for post-cleanup validation and ongoing frontend updates.

---

## 1. Pre-Update Testing Checklist

### Critical User Flows
- [ ] User registration with email verification
- [ ] User login with valid credentials
- [ ] User logout and session clearing
- [ ] Password reset flow
- [ ] Profile update and avatar upload

### Subscription & Payment Flows
- [ ] Free tier → Supported tier upgrade via Stripe
- [ ] Free tier → Academy tier upgrade via Stripe
- [ ] Subscription tier displays correctly immediately after payment (NO REFRESH NEEDED)
- [ ] Subscription cancellation at period end
- [ ] Billing portal access
- [ ] Promo code application during checkout
- [ ] Stripe webhook processing (check logs)

### Quest System
- [ ] Browse quests in Quest Hub
- [ ] Filter quests by pillar/difficulty
- [ ] Infinite scroll loading
- [ ] Quest detail page loads correctly
- [ ] Start/enroll in quest
- [ ] Complete quest tasks with evidence
- [ ] Submit text, image, video, document evidence
- [ ] Quest completion bonus (50% XP) calculation
- [ ] Quest abandonment
- [ ] Custom quest submission for approval

### Community Features (Paid Tier)
- [ ] Send friend request
- [ ] Accept/reject friend request
- [ ] View friends list (NO DUPLICATES)
- [ ] Send collaboration invite
- [ ] Accept collaboration invite
- [ ] View collaboration history

### Admin Features
- [ ] View all users (pagination working)
- [ ] Edit user subscription tier
- [ ] Create/edit/delete quests
- [ ] Approve/reject quest submissions
- [ ] View analytics dashboard
- [ ] Refresh quest images from Pexels API

### Portfolio/Diploma (CORE)
- [ ] Public portfolio accessible via /diploma/:userId
- [ ] Portfolio accessible via /portfolio/:slug
- [ ] Completed quests display with evidence
- [ ] XP radar chart shows correct pillar breakdown
- [ ] SEO meta tags present
- [ ] Sharing works on social media

---

## 2. Post-Update Testing Checklist

### API Integration
- [ ] All API endpoints return expected response format
- [ ] Error responses use consistent structure
- [ ] CSRF tokens included in all POST/PUT/DELETE requests
- [ ] 401 errors trigger logout flow
- [ ] 429 rate limit errors show friendly message

### React Query & State Management
- [ ] React Query cache invalidation works after mutations
- [ ] No duplicate data sources (manual state + React Query)
- [ ] Loading states display correctly
- [ ] Error states display correctly
- [ ] Refetch intervals work as expected (30s for dashboard)

### Bug Fixes Verification
- [ ] **CRITICAL**: Subscription tier updates immediately after Stripe payment
- [ ] FriendsPage shows no duplicate friends or requests
- [ ] No race conditions when accepting friend requests
- [ ] Quest completion updates dashboard immediately
- [ ] No window event listeners causing memory leaks

### Code Quality
- [ ] No console.log statements in browser console (production build)
- [ ] No console.warn except intentional warnings
- [ ] No console.error except caught errors
- [ ] No React key warnings
- [ ] No unused imports or variables (build warnings)

---

## 3. Performance Testing

### Page Load Times (First Load)
- [ ] Home page: < 2s
- [ ] Quest Hub: < 3s (with initial quests)
- [ ] Dashboard: < 2s
- [ ] Quest Detail: < 2s
- [ ] Admin Dashboard: < 3s

### Memory Leak Detection
- [ ] Open DevTools → Performance → Record
- [ ] Navigate between pages 10 times
- [ ] Check memory usage doesn't continuously grow
- [ ] Verify event listeners are cleaned up (useEffect cleanup)
- [ ] Check React Query cache size is reasonable

### API Performance
- [ ] No N+1 query issues (check backend logs)
- [ ] Database indexes applied correctly
- [ ] Quest listing endpoint: < 500ms
- [ ] Dashboard endpoint: < 300ms
- [ ] Task completion endpoint: < 400ms

### Bundle Size
- [ ] Run `npm run build` and check dist/ size
- [ ] Main bundle: < 500KB gzipped
- [ ] Vendor bundle: < 300KB gzipped
- [ ] Total bundle: < 1MB gzipped

---

## 4. Security Testing

### Authentication & Authorization
- [ ] httpOnly cookies set correctly (`document.cookie` shows no JWT)
- [ ] CSRF protection active on all state-changing requests
- [ ] JWT refresh happens automatically before expiration
- [ ] Expired tokens trigger re-login
- [ ] Protected routes redirect to login when unauthenticated

### RLS & Database Security
- [ ] Users can only access their own data
- [ ] Admin-only endpoints return 403 for non-admins
- [ ] Friend requests can't be spoofed (user_id validation)
- [ ] Quest submissions properly attributed to correct user
- [ ] Evidence files scoped to uploader

### Input Validation
- [ ] XSS prevention: HTML entities escaped in user content
- [ ] SQL injection prevention: All queries parameterized
- [ ] File upload validation: Type and size limits enforced
- [ ] Email validation on registration
- [ ] Password strength requirements enforced

---

## 5. Browser Compatibility Testing

### Desktop Browsers
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile Browsers
- [ ] iOS Safari (latest)
- [ ] Chrome Mobile (latest)
- [ ] Samsung Internet (if available)

### Private/Incognito Mode
- [ ] Login works (localStorage fallback for tokens)
- [ ] Session persists during navigation
- [ ] Logout clears all data

---

## 6. Edge Cases & Error Handling

### Network Issues
- [ ] Offline mode shows appropriate error
- [ ] Request timeout shows retry option
- [ ] Retry logic works for failed requests
- [ ] Optimistic updates rollback on failure

### Data Edge Cases
- [ ] User with 0 quests completed
- [ ] User with 100+ quests (pagination)
- [ ] Quest with no tasks (shouldn't exist but handle gracefully)
- [ ] Evidence with extremely long text (truncate or scroll)
- [ ] User with no friends (show empty state)

### Subscription Edge Cases
- [ ] Stripe webhook delayed (polling handles it)
- [ ] Subscription downgrade at period end
- [ ] Payment failure (show billing portal link)
- [ ] Promo code expired (show error)

---

## 7. Regression Testing (After Each Deploy)

Run these tests after EVERY deployment to develop or main:

### Quick Smoke Tests (5 minutes)
1. [ ] Login works
2. [ ] Dashboard loads
3. [ ] Quest Hub loads
4. [ ] Can complete a task
5. [ ] Subscription tier displays correctly

### Full Regression Suite (30 minutes)
1. [ ] Complete one full user journey (registration → quest completion → diploma view)
2. [ ] Admin can manage users and quests
3. [ ] Friend system works end-to-end
4. [ ] Subscription upgrade flow completes successfully
5. [ ] All major pages load without errors

---

## 8. Automated Testing (Future)

### Unit Tests (To Implement)
- [ ] API service functions
- [ ] Authentication helpers
- [ ] XP calculation logic
- [ ] Quest completion logic
- [ ] Custom React hooks

### Integration Tests (To Implement)
- [ ] Login flow
- [ ] Quest completion flow
- [ ] Subscription upgrade flow
- [ ] Friend request flow

### E2E Tests (To Implement - Playwright/Cypress)
- [ ] Complete user registration journey
- [ ] Complete quest and view diploma
- [ ] Admin quest management
- [ ] Subscription upgrade and payment

---

## 9. Testing Tools & Commands

### Development
```bash
# Run frontend dev server
cd frontend && npm run dev

# Run backend dev server
cd backend && venv/Scripts/python main.py

# Check for console statements
grep -r "console.log" frontend/src --exclude-dir=node_modules

# Run ESLint
cd frontend && npm run lint
```

### Production Build
```bash
# Build frontend
cd frontend && npm run build

# Preview production build locally
cd frontend && npm run preview

# Check bundle size
cd frontend && npm run build -- --analyze
```

### Monitoring Production
```bash
# Check backend logs (Render)
# Via Render dashboard or MCP

# Check frontend errors (Browser DevTools)
# Console tab on live site

# Monitor API response times
# Network tab in DevTools
```

---

## 10. Issue Tracking Template

When bugs are found during testing:

**Issue Template:**
```
**Bug Description:**
[Clear description of the issue]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Environment:**
- Browser: [Chrome/Firefox/Safari/etc]
- Device: [Desktop/Mobile]
- URL: [Specific page where bug occurs]

**Screenshots/Videos:**
[Attach if helpful]

**Console Errors:**
[Copy any console errors]

**Priority:**
- [ ] Critical (blocks core functionality)
- [ ] High (impacts user experience significantly)
- [ ] Medium (minor issue, workaround available)
- [ ] Low (cosmetic or edge case)
```

---

## Testing Schedule

### Before Major Frontend Update
- Run full Pre-Update Testing Checklist
- Document all baseline metrics (load times, bundle size)
- Fix any critical issues found

### After Cleanup (This Phase)
- Run Post-Update Testing Checklist
- Verify all bug fixes work
- Performance testing
- Security testing

### After Frontend Update
- Run complete regression suite
- Browser compatibility testing
- Performance comparison with baseline
- Security audit

### Ongoing (Every Deploy)
- Quick smoke tests (5 min)
- Monitor production errors for 24 hours
- Check user-reported issues

---

## Success Metrics

### Must Pass (Blocking)
- ✅ All critical user flows work
- ✅ No console errors in production
- ✅ Subscription tier updates immediately
- ✅ No security vulnerabilities
- ✅ All major browsers supported

### Should Pass (Non-Blocking)
- ✅ Page load times under targets
- ✅ No memory leaks detected
- ✅ Bundle size within limits
- ✅ All edge cases handled gracefully

### Nice to Have
- ✅ Automated tests in place
- ✅ Performance 10% better than baseline
- ✅ Zero console warnings
- ✅ 100% browser compatibility

---

**Last Updated:** 2025-10-06
**Maintained By:** Development Team
**Review Frequency:** After each major update
