-- Security fixes for Supabase issues
-- Generated on 2025-01-08

-- =============================================
-- 1. ENABLE RLS ON UNPROTECTED TABLES (CRITICAL ERRORS)
-- =============================================

-- Enable RLS on learning_logs_backup
ALTER TABLE public.learning_logs_backup ENABLE ROW LEVEL SECURITY;

-- Enable RLS on submissions
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- Enable RLS on friendships
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Enable RLS on quest_collaborations
ALTER TABLE public.quest_collaborations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on learning_logs
ALTER TABLE public.learning_logs ENABLE ROW LEVEL SECURITY;

-- Enable RLS on quest_reviews
ALTER TABLE public.quest_reviews ENABLE ROW LEVEL SECURITY;

-- Enable RLS on user_achievements
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Enable RLS on leaderboards
ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 2. CREATE RLS POLICIES FOR NEWLY PROTECTED TABLES
-- =============================================

-- Policies for learning_logs_backup (backup table, limited access)
CREATE POLICY "Admins can manage learning_logs_backup" ON public.learning_logs_backup
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Policies for submissions
CREATE POLICY "Users can view own submissions" ON public.submissions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own submissions" ON public.submissions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own submissions" ON public.submissions
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all submissions" ON public.submissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Policies for friendships
CREATE POLICY "Users can view own friendships" ON public.friendships
  FOR SELECT USING (
    user_id = auth.uid() OR friend_id = auth.uid()
  );

CREATE POLICY "Users can create friendships" ON public.friendships
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own friendships" ON public.friendships
  FOR UPDATE USING (user_id = auth.uid() OR friend_id = auth.uid());

CREATE POLICY "Users can delete own friendships" ON public.friendships
  FOR DELETE USING (user_id = auth.uid() OR friend_id = auth.uid());

-- Policies for quest_collaborations
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

-- Policies for learning_logs
CREATE POLICY "Users can view own learning logs" ON public.learning_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own learning logs" ON public.learning_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own learning logs" ON public.learning_logs
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own learning logs" ON public.learning_logs
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Public can view learning logs for public quests" ON public.learning_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_quests uq
      JOIN public.quests q ON q.id = uq.quest_id
      WHERE uq.id = learning_logs.user_quest_id
      AND uq.status = 'completed'
    )
  );

-- Policies for quest_reviews
CREATE POLICY "Users can view all quest reviews" ON public.quest_reviews
  FOR SELECT USING (true);

CREATE POLICY "Users can create own quest reviews" ON public.quest_reviews
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own quest reviews" ON public.quest_reviews
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own quest reviews" ON public.quest_reviews
  FOR DELETE USING (user_id = auth.uid());

-- Policies for user_achievements
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

-- Policies for leaderboards
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

-- =============================================
-- 3. FIX SECURITY DEFINER VIEW
-- =============================================

-- Drop and recreate the view without SECURITY DEFINER
DROP VIEW IF EXISTS public.ai_generation_analytics CASCADE;

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