# Activity Data Anonymization

This directory contains scripts for privacy-compliant data management of the activity tracking system.

## Overview

The activity tracking system collects user behavior data for analytics and dropout prediction. To comply with COPPA, GDPR, and privacy best practices, we automatically anonymize and delete old data.

## Data Retention Policy

- **Detailed Data**: 90 days with full user identifiers
- **Anonymized Data**: 90 days to 2 years (no PII, aggregated insights only)
- **Hard Deletion**: Data older than 2 years is permanently deleted

## Scripts

### `anonymize_activity_data.py`

Main anonymization script that:
1. Anonymizes events older than 90 days (removes user_id, IP addresses, PII)
2. Deletes events older than 2 years
3. Logs statistics and completion status

### Running the Script

**Manual Execution:**
```bash
cd backend
python scripts/anonymize_activity_data.py
```

**Automated Execution (Recommended):**

Set up a daily cron job or scheduled task:

```cron
# Run daily at 2:00 AM
0 2 * * * cd /path/to/backend && python scripts/anonymize_activity_data.py >> /var/log/optio/anonymization.log 2>&1
```

**Using Render Cron Jobs:**

Render platform supports cron jobs for scheduled tasks. To set up:

1. Go to Render Dashboard → Your Service → Cron Jobs
2. Add new cron job:
   - **Name**: Daily Activity Data Anonymization
   - **Command**: `python backend/scripts/anonymize_activity_data.py`
   - **Schedule**: `0 2 * * *` (2:00 AM UTC daily)

## What Gets Anonymized?

The script calls PostgreSQL functions that:

**`anonymize_old_activity_events()`:**
- Sets `user_id` to NULL
- Removes `user_agent`
- Strips PII from `event_data` JSON (email, ip_address, user_email)
- Sets `anonymized_at` timestamp
- Applies to both `user_activity_events` and `user_sessions` tables

**`delete_old_activity_events()`:**
- Permanently deletes `user_activity_events` older than 2 years
- Permanently deletes `user_sessions` older than 2 years
- Permanently deletes `error_events` older than 1 year (shorter retention)

## Privacy Compliance

This anonymization process ensures compliance with:

- **COPPA (Children's Online Privacy Protection Act)**: Requires parental consent and limited data retention for users under 13
- **GDPR (General Data Protection Regulation)**: Right to erasure, data minimization
- **CCPA (California Consumer Privacy Act)**: Data retention transparency

## Monitoring

The script outputs detailed logs including:
- Number of rows anonymized
- Number of rows deleted
- Database statistics (before/after)
- Timestamp of execution
- Any errors encountered

**Log Example:**
```
============================================================
Activity Data Anonymization Script
Started at: 2025-01-15T02:00:00.000000
============================================================

📊 Initial database stats:
Database stats: {'total_events': 50000, 'anonymized_events': 15000, 'total_sessions': 12000, 'total_errors': 250, 'anonymization_rate': 30.0}

🔒 Step 1: Anonymizing events older than 90 days...
✅ Anonymized 1250 activity events older than 90 days

🗑️  Step 2: Deleting events older than 2 years...
✅ Deleted 500 activity events older than 2 years

📊 Final database stats:
Database stats: {'total_events': 49500, 'anonymized_events': 16250, 'total_sessions': 11800, 'total_errors': 240, 'anonymization_rate': 32.8}

============================================================
✅ Anonymization script completed successfully
   - Anonymized: 1250 events
   - Deleted: 500 events
Finished at: 2025-01-15T02:00:15.000000
============================================================
```

## Manual Anonymization

If you need to manually anonymize data for a specific user (e.g., user requests data deletion):

```sql
-- Anonymize all events for a specific user
UPDATE user_activity_events
SET user_id = NULL,
    user_agent = NULL,
    event_data = event_data - 'ip_address' - 'email' - 'user_email',
    anonymized_at = NOW()
WHERE user_id = 'USER_UUID_HERE';

-- Anonymize sessions for a specific user
UPDATE user_sessions
SET user_id = NULL,
    user_agent = NULL,
    ip_address = NULL,
    anonymized_at = NOW()
WHERE user_id = 'USER_UUID_HERE';
```

## Testing

To test the script without making changes (dry run), you can modify the script to:
1. Query but not execute UPDATE/DELETE statements
2. Log what would be affected
3. Verify counts match expectations

## Rollback

⚠️ **WARNING**: Anonymization is irreversible. Once PII is removed, it cannot be restored.

**Backup Strategy:**
- Supabase automatically maintains point-in-time backups for 7 days
- For critical data, consider exporting aggregated analytics to a separate table before anonymization

## Support

For questions or issues with the anonymization system:
- Check logs at `/var/log/optio/anonymization.log`
- Review database function definitions in migration files
- Contact dev team for assistance

## Future Improvements

Potential enhancements:
- Add email notifications on script failure
- Implement dry-run mode for testing
- Create admin dashboard to view anonymization stats
- Add metrics to track PII exposure time
