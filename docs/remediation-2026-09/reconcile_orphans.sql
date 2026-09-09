--
-- OPS-03, part 2 -- remove the 91 orphan rows so `supabase db push` can run.
--
-- WHY THIS IS NEEDED, AND WHY PART 1 WAS NOT ENOUGH
--
-- reconcile_schema_migrations.sql gave every FILE in supabase/migrations/ a
-- history row. That was half the job. `db push` requires correspondence in BOTH
-- directions and refuses on history rows that have no file:
--
--     Remote migration versions not found in local migrations directory.
--
-- These 91 are those rows. Each records what actually ran, stamped at apply
-- time, while the file carries an earlier stamp -- so one migration is present
-- twice under two versions. Deleting the apply-time twin leaves the file's
-- version, which is what the directory and `db push` agree on.
--
-- This is the Supabase CLI's own prescription. It printed the identical list and
-- told us to run `migration repair --status reverted` on it; that command does
-- exactly this DELETE. Doing it as SQL keeps it reviewable and gives it a
-- rollback, which the CLI command does not have.
--
-- WHAT IS LOST
--
-- The record of what ran and when, including the `statements` column -- which
-- for three of these rows is the only machine-readable copy of their SQL. All
-- 91 rows were exported first, in full, to
--
--     ~/optio-schema_migrations-orphans-20260909.sql
--
-- outside the repository. That file is the only undo. Do not delete it without
-- deciding you never want this history back.
--
-- Read one of them before running this: 20260814183451
-- (security_audit_revoke_trigger_fn_from_public) is the single migration
-- production has that the repo never did. Its effect survives in the baseline's
-- function-GRANTS section; its existence as a migration does not survive this.
--
-- WHAT IS NOT AFFECTED
--
-- No schema object. No application data. This table is bookkeeping; every object
-- these rows describe stays exactly where it is. Verified before running:
-- public holds 241 tables, and it must still hold 241 afterwards.
--
-- Rollback: reconcile_orphans_rollback.sql, in this directory, which restores
-- from the export above.
--

BEGIN;

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN (
    '20260714000000',  -- baseline_squash_for_branching,
    '20260715171539',  -- sis_enrollment_waitlist,
    '20260718124615',  -- sis_waitlist_sibling_priority,
    '20260722183334',  -- sis_teacher_portal,
    '20260723000000',  -- add_preferred_challenge_level,
    '20260723200951',  -- add_success_criteria_to_tasks,
    '20260723204739',  -- gryffin_sis_features,
    '20260723230456',  -- add_households_ufa_private,
    '20260723230831',  -- add_sis_events_audience,
    '20260724190605',  -- class_assistant_instructors,
    '20260724190609',  -- class_discussion_boards,
    '20260724194337',  -- onboarding_family_audience,
    '20260724194340',  -- sis_secure_documents,
    '20260724194341',  -- form_submitter_role,
    '20260727151723',  -- household_funding_source,
    '20260727153851',  -- 20260727_community_hub,
    '20260727153925',  -- billing_processing_fee_and_invoice_number,
    '20260727233017',  -- 20260727_class_materials,
    '20260806151124',  -- 20260806_onboarding_assignment_audience,
    '20260806151129',  -- 20260806_family_directory_default_and_carpool,
    '20260806214947',  -- sis_curriculum_courses,
    '20260806215208',  -- sis_training_audience,
    '20260807030322',  -- carpool_board,
    '20260810215829',  -- drop_showcase_feature,
    '20260810215859',  -- drop_student_curated_classes,
    '20260811043950',  -- icreate_otp_attempts,
    '20260814180902',  -- unified_tasks,
    '20260814182626',  -- prior_learning_records,
    '20260814183425',  -- security_audit_fixes,
    '20260814183451',  -- security_audit_revoke_trigger_fn_from_public,
    '20260814194757',  -- student_weekly_xp_goals,
    '20260814202938',  -- peer_connections,
    '20260815180126',  -- backfill_taskless_enrollments,
    '20260815181501',  -- organization_archive_and_delete,
    '20260815203606',  -- account_deletion_executor,
    '20260815203618',  -- observer_invite_single_use,
    '20260815203634',  -- refresh_token_families,
    '20260815203829',  -- db_security_hardening,
    '20260815203919',  -- revoke_public_function_grants,
    '20260815213500',  -- private_storage_buckets,
    '20260815213516',  -- private_quest_evidence_bucket,
    '20260817151140',  -- training_auto_assign,
    '20260817154430',  -- prior_learning_to_transcript,
    '20260817160853',  -- quest_source_material,
    '20260817194908',  -- training_multi_audience,
    '20260818023118',  -- access_log_accessor_roles,
    '20260819005230',  -- required_family_signatures,
    '20260819152339',  -- sis_invoice_line_item_kind,
    '20260819205757',  -- user_delete_actor_fks_set_null,
    '20260820011403',  -- secure_document_requires_signature,
    '20260820220354',  -- contact_type_allow_course_purchase,
    '20260821230250',  -- adult_phone_verification,
    '20260821234947',  -- household_payment_plan_preference,
    '20260822212337',  -- onboarding_template_directions,
    '20260822214034',  -- form_type_label,
    '20260822214354',  -- sis_form_templates,
    '20260823020231',  -- crm_core_tables,
    '20260823235706',  -- announcement_read_receipts,
    '20260824144243',  -- school_inbox,
    '20260824233745',  -- admin_platform_metrics_daily,
    '20260825175157',  -- class_enrollments_enrolled_by_set_null,
    '20260825204917',  -- oea_help_video_views,
    '20260825215614',  -- rename_icreate_registrations_to_registrations,
    '20260825224531',  -- drop_icreate_registrations_compat,
    '20260827134505',  -- account_deletion_unblock,
    '20260827135952',  -- refresh_family_client_fingerprint,
    '20260829011803',  -- org_resources_pinned,
    '20260829013005',  -- announcements_is_targeted,
    '20260830121111',  -- cleanup_user_data_security_definer,
    '20260830123034',  -- class_discussion_switch,
    '20260831185113',  -- sis_recurring_tuition,
    '20260831200446',  -- academy_enrollment_and_records_destination,
    '20260831214044',  -- announcement_in_app_channel,
    '20260831215336',  -- announcement_attachments,
    '20260831224611',  -- class_chat_audiences,
    '20260902192215',  -- prior_learning_staff_source,
    '20260902193733',  -- planned_absence_dedupe_whole_day,
    '20260902224403',  -- sis_curriculum_materials,
    '20260902224618',  -- recurring_tuition_setup_link_sent,
    '20260902225136',  -- class_materials_visibility,
    '20260903183141',  -- clear_phantom_conversation_timestamps,
    '20260903202528',  -- qualify_tables_in_empty_search_path_functions,
    '20260903220433',  -- drop_dead_get_human_quest_performance,
    '20260904172159',  -- class_parent_chat_rename,
    '20260904173100',  -- organizations_data_api_grants,
    '20260904175401',  -- optio_academy_credit_review_by_optio,
    '20260905175737',  -- sis_recognition_comments,
    '20260907171258',  -- org_kiosk_devices_token,
    '20260908222109',  -- message_email_relays,
    '20260908222113',  -- device_tokens_one_account_per_device,
    '20260908232757'  -- parent_weekly_digest_sends
  );

-- Expect 71: the 5 that always matched a file, plus the 66 written by
-- reconcile_schema_migrations.sql. One file (the schema-drop migration) is
-- deliberately still without a row -- it has genuinely not been applied.
SELECT count(*) AS remaining_history_rows FROM supabase_migrations.schema_migrations;

COMMIT;
