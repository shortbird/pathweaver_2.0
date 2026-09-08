-- Add teacher verification columns to quest_task_completions
ALTER TABLE quest_task_completions
ADD COLUMN IF NOT EXISTS credit_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS verified_subject_distribution JSONB,
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Add index for faster queries on credit_status
CREATE INDEX IF NOT EXISTS idx_quest_task_completions_credit_status 
ON quest_task_completions(credit_status);

-- Add index for verified_by lookups
CREATE INDEX IF NOT EXISTS idx_quest_task_completions_verified_by 
ON quest_task_completions(verified_by);
