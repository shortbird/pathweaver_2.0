-- ============================================================================
-- Security advisor hardening (Supabase linter)
-- ============================================================================
-- Clears the bulk of the security advisor WARN findings (101 -> ~12). The
-- frontends never call PostgREST RPC (the Supabase client is used only for
-- OAuth); all data flows through the Flask backend, which uses the
-- service_role/admin client (BYPASSRLS). That makes the changes below safe.
--
-- Intentionally NOT addressed here (documented, low value / not safely doable):
--   * extension_in_public (pg_net): extrelocatable=false with 26 dependent
--     objects; ALTER EXTENSION ... SET SCHEMA fails and drop/recreate would
--     break those deps. Supabase-managed, unused by app code. Left in place.
--   * vulnerable_postgres_version: requires a Supabase dashboard upgrade.
--   * 8 anon/authenticated SECURITY DEFINER warnings on the 4 RLS-helper
--     functions (get_user_org_id, is_advisor_user, is_org_admin_user,
--     is_superadmin): these are referenced by PUBLIC RLS policies and MUST
--     keep anon+authenticated EXECUTE to evaluate. Correct as-is.
--   * 2 rls_policy_always_true on contact_submissions / promo_interest: these
--     are intentional public "anyone can submit" INSERT-only forms.

-- ----------------------------------------------------------------------------
-- 1) Revoke anon/authenticated PostgREST RPC access on SECURITY DEFINER
--    functions that nothing legitimately calls via PostgREST. Several of these
--    mutate state and bypass RLS (XP grants, etc.) and were directly callable
--    by any signed-in user via /rest/v1/rpc/<fn> using the public anon key,
--    a real privilege-escalation vector. The backend keeps working via
--    service_role. Excludes the 4 RLS-helper functions noted above.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'add_default_quest_xp()',
    'add_user_skill_xp(p_user_id uuid, p_pillar text, p_xp_amount integer)',
    'award_xp_on_completion()',
    'calculate_quest_quality_score(p_quest_id uuid)',
    'check_performance_fixes()',
    'check_quest_duplicate(p_title text, p_exclude_id uuid)',
    'check_security_fixes()',
    'count_moments_by_topic(p_user_id uuid, p_topic_type text)',
    'decrement_track_moment_count(track_id uuid)',
    'docs_articles_search_vector_update()',
    'docs_categories_updated_at()',
    'finalize_subject_xp(p_user_id uuid, p_school_subject text, p_completion_id uuid)',
    'get_effective_role(user_id uuid)',
    'get_human_quest_performance(days_back_param integer)',
    'get_learning_rhythm_status(p_student_id uuid)',
    'get_moments_for_topic(p_user_id uuid, p_topic_type text, p_topic_id uuid, p_limit integer, p_offset integer)',
    'get_monthly_active_users()',
    'get_organization_analytics(p_org_id uuid)',
    'get_parent_dependents(p_parent_id uuid)',
    'get_unassigned_moments(p_user_id uuid, p_limit integer, p_offset integer)',
    'get_user_organization(p_user_id uuid)',
    'increment_task_usage(task_id uuid)',
    'increment_track_moment_count(track_id uuid)',
    'increment_user_xp(p_user_id uuid, p_pillar text, p_amount integer)',
    'initialize_user_skills()',
    'insert_curriculum_attachment(p_quest_id uuid, p_file_name text, p_file_url text, p_file_size_bytes integer, p_file_type text, p_uploaded_by uuid, p_organization_id uuid)',
    'is_admin_user(user_id uuid)',
    'is_current_user_admin()',
    'is_promotion_eligible(p_user_id uuid)',
    'log_observer_access(p_observer_id uuid, p_student_id uuid, p_action_type character varying, p_resource_type character varying, p_resource_id uuid, p_ip_address character varying, p_user_agent text, p_request_path text, p_metadata jsonb)',
    'parent_has_access_to_student(p_parent_id uuid, p_student_id uuid)',
    'recalculate_track_moment_count(p_track_id uuid)',
    'recalculate_user_skill_xp(p_user_id uuid)',
    'reorder_evidence_blocks(p_task_completion_id uuid, p_new_order integer[])',
    'search_docs_articles(search_query text)',
    'sync_auth_user_deletion()',
    'update_course(p_id uuid, p_data jsonb)',
    'update_quest_quality_score()',
    'update_user_mastery(p_user_id uuid)',
    'verify_parent_student_access(p_parent_id uuid, p_student_id uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Pin search_path on functions that had a mutable one
--    (function_search_path_mutable). All reference only the public schema.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.get_learning_rhythm_status(p_student_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.insert_curriculum_attachment(p_quest_id uuid, p_file_name text, p_file_url text, p_file_size_bytes integer, p_file_type text, p_uploaded_by uuid, p_organization_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_lti_artifacts() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_philosophy_updated_at()  SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_user_data()             SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_showcase_consent_audit()     SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 3) Drop the "Admin full access" RLS policies that were defined for ALL roles
--    (polroles = PUBLIC) with USING/CHECK = true on sensitive transcript
--    tables. As written they gave every anon/authenticated PostgREST caller
--    full read/write/delete. The backend uses service_role (BYPASSRLS), so
--    RLS-enabled-with-no-policy = deny-all for anon/authenticated, backend
--    unaffected. (Now shows as the benign rls_enabled_no_policy INFO.)
-- ----------------------------------------------------------------------------
ALTER TABLE public.planned_credits      ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access on planned_credits"      ON public.planned_credits;
ALTER TABLE public.transcript_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access on transcript_overrides" ON public.transcript_overrides;

-- ----------------------------------------------------------------------------
-- 4) Stop anon from listing the public site-assets bucket
--    (public_bucket_allows_listing). Public object reads continue to work via
--    the bucket's public=true flag; the /object/public path does not consult
--    this RLS policy (verified: assets still return HTTP 200 after the drop).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view site assets" ON storage.objects;
