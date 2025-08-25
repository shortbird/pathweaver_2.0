# Diploma Page Debugging Guide

## Recent Changes Made

1. **Updated Official Credential Text**: Changed from "Official Credential" to "Self-Validated Credential" with explanation
2. **Removed Core Competencies Section**: The skill category progress bars section has been removed
3. **Fixed Experience Points Display**: The total XP and skills count now properly display from backend data
4. **Added Console Logging**: Added debugging logs to see what data is being received

## Debugging XP Issues

If the diploma page shows 0 XP or 0 skills even though quests have been completed:

### 1. Check Console Logs
Open browser developer console and navigate to the diploma page. You should see:
- `Diploma data received:` - The full response
- `Total XP:` - Should show the calculated total
- `Skill XP:` - Array of skill categories with XP
- `Skill Details:` - Array of individual skills practiced
- `Completed Quests:` - Array of completed quests

### 2. Use the Debug API Endpoint
Check XP status for a user:
```bash
curl http://localhost:5000/api/test-xp/check/{USER_ID}
```

This will show:
- Completed quests count
- Which quests have XP awards assigned
- Current user XP values
- Expected XP values
- Any discrepancies

### 3. Fix XP Data
If there are discrepancies, fix them:
```bash
curl -X POST http://localhost:5000/api/test-xp/fix/{USER_ID}
```

This will recalculate and update the user's XP based on their completed quests.

## Common Issues

### Issue: XP Shows 0 Despite Completed Quests
**Cause**: Quests may not have XP awards assigned in the `quest_skill_xp` table
**Solution**: 
1. Check if quests have XP awards: Run the check endpoint above
2. If missing, assign default XP to quests or run the migration script

### Issue: Skills Count Shows 0
**Cause**: The `user_skill_details` table may not be populated
**Solution**: This table is populated when quests are completed and have `core_skills` defined

### Issue: Diploma Not Loading
**Cause**: The diploma record may not exist or the portfolio slug is incorrect
**Solution**: Check that the user has a diploma record in the `diplomas` table with a valid `portfolio_slug`

## Database Tables Involved

1. **diplomas**: Stores portfolio slugs and privacy settings
2. **user_skill_xp**: Stores XP totals by skill category for each user
3. **user_skill_details**: Stores individual skills practiced and count
4. **quest_skill_xp**: Defines XP awards for each quest
5. **user_quests**: Tracks quest completion status

## Testing Workflow

1. Complete a quest as a test user
2. Have an admin approve the quest submission
3. Check that XP is awarded (use debug endpoint)
4. View the diploma page and verify data displays correctly