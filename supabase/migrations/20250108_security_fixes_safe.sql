-- Security fixes for Supabase issues (Safe version with error handling)
-- Generated on 2025-01-08
-- This version checks for table/column existence before applying changes

-- =============================================
-- 1. ENABLE RLS ON UNPROTECTED TABLES (CRITICAL ERRORS)
-- =============================================

-- Enable RLS only if tables exist
DO $$ 
BEGIN
    -- Enable RLS on learning_logs_backup
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'learning_logs_backup') THEN
        ALTER TABLE public.learning_logs_backup ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on submissions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'submissions') THEN
        ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on friendships
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'friendships') THEN
        ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on quest_collaborations
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quest_collaborations') THEN
        ALTER TABLE public.quest_collaborations ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on learning_logs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'learning_logs') THEN
        ALTER TABLE public.learning_logs ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on quest_reviews
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quest_reviews') THEN
        ALTER TABLE public.quest_reviews ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on user_achievements
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_achievements') THEN
        ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on leaderboards
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leaderboards') THEN
        ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- =============================================
-- 2. CREATE RLS POLICIES FOR NEWLY PROTECTED TABLES
-- =============================================

-- Drop existing policies if they exist (to avoid conflicts)
DO $$ 
BEGIN
    -- Drop policies for learning_logs_backup
    DROP POLICY IF EXISTS "Admins can manage learning_logs_backup" ON public.learning_logs_backup;
    
    -- Drop policies for submissions
    DROP POLICY IF EXISTS "Users can view own submissions" ON public.submissions;
    DROP POLICY IF EXISTS "Users can create own submissions" ON public.submissions;
    DROP POLICY IF EXISTS "Users can update own submissions" ON public.submissions;
    DROP POLICY IF EXISTS "Educators can manage submissions they review" ON public.submissions;
    DROP POLICY IF EXISTS "Admins can manage all submissions" ON public.submissions;
    
    -- Drop policies for friendships
    DROP POLICY IF EXISTS "Users can view own friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can create friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;
    DROP POLICY IF EXISTS "Users can delete own friendships" ON public.friendships;
    
    -- Drop policies for quest_collaborations
    DROP POLICY IF EXISTS "Users can view collaborations they're part of" ON public.quest_collaborations;
    DROP POLICY IF EXISTS "Users can create collaboration requests" ON public.quest_collaborations;
    DROP POLICY IF EXISTS "Users can update collaborations they're part of" ON public.quest_collaborations;
    DROP POLICY IF EXISTS "Admins can manage all collaborations" ON public.quest_collaborations;
    
    -- Drop policies for learning_logs
    DROP POLICY IF EXISTS "Users can view own learning logs" ON public.learning_logs;
    DROP POLICY IF EXISTS "Users can create own learning logs" ON public.learning_logs;
    DROP POLICY IF EXISTS "Users can update own learning logs" ON public.learning_logs;
    DROP POLICY IF EXISTS "Users can delete own learning logs" ON public.learning_logs;
    DROP POLICY IF EXISTS "Public can view learning logs for completed quests" ON public.learning_logs;
    
    -- Drop policies for quest_reviews
    DROP POLICY IF EXISTS "Users can view all quest reviews" ON public.quest_reviews;
    DROP POLICY IF EXISTS "Users can create own quest reviews" ON public.quest_reviews;
    DROP POLICY IF EXISTS "Users can update own quest reviews" ON public.quest_reviews;
    DROP POLICY IF EXISTS "Users can delete own quest reviews" ON public.quest_reviews;
    
    -- Drop policies for user_achievements
    DROP POLICY IF EXISTS "Users can view own achievements" ON public.user_achievements;
    DROP POLICY IF EXISTS "Public can view achievements for public profiles" ON public.user_achievements;
    DROP POLICY IF EXISTS "System can create achievements" ON public.user_achievements;
    
    -- Drop policies for leaderboards
    DROP POLICY IF EXISTS "Public can view leaderboards" ON public.leaderboards;
    DROP POLICY IF EXISTS "System can manage leaderboards" ON public.leaderboards;
EXCEPTION
    WHEN OTHERS THEN
        -- Continue even if some drops fail
        NULL;
END $$;

-- Create new policies with existence checks
DO $$ 
BEGIN
    -- Policies for learning_logs_backup (backup table, limited access)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'learning_logs_backup') THEN
        CREATE POLICY "Admins can manage learning_logs_backup" ON public.learning_logs_backup
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.users
                WHERE users.id = auth.uid()
                AND users.role = 'admin'
            )
        );
    END IF;

    -- Policies for submissions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'submissions') THEN
        CREATE POLICY "Users can view own submissions" ON public.submissions
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.user_quests
                WHERE user_quests.id = submissions.user_quest_id
                AND user_quests.user_id = auth.uid()
            )
        );

        CREATE POLICY "Users can create own submissions" ON public.submissions
        FOR INSERT WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.user_quests
                WHERE user_quests.id = submissions.user_quest_id
                AND user_quests.user_id = auth.uid()
            )
        );

        CREATE POLICY "Users can update own submissions" ON public.submissions
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM public.user_quests
                WHERE user_quests.id = submissions.user_quest_id
                AND user_quests.user_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.user_quests
                WHERE user_quests.id = submissions.user_quest_id
                AND user_quests.user_id = auth.uid()
            )
        );

        CREATE POLICY "Educators can manage submissions they review" ON public.submissions
        FOR ALL USING (educator_id = auth.uid());

        CREATE POLICY "Admins can manage all submissions" ON public.submissions
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.users
                WHERE users.id = auth.uid()
                AND users.role = 'admin'
            )
        );
    END IF;

    -- Policies for friendships
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'friendships') THEN
        CREATE POLICY "Users can view own friendships" ON public.friendships
        FOR SELECT USING (
            requester_id = auth.uid() OR addressee_id = auth.uid()
        );

        CREATE POLICY "Users can create friendships" ON public.friendships
        FOR INSERT WITH CHECK (requester_id = auth.uid());

        CREATE POLICY "Users can update own friendships" ON public.friendships
        FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

        CREATE POLICY "Users can delete own friendships" ON public.friendships
        FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());
    END IF;

    -- Policies for quest_collaborations
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quest_collaborations') THEN
        CREATE POLICY "Users can view collaborations they're part of" ON public.quest_collaborations
        FOR SELECT USING (
            requester_id = auth.uid() OR partner_id = auth.uid()
        );

        CREATE POLICY "Users can create collaboration requests" ON public.quest_collaborations
        FOR INSERT WITH CHECK (requester_id = auth.uid());

        CREATE POLICY "Users can update collaborations they're part of" ON public.quest_collaborations
        FOR UPDATE USING (
            requester_id = auth.uid() OR partner_id = auth.uid()
        );

        CREATE POLICY "Admins can manage all collaborations" ON public.quest_collaborations
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.users
                WHERE users.id = auth.uid()
                AND users.role = 'admin'
            )
        );
    END IF;

    -- Policies for learning_logs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'learning_logs') THEN
        -- Check if user_id column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'learning_logs' 
                   AND column_name = 'user_id') THEN
            
            CREATE POLICY "Users can view own learning logs" ON public.learning_logs
            FOR SELECT USING (user_id = auth.uid());

            CREATE POLICY "Users can create own learning logs" ON public.learning_logs
            FOR INSERT WITH CHECK (user_id = auth.uid());

            CREATE POLICY "Users can update own learning logs" ON public.learning_logs
            FOR UPDATE USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid());

            CREATE POLICY "Users can delete own learning logs" ON public.learning_logs
            FOR DELETE USING (user_id = auth.uid());
        END IF;

        -- Create public viewing policy using completed_at instead of status
        CREATE POLICY "Public can view learning logs for completed quests" ON public.learning_logs
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.user_quests
                WHERE user_quests.id = learning_logs.user_quest_id
                AND user_quests.completed_at IS NOT NULL
            )
        );
    END IF;

    -- Policies for quest_reviews  
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quest_reviews') THEN
        CREATE POLICY "Users can view all quest reviews" ON public.quest_reviews
        FOR SELECT USING (true);

        -- Check if user_id column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'quest_reviews' 
                   AND column_name = 'user_id') THEN
            
            CREATE POLICY "Users can create own quest reviews" ON public.quest_reviews
            FOR INSERT WITH CHECK (user_id = auth.uid());

            CREATE POLICY "Users can update own quest reviews" ON public.quest_reviews
            FOR UPDATE USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid());

            CREATE POLICY "Users can delete own quest reviews" ON public.quest_reviews
            FOR DELETE USING (user_id = auth.uid());
        END IF;
    END IF;

    -- Policies for user_achievements
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_achievements') THEN
        -- Check if user_id column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'user_achievements' 
                   AND column_name = 'user_id') THEN
            
            CREATE POLICY "Users can view own achievements" ON public.user_achievements
            FOR SELECT USING (user_id = auth.uid());

            CREATE POLICY "Public can view achievements for public profiles" ON public.user_achievements
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.diplomas
                    WHERE diplomas.user_id = user_achievements.user_id
                    AND diplomas.public_visibility = true
                )
            );

            CREATE POLICY "System can create achievements" ON public.user_achievements
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.users
                    WHERE users.id = auth.uid()
                    AND (users.role = 'admin' OR auth.uid() = user_id)
                )
            );
        END IF;
    END IF;

    -- Policies for leaderboards
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leaderboards') THEN
        CREATE POLICY "Public can view leaderboards" ON public.leaderboards
        FOR SELECT USING (true);

        CREATE POLICY "System can manage leaderboards" ON public.leaderboards
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.users
                WHERE users.id = auth.uid()
                AND users.role = 'admin'
            )
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but continue
        RAISE NOTICE 'Error creating policies: %', SQLERRM;
END $$;

-- =============================================
-- 3. FIX SECURITY DEFINER VIEW (if it exists)
-- =============================================

DO $$
BEGIN
    -- Drop and recreate the view without SECURITY DEFINER
    DROP VIEW IF EXISTS public.ai_generation_analytics CASCADE;

    -- Only create if the underlying table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'public' 
               AND table_name = 'ai_generation_jobs') THEN
        
        CREATE VIEW public.ai_generation_analytics AS
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as total_generations,
            COUNT(DISTINCT user_id) as unique_users,
            AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_rate
        FROM public.ai_generation_jobs
        GROUP BY DATE(created_at);

        -- Grant appropriate permissions
        GRANT SELECT ON public.ai_generation_analytics TO authenticated;
        GRANT SELECT ON public.ai_generation_analytics TO anon;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error handling view: %', SQLERRM;
END $$;