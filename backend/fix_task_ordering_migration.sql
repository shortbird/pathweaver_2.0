-- Fix Task Ordering Migration
-- This migration ensures all quest tasks have consistent 0-based order_index values
-- and fixes any existing data with inconsistent ordering

-- Start transaction
BEGIN;

-- Fix quest tasks with missing or null order_index
-- Set order_index based on created_at timestamp for predictable ordering
UPDATE quest_tasks
SET order_index = subquery.row_num
FROM (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY quest_id ORDER BY created_at ASC, id ASC) - 1 as row_num
    FROM quest_tasks
    WHERE order_index IS NULL
) AS subquery
WHERE quest_tasks.id = subquery.id;

-- Fix quest tasks where order_index might be 1-based instead of 0-based
-- Find quests where the minimum order_index is 1 (indicating 1-based indexing)
-- and shift all tasks in those quests down by 1
UPDATE quest_tasks
SET order_index = order_index - 1
WHERE quest_id IN (
    SELECT quest_id
    FROM quest_tasks
    GROUP BY quest_id
    HAVING MIN(order_index) = 1
    AND COUNT(*) > 1
    AND MAX(order_index) = COUNT(*) -- Ensure it's a contiguous 1-based sequence
);

-- Fix any gaps in order_index sequences within each quest
-- This ensures tasks are numbered 0, 1, 2, ... without gaps
UPDATE quest_tasks
SET order_index = subquery.new_order
FROM (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY quest_id ORDER BY order_index ASC, created_at ASC, id ASC) - 1 as new_order
    FROM quest_tasks
) AS subquery
WHERE quest_tasks.id = subquery.id
AND quest_tasks.order_index != subquery.new_order;

-- Verify the results by checking each quest has proper 0-based sequential ordering
-- This query should return 0 rows if all is correct
DO $$
DECLARE
    problem_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO problem_count
    FROM (
        SELECT
            quest_id,
            COUNT(*) as task_count,
            MAX(order_index) as max_order,
            MIN(order_index) as min_order
        FROM quest_tasks
        GROUP BY quest_id
        HAVING
            MIN(order_index) != 0 OR
            MAX(order_index) != COUNT(*) - 1 OR
            COUNT(DISTINCT order_index) != COUNT(*)
    ) AS problem_quests;

    IF problem_count > 0 THEN
        RAISE WARNING 'Found % quests with ordering problems after migration', problem_count;

        -- Log the problematic quests for manual review
        RAISE NOTICE 'Problematic quests:';
        FOR rec IN
            SELECT
                quest_id,
                COUNT(*) as task_count,
                MAX(order_index) as max_order,
                MIN(order_index) as min_order,
                string_agg(order_index::text, ', ' ORDER BY order_index) as all_orders
            FROM quest_tasks
            GROUP BY quest_id
            HAVING
                MIN(order_index) != 0 OR
                MAX(order_index) != COUNT(*) - 1 OR
                COUNT(DISTINCT order_index) != COUNT(*)
        LOOP
            RAISE NOTICE 'Quest ID: %, Task count: %, Orders: %', rec.quest_id, rec.task_count, rec.all_orders;
        END LOOP;
    ELSE
        RAISE NOTICE 'All quest task ordering is now consistent (0-based sequential)';
    END IF;
END $$;

-- Log migration completion
INSERT INTO migration_log (migration_name, executed_at, description)
VALUES (
    'fix_task_ordering_v1',
    NOW(),
    'Fixed quest task order_index values to use consistent 0-based indexing'
) ON CONFLICT (migration_name) DO UPDATE SET
    executed_at = NOW(),
    description = EXCLUDED.description;

COMMIT;

-- Summary report
SELECT
    'Migration completed successfully' as status,
    COUNT(*) as total_tasks_updated,
    COUNT(DISTINCT quest_id) as quests_affected
FROM quest_tasks;

-- Final verification query
SELECT
    quest_id,
    COUNT(*) as task_count,
    MIN(order_index) as min_order,
    MAX(order_index) as max_order,
    string_agg(order_index::text, ', ' ORDER BY order_index) as task_orders
FROM quest_tasks
GROUP BY quest_id
ORDER BY quest_id
LIMIT 10;