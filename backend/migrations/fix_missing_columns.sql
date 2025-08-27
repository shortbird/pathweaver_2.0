-- Fix missing columns and data type issues

-- 1. Add subscription_tier to users table if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'free' 
CHECK (subscription_tier IN ('free', 'basic', 'premium', 'enterprise'));

-- 2. Fix learning_logs table - the user_quest_id should be UUID not integer
-- First check if learning_logs table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_logs') THEN
        -- Check column type
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'learning_logs' 
            AND column_name = 'user_quest_id' 
            AND data_type = 'integer'
        ) THEN
            -- Need to recreate the table with correct type
            -- First backup any existing data
            CREATE TABLE IF NOT EXISTS learning_logs_backup AS SELECT * FROM learning_logs;
            
            -- Drop the old table
            DROP TABLE learning_logs CASCADE;
        END IF;
    END IF;
END $$;

-- 3. Create learning_logs table with correct structure
CREATE TABLE IF NOT EXISTS learning_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_quest_id UUID NOT NULL REFERENCES user_quests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    log_entry TEXT NOT NULL,
    time_spent_minutes INTEGER DEFAULT 0,
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Fix submissions table - ensure user_quest_id is UUID
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'submissions') THEN
        -- Check column type
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'submissions' 
            AND column_name = 'user_quest_id' 
            AND data_type = 'integer'
        ) THEN
            -- Need to recreate the table with correct type
            CREATE TABLE IF NOT EXISTS submissions_backup AS SELECT * FROM submissions;
            DROP TABLE submissions CASCADE;
        END IF;
    END IF;
END $$;

-- 5. Create submissions table with correct structure
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_quest_id UUID NOT NULL REFERENCES user_quests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    submission_text TEXT,
    submission_url TEXT,
    submission_file_url TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision')),
    feedback TEXT,
    score DECIMAL(5,2),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewer_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Add other potentially missing columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS achievements_count INTEGER DEFAULT 0;

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_learning_logs_user_quest_id ON learning_logs(user_quest_id);
CREATE INDEX IF NOT EXISTS idx_learning_logs_user_id ON learning_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_quest_id ON submissions(user_quest_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);

-- 8. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON submissions TO authenticated;

-- 9. Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_learning_logs_updated_at ON learning_logs;
CREATE TRIGGER update_learning_logs_updated_at 
    BEFORE UPDATE ON learning_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_submissions_updated_at ON submissions;
CREATE TRIGGER update_submissions_updated_at 
    BEFORE UPDATE ON submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Verify the fixes
DO $$
DECLARE
    result TEXT := '';
BEGIN
    -- Check users table
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'subscription_tier') THEN
        result := result || 'subscription_tier column: ✓' || E'\n';
    ELSE
        result := result || 'subscription_tier column: ✗' || E'\n';
    END IF;
    
    -- Check learning_logs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'learning_logs') THEN
        result := result || 'learning_logs table: ✓' || E'\n';
    ELSE
        result := result || 'learning_logs table: ✗' || E'\n';
    END IF;
    
    -- Check submissions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'submissions') THEN
        result := result || 'submissions table: ✓' || E'\n';
    ELSE
        result := result || 'submissions table: ✗' || E'\n';
    END IF;
    
    RAISE NOTICE '%', result;
    RAISE NOTICE 'Migration completed successfully!';
END $$;