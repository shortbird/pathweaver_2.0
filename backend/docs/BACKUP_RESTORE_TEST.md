# Database Backup Restore Test Procedure

## Overview

This document provides step-by-step procedures for testing database backup restoration. Regular testing ensures backups are valid and recovery procedures work when needed.

**Test Frequency**: Monthly (minimum)
**Estimated Time**: 2-3 hours
**Prerequisites**: Supabase Pro plan or higher, existing backups

---

## Why Test Backups?

- **Verify backup integrity**: Ensure backups are not corrupted
- **Validate procedures**: Confirm restore steps work correctly
- **Measure recovery time**: Know actual RTO (Recovery Time Objective)
- **Train team**: Keep staff familiar with recovery process
- **Meet compliance**: Many regulations require backup testing

**Critical**: An untested backup is NOT a backup.

---

## Test Environment Setup

### Option 1: Test Supabase Project (Recommended)

**Pros**: Safe, isolated, realistic
**Cons**: Requires separate Supabase project

**Steps**:
1. Create new Supabase project: "optio-backup-test"
2. Use free tier (sufficient for testing)
3. This will be your permanent test environment

### Option 2: Local PostgreSQL Instance

**Pros**: Free, fast, repeatable
**Cons**: Environment differences from Supabase

**Steps**:
```bash
# Install PostgreSQL locally
# Windows: https://www.postgresql.org/download/windows/
# Mac: brew install postgresql

# Start PostgreSQL
# Windows: Starts automatically as service
# Mac: brew services start postgresql

# Create test database
createdb optio_test
```

---

## Test Procedure: Supabase Dashboard Method

### Step 1: Verify Existing Backups

1. Log in to Supabase Dashboard
2. Go to production project (Optio)
3. Navigate to **Database** → **Backups**
4. Verify backups exist:
   - [ ] Check last backup date/time
   - [ ] Verify backup size (should be consistent)
   - [ ] Note backup ID or timestamp

**Expected**: Multiple backups with reasonable sizes (100 MB - 10 GB typical)

### Step 2: Create Test Project

1. From Supabase Dashboard home
2. Click **New Project**
3. Configure:
   - **Name**: optio-backup-test
   - **Database Password**: Generate strong password
   - **Region**: Same as production
   - **Plan**: Free tier (sufficient for testing)
4. Wait for project creation (2-5 minutes)

### Step 3: Restore Backup to Test Project

1. Go to test project (optio-backup-test)
2. Navigate to **Database** → **Backups**
3. Select **Restore from another project**
4. Choose production project (Optio)
5. Select backup to restore:
   - **Option A**: Latest daily backup
   - **Option B**: Point-in-time (specific timestamp)
6. Confirm restoration
7. Wait for completion (10-30 minutes typical)

**Time Tracking**: Record actual restoration time for RTO planning

### Step 4: Verify Data Integrity

Run verification queries against test project:

```sql
-- Check user count matches production
SELECT COUNT(*) as user_count FROM users;

-- Check quest count
SELECT COUNT(*) as quest_count FROM quests;

-- Check recent activity
SELECT COUNT(*) as completions FROM quest_task_completions
WHERE completed_at > NOW() - INTERVAL '7 days';

-- Verify critical tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check for data consistency
SELECT
  (SELECT COUNT(*) FROM users) as users,
  (SELECT COUNT(*) FROM quests) as quests,
  (SELECT COUNT(*) FROM quest_tasks) as tasks,
  (SELECT COUNT(*) FROM quest_task_completions) as completions,
  (SELECT COUNT(*) FROM friendships) as friendships;
```

**Expected Results**: Numbers should match production snapshot at backup time

### Step 5: Test Application Connection

Update test environment variables to point to restored database:

```bash
# Create test .env file
SUPABASE_URL=https://[test-project-ref].supabase.co
SUPABASE_ANON_KEY=[test-anon-key]
SUPABASE_SERVICE_KEY=[test-service-key]
FLASK_ENV=development
FRONTEND_URL=http://localhost:5173
```

**Test queries**:
```python
# backend/scripts/test_restored_backup.py
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from database import get_supabase_admin_client

def test_restored_database():
    """Test connectivity and data integrity of restored database"""

    supabase = get_supabase_admin_client()

    print("Testing restored database...")

    # Test 1: Connection
    print("\n1. Testing connection...")
    try:
        response = supabase.table('users').select('count', count='exact').execute()
        print(f"   ✓ Connected. User count: {response.count}")
    except Exception as e:
        print(f"   ✗ Connection failed: {e}")
        return False

    # Test 2: Critical tables
    print("\n2. Testing critical tables...")
    tables = ['users', 'quests', 'quest_tasks', 'quest_task_completions']
    for table in tables:
        try:
            response = supabase.table(table).select('count', count='exact').execute()
            print(f"   ✓ {table}: {response.count} records")
        except Exception as e:
            print(f"   ✗ {table} failed: {e}")
            return False

    # Test 3: Foreign key integrity
    print("\n3. Testing foreign key integrity...")
    try:
        # Check for orphaned task completions
        response = supabase.rpc('check_orphaned_completions').execute()
        orphaned = response.data if response.data else []
        if len(orphaned) == 0:
            print(f"   ✓ No orphaned records found")
        else:
            print(f"   ⚠ Found {len(orphaned)} orphaned records")
    except Exception as e:
        print(f"   ⚠ Could not check integrity: {e}")

    # Test 4: Recent data
    print("\n4. Testing recent data...")
    try:
        response = supabase.table('quest_task_completions')\
            .select('*')\
            .order('completed_at', desc=True)\
            .limit(1)\
            .execute()

        if response.data:
            latest = response.data[0]
            print(f"   ✓ Latest completion: {latest['completed_at']}")
        else:
            print(f"   ⚠ No completions found")
    except Exception as e:
        print(f"   ✗ Could not fetch recent data: {e}")
        return False

    print("\n✅ All tests passed!")
    return True

if __name__ == "__main__":
    test_restored_database()
```

Run the test:
```bash
cd backend
../venv/Scripts/python.exe scripts/test_restored_backup.py
```

### Step 6: Document Results

Record test results in tracking log:

**Test Date**: 2025-09-29
**Backup Date**: [Date of backup tested]
**Backup Type**: Daily / PITR / Manual
**Test Environment**: Supabase Test Project / Local PostgreSQL
**Restoration Time**: [Actual minutes]
**Data Integrity**: Pass / Fail
**Connection Test**: Pass / Fail
**Issues Found**: [Any problems encountered]
**Tester**: [Your name]

### Step 7: Cleanup

1. Keep test project for next month's test
2. **OR** delete test project if not needed:
   - Go to test project settings
   - Scroll to **Danger Zone**
   - Delete project (requires password confirmation)

---

## Test Procedure: pg_dump/pg_restore Method

### Step 1: Create Manual Backup

```bash
# Get database connection string from Supabase Dashboard
# Settings → Database → Connection String

# Create backup
pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  -F c \
  -f "test_backup_$(date +%Y%m%d).dump"

# Verify backup file
ls -lh test_backup_*.dump
```

### Step 2: Create Test Database

```bash
# Create empty database
createdb optio_backup_test

# Verify creation
psql -l | grep optio_backup_test
```

### Step 3: Restore Backup

```bash
# Restore backup to test database
pg_restore -d optio_backup_test test_backup_*.dump

# Check for errors
echo $?  # Should return 0 for success
```

### Step 4: Verify Restoration

```bash
# Connect to test database
psql optio_backup_test

# Run verification queries
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM quests;
SELECT COUNT(*) FROM quest_task_completions;

# Check table list
\dt

# Exit
\q
```

### Step 5: Cleanup

```bash
# Delete test database
dropdb optio_backup_test

# Delete test backup file
rm test_backup_*.dump
```

---

## Point-in-Time Recovery (PITR) Test

**Purpose**: Verify ability to restore to specific timestamp

### Scenario: Recover from Accidental Deletion

**Simulate**:
1. Note current timestamp
2. Delete test data (in test environment!)
3. Restore to timestamp before deletion
4. Verify data restored

**Steps**:

1. **Create Test Project** (if not exists)

2. **Add Test Data**:
```sql
-- In test project, create test table
CREATE TABLE pitr_test (
  id SERIAL PRIMARY KEY,
  data TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert test data
INSERT INTO pitr_test (data) VALUES ('Before deletion');
```

3. **Note Timestamp**:
```sql
SELECT NOW() as recovery_point;
-- Example: 2025-09-29 14:30:00+00
```

4. **Simulate Deletion** (wait 5 minutes):
```sql
DELETE FROM pitr_test;
```

5. **Restore to Recovery Point**:
   - Go to Supabase Dashboard → Database → Backups
   - Select **Point-in-Time Recovery**
   - Enter timestamp from step 3
   - Confirm restoration

6. **Verify Data Recovered**:
```sql
SELECT * FROM pitr_test;
-- Should show: "Before deletion"
```

**Document**:
- Recovery point timestamp
- Time to restore (minutes)
- Data verification result

---

## Common Issues & Troubleshooting

### Issue: Backup Restoration Takes Too Long

**Causes**:
- Large database size
- Network speed
- Supabase infrastructure load

**Solutions**:
- Wait patiently (can take 30+ minutes for large DBs)
- Check Supabase status page
- Contact Supabase support if > 2 hours

### Issue: Restore Fails with "Insufficient Resources"

**Causes**:
- Test project plan too small
- Database size exceeds test plan limits

**Solutions**:
- Upgrade test project to paid plan temporarily
- Use smaller backup (older/partial)
- Test locally with pg_restore

### Issue: Data Integrity Checks Fail

**Causes**:
- Backup corruption
- Incomplete backup
- Schema changes during backup

**Solutions**:
- Try different backup (earlier date)
- Contact Supabase support
- Check production database for issues

### Issue: Connection Fails After Restore

**Causes**:
- Incorrect connection string
- RLS policies not restored
- Extensions not installed

**Solutions**:
- Verify connection credentials
- Check extensions: `SELECT * FROM pg_extension;`
- Verify RLS policies exist

---

## Test Results Tracking

Create a log file to track all backup tests:

**File**: `backend/docs/backup_test_log.md`

```markdown
# Backup Restore Test Log

## Test #1 - 2025-09-29

- **Tester**: [Name]
- **Backup Date**: 2025-09-28 03:00 UTC
- **Backup Type**: Daily Automated
- **Test Environment**: Supabase Test Project
- **Restoration Time**: 18 minutes
- **Data Integrity**: ✅ Pass (12,543 users verified)
- **Connection Test**: ✅ Pass
- **Issues**: None
- **Notes**: Smooth restoration, no problems

## Test #2 - 2025-10-29

[Next test...]
```

---

## Automation (Advanced)

Create automated monthly tests:

```python
# backend/scripts/automated_backup_test.py
"""
Automated backup restore testing
Run monthly via cron job or scheduled task
"""

import os
import sys
from datetime import datetime
from supabase import create_client

def run_automated_test():
    """Run automated backup test and report results"""

    print("=" * 80)
    print(f"AUTOMATED BACKUP TEST - {datetime.now().isoformat()}")
    print("=" * 80)

    # 1. Connect to test environment
    test_supabase_url = os.getenv('TEST_SUPABASE_URL')
    test_supabase_key = os.getenv('TEST_SUPABASE_SERVICE_KEY')

    if not test_supabase_url or not test_supabase_key:
        print("❌ Test environment not configured")
        return False

    supabase = create_client(test_supabase_url, test_supabase_key)

    # 2. Run integrity checks
    tests_passed = 0
    tests_failed = 0

    # Test connection
    try:
        response = supabase.table('users').select('count', count='exact').execute()
        print(f"✅ Connection test passed ({response.count} users)")
        tests_passed += 1
    except Exception as e:
        print(f"❌ Connection test failed: {e}")
        tests_failed += 1

    # Test critical tables
    tables = ['users', 'quests', 'quest_tasks', 'quest_task_completions']
    for table in tables:
        try:
            response = supabase.table(table).select('count', count='exact').execute()
            print(f"✅ {table}: {response.count} records")
            tests_passed += 1
        except Exception as e:
            print(f"❌ {table} test failed: {e}")
            tests_failed += 1

    # 3. Generate report
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Tests Passed: {tests_passed}")
    print(f"Tests Failed: {tests_failed}")
    print(f"Success Rate: {tests_passed/(tests_passed+tests_failed)*100:.1f}%")

    # 4. Send alert if failures
    if tests_failed > 0:
        print("\n⚠️ ALERT: Backup test failures detected!")
        # TODO: Send email/Slack notification

    return tests_failed == 0

if __name__ == "__main__":
    success = run_automated_test()
    sys.exit(0 if success else 1)
```

Schedule monthly:
```bash
# Linux/Mac cron job (run 1st of every month at 2 AM)
0 2 1 * * cd /path/to/backend && /path/to/venv/bin/python scripts/automated_backup_test.py

# Windows Task Scheduler
# Create task to run monthly
```

---

## Summary Checklist

### Before Each Test

- [ ] Verify production backups exist
- [ ] Prepare test environment
- [ ] Set aside 2-3 hours
- [ ] Have Supabase credentials ready

### During Test

- [ ] Record start time
- [ ] Follow procedure step-by-step
- [ ] Document any issues
- [ ] Take screenshots if helpful

### After Test

- [ ] Record test results
- [ ] Update test log
- [ ] Report any issues found
- [ ] Update procedures if needed
- [ ] Schedule next test (1 month)

---

**Next Steps**:
1. Complete initial backup configuration
2. Schedule first backup test
3. Set monthly reminder for ongoing tests
4. Train team members on restore procedures

**Priority**: HIGH - Complete first test before production launch

---

**Last Updated**: 2025-09-29
**Status**: Procedure Documented - Ready for First Test