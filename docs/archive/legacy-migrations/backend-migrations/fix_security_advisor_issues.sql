-- Fix Security Advisor Issues
-- 1. Recreate user_credit_summary view without SECURITY DEFINER
-- 2. Enable RLS on tables missing protection
-- 3. Add appropriate RLS policies for each table

-- =============================================================================
-- 1. FIX SECURITY DEFINER VIEW
-- =============================================================================

-- Drop and recreate user_credit_summary with explicit SECURITY INVOKER
DROP VIEW IF EXISTS public.user_credit_summary CASCADE;

CREATE VIEW public.user_credit_summary
WITH (security_invoker = true)
AS
SELECT
    user_id,
    credit_type,
    academic_year,
    SUM(credits_earned) AS total_credits,
    SUM(xp_amount) AS total_xp,
    COUNT(*) AS task_count
FROM credit_ledger
GROUP BY user_id, credit_type, academic_year;

-- Grant appropriate permissions
GRANT SELECT ON public.user_credit_summary TO authenticated;
GRANT SELECT ON public.user_credit_summary TO service_role;

-- =============================================================================
-- 2. ENABLE RLS ON TABLES
-- =============================================================================

-- Enable RLS on account_deletion_log
ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;

-- Enable RLS on parental_consent_log
ALTER TABLE public.parental_consent_log ENABLE ROW LEVEL SECURITY;

-- Enable RLS on direct_messages
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Enable RLS on message_conversations
ALTER TABLE public.message_conversations ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. CREATE RLS POLICIES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- account_deletion_log policies
-- -----------------------------------------------------------------------------

-- Admin can read all deletion logs
CREATE POLICY "Admins can read all account deletion logs"
ON public.account_deletion_log
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
);

-- Users can read their own deletion log
CREATE POLICY "Users can read their own account deletion log"
ON public.account_deletion_log
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- System can insert deletion logs (backend uses service_role, bypasses RLS)
-- No explicit policy needed - service_role bypasses RLS

-- -----------------------------------------------------------------------------
-- parental_consent_log policies
-- -----------------------------------------------------------------------------

-- Admin can read all consent logs
CREATE POLICY "Admins can read all parental consent logs"
ON public.parental_consent_log
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
);

-- Users can read their own consent log
CREATE POLICY "Users can read their own parental consent log"
ON public.parental_consent_log
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- System can insert consent logs (backend uses service_role, bypasses RLS)
-- No explicit policy needed - service_role bypasses RLS

-- -----------------------------------------------------------------------------
-- direct_messages policies
-- -----------------------------------------------------------------------------

-- Users can read messages where they are sender or recipient
CREATE POLICY "Users can read their own messages"
ON public.direct_messages
FOR SELECT
TO authenticated
USING (
    sender_id = auth.uid() OR recipient_id = auth.uid()
);

-- Users can insert messages where they are the sender
CREATE POLICY "Users can send messages"
ON public.direct_messages
FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid());

-- Users can update their own messages (e.g., mark as read if recipient)
CREATE POLICY "Users can update messages they received"
ON public.direct_messages
FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

-- Admins can read all messages (for moderation/support)
CREATE POLICY "Admins can read all messages"
ON public.direct_messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
);

-- -----------------------------------------------------------------------------
-- message_conversations policies
-- -----------------------------------------------------------------------------

-- Users can read conversations they're part of
CREATE POLICY "Users can read their conversations"
ON public.message_conversations
FOR SELECT
TO authenticated
USING (
    participant_1_id = auth.uid() OR participant_2_id = auth.uid()
);

-- Users can insert conversations where they are participant_1
CREATE POLICY "Users can create conversations"
ON public.message_conversations
FOR INSERT
TO authenticated
WITH CHECK (participant_1_id = auth.uid());

-- Users can update conversations they're part of
CREATE POLICY "Users can update their conversations"
ON public.message_conversations
FOR UPDATE
TO authenticated
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
WITH CHECK (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

-- Admins can read all conversations (for moderation/support)
CREATE POLICY "Admins can read all conversations"
ON public.message_conversations
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
);

-- =============================================================================
-- VERIFICATION COMMENTS
-- =============================================================================

-- Backend Impact: NONE
-- - Backend uses get_supabase_admin_client() with service_role key
-- - service_role bypasses RLS completely
-- - RLS acts as defense-in-depth for direct database access
-- - Protects against accidental exposure via PostgREST API

-- Security Improvement:
-- - Prevents unauthorized direct database access
-- - Enforces least-privilege access when using authenticated role
-- - Admins retain full read access for compliance/support
-- - Users can only access their own data
