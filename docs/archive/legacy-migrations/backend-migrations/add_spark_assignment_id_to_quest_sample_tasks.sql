-- Add spark_assignment_id column to quest_sample_tasks for SPARK LMS integration
-- This allows mapping SPARK assignments to Optio sample tasks for course sync webhook

ALTER TABLE quest_sample_tasks
ADD COLUMN IF NOT EXISTS spark_assignment_id VARCHAR(255);

-- Create index for efficient lookups when processing SPARK webhooks
CREATE INDEX IF NOT EXISTS idx_quest_sample_tasks_spark_assignment_id
ON quest_sample_tasks(spark_assignment_id);

-- Add comment explaining the column
COMMENT ON COLUMN quest_sample_tasks.spark_assignment_id IS 'SPARK LMS assignment ID for syncing course assignments';
