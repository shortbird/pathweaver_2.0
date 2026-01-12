-- Migration: Add trigger to clean up user data before deletion
-- This allows users to be deleted directly from Supabase dashboard
-- Run this in Supabase SQL Editor

-- Create function to clean up user data before deletion
CREATE OR REPLACE FUNCTION public.cleanup_user_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete from tables with user_id foreign key
    DELETE FROM public.user_skill_xp WHERE user_id = OLD.id;
    DELETE FROM public.user_diplomas WHERE user_id = OLD.id;
    DELETE FROM public.user_quest_tasks WHERE user_id = OLD.id;
    DELETE FROM public.quest_task_completions WHERE user_id = OLD.id;
    DELETE FROM public.user_quest_progress WHERE user_id = OLD.id;
    DELETE FROM public.notifications WHERE user_id = OLD.id;
    DELETE FROM public.badges_earned WHERE user_id = OLD.id;
    DELETE FROM public.user_course_enrollments WHERE user_id = OLD.id;
    DELETE FROM public.user_lesson_progress WHERE user_id = OLD.id;

    -- Delete friendships (both directions)
    DELETE FROM public.friendships WHERE requester_id = OLD.id OR addressee_id = OLD.id;

    -- Delete observer relationships and invitations
    DELETE FROM public.observer_relationships WHERE student_id = OLD.id OR observer_id = OLD.id;
    DELETE FROM public.observer_invitations WHERE student_id = OLD.id OR observer_id = OLD.id;

    -- Clear foreign key references (set to NULL)
    UPDATE public.org_invitations SET accepted_by = NULL WHERE accepted_by = OLD.id;
    UPDATE public.org_invitations SET invited_by = NULL WHERE invited_by = OLD.id;
    UPDATE public.quests SET created_by = NULL WHERE created_by = OLD.id;

    -- Delete the user record from public.users
    DELETE FROM public.users WHERE id = OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users (runs BEFORE DELETE)
DROP TRIGGER IF EXISTS on_auth_user_delete ON auth.users;
CREATE TRIGGER on_auth_user_delete
    BEFORE DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.cleanup_user_data();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.cleanup_user_data() TO service_role;
