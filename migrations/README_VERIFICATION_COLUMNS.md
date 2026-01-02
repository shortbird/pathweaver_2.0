# Teacher Verification Columns Migration

## Overview
Adds columns to `quest_task_completions` table to support teacher verification of diploma credits.

## Columns Added
- `credit_status` TEXT DEFAULT 'pending' - Status of credit verification (pending/approved/rejected)
- `verified_by` UUID - Foreign key to users table (references teacher who verified)
- `verified_at` TIMESTAMP WITH TIME ZONE - When verification occurred
- `verified_subject_distribution` JSONB - Subject area credit distribution (e.g., {"Math": 0.5, "Science": 0.5})
- `verification_notes` TEXT - Teacher notes about verification decision

## Indexes Created
- `idx_quest_task_completions_credit_status` - Fast queries on credit status
- `idx_quest_task_completions_verified_by` - Fast lookups by verifying teacher

## To Apply
Run the SQL in Supabase SQL Editor:
```bash
cat migrations/add_verification_columns.sql
```

Or use Supabase CLI:
```bash
supabase db push
```

## Related Files
- Backend route: `backend/routes/teacher_verification.py`
- Service: `backend/services/credit_mapping_service.py`
- Frontend: `frontend/src/pages/TeacherVerificationPage.jsx`
