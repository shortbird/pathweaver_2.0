-- Migration: Add admin-assisted parental consent verification
-- Date: 2025-12-26
-- Purpose: Implement COPPA-compliant verification with admin review of ID documents

-- Add new columns to users table for admin-assisted verification
ALTER TABLE users
ADD COLUMN IF NOT EXISTS parental_consent_status VARCHAR(50) DEFAULT 'pending_submission',
ADD COLUMN IF NOT EXISTS parental_consent_id_document_url TEXT,
ADD COLUMN IF NOT EXISTS parental_consent_signed_form_url TEXT,
ADD COLUMN IF NOT EXISTS parental_consent_verified_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS parental_consent_rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS parental_consent_submitted_at TIMESTAMP WITH TIME ZONE;

-- Add comment for clarity
COMMENT ON COLUMN users.parental_consent_status IS 'Status values: pending_submission, pending_review, approved, rejected';

-- Add index for admin queries (find all pending reviews)
CREATE INDEX IF NOT EXISTS idx_users_parental_consent_pending
ON users(parental_consent_status)
WHERE requires_parental_consent = true;

-- Add index for verification tracking
CREATE INDEX IF NOT EXISTS idx_users_parental_consent_verified_by
ON users(parental_consent_verified_by)
WHERE parental_consent_verified_by IS NOT NULL;

-- Update parental_consent_log to track admin actions
ALTER TABLE parental_consent_log
ADD COLUMN IF NOT EXISTS reviewed_by_admin_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS review_action VARCHAR(20),
ADD COLUMN IF NOT EXISTS review_notes TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Add index for admin audit trail
CREATE INDEX IF NOT EXISTS idx_consent_log_reviewed_by
ON parental_consent_log(reviewed_by_admin_id)
WHERE reviewed_by_admin_id IS NOT NULL;

-- Update existing records to have proper status
UPDATE users
SET parental_consent_status = CASE
    WHEN parental_consent_verified = true THEN 'approved'
    WHEN parental_consent_email IS NOT NULL THEN 'pending_submission'
    ELSE 'pending_submission'
END
WHERE requires_parental_consent = true
AND parental_consent_status IS NULL;
