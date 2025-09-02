# Quest Template System Migration Instructions

## How to Run the Migration

Since Supabase doesn't allow direct SQL execution through the API, you'll need to run the migration through the Supabase SQL Editor.

### Steps:

1. **Open Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to the **SQL Editor** tab

2. **Run the Migration**
   - Open the file: `backend/migrations/quest_template_migration.sql`
   - Copy the entire contents
   - Paste into the Supabase SQL Editor
   - Click **Run** button

3. **Verify Migration Success**
   The migration will:
   - Update quest_tasks table with new columns
   - Create 6 new tables
   - Migrate existing pillars to new structure
   - Populate pillar subcategories
   - Initialize user mastery levels

### What Gets Created:

**New Tables:**
- `quest_metadata` - Extended quest information
- `quest_paths` - Quest collections/paths
- `quest_customizations` - Student quest proposals
- `user_badges` - Location and achievement badges
- `user_mastery` - User XP levels (1-13+)
- `pillar_subcategories` - School subject categories

**Updated Pillars:**
- `creativity` → `arts_creativity`
- `critical_thinking` → `stem_logic`
- `practical_skills` → `life_wellness`
- `communication` → `language_communication`
- `cultural_literacy` → `society_culture`

### After Migration:

Check that the migration worked by running this query:
```sql
-- Check new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'quest_metadata',
  'quest_paths',
  'quest_customizations',
  'user_badges',
  'user_mastery',
  'pillar_subcategories'
);

-- Check pillar migration
SELECT DISTINCT pillar FROM quest_tasks;
-- Should show: arts_creativity, stem_logic, life_wellness, language_communication, society_culture

-- Check user mastery levels
SELECT COUNT(*) as user_count, AVG(mastery_level) as avg_level 
FROM user_mastery;
```

### Troubleshooting:

If you get errors about tables already existing:
- The migration is idempotent, it's safe to run multiple times
- Check if tables were partially created

If pillar migration fails:
- Check that all quest_tasks have valid pillar values
- Manually update any NULL pillar values first

### Next Steps After Migration:

1. **Test the new structure** by creating a quest with new pillars
2. **Update backend APIs** to use new pillar values
3. **Update frontend** to display new pillar names
4. **Set up Gemini API** for AI-assisted quest creation