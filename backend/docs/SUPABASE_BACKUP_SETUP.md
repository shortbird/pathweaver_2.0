# Supabase Database Backup Configuration Guide

## Overview

This guide covers setting up automated backups for the Optio production database hosted on Supabase.

## Current State

**Status**: ⚠️ NEEDS CONFIGURATION

Supabase provides automated backups, but the configuration needs to be verified and enhanced for production readiness.

---

## Supabase Backup Features

### Built-in Backup System

Supabase provides automatic daily backups with the following features:

| Plan | Daily Backups | Retention | Point-in-Time Recovery |
|------|--------------|-----------|------------------------|
| Free | ❌ No | N/A | ❌ No |
| Pro | ✅ Yes | 7 days | ✅ Last 7 days |
| Team | ✅ Yes | 14 days | ✅ Last 14 days |
| Enterprise | ✅ Yes | 30 days | ✅ Last 30 days |

**Current Plan**: [TO BE DETERMINED - Check Supabase dashboard]

---

## Setup Steps

### Step 1: Verify Current Backup Configuration

1. Log in to Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to your Optio project
3. Go to **Settings** → **Database**
4. Check **Backups** section
5. Verify:
   - [ ] Automated backups are enabled
   - [ ] Backup schedule (daily recommended)
   - [ ] Retention period
   - [ ] Point-in-time recovery status

### Step 2: Upgrade Plan (If Necessary)

**If on Free Tier:**
- Backups are NOT included
- **CRITICAL**: Upgrade to Pro plan minimum ($25/month)
- Required for production deployment

**To Upgrade:**
1. Go to **Settings** → **Billing**
2. Select **Pro Plan** or higher
3. Add payment method
4. Confirm upgrade

### Step 3: Configure Backup Settings

**Recommended Configuration:**

1. **Backup Frequency**: Daily (default)
2. **Backup Time**: Off-peak hours (e.g., 3:00 AM UTC)
3. **Retention**:
   - Minimum: 7 days (Pro plan)
   - Recommended: 14-30 days (Team/Enterprise)

**To Configure:**
1. In Supabase Dashboard → **Settings** → **Database**
2. Find **Backup Schedule** section
3. Set preferred backup time
4. Save changes

### Step 4: Enable Point-in-Time Recovery (PITR)

**What is PITR?**
- Allows restoration to any point in time within retention window
- Not just daily snapshots - continuous backup
- Essential for production databases

**To Enable:**
1. Go to **Settings** → **Database** → **Backups**
2. Find **Point-in-Time Recovery** toggle
3. Enable PITR
4. Confirm settings

**Note**: PITR is only available on Pro plan and above.

---

## Manual Backup Process

For additional safety, create manual backups before major changes:

### Method 1: Supabase Dashboard (Recommended)

1. Go to **Database** → **Backups**
2. Click **Create Backup**
3. Add description (e.g., "Pre-deployment backup - 2025-09-29")
4. Wait for backup to complete
5. Verify backup appears in list

### Method 2: pg_dump via Command Line

```bash
# Install PostgreSQL client tools first
# Windows: Download from https://www.postgresql.org/download/windows/

# Get connection string from Supabase Dashboard → Settings → Database
# Connection string format:
# postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# Create backup
pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" > backup_$(date +%Y%m%d_%H%M%S).sql

# Compress backup (optional)
gzip backup_*.sql
```

### Method 3: Automated Script

Create a script for regular manual backups:

```python
# backend/scripts/create_manual_backup.py
import subprocess
import os
from datetime import datetime
from config import Config

def create_manual_backup():
    """Create a manual database backup using pg_dump"""

    # Get Supabase connection details
    # Note: Extract from SUPABASE_URL and use SERVICE_KEY

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = f"backups/optio_backup_{timestamp}.sql"

    # Ensure backups directory exists
    os.makedirs("backups", exist_ok=True)

    # Connection string (construct from environment variables)
    # WARNING: Never commit this with actual credentials
    connection_string = f"postgresql://postgres:{os.getenv('SUPABASE_DB_PASSWORD')}@{os.getenv('SUPABASE_HOST')}:5432/postgres"

    # Run pg_dump
    try:
        subprocess.run([
            "pg_dump",
            connection_string,
            "-f", backup_file
        ], check=True)

        print(f"✅ Backup created: {backup_file}")

        # Compress backup
        subprocess.run(["gzip", backup_file], check=True)
        print(f"✅ Backup compressed: {backup_file}.gz")

    except subprocess.CalledProcessError as e:
        print(f"❌ Backup failed: {e}")
        return False

    return True

if __name__ == "__main__":
    create_manual_backup()
```

---

## Backup Verification

### Weekly Verification Checklist

- [ ] Log in to Supabase Dashboard
- [ ] Navigate to Database → Backups
- [ ] Verify recent backups exist (last 7 days)
- [ ] Check backup file sizes are reasonable
- [ ] Review any backup errors/warnings
- [ ] Document in operations log

### Monthly Test Restore

**CRITICAL**: Test backup restoration monthly to ensure backups are valid.

See **BACKUP_RESTORE_TEST.md** for detailed test procedures.

---

## Backup Storage Locations

### Supabase Managed Backups
- **Location**: Supabase cloud storage (AWS S3)
- **Access**: Via Supabase Dashboard only
- **Security**: Encrypted at rest
- **Retention**: Based on plan (7-30 days)

### Manual Backups (Optional)
- **Location**: Local storage or external backup service
- **Recommended**: Upload to separate cloud storage
  - AWS S3 (separate bucket)
  - Google Cloud Storage
  - Backblaze B2 (cost-effective)
- **Encryption**: Use encrypted storage
- **Retention**: 90 days recommended

---

## Disaster Recovery Scenarios

### Scenario 1: Accidental Data Deletion (Within 24 hours)

**Solution**: Point-in-Time Recovery
1. Go to Supabase Dashboard → Database → Backups
2. Select **Point-in-Time Recovery**
3. Choose timestamp before deletion
4. Confirm recovery
5. Wait for restoration (10-30 minutes typical)
6. Verify data restored

**RTO**: 1 hour
**RPO**: Seconds (if PITR enabled)

### Scenario 2: Accidental Data Deletion (Older than retention)

**Solution**: Manual backup restoration
1. Contact Supabase support for older backups
2. Restore from manual backup if available
3. If no backup: Data loss

**Prevention**: Maintain manual backups beyond Supabase retention

### Scenario 3: Database Corruption

**Solution**: Restore from latest backup
1. Create new Supabase project
2. Restore backup to new project
3. Update application connection strings
4. Test application functionality
5. Switch DNS/environment variables

**RTO**: 2-4 hours
**RPO**: 24 hours (daily backup)

### Scenario 4: Complete Supabase Outage

**Solution**: Restore to different provider (extreme scenario)
1. Spin up PostgreSQL instance (AWS RDS, DigitalOcean, etc.)
2. Restore from manual backup (pg_dump file)
3. Update application configuration
4. Test and deploy

**RTO**: 4-8 hours (if prepared)
**RPO**: Depends on manual backup age

---

## Backup Security

### Access Control

- [ ] Limit Supabase dashboard access to authorized personnel only
- [ ] Use strong, unique passwords for Supabase accounts
- [ ] Enable 2FA on all Supabase accounts
- [ ] Rotate database passwords quarterly
- [ ] Maintain separate accounts for each team member

### Backup Encryption

- [ ] Verify Supabase backups are encrypted at rest
- [ ] Encrypt manual backups before storage
- [ ] Use encrypted cloud storage for manual backups
- [ ] Secure backup credentials in password manager

### Compliance

- [ ] Document backup procedures for compliance
- [ ] Include backups in data retention policy
- [ ] Ensure backups comply with GDPR/privacy laws
- [ ] Plan for backup deletion per retention policy

---

## Monitoring & Alerts

### Backup Monitoring

**Recommended Tools:**
1. **Supabase Dashboard**: Check backup status daily
2. **Email Alerts**: Configure Supabase to send backup failure alerts
3. **External Monitoring**: Use UptimeRobot or similar for database connectivity

**Alert Conditions:**
- [ ] Backup failure
- [ ] Missing daily backup
- [ ] Backup size anomaly (too small/large)
- [ ] Backup age exceeds 48 hours

### Integration with Monitoring System

Add to health check endpoint:

```python
# backend/routes/health.py
from datetime import datetime, timedelta

def check_backup_age():
    """Check when last backup was created"""
    # Query Supabase backup API or maintain backup log
    last_backup = get_last_backup_timestamp()

    if not last_backup:
        return {
            "status": "error",
            "message": "No backup information available"
        }

    age = datetime.now() - last_backup

    if age > timedelta(hours=48):
        return {
            "status": "error",
            "message": f"Last backup is {age.days} days old"
        }

    return {
        "status": "ok",
        "last_backup": last_backup.isoformat()
    }
```

---

## Cost Analysis

### Supabase Backup Costs

| Plan | Monthly Cost | Backups Included | Storage |
|------|-------------|------------------|---------|
| Free | $0 | ❌ None | N/A |
| Pro | $25 | ✅ 7 days | 8 GB included |
| Team | $599 | ✅ 14 days | 100 GB included |
| Enterprise | Custom | ✅ 30 days | Custom |

**Recommendation for Optio:**
- Start with **Pro plan** ($25/month)
- Provides essential backup features
- Upgrade to Team if need longer retention

### Additional Storage Costs (Manual Backups)

**Estimated Backup Size**: 500 MB - 2 GB (compressed)

**Storage Options:**
- **AWS S3**: ~$0.023/GB/month = $0.05 - $0.15/month
- **Backblaze B2**: ~$0.005/GB/month = $0.01 - $0.05/month (cheaper)
- **Google Cloud Storage**: ~$0.020/GB/month = $0.04 - $0.10/month

**Total Estimated Cost**: $25 - $30/month (including Pro plan + manual backup storage)

---

## Implementation Checklist

### Pre-Launch (Critical)

- [ ] **Step 1**: Check current Supabase plan
- [ ] **Step 2**: Upgrade to Pro plan minimum (if on Free)
- [ ] **Step 3**: Verify automated backups are enabled
- [ ] **Step 4**: Enable Point-in-Time Recovery
- [ ] **Step 5**: Test backup restoration (see BACKUP_RESTORE_TEST.md)
- [ ] **Step 6**: Document backup credentials securely
- [ ] **Step 7**: Set up backup monitoring/alerts
- [ ] **Step 8**: Update incident response plan with backup procedures

### Post-Launch (Important)

- [ ] Create manual backup script
- [ ] Set up external backup storage
- [ ] Schedule weekly backup verification
- [ ] Schedule monthly restore test
- [ ] Train team on restore procedures
- [ ] Document all backup procedures
- [ ] Add backup checks to health monitoring

### Ongoing Maintenance

- [ ] Weekly: Verify backups exist
- [ ] Monthly: Test backup restoration
- [ ] Quarterly: Review retention policy
- [ ] Quarterly: Rotate database credentials
- [ ] Annually: Review and update backup strategy

---

## Support & Resources

**Supabase Documentation**:
- Backup Guide: https://supabase.com/docs/guides/platform/backups
- Point-in-Time Recovery: https://supabase.com/docs/guides/platform/backups#point-in-time-recovery

**Supabase Support**:
- Dashboard: https://supabase.com/dashboard/support
- Email: support@supabase.io
- Community: https://github.com/supabase/supabase/discussions

**PostgreSQL Backup Tools**:
- pg_dump: https://www.postgresql.org/docs/current/app-pgdump.html
- pg_restore: https://www.postgresql.org/docs/current/app-pgrestore.html

---

## Next Steps

1. **Immediate**: Check Supabase dashboard for current backup status
2. **Today**: Upgrade to Pro plan if on Free tier
3. **This Week**: Verify backup configuration and test restore
4. **Before Launch**: Complete all pre-launch checklist items

**Priority**: HIGH - Backups are CRITICAL before production launch

**Estimated Time**: 2-3 hours for complete setup and testing

---

**Last Updated**: 2025-09-29
**Status**: Documentation Complete - Awaiting Implementation
**Owner**: [Assign responsible team member]