-- Fix for AI Generation Analytics View
-- Drop the view if it exists and recreate it
DROP VIEW IF EXISTS ai_generation_analytics;

CREATE OR REPLACE VIEW ai_generation_analytics AS
SELECT 
    DATE(created_at) as generation_date,
    COUNT(*) as total_jobs,
    SUM(generated_count) as total_generated,
    SUM(approved_count) as total_approved,
    SUM(rejected_count) as total_rejected,
    AVG(CASE WHEN approved_count + rejected_count > 0 
        THEN approved_count::DECIMAL / (approved_count + rejected_count) * 100 
        ELSE NULL END) as approval_rate,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60) as avg_processing_time_minutes
FROM ai_generation_jobs
WHERE status = 'completed'
GROUP BY DATE(created_at)
ORDER BY generation_date DESC;

-- Grant permissions on the view
GRANT SELECT ON ai_generation_analytics TO authenticated;
GRANT SELECT ON ai_generation_analytics TO anon;

-- Also ensure service role has full access to the tables
GRANT ALL ON ai_generation_jobs TO service_role;
GRANT ALL ON ai_generated_quests TO service_role;
GRANT ALL ON ai_prompt_templates TO service_role;
GRANT ALL ON ai_quest_review_history TO service_role;
