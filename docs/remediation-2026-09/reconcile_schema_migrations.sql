--
-- OPS-03 -- mark the reconciled migration set as applied in production history.
--
-- DO NOT RUN THIS YET. See docs/remediation-2026-09/MIGRATION_RECONCILIATION.md
-- and the NEEDS TANNER list in PHASE_2_HANDOFF.md; there is a decision to make
-- first, and a rehearsal step that should come before production.
--
-- WHAT THIS DOES
--
-- It writes 67 rows to supabase_migrations.schema_migrations and nothing else.
-- No table is created, altered, dropped or read. No application data is touched.
-- Every object these 67 versions describe is ALREADY in production -- that was
-- verified object by object, and the verification is the middle table of
-- MIGRATION_RECONCILIATION.md. This is bookkeeping catching up with reality.
--
-- WHY IT IS NEEDED
--
-- `supabase db push` decides what is pending by comparing the FILE version in
-- supabase/migrations/ against schema_migrations.version. Migrations reached
-- this database by hand, and hand-application stamps the row at APPLY time
-- while the filename was written earlier -- so 64 files carry a stamp that
-- exists nowhere in the history, 3 have no row under any name, and the new
-- baseline has none either. Today `db push` would therefore attempt 67
-- migrations that already ran. Some are IF NOT EXISTS-guarded. Not all are.
--
-- That is why .github/workflows/migrate-prod.yml refuses to apply when more
-- than `max_pending` migrations are pending: the unreconciled state cannot be
-- pushed by accident. After this script runs, `db push` sees 0 pending and the
-- workflow becomes usable for the one migration you actually mean to apply.
--
-- WHY statements IS NULL
--
-- Because it is true: these statements are not being run now, and in most cases
-- what ran differed from the file (the MCP strips BEGIN/COMMIT and rewrites the
-- comment header). Four rows already in this table carry NULL statements for
-- the same honest reason -- they were applied through Perch. A row here means
-- "this version is accounted for", not "these exact bytes executed".
--
-- created_by is set to a marker rather than an email so the rollback can delete
-- exactly the rows this script wrote and provably nothing else.
--
-- SAFETY
--
-- ON CONFLICT DO NOTHING: re-running is a no-op, and an existing row is never
-- overwritten. The whole thing is one transaction. The final SELECT prints what
-- changed; if the count is not 67 on a first run, stop and read the diff rather
-- than running it again.
--
-- Rollback: reconcile_schema_migrations_rollback.sql, in this directory.
--

BEGIN;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements, created_by)
VALUES
  ('20260812000000', 'baseline_prod_schema', NULL, 'reconcile-ops-03'),
  ('20260814000000', 'unified_tasks', NULL, 'reconcile-ops-03'),
  ('20260814010000', 'prior_learning_records', NULL, 'reconcile-ops-03'),
  ('20260814020000', 'security_audit_fixes', NULL, 'reconcile-ops-03'),
  ('20260814030000', 'student_weekly_xp_goals', NULL, 'reconcile-ops-03'),
  ('20260814040000', 'peer_connections', NULL, 'reconcile-ops-03'),
  ('20260815000000', 'backfill_taskless_enrollments', NULL, 'reconcile-ops-03'),
  ('20260815010000', 'organization_archive_and_delete', NULL, 'reconcile-ops-03'),
  ('20260815020000', 'private_storage_buckets', NULL, 'reconcile-ops-03'),
  ('20260815030000', 'refresh_token_families', NULL, 'reconcile-ops-03'),
  ('20260815040000', 'observer_invite_single_use', NULL, 'reconcile-ops-03'),
  ('20260815050000', 'account_deletion_executor', NULL, 'reconcile-ops-03'),
  ('20260815060000', 'db_security_hardening', NULL, 'reconcile-ops-03'),
  ('20260815070000', 'private_quest_evidence_bucket', NULL, 'reconcile-ops-03'),
  ('20260815080000', 'revoke_public_function_grants', NULL, 'reconcile-ops-03'),
  ('20260817000000', 'training_auto_assign', NULL, 'reconcile-ops-03'),
  ('20260817010000', 'prior_learning_to_transcript', NULL, 'reconcile-ops-03'),
  ('20260817020000', 'quest_source_material', NULL, 'reconcile-ops-03'),
  ('20260817030000', 'training_multi_audience', NULL, 'reconcile-ops-03'),
  ('20260817040000', 'access_log_accessor_roles', NULL, 'reconcile-ops-03'),
  ('20260818000000', 'required_family_signatures', NULL, 'reconcile-ops-03'),
  ('20260819000000', 'sis_invoice_line_item_kind', NULL, 'reconcile-ops-03'),
  ('20260819010000', 'user_delete_actor_fks_set_null', NULL, 'reconcile-ops-03'),
  ('20260820000000', 'secure_document_requires_signature', NULL, 'reconcile-ops-03'),
  ('20260820120000', 'contact_type_allow_course_purchase', NULL, 'reconcile-ops-03'),
  ('20260821130000', 'adult_phone_verification', NULL, 'reconcile-ops-03'),
  ('20260821150000', 'household_payment_plan_preference', NULL, 'reconcile-ops-03'),
  ('20260822090000', 'crm_core_tables', NULL, 'reconcile-ops-03'),
  ('20260822120000', 'onboarding_template_directions', NULL, 'reconcile-ops-03'),
  ('20260822130000', 'form_type_label', NULL, 'reconcile-ops-03'),
  ('20260822140000', 'sis_form_templates', NULL, 'reconcile-ops-03'),
  ('20260823000000', 'announcement_read_receipts', NULL, 'reconcile-ops-03'),
  ('20260824090000', 'school_inbox', NULL, 'reconcile-ops-03'),
  ('20260825090000', 'class_enrollments_enrolled_by_set_null', NULL, 'reconcile-ops-03'),
  ('20260825120000', 'hearthwood_hide_pillars', NULL, 'reconcile-ops-03'),
  ('20260825140000', 'oea_help_video_views', NULL, 'reconcile-ops-03'),
  ('20260825160000', 'rename_icreate_registrations_to_registrations', NULL, 'reconcile-ops-03'),
  ('20260825160100', 'drop_icreate_registrations_compat', NULL, 'reconcile-ops-03'),
  ('20260827100000', 'account_deletion_unblock', NULL, 'reconcile-ops-03'),
  ('20260827140000', 'refresh_family_client_fingerprint', NULL, 'reconcile-ops-03'),
  ('20260827150000', 'announcement_board_link', NULL, 'reconcile-ops-03'),
  ('20260828100000', 'org_resources_pinned', NULL, 'reconcile-ops-03'),
  ('20260828110000', 'announcements_is_targeted', NULL, 'reconcile-ops-03'),
  ('20260830100000', 'cleanup_user_data_security_definer', NULL, 'reconcile-ops-03'),
  ('20260830110000', 'class_discussion_switch', NULL, 'reconcile-ops-03'),
  ('20260831000000', 'academy_enrollment_and_records_destination', NULL, 'reconcile-ops-03'),
  ('20260831090000', 'class_chat_audiences', NULL, 'reconcile-ops-03'),
  ('20260831120000', 'sis_recurring_tuition', NULL, 'reconcile-ops-03'),
  ('20260831130000', 'announcement_in_app_channel', NULL, 'reconcile-ops-03'),
  ('20260831130100', 'announcement_attachments', NULL, 'reconcile-ops-03'),
  ('20260902010000', 'prior_learning_staff_source', NULL, 'reconcile-ops-03'),
  ('20260902200000', 'planned_absence_dedupe_whole_day', NULL, 'reconcile-ops-03'),
  ('20260902210000', 'sis_curriculum_materials', NULL, 'reconcile-ops-03'),
  ('20260902220000', 'recurring_tuition_setup_link_sent', NULL, 'reconcile-ops-03'),
  ('20260902230000', 'class_materials_visibility', NULL, 'reconcile-ops-03'),
  ('20260903120000', 'organizations_data_api_grants', NULL, 'reconcile-ops-03'),
  ('20260903180000', 'clear_phantom_conversation_timestamps', NULL, 'reconcile-ops-03'),
  ('20260903200000', 'qualify_tables_in_empty_search_path_functions', NULL, 'reconcile-ops-03'),
  ('20260903210000', 'drop_dead_get_human_quest_performance', NULL, 'reconcile-ops-03'),
  ('20260904120000', 'class_parent_chat_rename', NULL, 'reconcile-ops-03'),
  ('20260904160000', 'optio_academy_credit_review_by_optio', NULL, 'reconcile-ops-03'),
  ('20260905120000', 'sis_recognition_comments', NULL, 'reconcile-ops-03'),
  ('20260907180000', 'org_kiosk_devices_token', NULL, 'reconcile-ops-03'),
  ('20260908120000', 'message_email_relays', NULL, 'reconcile-ops-03'),
  ('20260908130000', 'device_tokens_one_account_per_device', NULL, 'reconcile-ops-03'),
  ('20260908150000', 'parent_weekly_digest_sends', NULL, 'reconcile-ops-03'),
  ('20260909144435', 'baseline_20260909', NULL, 'reconcile-ops-03')
ON CONFLICT (version) DO NOTHING;

-- What this run actually wrote. Expect 67 on a first run, 0 on a repeat.
SELECT count(*) AS rows_written_by_this_script
FROM supabase_migrations.schema_migrations
WHERE created_by = 'reconcile-ops-03';

-- Sanity: the history should now hold 163 rows (96 before + 67).
SELECT count(*) AS total_history_rows FROM supabase_migrations.schema_migrations;

COMMIT;
