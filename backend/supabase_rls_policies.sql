-- Row Level Security (RLS) Policies for OptioQuest
-- Run these in your Supabase SQL Editor
-- These policies ensure users can only access their own data

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE diplomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_tasks ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- User quests policies
-- Users can view their own quest enrollments
CREATE POLICY "Users can view own quest enrollments" ON user_quests
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own quest enrollments
CREATE POLICY "Users can enroll in quests" ON user_quests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own quest enrollments
CREATE POLICY "Users can update own quest progress" ON user_quests
    FOR UPDATE USING (auth.uid() = user_id);

-- User quest tasks policies
-- Users can view their own task completions
CREATE POLICY "Users can view own task completions" ON user_quest_tasks
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own task completions
CREATE POLICY "Users can complete tasks" ON user_quest_tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User skill XP policies
-- Users can view their own XP
CREATE POLICY "Users can view own XP" ON user_skill_xp
    FOR SELECT USING (auth.uid() = user_id);

-- Note: XP updates should be done through service role for security

-- Diplomas policies
-- Users can view their own diploma
CREATE POLICY "Users can view own diploma" ON diplomas
    FOR SELECT USING (auth.uid() = user_id);

-- Activity log policies
-- Users can view their own activity
CREATE POLICY "Users can view own activity" ON activity_log
    FOR SELECT USING (auth.uid() = user_id);

-- Public quest viewing (all users can view active quests)
CREATE POLICY "Anyone can view active quests" ON quests
    FOR SELECT USING (is_active = true);

-- Public quest task viewing
CREATE POLICY "Anyone can view quest tasks" ON quest_tasks
    FOR SELECT USING (true);

-- Admin policies (requires admin check)
-- Note: You'll need to create an is_admin function that checks user role
-- Example:
-- CREATE OR REPLACE FUNCTION is_admin()
-- RETURNS boolean AS $$
-- BEGIN
--   RETURN EXISTS (
--     SELECT 1 FROM users 
--     WHERE id = auth.uid() 
--     AND role = 'admin'
--   );
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Then create admin policies like:
-- CREATE POLICY "Admins can do everything on quests" ON quests
--     FOR ALL USING (is_admin());