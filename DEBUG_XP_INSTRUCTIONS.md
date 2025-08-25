# Debug and Fix XP System

## Quick Fix Steps

### 1. Check your XP status
Open your browser console (F12) and look for the console logs that show:
- Dashboard data
- Portfolio data  
- Final skillXPData
- Total XP

### 2. Use the debug endpoint
Visit (replace YOUR_USER_ID with your actual user ID):
```
http://localhost:5000/api/test-xp/check/YOUR_USER_ID
```

This will show:
- How many quests you've completed
- Whether those quests have XP awards
- What your current XP is
- What your XP should be
- Any discrepancies

### 3. Fix your XP (if needed)
Make a POST request to:
```
http://localhost:5000/api/test-xp/fix/YOUR_USER_ID
```

Or use curl:
```bash
curl -X POST http://localhost:5000/api/test-xp/fix/YOUR_USER_ID
```

### 4. Run the SQL migration
In Supabase SQL Editor, run:
```sql
-- First, ensure all quests have XP awards
DO $$
DECLARE
    quest_record RECORD;
    quest_count INTEGER := 0;
BEGIN
    FOR quest_record IN 
        SELECT q.id 
        FROM quests q
        WHERE NOT EXISTS (
            SELECT 1 FROM quest_skill_xp qsx 
            WHERE qsx.quest_id = q.id
        )
    LOOP
        -- Add default XP (50 points split between two categories)
        INSERT INTO quest_skill_xp (quest_id, skill_category, xp_amount)
        VALUES 
            (quest_record.id, 'thinking_skills', 25),
            (quest_record.id, 'personal_growth', 25)
        ON CONFLICT DO NOTHING;
        
        quest_count := quest_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Added XP awards to % quests', quest_count;
END $$;

-- Then recalculate all user XP
DO $$
DECLARE
    user_record RECORD;
    quest_record RECORD;
    award_record RECORD;
    user_count INTEGER := 0;
BEGIN
    -- For each user with completed quests
    FOR user_record IN 
        SELECT DISTINCT user_id 
        FROM user_quests 
        WHERE status = 'completed'
    LOOP
        -- Reset their XP
        UPDATE user_skill_xp 
        SET total_xp = 0 
        WHERE user_id = user_record.user_id;
        
        -- Ensure all categories exist
        INSERT INTO user_skill_xp (user_id, skill_category, total_xp)
        VALUES 
            (user_record.user_id, 'reading_writing', 0),
            (user_record.user_id, 'thinking_skills', 0),
            (user_record.user_id, 'personal_growth', 0),
            (user_record.user_id, 'life_skills', 0),
            (user_record.user_id, 'making_creating', 0),
            (user_record.user_id, 'world_understanding', 0)
        ON CONFLICT DO NOTHING;
        
        -- Recalculate from completed quests
        FOR quest_record IN 
            SELECT quest_id 
            FROM user_quests 
            WHERE user_id = user_record.user_id 
            AND status = 'completed'
        LOOP
            -- Add XP from each quest
            FOR award_record IN 
                SELECT * FROM quest_skill_xp 
                WHERE quest_id = quest_record.quest_id
            LOOP
                UPDATE user_skill_xp 
                SET total_xp = total_xp + award_record.xp_amount
                WHERE user_id = user_record.user_id 
                AND skill_category = award_record.skill_category;
            END LOOP;
        END LOOP;
        
        user_count := user_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Recalculated XP for % users', user_count;
END $$;
```

### 5. Clear browser cache and reload
1. Open Developer Tools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

## Common Issues and Solutions

### Issue: Charts appear then disappear
**Cause**: Data is being overwritten by empty response
**Solution**: Check network tab for failing API calls, ensure backend is running

### Issue: XP shows as 0 despite completed quests
**Cause**: Quests don't have XP awards assigned
**Solution**: Run the SQL migration above

### Issue: 404 error on portfolio endpoint
**Cause**: User doesn't have a diploma record
**Solution**: The updated portfolio route will create one automatically

### Issue: Dashboard shows old data
**Cause**: Browser caching
**Solution**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

## Verify Everything Works

After fixes, you should see:
1. ✅ Total XP shows a number > 0 (if you have completed quests)
2. ✅ Skill Category Progress chart shows bars
3. ✅ Skill Balance radar chart shows a shape
4. ✅ No 404 errors in network tab
5. ✅ Console logs show XP data

## Get Your User ID

To find your user ID:
1. Open browser console (F12)
2. Type: `JSON.parse(localStorage.getItem('user')).id`
3. Copy the UUID that appears