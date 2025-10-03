-- Debug enrollment issue
-- Check the enrollment for user ad8e119c-0685-4431-8381-527273832ca9 and quest 09688589-3c4c-40ab-ae03-b5ffde4e98bf

SELECT
    id,
    user_id,
    quest_id,
    is_active,
    completed_at,
    personalization_completed,
    started_at
FROM user_quests
WHERE user_id = 'ad8e119c-0685-4431-8381-527273832ca9'
  AND quest_id = '09688589-3c4c-40ab-ae03-b5ffde4e98bf';

-- Check for tasks
SELECT COUNT(*) as task_count
FROM user_quest_tasks
WHERE user_quest_id IN (
    SELECT id FROM user_quests
    WHERE user_id = 'ad8e119c-0685-4431-8381-527273832ca9'
      AND quest_id = '09688589-3c4c-40ab-ae03-b5ffde4e98bf'
);
