--
-- Rollback for reconcile_schema_migrations.sql (OPS-03).
--
-- Deletes exactly the rows that script wrote and provably nothing else: the
-- filter is `created_by = 'reconcile-ops-03'`, a marker no other writer of this
-- table uses. The 90 rows written by hand carry an email address and the 6
-- pre-existing NULL-created_by rows carry NULL, so neither can match.
--
-- The version list is repeated as a second filter. It is redundant against the
-- marker, and it is here on purpose: if someone ever reuses that marker string,
-- the blast radius stays these 67 versions instead of everything bearing it.
--
-- WHAT THIS DOES NOT DO
--
-- It does not revert any schema change. The forward script changes no schema, so
-- there is nothing to revert. Running this returns `supabase db push` to
-- proposing 67 already-applied migrations, which is the state described in
-- supabase/migrations/README.md -- undesirable, but not destructive.
--
-- Verify before: SELECT count(*) FROM supabase_migrations.schema_migrations;   -- expect 163
-- Verify after:  SELECT count(*) FROM supabase_migrations.schema_migrations;   -- expect 96
--

BEGIN;

DELETE FROM supabase_migrations.schema_migrations
WHERE created_by = 'reconcile-ops-03'
  AND version IN (
    '20260812000000',  -- baseline_prod_schema
    '20260814000000',  -- unified_tasks
    '20260814010000',  -- prior_learning_records
    '20260814020000',  -- security_audit_fixes
    '20260814030000',  -- student_weekly_xp_goals
    '20260814040000',  -- peer_connections
    '20260815000000',  -- backfill_taskless_enrollments
    '20260815010000',  -- organization_archive_and_delete
    '20260815020000',  -- private_storage_buckets
    '20260815030000',  -- refresh_token_families
    '20260815040000',  -- observer_invite_single_use
    '20260815050000',  -- account_deletion_executor
    '20260815060000',  -- db_security_hardening
    '20260815070000',  -- private_quest_evidence_bucket
    '20260815080000',  -- revoke_public_function_grants
    '20260817000000',  -- training_auto_assign
    '20260817010000',  -- prior_learning_to_transcript
    '20260817020000',  -- quest_source_material
    '20260817030000',  -- training_multi_audience
    '20260817040000',  -- access_log_accessor_roles
    '20260818000000',  -- required_family_signatures
    '20260819000000',  -- sis_invoice_line_item_kind
    '20260819010000',  -- user_delete_actor_fks_set_null
    '20260820000000',  -- secure_document_requires_signature
    '20260820120000',  -- contact_type_allow_course_purchase
    '20260821130000',  -- adult_phone_verification
    '20260821150000',  -- household_payment_plan_preference
    '20260822090000',  -- crm_core_tables
    '20260822120000',  -- onboarding_template_directions
    '20260822130000',  -- form_type_label
    '20260822140000',  -- sis_form_templates
    '20260823000000',  -- announcement_read_receipts
    '20260824090000',  -- school_inbox
    '20260825090000',  -- class_enrollments_enrolled_by_set_null
    '20260825120000',  -- hearthwood_hide_pillars
    '20260825140000',  -- oea_help_video_views
    '20260825160000',  -- rename_icreate_registrations_to_registrations
    '20260825160100',  -- drop_icreate_registrations_compat
    '20260827100000',  -- account_deletion_unblock
    '20260827140000',  -- refresh_family_client_fingerprint
    '20260827150000',  -- announcement_board_link
    '20260828100000',  -- org_resources_pinned
    '20260828110000',  -- announcements_is_targeted
    '20260830100000',  -- cleanup_user_data_security_definer
    '20260830110000',  -- class_discussion_switch
    '20260831000000',  -- academy_enrollment_and_records_destination
    '20260831090000',  -- class_chat_audiences
    '20260831120000',  -- sis_recurring_tuition
    '20260831130000',  -- announcement_in_app_channel
    '20260831130100',  -- announcement_attachments
    '20260902010000',  -- prior_learning_staff_source
    '20260902200000',  -- planned_absence_dedupe_whole_day
    '20260902210000',  -- sis_curriculum_materials
    '20260902220000',  -- recurring_tuition_setup_link_sent
    '20260902230000',  -- class_materials_visibility
    '20260903120000',  -- organizations_data_api_grants
    '20260903180000',  -- clear_phantom_conversation_timestamps
    '20260903200000',  -- qualify_tables_in_empty_search_path_functions
    '20260903210000',  -- drop_dead_get_human_quest_performance
    '20260904120000',  -- class_parent_chat_rename
    '20260904160000',  -- optio_academy_credit_review_by_optio
    '20260905120000',  -- sis_recognition_comments
    '20260907180000',  -- org_kiosk_devices_token
    '20260908120000',  -- message_email_relays
    '20260908130000',  -- device_tokens_one_account_per_device
    '20260908150000',  -- parent_weekly_digest_sends
    '20260909144435'  -- baseline_20260909
  );

SELECT count(*) AS remaining_reconcile_rows
FROM supabase_migrations.schema_migrations
WHERE created_by = 'reconcile-ops-03';   -- expect 0

SELECT count(*) AS total_history_rows
FROM supabase_migrations.schema_migrations;   -- expect 96

COMMIT;
