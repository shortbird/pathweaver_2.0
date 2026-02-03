# E2E Test Data Setup Scripts

Scripts to manage test user data for end-to-end testing.

## Overview

E2E tests use a dedicated test account: `test@optioeducation.com` / `TestPassword123!`

These scripts ensure the test account has clean, predictable data before each test run.

## Scripts

### 1. create_test_account.py

**Purpose**: Creates the test user account (one-time setup)

**Usage**:
```bash
python backend/scripts/create_test_account.py
```

**What it does**:
- Creates Supabase Auth user with email verification
- Creates users table record with student role
- Sets up basic user profile

**When to run**: Only once when setting up the test environment

---

### 2. reset_test_user_data.py

**Purpose**: Resets test user to clean state

**Usage**:
```bash
# Full reset (delete all enrollments)
python backend/scripts/reset_test_user_data.py

# Preserve 1 enrollment (for testing enrolled quest flows)
python backend/scripts/reset_test_user_data.py --preserve-enrollments
```

**What it does**:
- Deletes all task completions
- Deletes all evidence
- Deletes user quest tasks
- Deletes quest enrollments (optional: keeps 1)
- Resets XP to 0

**When to run**: Manual cleanup or debugging test failures

---

### 3. setup_e2e_test_data.py (MAIN SCRIPT)

**Purpose**: Prepares optimal test data state for E2E tests

**Usage**:
```bash
python backend/scripts/setup_e2e_test_data.py
```

**What it does**:
1. Resets test user data (clean slate)
2. Enrolls user in 1 quest (for "enrolled quest" tests)
3. Creates user tasks for enrolled quest (for task completion tests)
4. Leaves other quests unenrolled (for "pick up quest" tests)
5. Verifies data state is ready for testing

**When to run**:
- **Automatically** before E2E tests in GitHub Actions
- **Manually** when debugging test failures locally

**Environment Variables Required**:
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-key"
```

## Test Data State

After running `setup_e2e_test_data.py`, the test user will have:

| Aspect | State | Purpose |
|--------|-------|---------|
| Quest enrollments | 1 enrolled | Tests can view enrolled quest, tasks, progress |
| Tasks in enrolled quest | Created | Tests can complete tasks, submit evidence |
| Unenrolled quests | Multiple | Tests can pick up new quests, personalize |
| Task completions | 0 | Tests can complete tasks from scratch |
| Total XP | 0 | Tests can verify XP earned |
| Evidence | None | Tests can submit fresh evidence |

## GitHub Actions Integration

The `setup_e2e_test_data.py` script runs automatically before tests:

```yaml
jobs:
  setup:
    name: Setup Test Data
    steps:
      - name: Setup E2E test data
        run: python backend/scripts/setup_e2e_test_data.py
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}

  test:
    needs: setup  # Waits for setup to complete
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - name: Run Playwright tests
        run: npx playwright test --project=${{ matrix.browser }}
```

## Manual Testing Workflow

When developing or debugging E2E tests locally:

1. **First time setup**:
   ```bash
   python backend/scripts/create_test_account.py
   ```

2. **Before running tests**:
   ```bash
   python backend/scripts/setup_e2e_test_data.py
   ```

3. **Run tests** (on deployed environment):
   ```bash
   # Note: Tests run against https://optio-dev-frontend.onrender.com
   # NOT localhost (per CLAUDE.md)
   npx playwright test --project=chromium
   ```

4. **If tests fail due to data issues**:
   ```bash
   # Reset and try again
   python backend/scripts/setup_e2e_test_data.py
   npx playwright test --project=chromium
   ```

## Troubleshooting

### "Test user not found"
```bash
# Create the test account
python backend/scripts/create_test_account.py
```

### "Need at least 2 active quests"
```bash
# Check database - ensure quests exist with is_active=true
# Create quests via admin interface or seed script
```

### Tests fail with "SET DOWN QUEST button not found"
```bash
# Ensure test data setup ran
python backend/scripts/setup_e2e_test_data.py

# Verify enrollment was created
# Check GitHub Actions logs for setup step output
```

### Tests fail with "No quests found"
```bash
# Reset data (might have enrolled all quests in previous test)
python backend/scripts/setup_e2e_test_data.py
```

## Design Decisions

**Why not seed fresh data for every test?**
- E2E tests run against live dev environment
- Seeding 10+ quests per test run would clutter database
- Current approach: seed once, reset user state before tests

**Why separate setup job in GitHub Actions?**
- Prevents race conditions (3 browsers running setup in parallel)
- Setup runs once, all browsers use same clean data
- Faster overall (1 setup vs 3 setups)

**Why not use API to create enrollments?**
- Direct database access is faster
- Bypasses business logic that might add unwanted side effects
- More reliable for test setup

## Future Improvements

- [ ] Add test data verification (assert expected state after setup)
- [ ] Create test data snapshots for specific test scenarios
- [ ] Add ability to create multiple test users (parallel test execution)
- [ ] Seed quest data if missing (currently requires manual quest creation)
