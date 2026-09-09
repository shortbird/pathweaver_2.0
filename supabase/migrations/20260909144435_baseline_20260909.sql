--
-- Production schema baseline -- Optio (project vvfgxcykxjybtvpfzwyx)
--
-- GENERATED FILE. Do not hand-edit. Regenerate with:
--     SUPABASE_PAT=... python3 scripts/dump_prod_schema.py
--
-- This is a point-in-time reconstruction of the live production schema, taken
-- to end the drift between supabase/migrations/ and
-- supabase_migrations.schema_migrations (OPS-03). It is the new source of truth
-- for what production looks like; every migration filed after it is a delta on
-- top of it.
--
-- IT WAS NEVER APPLIED TO PRODUCTION AND MUST NOT BE.
-- Production already has every object below. Applying it there is at best a
-- long series of no-ops and at worst a lock storm. Its two real uses are:
--   1. standing up a fresh project (staging -- see STAGING_RUNBOOK.md), and
--   2. reading, to answer "what does production actually look like".
-- The reconciliation script marks it applied in the history table without
-- running it, which is what makes `db push` sane again.
--
-- Reconstructed from the system catalogs over the Management API in a READ ONLY
-- transaction, not from pg_dump -- see the module docstring in
-- scripts/dump_prod_schema.py for why, and for what is deliberately missing.
-- The short version: no Supabase-managed schemas, no data, no roles.
--
-- Object counts at generation time are in the section headers below.
--

SET statement_timeout = 0;
SET client_min_messages = warning;
SET search_path = public, extensions;

--
-- SCHEMAS (2)
--
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS public;

--
-- EXTENSIONS (10)
--
CREATE EXTENSION IF NOT EXISTS hypopg WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS index_advisor WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

--
-- ENUM TYPES (11)
--
CREATE TYPE public.collaboration_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');
CREATE TYPE public.conversation_mode AS ENUM ('study_buddy', 'teacher', 'discovery', 'review', 'creative');
CREATE TYPE public.evidence_type AS ENUM ('text', 'link', 'image', 'video', 'document');
CREATE TYPE public.evidence_uploader_role AS ENUM ('student', 'advisor', 'parent');
CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted');
CREATE TYPE public.message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE public.pillar_type AS ENUM ('art', 'stem', 'communication', 'civics', 'wellness');
CREATE TYPE public.quest_source AS ENUM ('khan_academy', 'brilliant', 'custom', 'optio');
CREATE TYPE public.safety_level AS ENUM ('safe', 'warning', 'blocked', 'requires_review');
CREATE TYPE public.school_subject AS ENUM ('language_arts', 'math', 'science', 'social_studies', 'financial_literacy', 'health', 'pe', 'fine_arts', 'cte', 'digital_literacy', 'electives');
CREATE TYPE public.subject_type AS ENUM ('language_arts', 'math', 'science', 'social_studies', 'foreign_language', 'arts', 'technology', 'physical_education');

--
-- DOMAINS (0)
--
-- (none)

--
-- SEQUENCES (0)
--
-- (none)

--
-- TABLES (241)
--
CREATE TABLE IF NOT EXISTS public.academy_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  pathway text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  partner_org_id uuid,
  registration_id uuid,
  grade_level text,
  enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
  withdrawn_at timestamp with time zone,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  email character varying NOT NULL,
  first_name character varying,
  last_name character varying,
  deletion_requested_at timestamp with time zone NOT NULL,
  deletion_completed_at timestamp with time zone,
  reason text,
  user_data jsonb,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  changes jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.admin_masquerade_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  ended_at timestamp with time zone,
  ip_address text,
  user_agent text,
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.advisor_checkins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  advisor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  checkin_date timestamp with time zone DEFAULT now() NOT NULL,
  active_quests_snapshot jsonb DEFAULT '[]'::jsonb,
  growth_moments text,
  student_voice text,
  obstacles text,
  solutions text,
  advisor_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  quest_notes jsonb DEFAULT '[]'::jsonb,
  reading_notes text DEFAULT ''::text,
  writing_notes text DEFAULT ''::text,
  math_notes text DEFAULT ''::text
);
CREATE TABLE IF NOT EXISTS public.advisor_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  advisor_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  note_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.advisor_student_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  advisor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  assigned_by uuid,
  is_active boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.ai_generated_quests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  generation_job_id uuid,
  quest_data jsonb NOT NULL,
  quality_score numeric(5,2),
  review_status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  review_notes text,
  reviewer_id uuid,
  published_quest_id uuid,
  duplicate_of_quest_id uuid,
  quality_metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  reviewed_at timestamp with time zone,
  published_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.ai_generation_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
  status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
  generated_count integer DEFAULT 0,
  approved_count integer DEFAULT 0,
  rejected_count integer DEFAULT 0,
  error_message text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.ai_prompt_components (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name character varying(100) NOT NULL,
  category character varying(50) NOT NULL,
  content text NOT NULL,
  description text,
  is_editable boolean DEFAULT true,
  last_modified_at timestamp with time zone DEFAULT now(),
  modified_by uuid,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ai_quest_review_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quest_data jsonb NOT NULL,
  quality_score numeric(3,2),
  ai_feedback jsonb,
  status character varying(50) DEFAULT 'pending_review'::character varying NOT NULL,
  reviewer_id uuid,
  review_notes text,
  was_edited boolean DEFAULT false,
  created_quest_id uuid,
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at timestamp with time zone,
  generation_source character varying(50) DEFAULT 'manual'::character varying,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ai_seeds (
  id integer DEFAULT nextval('ai_seeds_id_seq'::regclass) NOT NULL,
  prompt_name text DEFAULT 'primary_seed'::text NOT NULL,
  prompt_text text NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ai_task_cache (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  quest_id uuid NOT NULL,
  cache_key text NOT NULL,
  interests_hash text,
  generated_tasks jsonb NOT NULL,
  hit_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval)
);
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid,
  service_name text NOT NULL,
  model_name text DEFAULT 'gemini-2.5-flash-lite'::text NOT NULL,
  input_tokens integer DEFAULT 0 NOT NULL,
  output_tokens integer DEFAULT 0 NOT NULL,
  estimated_cost numeric(12,8) DEFAULT 0 NOT NULL,
  prompt_hash text,
  generation_config jsonb,
  response_time_ms integer,
  success boolean DEFAULT true NOT NULL,
  error_message text
);
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.announcement_recipients (
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  author_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  target_audience text DEFAULT 'everyone'::text NOT NULL,
  pinned boolean DEFAULT false NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_nudged_at timestamp with time zone,
  source_announcement_id uuid,
  is_targeted boolean DEFAULT false NOT NULL,
  in_app boolean DEFAULT true NOT NULL,
  attachments jsonb
);
CREATE TABLE IF NOT EXISTS public.automation_sequences (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  name text NOT NULL,
  description text,
  trigger_event text NOT NULL,
  steps jsonb NOT NULL,
  is_active boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bounties (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  poster_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  requirements text NOT NULL,
  pillar text DEFAULT 'stem'::text NOT NULL,
  bounty_type text NOT NULL,
  xp_reward integer NOT NULL,
  sponsored_reward jsonb,
  max_participants integer DEFAULT 0 NOT NULL,
  deadline timestamp with time zone NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  organization_id uuid,
  moderation_status text DEFAULT 'pending'::text NOT NULL,
  moderation_notes text,
  platform_fee_cents integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deliverables jsonb DEFAULT '[]'::jsonb,
  rewards jsonb DEFAULT '[]'::jsonb,
  visibility text DEFAULT 'public'::text,
  allowed_student_ids jsonb,
  cohort_class_id uuid,
  audience text DEFAULT 'students'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.bounty_claims (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bounty_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text DEFAULT 'claimed'::text NOT NULL,
  evidence jsonb,
  submitted_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.bounty_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  claim_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL,
  feedback text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.buddies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  vitality real DEFAULT 0.8,
  bond real DEFAULT 0.0,
  stage integer DEFAULT 0,
  highest_stage integer DEFAULT 0,
  last_interaction timestamp with time zone DEFAULT now(),
  food_journal text[] DEFAULT '{}'::text[],
  equipped jsonb DEFAULT '{}'::jsonb,
  wallet integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  total_xp_fed integer DEFAULT 0,
  xp_fed_today integer DEFAULT 0,
  last_fed_date date DEFAULT CURRENT_DATE
);
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  user_email text,
  user_role text,
  message text NOT NULL,
  steps text,
  status text DEFAULT 'new'::text NOT NULL,
  app_version text,
  build_number text,
  ota_update_id text,
  platform text,
  os_version text,
  device_model text,
  current_route text,
  breadcrumbs jsonb,
  recent_api_calls jsonb,
  recent_console_errors jsonb,
  sentry_event_id text,
  screenshot_path text,
  screenshot_bucket text,
  extra jsonb,
  triage_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.class_advisors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  advisor_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.class_discussion_posts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  parent_post_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.class_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status character varying(50) DEFAULT 'active'::character varying,
  enrolled_at timestamp with time zone DEFAULT now(),
  enrolled_by uuid,
  completed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.class_materials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  file_path text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  visible_to_students boolean DEFAULT true NOT NULL
);
CREATE TABLE IF NOT EXISTS public.class_meetings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  day_of_week integer,
  specific_date date,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  location text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.class_prerequisites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  prerequisite_class_id uuid,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.class_quests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  added_by uuid NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  sequence_order integer DEFAULT 0,
  publish_at timestamp with time zone,
  due_date timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.consultation_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  parent_name character varying NOT NULL,
  email character varying NOT NULL,
  phone character varying,
  child_age character varying,
  preferred_times text,
  notes text,
  status character varying DEFAULT 'pending'::character varying,
  source character varying DEFAULT 'consultation_page'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  organization text,
  message text,
  contact_type text DEFAULT 'general'::text NOT NULL,
  status text DEFAULT 'new'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  phone text
);
CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reporter_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text NOT NULL,
  notes text,
  status text DEFAULT 'pending'::text NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  course_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status character varying(50) DEFAULT 'active'::character varying NOT NULL,
  enrolled_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  current_quest_id uuid,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.course_generation_jobs (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  course_id uuid,
  user_id uuid NOT NULL,
  organization_id uuid,
  status text DEFAULT 'pending'::text NOT NULL,
  current_step text,
  current_item text,
  items_completed integer DEFAULT 0,
  items_total integer DEFAULT 0,
  logs jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_message text,
  retry_count integer DEFAULT 0,
  auto_publish boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.course_plan_sessions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  organization_id uuid,
  title text,
  status text DEFAULT 'drafting'::text NOT NULL,
  current_outline jsonb DEFAULT '{}'::jsonb NOT NULL,
  outline_history jsonb DEFAULT '[]'::jsonb,
  conversation jsonb DEFAULT '[]'::jsonb,
  generation_job_id uuid,
  created_course_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.course_quest_tasks (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  quest_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  pillar text NOT NULL,
  xp_value integer DEFAULT 100,
  order_index integer DEFAULT 0,
  is_required boolean DEFAULT true,
  diploma_subjects jsonb DEFAULT '["Electives"]'::jsonb,
  subject_xp_distribution jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.course_quests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  course_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  sequence_order integer NOT NULL,
  custom_title character varying(255),
  intro_content jsonb DEFAULT '{}'::jsonb,
  is_required boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  xp_threshold integer DEFAULT 0,
  is_published boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.course_refine_sessions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  course_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  initial_request text NOT NULL,
  conversation_history jsonb DEFAULT '[]'::jsonb,
  proposed_changes jsonb DEFAULT '[]'::jsonb,
  applied_changes jsonb DEFAULT '[]'::jsonb,
  prompt_update_applied text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title character varying(255) NOT NULL,
  description text,
  organization_id uuid,
  created_by uuid NOT NULL,
  intro_content jsonb DEFAULT '{}'::jsonb,
  cover_image_url text,
  status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
  visibility character varying(50) DEFAULT 'organization'::character varying NOT NULL,
  navigation_mode character varying(50) DEFAULT 'sequential'::character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  slug text,
  learning_outcomes jsonb DEFAULT '[]'::jsonb,
  final_deliverable text,
  guidance_level text,
  academic_alignment text,
  age_range text,
  estimated_hours integer,
  educational_value text,
  parent_guidance jsonb DEFAULT '{}'::jsonb,
  target_audience text,
  progress_model text,
  credit_subject text,
  credit_amount numeric(3,2)
);
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  task_id uuid NOT NULL,
  credit_type character varying(100) NOT NULL,
  xp_amount integer NOT NULL,
  credits_earned numeric(5,2) NOT NULL,
  date_earned timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  academic_year integer NOT NULL
);
CREATE TABLE IF NOT EXISTS public.credit_review_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  completion_id uuid NOT NULL,
  author_id uuid NOT NULL,
  author_role text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.crm_calendar_bookings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  gcal_event_id text NOT NULL,
  attendee_email text NOT NULL,
  event_start timestamp with time zone,
  matched_lead_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.crm_email_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sg_event_id text,
  send_id uuid,
  lead_id uuid,
  email text,
  event_type text NOT NULL,
  payload jsonb,
  occurred_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.crm_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  event_type text NOT NULL,
  detail jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.crm_funnel_memberships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  funnel_id uuid NOT NULL,
  entered_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  exit_reason text,
  exited_at timestamp with time zone,
  last_step_sent integer DEFAULT 0 NOT NULL,
  last_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.crm_funnel_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  funnel_id uuid NOT NULL,
  step_order integer NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  delay_hours integer NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);
CREATE TABLE IF NOT EXISTS public.crm_funnels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  status text DEFAULT 'paused'::text NOT NULL,
  funnel_type text DEFAULT 'nurture'::text NOT NULL,
  entry_types text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  lead_type text,
  lead_source text,
  status text DEFAULT 'active'::text NOT NULL,
  converted_at timestamp with time zone,
  conversion_event text,
  user_id uuid,
  unsubscribe_token uuid DEFAULT gen_random_uuid() NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.crm_sends (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  membership_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  funnel_id uuid NOT NULL,
  step_id uuid NOT NULL,
  email text NOT NULL,
  subject text,
  status text DEFAULT 'sending'::text NOT NULL,
  provider_message_id text,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.crm_settings (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.crm_suppressions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  reason text NOT NULL,
  source text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.curriculum_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quest_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size_bytes integer,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
  is_deleted boolean DEFAULT false NOT NULL,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  organization_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.curriculum_lesson_progress (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  status text DEFAULT 'not_started'::text NOT NULL,
  progress_percentage integer DEFAULT 0 NOT NULL,
  time_spent_seconds integer DEFAULT 0 NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_position jsonb,
  organization_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.curriculum_lesson_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lesson_id uuid NOT NULL,
  task_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  organization_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.curriculum_lessons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quest_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  content jsonb DEFAULT '{"blocks": []}'::jsonb NOT NULL,
  sequence_order integer NOT NULL,
  is_published boolean DEFAULT true NOT NULL,
  is_required boolean DEFAULT false NOT NULL,
  estimated_duration_minutes integer,
  prerequisite_lesson_ids uuid[] DEFAULT ARRAY[]::uuid[],
  search_vector tsvector,
  created_by uuid NOT NULL,
  last_edited_by uuid,
  last_edited_at timestamp with time zone,
  organization_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  xp_threshold integer DEFAULT 0,
  video_url text,
  files jsonb
);
CREATE TABLE IF NOT EXISTS public.curriculum_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quest_id uuid NOT NULL,
  navigation_mode text DEFAULT 'sequential'::text NOT NULL,
  require_all_lessons boolean DEFAULT true NOT NULL,
  minimum_lessons_required integer,
  show_progress_bar boolean DEFAULT true NOT NULL,
  show_lesson_count boolean DEFAULT true NOT NULL,
  auto_advance_on_complete boolean DEFAULT false NOT NULL,
  show_table_of_contents boolean DEFAULT true NOT NULL,
  organization_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.curriculum_uploads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_type text NOT NULL,
  original_filename text,
  file_size_bytes integer,
  status text DEFAULT 'pending'::text NOT NULL,
  error_message text,
  raw_content jsonb,
  structured_content jsonb,
  aligned_content jsonb,
  generated_content jsonb,
  human_edits jsonb,
  created_quest_id uuid,
  uploaded_by uuid NOT NULL,
  organization_id uuid,
  uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  processing_time_ms integer,
  ai_tokens_used integer,
  current_stage integer DEFAULT 0,
  stage_1_completed_at timestamp with time zone,
  stage_2_completed_at timestamp with time zone,
  stage_3_completed_at timestamp with time zone,
  stage_4_completed_at timestamp with time zone,
  can_resume boolean DEFAULT false,
  resume_from_stage integer,
  progress_percent integer DEFAULT 0,
  current_stage_name text,
  current_item text,
  stage_progress jsonb DEFAULT '{}'::jsonb,
  human_structure_edits jsonb,
  created_course_id uuid
);
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL,
  device_name text,
  is_active boolean DEFAULT true NOT NULL,
  last_used_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.diploma_review_rounds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  completion_id uuid NOT NULL,
  round_number integer NOT NULL,
  evidence_snapshot jsonb NOT NULL,
  subject_suggestion jsonb,
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewer_id uuid,
  reviewer_action text,
  reviewer_feedback text,
  approved_subjects jsonb,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  org_reviewer_id uuid,
  org_reviewer_action text,
  org_reviewer_feedback text,
  org_reviewed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.diplomas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  issued_date timestamp without time zone DEFAULT now(),
  portfolio_slug text,
  is_public boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  public_consent_given boolean DEFAULT false,
  public_consent_given_at timestamp with time zone,
  public_consent_given_by uuid,
  pending_parent_approval boolean DEFAULT false,
  parent_approval_denied boolean DEFAULT false,
  parent_approval_denied_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  message_content text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  reply_to_message_id uuid,
  attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
  edited_at timestamp with time zone,
  is_deleted boolean DEFAULT false NOT NULL,
  sent_by_user_id uuid
);
CREATE TABLE IF NOT EXISTS public.docs_articles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid,
  title text NOT NULL,
  slug text NOT NULL,
  content text NOT NULL,
  summary text,
  target_roles text[] DEFAULT '{}'::text[],
  sort_order integer DEFAULT 0,
  is_published boolean DEFAULT true,
  view_count integer DEFAULT 0,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  search_vector tsvector
);
CREATE TABLE IF NOT EXISTS public.docs_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  icon text,
  sort_order integer DEFAULT 0,
  is_published boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.docs_search_misses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  query text NOT NULL,
  normalized_query text NOT NULL,
  miss_count integer DEFAULT 1 NOT NULL,
  first_searched_at timestamp with time zone DEFAULT now(),
  last_searched_at timestamp with time zone DEFAULT now(),
  generated_article_id uuid
);
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  template_key text NOT NULL,
  name text NOT NULL,
  description text,
  subject text NOT NULL,
  template_data jsonb NOT NULL,
  is_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_override boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_user_id uuid NOT NULL,
  organization_id uuid,
  name text NOT NULL,
  relationship text,
  phone text,
  email text,
  priority integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  can_pickup boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.evidence_document_blocks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  block_type text NOT NULL,
  content jsonb NOT NULL,
  order_index integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_private boolean DEFAULT false NOT NULL,
  uploaded_by_user_id uuid,
  uploaded_by_role evidence_uploader_role DEFAULT 'student'::evidence_uploader_role
);
CREATE TABLE IF NOT EXISTS public.evidence_report_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  access_token character varying(64) NOT NULL,
  title character varying(255) DEFAULT 'Evidence Report'::character varying NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  included_quest_ids uuid[] DEFAULT '{}'::uuid[],
  included_course_ids uuid[] DEFAULT '{}'::uuid[],
  include_learning_events boolean DEFAULT false,
  include_xp_summary boolean DEFAULT true,
  include_skills_breakdown boolean DEFAULT true,
  requires_parent_approval boolean DEFAULT false,
  parent_approval_status character varying(20) DEFAULT 'not_required'::character varying,
  parent_approved_at timestamp with time zone,
  view_count integer DEFAULT 0,
  last_viewed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.evidence_report_parent_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  report_config_id uuid NOT NULL,
  parent_user_id uuid,
  status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  requested_at timestamp with time zone DEFAULT now(),
  responded_at timestamp with time zone,
  denial_reason text
);
CREATE TABLE IF NOT EXISTS public.feed_highlights (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.feed_item_views (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  viewer_id uuid NOT NULL,
  completion_id uuid,
  learning_event_id uuid,
  viewed_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.feed_share_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token character varying(64) NOT NULL,
  completion_id uuid,
  learning_event_id uuid,
  created_by uuid NOT NULL,
  student_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  view_count integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.group_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name character varying(100) NOT NULL,
  description text,
  created_by uuid NOT NULL,
  organization_id uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_message_at timestamp with time zone,
  last_message_preview text,
  source_class_id uuid,
  pinned_message_id uuid,
  announcement_only boolean DEFAULT false NOT NULL,
  audience text DEFAULT 'family'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role character varying(20) DEFAULT 'member'::character varying,
  joined_at timestamp with time zone DEFAULT now(),
  added_by uuid,
  last_read_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.group_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  message_content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_deleted boolean DEFAULT false,
  reply_to_message_id uuid,
  attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
  edited_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.household_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  household_id uuid NOT NULL,
  user_id uuid NOT NULL,
  relationship text DEFAULT 'student'::text NOT NULL,
  is_primary_guardian boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.households (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  primary_contact_user_id uuid,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  phone text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  image_url text,
  registration_hold boolean DEFAULT false NOT NULL,
  registration_hold_reason text,
  registration_tier smallint,
  directory_opt_in boolean DEFAULT false NOT NULL,
  directory_share_email boolean DEFAULT true NOT NULL,
  directory_share_phone boolean DEFAULT true NOT NULL,
  directory_share_address boolean DEFAULT false NOT NULL,
  ufa_private boolean DEFAULT false NOT NULL,
  funding_source text,
  enrolled_private_school boolean DEFAULT false NOT NULL,
  directory_opted_out boolean DEFAULT false NOT NULL,
  carpool_interest boolean DEFAULT false NOT NULL,
  payment_plan_preference text
);
CREATE TABLE IF NOT EXISTS public.interest_tracks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6366f1'::text,
  icon text DEFAULT 'folder'::text,
  moment_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  evolved_to_quest_id uuid
);
CREATE TABLE IF NOT EXISTS public.learning_event_evidence_blocks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  learning_event_id uuid NOT NULL,
  block_type text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  order_index integer DEFAULT 0 NOT NULL,
  file_url text,
  file_name text,
  file_size integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.learning_event_topics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  learning_event_id uuid NOT NULL,
  topic_type text NOT NULL,
  topic_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.learning_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text,
  description text NOT NULL,
  pillars text[] DEFAULT ARRAY[]::text[],
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  parent_moment_id uuid,
  source_type text DEFAULT 'realtime'::text,
  estimated_duration_minutes integer,
  ai_generated_title text,
  ai_suggested_pillars text[],
  captured_by_user_id uuid,
  event_date date DEFAULT CURRENT_DATE,
  is_confidential boolean DEFAULT false NOT NULL,
  attached_task_id uuid
);
CREATE TABLE IF NOT EXISTS public.lesson_reflections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  prompt text NOT NULL,
  response text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lms_grade_sync (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  lms_platform character varying(50) NOT NULL,
  lms_assignment_id character varying(255) NOT NULL,
  score numeric(5,2) NOT NULL,
  max_score numeric(5,2) DEFAULT 100,
  sync_status character varying(20) DEFAULT 'pending'::character varying,
  sync_attempts integer DEFAULT 0,
  error_message text,
  synced_at timestamp with time zone,
  last_attempt_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lms_integrations (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  lms_platform character varying(50) NOT NULL,
  lms_user_id character varying(255) NOT NULL,
  lms_course_id character varying(255),
  sync_enabled boolean DEFAULT true,
  sync_status character varying(20) DEFAULT 'active'::character varying,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organization_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.lms_sessions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  lms_platform character varying(50) NOT NULL,
  session_token character varying(500) NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  attempt_count integer DEFAULT 0,
  locked_until timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  lockout_count integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.lti_auth_codes (
  code text NOT NULL,
  user_id uuid,
  quest_id uuid,
  target_path text,
  expires_at timestamp with time zone NOT NULL,
  used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  pending_launch_id uuid
);
CREATE TABLE IF NOT EXISTS public.lti_nonces (
  nonce text NOT NULL,
  issuer text NOT NULL,
  seen_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);
CREATE TABLE IF NOT EXISTS public.lti_pending_launches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  registration_id uuid NOT NULL,
  claims jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.lti_registrations (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  issuer text NOT NULL,
  client_id text NOT NULL,
  deployment_id text NOT NULL,
  organization_id uuid NOT NULL,
  auth_login_url text NOT NULL,
  auth_token_url text NOT NULL,
  public_jwks_url text NOT NULL,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.message_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  participant_1_id uuid NOT NULL,
  participant_2_id uuid NOT NULL,
  last_message_at timestamp with time zone DEFAULT now(),
  last_message_preview text,
  unread_count_p1 integer DEFAULT 0,
  unread_count_p2 integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.message_email_relays (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token text NOT NULL,
  owner_id uuid NOT NULL,
  owner_email text NOT NULL,
  recipient_id uuid NOT NULL,
  conversation_id uuid,
  source_message_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_sent_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '180 days'::interval) NOT NULL,
  revoked boolean DEFAULT false NOT NULL,
  reply_count integer DEFAULT 0 NOT NULL,
  last_reply_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_type text NOT NULL,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  organization_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  link text,
  is_read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.observer_access_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  observer_id uuid NOT NULL,
  student_id uuid NOT NULL,
  action_type character varying(50) NOT NULL,
  resource_type character varying(50),
  resource_id uuid,
  ip_address character varying(45),
  user_agent text,
  request_path text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.observer_comments (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  observer_id uuid NOT NULL,
  student_id uuid NOT NULL,
  quest_id uuid,
  task_completion_id uuid,
  comment_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  learning_event_id uuid
);
CREATE TABLE IF NOT EXISTS public.observer_invitation_students (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  invitation_id uuid NOT NULL,
  student_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.observer_invitations (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  student_id uuid,
  observer_email text NOT NULL,
  observer_name text NOT NULL,
  invitation_code text NOT NULL,
  status text DEFAULT 'pending'::text,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  accepted_at timestamp with time zone,
  invited_by_user_id uuid,
  invited_by_role character varying(20) DEFAULT 'student'::character varying,
  consumed_at timestamp with time zone,
  consumed_by_user_id uuid
);
CREATE TABLE IF NOT EXISTS public.observer_student_links (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  observer_id uuid NOT NULL,
  student_id uuid NOT NULL,
  can_comment boolean DEFAULT true,
  can_view_evidence boolean DEFAULT true,
  notifications_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  invited_by_parent_id uuid
);
CREATE TABLE IF NOT EXISTS public.oea_compliance_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  student_id uuid NOT NULL,
  credit_id uuid,
  school_year text NOT NULL,
  term_index smallint NOT NULL,
  context jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.oea_credit_evidence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  credit_id uuid NOT NULL,
  student_id uuid NOT NULL,
  block_type text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.oea_credit_grade_periods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  credit_id uuid NOT NULL,
  student_id uuid NOT NULL,
  school_year text NOT NULL,
  term_type text NOT NULL,
  term_index smallint NOT NULL,
  grade text,
  summary text,
  entered_by uuid,
  entered_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.oea_credits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  enrollment_id uuid,
  requirement_key text NOT NULL,
  category text NOT NULL,
  subject_key text,
  course_name text NOT NULL,
  credits numeric DEFAULT 1 NOT NULL,
  status text DEFAULT 'in_progress'::text NOT NULL,
  letter_grade text,
  is_weighted boolean DEFAULT false NOT NULL,
  completed_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  quest_id uuid,
  credit_source text DEFAULT 'direct'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.oea_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  parent_id uuid,
  program_key text DEFAULT 'opened-academy'::text NOT NULL,
  pathway_key text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  max_transfer_credits numeric,
  max_nondirect_credits numeric
);
CREATE TABLE IF NOT EXISTS public.oea_help_video_views (
  user_id uuid NOT NULL,
  organization_id uuid,
  first_opened_at timestamp with time zone DEFAULT now() NOT NULL,
  last_opened_at timestamp with time zone DEFAULT now() NOT NULL,
  open_count integer DEFAULT 1 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.org_classes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name character varying(255) NOT NULL,
  description text,
  xp_threshold integer DEFAULT 100 NOT NULL,
  status character varying(50) DEFAULT 'active'::character varying,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  ui_mode text,
  capacity integer,
  primary_instructor_id uuid,
  price_cents integer,
  billing_type text,
  billing_cadence text,
  min_age integer,
  max_age integer,
  location text,
  waitlist_enabled boolean DEFAULT true NOT NULL,
  registration_status text DEFAULT 'closed'::text NOT NULL,
  supply_fee numeric(10,2),
  image_url text,
  billing_blocks integer,
  requires_full_day boolean DEFAULT false NOT NULL,
  assistant_instructor_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  supply_budget_per_student numeric(10,2),
  show_assistants boolean DEFAULT true NOT NULL,
  internal_notes text,
  is_visible_to_parents boolean DEFAULT true NOT NULL,
  discussion_enabled boolean DEFAULT true NOT NULL,
  additional_locations text[]
);
CREATE TABLE IF NOT EXISTS public.org_course_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  course_id uuid NOT NULL,
  teacher_id uuid,
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tuition_cents integer
);
CREATE TABLE IF NOT EXISTS public.org_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  email text NOT NULL,
  invited_name text,
  role text DEFAULT 'student'::text NOT NULL,
  invitation_code text NOT NULL,
  invited_by uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  accepted_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.org_kiosk_devices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL,
  class_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone,
  token text
);
CREATE TABLE IF NOT EXISTS public.org_quest_group_items (
  group_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  added_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.org_quest_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.org_resources (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  url text,
  category text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  paperwork_key text,
  audience text DEFAULT 'families'::text NOT NULL,
  requires_ack boolean DEFAULT false NOT NULL,
  version_date timestamp with time zone,
  visible_to_roles text[],
  pinned boolean DEFAULT false NOT NULL,
  visible_to_user_ids uuid[]
);
CREATE TABLE IF NOT EXISTS public.organization_course_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  course_id uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now(),
  granted_by uuid
);
CREATE TABLE IF NOT EXISTS public.organization_quest_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now(),
  granted_by uuid
);
CREATE TABLE IF NOT EXISTS public.organization_secrets (
  organization_id uuid NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name character varying(255) NOT NULL,
  slug character varying(100) NOT NULL,
  quest_visibility_policy character varying(50) DEFAULT 'all_optio'::character varying NOT NULL,
  branding_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  ai_features_enabled boolean DEFAULT true,
  ai_chatbot_enabled boolean DEFAULT true,
  ai_lesson_helper_enabled boolean DEFAULT true,
  ai_task_generation_enabled boolean DEFAULT true,
  course_visibility_policy character varying(50) DEFAULT 'all_optio'::character varying NOT NULL,
  feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
  timezone text DEFAULT 'America/New_York'::text NOT NULL,
  accreditation_source text DEFAULT 'none'::text NOT NULL,
  archived_at timestamp with time zone,
  archived_by uuid,
  inbox_user_id uuid
);
CREATE TABLE IF NOT EXISTS public.parent_digest_sends (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  parent_user_id uuid NOT NULL,
  week_date date NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  delivered boolean DEFAULT true NOT NULL,
  child_count integer DEFAULT 0 NOT NULL,
  task_count integer DEFAULT 0 NOT NULL,
  late_count integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  parent_user_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  admin_verified boolean DEFAULT false,
  verified_by_admin_id uuid,
  verified_at timestamp with time zone,
  admin_notes text,
  status character varying(50) DEFAULT 'approved'::character varying
);
CREATE TABLE IF NOT EXISTS public.parental_consent_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  child_email character varying NOT NULL,
  parent_email character varying NOT NULL,
  consent_token character varying NOT NULL,
  consent_sent_at timestamp with time zone DEFAULT now(),
  consent_verified_at timestamp with time zone,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  reviewed_by_admin_id uuid,
  review_action character varying(20),
  review_notes text,
  reviewed_at timestamp with time zone,
  consent_method text DEFAULT 'email_link'::text NOT NULL,
  signature_name text,
  consent_statement_version text
);
CREATE TABLE IF NOT EXISTS public.password_reset_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  lockout_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean DEFAULT false,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.peer_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  author_id uuid NOT NULL,
  student_id uuid NOT NULL,
  learning_event_id uuid,
  task_completion_id uuid,
  quest_id uuid,
  comment_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  hidden_at timestamp with time zone,
  hidden_by uuid,
  hidden_reason text
);
CREATE TABLE IF NOT EXISTS public.peer_connect_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  code text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.peer_connection_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  connection_id uuid NOT NULL,
  student_id uuid NOT NULL,
  approver_id uuid,
  approver_kind text,
  status text DEFAULT 'pending'::text NOT NULL,
  responded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.peer_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text DEFAULT 'pending_addressee'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  responded_at timestamp with time zone,
  activated_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  revoke_reason text
);
CREATE TABLE IF NOT EXISTS public.philosophy_edges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  edge_type text DEFAULT 'includes'::text NOT NULL,
  label_text text,
  is_visible boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.philosophy_nodes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  label text NOT NULL,
  summary text,
  detail_content text,
  image_url text,
  color text DEFAULT '#6D469B'::text,
  level integer DEFAULT 1 NOT NULL,
  parent_node_id uuid,
  position_x double precision DEFAULT 0 NOT NULL,
  position_y double precision DEFAULT 0 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_visible boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.phone_verification_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  phone text NOT NULL,
  code_hash text NOT NULL,
  salt text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.planned_credits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  school_subject text NOT NULL,
  course_name text NOT NULL,
  credits numeric(4,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'in_progress'::text NOT NULL,
  source text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.poe_cohorts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  display_name text NOT NULL,
  site_city text,
  summary text,
  start_date date,
  end_date date,
  point_of_contact text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.poe_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  poe_cohort_id uuid NOT NULL,
  track_id uuid,
  enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_homeschool boolean,
  school_name text,
  school_city text,
  school_state text,
  school_contact_email text,
  class_quest_id uuid,
  attendance_confirmed_at timestamp with time zone,
  credit_awarded_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.poe_signups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  poe_cohort_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  date_of_birth date,
  is_minor boolean,
  parent_first_name text,
  parent_last_name text,
  parent_email text,
  is_homeschool boolean,
  school_name text,
  school_city text,
  school_state text,
  school_contact_email text,
  confirmation_sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.portfolio_visibility_reset_20260801 (
  user_id uuid NOT NULL,
  portfolio_slug text,
  was_public boolean NOT NULL,
  had_consent boolean NOT NULL,
  was_minor boolean NOT NULL,
  reset_at timestamp with time zone DEFAULT now() NOT NULL,
  notified_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.portfolio_visibility_reset_20260802 (
  user_id uuid NOT NULL,
  portfolio_slug text,
  was_public boolean NOT NULL,
  consent_given_by uuid,
  was_self_consented boolean NOT NULL,
  was_minor boolean NOT NULL,
  reset_at timestamp with time zone DEFAULT now() NOT NULL,
  notified_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.prior_learning_evidence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  record_id uuid NOT NULL,
  evidence_type text NOT NULL,
  content text,
  url text,
  title text,
  file_name text,
  file_size integer,
  content_type text,
  sequence_order integer DEFAULT 0 NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.prior_learning_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  provider text,
  subject_hint text,
  started_on date,
  ended_on date,
  hours_estimate numeric(7,1),
  status text DEFAULT 'draft'::text NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  awarded_credits jsonb DEFAULT '{}'::jsonb NOT NULL,
  credited_at timestamp with time zone,
  credited_by uuid,
  ai_status text DEFAULT 'not_run'::text NOT NULL,
  ai_suggestion jsonb,
  ai_model text,
  ai_analyzed_at timestamp with time zone,
  ai_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source text DEFAULT 'family'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.promo_interest (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  classes_interested text,
  source text DEFAULT 'for-students'::text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.public_visibility_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_user_id uuid NOT NULL,
  parent_user_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_at timestamp with time zone DEFAULT now(),
  responded_at timestamp with time zone,
  denial_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.quest_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  advisor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  message text,
  invited_at timestamp with time zone DEFAULT now() NOT NULL,
  responded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.quest_personalization_sessions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  selected_approach text,
  selected_interests jsonb DEFAULT '[]'::jsonb,
  cross_curricular_subjects jsonb DEFAULT '[]'::jsonb,
  ai_generated_tasks jsonb,
  finalized_tasks jsonb,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.quest_sample_tasks (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  quest_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  pillar text NOT NULL,
  xp_value integer DEFAULT 100,
  diploma_subjects jsonb DEFAULT '["Electives"]'::jsonb,
  subject_xp_distribution jsonb DEFAULT '{}'::jsonb,
  order_index integer DEFAULT 0,
  ai_generated boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  usage_count integer DEFAULT 0,
  flag_count integer DEFAULT 0,
  is_flagged boolean DEFAULT false,
  spark_assignment_id character varying(255),
  source_lesson_id uuid,
  is_teacher_template boolean DEFAULT false,
  success_criteria jsonb
);
CREATE TABLE IF NOT EXISTS public.quest_sources (
  id text NOT NULL,
  name text NOT NULL,
  header_image_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.quest_task_completions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  task_id uuid NOT NULL,
  evidence_url text,
  evidence_text text,
  completed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_quest_task_id uuid,
  scheduled_date date,
  is_confidential boolean DEFAULT false NOT NULL,
  diploma_status text DEFAULT 'none'::text,
  revision_number integer DEFAULT 1,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  ready_suggested_at timestamp with time zone,
  finalized_at timestamp with time zone,
  credit_requested_at timestamp with time zone,
  credit_reviewer_id uuid,
  merged_into uuid,
  org_reviewer_id uuid,
  in_portfolio boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.quest_template_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quest_id uuid NOT NULL,
  title character varying(500) NOT NULL,
  description text,
  pillar character varying(50) DEFAULT 'stem'::character varying NOT NULL,
  xp_value integer DEFAULT 100,
  order_index integer DEFAULT 0,
  is_required boolean DEFAULT false,
  diploma_subjects text[] DEFAULT ARRAY['Electives'::text],
  subject_xp_distribution jsonb DEFAULT '{}'::jsonb,
  usage_count integer DEFAULT 0,
  flag_count integer DEFAULT 0,
  is_flagged boolean DEFAULT false,
  ai_generated boolean DEFAULT false,
  spark_assignment_id uuid,
  source_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.quests (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  title text NOT NULL,
  description text,
  big_idea text,
  quest_type character varying(100) DEFAULT 'custom'::quest_source,
  header_image_url text,
  is_v3 boolean DEFAULT true,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  material_link text,
  archived_at timestamp with time zone,
  archive_reason text,
  deactivated_at timestamp with time zone,
  deactivation_reason text,
  requires_review boolean DEFAULT false,
  image_url text,
  image_search_term text,
  image_generated_at timestamp without time zone,
  image_generation_status text,
  lms_course_id character varying(255),
  lms_assignment_id character varying(255),
  lms_platform character varying(50),
  is_tutorial boolean DEFAULT false,
  is_public boolean DEFAULT false,
  organization_id uuid,
  curriculum_content jsonb,
  curriculum_version integer DEFAULT 1,
  curriculum_last_edited_by uuid,
  curriculum_last_edited_at timestamp with time zone,
  topics text[] DEFAULT '{}'::text[],
  topic_primary character varying(50),
  approach_examples jsonb,
  allow_custom_tasks boolean DEFAULT true,
  lti_ags_lineitem_url text,
  lti_ags_lineitem_id text,
  lti_registration_id uuid,
  xp_threshold integer,
  transcript_subject text,
  class_review_status text,
  class_review_submitted_at timestamp with time zone,
  class_review_notes text,
  recommended_age text,
  source_material text
);
CREATE TABLE IF NOT EXISTS public.refresh_token_families (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  current_jti uuid NOT NULL,
  previous_jti uuid,
  rotated_at timestamp with time zone,
  issued_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  revoked boolean DEFAULT false NOT NULL,
  revoked_at timestamp with time zone,
  revoked_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_client_fp text
);
CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  parent_user_id uuid NOT NULL,
  access_token text NOT NULL,
  status text DEFAULT 'verify'::text NOT NULL,
  kids jsonb DEFAULT '[]'::jsonb NOT NULL,
  paperwork jsonb DEFAULT '[]'::jsonb NOT NULL,
  fee_cents integer,
  fee_recorded_at timestamp with time zone,
  scheduling_emailed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  answers jsonb DEFAULT '{}'::jsonb NOT NULL,
  emergency_contacts jsonb DEFAULT '[]'::jsonb NOT NULL,
  otp_hash text,
  otp_expires_at timestamp with time zone,
  email_verified_at timestamp with time zone,
  stripe_session_id text,
  stripe_payment_ref text,
  fee_paid_at timestamp with time zone,
  schedule_done_at timestamp with time zone,
  appointment_confirmed_at timestamp with time zone,
  fee_deferred boolean DEFAULT false NOT NULL,
  refunded_cents integer DEFAULT 0 NOT NULL,
  waitlist_refund_ack_at timestamp with time zone,
  stripe_session_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
  otp_attempts integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.role_change_log (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid,
  changed_by uuid,
  old_role text,
  new_role text,
  reason text,
  changed_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_type text NOT NULL,
  job_data jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending'::text NOT NULL,
  priority integer DEFAULT 5,
  scheduled_for timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  result_data jsonb,
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.school_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  status text DEFAULT 'enrolled'::text NOT NULL,
  grade_level text,
  start_date date,
  end_date date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.security_warnings_documentation (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warning_type character varying(100) NOT NULL,
  description text NOT NULL,
  required_action text NOT NULL,
  responsible_party character varying(50) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sis_age_exception_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  guardian_user_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  class_id uuid NOT NULL,
  student_age smallint,
  class_min_age smallint,
  class_max_age smallint,
  message text,
  status text DEFAULT 'pending'::text NOT NULL,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  pinned boolean DEFAULT false NOT NULL,
  priority text DEFAULT 'normal'::text NOT NULL,
  publish_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  audience text DEFAULT 'school'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_assignment_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid,
  name text NOT NULL,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_attendance (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid NOT NULL,
  meeting_id uuid,
  student_user_id uuid NOT NULL,
  date date NOT NULL,
  status text DEFAULT 'present'::text NOT NULL,
  note text,
  recorded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_attendance_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  date date NOT NULL,
  alert_type text NOT NULL,
  context jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  class_id uuid,
  status text DEFAULT 'open'::text NOT NULL,
  resolution text,
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.sis_billing_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  invoice_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_carpool_posts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL,
  author_name text NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  area text,
  days text,
  contact text,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_clp_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  finished_at timestamp with time zone,
  finished_by uuid,
  notes text,
  notes_updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_curriculum (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  subject text,
  description text,
  drive_url text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_curriculum_classes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  curriculum_id uuid NOT NULL,
  class_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_curriculum_courses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  curriculum_id uuid NOT NULL,
  course_id uuid NOT NULL,
  sequence_order integer DEFAULT 0 NOT NULL,
  added_by uuid,
  added_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_curriculum_materials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  curriculum_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  file_path text,
  visible_to_students boolean DEFAULT false NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_curriculum_quests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  curriculum_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  sequence_order integer DEFAULT 0 NOT NULL,
  added_by uuid,
  added_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_discount_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  rule_type text NOT NULL,
  criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_engagement_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid,
  student_user_id uuid NOT NULL,
  quest_id uuid,
  alert_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.sis_enrollment_waitlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  household_id uuid,
  guardian_user_id uuid,
  age_snapshot smallint,
  band_min_age smallint,
  band_max_age smallint,
  status text DEFAULT 'waiting'::text NOT NULL,
  released_by uuid,
  released_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  rejected_by uuid,
  rejected_at timestamp with time zone,
  refund_cents integer,
  stripe_refund_id text,
  queued_at timestamp with time zone DEFAULT now() NOT NULL,
  manual_rank integer,
  added_by uuid,
  source text DEFAULT 'registration'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_event_rsvps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  household_id uuid,
  responded_by uuid,
  attending boolean DEFAULT true NOT NULL,
  party_size integer DEFAULT 1 NOT NULL,
  note text,
  invoice_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  location text,
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone,
  all_day boolean DEFAULT false NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  category text,
  audience text DEFAULT 'school'::text NOT NULL,
  categories text[] DEFAULT '{}'::text[] NOT NULL,
  rsvp_enabled boolean DEFAULT false NOT NULL,
  rsvp_fee_cents integer,
  rsvp_closes_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.sis_family_directives (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  email text NOT NULL,
  registration_tier smallint,
  registration_hold boolean DEFAULT false NOT NULL,
  hold_reason text,
  fee_prepaid boolean DEFAULT false NOT NULL,
  notes text,
  matched_household_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_form_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  submission_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_form_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  form_type text NOT NULL,
  title text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'submitted'::text NOT NULL,
  assigned_to uuid,
  resolution_notes text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  student_user_id uuid,
  class_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  submitter_role text DEFAULT 'staff'::text NOT NULL,
  priority text DEFAULT 'normal'::text NOT NULL,
  due_date date,
  form_type_label text
);
CREATE TABLE IF NOT EXISTS public.sis_form_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  audience text DEFAULT 'staff'::text NOT NULL,
  fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  default_assignee_id uuid,
  default_priority text,
  visible_to_roles text[],
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_installments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_plan_id uuid NOT NULL,
  due_date date NOT NULL,
  amount_cents integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'scheduled'::text NOT NULL,
  paid_at timestamp with time zone,
  late_fee_cents integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  charge_attempts integer DEFAULT 0 NOT NULL,
  last_attempt_at timestamp with time zone,
  last_error text
);
CREATE TABLE IF NOT EXISTS public.sis_invoice_line_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  class_id uuid,
  amount_cents integer DEFAULT 0 NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  kind text
);
CREATE TABLE IF NOT EXISTS public.sis_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  household_id uuid,
  student_user_id uuid,
  registration_id uuid,
  status text DEFAULT 'draft'::text NOT NULL,
  subtotal_cents integer DEFAULT 0 NOT NULL,
  discount_cents integer DEFAULT 0 NOT NULL,
  total_cents integer DEFAULT 0 NOT NULL,
  amount_paid_cents integer DEFAULT 0 NOT NULL,
  issued_at timestamp with time zone,
  due_date date,
  quickbooks_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  processing_fee_cents integer DEFAULT 0 NOT NULL,
  invoice_number text,
  stripe_session_ids text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_learning_day_selections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  choice text NOT NULL,
  answers jsonb DEFAULT '{}'::jsonb NOT NULL,
  selected_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_lost_found (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  description text NOT NULL,
  image_url text,
  category text,
  date_found date,
  location_found text,
  status text DEFAULT 'unclaimed'::text NOT NULL,
  claimed_by text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_onboarding_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  template_id uuid,
  template_name text,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  status text DEFAULT 'in_progress'::text NOT NULL,
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  audience text DEFAULT 'staff'::text NOT NULL,
  kind text DEFAULT 'checklist'::text NOT NULL,
  batch_id uuid,
  blocks_access boolean DEFAULT false NOT NULL,
  description text
);
CREATE TABLE IF NOT EXISTS public.sis_onboarding_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  role_type text,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  audience text DEFAULT 'staff'::text NOT NULL,
  blocks_access boolean DEFAULT false NOT NULL,
  description text
);
CREATE TABLE IF NOT EXISTS public.sis_payment_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  cadence text NOT NULL,
  installment_count integer DEFAULT 1 NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  auto_charge boolean DEFAULT false NOT NULL,
  saved_payment_method_id uuid
);
CREATE TABLE IF NOT EXISTS public.sis_payment_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  installment_id uuid,
  amount_cents integer NOT NULL,
  method text,
  external_ref text,
  recorded_by uuid,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL,
  note text
);
CREATE TABLE IF NOT EXISTS public.sis_payment_reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  installment_id uuid,
  sent_to text NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_quickbooks_sync_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  quickbooks_id text,
  status text DEFAULT 'pending'::text NOT NULL,
  error text,
  synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_recognition (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  type text DEFAULT 'shout_out'::text NOT NULL,
  recipient_name text,
  recipient_user_id uuid,
  message text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_recognition_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recognition_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_recurring_tuition (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  monthly_cents integer NOT NULL,
  description text,
  status text DEFAULT 'active'::text NOT NULL,
  day_of_month smallint DEFAULT 1 NOT NULL,
  next_charge_on date,
  last_charged_on date,
  created_by uuid,
  canceled_at timestamp with time zone,
  canceled_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  setup_link_sent_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.sis_registration_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  registration_id uuid NOT NULL,
  class_id uuid NOT NULL,
  status text DEFAULT 'selected'::text NOT NULL,
  price_snapshot_cents integer,
  discount_snapshot_cents integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  household_id uuid,
  guardian_user_id uuid,
  student_user_id uuid NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  current_step text,
  notes text,
  submitted_at timestamp with time zone,
  completed_at timestamp with time zone,
  completed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_resource_acks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  resource_id uuid NOT NULL,
  user_id uuid NOT NULL,
  version_date timestamp with time zone,
  acknowledged_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_saved_payment_methods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  guardian_user_id uuid NOT NULL,
  household_id uuid,
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_schedule_submissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  status text DEFAULT 'submitted'::text NOT NULL,
  submitted_by uuid,
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_secure_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  owner_user_id uuid,
  student_user_id uuid,
  uploaded_by uuid NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  content_type text,
  size_bytes integer,
  category text,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  shared_with_owner boolean DEFAULT false NOT NULL,
  uploaded_by_owner boolean DEFAULT false NOT NULL,
  title text,
  sensitivity text DEFAULT 'hr'::text NOT NULL,
  requires_signature boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_staff_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  assignment_type text DEFAULT 'duty'::text NOT NULL,
  day_of_week integer,
  specific_date date,
  start_time time without time zone,
  end_time time without time zone,
  location text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_staff_profiles (
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  "position" text,
  staff_type text,
  pay_type text,
  payroll_id text,
  hourly_rate_cents integer,
  emergency_contact_name text,
  emergency_contact_phone text,
  work_schedule text,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true NOT NULL,
  uses_time_clock boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  archived_at timestamp with time zone,
  archived_by uuid
);
CREATE TABLE IF NOT EXISTS public.sis_staff_training (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  category text,
  is_required boolean DEFAULT false NOT NULL,
  sequence_order integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  audience text DEFAULT 'staff'::text NOT NULL,
  visible_to_roles text[],
  auto_assign boolean DEFAULT false NOT NULL,
  audiences text[] DEFAULT ARRAY['staff'::text],
  student_min_age smallint,
  student_max_age smallint
);
CREATE TABLE IF NOT EXISTS public.sis_student_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid,
  student_user_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  date_scheduled date,
  date_completed date,
  score numeric,
  max_score numeric,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_student_goals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  school_year text NOT NULL,
  direction text,
  direction_notes text,
  subjects jsonb DEFAULT '[]'::jsonb NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  submitted_at timestamp with time zone,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_student_materials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  item_name text NOT NULL,
  paid boolean DEFAULT false NOT NULL,
  received boolean DEFAULT false NOT NULL,
  notes text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_student_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  profile jsonb DEFAULT '{}'::jsonb NOT NULL,
  assessments jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_submission_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  completion_id uuid NOT NULL,
  reviewed_by uuid NOT NULL,
  action text DEFAULT 'accepted'::text NOT NULL,
  reviewed_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_time_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  clock_in timestamp with time zone NOT NULL,
  clock_out timestamp with time zone,
  work_date date NOT NULL,
  class_id uuid,
  job_label text,
  notes text,
  status text DEFAULT 'open'::text NOT NULL,
  edited_by uuid,
  edit_reason text,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_waitlist_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  "position" integer NOT NULL,
  status text DEFAULT 'waiting'::text NOT NULL,
  offered_at timestamp with time zone,
  offer_expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sis_xp_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  student_user_id uuid NOT NULL,
  task_id uuid,
  quest_id uuid,
  adjusted_by uuid NOT NULL,
  xp_before integer,
  xp_after integer,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  logo_url text,
  favicon_url text,
  site_name character varying(255) DEFAULT 'Optio'::character varying,
  site_description text,
  meta_keywords text,
  footer_text text,
  primary_color character varying(7),
  secondary_color character varying(7),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);
CREATE TABLE IF NOT EXISTS public.student_access_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  accessor_id uuid,
  accessor_role text NOT NULL,
  data_accessed jsonb NOT NULL,
  access_timestamp timestamp with time zone DEFAULT now(),
  purpose text,
  ip_address inet,
  user_agent text
);
CREATE TABLE IF NOT EXISTS public.student_planned_absences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  class_id uuid,
  absence_date date NOT NULL,
  reason text,
  status text DEFAULT 'active'::text NOT NULL,
  reported_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.student_records_destination (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  destination_type text NOT NULL,
  school_name text,
  school_city text,
  school_state text,
  school_district text,
  registrar_name text,
  registrar_email text,
  registrar_phone text,
  student_id_at_school text,
  auto_send_consent boolean DEFAULT false NOT NULL,
  consent_captured_at timestamp with time zone,
  consent_captured_by uuid,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.student_wallets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  spendable_xp integer DEFAULT 0 NOT NULL,
  total_xp_spent integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.student_weekly_xp_goals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_user_id uuid NOT NULL,
  organization_id uuid,
  target_xp integer NOT NULL,
  effective_from date NOT NULL,
  set_by uuid NOT NULL,
  set_by_role text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.task_feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  completion_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  feedback_text text NOT NULL,
  revision_number integer NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.task_steps (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  parent_step_id uuid,
  title text NOT NULL,
  description text,
  order_index integer DEFAULT 0 NOT NULL,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  granularity text DEFAULT 'quick'::text NOT NULL,
  generation_depth integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.transcript_overrides (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.transcript_share_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token text NOT NULL,
  user_id uuid NOT NULL,
  issued_by uuid NOT NULL,
  label text,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  view_count integer DEFAULT 0 NOT NULL,
  last_viewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.transcript_transfer_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  sent_by uuid,
  school_name text NOT NULL,
  recipient_name text,
  recipient_email text NOT NULL,
  message text,
  status text DEFAULT 'sent'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.transfer_credits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  subject_xp jsonb DEFAULT '{}'::jsonb NOT NULL,
  transcript_url text,
  school_name text,
  notes text,
  total_xp integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  course_names jsonb DEFAULT '{}'::jsonb,
  prior_learning_record_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
CREATE TABLE IF NOT EXISTS public.treehouse_kiosk_devices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  label text NOT NULL,
  token_hash text NOT NULL,
  created_by uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.treehouse_pins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  status text DEFAULT 'created'::text NOT NULL,
  marked_by uuid,
  marked_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.treehouse_showcase_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  theme text,
  description text,
  showcase_date date,
  prompts jsonb DEFAULT '[]'::jsonb NOT NULL,
  examples jsonb DEFAULT '[]'::jsonb NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.treehouse_showcase_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  student_id uuid NOT NULL,
  project_title text,
  project_category text,
  quest_id uuid,
  joined_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.treehouse_signals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  signal_type text NOT NULL,
  quest_id uuid,
  task_id uuid,
  note text,
  status text DEFAULT 'open'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_by uuid,
  resolved_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.tutor_conversations (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  title character varying(255),
  conversation_mode conversation_mode DEFAULT 'study_buddy'::conversation_mode,
  quest_id uuid,
  task_id uuid,
  is_active boolean DEFAULT true,
  message_count integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  last_message_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tutor_messages (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  conversation_id uuid NOT NULL,
  role message_role NOT NULL,
  content text NOT NULL,
  tokens_used integer DEFAULT 0,
  safety_level safety_level DEFAULT 'safe'::safety_level,
  safety_reasons text[],
  flagged_terms text[],
  context_data jsonb,
  xp_bonus_awarded boolean DEFAULT false,
  parent_notified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tutor_safety_reports (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  conversation_id uuid,
  message_id uuid,
  incident_type character varying(50) NOT NULL,
  safety_level safety_level NOT NULL,
  original_message text NOT NULL,
  flagged_terms text[],
  safety_reasons text[],
  confidence_score numeric(3,2),
  admin_reviewed boolean DEFAULT false,
  admin_notes text,
  parent_notified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.tutor_settings (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  preferred_mode conversation_mode DEFAULT 'study_buddy'::conversation_mode,
  daily_message_limit integer DEFAULT 50,
  messages_used_today integer DEFAULT 0,
  last_reset_date date DEFAULT CURRENT_DATE,
  parent_monitoring_enabled boolean DEFAULT true,
  notification_preferences jsonb DEFAULT '{}'::jsonb,
  age_verification integer,
  learning_style character varying(50),
  topic_restrictions text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tutor_tier_limits (
  tier character varying(20) NOT NULL,
  daily_message_limit integer NOT NULL,
  features text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tutorial_verification_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  verified_at timestamp with time zone DEFAULT now(),
  verification_data jsonb
);
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  session_id uuid NOT NULL,
  event_type character varying(100) NOT NULL,
  event_category character varying(50) NOT NULL,
  event_data jsonb,
  page_url text,
  referrer_url text,
  user_agent text,
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now(),
  anonymized_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.user_mastery (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  total_xp integer DEFAULT 0 NOT NULL,
  mastery_level integer DEFAULT 1 NOT NULL,
  last_updated timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_quest_tasks (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  user_quest_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  pillar text NOT NULL,
  xp_value integer DEFAULT 100,
  order_index integer DEFAULT 0,
  is_required boolean DEFAULT false,
  is_manual boolean DEFAULT false,
  approval_status text DEFAULT 'approved'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  diploma_subjects jsonb DEFAULT '["Electives"]'::jsonb,
  subject_xp_distribution jsonb DEFAULT '{}'::jsonb,
  auto_complete boolean DEFAULT false,
  verification_query jsonb,
  source_task_id uuid,
  source_moment_id uuid,
  source_template_task_id uuid,
  latest_feedback text,
  feedback_at timestamp with time zone,
  current_revision integer DEFAULT 0,
  due_date timestamp with time zone,
  success_criteria jsonb
);
CREATE TABLE IF NOT EXISTS public.user_quests (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  personalization_completed boolean DEFAULT false,
  personalization_session_id uuid,
  status text DEFAULT 'picked_up'::text,
  times_picked_up integer DEFAULT 1,
  last_picked_up_at timestamp with time zone DEFAULT now(),
  last_set_down_at timestamp with time zone,
  reflection_notes jsonb DEFAULT '[]'::jsonb,
  task_display_mode text DEFAULT 'flexible'::text,
  lti_canvas_score numeric(7,2),
  lti_canvas_score_max numeric(7,2),
  lti_canvas_grading_progress text,
  lti_canvas_polled_at timestamp with time zone,
  archived_at timestamp with time zone,
  archive_reason text,
  archive_feedback text
);
CREATE TABLE IF NOT EXISTS public.user_skill_details (
  id integer DEFAULT nextval('user_skill_details_id_seq'::regclass) NOT NULL,
  user_id uuid,
  skill_name text NOT NULL,
  times_practiced integer DEFAULT 0,
  last_practiced timestamp without time zone
);
CREATE TABLE IF NOT EXISTS public.user_skill_xp (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  pillar text NOT NULL,
  xp_amount integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_subject_xp (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  school_subject school_subject NOT NULL,
  xp_amount integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  pending_xp integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.user_task_evidence_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  task_id uuid NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  is_confidential boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL,
  first_name character varying(100),
  last_name character varying(100),
  display_name character varying(100),
  email character varying(255),
  role character varying(50) DEFAULT 'student'::character varying,
  level integer DEFAULT 1,
  streak_days integer DEFAULT 0,
  last_active timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb,
  bio text,
  avatar_url text,
  portfolio_slug character varying(100),
  total_xp integer DEFAULT 0,
  achievements_count integer DEFAULT 0,
  tos_accepted_at timestamp with time zone,
  privacy_policy_accepted_at timestamp with time zone,
  tos_version character varying(50) DEFAULT '1.0'::character varying,
  privacy_policy_version character varying(50) DEFAULT '1.0'::character varying,
  date_of_birth date,
  requires_parental_consent boolean DEFAULT false,
  parental_consent_email character varying,
  parental_consent_verified boolean DEFAULT false,
  parental_consent_verified_at timestamp with time zone,
  parental_consent_token character varying,
  deletion_requested_at timestamp with time zone,
  deletion_status character varying DEFAULT 'none'::character varying,
  deletion_scheduled_for timestamp with time zone,
  marketing_emails_enabled boolean DEFAULT true,
  product_updates_enabled boolean DEFAULT true,
  educational_content_enabled boolean DEFAULT true,
  phone_number text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  welcome_email_sent boolean DEFAULT false,
  tutorial_completed_at timestamp with time zone,
  organization_id uuid,
  is_org_admin boolean DEFAULT false,
  is_dependent boolean DEFAULT false,
  managed_by_parent_id uuid,
  promotion_eligible_at date,
  last_logout_at timestamp with time zone,
  parental_consent_status character varying(50) DEFAULT 'pending_submission'::character varying,
  parental_consent_id_document_url text,
  parental_consent_signed_form_url text,
  parental_consent_verified_by uuid,
  parental_consent_rejection_reason text,
  parental_consent_submitted_at timestamp with time zone,
  google_user_id uuid,
  ai_features_enabled boolean DEFAULT false,
  ai_features_enabled_at timestamp with time zone,
  ai_features_enabled_by uuid,
  ai_chatbot_enabled boolean DEFAULT true,
  ai_lesson_helper_enabled boolean DEFAULT true,
  ai_task_generation_enabled boolean DEFAULT true,
  org_role text,
  username character varying(50),
  ai_assistance_level text DEFAULT 'suggestions'::text,
  org_roles jsonb,
  apple_user_id text,
  program_key text,
  preferred_name text,
  gender text,
  allergies text,
  medications text,
  sis_tuition_plan text,
  preferred_challenge_level text,
  date_of_birth_locked_at timestamp with time zone,
  deletion_attempts integer DEFAULT 0 NOT NULL,
  deletion_last_attempt_at timestamp with time zone,
  deletion_last_error text,
  phone_verified_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.xp_award_failures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  task_id uuid,
  pillar text NOT NULL,
  xp_amount integer NOT NULL,
  reason text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

--
-- CONSTRAINTS (primary key, unique, check) (568)
--
ALTER TABLE public.academy_enrollments ADD CONSTRAINT academy_enrollments_pathway_check CHECK ((pathway = ANY (ARRAY['full_time'::text, 'parent_supported'::text, 'partner_credit'::text])));
ALTER TABLE public.academy_enrollments ADD CONSTRAINT academy_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE public.academy_enrollments ADD CONSTRAINT academy_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'withdrawn'::text])));
ALTER TABLE public.account_deletion_log ADD CONSTRAINT account_deletion_log_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_masquerade_log ADD CONSTRAINT admin_masquerade_log_pkey PRIMARY KEY (id);
ALTER TABLE public.advisor_checkins ADD CONSTRAINT advisor_checkins_pkey PRIMARY KEY (id);
ALTER TABLE public.advisor_notes ADD CONSTRAINT advisor_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_advisor_id_student_id_key UNIQUE (advisor_id, student_id);
ALTER TABLE public.advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_generated_quests ADD CONSTRAINT ai_generated_quests_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_generated_quests ADD CONSTRAINT ai_generated_quests_quality_score_check CHECK (((quality_score >= (0)::numeric) AND (quality_score <= (100)::numeric)));
ALTER TABLE public.ai_generated_quests ADD CONSTRAINT ai_generated_quests_review_status_check CHECK (((review_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'modified'::character varying, 'published'::character varying])::text[])));
ALTER TABLE public.ai_generation_jobs ADD CONSTRAINT ai_generation_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_generation_jobs ADD CONSTRAINT ai_generation_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])));
ALTER TABLE public.ai_prompt_components ADD CONSTRAINT ai_prompt_components_name_key UNIQUE (name);
ALTER TABLE public.ai_prompt_components ADD CONSTRAINT ai_prompt_components_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_generation_source_check CHECK (((generation_source)::text = ANY ((ARRAY['manual'::character varying, 'batch'::character varying, 'student_idea'::character varying, 'badge_aligned'::character varying])::text[])));
ALTER TABLE public.ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_quality_score_check CHECK (((quality_score >= (0)::numeric) AND (quality_score <= (10)::numeric)));
ALTER TABLE public.ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'edited'::character varying])::text[])));
ALTER TABLE public.ai_seeds ADD CONSTRAINT ai_seeds_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_seeds ADD CONSTRAINT ai_seeds_prompt_name_key UNIQUE (prompt_name);
ALTER TABLE public.ai_task_cache ADD CONSTRAINT ai_task_cache_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.announcement_reads ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (id);
ALTER TABLE public.announcement_reads ADD CONSTRAINT announcement_reads_unique UNIQUE (announcement_id, user_id);
ALTER TABLE public.announcement_recipients ADD CONSTRAINT announcement_recipients_pkey PRIMARY KEY (announcement_id, user_id);
ALTER TABLE public.announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_sequences ADD CONSTRAINT automation_sequences_pkey PRIMARY KEY (id);
ALTER TABLE public.bounties ADD CONSTRAINT bounties_bounty_type_check CHECK ((bounty_type = ANY (ARRAY['open'::text, 'challenge'::text, 'family'::text, 'org'::text, 'sponsored'::text])));
ALTER TABLE public.bounties ADD CONSTRAINT bounties_max_participants_check CHECK ((max_participants >= 0));
ALTER TABLE public.bounties ADD CONSTRAINT bounties_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'ai_approved'::text, 'manually_approved'::text, 'rejected'::text])));
ALTER TABLE public.bounties ADD CONSTRAINT bounties_pillar_check CHECK ((pillar = ANY (ARRAY['stem'::text, 'art'::text, 'communication'::text, 'civics'::text, 'wellness'::text])));
ALTER TABLE public.bounties ADD CONSTRAINT bounties_pkey PRIMARY KEY (id);
ALTER TABLE public.bounties ADD CONSTRAINT bounties_platform_fee_cents_check CHECK (((platform_fee_cents IS NULL) OR (platform_fee_cents >= 0)));
ALTER TABLE public.bounties ADD CONSTRAINT bounties_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'active'::text, 'completed'::text, 'expired'::text, 'rejected'::text])));
ALTER TABLE public.bounties ADD CONSTRAINT bounties_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'organization'::text, 'family'::text])));
ALTER TABLE public.bounties ADD CONSTRAINT bounties_xp_reward_check CHECK (((xp_reward >= 0) AND (xp_reward <= 500)));
ALTER TABLE public.bounties ADD CONSTRAINT chk_bounties_audience CHECK ((audience = ANY (ARRAY['students'::text, 'staff'::text])));
ALTER TABLE public.bounty_claims ADD CONSTRAINT bounty_claims_pkey PRIMARY KEY (id);
ALTER TABLE public.bounty_claims ADD CONSTRAINT bounty_claims_status_check CHECK ((status = ANY (ARRAY['claimed'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'revision_requested'::text])));
ALTER TABLE public.bounty_claims ADD CONSTRAINT unique_student_bounty UNIQUE (bounty_id, student_id);
ALTER TABLE public.bounty_reviews ADD CONSTRAINT bounty_reviews_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text, 'revision_requested'::text])));
ALTER TABLE public.bounty_reviews ADD CONSTRAINT bounty_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.buddies ADD CONSTRAINT buddies_bond_check CHECK (((bond >= (0)::double precision) AND (bond <= (1)::double precision)));
ALTER TABLE public.buddies ADD CONSTRAINT buddies_pkey PRIMARY KEY (id);
ALTER TABLE public.buddies ADD CONSTRAINT buddies_stage_check CHECK (((stage >= 0) AND (stage <= 6)));
ALTER TABLE public.buddies ADD CONSTRAINT buddies_user_id_key UNIQUE (user_id);
ALTER TABLE public.buddies ADD CONSTRAINT buddies_vitality_check CHECK (((vitality >= (0)::double precision) AND (vitality <= (1)::double precision)));
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_status_check CHECK ((status = ANY (ARRAY['new'::text, 'triaged'::text, 'fixing'::text, 'resolved'::text, 'wont_fix'::text])));
ALTER TABLE public.class_advisors ADD CONSTRAINT class_advisors_class_id_advisor_id_key UNIQUE (class_id, advisor_id);
ALTER TABLE public.class_advisors ADD CONSTRAINT class_advisors_pkey PRIMARY KEY (id);
ALTER TABLE public.class_discussion_posts ADD CONSTRAINT class_discussion_posts_pkey PRIMARY KEY (id);
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_class_id_student_id_key UNIQUE (class_id, student_id);
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'withdrawn'::character varying])::text[])));
ALTER TABLE public.class_materials ADD CONSTRAINT class_materials_kind_check CHECK ((kind = ANY (ARRAY['file'::text, 'link'::text])));
ALTER TABLE public.class_materials ADD CONSTRAINT class_materials_pkey PRIMARY KEY (id);
ALTER TABLE public.class_meetings ADD CONSTRAINT class_meetings_check CHECK (((day_of_week IS NOT NULL) OR (specific_date IS NOT NULL)));
ALTER TABLE public.class_meetings ADD CONSTRAINT class_meetings_day_of_week_check CHECK (((day_of_week IS NULL) OR ((day_of_week >= 0) AND (day_of_week <= 6))));
ALTER TABLE public.class_meetings ADD CONSTRAINT class_meetings_pkey PRIMARY KEY (id);
ALTER TABLE public.class_prerequisites ADD CONSTRAINT class_prerequisites_pkey PRIMARY KEY (id);
ALTER TABLE public.class_quests ADD CONSTRAINT class_quests_class_id_quest_id_key UNIQUE (class_id, quest_id);
ALTER TABLE public.class_quests ADD CONSTRAINT class_quests_pkey PRIMARY KEY (id);
ALTER TABLE public.consultation_requests ADD CONSTRAINT consultation_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.contact_submissions ADD CONSTRAINT contact_submissions_contact_type_check CHECK ((contact_type = ANY (ARRAY['demo'::text, 'sales'::text, 'general'::text, 'families'::text, 'philosophy'::text, 'academy'::text, 'claim_free_class'::text, 'course_purchase'::text])));
ALTER TABLE public.contact_submissions ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.contact_submissions ADD CONSTRAINT contact_submissions_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'closed'::text])));
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reason_check CHECK ((reason = ANY (ARRAY['spam'::text, 'harassment'::text, 'inappropriate'::text, 'self_harm'::text, 'other'::text])));
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text, 'actioned'::text])));
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check CHECK ((target_type = ANY (ARRAY['learning_event'::text, 'task_completion'::text, 'comment'::text, 'user'::text])));
ALTER TABLE public.content_reports ADD CONSTRAINT unique_reporter_target UNIQUE (reporter_id, target_type, target_id);
ALTER TABLE public.course_enrollments ADD CONSTRAINT completed_has_timestamp CHECK (((((status)::text = 'completed'::text) AND (completed_at IS NOT NULL)) OR (((status)::text <> 'completed'::text) AND (completed_at IS NULL))));
ALTER TABLE public.course_enrollments ADD CONSTRAINT course_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE public.course_enrollments ADD CONSTRAINT unique_course_enrollment UNIQUE (course_id, user_id);
ALTER TABLE public.course_enrollments ADD CONSTRAINT valid_enrollment_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'dropped'::character varying])::text[])));
ALTER TABLE public.course_generation_jobs ADD CONSTRAINT course_generation_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.course_plan_sessions ADD CONSTRAINT course_plan_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.course_plan_sessions ADD CONSTRAINT course_plan_sessions_status_check CHECK ((status = ANY (ARRAY['drafting'::text, 'approved'::text, 'generating'::text, 'completed'::text, 'abandoned'::text])));
ALTER TABLE public.course_quest_tasks ADD CONSTRAINT course_quest_tasks_pillar_check CHECK ((pillar = ANY (ARRAY['stem'::text, 'wellness'::text, 'communication'::text, 'civics'::text, 'art'::text])));
ALTER TABLE public.course_quest_tasks ADD CONSTRAINT course_quest_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.course_quest_tasks ADD CONSTRAINT course_quest_tasks_xp_value_check CHECK ((xp_value > 0));
ALTER TABLE public.course_quests ADD CONSTRAINT check_course_quest_xp_threshold_non_negative CHECK (((xp_threshold IS NULL) OR (xp_threshold >= 0)));
ALTER TABLE public.course_quests ADD CONSTRAINT course_quests_pkey PRIMARY KEY (id);
ALTER TABLE public.course_quests ADD CONSTRAINT unique_course_quest UNIQUE (course_id, quest_id);
ALTER TABLE public.course_quests ADD CONSTRAINT unique_course_sequence UNIQUE (course_id, sequence_order);
ALTER TABLE public.course_refine_sessions ADD CONSTRAINT course_refine_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.course_refine_sessions ADD CONSTRAINT course_refine_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.courses ADD CONSTRAINT courses_guidance_level_check CHECK (((guidance_level IS NULL) OR (guidance_level = ANY (ARRAY['guided'::text, 'moderate'::text, 'independent'::text]))));
ALTER TABLE public.courses ADD CONSTRAINT courses_pkey PRIMARY KEY (id);
ALTER TABLE public.courses ADD CONSTRAINT courses_slug_key UNIQUE (slug);
ALTER TABLE public.courses ADD CONSTRAINT valid_course_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public.courses ADD CONSTRAINT valid_course_visibility CHECK (((visibility)::text = ANY ((ARRAY['organization'::character varying, 'public'::character varying, 'private'::character varying])::text[])));
ALTER TABLE public.courses ADD CONSTRAINT valid_credit_amount CHECK (((credit_amount IS NULL) OR ((credit_amount > (0)::numeric) AND (credit_amount <= (5)::numeric))));
ALTER TABLE public.courses ADD CONSTRAINT valid_navigation_mode CHECK (((navigation_mode)::text = ANY ((ARRAY['sequential'::character varying, 'freeform'::character varying])::text[])));
ALTER TABLE public.credit_ledger ADD CONSTRAINT credit_ledger_pkey PRIMARY KEY (id);
ALTER TABLE public.credit_ledger ADD CONSTRAINT credits_earned_valid CHECK ((credits_earned >= (0)::numeric));
ALTER TABLE public.credit_review_messages ADD CONSTRAINT credit_review_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_calendar_bookings ADD CONSTRAINT crm_calendar_bookings_gcal_event_id_attendee_email_key UNIQUE (gcal_event_id, attendee_email);
ALTER TABLE public.crm_calendar_bookings ADD CONSTRAINT crm_calendar_bookings_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_email_events ADD CONSTRAINT crm_email_events_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_email_events ADD CONSTRAINT crm_email_events_sg_event_id_key UNIQUE (sg_event_id);
ALTER TABLE public.crm_events ADD CONSTRAINT crm_events_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_funnel_memberships ADD CONSTRAINT crm_funnel_memberships_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_funnel_memberships ADD CONSTRAINT crm_funnel_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'exited'::text])));
ALTER TABLE public.crm_funnel_steps ADD CONSTRAINT crm_funnel_steps_delay_hours_check CHECK ((delay_hours >= 0));
ALTER TABLE public.crm_funnel_steps ADD CONSTRAINT crm_funnel_steps_funnel_id_step_order_key UNIQUE (funnel_id, step_order);
ALTER TABLE public.crm_funnel_steps ADD CONSTRAINT crm_funnel_steps_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_funnels ADD CONSTRAINT crm_funnels_funnel_type_check CHECK ((funnel_type = ANY (ARRAY['nurture'::text, 'onboarding'::text])));
ALTER TABLE public.crm_funnels ADD CONSTRAINT crm_funnels_key_key UNIQUE (key);
ALTER TABLE public.crm_funnels ADD CONSTRAINT crm_funnels_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_funnels ADD CONSTRAINT crm_funnels_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text])));
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_email_check CHECK ((email = lower(email)));
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_email_key UNIQUE (email);
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_status_check CHECK ((status = ANY (ARRAY['active'::text, 'converted'::text, 'unsubscribed'::text, 'suppressed'::text])));
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_unsubscribe_token_key UNIQUE (unsubscribe_token);
ALTER TABLE public.crm_sends ADD CONSTRAINT crm_sends_membership_id_step_id_key UNIQUE (membership_id, step_id);
ALTER TABLE public.crm_sends ADD CONSTRAINT crm_sends_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_sends ADD CONSTRAINT crm_sends_status_check CHECK ((status = ANY (ARRAY['sending'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public.crm_settings ADD CONSTRAINT crm_settings_pkey PRIMARY KEY (key);
ALTER TABLE public.crm_suppressions ADD CONSTRAINT crm_suppressions_email_check CHECK ((email = lower(email)));
ALTER TABLE public.crm_suppressions ADD CONSTRAINT crm_suppressions_email_key UNIQUE (email);
ALTER TABLE public.crm_suppressions ADD CONSTRAINT crm_suppressions_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_suppressions ADD CONSTRAINT crm_suppressions_reason_check CHECK ((reason = ANY (ARRAY['unsubscribe'::text, 'hard_bounce'::text, 'spam_report'::text, 'manual'::text])));
ALTER TABLE public.curriculum_attachments ADD CONSTRAINT curriculum_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_pkey PRIMARY KEY (id);
ALTER TABLE public.curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_progress_percentage_check CHECK (((progress_percentage >= 0) AND (progress_percentage <= 100)));
ALTER TABLE public.curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE public.curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_user_id_lesson_id_key UNIQUE (user_id, lesson_id);
ALTER TABLE public.curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_lesson_id_task_id_key UNIQUE (lesson_id, task_id);
ALTER TABLE public.curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.curriculum_lessons ADD CONSTRAINT check_xp_threshold_non_negative CHECK (((xp_threshold IS NULL) OR (xp_threshold >= 0)));
ALTER TABLE public.curriculum_lessons ADD CONSTRAINT curriculum_lessons_pkey PRIMARY KEY (id);
ALTER TABLE public.curriculum_lessons ADD CONSTRAINT curriculum_lessons_quest_id_sequence_order_key UNIQUE (quest_id, sequence_order);
ALTER TABLE public.curriculum_settings ADD CONSTRAINT curriculum_settings_navigation_mode_check CHECK ((navigation_mode = ANY (ARRAY['sequential'::text, 'free'::text])));
ALTER TABLE public.curriculum_settings ADD CONSTRAINT curriculum_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.curriculum_settings ADD CONSTRAINT curriculum_settings_quest_id_key UNIQUE (quest_id);
ALTER TABLE public.curriculum_uploads ADD CONSTRAINT curriculum_uploads_pkey PRIMARY KEY (id);
ALTER TABLE public.curriculum_uploads ADD CONSTRAINT curriculum_uploads_source_type_check CHECK ((source_type = ANY (ARRAY['imscc'::text, 'pdf'::text, 'docx'::text, 'text'::text, 'generate'::text])));
ALTER TABLE public.curriculum_uploads ADD CONSTRAINT curriculum_uploads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready_for_review'::text, 'approved'::text, 'rejected'::text, 'error'::text])));
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])));
ALTER TABLE public.device_tokens ADD CONSTRAINT unique_user_token UNIQUE (user_id, token);
ALTER TABLE public.diploma_review_rounds ADD CONSTRAINT diploma_review_rounds_pkey PRIMARY KEY (id);
ALTER TABLE public.diplomas ADD CONSTRAINT diplomas_pkey PRIMARY KEY (id);
ALTER TABLE public.diplomas ADD CONSTRAINT diplomas_portfolio_slug_key UNIQUE (portfolio_slug);
ALTER TABLE public.diplomas ADD CONSTRAINT diplomas_user_id_key UNIQUE (user_id);
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.docs_articles ADD CONSTRAINT docs_articles_pkey PRIMARY KEY (id);
ALTER TABLE public.docs_articles ADD CONSTRAINT docs_articles_slug_key UNIQUE (slug);
ALTER TABLE public.docs_categories ADD CONSTRAINT docs_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.docs_categories ADD CONSTRAINT docs_categories_slug_key UNIQUE (slug);
ALTER TABLE public.docs_search_misses ADD CONSTRAINT docs_search_misses_normalized_query_key UNIQUE (normalized_query);
ALTER TABLE public.docs_search_misses ADD CONSTRAINT docs_search_misses_pkey PRIMARY KEY (id);
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_template_key_key UNIQUE (template_key);
ALTER TABLE public.emergency_contacts ADD CONSTRAINT emergency_contacts_pkey PRIMARY KEY (id);
ALTER TABLE public.evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_block_type_check CHECK ((block_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'link'::text, 'document'::text])));
ALTER TABLE public.evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_document_id_order_index_key UNIQUE (document_id, order_index);
ALTER TABLE public.evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_pkey PRIMARY KEY (id);
ALTER TABLE public.evidence_report_configs ADD CONSTRAINT evidence_report_configs_access_token_key UNIQUE (access_token);
ALTER TABLE public.evidence_report_configs ADD CONSTRAINT evidence_report_configs_parent_approval_status_check CHECK (((parent_approval_status)::text = ANY ((ARRAY['not_required'::character varying, 'pending'::character varying, 'approved'::character varying, 'denied'::character varying])::text[])));
ALTER TABLE public.evidence_report_configs ADD CONSTRAINT evidence_report_configs_pkey PRIMARY KEY (id);
ALTER TABLE public.evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_pkey PRIMARY KEY (id);
ALTER TABLE public.evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'denied'::character varying])::text[])));
ALTER TABLE public.feed_highlights ADD CONSTRAINT feed_highlights_pkey PRIMARY KEY (id);
ALTER TABLE public.feed_highlights ADD CONSTRAINT feed_highlights_target_type_check CHECK ((target_type = ANY (ARRAY['task_completed'::text, 'learning_moment'::text])));
ALTER TABLE public.feed_highlights ADD CONSTRAINT feed_highlights_target_type_target_id_key UNIQUE (target_type, target_id);
ALTER TABLE public.feed_item_views ADD CONSTRAINT feed_item_views_pkey PRIMARY KEY (id);
ALTER TABLE public.feed_item_views ADD CONSTRAINT must_have_target CHECK (((completion_id IS NOT NULL) OR (learning_event_id IS NOT NULL)));
ALTER TABLE public.feed_item_views ADD CONSTRAINT unique_view_completion UNIQUE (viewer_id, completion_id);
ALTER TABLE public.feed_item_views ADD CONSTRAINT unique_view_learning_event UNIQUE (viewer_id, learning_event_id);
ALTER TABLE public.feed_share_tokens ADD CONSTRAINT feed_share_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.feed_share_tokens ADD CONSTRAINT feed_share_tokens_token_key UNIQUE (token);
ALTER TABLE public.feed_share_tokens ADD CONSTRAINT one_target CHECK ((((completion_id IS NOT NULL) AND (learning_event_id IS NULL)) OR ((completion_id IS NULL) AND (learning_event_id IS NOT NULL))));
ALTER TABLE public.group_conversations ADD CONSTRAINT group_conversations_audience_check CHECK ((audience = ANY (ARRAY['family'::text, 'student'::text])));
ALTER TABLE public.group_conversations ADD CONSTRAINT group_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);
ALTER TABLE public.group_members ADD CONSTRAINT group_members_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'member'::character varying])::text[])));
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_household_id_user_id_key UNIQUE (household_id, user_id);
ALTER TABLE public.household_members ADD CONSTRAINT household_members_pkey PRIMARY KEY (id);
ALTER TABLE public.households ADD CONSTRAINT households_funding_source_check CHECK (((funding_source IS NULL) OR (funding_source = ANY (ARRAY['ufa'::text, 'ufa_private'::text, 'private_pay'::text, 'other'::text]))));
ALTER TABLE public.households ADD CONSTRAINT households_payment_plan_preference_check CHECK (((payment_plan_preference IS NULL) OR (payment_plan_preference = ANY (ARRAY['in_full'::text, 'monthly'::text]))));
ALTER TABLE public.households ADD CONSTRAINT households_pkey PRIMARY KEY (id);
ALTER TABLE public.interest_tracks ADD CONSTRAINT interest_tracks_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_event_evidence_blocks ADD CONSTRAINT learning_event_evidence_blocks_block_type_check CHECK ((block_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'link'::text, 'document'::text, 'audio'::text])));
ALTER TABLE public.learning_event_evidence_blocks ADD CONSTRAINT learning_event_evidence_blocks_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_event_topics ADD CONSTRAINT learning_event_topics_learning_event_id_topic_type_topic_id_key UNIQUE (learning_event_id, topic_type, topic_id);
ALTER TABLE public.learning_event_topics ADD CONSTRAINT learning_event_topics_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_event_topics ADD CONSTRAINT learning_event_topics_topic_type_check CHECK ((topic_type = ANY (ARRAY['topic'::text, 'quest'::text])));
ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_source_type_check CHECK ((source_type = ANY (ARRAY['realtime'::text, 'retroactive'::text, 'parent_captured'::text, 'task_evidence'::text])));
ALTER TABLE public.lesson_reflections ADD CONSTRAINT lesson_reflections_pkey PRIMARY KEY (id);
ALTER TABLE public.lesson_reflections ADD CONSTRAINT lesson_reflections_user_id_lesson_id_key UNIQUE (user_id, lesson_id);
ALTER TABLE public.lms_grade_sync ADD CONSTRAINT lms_grade_sync_pkey PRIMARY KEY (id);
ALTER TABLE public.lms_grade_sync ADD CONSTRAINT lms_grade_sync_valid_platform CHECK (((lms_platform)::text = ANY ((ARRAY['canvas'::character varying, 'google_classroom'::character varying, 'schoology'::character varying, 'moodle'::character varying, 'spark'::character varying])::text[])));
ALTER TABLE public.lms_grade_sync ADD CONSTRAINT lms_grade_sync_valid_score CHECK (((score >= (0)::numeric) AND (score <= max_score)));
ALTER TABLE public.lms_grade_sync ADD CONSTRAINT lms_grade_sync_valid_status CHECK (((sync_status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])));
ALTER TABLE public.lms_integrations ADD CONSTRAINT lms_integrations_pkey PRIMARY KEY (id);
ALTER TABLE public.lms_integrations ADD CONSTRAINT lms_integrations_unique_platform_user UNIQUE (lms_platform, lms_user_id);
ALTER TABLE public.lms_integrations ADD CONSTRAINT lms_integrations_valid_platform CHECK (((lms_platform)::text = ANY ((ARRAY['canvas'::character varying, 'google_classroom'::character varying, 'schoology'::character varying, 'moodle'::character varying, 'spark'::character varying])::text[])));
ALTER TABLE public.lms_integrations ADD CONSTRAINT lms_integrations_valid_status CHECK (((sync_status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'error'::character varying])::text[])));
ALTER TABLE public.lms_sessions ADD CONSTRAINT lms_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.lms_sessions ADD CONSTRAINT lms_sessions_valid_platform CHECK (((lms_platform)::text = ANY ((ARRAY['canvas'::character varying, 'google_classroom'::character varying, 'schoology'::character varying, 'moodle'::character varying, 'spark'::character varying])::text[])));
ALTER TABLE public.login_attempts ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.lti_auth_codes ADD CONSTRAINT lti_auth_codes_pkey PRIMARY KEY (code);
ALTER TABLE public.lti_auth_codes ADD CONSTRAINT lti_auth_codes_subject_present CHECK (((user_id IS NOT NULL) OR (pending_launch_id IS NOT NULL)));
ALTER TABLE public.lti_nonces ADD CONSTRAINT lti_nonces_pkey PRIMARY KEY (nonce);
ALTER TABLE public.lti_pending_launches ADD CONSTRAINT lti_pending_launches_pkey PRIMARY KEY (id);
ALTER TABLE public.lti_registrations ADD CONSTRAINT lti_registrations_pkey PRIMARY KEY (id);
ALTER TABLE public.lti_registrations ADD CONSTRAINT lti_registrations_unique UNIQUE (issuer, client_id, deployment_id);
ALTER TABLE public.message_conversations ADD CONSTRAINT message_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.message_conversations ADD CONSTRAINT unique_conversation_participants UNIQUE (participant_1_id, participant_2_id);
ALTER TABLE public.message_email_relays ADD CONSTRAINT message_email_relays_owner_recipient_key UNIQUE (owner_id, recipient_id);
ALTER TABLE public.message_email_relays ADD CONSTRAINT message_email_relays_pkey PRIMARY KEY (id);
ALTER TABLE public.message_email_relays ADD CONSTRAINT message_email_relays_token_key UNIQUE (token);
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_type_check CHECK ((message_type = ANY (ARRAY['dm'::text, 'group'::text])));
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_message_type_message_id_user_id_emoji_key UNIQUE (message_type, message_id, user_id, emoji);
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_preferences ADD CONSTRAINT unique_user_type UNIQUE (user_id, notification_type);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['quest_invitation'::text, 'quest_started'::text, 'task_approved'::text, 'task_revision_requested'::text, 'announcement'::text, 'observer_comment'::text, 'observer_like'::text, 'badge_earned'::text, 'friendship_request'::text, 'message_received'::text, 'advisor_note'::text, 'system_alert'::text, 'parent_approval_required'::text, 'bounty_submission'::text, 'diploma_credit_approved'::text, 'diploma_credit_grow_this'::text, 'class_submitted_for_review'::text, 'bounty_posted'::text, 'bounty_claimed'::text, 'diploma_credit_requested'::text, 'observer_accepted'::text, 'observer_added'::text, 'org_approved_credit'::text, 'video_processing'::text, 'treehouse_help'::text, 'treehouse_proud'::text, 'treehouse_task_completed'::text, 'treehouse_quest_completed'::text, 'treehouse_showcase_joined'::text, 'student_absent'::text, 'attendance_reminder'::text, 'peer_connection_request'::text, 'peer_connection_needs_approval'::text, 'peer_connection_approved'::text, 'peer_connection_declined'::text, 'peer_comment'::text])));
ALTER TABLE public.observer_access_audit ADD CONSTRAINT observer_access_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.observer_comments ADD CONSTRAINT observer_comments_max_length CHECK ((length(comment_text) <= 2000));
ALTER TABLE public.observer_comments ADD CONSTRAINT observer_comments_not_empty CHECK ((length(TRIM(BOTH FROM comment_text)) > 0));
ALTER TABLE public.observer_comments ADD CONSTRAINT observer_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.observer_invitation_students ADD CONSTRAINT observer_invitation_students_invitation_id_student_id_key UNIQUE (invitation_id, student_id);
ALTER TABLE public.observer_invitation_students ADD CONSTRAINT observer_invitation_students_pkey PRIMARY KEY (id);
ALTER TABLE public.observer_invitations ADD CONSTRAINT observer_invitations_invitation_code_key UNIQUE (invitation_code);
ALTER TABLE public.observer_invitations ADD CONSTRAINT observer_invitations_invited_by_role_check CHECK (((invited_by_role)::text = ANY ((ARRAY['student'::character varying, 'parent'::character varying])::text[])));
ALTER TABLE public.observer_invitations ADD CONSTRAINT observer_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.observer_invitations ADD CONSTRAINT observer_invitations_valid_email CHECK ((observer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text));
ALTER TABLE public.observer_invitations ADD CONSTRAINT observer_invitations_valid_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text])));
ALTER TABLE public.observer_student_links ADD CONSTRAINT observer_student_links_no_self CHECK ((observer_id <> student_id));
ALTER TABLE public.observer_student_links ADD CONSTRAINT observer_student_links_pkey PRIMARY KEY (id);
ALTER TABLE public.observer_student_links ADD CONSTRAINT observer_student_links_unique UNIQUE (observer_id, student_id);
ALTER TABLE public.oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_student_id_credit_id_school_year_term_key UNIQUE (student_id, credit_id, school_year, term_index);
ALTER TABLE public.oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_block_type_check CHECK ((block_type = ANY (ARRAY['text'::text, 'link'::text, 'file'::text])));
ALTER TABLE public.oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_pkey PRIMARY KEY (id);
ALTER TABLE public.oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_credit_id_term_type_term_index_sch_key UNIQUE (credit_id, term_type, term_index, school_year);
ALTER TABLE public.oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_grade_check CHECK ((grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'F'::text])));
ALTER TABLE public.oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_pkey PRIMARY KEY (id);
ALTER TABLE public.oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_term_type_check CHECK ((term_type = ANY (ARRAY['quarter'::text, 'semester'::text, 'annual'::text])));
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_category_check CHECK ((category = ANY (ARRAY['foundation'::text, 'elective'::text])));
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_credit_source_check CHECK ((credit_source = ANY (ARRAY['direct'::text, 'transfer'::text, 'earned_elsewhere'::text])));
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_letter_grade_check CHECK ((letter_grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'F'::text])));
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_pkey PRIMARY KEY (id);
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'complete'::text])));
ALTER TABLE public.oea_enrollments ADD CONSTRAINT oea_enrollments_pathway_key_check CHECK ((pathway_key = ANY (ARRAY['open_balanced'::text, 'traditional'::text, 'college_bound'::text])));
ALTER TABLE public.oea_enrollments ADD CONSTRAINT oea_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE public.oea_enrollments ADD CONSTRAINT oea_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'withdrawn'::text, 'completed'::text])));
ALTER TABLE public.oea_enrollments ADD CONSTRAINT oea_enrollments_student_id_key UNIQUE (student_id);
ALTER TABLE public.oea_help_video_views ADD CONSTRAINT oea_help_video_views_pkey PRIMARY KEY (user_id);
ALTER TABLE public.org_classes ADD CONSTRAINT chk_org_classes_supply_budget_nonneg CHECK (((supply_budget_per_student IS NULL) OR (supply_budget_per_student >= (0)::numeric)));
ALTER TABLE public.org_classes ADD CONSTRAINT chk_org_classes_supply_fee_nonneg CHECK (((supply_fee IS NULL) OR (supply_fee >= (0)::numeric)));
ALTER TABLE public.org_classes ADD CONSTRAINT org_classes_billing_cadence_check CHECK (((billing_cadence IS NULL) OR (billing_cadence = ANY (ARRAY['monthly'::text, 'semester'::text, 'full'::text]))));
ALTER TABLE public.org_classes ADD CONSTRAINT org_classes_billing_type_check CHECK (((billing_type IS NULL) OR (billing_type = ANY (ARRAY['flat'::text, 'per_class'::text, 'recurring'::text]))));
ALTER TABLE public.org_classes ADD CONSTRAINT org_classes_pkey PRIMARY KEY (id);
ALTER TABLE public.org_classes ADD CONSTRAINT org_classes_registration_status_check CHECK ((registration_status = ANY (ARRAY['open'::text, 'closed'::text])));
ALTER TABLE public.org_classes ADD CONSTRAINT org_classes_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public.org_course_settings ADD CONSTRAINT org_course_teachers_organization_id_course_id_key UNIQUE (organization_id, course_id);
ALTER TABLE public.org_course_settings ADD CONSTRAINT org_course_teachers_pkey PRIMARY KEY (id);
ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_invitation_code_key UNIQUE (invitation_code);
ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_role_check CHECK ((role = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'org_admin'::text, 'observer'::text])));
ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])));
ALTER TABLE public.org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_pkey PRIMARY KEY (id);
ALTER TABLE public.org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_token_hash_key UNIQUE (token_hash);
ALTER TABLE public.org_quest_group_items ADD CONSTRAINT org_quest_group_items_pkey PRIMARY KEY (group_id, quest_id);
ALTER TABLE public.org_quest_groups ADD CONSTRAINT org_quest_groups_organization_id_name_key UNIQUE (organization_id, name);
ALTER TABLE public.org_quest_groups ADD CONSTRAINT org_quest_groups_pkey PRIMARY KEY (id);
ALTER TABLE public.org_resources ADD CONSTRAINT org_resources_audience_check CHECK ((audience = ANY (ARRAY['families'::text, 'staff'::text, 'all'::text])));
ALTER TABLE public.org_resources ADD CONSTRAINT org_resources_pkey PRIMARY KEY (id);
ALTER TABLE public.org_resources ADD CONSTRAINT org_resources_visible_to_roles_check CHECK (((visible_to_roles IS NULL) OR (visible_to_roles <@ ARRAY['org_admin'::text, 'campus_coordinator'::text, 'advisor'::text])));
ALTER TABLE public.organization_course_access ADD CONSTRAINT organization_course_access_organization_id_course_id_key UNIQUE (organization_id, course_id);
ALTER TABLE public.organization_course_access ADD CONSTRAINT organization_course_access_pkey PRIMARY KEY (id);
ALTER TABLE public.organization_quest_access ADD CONSTRAINT organization_quest_access_organization_id_quest_id_key UNIQUE (organization_id, quest_id);
ALTER TABLE public.organization_quest_access ADD CONSTRAINT organization_quest_access_pkey PRIMARY KEY (id);
ALTER TABLE public.organization_secrets ADD CONSTRAINT organization_secrets_pkey PRIMARY KEY (organization_id, name);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_accreditation_source_check CHECK ((accreditation_source = ANY (ARRAY['optio'::text, 'self'::text, 'none'::text])));
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_slug_key UNIQUE (slug);
ALTER TABLE public.organizations ADD CONSTRAINT valid_course_policy CHECK (((course_visibility_policy)::text = ANY ((ARRAY['all_optio'::character varying, 'curated'::character varying, 'private_only'::character varying])::text[])));
ALTER TABLE public.organizations ADD CONSTRAINT valid_policy CHECK (((quest_visibility_policy)::text = ANY ((ARRAY['all_optio'::character varying, 'curated'::character varying, 'private_only'::character varying])::text[])));
ALTER TABLE public.parent_digest_sends ADD CONSTRAINT parent_digest_sends_once_per_week UNIQUE (organization_id, parent_user_id, week_date);
ALTER TABLE public.parent_digest_sends ADD CONSTRAINT parent_digest_sends_pkey PRIMARY KEY (id);
ALTER TABLE public.parent_student_links ADD CONSTRAINT parent_student_links_check CHECK ((parent_user_id <> student_user_id));
ALTER TABLE public.parent_student_links ADD CONSTRAINT parent_student_links_parent_user_id_student_user_id_key UNIQUE (parent_user_id, student_user_id);
ALTER TABLE public.parent_student_links ADD CONSTRAINT parent_student_links_pkey PRIMARY KEY (id);
ALTER TABLE public.parent_student_links ADD CONSTRAINT valid_link_status CHECK (((status)::text = ANY ((ARRAY['pending_approval'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])));
ALTER TABLE public.parental_consent_log ADD CONSTRAINT parental_consent_log_consent_method_check CHECK ((consent_method = ANY (ARRAY['email_link'::text, 'esignature'::text, 'admin_assisted'::text])));
ALTER TABLE public.parental_consent_log ADD CONSTRAINT parental_consent_log_pkey PRIMARY KEY (id);
ALTER TABLE public.password_reset_attempts ADD CONSTRAINT password_reset_attempts_email_key UNIQUE (email);
ALTER TABLE public.password_reset_attempts ADD CONSTRAINT password_reset_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.password_reset_tokens ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.password_reset_tokens ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);
ALTER TABLE public.peer_comments ADD CONSTRAINT peer_comments_not_self CHECK ((author_id <> student_id));
ALTER TABLE public.peer_comments ADD CONSTRAINT peer_comments_one_target CHECK ((((((learning_event_id IS NOT NULL))::integer + ((task_completion_id IS NOT NULL))::integer) + ((quest_id IS NOT NULL))::integer) = 1));
ALTER TABLE public.peer_comments ADD CONSTRAINT peer_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.peer_connect_codes ADD CONSTRAINT peer_connect_codes_pkey PRIMARY KEY (id);
ALTER TABLE public.peer_connection_approvals ADD CONSTRAINT peer_connection_approvals_kind_check CHECK (((approver_kind IS NULL) OR (approver_kind = ANY (ARRAY['parent'::text, 'org_admin'::text]))));
ALTER TABLE public.peer_connection_approvals ADD CONSTRAINT peer_connection_approvals_one_per_side UNIQUE (connection_id, student_id);
ALTER TABLE public.peer_connection_approvals ADD CONSTRAINT peer_connection_approvals_pkey PRIMARY KEY (id);
ALTER TABLE public.peer_connection_approvals ADD CONSTRAINT peer_connection_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])));
ALTER TABLE public.peer_connections ADD CONSTRAINT peer_connections_not_self CHECK ((requester_id <> addressee_id));
ALTER TABLE public.peer_connections ADD CONSTRAINT peer_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.peer_connections ADD CONSTRAINT peer_connections_status_check CHECK ((status = ANY (ARRAY['pending_addressee'::text, 'pending_approval'::text, 'active'::text, 'declined'::text, 'revoked'::text])));
ALTER TABLE public.philosophy_edges ADD CONSTRAINT philosophy_edges_edge_type_check CHECK ((edge_type = ANY (ARRAY['includes'::text, 'connects_to'::text])));
ALTER TABLE public.philosophy_edges ADD CONSTRAINT philosophy_edges_pkey PRIMARY KEY (id);
ALTER TABLE public.philosophy_nodes ADD CONSTRAINT philosophy_nodes_level_check CHECK ((level = ANY (ARRAY[0, 1, 2])));
ALTER TABLE public.philosophy_nodes ADD CONSTRAINT philosophy_nodes_pkey PRIMARY KEY (id);
ALTER TABLE public.philosophy_nodes ADD CONSTRAINT philosophy_nodes_slug_key UNIQUE (slug);
ALTER TABLE public.phone_verification_codes ADD CONSTRAINT phone_verification_codes_pkey PRIMARY KEY (id);
ALTER TABLE public.planned_credits ADD CONSTRAINT planned_credits_pkey PRIMARY KEY (id);
ALTER TABLE public.planned_credits ADD CONSTRAINT planned_credits_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'dropped'::text])));
ALTER TABLE public.poe_cohorts ADD CONSTRAINT poe_cohorts_pkey PRIMARY KEY (id);
ALTER TABLE public.poe_cohorts ADD CONSTRAINT poe_cohorts_slug_key UNIQUE (slug);
ALTER TABLE public.poe_participants ADD CONSTRAINT poe_participants_pkey PRIMARY KEY (id);
ALTER TABLE public.poe_participants ADD CONSTRAINT poe_participants_user_id_poe_cohort_id_key UNIQUE (user_id, poe_cohort_id);
ALTER TABLE public.poe_signups ADD CONSTRAINT poe_signups_pkey PRIMARY KEY (id);
ALTER TABLE public.portfolio_visibility_reset_20260801 ADD CONSTRAINT portfolio_visibility_reset_20260801_pkey PRIMARY KEY (user_id);
ALTER TABLE public.portfolio_visibility_reset_20260802 ADD CONSTRAINT portfolio_visibility_reset_20260802_pkey PRIMARY KEY (user_id);
ALTER TABLE public.prior_learning_evidence ADD CONSTRAINT prior_learning_evidence_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['text'::text, 'link'::text, 'video'::text, 'image'::text, 'document'::text])));
ALTER TABLE public.prior_learning_evidence ADD CONSTRAINT prior_learning_evidence_pkey PRIMARY KEY (id);
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_ai_status_check CHECK ((ai_status = ANY (ARRAY['not_run'::text, 'queued'::text, 'running'::text, 'complete'::text, 'failed'::text])));
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_pkey PRIMARY KEY (id);
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_source_check CHECK ((source = ANY (ARRAY['family'::text, 'staff'::text])));
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'under_review'::text, 'accepted'::text, 'rejected'::text])));
ALTER TABLE public.promo_interest ADD CONSTRAINT promo_interest_pkey PRIMARY KEY (id);
ALTER TABLE public.public_visibility_requests ADD CONSTRAINT public_visibility_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.public_visibility_requests ADD CONSTRAINT public_visibility_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])));
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.quest_invitations ADD CONSTRAINT quest_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.quest_invitations ADD CONSTRAINT quest_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])));
ALTER TABLE public.quest_personalization_sessions ADD CONSTRAINT quest_personalization_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_pillar_check CHECK ((pillar = ANY (ARRAY['stem'::text, 'wellness'::text, 'communication'::text, 'civics'::text, 'art'::text])));
ALTER TABLE public.quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_xp_value_check CHECK ((xp_value > 0));
ALTER TABLE public.quest_sources ADD CONSTRAINT quest_sources_pkey PRIMARY KEY (id);
ALTER TABLE public.quest_task_completions ADD CONSTRAINT quest_task_completions_diploma_status_check CHECK ((diploma_status = ANY (ARRAY['none'::text, 'draft'::text, 'ready_for_credit'::text, 'pending_review'::text, 'pending_org_approval'::text, 'grow_this'::text, 'finalized'::text, 'merged'::text])));
ALTER TABLE public.quest_task_completions ADD CONSTRAINT quest_task_completions_pkey PRIMARY KEY (id);
ALTER TABLE public.quest_task_completions ADD CONSTRAINT quest_task_completions_user_id_task_id_key UNIQUE (user_id, task_id);
ALTER TABLE public.quest_template_tasks ADD CONSTRAINT quest_template_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.quests ADD CONSTRAINT check_quest_type CHECK (((quest_type)::text = ANY ((ARRAY['optio'::character varying, 'course'::character varying, 'class'::character varying])::text[])));
ALTER TABLE public.quests ADD CONSTRAINT check_xp_threshold_nonneg CHECK (((xp_threshold IS NULL) OR (xp_threshold >= 0)));
ALTER TABLE public.quests ADD CONSTRAINT quests_class_review_status_check CHECK (((class_review_status IS NULL) OR (class_review_status = ANY (ARRAY['submitted_for_review'::text, 'credit_awarded'::text, 'rejected'::text]))));
ALTER TABLE public.quests ADD CONSTRAINT quests_pkey PRIMARY KEY (id);
ALTER TABLE public.quests ADD CONSTRAINT quests_transcript_subject_check CHECK (((transcript_subject IS NULL) OR (transcript_subject = ANY (ARRAY['language_arts'::text, 'math'::text, 'science'::text, 'social_studies'::text, 'financial_literacy'::text, 'health'::text, 'pe'::text, 'fine_arts'::text, 'cte'::text, 'digital_literacy'::text, 'electives'::text]))));
ALTER TABLE public.refresh_token_families ADD CONSTRAINT refresh_token_families_pkey PRIMARY KEY (id);
ALTER TABLE public.registrations ADD CONSTRAINT registrations_pkey PRIMARY KEY (id);
ALTER TABLE public.registrations ADD CONSTRAINT registrations_status_check CHECK ((status = ANY (ARRAY['verify'::text, 'family'::text, 'details'::text, 'paperwork'::text, 'fee'::text, 'schedule'::text, 'appointment'::text, 'completed'::text])));
ALTER TABLE public.role_change_log ADD CONSTRAINT role_change_log_pkey PRIMARY KEY (id);
ALTER TABLE public.scheduled_jobs ADD CONSTRAINT scheduled_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.scheduled_jobs ADD CONSTRAINT valid_priority CHECK (((priority >= 1) AND (priority <= 10)));
ALTER TABLE public.scheduled_jobs ADD CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE public.school_enrollments ADD CONSTRAINT school_enrollments_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE public.school_enrollments ADD CONSTRAINT school_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE public.school_enrollments ADD CONSTRAINT school_enrollments_status_check CHECK ((status = ANY (ARRAY['applicant'::text, 'enrolled'::text, 'withdrawn'::text, 'graduated'::text])));
ALTER TABLE public.security_warnings_documentation ADD CONSTRAINT security_warnings_documentation_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])));
ALTER TABLE public.sis_announcements ADD CONSTRAINT sis_announcements_audience_check CHECK ((audience = ANY (ARRAY['school'::text, 'teachers'::text, 'admins'::text])));
ALTER TABLE public.sis_announcements ADD CONSTRAINT sis_announcements_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_assignment_templates ADD CONSTRAINT sis_assignment_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_attendance ADD CONSTRAINT sis_attendance_class_id_student_user_id_date_key UNIQUE (class_id, student_user_id, date);
ALTER TABLE public.sis_attendance ADD CONSTRAINT sis_attendance_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_attendance ADD CONSTRAINT sis_attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])));
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_alert_type_check CHECK ((alert_type = ANY (ARRAY['checkin_reminder'::text, 'gap_alert'::text, 'unaccounted'::text])));
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_resolution_check CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['elsewhere_on_campus'::text, 'late'::text, 'absent_no_notice'::text, 'mismarked'::text, 'other'::text]))));
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])));
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_student_user_id_date_alert_type_key UNIQUE (student_user_id, date, alert_type);
ALTER TABLE public.sis_billing_audit ADD CONSTRAINT sis_billing_audit_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])));
ALTER TABLE public.sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_type_check CHECK ((type = ANY (ARRAY['offer'::text, 'need'::text])));
ALTER TABLE public.sis_clp_records ADD CONSTRAINT sis_clp_records_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE public.sis_clp_records ADD CONSTRAINT sis_clp_records_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_curriculum ADD CONSTRAINT sis_curriculum_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_curriculum_classes ADD CONSTRAINT sis_curriculum_classes_curriculum_id_class_id_key UNIQUE (curriculum_id, class_id);
ALTER TABLE public.sis_curriculum_classes ADD CONSTRAINT sis_curriculum_classes_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_curriculum_id_course_id_key UNIQUE (curriculum_id, course_id);
ALTER TABLE public.sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_curriculum_materials ADD CONSTRAINT sis_curriculum_materials_kind_check CHECK ((kind = ANY (ARRAY['file'::text, 'link'::text])));
ALTER TABLE public.sis_curriculum_materials ADD CONSTRAINT sis_curriculum_materials_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_curriculum_id_quest_id_key UNIQUE (curriculum_id, quest_id);
ALTER TABLE public.sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_discount_rules ADD CONSTRAINT sis_discount_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_discount_rules ADD CONSTRAINT sis_discount_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['sibling'::text, 'multi_class'::text, 'promo'::text, 'manual'::text])));
ALTER TABLE public.sis_engagement_alerts ADD CONSTRAINT sis_engagement_alerts_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_source_check CHECK ((source = ANY (ARRAY['registration'::text, 'manual'::text])));
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'released'::text, 'rejected'::text])));
ALTER TABLE public.sis_event_rsvps ADD CONSTRAINT sis_event_rsvps_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_events ADD CONSTRAINT sis_events_audience_check CHECK ((audience = ANY (ARRAY['school'::text, 'teachers'::text, 'admins'::text])));
ALTER TABLE public.sis_events ADD CONSTRAINT sis_events_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_events ADD CONSTRAINT sis_events_time_order CHECK (((end_at IS NULL) OR (end_at >= start_at)));
ALTER TABLE public.sis_family_directives ADD CONSTRAINT sis_family_directives_organization_id_email_key UNIQUE (organization_id, email);
ALTER TABLE public.sis_family_directives ADD CONSTRAINT sis_family_directives_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_form_comments ADD CONSTRAINT sis_form_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'in_progress'::text, 'waiting'::text, 'resolved'::text])));
ALTER TABLE public.sis_form_templates ADD CONSTRAINT sis_form_templates_audience_check CHECK ((audience = ANY (ARRAY['staff'::text, 'family'::text])));
ALTER TABLE public.sis_form_templates ADD CONSTRAINT sis_form_templates_default_priority_check CHECK (((default_priority IS NULL) OR (default_priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))));
ALTER TABLE public.sis_form_templates ADD CONSTRAINT sis_form_templates_organization_id_key_key UNIQUE (organization_id, key);
ALTER TABLE public.sis_form_templates ADD CONSTRAINT sis_form_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_installments ADD CONSTRAINT sis_installments_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_installments ADD CONSTRAINT sis_installments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'due'::text, 'paid'::text, 'late'::text, 'waived'::text])));
ALTER TABLE public.sis_invoice_line_items ADD CONSTRAINT sis_invoice_line_items_kind_check CHECK (((kind IS NULL) OR (kind = ANY (ARRAY['tuition'::text, 'supply'::text, 'registration'::text, 'fee'::text, 'other'::text]))));
ALTER TABLE public.sis_invoice_line_items ADD CONSTRAINT sis_invoice_line_items_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_invoices ADD CONSTRAINT sis_invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_invoices ADD CONSTRAINT sis_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'partial'::text, 'paid'::text, 'overdue'::text, 'void'::text])));
ALTER TABLE public.sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_choice_check CHECK ((choice = ANY (ARRAY['quest_learning_day'::text, 'elementary_at_home'::text])));
ALTER TABLE public.sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE public.sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_lost_found ADD CONSTRAINT sis_lost_found_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_audience_check CHECK ((audience = ANY (ARRAY['staff'::text, 'family'::text])));
ALTER TABLE public.sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'complete'::text])));
ALTER TABLE public.sis_onboarding_assignments ADD CONSTRAINT valid_onboarding_kind CHECK ((kind = ANY (ARRAY['checklist'::text, 'signature_request'::text])));
ALTER TABLE public.sis_onboarding_templates ADD CONSTRAINT sis_onboarding_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_payment_plans ADD CONSTRAINT sis_payment_plans_cadence_check CHECK ((cadence = ANY (ARRAY['monthly'::text, 'semester'::text, 'full'::text])));
ALTER TABLE public.sis_payment_plans ADD CONSTRAINT sis_payment_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_payment_plans ADD CONSTRAINT sis_payment_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.sis_payment_records ADD CONSTRAINT sis_payment_records_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_payment_reminders ADD CONSTRAINT sis_payment_reminders_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_quickbooks_sync_log ADD CONSTRAINT sis_quickbooks_sync_log_entity_type_check CHECK ((entity_type = ANY (ARRAY['invoice'::text, 'payment'::text, 'customer'::text])));
ALTER TABLE public.sis_quickbooks_sync_log ADD CONSTRAINT sis_quickbooks_sync_log_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_quickbooks_sync_log ADD CONSTRAINT sis_quickbooks_sync_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'synced'::text, 'error'::text])));
ALTER TABLE public.sis_recognition ADD CONSTRAINT sis_recognition_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_recognition_comments ADD CONSTRAINT sis_recognition_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 28)));
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_monthly_cents_check CHECK ((monthly_cents > 0));
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'canceled'::text])));
ALTER TABLE public.sis_registration_items ADD CONSTRAINT sis_registration_items_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_registration_items ADD CONSTRAINT sis_registration_items_registration_id_class_id_key UNIQUE (registration_id, class_id);
ALTER TABLE public.sis_registration_items ADD CONSTRAINT sis_registration_items_status_check CHECK ((status = ANY (ARRAY['selected'::text, 'enrolled'::text, 'waitlisted'::text, 'dropped'::text])));
ALTER TABLE public.sis_registrations ADD CONSTRAINT sis_registrations_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_registrations ADD CONSTRAINT sis_registrations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'submitted'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.sis_resource_acks ADD CONSTRAINT sis_resource_acks_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_resource_acks ADD CONSTRAINT sis_resource_acks_resource_id_user_id_key UNIQUE (resource_id, user_id);
ALTER TABLE public.sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_organization_id_guardian_user_id_key UNIQUE (organization_id, guardian_user_id);
ALTER TABLE public.sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE public.sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'sent_back'::text])));
ALTER TABLE public.sis_secure_documents ADD CONSTRAINT sis_secure_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_secure_documents ADD CONSTRAINT valid_secure_document_sensitivity CHECK ((sensitivity = ANY (ARRAY['hr'::text, 'general'::text])));
ALTER TABLE public.sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_assignment_type_check CHECK ((assignment_type = ANY (ARRAY['duty'::text, 'event'::text, 'meeting'::text, 'substitute'::text, 'other'::text])));
ALTER TABLE public.sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE public.sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_hourly_rate_cents_check CHECK (((hourly_rate_cents IS NULL) OR (hourly_rate_cents >= 0)));
ALTER TABLE public.sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_pay_type_check CHECK ((pay_type = ANY (ARRAY['hourly'::text, 'salaried'::text, 'stipend'::text, 'unpaid'::text])));
ALTER TABLE public.sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_pkey PRIMARY KEY (user_id);
ALTER TABLE public.sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_staff_type_check CHECK ((staff_type = ANY (ARRAY['employee'::text, 'contractor'::text])));
ALTER TABLE public.sis_staff_training ADD CONSTRAINT sis_staff_training_audience_check CHECK ((audience = ANY (ARRAY['staff'::text, 'family'::text, 'student'::text])));
ALTER TABLE public.sis_staff_training ADD CONSTRAINT sis_staff_training_audiences_check CHECK (((audiences IS NOT NULL) AND (array_length(audiences, 1) >= 1) AND (audiences <@ ARRAY['staff'::text, 'family'::text, 'student'::text])));
ALTER TABLE public.sis_staff_training ADD CONSTRAINT sis_staff_training_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_staff_training ADD CONSTRAINT sis_staff_training_student_age_check CHECK ((((student_min_age IS NULL) OR ((student_min_age >= 0) AND (student_min_age <= 120))) AND ((student_max_age IS NULL) OR ((student_max_age >= 0) AND (student_max_age <= 120))) AND ((student_min_age IS NULL) OR (student_max_age IS NULL) OR (student_min_age <= student_max_age))));
ALTER TABLE public.sis_staff_training ADD CONSTRAINT sis_staff_training_visible_to_roles_check CHECK (((visible_to_roles IS NULL) OR (visible_to_roles <@ ARRAY['org_admin'::text, 'campus_coordinator'::text, 'advisor'::text])));
ALTER TABLE public.sis_student_assignments ADD CONSTRAINT sis_student_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_student_goals ADD CONSTRAINT sis_student_goals_organization_id_student_user_id_school_ye_key UNIQUE (organization_id, student_user_id, school_year);
ALTER TABLE public.sis_student_goals ADD CONSTRAINT sis_student_goals_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_student_materials ADD CONSTRAINT sis_student_materials_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_student_records ADD CONSTRAINT sis_student_records_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE public.sis_student_records ADD CONSTRAINT sis_student_records_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_completion_id_key UNIQUE (completion_id);
ALTER TABLE public.sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_time_entries ADD CONSTRAINT sis_time_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_time_entries ADD CONSTRAINT sis_time_entries_status_check CHECK ((status = ANY (ARRAY['open'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_class_id_student_user_id_key UNIQUE (class_id, student_user_id);
ALTER TABLE public.sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'offered'::text, 'accepted'::text, 'expired'::text, 'declined'::text, 'promoted'::text])));
ALTER TABLE public.sis_xp_adjustments ADD CONSTRAINT sis_xp_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.student_access_logs ADD CONSTRAINT student_access_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.student_access_logs ADD CONSTRAINT valid_accessor_role CHECK ((accessor_role = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'observer'::text, 'org_admin'::text, 'campus_coordinator'::text, 'superadmin'::text, 'public'::text, 'system'::text, 'unknown'::text])));
ALTER TABLE public.student_planned_absences ADD CONSTRAINT student_planned_absences_pkey PRIMARY KEY (id);
ALTER TABLE public.student_planned_absences ADD CONSTRAINT student_planned_absences_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text])));
ALTER TABLE public.student_records_destination ADD CONSTRAINT student_records_destination_destination_type_check CHECK ((destination_type = ANY (ARRAY['school'::text, 'homeschool'::text, 'optio_only'::text])));
ALTER TABLE public.student_records_destination ADD CONSTRAINT student_records_destination_pkey PRIMARY KEY (id);
ALTER TABLE public.student_records_destination ADD CONSTRAINT student_records_destination_school_named CHECK (((destination_type <> 'school'::text) OR (NULLIF(btrim(school_name), ''::text) IS NOT NULL)));
ALTER TABLE public.student_records_destination ADD CONSTRAINT student_records_destination_user_id_key UNIQUE (user_id);
ALTER TABLE public.student_wallets ADD CONSTRAINT student_wallets_pkey PRIMARY KEY (id);
ALTER TABLE public.student_wallets ADD CONSTRAINT student_wallets_spendable_xp_check CHECK ((spendable_xp >= 0));
ALTER TABLE public.student_wallets ADD CONSTRAINT student_wallets_total_xp_spent_check CHECK ((total_xp_spent >= 0));
ALTER TABLE public.student_wallets ADD CONSTRAINT unique_user_wallet UNIQUE (user_id);
ALTER TABLE public.student_weekly_xp_goals ADD CONSTRAINT student_weekly_xp_goals_pkey PRIMARY KEY (id);
ALTER TABLE public.student_weekly_xp_goals ADD CONSTRAINT student_weekly_xp_goals_set_by_role_check CHECK ((set_by_role = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'org_admin'::text, 'superadmin'::text])));
ALTER TABLE public.student_weekly_xp_goals ADD CONSTRAINT student_weekly_xp_goals_student_user_id_effective_from_key UNIQUE (student_user_id, effective_from);
ALTER TABLE public.student_weekly_xp_goals ADD CONSTRAINT student_weekly_xp_goals_target_xp_check CHECK (((target_xp > 0) AND (target_xp <= 10000)));
ALTER TABLE public.task_feedback ADD CONSTRAINT task_feedback_pkey PRIMARY KEY (id);
ALTER TABLE public.task_steps ADD CONSTRAINT task_steps_pkey PRIMARY KEY (id);
ALTER TABLE public.transcript_overrides ADD CONSTRAINT transcript_overrides_pkey PRIMARY KEY (id);
ALTER TABLE public.transcript_overrides ADD CONSTRAINT transcript_overrides_user_id_key UNIQUE (user_id);
ALTER TABLE public.transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_token_key UNIQUE (token);
ALTER TABLE public.transcript_transfer_log ADD CONSTRAINT transcript_transfer_log_pkey PRIMARY KEY (id);
ALTER TABLE public.transfer_credits ADD CONSTRAINT transfer_credits_pkey PRIMARY KEY (id);
ALTER TABLE public.transfer_credits ADD CONSTRAINT transfer_credits_user_school_unique UNIQUE (user_id, school_name);
ALTER TABLE public.treehouse_kiosk_devices ADD CONSTRAINT treehouse_kiosk_devices_pkey PRIMARY KEY (id);
ALTER TABLE public.treehouse_pins ADD CONSTRAINT treehouse_pins_pkey PRIMARY KEY (id);
ALTER TABLE public.treehouse_pins ADD CONSTRAINT treehouse_pins_status_check CHECK ((status = ANY (ARRAY['created'::text, 'distributed'::text])));
ALTER TABLE public.treehouse_pins ADD CONSTRAINT treehouse_pins_student_id_quest_id_key UNIQUE (student_id, quest_id);
ALTER TABLE public.treehouse_showcase_events ADD CONSTRAINT treehouse_showcase_events_pkey PRIMARY KEY (id);
ALTER TABLE public.treehouse_showcase_events ADD CONSTRAINT treehouse_showcase_events_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])));
ALTER TABLE public.treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_event_id_student_id_key UNIQUE (event_id, student_id);
ALTER TABLE public.treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_pkey PRIMARY KEY (id);
ALTER TABLE public.treehouse_signals ADD CONSTRAINT treehouse_signals_pkey PRIMARY KEY (id);
ALTER TABLE public.treehouse_signals ADD CONSTRAINT treehouse_signals_signal_type_check CHECK ((signal_type = ANY (ARRAY['help'::text, 'proud'::text])));
ALTER TABLE public.treehouse_signals ADD CONSTRAINT treehouse_signals_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])));
ALTER TABLE public.tutor_conversations ADD CONSTRAINT tutor_conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.tutor_messages ADD CONSTRAINT tutor_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.tutor_safety_reports ADD CONSTRAINT tutor_safety_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.tutor_settings ADD CONSTRAINT tutor_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.tutor_settings ADD CONSTRAINT tutor_settings_user_id_key UNIQUE (user_id);
ALTER TABLE public.tutor_tier_limits ADD CONSTRAINT tutor_tier_limits_pkey PRIMARY KEY (tier);
ALTER TABLE public.tutorial_verification_log ADD CONSTRAINT tutorial_verification_log_pkey PRIMARY KEY (id);
ALTER TABLE public.tutorial_verification_log ADD CONSTRAINT tutorial_verification_log_user_id_task_id_key UNIQUE (user_id, task_id);
ALTER TABLE public.user_activity_events ADD CONSTRAINT user_activity_events_pkey PRIMARY KEY (id);
ALTER TABLE public.user_blocks ADD CONSTRAINT no_self_block CHECK ((blocker_id <> blocked_id));
ALTER TABLE public.user_blocks ADD CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id);
ALTER TABLE public.user_blocks ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);
ALTER TABLE public.user_mastery ADD CONSTRAINT user_mastery_pkey PRIMARY KEY (id);
ALTER TABLE public.user_mastery ADD CONSTRAINT user_mastery_user_id_key UNIQUE (user_id);
ALTER TABLE public.user_quest_tasks ADD CONSTRAINT user_quest_tasks_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.user_quest_tasks ADD CONSTRAINT user_quest_tasks_pkey1 PRIMARY KEY (id);
ALTER TABLE public.user_quests ADD CONSTRAINT task_display_mode_check CHECK ((task_display_mode = ANY (ARRAY['timeline'::text, 'flexible'::text])));
ALTER TABLE public.user_quests ADD CONSTRAINT user_quests_pkey PRIMARY KEY (id);
ALTER TABLE public.user_quests ADD CONSTRAINT valid_quest_status CHECK ((status = ANY (ARRAY['available'::text, 'picked_up'::text, 'set_down'::text])));
ALTER TABLE public.user_skill_details ADD CONSTRAINT user_skill_details_pkey PRIMARY KEY (id);
ALTER TABLE public.user_skill_details ADD CONSTRAINT user_skill_details_user_id_skill_name_key UNIQUE (user_id, skill_name);
ALTER TABLE public.user_skill_xp ADD CONSTRAINT user_skill_xp_pkey PRIMARY KEY (id);
ALTER TABLE public.user_skill_xp ADD CONSTRAINT user_skill_xp_user_id_pillar_key UNIQUE (user_id, pillar);
ALTER TABLE public.user_skill_xp ADD CONSTRAINT user_skill_xp_xp_amount_check CHECK ((xp_amount >= 0));
ALTER TABLE public.user_subject_xp ADD CONSTRAINT user_subject_xp_pkey PRIMARY KEY (id);
ALTER TABLE public.user_subject_xp ADD CONSTRAINT user_subject_xp_user_id_school_subject_key UNIQUE (user_id, school_subject);
ALTER TABLE public.user_subject_xp ADD CONSTRAINT user_subject_xp_xp_amount_check CHECK ((xp_amount >= 0));
ALTER TABLE public.user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text])));
ALTER TABLE public.user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_user_id_task_id_key UNIQUE (user_id, task_id);
ALTER TABLE public.users ADD CONSTRAINT check_dependent_has_parent CHECK (((is_dependent = false) OR ((is_dependent = true) AND (managed_by_parent_id IS NOT NULL))));
ALTER TABLE public.users ADD CONSTRAINT check_dependent_no_email CHECK (((is_dependent = false) OR ((is_dependent = true) AND (email IS NULL))));
ALTER TABLE public.users ADD CONSTRAINT direct_role_no_org_role CHECK ((((role)::text = 'org_managed'::text) OR (org_role IS NULL)));
ALTER TABLE public.users ADD CONSTRAINT org_managed_requires_org CHECK ((((role)::text <> 'org_managed'::text) OR ((org_role IS NOT NULL) AND (organization_id IS NOT NULL))));
ALTER TABLE public.users ADD CONSTRAINT users_ai_assistance_level_check CHECK ((ai_assistance_level = ANY (ARRAY['off'::text, 'suggestions'::text, 'auto'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_deletion_status_check CHECK (((deletion_status)::text = ANY ((ARRAY['none'::character varying, 'pending'::character varying, 'completed'::character varying])::text[])));
ALTER TABLE public.users ADD CONSTRAINT users_parental_consent_token_key UNIQUE (parental_consent_token);
ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE public.users ADD CONSTRAINT users_portfolio_slug_key UNIQUE (portfolio_slug);
ALTER TABLE public.users ADD CONSTRAINT users_preferred_challenge_level_check CHECK ((preferred_challenge_level = ANY (ARRAY['easier'::text, 'standard'::text, 'challenge'::text])));
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'observer'::text, 'org_managed'::text, 'superadmin'::text])));
ALTER TABLE public.users ADD CONSTRAINT valid_org_role CHECK (((org_role IS NULL) OR (org_role = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'org_admin'::text, 'campus_coordinator'::text, 'observer'::text]))));
ALTER TABLE public.users ADD CONSTRAINT valid_org_roles CHECK (validate_org_roles(org_roles));
ALTER TABLE public.users ADD CONSTRAINT valid_role_check CHECK (((role)::text = ANY (ARRAY['superadmin'::text, 'org_admin'::text, 'student'::text, 'parent'::text, 'advisor'::text, 'observer'::text, 'org_managed'::text])));
ALTER TABLE public.xp_award_failures ADD CONSTRAINT xp_award_failures_pkey PRIMARY KEY (id);
ALTER TABLE public.xp_award_failures ADD CONSTRAINT xp_award_failures_xp_amount_check CHECK ((xp_amount > 0));

--
-- CONSTRAINTS (foreign key) (538)
--
ALTER TABLE public.academy_enrollments ADD CONSTRAINT academy_enrollments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.academy_enrollments ADD CONSTRAINT academy_enrollments_partner_org_id_fkey FOREIGN KEY (partner_org_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE public.academy_enrollments ADD CONSTRAINT academy_enrollments_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE SET NULL;
ALTER TABLE public.academy_enrollments ADD CONSTRAINT academy_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE public.admin_audit_logs ADD CONSTRAINT admin_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.admin_masquerade_log ADD CONSTRAINT admin_masquerade_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.admin_masquerade_log ADD CONSTRAINT admin_masquerade_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.advisor_checkins ADD CONSTRAINT advisor_checkins_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.advisor_checkins ADD CONSTRAINT advisor_checkins_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.advisor_notes ADD CONSTRAINT advisor_notes_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.advisor_notes ADD CONSTRAINT advisor_notes_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.ai_generated_quests ADD CONSTRAINT ai_generated_quests_generation_job_id_fkey FOREIGN KEY (generation_job_id) REFERENCES ai_generation_jobs(id) ON DELETE CASCADE;
ALTER TABLE public.ai_generated_quests ADD CONSTRAINT ai_generated_quests_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id);
ALTER TABLE public.ai_generation_jobs ADD CONSTRAINT ai_generation_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.ai_prompt_components ADD CONSTRAINT ai_prompt_components_modified_by_fkey FOREIGN KEY (modified_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_created_quest_id_fkey FOREIGN KEY (created_quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_task_cache ADD CONSTRAINT ai_task_cache_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.announcement_reads ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE public.announcement_reads ADD CONSTRAINT announcement_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.announcement_recipients ADD CONSTRAINT announcement_recipients_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE public.announcement_recipients ADD CONSTRAINT announcement_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_source_announcement_id_fkey FOREIGN KEY (source_announcement_id) REFERENCES sis_announcements(id) ON DELETE SET NULL;
ALTER TABLE public.automation_sequences ADD CONSTRAINT automation_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.bounties ADD CONSTRAINT bounties_cohort_class_id_fkey FOREIGN KEY (cohort_class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE public.bounties ADD CONSTRAINT bounties_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE public.bounties ADD CONSTRAINT bounties_poster_id_fkey FOREIGN KEY (poster_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.bounty_claims ADD CONSTRAINT bounty_claims_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES bounties(id) ON DELETE CASCADE;
ALTER TABLE public.bounty_claims ADD CONSTRAINT bounty_claims_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.bounty_reviews ADD CONSTRAINT bounty_reviews_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES bounty_claims(id) ON DELETE CASCADE;
ALTER TABLE public.bounty_reviews ADD CONSTRAINT bounty_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.buddies ADD CONSTRAINT buddies_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.class_advisors ADD CONSTRAINT class_advisors_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.class_advisors ADD CONSTRAINT class_advisors_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE public.class_advisors ADD CONSTRAINT class_advisors_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_discussion_posts ADD CONSTRAINT class_discussion_posts_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.class_discussion_posts ADD CONSTRAINT class_discussion_posts_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_discussion_posts ADD CONSTRAINT class_discussion_posts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.class_discussion_posts ADD CONSTRAINT class_discussion_posts_parent_post_id_fkey FOREIGN KEY (parent_post_id) REFERENCES class_discussion_posts(id) ON DELETE CASCADE;
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_enrolled_by_fkey FOREIGN KEY (enrolled_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.class_enrollments ADD CONSTRAINT class_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.class_materials ADD CONSTRAINT class_materials_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_materials ADD CONSTRAINT class_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.class_materials ADD CONSTRAINT class_materials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.class_meetings ADD CONSTRAINT class_meetings_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_meetings ADD CONSTRAINT class_meetings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.class_prerequisites ADD CONSTRAINT class_prerequisites_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_prerequisites ADD CONSTRAINT class_prerequisites_prerequisite_class_id_fkey FOREIGN KEY (prerequisite_class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_quests ADD CONSTRAINT class_quests_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id);
ALTER TABLE public.class_quests ADD CONSTRAINT class_quests_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.class_quests ADD CONSTRAINT class_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.course_enrollments ADD CONSTRAINT course_enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public.course_enrollments ADD CONSTRAINT course_enrollments_current_quest_id_fkey FOREIGN KEY (current_quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.course_enrollments ADD CONSTRAINT course_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.course_generation_jobs ADD CONSTRAINT course_generation_jobs_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public.course_generation_jobs ADD CONSTRAINT course_generation_jobs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.course_generation_jobs ADD CONSTRAINT course_generation_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.course_plan_sessions ADD CONSTRAINT course_plan_sessions_created_course_id_fkey FOREIGN KEY (created_course_id) REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE public.course_plan_sessions ADD CONSTRAINT course_plan_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE public.course_plan_sessions ADD CONSTRAINT course_plan_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.course_quest_tasks ADD CONSTRAINT course_quest_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.course_quests ADD CONSTRAINT course_quests_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public.course_quests ADD CONSTRAINT course_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.course_refine_sessions ADD CONSTRAINT course_refine_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public.course_refine_sessions ADD CONSTRAINT course_refine_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.courses ADD CONSTRAINT courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE public.courses ADD CONSTRAINT courses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.credit_ledger ADD CONSTRAINT credit_ledger_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.credit_ledger ADD CONSTRAINT credit_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.credit_review_messages ADD CONSTRAINT credit_review_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE public.credit_review_messages ADD CONSTRAINT credit_review_messages_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE public.crm_calendar_bookings ADD CONSTRAINT crm_calendar_bookings_matched_lead_id_fkey FOREIGN KEY (matched_lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;
ALTER TABLE public.crm_email_events ADD CONSTRAINT crm_email_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;
ALTER TABLE public.crm_email_events ADD CONSTRAINT crm_email_events_send_id_fkey FOREIGN KEY (send_id) REFERENCES crm_sends(id) ON DELETE SET NULL;
ALTER TABLE public.crm_events ADD CONSTRAINT crm_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;
ALTER TABLE public.crm_funnel_memberships ADD CONSTRAINT crm_funnel_memberships_funnel_id_fkey FOREIGN KEY (funnel_id) REFERENCES crm_funnels(id) ON DELETE CASCADE;
ALTER TABLE public.crm_funnel_memberships ADD CONSTRAINT crm_funnel_memberships_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;
ALTER TABLE public.crm_funnel_steps ADD CONSTRAINT crm_funnel_steps_funnel_id_fkey FOREIGN KEY (funnel_id) REFERENCES crm_funnels(id) ON DELETE CASCADE;
ALTER TABLE public.crm_funnel_steps ADD CONSTRAINT crm_funnel_steps_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.crm_sends ADD CONSTRAINT crm_sends_funnel_id_fkey FOREIGN KEY (funnel_id) REFERENCES crm_funnels(id) ON DELETE CASCADE;
ALTER TABLE public.crm_sends ADD CONSTRAINT crm_sends_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE;
ALTER TABLE public.crm_sends ADD CONSTRAINT crm_sends_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES crm_funnel_memberships(id) ON DELETE CASCADE;
ALTER TABLE public.crm_sends ADD CONSTRAINT crm_sends_step_id_fkey FOREIGN KEY (step_id) REFERENCES crm_funnel_steps(id);
ALTER TABLE public.curriculum_attachments ADD CONSTRAINT curriculum_attachments_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.curriculum_attachments ADD CONSTRAINT curriculum_attachments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.curriculum_attachments ADD CONSTRAINT curriculum_attachments_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_attachments ADD CONSTRAINT curriculum_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE public.curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES curriculum_lessons(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES curriculum_lessons(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_lessons ADD CONSTRAINT curriculum_lessons_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.curriculum_lessons ADD CONSTRAINT curriculum_lessons_last_edited_by_fkey FOREIGN KEY (last_edited_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.curriculum_lessons ADD CONSTRAINT curriculum_lessons_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.curriculum_lessons ADD CONSTRAINT curriculum_lessons_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_settings ADD CONSTRAINT curriculum_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.curriculum_settings ADD CONSTRAINT curriculum_settings_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_uploads ADD CONSTRAINT curriculum_uploads_created_course_id_fkey FOREIGN KEY (created_course_id) REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE public.curriculum_uploads ADD CONSTRAINT curriculum_uploads_created_quest_id_fkey FOREIGN KEY (created_quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.curriculum_uploads ADD CONSTRAINT curriculum_uploads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.curriculum_uploads ADD CONSTRAINT curriculum_uploads_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.curriculum_uploads ADD CONSTRAINT curriculum_uploads_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.diploma_review_rounds ADD CONSTRAINT diploma_review_rounds_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE public.diploma_review_rounds ADD CONSTRAINT diploma_review_rounds_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.diplomas ADD CONSTRAINT diplomas_public_consent_given_by_fkey FOREIGN KEY (public_consent_given_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES direct_messages(id) ON DELETE SET NULL;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.docs_articles ADD CONSTRAINT docs_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES docs_categories(id) ON DELETE CASCADE;
ALTER TABLE public.docs_articles ADD CONSTRAINT docs_articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.docs_search_misses ADD CONSTRAINT docs_search_misses_generated_article_id_fkey FOREIGN KEY (generated_article_id) REFERENCES docs_articles(id) ON DELETE SET NULL;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.emergency_contacts ADD CONSTRAINT emergency_contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.emergency_contacts ADD CONSTRAINT emergency_contacts_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_document_id_fkey FOREIGN KEY (document_id) REFERENCES user_task_evidence_documents(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.evidence_report_configs ADD CONSTRAINT evidence_report_configs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_report_config_id_fkey FOREIGN KEY (report_config_id) REFERENCES evidence_report_configs(id) ON DELETE CASCADE;
ALTER TABLE public.feed_highlights ADD CONSTRAINT feed_highlights_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.feed_item_views ADD CONSTRAINT feed_item_views_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE public.feed_item_views ADD CONSTRAINT feed_item_views_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE public.feed_item_views ADD CONSTRAINT feed_item_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.feed_share_tokens ADD CONSTRAINT feed_share_tokens_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE public.feed_share_tokens ADD CONSTRAINT feed_share_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.feed_share_tokens ADD CONSTRAINT feed_share_tokens_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE public.feed_share_tokens ADD CONSTRAINT feed_share_tokens_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
ALTER TABLE public.group_conversations ADD CONSTRAINT group_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.group_conversations ADD CONSTRAINT group_conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.group_conversations ADD CONSTRAINT group_conversations_pinned_message_id_fkey FOREIGN KEY (pinned_message_id) REFERENCES group_messages(id) ON DELETE SET NULL;
ALTER TABLE public.group_conversations ADD CONSTRAINT group_conversations_source_class_id_fkey FOREIGN KEY (source_class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.group_members ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES group_messages(id) ON DELETE SET NULL;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.household_members ADD CONSTRAINT household_members_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE public.household_members ADD CONSTRAINT household_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.households ADD CONSTRAINT households_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.households ADD CONSTRAINT households_primary_contact_user_id_fkey FOREIGN KEY (primary_contact_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.interest_tracks ADD CONSTRAINT interest_tracks_evolved_to_quest_id_fkey FOREIGN KEY (evolved_to_quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.interest_tracks ADD CONSTRAINT interest_tracks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.learning_event_evidence_blocks ADD CONSTRAINT learning_event_evidence_blocks_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE public.learning_event_topics ADD CONSTRAINT learning_event_topics_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_attached_task_id_fkey FOREIGN KEY (attached_task_id) REFERENCES user_quest_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_captured_by_user_id_fkey FOREIGN KEY (captured_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_parent_moment_id_fkey FOREIGN KEY (parent_moment_id) REFERENCES learning_events(id) ON DELETE SET NULL;
ALTER TABLE public.learning_events ADD CONSTRAINT learning_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.lesson_reflections ADD CONSTRAINT lesson_reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.lms_grade_sync ADD CONSTRAINT lms_grade_sync_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.lms_grade_sync ADD CONSTRAINT lms_grade_sync_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.lms_integrations ADD CONSTRAINT lms_integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.lms_integrations ADD CONSTRAINT lms_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.lms_sessions ADD CONSTRAINT lms_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.lti_auth_codes ADD CONSTRAINT lti_auth_codes_pending_launch_id_fkey FOREIGN KEY (pending_launch_id) REFERENCES lti_pending_launches(id) ON DELETE CASCADE;
ALTER TABLE public.lti_auth_codes ADD CONSTRAINT lti_auth_codes_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.lti_auth_codes ADD CONSTRAINT lti_auth_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.lti_pending_launches ADD CONSTRAINT lti_pending_launches_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES lti_registrations(id) ON DELETE CASCADE;
ALTER TABLE public.lti_registrations ADD CONSTRAINT lti_registrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE public.message_conversations ADD CONSTRAINT message_conversations_participant_1_id_fkey FOREIGN KEY (participant_1_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.message_conversations ADD CONSTRAINT message_conversations_participant_2_id_fkey FOREIGN KEY (participant_2_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.message_email_relays ADD CONSTRAINT message_email_relays_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.message_email_relays ADD CONSTRAINT message_email_relays_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.observer_access_audit ADD CONSTRAINT observer_access_audit_observer_id_fkey FOREIGN KEY (observer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.observer_access_audit ADD CONSTRAINT observer_access_audit_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.observer_comments ADD CONSTRAINT observer_comments_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE public.observer_comments ADD CONSTRAINT observer_comments_observer_id_fkey FOREIGN KEY (observer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.observer_comments ADD CONSTRAINT observer_comments_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.observer_comments ADD CONSTRAINT observer_comments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.observer_comments ADD CONSTRAINT observer_comments_task_completion_id_fkey FOREIGN KEY (task_completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE public.observer_invitation_students ADD CONSTRAINT observer_invitation_students_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES observer_invitations(id) ON DELETE CASCADE;
ALTER TABLE public.observer_invitation_students ADD CONSTRAINT observer_invitation_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.observer_invitations ADD CONSTRAINT observer_invitations_consumed_by_user_id_fkey FOREIGN KEY (consumed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.observer_invitations ADD CONSTRAINT observer_invitations_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.observer_invitations ADD CONSTRAINT observer_invitations_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.observer_student_links ADD CONSTRAINT observer_student_links_invited_by_parent_id_fkey FOREIGN KEY (invited_by_parent_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.observer_student_links ADD CONSTRAINT observer_student_links_observer_id_fkey FOREIGN KEY (observer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.observer_student_links ADD CONSTRAINT observer_student_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES oea_credits(id) ON DELETE CASCADE;
ALTER TABLE public.oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES oea_credits(id) ON DELETE CASCADE;
ALTER TABLE public.oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES oea_credits(id) ON DELETE CASCADE;
ALTER TABLE public.oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES oea_enrollments(id) ON DELETE CASCADE;
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.oea_credits ADD CONSTRAINT oea_credits_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.oea_enrollments ADD CONSTRAINT oea_enrollments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.oea_enrollments ADD CONSTRAINT oea_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.oea_help_video_views ADD CONSTRAINT oea_help_video_views_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.oea_help_video_views ADD CONSTRAINT oea_help_video_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.org_classes ADD CONSTRAINT org_classes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE public.org_classes ADD CONSTRAINT org_classes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.org_classes ADD CONSTRAINT org_classes_primary_instructor_id_fkey FOREIGN KEY (primary_instructor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.org_course_settings ADD CONSTRAINT org_course_teachers_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.org_course_settings ADD CONSTRAINT org_course_teachers_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public.org_course_settings ADD CONSTRAINT org_course_teachers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.org_course_settings ADD CONSTRAINT org_course_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.org_invitations ADD CONSTRAINT org_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE public.org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.org_quest_group_items ADD CONSTRAINT org_quest_group_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES org_quest_groups(id) ON DELETE CASCADE;
ALTER TABLE public.org_quest_group_items ADD CONSTRAINT org_quest_group_items_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.org_quest_groups ADD CONSTRAINT org_quest_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.org_quest_groups ADD CONSTRAINT org_quest_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.org_resources ADD CONSTRAINT org_resources_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.org_resources ADD CONSTRAINT org_resources_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.organization_course_access ADD CONSTRAINT organization_course_access_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public.organization_course_access ADD CONSTRAINT organization_course_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.organization_course_access ADD CONSTRAINT organization_course_access_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.organization_quest_access ADD CONSTRAINT organization_quest_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.organization_quest_access ADD CONSTRAINT organization_quest_access_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.organization_quest_access ADD CONSTRAINT organization_quest_access_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.organization_secrets ADD CONSTRAINT organization_secrets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.organization_secrets ADD CONSTRAINT organization_secrets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_inbox_user_id_fkey FOREIGN KEY (inbox_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.parent_digest_sends ADD CONSTRAINT parent_digest_sends_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.parent_digest_sends ADD CONSTRAINT parent_digest_sends_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.parent_student_links ADD CONSTRAINT parent_student_links_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.parent_student_links ADD CONSTRAINT parent_student_links_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.parent_student_links ADD CONSTRAINT parent_student_links_verified_by_admin_id_fkey FOREIGN KEY (verified_by_admin_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.parental_consent_log ADD CONSTRAINT parental_consent_log_reviewed_by_admin_id_fkey FOREIGN KEY (reviewed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.parental_consent_log ADD CONSTRAINT parental_consent_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE public.password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.peer_comments ADD CONSTRAINT peer_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.peer_comments ADD CONSTRAINT peer_comments_hidden_by_fkey FOREIGN KEY (hidden_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.peer_comments ADD CONSTRAINT peer_comments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.peer_connect_codes ADD CONSTRAINT peer_connect_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.peer_connection_approvals ADD CONSTRAINT peer_connection_approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.peer_connection_approvals ADD CONSTRAINT peer_connection_approvals_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES peer_connections(id) ON DELETE CASCADE;
ALTER TABLE public.peer_connection_approvals ADD CONSTRAINT peer_connection_approvals_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.peer_connections ADD CONSTRAINT peer_connections_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.peer_connections ADD CONSTRAINT peer_connections_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.peer_connections ADD CONSTRAINT peer_connections_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.philosophy_edges ADD CONSTRAINT philosophy_edges_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES philosophy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public.philosophy_edges ADD CONSTRAINT philosophy_edges_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES philosophy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public.philosophy_nodes ADD CONSTRAINT philosophy_nodes_parent_node_id_fkey FOREIGN KEY (parent_node_id) REFERENCES philosophy_nodes(id) ON DELETE SET NULL;
ALTER TABLE public.phone_verification_codes ADD CONSTRAINT phone_verification_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.planned_credits ADD CONSTRAINT planned_credits_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.planned_credits ADD CONSTRAINT planned_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.poe_participants ADD CONSTRAINT poe_participants_class_quest_id_fkey FOREIGN KEY (class_quest_id) REFERENCES quests(id);
ALTER TABLE public.poe_participants ADD CONSTRAINT poe_participants_poe_cohort_id_fkey FOREIGN KEY (poe_cohort_id) REFERENCES poe_cohorts(id) ON DELETE CASCADE;
ALTER TABLE public.poe_participants ADD CONSTRAINT poe_participants_track_id_fkey FOREIGN KEY (track_id) REFERENCES interest_tracks(id) ON DELETE SET NULL;
ALTER TABLE public.poe_participants ADD CONSTRAINT poe_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.poe_signups ADD CONSTRAINT poe_signups_poe_cohort_id_fkey FOREIGN KEY (poe_cohort_id) REFERENCES poe_cohorts(id) ON DELETE CASCADE;
ALTER TABLE public.prior_learning_evidence ADD CONSTRAINT prior_learning_evidence_record_id_fkey FOREIGN KEY (record_id) REFERENCES prior_learning_records(id) ON DELETE CASCADE;
ALTER TABLE public.prior_learning_evidence ADD CONSTRAINT prior_learning_evidence_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_credited_by_fkey FOREIGN KEY (credited_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.prior_learning_records ADD CONSTRAINT prior_learning_records_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id);
ALTER TABLE public.public_visibility_requests ADD CONSTRAINT public_visibility_requests_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.public_visibility_requests ADD CONSTRAINT public_visibility_requests_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.quest_invitations ADD CONSTRAINT quest_invitations_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.quest_invitations ADD CONSTRAINT quest_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.quest_invitations ADD CONSTRAINT quest_invitations_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.quest_invitations ADD CONSTRAINT quest_invitations_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.quest_personalization_sessions ADD CONSTRAINT quest_personalization_sessions_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.quest_personalization_sessions ADD CONSTRAINT quest_personalization_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_source_lesson_id_fkey FOREIGN KEY (source_lesson_id) REFERENCES curriculum_lessons(id) ON DELETE SET NULL;
ALTER TABLE public.quest_task_completions ADD CONSTRAINT quest_task_completions_credit_reviewer_id_fkey FOREIGN KEY (credit_reviewer_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.quest_task_completions ADD CONSTRAINT quest_task_completions_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES quest_task_completions(id);
ALTER TABLE public.quest_task_completions ADD CONSTRAINT quest_task_completions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.quest_task_completions ADD CONSTRAINT quest_task_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.quest_task_completions ADD CONSTRAINT quest_task_completions_user_quest_task_id_fkey FOREIGN KEY (user_quest_task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.quest_template_tasks ADD CONSTRAINT quest_template_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.quests ADD CONSTRAINT quests_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.quests ADD CONSTRAINT quests_curriculum_last_edited_by_fkey FOREIGN KEY (curriculum_last_edited_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.quests ADD CONSTRAINT quests_lti_registration_id_fkey FOREIGN KEY (lti_registration_id) REFERENCES lti_registrations(id) ON DELETE SET NULL;
ALTER TABLE public.quests ADD CONSTRAINT quests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.refresh_token_families ADD CONSTRAINT refresh_token_families_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.registrations ADD CONSTRAINT registrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.registrations ADD CONSTRAINT registrations_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.role_change_log ADD CONSTRAINT role_change_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.role_change_log ADD CONSTRAINT role_change_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.school_enrollments ADD CONSTRAINT school_enrollments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.school_enrollments ADD CONSTRAINT school_enrollments_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_assignment_templates ADD CONSTRAINT sis_assignment_templates_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.sis_assignment_templates ADD CONSTRAINT sis_assignment_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_assignment_templates ADD CONSTRAINT sis_assignment_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_attendance ADD CONSTRAINT sis_attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.sis_attendance ADD CONSTRAINT sis_attendance_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES class_meetings(id) ON DELETE SET NULL;
ALTER TABLE public.sis_attendance ADD CONSTRAINT sis_attendance_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_attendance ADD CONSTRAINT sis_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_attendance ADD CONSTRAINT sis_attendance_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_clp_records ADD CONSTRAINT sis_clp_records_finished_by_fkey FOREIGN KEY (finished_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_clp_records ADD CONSTRAINT sis_clp_records_notes_updated_by_fkey FOREIGN KEY (notes_updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_clp_records ADD CONSTRAINT sis_clp_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_clp_records ADD CONSTRAINT sis_clp_records_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum ADD CONSTRAINT sis_curriculum_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_curriculum ADD CONSTRAINT sis_curriculum_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum_classes ADD CONSTRAINT sis_curriculum_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum_classes ADD CONSTRAINT sis_curriculum_classes_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES sis_curriculum(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES sis_curriculum(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum_materials ADD CONSTRAINT sis_curriculum_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_curriculum_materials ADD CONSTRAINT sis_curriculum_materials_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES sis_curriculum(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum_materials ADD CONSTRAINT sis_curriculum_materials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES sis_curriculum(id) ON DELETE CASCADE;
ALTER TABLE public.sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.sis_discount_rules ADD CONSTRAINT sis_discount_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_engagement_alerts ADD CONSTRAINT sis_engagement_alerts_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.sis_engagement_alerts ADD CONSTRAINT sis_engagement_alerts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_engagement_alerts ADD CONSTRAINT sis_engagement_alerts_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_released_by_fkey FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_event_rsvps ADD CONSTRAINT sis_event_rsvps_event_id_fkey FOREIGN KEY (event_id) REFERENCES sis_events(id) ON DELETE CASCADE;
ALTER TABLE public.sis_events ADD CONSTRAINT sis_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_events ADD CONSTRAINT sis_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_family_directives ADD CONSTRAINT sis_family_directives_matched_household_id_fkey FOREIGN KEY (matched_household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE public.sis_family_directives ADD CONSTRAINT sis_family_directives_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_form_comments ADD CONSTRAINT sis_form_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_form_comments ADD CONSTRAINT sis_form_comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_form_comments ADD CONSTRAINT sis_form_comments_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES sis_form_submissions(id) ON DELETE CASCADE;
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id);
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id);
ALTER TABLE public.sis_form_submissions ADD CONSTRAINT sis_form_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_form_templates ADD CONSTRAINT sis_form_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_form_templates ADD CONSTRAINT sis_form_templates_default_assignee_id_fkey FOREIGN KEY (default_assignee_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_form_templates ADD CONSTRAINT sis_form_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_installments ADD CONSTRAINT sis_installments_payment_plan_id_fkey FOREIGN KEY (payment_plan_id) REFERENCES sis_payment_plans(id) ON DELETE CASCADE;
ALTER TABLE public.sis_invoice_line_items ADD CONSTRAINT sis_invoice_line_items_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE public.sis_invoice_line_items ADD CONSTRAINT sis_invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sis_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.sis_invoices ADD CONSTRAINT sis_invoices_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE public.sis_invoices ADD CONSTRAINT sis_invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_invoices ADD CONSTRAINT sis_invoices_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES sis_registrations(id) ON DELETE SET NULL;
ALTER TABLE public.sis_invoices ADD CONSTRAINT sis_invoices_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_selected_by_fkey FOREIGN KEY (selected_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES sis_onboarding_templates(id) ON DELETE SET NULL;
ALTER TABLE public.sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_onboarding_templates ADD CONSTRAINT sis_onboarding_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_onboarding_templates ADD CONSTRAINT sis_onboarding_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_payment_plans ADD CONSTRAINT sis_payment_plans_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sis_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.sis_payment_plans ADD CONSTRAINT sis_payment_plans_saved_payment_method_id_fkey FOREIGN KEY (saved_payment_method_id) REFERENCES sis_saved_payment_methods(id) ON DELETE SET NULL;
ALTER TABLE public.sis_payment_records ADD CONSTRAINT sis_payment_records_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES sis_installments(id) ON DELETE SET NULL;
ALTER TABLE public.sis_payment_records ADD CONSTRAINT sis_payment_records_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sis_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.sis_payment_records ADD CONSTRAINT sis_payment_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_payment_records ADD CONSTRAINT sis_payment_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_payment_reminders ADD CONSTRAINT sis_payment_reminders_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES sis_installments(id) ON DELETE CASCADE;
ALTER TABLE public.sis_payment_reminders ADD CONSTRAINT sis_payment_reminders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sis_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.sis_payment_reminders ADD CONSTRAINT sis_payment_reminders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_quickbooks_sync_log ADD CONSTRAINT sis_quickbooks_sync_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_recognition_comments ADD CONSTRAINT sis_recognition_comments_recognition_id_fkey FOREIGN KEY (recognition_id) REFERENCES sis_recognition(id) ON DELETE CASCADE;
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_canceled_by_fkey FOREIGN KEY (canceled_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_recurring_tuition ADD CONSTRAINT sis_recurring_tuition_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_registration_items ADD CONSTRAINT sis_registration_items_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.sis_registration_items ADD CONSTRAINT sis_registration_items_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES sis_registrations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_registrations ADD CONSTRAINT sis_registrations_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_registrations ADD CONSTRAINT sis_registrations_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_registrations ADD CONSTRAINT sis_registrations_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE public.sis_registrations ADD CONSTRAINT sis_registrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_registrations ADD CONSTRAINT sis_registrations_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_resource_acks ADD CONSTRAINT sis_resource_acks_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES org_resources(id) ON DELETE CASCADE;
ALTER TABLE public.sis_resource_acks ADD CONSTRAINT sis_resource_acks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE public.sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_secure_documents ADD CONSTRAINT sis_secure_documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_secure_documents ADD CONSTRAINT sis_secure_documents_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_secure_documents ADD CONSTRAINT sis_secure_documents_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_secure_documents ADD CONSTRAINT sis_secure_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE public.sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_staff_training ADD CONSTRAINT sis_staff_training_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_staff_training ADD CONSTRAINT sis_staff_training_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_staff_training ADD CONSTRAINT sis_staff_training_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_assignments ADD CONSTRAINT sis_student_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE public.sis_student_assignments ADD CONSTRAINT sis_student_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_student_assignments ADD CONSTRAINT sis_student_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_assignments ADD CONSTRAINT sis_student_assignments_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_goals ADD CONSTRAINT sis_student_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_student_goals ADD CONSTRAINT sis_student_goals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_goals ADD CONSTRAINT sis_student_goals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_student_goals ADD CONSTRAINT sis_student_goals_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_materials ADD CONSTRAINT sis_student_materials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_materials ADD CONSTRAINT sis_student_materials_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_records ADD CONSTRAINT sis_student_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_records ADD CONSTRAINT sis_student_records_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_student_records ADD CONSTRAINT sis_student_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE public.sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_time_entries ADD CONSTRAINT sis_time_entries_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_time_entries ADD CONSTRAINT sis_time_entries_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id);
ALTER TABLE public.sis_time_entries ADD CONSTRAINT sis_time_entries_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.sis_time_entries ADD CONSTRAINT sis_time_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_time_entries ADD CONSTRAINT sis_time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_xp_adjustments ADD CONSTRAINT sis_xp_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.sis_xp_adjustments ADD CONSTRAINT sis_xp_adjustments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sis_xp_adjustments ADD CONSTRAINT sis_xp_adjustments_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.student_access_logs ADD CONSTRAINT student_access_logs_accessor_id_fkey FOREIGN KEY (accessor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.student_access_logs ADD CONSTRAINT student_access_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.student_planned_absences ADD CONSTRAINT student_planned_absences_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE public.student_planned_absences ADD CONSTRAINT student_planned_absences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.student_planned_absences ADD CONSTRAINT student_planned_absences_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.student_planned_absences ADD CONSTRAINT student_planned_absences_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.student_records_destination ADD CONSTRAINT student_records_destination_consent_captured_by_fkey FOREIGN KEY (consent_captured_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.student_records_destination ADD CONSTRAINT student_records_destination_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.student_records_destination ADD CONSTRAINT student_records_destination_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.student_wallets ADD CONSTRAINT student_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.student_weekly_xp_goals ADD CONSTRAINT student_weekly_xp_goals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE public.student_weekly_xp_goals ADD CONSTRAINT student_weekly_xp_goals_set_by_fkey FOREIGN KEY (set_by) REFERENCES users(id);
ALTER TABLE public.student_weekly_xp_goals ADD CONSTRAINT student_weekly_xp_goals_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.task_feedback ADD CONSTRAINT task_feedback_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE public.task_feedback ADD CONSTRAINT task_feedback_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id);
ALTER TABLE public.task_steps ADD CONSTRAINT task_steps_parent_step_id_fkey FOREIGN KEY (parent_step_id) REFERENCES task_steps(id) ON DELETE CASCADE;
ALTER TABLE public.task_steps ADD CONSTRAINT task_steps_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_steps ADD CONSTRAINT task_steps_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.transcript_overrides ADD CONSTRAINT transcript_overrides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.transcript_overrides ADD CONSTRAINT transcript_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES users(id);
ALTER TABLE public.transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.transcript_transfer_log ADD CONSTRAINT transcript_transfer_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.transcript_transfer_log ADD CONSTRAINT transcript_transfer_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.transfer_credits ADD CONSTRAINT transfer_credits_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.transfer_credits ADD CONSTRAINT transfer_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.treehouse_kiosk_devices ADD CONSTRAINT treehouse_kiosk_devices_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.treehouse_kiosk_devices ADD CONSTRAINT treehouse_kiosk_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.treehouse_pins ADD CONSTRAINT treehouse_pins_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.treehouse_pins ADD CONSTRAINT treehouse_pins_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.treehouse_pins ADD CONSTRAINT treehouse_pins_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.treehouse_pins ADD CONSTRAINT treehouse_pins_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.treehouse_showcase_events ADD CONSTRAINT treehouse_showcase_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.treehouse_showcase_events ADD CONSTRAINT treehouse_showcase_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES treehouse_showcase_events(id) ON DELETE CASCADE;
ALTER TABLE public.treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.treehouse_signals ADD CONSTRAINT treehouse_signals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.treehouse_signals ADD CONSTRAINT treehouse_signals_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.treehouse_signals ADD CONSTRAINT treehouse_signals_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.treehouse_signals ADD CONSTRAINT treehouse_signals_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.tutor_conversations ADD CONSTRAINT tutor_conversations_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE public.tutor_conversations ADD CONSTRAINT tutor_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tutor_messages ADD CONSTRAINT tutor_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES tutor_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.tutor_safety_reports ADD CONSTRAINT tutor_safety_reports_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES tutor_conversations(id) ON DELETE SET NULL;
ALTER TABLE public.tutor_safety_reports ADD CONSTRAINT tutor_safety_reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE SET NULL;
ALTER TABLE public.tutor_safety_reports ADD CONSTRAINT tutor_safety_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tutor_settings ADD CONSTRAINT tutor_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.tutorial_verification_log ADD CONSTRAINT tutorial_verification_log_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.tutorial_verification_log ADD CONSTRAINT tutorial_verification_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_activity_events ADD CONSTRAINT user_activity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_blocks ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_blocks ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_mastery ADD CONSTRAINT user_mastery_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_quest_tasks ADD CONSTRAINT user_quest_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.user_quest_tasks ADD CONSTRAINT user_quest_tasks_source_moment_id_fkey FOREIGN KEY (source_moment_id) REFERENCES learning_events(id) ON DELETE SET NULL;
ALTER TABLE public.user_quest_tasks ADD CONSTRAINT user_quest_tasks_source_template_task_id_fkey FOREIGN KEY (source_template_task_id) REFERENCES quest_template_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.user_quest_tasks ADD CONSTRAINT user_quest_tasks_user_id_fkey1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_quest_tasks ADD CONSTRAINT user_quest_tasks_user_quest_id_fkey1 FOREIGN KEY (user_quest_id) REFERENCES user_quests(id) ON DELETE CASCADE;
ALTER TABLE public.user_quests ADD CONSTRAINT user_quests_personalization_session_id_fkey FOREIGN KEY (personalization_session_id) REFERENCES quest_personalization_sessions(id);
ALTER TABLE public.user_quests ADD CONSTRAINT user_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.user_quests ADD CONSTRAINT user_quests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_skill_xp ADD CONSTRAINT user_skill_xp_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_subject_xp ADD CONSTRAINT user_subject_xp_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE public.user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_ai_features_enabled_by_fkey FOREIGN KEY (ai_features_enabled_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.users ADD CONSTRAINT users_auth_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_managed_by_parent_id_fkey FOREIGN KEY (managed_by_parent_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.users ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.users ADD CONSTRAINT users_parental_consent_verified_by_fkey FOREIGN KEY (parental_consent_verified_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public.xp_award_failures ADD CONSTRAINT xp_award_failures_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE SET NULL;
ALTER TABLE public.xp_award_failures ADD CONSTRAINT xp_award_failures_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

--
-- INDEXES (634)
--
CREATE UNIQUE INDEX idx_academy_enrollments_active_user ON public.academy_enrollments USING btree (user_id) WHERE (status = 'active'::text);
CREATE INDEX idx_academy_enrollments_partner_org ON public.academy_enrollments USING btree (partner_org_id) WHERE (partner_org_id IS NOT NULL);
CREATE INDEX idx_account_deletion_log_email ON public.account_deletion_log USING btree (email);
CREATE INDEX idx_account_deletion_log_user_id ON public.account_deletion_log USING btree (user_id);
CREATE INDEX idx_admin_audit_logs_action_type ON public.admin_audit_logs USING btree (action_type);
CREATE INDEX idx_admin_audit_logs_created_at ON public.admin_audit_logs USING btree (created_at DESC);
CREATE INDEX idx_admin_audit_logs_organization_id ON public.admin_audit_logs USING btree (organization_id);
CREATE INDEX idx_admin_audit_logs_resource_type ON public.admin_audit_logs USING btree (resource_type);
CREATE INDEX idx_admin_audit_logs_user_id ON public.admin_audit_logs USING btree (user_id);
CREATE INDEX idx_masquerade_log_admin ON public.admin_masquerade_log USING btree (admin_id);
CREATE INDEX idx_masquerade_log_started ON public.admin_masquerade_log USING btree (started_at DESC);
CREATE INDEX idx_masquerade_log_target ON public.admin_masquerade_log USING btree (target_user_id);
CREATE INDEX idx_checkins_advisor_student ON public.advisor_checkins USING btree (advisor_id, student_id, checkin_date DESC);
CREATE INDEX idx_checkins_date ON public.advisor_checkins USING btree (checkin_date DESC);
CREATE INDEX idx_checkins_student ON public.advisor_checkins USING btree (student_id, checkin_date DESC);
CREATE INDEX idx_advisor_notes_advisor_id ON public.advisor_notes USING btree (advisor_id);
CREATE INDEX idx_advisor_notes_advisor_subject ON public.advisor_notes USING btree (advisor_id, subject_id);
CREATE INDEX idx_advisor_notes_subject_id ON public.advisor_notes USING btree (subject_id);
CREATE INDEX idx_advisor_student_assignments_advisor ON public.advisor_student_assignments USING btree (advisor_id);
CREATE INDEX idx_advisor_student_assignments_assigned_by ON public.advisor_student_assignments USING btree (assigned_by);
CREATE INDEX idx_advisor_student_assignments_student ON public.advisor_student_assignments USING btree (student_id);
CREATE INDEX idx_ai_generated_quests_created_at ON public.ai_generated_quests USING btree (created_at DESC);
CREATE INDEX idx_ai_generated_quests_job_id ON public.ai_generated_quests USING btree (generation_job_id);
CREATE INDEX idx_ai_generated_quests_quality_score ON public.ai_generated_quests USING btree (quality_score DESC);
CREATE INDEX idx_ai_generated_quests_review_status ON public.ai_generated_quests USING btree (review_status);
CREATE INDEX idx_ai_generated_quests_reviewer_id ON public.ai_generated_quests USING btree (reviewer_id);
CREATE INDEX idx_ai_generation_jobs_created_at ON public.ai_generation_jobs USING btree (created_at DESC);
CREATE INDEX idx_ai_generation_jobs_created_by ON public.ai_generation_jobs USING btree (created_by);
CREATE INDEX idx_ai_prompt_components_category ON public.ai_prompt_components USING btree (category);
CREATE INDEX idx_ai_prompt_components_modified_by ON public.ai_prompt_components USING btree (modified_by);
CREATE INDEX idx_ai_prompt_components_name ON public.ai_prompt_components USING btree (name);
CREATE INDEX idx_ai_quest_review_queue_created_quest_id ON public.ai_quest_review_queue USING btree (created_quest_id);
CREATE INDEX idx_ai_quest_review_queue_reviewer ON public.ai_quest_review_queue USING btree (reviewer_id);
CREATE INDEX idx_ai_quest_review_queue_status ON public.ai_quest_review_queue USING btree (status);
CREATE INDEX idx_ai_quest_review_queue_submitted_at ON public.ai_quest_review_queue USING btree (submitted_at DESC);
CREATE INDEX idx_task_cache_expiry ON public.ai_task_cache USING btree (expires_at);
CREATE UNIQUE INDEX idx_task_cache_key ON public.ai_task_cache USING btree (quest_id, cache_key);
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs USING btree (created_at DESC);
CREATE INDEX idx_ai_usage_logs_service_name ON public.ai_usage_logs USING btree (service_name);
CREATE INDEX idx_ai_usage_logs_user_id ON public.ai_usage_logs USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_announcement_reads_announcement_id ON public.announcement_reads USING btree (announcement_id);
CREATE INDEX idx_announcement_reads_user_id ON public.announcement_reads USING btree (user_id);
CREATE INDEX idx_announcements_author_id ON public.announcements USING btree (author_id);
CREATE INDEX idx_announcements_created_at ON public.announcements USING btree (created_at DESC);
CREATE INDEX idx_announcements_organization_id ON public.announcements USING btree (organization_id);
CREATE INDEX idx_announcements_pinned ON public.announcements USING btree (pinned) WHERE (pinned = true);
CREATE INDEX idx_announcements_source ON public.announcements USING btree (source_announcement_id) WHERE (source_announcement_id IS NOT NULL);
CREATE INDEX idx_automation_sequences_created_by ON public.automation_sequences USING btree (created_by);
CREATE INDEX idx_automation_sequences_is_active ON public.automation_sequences USING btree (is_active);
CREATE INDEX idx_automation_sequences_trigger_event ON public.automation_sequences USING btree (trigger_event);
CREATE INDEX idx_bounties_audience ON public.bounties USING btree (organization_id, audience, status);
CREATE INDEX idx_bounties_bounty_type ON public.bounties USING btree (bounty_type);
CREATE INDEX idx_bounties_created_at ON public.bounties USING btree (created_at DESC);
CREATE INDEX idx_bounties_deadline ON public.bounties USING btree (deadline) WHERE (status = 'active'::text);
CREATE INDEX idx_bounties_moderation ON public.bounties USING btree (moderation_status) WHERE (moderation_status = 'pending'::text);
CREATE INDEX idx_bounties_organization_id ON public.bounties USING btree (organization_id) WHERE (organization_id IS NOT NULL);
CREATE INDEX idx_bounties_pillar ON public.bounties USING btree (pillar);
CREATE INDEX idx_bounties_poster_id ON public.bounties USING btree (poster_id);
CREATE INDEX idx_bounties_status ON public.bounties USING btree (status);
CREATE INDEX idx_bounty_claims_bounty_id ON public.bounty_claims USING btree (bounty_id);
CREATE INDEX idx_bounty_claims_status ON public.bounty_claims USING btree (status);
CREATE INDEX idx_bounty_claims_student_id ON public.bounty_claims USING btree (student_id);
CREATE INDEX idx_bounty_reviews_claim_id ON public.bounty_reviews USING btree (claim_id);
CREATE INDEX idx_bounty_reviews_reviewer_id ON public.bounty_reviews USING btree (reviewer_id);
CREATE INDEX idx_buddies_user_id ON public.buddies USING btree (user_id);
CREATE INDEX idx_bug_reports_status_created ON public.bug_reports USING btree (status, created_at DESC);
CREATE INDEX idx_class_advisors_advisor_id ON public.class_advisors USING btree (advisor_id);
CREATE INDEX idx_class_advisors_assigned_by ON public.class_advisors USING btree (assigned_by);
CREATE INDEX idx_class_advisors_class_id ON public.class_advisors USING btree (class_id);
CREATE INDEX idx_class_advisors_is_active ON public.class_advisors USING btree (is_active);
CREATE INDEX idx_class_discussion_posts_class_created ON public.class_discussion_posts USING btree (class_id, created_at);
CREATE INDEX idx_class_discussion_posts_parent ON public.class_discussion_posts USING btree (parent_post_id);
CREATE INDEX idx_class_enrollments_class_id ON public.class_enrollments USING btree (class_id);
CREATE INDEX idx_class_enrollments_enrolled_by ON public.class_enrollments USING btree (enrolled_by);
CREATE INDEX idx_class_enrollments_status ON public.class_enrollments USING btree (status);
CREATE INDEX idx_class_enrollments_student_id ON public.class_enrollments USING btree (student_id);
CREATE INDEX idx_class_materials_class ON public.class_materials USING btree (class_id, created_at DESC);
CREATE UNIQUE INDEX class_meetings_no_duplicate_slot ON public.class_meetings USING btree (class_id, COALESCE(day_of_week, '-1'::integer), COALESCE(specific_date, '0001-01-01'::date), start_time);
CREATE INDEX idx_class_meetings_class ON public.class_meetings USING btree (class_id);
CREATE INDEX idx_class_meetings_org ON public.class_meetings USING btree (organization_id);
CREATE INDEX idx_class_prerequisites_class ON public.class_prerequisites USING btree (class_id);
CREATE INDEX idx_class_quests_added_by ON public.class_quests USING btree (added_by);
CREATE INDEX idx_class_quests_class_id ON public.class_quests USING btree (class_id);
CREATE INDEX idx_class_quests_quest_id ON public.class_quests USING btree (quest_id);
CREATE INDEX idx_class_quests_sequence_order ON public.class_quests USING btree (sequence_order);
CREATE INDEX idx_consultation_requests_created_at ON public.consultation_requests USING btree (created_at DESC);
CREATE INDEX idx_consultation_requests_email ON public.consultation_requests USING btree (email);
CREATE INDEX idx_consultation_requests_status ON public.consultation_requests USING btree (status);
CREATE INDEX idx_contact_submissions_created ON public.contact_submissions USING btree (created_at DESC);
CREATE INDEX idx_contact_submissions_status ON public.contact_submissions USING btree (status);
CREATE INDEX idx_contact_submissions_type ON public.contact_submissions USING btree (contact_type);
CREATE INDEX idx_content_reports_reporter ON public.content_reports USING btree (reporter_id);
CREATE INDEX idx_content_reports_status ON public.content_reports USING btree (status, created_at DESC);
CREATE INDEX idx_content_reports_target ON public.content_reports USING btree (target_type, target_id);
CREATE INDEX idx_enrollments_course ON public.course_enrollments USING btree (course_id);
CREATE INDEX idx_enrollments_course_status ON public.course_enrollments USING btree (course_id, status);
CREATE INDEX idx_enrollments_current_quest ON public.course_enrollments USING btree (current_quest_id);
CREATE INDEX idx_enrollments_user ON public.course_enrollments USING btree (user_id);
CREATE INDEX idx_enrollments_user_status ON public.course_enrollments USING btree (user_id, status);
CREATE INDEX idx_course_gen_jobs_course ON public.course_generation_jobs USING btree (course_id);
CREATE INDEX idx_course_gen_jobs_status ON public.course_generation_jobs USING btree (status);
CREATE INDEX idx_course_gen_jobs_user ON public.course_generation_jobs USING btree (user_id, created_at DESC);
CREATE INDEX idx_course_generation_jobs_organization_id ON public.course_generation_jobs USING btree (organization_id);
CREATE INDEX idx_course_plan_sessions_course ON public.course_plan_sessions USING btree (created_course_id);
CREATE INDEX idx_plan_sessions_created_at ON public.course_plan_sessions USING btree (created_at DESC);
CREATE INDEX idx_plan_sessions_org ON public.course_plan_sessions USING btree (organization_id);
CREATE INDEX idx_plan_sessions_status ON public.course_plan_sessions USING btree (status);
CREATE INDEX idx_plan_sessions_user ON public.course_plan_sessions USING btree (user_id);
CREATE INDEX idx_course_quest_tasks_quest_id ON public.course_quest_tasks USING btree (quest_id);
CREATE INDEX idx_course_quests_course ON public.course_quests USING btree (course_id);
CREATE INDEX idx_course_quests_quest ON public.course_quests USING btree (quest_id);
CREATE INDEX idx_course_quests_sequence ON public.course_quests USING btree (course_id, sequence_order);
CREATE INDEX idx_course_quests_xp_threshold ON public.course_quests USING btree (xp_threshold) WHERE (xp_threshold > 0);
CREATE INDEX idx_refine_sessions_course ON public.course_refine_sessions USING btree (course_id);
CREATE INDEX idx_refine_sessions_status ON public.course_refine_sessions USING btree (status);
CREATE INDEX idx_refine_sessions_user ON public.course_refine_sessions USING btree (user_id);
CREATE INDEX idx_courses_created_by ON public.courses USING btree (created_by);
CREATE INDEX idx_courses_org_status ON public.courses USING btree (organization_id, status);
CREATE INDEX idx_courses_organization ON public.courses USING btree (organization_id);
CREATE INDEX idx_courses_slug ON public.courses USING btree (slug);
CREATE INDEX idx_courses_status ON public.courses USING btree (status);
CREATE INDEX idx_credit_ledger_credit_type ON public.credit_ledger USING btree (user_id, credit_type);
CREATE INDEX idx_credit_ledger_date ON public.credit_ledger USING btree (date_earned DESC);
CREATE INDEX idx_credit_ledger_quest ON public.credit_ledger USING btree (quest_id);
CREATE INDEX idx_credit_ledger_summary ON public.credit_ledger USING btree (user_id, credit_type, academic_year, credits_earned);
CREATE INDEX idx_credit_ledger_task ON public.credit_ledger USING btree (task_id);
CREATE INDEX idx_credit_ledger_user ON public.credit_ledger USING btree (user_id);
CREATE INDEX idx_credit_ledger_user_year ON public.credit_ledger USING btree (user_id, academic_year);
CREATE INDEX idx_credit_review_messages_completion ON public.credit_review_messages USING btree (completion_id, created_at);
CREATE INDEX crm_email_events_lead_idx ON public.crm_email_events USING btree (lead_id, occurred_at);
CREATE INDEX crm_events_lead_idx ON public.crm_events USING btree (lead_id, created_at);
CREATE INDEX crm_memberships_funnel_status_idx ON public.crm_funnel_memberships USING btree (funnel_id, status);
CREATE UNIQUE INDEX crm_memberships_one_active_per_lead ON public.crm_funnel_memberships USING btree (lead_id) WHERE (status = 'active'::text);
CREATE INDEX crm_leads_status_idx ON public.crm_leads USING btree (status);
CREATE INDEX crm_sends_lead_idx ON public.crm_sends USING btree (lead_id, created_at);
CREATE INDEX idx_curriculum_attachments_deleted_by ON public.curriculum_attachments USING btree (deleted_by);
CREATE INDEX idx_curriculum_attachments_organization_id ON public.curriculum_attachments USING btree (organization_id);
CREATE INDEX idx_curriculum_attachments_quest_id ON public.curriculum_attachments USING btree (quest_id);
CREATE INDEX idx_curriculum_attachments_uploaded_by ON public.curriculum_attachments USING btree (uploaded_by);
CREATE INDEX idx_curriculum_lesson_progress_completed_at ON public.curriculum_lesson_progress USING btree (completed_at);
CREATE INDEX idx_curriculum_lesson_progress_lesson_id ON public.curriculum_lesson_progress USING btree (lesson_id);
CREATE INDEX idx_curriculum_lesson_progress_organization_id ON public.curriculum_lesson_progress USING btree (organization_id);
CREATE INDEX idx_curriculum_lesson_progress_quest_id ON public.curriculum_lesson_progress USING btree (quest_id);
CREATE INDEX idx_curriculum_lesson_progress_status ON public.curriculum_lesson_progress USING btree (status);
CREATE INDEX idx_curriculum_lesson_progress_user_id ON public.curriculum_lesson_progress USING btree (user_id);
CREATE INDEX idx_curriculum_lesson_progress_user_quest ON public.curriculum_lesson_progress USING btree (user_id, quest_id);
CREATE INDEX idx_curriculum_lesson_tasks_lesson_id ON public.curriculum_lesson_tasks USING btree (lesson_id);
CREATE INDEX idx_curriculum_lesson_tasks_organization_id ON public.curriculum_lesson_tasks USING btree (organization_id);
CREATE INDEX idx_curriculum_lesson_tasks_quest_id ON public.curriculum_lesson_tasks USING btree (quest_id);
CREATE INDEX idx_curriculum_lesson_tasks_task_id ON public.curriculum_lesson_tasks USING btree (task_id);
CREATE INDEX idx_curriculum_lessons_content ON public.curriculum_lessons USING gin (content);
CREATE INDEX idx_curriculum_lessons_created_by ON public.curriculum_lessons USING btree (created_by);
CREATE INDEX idx_curriculum_lessons_is_published ON public.curriculum_lessons USING btree (is_published);
CREATE INDEX idx_curriculum_lessons_last_edited_by ON public.curriculum_lessons USING btree (last_edited_by);
CREATE INDEX idx_curriculum_lessons_organization_id ON public.curriculum_lessons USING btree (organization_id);
CREATE INDEX idx_curriculum_lessons_quest_id ON public.curriculum_lessons USING btree (quest_id);
CREATE INDEX idx_curriculum_lessons_search_vector ON public.curriculum_lessons USING gin (search_vector);
CREATE INDEX idx_curriculum_lessons_sequence_order ON public.curriculum_lessons USING btree (quest_id, sequence_order);
CREATE INDEX idx_curriculum_lessons_xp_threshold ON public.curriculum_lessons USING btree (xp_threshold) WHERE (xp_threshold > 0);
CREATE INDEX idx_curriculum_settings_navigation_mode ON public.curriculum_settings USING btree (navigation_mode);
CREATE INDEX idx_curriculum_settings_organization_id ON public.curriculum_settings USING btree (organization_id);
CREATE INDEX idx_curriculum_settings_quest_id ON public.curriculum_settings USING btree (quest_id);
CREATE INDEX idx_curriculum_uploads_can_resume ON public.curriculum_uploads USING btree (can_resume, uploaded_by) WHERE (can_resume = true);
CREATE INDEX idx_curriculum_uploads_created_course_id ON public.curriculum_uploads USING btree (created_course_id) WHERE (created_course_id IS NOT NULL);
CREATE INDEX idx_curriculum_uploads_created_quest_id ON public.curriculum_uploads USING btree (created_quest_id);
CREATE INDEX idx_curriculum_uploads_organization ON public.curriculum_uploads USING btree (organization_id);
CREATE INDEX idx_curriculum_uploads_progress ON public.curriculum_uploads USING btree (id, status, progress_percent);
CREATE INDEX idx_curriculum_uploads_reviewed_by ON public.curriculum_uploads USING btree (reviewed_by);
CREATE INDEX idx_curriculum_uploads_status ON public.curriculum_uploads USING btree (status);
CREATE INDEX idx_curriculum_uploads_uploaded_at ON public.curriculum_uploads USING btree (uploaded_at DESC);
CREATE INDEX idx_curriculum_uploads_uploaded_by ON public.curriculum_uploads USING btree (uploaded_by);
CREATE UNIQUE INDEX device_tokens_one_active_account_per_token ON public.device_tokens USING btree (token) WHERE is_active;
CREATE INDEX idx_device_tokens_is_active ON public.device_tokens USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_device_tokens_user_id ON public.device_tokens USING btree (user_id);
CREATE INDEX idx_review_rounds_completion ON public.diploma_review_rounds USING btree (completion_id);
CREATE INDEX idx_review_rounds_reviewer ON public.diploma_review_rounds USING btree (reviewer_id) WHERE (reviewer_id IS NOT NULL);
CREATE UNIQUE INDEX idx_review_rounds_unique ON public.diploma_review_rounds USING btree (completion_id, round_number);
CREATE INDEX idx_diplomas_consent ON public.diplomas USING btree (user_id) WHERE (public_consent_given = true);
CREATE INDEX idx_diplomas_portfolio_slug ON public.diplomas USING btree (portfolio_slug);
CREATE INDEX idx_diplomas_public_consent_given_by ON public.diplomas USING btree (public_consent_given_by);
CREATE INDEX idx_diplomas_user_id ON public.diplomas USING btree (user_id);
CREATE INDEX idx_direct_messages_conversation ON public.direct_messages USING btree (conversation_id);
CREATE INDEX idx_direct_messages_recipient ON public.direct_messages USING btree (recipient_id);
CREATE INDEX idx_direct_messages_sender ON public.direct_messages USING btree (sender_id);
CREATE INDEX idx_docs_articles_category ON public.docs_articles USING btree (category_id);
CREATE INDEX idx_docs_articles_created_by ON public.docs_articles USING btree (created_by);
CREATE INDEX idx_docs_articles_published ON public.docs_articles USING btree (is_published);
CREATE INDEX idx_docs_articles_search ON public.docs_articles USING gin (search_vector);
CREATE INDEX idx_docs_articles_slug ON public.docs_articles USING btree (slug);
CREATE INDEX idx_docs_categories_published ON public.docs_categories USING btree (is_published);
CREATE INDEX idx_docs_categories_slug ON public.docs_categories USING btree (slug);
CREATE INDEX idx_docs_search_misses_article ON public.docs_search_misses USING btree (generated_article_id);
CREATE INDEX idx_search_misses_count ON public.docs_search_misses USING btree (miss_count DESC);
CREATE INDEX idx_email_templates_created_by ON public.email_templates USING btree (created_by);
CREATE INDEX idx_email_templates_template_key ON public.email_templates USING btree (template_key);
CREATE INDEX idx_emergency_contacts_student ON public.emergency_contacts USING btree (student_user_id);
CREATE INDEX idx_evidence_blocks_document_id ON public.evidence_document_blocks USING btree (document_id);
CREATE INDEX idx_evidence_blocks_order ON public.evidence_document_blocks USING btree (document_id, order_index);
CREATE INDEX idx_evidence_blocks_uploaded_by ON public.evidence_document_blocks USING btree (uploaded_by_user_id);
CREATE INDEX idx_evidence_report_configs_active ON public.evidence_report_configs USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_evidence_report_configs_token ON public.evidence_report_configs USING btree (access_token);
CREATE INDEX idx_evidence_report_configs_user ON public.evidence_report_configs USING btree (user_id);
CREATE INDEX idx_evidence_report_parent_approvals_config ON public.evidence_report_parent_approvals USING btree (report_config_id);
CREATE INDEX idx_evidence_report_parent_approvals_parent ON public.evidence_report_parent_approvals USING btree (parent_user_id);
CREATE INDEX feed_highlights_created_at_idx ON public.feed_highlights USING btree (created_at DESC);
CREATE INDEX idx_feed_item_views_completion ON public.feed_item_views USING btree (completion_id) WHERE (completion_id IS NOT NULL);
CREATE INDEX idx_feed_item_views_learning_event ON public.feed_item_views USING btree (learning_event_id) WHERE (learning_event_id IS NOT NULL);
CREATE INDEX idx_feed_item_views_viewer ON public.feed_item_views USING btree (viewer_id);
CREATE INDEX idx_feed_share_tokens_completion ON public.feed_share_tokens USING btree (completion_id) WHERE (completion_id IS NOT NULL);
CREATE INDEX idx_feed_share_tokens_created_by ON public.feed_share_tokens USING btree (created_by);
CREATE INDEX idx_feed_share_tokens_learning_event ON public.feed_share_tokens USING btree (learning_event_id) WHERE (learning_event_id IS NOT NULL);
CREATE INDEX idx_feed_share_tokens_student ON public.feed_share_tokens USING btree (student_id);
CREATE INDEX idx_group_conversations_created_by ON public.group_conversations USING btree (created_by);
CREATE INDEX idx_group_conversations_is_active ON public.group_conversations USING btree (is_active);
CREATE INDEX idx_group_conversations_organization_id ON public.group_conversations USING btree (organization_id);
CREATE INDEX idx_group_conversations_source_class ON public.group_conversations USING btree (source_class_id) WHERE (source_class_id IS NOT NULL);
CREATE UNIQUE INDEX uq_group_conversations_class_audience ON public.group_conversations USING btree (source_class_id, audience) WHERE ((source_class_id IS NOT NULL) AND (is_active = true));
CREATE INDEX idx_group_members_added_by ON public.group_members USING btree (added_by);
CREATE INDEX idx_group_members_group_id ON public.group_members USING btree (group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members USING btree (user_id);
CREATE INDEX idx_group_messages_created_at ON public.group_messages USING btree (created_at DESC);
CREATE INDEX idx_group_messages_group_id ON public.group_messages USING btree (group_id);
CREATE INDEX idx_group_messages_sender_id ON public.group_messages USING btree (sender_id);
CREATE INDEX idx_household_members_household ON public.household_members USING btree (household_id);
CREATE INDEX idx_household_members_user ON public.household_members USING btree (user_id);
CREATE INDEX idx_households_org ON public.households USING btree (organization_id);
CREATE INDEX idx_interest_tracks_evolved_quest ON public.interest_tracks USING btree (evolved_to_quest_id);
CREATE INDEX idx_interest_tracks_user_id ON public.interest_tracks USING btree (user_id);
CREATE INDEX idx_learning_event_evidence_blocks_event_id ON public.learning_event_evidence_blocks USING btree (learning_event_id);
CREATE INDEX idx_learning_event_evidence_blocks_order ON public.learning_event_evidence_blocks USING btree (learning_event_id, order_index);
CREATE INDEX idx_let_event ON public.learning_event_topics USING btree (learning_event_id);
CREATE INDEX idx_let_topic ON public.learning_event_topics USING btree (topic_type, topic_id);
CREATE INDEX idx_learning_events_attached_task ON public.learning_events USING btree (attached_task_id) WHERE (attached_task_id IS NOT NULL);
CREATE UNIQUE INDEX idx_learning_events_attached_task_unique ON public.learning_events USING btree (attached_task_id) WHERE (attached_task_id IS NOT NULL);
CREATE INDEX idx_learning_events_captured_by ON public.learning_events USING btree (captured_by_user_id) WHERE (captured_by_user_id IS NOT NULL);
CREATE INDEX idx_learning_events_parent_moment_id ON public.learning_events USING btree (parent_moment_id);
CREATE INDEX idx_learning_events_user_id ON public.learning_events USING btree (user_id);
CREATE INDEX idx_lesson_reflections_user_lesson ON public.lesson_reflections USING btree (user_id, lesson_id);
CREATE INDEX idx_lms_grade_sync_pending ON public.lms_grade_sync USING btree (sync_status, created_at) WHERE ((sync_status)::text = 'pending'::text);
CREATE INDEX idx_lms_grade_sync_platform ON public.lms_grade_sync USING btree (lms_platform);
CREATE INDEX idx_lms_grade_sync_quest ON public.lms_grade_sync USING btree (quest_id);
CREATE INDEX idx_lms_grade_sync_status ON public.lms_grade_sync USING btree (sync_status);
CREATE INDEX idx_lms_grade_sync_user ON public.lms_grade_sync USING btree (user_id);
CREATE INDEX idx_lms_integrations_lms_user ON public.lms_integrations USING btree (lms_platform, lms_user_id);
CREATE INDEX idx_lms_integrations_organization_id ON public.lms_integrations USING btree (organization_id);
CREATE INDEX idx_lms_integrations_platform ON public.lms_integrations USING btree (lms_platform);
CREATE INDEX idx_lms_integrations_sync_status ON public.lms_integrations USING btree (sync_status);
CREATE INDEX idx_lms_integrations_user ON public.lms_integrations USING btree (user_id);
CREATE INDEX idx_lms_sessions_expires ON public.lms_sessions USING btree (expires_at);
CREATE INDEX idx_lms_sessions_platform ON public.lms_sessions USING btree (lms_platform);
CREATE INDEX idx_lms_sessions_token ON public.lms_sessions USING btree (session_token);
CREATE INDEX idx_lms_sessions_user ON public.lms_sessions USING btree (user_id);
CREATE INDEX idx_login_attempts_email ON public.login_attempts USING btree (email);
CREATE INDEX idx_lti_auth_codes_expires ON public.lti_auth_codes USING btree (expires_at);
CREATE INDEX idx_lti_auth_codes_user ON public.lti_auth_codes USING btree (user_id);
CREATE INDEX idx_lti_nonces_expires ON public.lti_nonces USING btree (expires_at);
CREATE INDEX lti_pending_launches_expires_at_idx ON public.lti_pending_launches USING btree (expires_at);
CREATE INDEX idx_lti_registrations_active ON public.lti_registrations USING btree (is_active);
CREATE INDEX idx_lti_registrations_org ON public.lti_registrations USING btree (organization_id);
CREATE INDEX idx_message_conversations_p1 ON public.message_conversations USING btree (participant_1_id);
CREATE INDEX idx_message_conversations_p2 ON public.message_conversations USING btree (participant_2_id);
CREATE INDEX idx_message_email_relays_owner ON public.message_email_relays USING btree (owner_id);
CREATE INDEX idx_message_reactions_msg ON public.message_reactions USING btree (message_type, message_id);
CREATE INDEX idx_notification_preferences_user ON public.notification_preferences USING btree (user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);
CREATE INDEX idx_notifications_organization_id ON public.notifications USING btree (organization_id);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_observer_audit_action_type ON public.observer_access_audit USING btree (action_type);
CREATE INDEX idx_observer_audit_composite ON public.observer_access_audit USING btree (observer_id, student_id, created_at DESC);
CREATE INDEX idx_observer_audit_created_at ON public.observer_access_audit USING btree (created_at DESC);
CREATE INDEX idx_observer_audit_observer_id ON public.observer_access_audit USING btree (observer_id);
CREATE INDEX idx_observer_audit_student_id ON public.observer_access_audit USING btree (student_id);
CREATE INDEX idx_observer_comments_created ON public.observer_comments USING btree (created_at DESC);
CREATE INDEX idx_observer_comments_learning_event_id ON public.observer_comments USING btree (learning_event_id) WHERE (learning_event_id IS NOT NULL);
CREATE INDEX idx_observer_comments_observer ON public.observer_comments USING btree (observer_id);
CREATE INDEX idx_observer_comments_quest ON public.observer_comments USING btree (quest_id);
CREATE INDEX idx_observer_comments_student ON public.observer_comments USING btree (student_id);
CREATE INDEX idx_observer_comments_task ON public.observer_comments USING btree (task_completion_id);
CREATE INDEX idx_observer_invitation_students_invitation_id ON public.observer_invitation_students USING btree (invitation_id);
CREATE INDEX idx_observer_invitation_students_student_id ON public.observer_invitation_students USING btree (student_id);
CREATE INDEX idx_observer_invitations_code ON public.observer_invitations USING btree (invitation_code);
CREATE INDEX idx_observer_invitations_email ON public.observer_invitations USING btree (observer_email);
CREATE INDEX idx_observer_invitations_invited_by ON public.observer_invitations USING btree (invited_by_user_id);
CREATE INDEX idx_observer_invitations_status ON public.observer_invitations USING btree (status);
CREATE INDEX idx_observer_invitations_student ON public.observer_invitations USING btree (student_id);
CREATE INDEX idx_observer_invitations_unconsumed ON public.observer_invitations USING btree (invited_by_user_id, expires_at) WHERE ((consumed_at IS NULL) AND (status = 'pending'::text));
CREATE INDEX idx_observer_links_observer ON public.observer_student_links USING btree (observer_id);
CREATE INDEX idx_observer_links_student ON public.observer_student_links USING btree (student_id);
CREATE INDEX idx_observer_student_links_invited_by_parent ON public.observer_student_links USING btree (invited_by_parent_id);
CREATE INDEX idx_oea_compliance_alerts_org ON public.oea_compliance_alerts USING btree (organization_id, school_year);
CREATE INDEX idx_oea_credit_evidence_credit ON public.oea_credit_evidence USING btree (credit_id);
CREATE INDEX idx_oea_credit_evidence_student ON public.oea_credit_evidence USING btree (student_id);
CREATE INDEX idx_oea_grade_periods_credit ON public.oea_credit_grade_periods USING btree (credit_id);
CREATE INDEX idx_oea_grade_periods_student ON public.oea_credit_grade_periods USING btree (student_id);
CREATE INDEX idx_oea_credits_enrollment ON public.oea_credits USING btree (enrollment_id);
CREATE INDEX idx_oea_credits_quest ON public.oea_credits USING btree (quest_id) WHERE (quest_id IS NOT NULL);
CREATE INDEX idx_oea_credits_source ON public.oea_credits USING btree (student_id, credit_source);
CREATE INDEX idx_oea_credits_student ON public.oea_credits USING btree (student_id);
CREATE INDEX idx_oea_enrollments_parent ON public.oea_enrollments USING btree (parent_id);
CREATE INDEX idx_oea_help_video_views_org ON public.oea_help_video_views USING btree (organization_id);
CREATE INDEX idx_org_classes_created_by ON public.org_classes USING btree (created_by);
CREATE INDEX idx_org_classes_organization_id ON public.org_classes USING btree (organization_id);
CREATE INDEX idx_org_classes_status ON public.org_classes USING btree (status);
CREATE INDEX idx_org_course_settings_org ON public.org_course_settings USING btree (organization_id);
CREATE INDEX idx_org_course_settings_teacher ON public.org_course_settings USING btree (teacher_id);
CREATE INDEX idx_org_invitations_accepted_by ON public.org_invitations USING btree (accepted_by);
CREATE INDEX idx_org_invitations_code ON public.org_invitations USING btree (invitation_code);
CREATE INDEX idx_org_invitations_email ON public.org_invitations USING btree (email);
CREATE INDEX idx_org_invitations_expires_at ON public.org_invitations USING btree (expires_at);
CREATE INDEX idx_org_invitations_invited_by ON public.org_invitations USING btree (invited_by);
CREATE INDEX idx_org_invitations_org_status ON public.org_invitations USING btree (organization_id, status);
CREATE INDEX idx_org_invitations_organization_id ON public.org_invitations USING btree (organization_id);
CREATE INDEX idx_org_invitations_status ON public.org_invitations USING btree (status);
CREATE UNIQUE INDEX idx_org_invitations_unique_pending ON public.org_invitations USING btree (organization_id, email) WHERE (status = 'pending'::text);
CREATE INDEX idx_org_kiosk_devices_org ON public.org_kiosk_devices USING btree (organization_id);
CREATE INDEX idx_org_quest_group_items_quest ON public.org_quest_group_items USING btree (quest_id);
CREATE INDEX idx_org_quest_groups_org ON public.org_quest_groups USING btree (organization_id);
CREATE INDEX idx_org_resources_org ON public.org_resources USING btree (organization_id);
CREATE INDEX idx_org_course_access_composite ON public.organization_course_access USING btree (organization_id, course_id);
CREATE INDEX idx_org_course_access_course ON public.organization_course_access USING btree (course_id);
CREATE INDEX idx_org_course_access_org ON public.organization_course_access USING btree (organization_id);
CREATE INDEX idx_organization_course_access_granted_by ON public.organization_course_access USING btree (granted_by);
CREATE INDEX idx_org_quest_access_composite ON public.organization_quest_access USING btree (organization_id, quest_id);
CREATE INDEX idx_org_quest_access_org ON public.organization_quest_access USING btree (organization_id);
CREATE INDEX idx_org_quest_access_quest ON public.organization_quest_access USING btree (quest_id);
CREATE INDEX idx_organization_quest_access_granted_by ON public.organization_quest_access USING btree (granted_by);
CREATE INDEX idx_organizations_ai_features_enabled ON public.organizations USING btree (ai_features_enabled);
CREATE INDEX idx_organizations_archived_at ON public.organizations USING btree (archived_at) WHERE (archived_at IS NOT NULL);
CREATE INDEX idx_organizations_inbox_user_id ON public.organizations USING btree (inbox_user_id) WHERE (inbox_user_id IS NOT NULL);
CREATE INDEX idx_organizations_is_active ON public.organizations USING btree (is_active);
CREATE INDEX idx_organizations_slug ON public.organizations USING btree (slug);
CREATE INDEX idx_parent_digest_sends_org_week ON public.parent_digest_sends USING btree (organization_id, week_date DESC);
CREATE INDEX idx_parent_links_parent ON public.parent_student_links USING btree (parent_user_id);
CREATE INDEX idx_parent_links_student ON public.parent_student_links USING btree (student_user_id);
CREATE INDEX idx_parent_student_links_admin_verified ON public.parent_student_links USING btree (admin_verified);
CREATE INDEX idx_parent_student_links_verified_by ON public.parent_student_links USING btree (verified_by_admin_id);
CREATE INDEX idx_consent_log_reviewed_by ON public.parental_consent_log USING btree (reviewed_by_admin_id) WHERE (reviewed_by_admin_id IS NOT NULL);
CREATE INDEX idx_parental_consent_log_token ON public.parental_consent_log USING btree (consent_token);
CREATE INDEX idx_parental_consent_log_user_id ON public.parental_consent_log USING btree (user_id);
CREATE INDEX idx_password_reset_attempts_email ON public.password_reset_attempts USING btree (email);
CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);
CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);
CREATE INDEX idx_peer_comments_completion ON public.peer_comments USING btree (task_completion_id) WHERE (task_completion_id IS NOT NULL);
CREATE INDEX idx_peer_comments_learning_event ON public.peer_comments USING btree (learning_event_id) WHERE (learning_event_id IS NOT NULL);
CREATE INDEX idx_peer_comments_student ON public.peer_comments USING btree (student_id, created_at DESC);
CREATE UNIQUE INDEX idx_peer_connect_codes_live ON public.peer_connect_codes USING btree (code) WHERE (revoked_at IS NULL);
CREATE INDEX idx_peer_connect_codes_user ON public.peer_connect_codes USING btree (user_id, created_at DESC);
CREATE INDEX idx_peer_connection_approvals_approver ON public.peer_connection_approvals USING btree (approver_id, status);
CREATE INDEX idx_peer_connections_addressee ON public.peer_connections USING btree (addressee_id, status);
CREATE UNIQUE INDEX idx_peer_connections_pair ON public.peer_connections USING btree (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX idx_peer_connections_requester ON public.peer_connections USING btree (requester_id, status);
CREATE INDEX idx_philosophy_edges_source ON public.philosophy_edges USING btree (source_node_id);
CREATE INDEX idx_philosophy_edges_target ON public.philosophy_edges USING btree (target_node_id);
CREATE INDEX idx_philosophy_nodes_level ON public.philosophy_nodes USING btree (level);
CREATE INDEX idx_philosophy_nodes_parent ON public.philosophy_nodes USING btree (parent_node_id);
CREATE INDEX idx_philosophy_nodes_visible ON public.philosophy_nodes USING btree (is_visible);
CREATE INDEX idx_phone_verification_codes_user_created ON public.phone_verification_codes USING btree (user_id, created_at DESC);
CREATE INDEX idx_planned_credits_user_id ON public.planned_credits USING btree (user_id);
CREATE INDEX idx_poe_participants_class_quest_id ON public.poe_participants USING btree (class_quest_id);
CREATE INDEX idx_poe_participants_cohort ON public.poe_participants USING btree (poe_cohort_id);
CREATE INDEX idx_poe_signups_cohort ON public.poe_signups USING btree (poe_cohort_id);
CREATE UNIQUE INDEX idx_poe_signups_cohort_email ON public.poe_signups USING btree (poe_cohort_id, email);
CREATE INDEX idx_prior_learning_evidence_record ON public.prior_learning_evidence USING btree (record_id, sequence_order);
CREATE INDEX idx_prior_learning_records_org_status ON public.prior_learning_records USING btree (organization_id, status, created_at DESC);
CREATE INDEX idx_prior_learning_records_student ON public.prior_learning_records USING btree (student_user_id, created_at DESC);
CREATE INDEX idx_prior_learning_records_submitter ON public.prior_learning_records USING btree (submitted_by, created_at DESC);
CREATE UNIQUE INDEX idx_visibility_requests_one_pending ON public.public_visibility_requests USING btree (student_user_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_visibility_requests_parent ON public.public_visibility_requests USING btree (parent_user_id);
CREATE INDEX idx_visibility_requests_pending ON public.public_visibility_requests USING btree (status) WHERE (status = 'pending'::text);
CREATE INDEX idx_visibility_requests_student ON public.public_visibility_requests USING btree (student_user_id);
CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);
CREATE INDEX idx_quest_invitations_advisor_id ON public.quest_invitations USING btree (advisor_id);
CREATE INDEX idx_quest_invitations_advisor_org ON public.quest_invitations USING btree (advisor_id, organization_id);
CREATE INDEX idx_quest_invitations_organization_id ON public.quest_invitations USING btree (organization_id);
CREATE INDEX idx_quest_invitations_quest_id ON public.quest_invitations USING btree (quest_id);
CREATE INDEX idx_quest_invitations_status ON public.quest_invitations USING btree (status);
CREATE INDEX idx_quest_invitations_student_id ON public.quest_invitations USING btree (student_id);
CREATE INDEX idx_quest_invitations_student_status ON public.quest_invitations USING btree (student_id, status);
CREATE UNIQUE INDEX idx_quest_invitations_unique_pending ON public.quest_invitations USING btree (student_id, quest_id, advisor_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_personalization_user_quest ON public.quest_personalization_sessions USING btree (user_id, quest_id);
CREATE INDEX idx_quest_personalization_sessions_quest_id ON public.quest_personalization_sessions USING btree (quest_id);
CREATE INDEX idx_quest_sample_tasks_flagged ON public.quest_sample_tasks USING btree (quest_id, is_flagged);
CREATE INDEX idx_quest_sample_tasks_lesson ON public.quest_sample_tasks USING btree (source_lesson_id);
CREATE INDEX idx_quest_sample_tasks_pillar ON public.quest_sample_tasks USING btree (quest_id, pillar);
CREATE INDEX idx_quest_sample_tasks_quest_id ON public.quest_sample_tasks USING btree (quest_id);
CREATE INDEX idx_quest_sample_tasks_spark_assignment_id ON public.quest_sample_tasks USING btree (spark_assignment_id);
CREATE INDEX idx_quest_sample_tasks_usage ON public.quest_sample_tasks USING btree (quest_id, usage_count DESC);
CREATE INDEX idx_quest_sources_id ON public.quest_sources USING btree (id);
CREATE INDEX idx_completions_diploma_status ON public.quest_task_completions USING btree (diploma_status) WHERE (diploma_status = ANY (ARRAY['draft'::text, 'ready_for_credit'::text]));
CREATE INDEX idx_completions_pending_org_approval ON public.quest_task_completions USING btree (diploma_status) WHERE (diploma_status = 'pending_org_approval'::text);
CREATE INDEX idx_completions_reviewed_by ON public.quest_task_completions USING btree (reviewed_by) WHERE (reviewed_by IS NOT NULL);
CREATE INDEX idx_evidence_documents ON public.quest_task_completions USING btree (user_id, completed_at) WHERE (evidence_url IS NOT NULL);
CREATE INDEX idx_quest_completions_user_completed ON public.quest_task_completions USING btree (user_id, completed_at DESC);
CREATE INDEX idx_quest_task_completions ON public.quest_task_completions USING btree (user_id, quest_id, task_id);
CREATE INDEX idx_quest_task_completions_credit_reviewer ON public.quest_task_completions USING btree (credit_reviewer_id);
CREATE INDEX idx_quest_task_completions_merged_into ON public.quest_task_completions USING btree (merged_into);
CREATE INDEX idx_quest_task_completions_quest_id ON public.quest_task_completions USING btree (quest_id);
CREATE INDEX idx_quest_task_completions_task_id ON public.quest_task_completions USING btree (task_id);
CREATE INDEX idx_quest_task_completions_user_id ON public.quest_task_completions USING btree (user_id);
CREATE INDEX idx_quest_task_completions_user_quest_completed ON public.quest_task_completions USING btree (user_id, quest_id, completed_at);
CREATE INDEX idx_task_completions_date ON public.quest_task_completions USING btree (completed_at DESC);
CREATE INDEX idx_task_completions_scheduled ON public.quest_task_completions USING btree (user_id, scheduled_date);
CREATE INDEX idx_task_completions_task_id ON public.quest_task_completions USING btree (user_quest_task_id);
CREATE INDEX idx_task_completions_user_quest ON public.quest_task_completions USING btree (user_id, quest_id);
CREATE UNIQUE INDEX uniq_quest_task_completions_user_task ON public.quest_task_completions USING btree (user_id, user_quest_task_id) WHERE (user_quest_task_id IS NOT NULL);
CREATE INDEX idx_quest_template_tasks_flagged ON public.quest_template_tasks USING btree (quest_id, is_flagged) WHERE (is_flagged = true);
CREATE INDEX idx_quest_template_tasks_pillar ON public.quest_template_tasks USING btree (quest_id, pillar);
CREATE INDEX idx_quest_template_tasks_quest_id ON public.quest_template_tasks USING btree (quest_id);
CREATE INDEX idx_quest_template_tasks_quest_order ON public.quest_template_tasks USING btree (quest_id, order_index);
CREATE INDEX idx_quest_template_tasks_quest_required ON public.quest_template_tasks USING btree (quest_id, is_required);
CREATE INDEX idx_quest_template_tasks_usage ON public.quest_template_tasks USING btree (quest_id, usage_count DESC);
CREATE INDEX idx_quests_active ON public.quests USING btree (is_active);
CREATE INDEX idx_quests_class_review_status ON public.quests USING btree (class_review_status) WHERE (class_review_status IS NOT NULL);
CREATE INDEX idx_quests_class_type_subject ON public.quests USING btree (quest_type, transcript_subject) WHERE ((quest_type)::text = 'class'::text);
CREATE INDEX idx_quests_created_at ON public.quests USING btree (created_at DESC);
CREATE INDEX idx_quests_created_by ON public.quests USING btree (created_by) WHERE (created_by IS NOT NULL);
CREATE INDEX idx_quests_curriculum_last_edited_by ON public.quests USING btree (curriculum_last_edited_by);
CREATE INDEX idx_quests_is_active ON public.quests USING btree (is_active) WHERE (is_active = true);
CREATE INDEX idx_quests_is_public ON public.quests USING btree (is_public);
CREATE INDEX idx_quests_is_tutorial ON public.quests USING btree (is_tutorial) WHERE (is_tutorial = true);
CREATE INDEX idx_quests_lti_registration ON public.quests USING btree (lti_registration_id);
CREATE INDEX idx_quests_organization_id ON public.quests USING btree (organization_id);
CREATE INDEX idx_quests_quest_type ON public.quests USING btree (quest_type);
CREATE INDEX idx_quests_quest_type_active ON public.quests USING btree (quest_type, is_active) WHERE (is_active = true);
CREATE INDEX idx_quests_topic_primary ON public.quests USING btree (topic_primary);
CREATE INDEX idx_quests_topics ON public.quests USING gin (topics);
CREATE INDEX idx_quests_visibility ON public.quests USING btree (is_public, created_by, is_active);
CREATE INDEX idx_refresh_token_families_expires ON public.refresh_token_families USING btree (expires_at);
CREATE INDEX idx_refresh_token_families_user ON public.refresh_token_families USING btree (user_id) WHERE (revoked = false);
CREATE INDEX idx_registrations_org ON public.registrations USING btree (organization_id);
CREATE INDEX idx_registrations_parent ON public.registrations USING btree (parent_user_id);
CREATE INDEX idx_role_change_by ON public.role_change_log USING btree (changed_by);
CREATE INDEX idx_role_change_time ON public.role_change_log USING btree (changed_at);
CREATE INDEX idx_role_change_user ON public.role_change_log USING btree (user_id);
CREATE INDEX idx_scheduled_jobs_created_at ON public.scheduled_jobs USING btree (created_at DESC);
CREATE INDEX idx_scheduled_jobs_scheduled_for ON public.scheduled_jobs USING btree (scheduled_for);
CREATE INDEX idx_school_enrollments_org ON public.school_enrollments USING btree (organization_id);
CREATE INDEX idx_school_enrollments_status ON public.school_enrollments USING btree (organization_id, status);
CREATE INDEX sis_age_exception_requests_org_idx ON public.sis_age_exception_requests USING btree (organization_id, status, created_at DESC);
CREATE UNIQUE INDEX sis_age_exception_requests_pending_uniq ON public.sis_age_exception_requests USING btree (organization_id, student_user_id, class_id) WHERE (status = 'pending'::text);
CREATE INDEX idx_sis_announcements_org ON public.sis_announcements USING btree (organization_id, created_at DESC);
CREATE INDEX idx_sis_assignment_templates_org ON public.sis_assignment_templates USING btree (organization_id);
CREATE INDEX idx_sis_attendance_class_date ON public.sis_attendance USING btree (class_id, date);
CREATE INDEX idx_sis_attendance_org ON public.sis_attendance USING btree (organization_id);
CREATE INDEX idx_sis_attendance_student ON public.sis_attendance USING btree (student_user_id);
CREATE INDEX idx_sis_attendance_alerts_open ON public.sis_attendance_alerts USING btree (organization_id, status) WHERE (status = 'open'::text);
CREATE INDEX idx_sis_attendance_alerts_org_date ON public.sis_attendance_alerts USING btree (organization_id, date);
CREATE INDEX sis_billing_audit_invoice_idx ON public.sis_billing_audit USING btree (invoice_id);
CREATE INDEX sis_billing_audit_org_idx ON public.sis_billing_audit USING btree (organization_id, created_at DESC);
CREATE INDEX idx_carpool_org_status ON public.sis_carpool_posts USING btree (organization_id, status, created_at DESC);
CREATE INDEX sis_curriculum_org_idx ON public.sis_curriculum USING btree (organization_id, is_active, title);
CREATE INDEX sis_curriculum_classes_class_idx ON public.sis_curriculum_classes USING btree (class_id);
CREATE INDEX idx_sis_curriculum_courses_course ON public.sis_curriculum_courses USING btree (course_id);
CREATE INDEX idx_sis_curriculum_courses_curriculum ON public.sis_curriculum_courses USING btree (curriculum_id, sequence_order);
CREATE INDEX idx_sis_curriculum_materials_curriculum ON public.sis_curriculum_materials USING btree (curriculum_id, created_at DESC);
CREATE INDEX idx_sis_curriculum_quests_curriculum ON public.sis_curriculum_quests USING btree (curriculum_id, sequence_order);
CREATE INDEX idx_sis_curriculum_quests_quest ON public.sis_curriculum_quests USING btree (quest_id);
CREATE INDEX idx_sis_discount_rules_org ON public.sis_discount_rules USING btree (organization_id);
CREATE UNIQUE INDEX idx_sis_engagement_alerts_open_dedupe ON public.sis_engagement_alerts USING btree (organization_id, student_user_id, quest_id, alert_type) WHERE (resolved_at IS NULL);
CREATE INDEX sis_enrollment_waitlist_org_idx ON public.sis_enrollment_waitlist USING btree (organization_id, status, created_at);
CREATE INDEX sis_enrollment_waitlist_queue_idx ON public.sis_enrollment_waitlist USING btree (organization_id, band_min_age, band_max_age, manual_rank, queued_at) WHERE (status = 'waiting'::text);
CREATE UNIQUE INDEX sis_enrollment_waitlist_waiting_uniq ON public.sis_enrollment_waitlist USING btree (organization_id, student_user_id) WHERE (status = 'waiting'::text);
CREATE INDEX idx_sis_event_rsvps_event ON public.sis_event_rsvps USING btree (event_id, created_at);
CREATE UNIQUE INDEX uq_sis_event_rsvps_household ON public.sis_event_rsvps USING btree (event_id, household_id) WHERE (household_id IS NOT NULL);
CREATE INDEX idx_sis_events_categories ON public.sis_events USING gin (categories);
CREATE INDEX sis_events_org_start_idx ON public.sis_events USING btree (organization_id, start_at);
CREATE INDEX sis_form_comments_submission_idx ON public.sis_form_comments USING btree (submission_id, created_at);
CREATE INDEX sis_form_submissions_assignee_idx ON public.sis_form_submissions USING btree (assigned_to, status);
CREATE INDEX sis_form_submissions_org_status_idx ON public.sis_form_submissions USING btree (organization_id, status);
CREATE INDEX sis_form_submissions_submitter_idx ON public.sis_form_submissions USING btree (submitted_by);
CREATE INDEX idx_sis_form_templates_org ON public.sis_form_templates USING btree (organization_id, audience, is_active, sort_order);
CREATE INDEX idx_sis_installments_plan ON public.sis_installments USING btree (payment_plan_id);
CREATE INDEX idx_sis_installments_status ON public.sis_installments USING btree (status);
CREATE INDEX idx_sis_invoice_line_items_invoice ON public.sis_invoice_line_items USING btree (invoice_id);
CREATE INDEX idx_sis_invoices_household ON public.sis_invoices USING btree (household_id);
CREATE INDEX idx_sis_invoices_org ON public.sis_invoices USING btree (organization_id);
CREATE INDEX idx_sis_invoices_status ON public.sis_invoices USING btree (organization_id, status);
CREATE INDEX idx_sis_lost_found_org ON public.sis_lost_found USING btree (organization_id, created_at DESC);
CREATE INDEX idx_onboarding_assignments_blocking ON public.sis_onboarding_assignments USING btree (user_id) WHERE blocks_access;
CREATE INDEX idx_sis_onboarding_assignments_batch ON public.sis_onboarding_assignments USING btree (organization_id, batch_id) WHERE (batch_id IS NOT NULL);
CREATE INDEX idx_sis_onboarding_assignments_org_kind ON public.sis_onboarding_assignments USING btree (organization_id, kind);
CREATE INDEX idx_sis_onboarding_assignments_user_audience ON public.sis_onboarding_assignments USING btree (user_id, audience);
CREATE INDEX sis_onboarding_assignments_org_user_idx ON public.sis_onboarding_assignments USING btree (organization_id, user_id);
CREATE INDEX sis_onboarding_templates_org_idx ON public.sis_onboarding_templates USING btree (organization_id);
CREATE INDEX idx_sis_payment_plans_invoice ON public.sis_payment_plans USING btree (invoice_id);
CREATE INDEX idx_sis_payment_records_invoice ON public.sis_payment_records USING btree (invoice_id);
CREATE INDEX idx_sis_payment_records_org ON public.sis_payment_records USING btree (organization_id);
CREATE INDEX idx_sis_payment_reminders_invoice ON public.sis_payment_reminders USING btree (invoice_id, sent_at);
CREATE INDEX idx_sis_qbo_sync_org ON public.sis_quickbooks_sync_log USING btree (organization_id, status);
CREATE INDEX idx_sis_recognition_org ON public.sis_recognition USING btree (organization_id, created_at DESC);
CREATE INDEX idx_sis_recognition_comments_thread ON public.sis_recognition_comments USING btree (recognition_id, created_at);
CREATE INDEX sis_recurring_tuition_due ON public.sis_recurring_tuition USING btree (next_charge_on) WHERE (status = 'active'::text);
CREATE INDEX sis_recurring_tuition_household ON public.sis_recurring_tuition USING btree (household_id);
CREATE UNIQUE INDEX sis_recurring_tuition_one_live_per_student ON public.sis_recurring_tuition USING btree (student_user_id) WHERE (status <> 'canceled'::text);
CREATE INDEX sis_recurring_tuition_org ON public.sis_recurring_tuition USING btree (organization_id);
CREATE INDEX idx_sis_registration_items_class ON public.sis_registration_items USING btree (class_id);
CREATE INDEX idx_sis_registration_items_reg ON public.sis_registration_items USING btree (registration_id);
CREATE INDEX idx_sis_registrations_org ON public.sis_registrations USING btree (organization_id);
CREATE INDEX idx_sis_registrations_status ON public.sis_registrations USING btree (organization_id, status);
CREATE INDEX idx_sis_registrations_student ON public.sis_registrations USING btree (student_user_id);
CREATE INDEX idx_sis_saved_pm_guardian ON public.sis_saved_payment_methods USING btree (guardian_user_id);
CREATE INDEX idx_sis_saved_pm_org ON public.sis_saved_payment_methods USING btree (organization_id);
CREATE INDEX sis_schedule_submissions_org_idx ON public.sis_schedule_submissions USING btree (organization_id, status, submitted_at);
CREATE INDEX idx_secure_documents_requires_signature ON public.sis_secure_documents USING btree (owner_user_id) WHERE requires_signature;
CREATE INDEX idx_sis_secure_documents_org_owner ON public.sis_secure_documents USING btree (organization_id, owner_user_id);
CREATE INDEX idx_sis_secure_documents_org_sensitivity ON public.sis_secure_documents USING btree (organization_id, sensitivity);
CREATE INDEX idx_sis_secure_documents_org_student ON public.sis_secure_documents USING btree (organization_id, student_user_id);
CREATE INDEX idx_sis_secure_documents_owner_shared ON public.sis_secure_documents USING btree (organization_id, owner_user_id, shared_with_owner);
CREATE INDEX sis_staff_assignments_org_user_idx ON public.sis_staff_assignments USING btree (organization_id, user_id);
CREATE INDEX sis_staff_profiles_org_idx ON public.sis_staff_profiles USING btree (organization_id);
CREATE INDEX idx_sis_staff_training_audience ON public.sis_staff_training USING btree (organization_id, audience, sequence_order);
CREATE INDEX idx_sis_staff_training_audiences ON public.sis_staff_training USING gin (audiences);
CREATE INDEX sis_staff_training_org_idx ON public.sis_staff_training USING btree (organization_id, sequence_order);
CREATE UNIQUE INDEX sis_staff_training_org_quest_audience_key ON public.sis_staff_training USING btree (organization_id, quest_id, audience);
CREATE INDEX idx_sis_student_assignments_class ON public.sis_student_assignments USING btree (class_id);
CREATE INDEX idx_sis_student_assignments_org_student ON public.sis_student_assignments USING btree (organization_id, student_user_id);
CREATE INDEX idx_sis_student_goals_org_status ON public.sis_student_goals USING btree (organization_id, status);
CREATE INDEX idx_sis_student_materials_org_student ON public.sis_student_materials USING btree (organization_id, student_user_id);
CREATE INDEX idx_sis_submission_reviews_org ON public.sis_submission_reviews USING btree (organization_id, reviewed_at);
CREATE INDEX sis_time_entries_org_user_date_idx ON public.sis_time_entries USING btree (organization_id, user_id, work_date);
CREATE INDEX idx_sis_waitlist_class ON public.sis_waitlist_entries USING btree (class_id, "position");
CREATE INDEX idx_sis_waitlist_org ON public.sis_waitlist_entries USING btree (organization_id);
CREATE INDEX idx_sis_waitlist_status ON public.sis_waitlist_entries USING btree (class_id, status);
CREATE INDEX idx_sis_xp_adjustments_student ON public.sis_xp_adjustments USING btree (student_user_id, created_at);
CREATE INDEX idx_student_access_accessor ON public.student_access_logs USING btree (accessor_id);
CREATE INDEX idx_student_access_purpose ON public.student_access_logs USING btree (purpose) WHERE (purpose IS NOT NULL);
CREATE INDEX idx_student_access_student ON public.student_access_logs USING btree (student_id, access_timestamp DESC);
CREATE INDEX idx_student_access_timestamp ON public.student_access_logs USING btree (access_timestamp DESC);
CREATE INDEX idx_planned_absence_class_date ON public.student_planned_absences USING btree (class_id, absence_date);
CREATE INDEX idx_planned_absence_org_date ON public.student_planned_absences USING btree (organization_id, absence_date);
CREATE INDEX idx_planned_absence_student_date ON public.student_planned_absences USING btree (student_user_id, absence_date);
CREATE UNIQUE INDEX uq_planned_absence_active ON public.student_planned_absences USING btree (student_user_id, absence_date, class_id) NULLS NOT DISTINCT WHERE (status = 'active'::text);
CREATE INDEX idx_student_wallets_user_id ON public.student_wallets USING btree (user_id);
CREATE INDEX idx_student_weekly_xp_goals_org ON public.student_weekly_xp_goals USING btree (organization_id, effective_from DESC);
CREATE INDEX idx_student_weekly_xp_goals_student ON public.student_weekly_xp_goals USING btree (student_user_id, effective_from DESC);
CREATE INDEX idx_task_feedback_completion ON public.task_feedback USING btree (completion_id);
CREATE INDEX idx_task_feedback_created ON public.task_feedback USING btree (completion_id, created_at);
CREATE INDEX idx_task_steps_parent_step_id ON public.task_steps USING btree (parent_step_id);
CREATE INDEX idx_task_steps_task_id ON public.task_steps USING btree (task_id);
CREATE INDEX idx_task_steps_user_id ON public.task_steps USING btree (user_id);
CREATE INDEX idx_transcript_shares_live ON public.transcript_share_tokens USING btree (user_id) WHERE (revoked_at IS NULL);
CREATE INDEX idx_transcript_shares_token ON public.transcript_share_tokens USING btree (token);
CREATE INDEX idx_transcript_shares_user ON public.transcript_share_tokens USING btree (user_id);
CREATE INDEX idx_transcript_transfer_log_user ON public.transcript_transfer_log USING btree (user_id, created_at DESC);
CREATE INDEX idx_transfer_credits_created_by ON public.transfer_credits USING btree (created_by);
CREATE INDEX idx_transfer_credits_user ON public.transfer_credits USING btree (user_id);
CREATE INDEX transfer_credits_prior_learning_ids_idx ON public.transfer_credits USING gin (prior_learning_record_ids);
CREATE INDEX idx_treehouse_kiosk_devices_org ON public.treehouse_kiosk_devices USING btree (organization_id, is_active);
CREATE INDEX idx_treehouse_pins_org ON public.treehouse_pins USING btree (organization_id);
CREATE INDEX idx_treehouse_showcase_events_org ON public.treehouse_showcase_events USING btree (organization_id, status);
CREATE INDEX idx_treehouse_showcase_participants_event ON public.treehouse_showcase_participants USING btree (event_id);
CREATE INDEX idx_treehouse_signals_org_status ON public.treehouse_signals USING btree (organization_id, status);
CREATE INDEX idx_treehouse_signals_student ON public.treehouse_signals USING btree (student_id);
CREATE INDEX idx_tutor_conversations_quest ON public.tutor_conversations USING btree (quest_id) WHERE (quest_id IS NOT NULL);
CREATE INDEX idx_tutor_conversations_task_id ON public.tutor_conversations USING btree (task_id) WHERE (task_id IS NOT NULL);
CREATE INDEX idx_tutor_conversations_user_id ON public.tutor_conversations USING btree (user_id);
CREATE INDEX idx_tutor_messages_conversation_created ON public.tutor_messages USING btree (conversation_id, created_at DESC);
CREATE INDEX idx_tutor_messages_conversation_id ON public.tutor_messages USING btree (conversation_id);
CREATE INDEX idx_tutor_messages_created_at ON public.tutor_messages USING btree (created_at);
CREATE INDEX idx_tutor_safety_reports_admin_reviewed ON public.tutor_safety_reports USING btree (admin_reviewed) WHERE (admin_reviewed = false);
CREATE INDEX idx_tutor_safety_reports_conversation_id ON public.tutor_safety_reports USING btree (conversation_id);
CREATE INDEX idx_tutor_safety_reports_message_id ON public.tutor_safety_reports USING btree (message_id);
CREATE INDEX idx_tutor_safety_reports_user_id ON public.tutor_safety_reports USING btree (user_id);
CREATE INDEX idx_tutor_settings_user_id ON public.tutor_settings USING btree (user_id);
CREATE INDEX idx_tutorial_verification_task ON public.tutorial_verification_log USING btree (task_id);
CREATE INDEX idx_tutorial_verification_user ON public.tutorial_verification_log USING btree (user_id);
CREATE INDEX idx_activity_category ON public.user_activity_events USING btree (event_category);
CREATE INDEX idx_activity_created_brin ON public.user_activity_events USING brin (created_at);
CREATE INDEX idx_activity_session ON public.user_activity_events USING btree (session_id);
CREATE INDEX idx_activity_type_created ON public.user_activity_events USING btree (event_type, created_at DESC);
CREATE INDEX idx_activity_user_created ON public.user_activity_events USING btree (user_id, created_at DESC);
CREATE INDEX idx_user_activity_events_created_at_event_type ON public.user_activity_events USING btree (created_at, event_type);
CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id);
CREATE INDEX idx_user_blocks_blocker ON public.user_blocks USING btree (blocker_id);
CREATE INDEX idx_user_quest_tasks_approval ON public.user_quest_tasks USING btree (approval_status) WHERE (approval_status = 'pending'::text);
CREATE INDEX idx_user_quest_tasks_quest_user ON public.user_quest_tasks USING btree (quest_id, user_id);
CREATE INDEX idx_user_quest_tasks_source_moment_id ON public.user_quest_tasks USING btree (source_moment_id);
CREATE INDEX idx_user_quest_tasks_source_task_id ON public.user_quest_tasks USING btree (source_task_id);
CREATE INDEX idx_user_quest_tasks_source_template ON public.user_quest_tasks USING btree (source_template_task_id) WHERE (source_template_task_id IS NOT NULL);
CREATE INDEX idx_user_quest_tasks_subject_xp_distribution ON public.user_quest_tasks USING gin (subject_xp_distribution);
CREATE INDEX idx_user_quest_tasks_user_quest ON public.user_quest_tasks USING btree (user_id, quest_id);
CREATE INDEX idx_user_quest_tasks_user_quest_id ON public.user_quest_tasks USING btree (user_quest_id);
CREATE INDEX idx_user_quests_active ON public.user_quests USING btree (is_active);
CREATE INDEX idx_user_quests_archived_at ON public.user_quests USING btree (user_id) WHERE (archived_at IS NOT NULL);
CREATE INDEX idx_user_quests_completed ON public.user_quests USING btree (user_id, completed_at) WHERE (completed_at IS NOT NULL);
CREATE INDEX idx_user_quests_lookup ON public.user_quests USING btree (user_id, is_active, completed_at) WHERE (is_active = true);
CREATE INDEX idx_user_quests_lti_polled_at ON public.user_quests USING btree (lti_canvas_polled_at) WHERE (lti_canvas_polled_at IS NOT NULL);
CREATE INDEX idx_user_quests_personalization ON public.user_quests USING btree (user_id, quest_id, personalization_completed);
CREATE INDEX idx_user_quests_personalization_session_id ON public.user_quests USING btree (personalization_session_id) WHERE (personalization_session_id IS NOT NULL);
CREATE INDEX idx_user_quests_pickup_count ON public.user_quests USING btree (user_id, times_picked_up);
CREATE INDEX idx_user_quests_quest_id ON public.user_quests USING btree (quest_id);
CREATE INDEX idx_user_quests_status ON public.user_quests USING btree (user_id, status);
CREATE INDEX idx_user_quests_user_id ON public.user_quests USING btree (user_id);
CREATE INDEX idx_user_skill_details_user_id ON public.user_skill_details USING btree (user_id);
CREATE INDEX idx_user_skill_xp ON public.user_skill_xp USING btree (user_id, pillar);
CREATE INDEX idx_user_skill_xp_pillar ON public.user_skill_xp USING btree (pillar);
CREATE INDEX idx_user_skill_xp_user_id ON public.user_skill_xp USING btree (user_id);
CREATE INDEX idx_user_subject_xp_subject ON public.user_subject_xp USING btree (school_subject);
CREATE INDEX idx_user_subject_xp_user_id ON public.user_subject_xp USING btree (user_id);
CREATE INDEX idx_evidence_documents_completed_at ON public.user_task_evidence_documents USING btree (completed_at);
CREATE INDEX idx_evidence_documents_quest_id ON public.user_task_evidence_documents USING btree (quest_id);
CREATE INDEX idx_evidence_documents_status ON public.user_task_evidence_documents USING btree (status);
CREATE INDEX idx_evidence_documents_task_id ON public.user_task_evidence_documents USING btree (task_id);
CREATE INDEX idx_evidence_documents_user_id ON public.user_task_evidence_documents USING btree (user_id);
CREATE INDEX idx_users_ai_features_enabled ON public.users USING btree (ai_features_enabled) WHERE (is_dependent = true);
CREATE INDEX idx_users_ai_features_enabled_by ON public.users USING btree (ai_features_enabled_by);
CREATE INDEX idx_users_apple_user_id ON public.users USING btree (apple_user_id) WHERE (apple_user_id IS NOT NULL);
CREATE INDEX idx_users_deletion_pending ON public.users USING btree (deletion_scheduled_for) WHERE ((deletion_status)::text = 'pending'::text);
CREATE INDEX idx_users_deletion_status ON public.users USING btree (deletion_status) WHERE ((deletion_status)::text <> 'none'::text);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_google_user_id ON public.users USING btree (google_user_id);
CREATE INDEX idx_users_is_dependent ON public.users USING btree (is_dependent) WHERE (is_dependent = true);
CREATE INDEX idx_users_is_org_admin ON public.users USING btree (is_org_admin) WHERE (is_org_admin = true);
CREATE INDEX idx_users_last_active ON public.users USING btree (last_active DESC);
CREATE INDEX idx_users_last_logout_at ON public.users USING btree (last_logout_at);
CREATE INDEX idx_users_managed_by_parent ON public.users USING btree (managed_by_parent_id) WHERE (managed_by_parent_id IS NOT NULL);
CREATE INDEX idx_users_org_role ON public.users USING btree (org_role) WHERE (org_role IS NOT NULL);
CREATE INDEX idx_users_org_roles ON public.users USING gin (org_roles);
CREATE INDEX idx_users_org_username_lookup ON public.users USING btree (organization_id, lower((username)::text)) WHERE (username IS NOT NULL);
CREATE INDEX idx_users_organization_id ON public.users USING btree (organization_id);
CREATE INDEX idx_users_parental_consent_pending ON public.users USING btree (parental_consent_status) WHERE (requires_parental_consent = true);
CREATE INDEX idx_users_parental_consent_token ON public.users USING btree (parental_consent_token) WHERE (parental_consent_token IS NOT NULL);
CREATE INDEX idx_users_parental_consent_verified_by ON public.users USING btree (parental_consent_verified_by) WHERE (parental_consent_verified_by IS NOT NULL);
CREATE INDEX idx_users_platform ON public.users USING btree (id) WHERE (organization_id IS NULL);
CREATE INDEX idx_users_program_key ON public.users USING btree (program_key) WHERE (program_key IS NOT NULL);
CREATE INDEX idx_users_role ON public.users USING btree (role);
CREATE INDEX idx_users_role_org_role ON public.users USING btree (role, org_role);
CREATE INDEX idx_users_tutorial_completed ON public.users USING btree (tutorial_completed_at);
CREATE UNIQUE INDEX idx_users_username_org ON public.users USING btree (organization_id, lower((username)::text)) WHERE ((username IS NOT NULL) AND (organization_id IS NOT NULL));
CREATE INDEX idx_xp_award_failures_created_at ON public.xp_award_failures USING btree (created_at DESC);
CREATE INDEX idx_xp_award_failures_unprocessed ON public.xp_award_failures USING btree (processed_at) WHERE (processed_at IS NULL);
CREATE INDEX idx_xp_award_failures_user_id ON public.xp_award_failures USING btree (user_id);

--
-- FUNCTIONS (121)
--
CREATE OR REPLACE FUNCTION private.get_user_org_id(user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    org_id uuid;
begin
    select organization_id into org_id from public.users where id = user_id;
    return org_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.is_advisor_user(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    eff_role text;
begin
    eff_role := public.get_effective_role(user_id);
    return eff_role in ('advisor', 'superadmin', 'org_admin');
end;
$function$
;
CREATE OR REPLACE FUNCTION private.is_minor_for_publication(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select case
       when u.is_dependent is true      then true
       when u.date_of_birth is null     then true
       else ((current_date - u.date_of_birth)::numeric / 365.25) < 18
     end
     from public.users u
     where u.id = p_user_id),
    true)
$function$
;
CREATE OR REPLACE FUNCTION private.is_org_admin_user(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    eff_role text;
begin
    eff_role := public.get_effective_role(user_id);
    return eff_role = 'org_admin';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.is_superadmin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    return exists (
        select 1 from public.users
        where id = user_id and role = 'superadmin'
    );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.add_default_quest_xp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.xp_amount IS NULL THEN
        NEW.xp_amount := 100;
    END IF;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.add_user_skill_xp(p_user_id uuid, p_pillar text, p_xp_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF p_user_id IS NULL OR p_pillar IS NULL OR p_xp_amount IS NULL THEN
        RAISE EXCEPTION 'All parameters are required';
    END IF;

    IF p_xp_amount < 0 OR p_xp_amount > 10000 THEN
        RAISE EXCEPTION 'XP amount must be between 0 and 10000';
    END IF;

    IF p_pillar NOT IN ('stem', 'wellness', 'communication', 'civics', 'art') THEN
        RAISE EXCEPTION 'Invalid pillar. Must be one of: stem, wellness, communication, civics, art';
    END IF;

    INSERT INTO public.user_skill_xp (user_id, pillar, xp_amount)
    VALUES (p_user_id, p_pillar, p_xp_amount)
    ON CONFLICT (user_id, pillar)
    DO UPDATE SET
        xp_amount = user_skill_xp.xp_amount + p_xp_amount,
        updated_at = NOW();

    UPDATE public.users
    SET total_xp = total_xp + p_xp_amount,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_platform_metrics_daily(p_days integer DEFAULT 30)
 RETURNS TABLE(day date, signups bigint, dau bigint, task_completions bigint, quest_starts bigint, evidence_uploads bigint, reg_success bigint, reg_failed bigint, login_success bigint, login_failed bigint, sis_payment_cents bigint)
 LANGUAGE sql
 STABLE
AS $function$
  with bounds as (
    select ((now() at time zone 'utc')::date
              - (least(greatest(coalesce(p_days, 30), 1), 90) - 1)) as start_day,
           (now() at time zone 'utc')::date as end_day
  ),
  days as (
    select generate_series(b.start_day, b.end_day, interval '1 day')::date as day
    from bounds b
  ),
  signup_counts as (
    select (u.created_at at time zone 'utc')::date as day, count(*) as n
    from users u, bounds b
    where u.created_at >= b.start_day::timestamptz
    group by 1
  ),
  events as (
    select (e.created_at at time zone 'utc')::date as day, e.event_type, e.user_id
    from user_activity_events e, bounds b
    where e.created_at >= b.start_day::timestamptz
      and coalesce(e.user_agent, '') not like 'Werkzeug/%'
  ),
  dau_counts as (
    select day, count(distinct user_id) as n
    from events
    where user_id is not null
    group by 1
  ),
  event_counts as (
    select day,
      count(*) filter (where event_type = 'evidence_uploaded')     as evidence_uploads,
      count(*) filter (where event_type = 'registration_success')  as reg_success,
      count(*) filter (where event_type = 'registration_failed')   as reg_failed,
      count(*) filter (where event_type = 'login_success')         as login_success,
      count(*) filter (where event_type = 'login_failed')          as login_failed
    from events
    group by 1
  ),
  completion_counts as (
    select (c.completed_at at time zone 'utc')::date as day, count(*) as n
    from quest_task_completions c, bounds b
    where c.completed_at >= b.start_day::timestamptz
    group by 1
  ),
  start_counts as (
    select (q.started_at at time zone 'utc')::date as day, count(*) as n
    from user_quests q, bounds b
    where q.started_at >= b.start_day::timestamptz
    group by 1
  ),
  sis_cents as (
    select (p.recorded_at at time zone 'utc')::date as day, sum(p.amount_cents) as n
    from sis_payment_records p, bounds b
    where p.recorded_at >= b.start_day::timestamptz
    group by 1
  )
  select
    d.day,
    coalesce(s.n, 0)                  as signups,
    coalesce(a.n, 0)                  as dau,
    coalesce(c.n, 0)                  as task_completions,
    coalesce(st.n, 0)                 as quest_starts,
    coalesce(ec.evidence_uploads, 0)  as evidence_uploads,
    coalesce(ec.reg_success, 0)       as reg_success,
    coalesce(ec.reg_failed, 0)        as reg_failed,
    coalesce(ec.login_success, 0)     as login_success,
    coalesce(ec.login_failed, 0)      as login_failed,
    coalesce(sp.n, 0)                 as sis_payment_cents
  from days d
  left join signup_counts s      on s.day = d.day
  left join dau_counts a         on a.day = d.day
  left join completion_counts c  on c.day = d.day
  left join start_counts st      on st.day = d.day
  left join event_counts ec      on ec.day = d.day
  left join sis_cents sp         on sp.day = d.day
  order by d.day
$function$
;
CREATE OR REPLACE FUNCTION public.admin_set_user_password(target_user_id uuid, new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found in auth.users', target_user_id;
  END IF;

  DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id::text;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_event_counts_by_category(p_start timestamp with time zone, p_end timestamp with time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_category text, event_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    select coalesce(e.event_category, 'other')::text as event_category,
           count(*)                                  as event_count
    from public.user_activity_events e
    where e.created_at >= p_start
      and e.created_at <= p_end
      and (p_user_id is null or e.user_id = p_user_id)
    group by 1
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_quest_event_counts(p_since timestamp with time zone)
 RETURNS TABLE(quest_id text, views bigint, starts bigint, completions bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    select e.event_data->>'quest_id'                                    as quest_id,
           count(*) filter (where e.event_type = 'quest_viewed')        as views,
           count(*) filter (where e.event_type = 'quest_started')       as starts,
           count(*) filter (where e.event_type = 'quest_completed')     as completions
    from public.user_activity_events e
    where e.created_at >= p_since
      and e.event_type in ('quest_viewed', 'quest_started', 'quest_completed')
      and e.event_data ? 'quest_id'
      -- Only real quest ids. The activity tracker used to record the raw path
      -- segment after /quests/, so collection routes were logged as quest ids
      -- and "similar", "topics" and "completed" ranked as the most popular
      -- quests — 28% of the events in a 30-day window. The tracker now only
      -- records UUID-shaped segments, but the rows already written stay, so the
      -- aggregate filters them out too.
      and e.event_data->>'quest_id' ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    group by 1
$function$
;
CREATE OR REPLACE FUNCTION public.anonymize_old_activity_events()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    rows_affected INTEGER;
BEGIN
    UPDATE user_activity_events
    SET user_id = NULL, user_agent = NULL,
        event_data = CASE WHEN event_data IS NOT NULL THEN event_data - 'ip_address' - 'email' - 'user_email' ELSE NULL END,
        anonymized_at = NOW()
    WHERE created_at < NOW() - INTERVAL '90 days' AND anonymized_at IS NULL;

    GET DIAGNOSTICS rows_affected = ROW_COUNT;

    UPDATE user_sessions
    SET user_id = NULL, user_agent = NULL, ip_address = NULL, anonymized_at = NOW()
    WHERE started_at < NOW() - INTERVAL '90 days' AND anonymized_at IS NULL;

    RETURN rows_affected;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.award_xp_on_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
        PERFORM public.recalculate_user_skill_xp(NEW.user_id);
    END IF;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.calculate_age(birth_date date)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN EXTRACT(YEAR FROM AGE(birth_date));
END;
$function$
;
CREATE OR REPLACE FUNCTION public.calculate_mastery_level(total_xp integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
  IF total_xp <= 500 THEN RETURN 1;
  ELSIF total_xp <= 1500 THEN RETURN 2;
  ELSIF total_xp <= 3500 THEN RETURN 3;
  ELSIF total_xp <= 7000 THEN RETURN 4;
  ELSIF total_xp <= 12500 THEN RETURN 5;
  ELSIF total_xp <= 20000 THEN RETURN 6;
  ELSIF total_xp <= 30000 THEN RETURN 7;
  ELSIF total_xp <= 45000 THEN RETURN 8;
  ELSIF total_xp <= 65000 THEN RETURN 9;
  ELSIF total_xp <= 90000 THEN RETURN 10;
  ELSIF total_xp <= 120000 THEN RETURN 11;
  ELSIF total_xp <= 160000 THEN RETURN 12;
  ELSE RETURN 13 + ((total_xp - 160000) / 40000)::integer;
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.calculate_promotion_eligible_date(dob date)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN dob + INTERVAL '13 years';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.calculate_quest_quality_score(p_quest_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_score NUMERIC := 0;
BEGIN
    SELECT 
        CASE 
            WHEN COUNT(*) > 0 THEN AVG(rating)::NUMERIC
            ELSE 0
        END INTO v_score
    FROM public.quest_ratings
    WHERE quest_id = p_quest_id;
    
    RETURN COALESCE(v_score, 0);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.calculate_transfer_credits_total_xp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.total_xp := COALESCE(
        (SELECT SUM((value)::int) FROM jsonb_each_text(NEW.subject_xp)),
        0
    );
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_daily_message_limit(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    user_settings RECORD;
BEGIN
    SELECT * INTO user_settings
    FROM tutor_settings
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        -- Create default settings if none exist
        INSERT INTO tutor_settings (user_id) VALUES (p_user_id);
        RETURN TRUE;
    END IF;

    -- Reset counter if it's a new day
    IF user_settings.last_reset_date < CURRENT_DATE THEN
        UPDATE tutor_settings
        SET messages_used_today = 0,
            last_reset_date = CURRENT_DATE
        WHERE user_id = p_user_id;
        RETURN TRUE;
    END IF;

    -- Check if under limit
    RETURN user_settings.messages_used_today < user_settings.daily_message_limit;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_parental_consent_requirement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.requires_parental_consent := (calculate_age(NEW.date_of_birth) < 13);
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_performance_fixes()
 RETURNS TABLE(check_name text, status text, details text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Check 1: Verify auth RLS initialization fixes
    RETURN QUERY
    SELECT 
        'Auth RLS Initialization'::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'PASS'::text
            ELSE 'FAIL'::text
        END,
        'Tables with auth.uid() in policies: ' || COUNT(*)::text
    FROM pg_policies
    WHERE schemaname = 'public'
    AND policyname IN (
        'Service role can manage all XP',
        'Service role can manage skill details',
        'user_achievements_system_write'
    )
    AND qual LIKE '%auth.uid()%'
    AND qual NOT LIKE '%(SELECT auth.uid())%';

    -- Check 2: Verify no duplicate permissive policies
    RETURN QUERY
    WITH policy_counts AS (
        SELECT 
            tablename,
            cmd,
            COUNT(*) as policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
        GROUP BY tablename, cmd
        HAVING COUNT(*) > 1
    )
    SELECT
        'Multiple Permissive Policies'::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'PASS'::text
            ELSE 'FAIL'::text
        END,
        'Tables with multiple permissive policies: ' || COUNT(*)::text
    FROM policy_counts;

    -- Check 3: Verify is_admin function exists
    RETURN QUERY
    SELECT
        'is_admin Function'::text,
        CASE 
            WHEN COUNT(*) = 1 THEN 'PASS'::text
            ELSE 'FAIL'::text
        END,
        'Function exists: ' || (COUNT(*) = 1)::text
    FROM pg_proc
    WHERE proname = 'is_admin'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_quest_duplicate(p_title text, p_exclude_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 
        FROM public.quests 
        WHERE LOWER(title) = LOWER(p_title)
        AND (p_exclude_id IS NULL OR id != p_exclude_id)
    ) INTO v_exists;
    
    RETURN v_exists;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.check_security_fixes()
 RETURNS TABLE(check_name text, status text, details text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Check if RLS is enabled on all necessary tables
    RETURN QUERY
    SELECT 
        'RLS Enabled on ' || tablename::TEXT,
        CASE WHEN rowsecurity THEN 'PASS' ELSE 'FAIL' END,
        CASE WHEN rowsecurity THEN 'RLS is enabled' ELSE 'RLS needs to be enabled' END
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
        'users', 'quests', 'user_quests', 'quest_tasks', 
        'user_quest_tasks', 'learning_logs', 'diplomas',
        'friendships', 'submissions', 'quest_collaborations',
        'ai_cycle_logs', 'ai_generated_quests', 'ai_generation_jobs',
        'ai_prompt_templates', 'ai_quest_review_history', 'ai_seeds',
        'learning_logs_backup', 'quest_reviews', 'user_achievements'
    );
    
    -- Check if functions have search_path set
    RETURN QUERY
    SELECT 
        'Function ' || p.proname::TEXT,
        CASE 
            WHEN p.proconfig IS NOT NULL AND 
                 array_to_string(p.proconfig, ',') LIKE '%search_path%' 
            THEN 'PASS' 
            ELSE 'FAIL' 
        END,
        CASE 
            WHEN p.proconfig IS NOT NULL AND 
                 array_to_string(p.proconfig, ',') LIKE '%search_path%' 
            THEN 'search_path is set'
            ELSE 'search_path needs to be set' 
        END
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN (
        'calculate_quest_quality_score', 'award_xp_on_completion',
        'get_user_total_xp', 'recalculate_user_skill_xp',
        'initialize_user_skills', 'update_quest_quality_score',
        'add_default_quest_xp', 'get_monthly_active_users',
        'get_user_xp_by_subject', 'update_updated_at_column',
        'check_quest_duplicate', 'generate_portfolio_slug'
    );
    
    -- Check for extensions in public schema
    RETURN QUERY
    SELECT 
        'Extension ' || extname::TEXT,
        CASE 
            WHEN n.nspname = 'public' THEN 'FAIL'
            ELSE 'PASS'
        END,
        CASE 
            WHEN n.nspname = 'public' THEN 'Needs to be moved from public schema'
            ELSE 'Correctly placed in ' || n.nspname
        END
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname IN ('pg_net', 'pg_trgm', 'vector');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_expired_lms_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM lms_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_expired_lti_artifacts()
 RETURNS TABLE(codes_deleted integer, nonces_deleted integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    c INTEGER;
    n INTEGER;
BEGIN
    DELETE FROM lti_auth_codes WHERE expires_at < NOW() OR used = TRUE;
    GET DIAGNOSTICS c = ROW_COUNT;

    DELETE FROM lti_nonces WHERE expires_at < NOW();
    GET DIAGNOSTICS n = ROW_COUNT;

    RETURN QUERY SELECT c, n;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_expired_refresh_token_families(p_limit integer DEFAULT 5000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  deleted_count integer;
begin
  with doomed as (
    select id from public.refresh_token_families
    where expires_at < now() - interval '7 days'
    limit greatest(1, least(coalesce(p_limit, 5000), 50000))
  )
  delete from public.refresh_token_families f
  using doomed d
  where f.id = d.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_expired_spark_auth_codes()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM spark_auth_codes WHERE expires_at < NOW() - INTERVAL '1 hour';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_expired_spark_codes()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    DELETE FROM spark_auth_codes
    WHERE expires_at < NOW() OR used = TRUE;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.cleanup_user_data()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Delete from tables with user_id foreign key
    DELETE FROM public.user_skill_xp WHERE user_id = OLD.id;
    DELETE FROM public.diplomas WHERE user_id = OLD.id;
    DELETE FROM public.user_quest_tasks WHERE user_id = OLD.id;
    DELETE FROM public.quest_task_completions WHERE user_id = OLD.id;
    DELETE FROM public.user_quests WHERE user_id = OLD.id;
    DELETE FROM public.notifications WHERE user_id = OLD.id;
    DELETE FROM public.course_enrollments WHERE user_id = OLD.id;
    DELETE FROM public.curriculum_lesson_progress WHERE user_id = OLD.id;

    -- friendships table was dropped in March 2026 audit; no-op here.

    -- Delete observer student links (has both student_id and observer_id)
    DELETE FROM public.observer_student_links WHERE student_id = OLD.id OR observer_id = OLD.id;

    -- Delete observer invitations (only has student_id, not observer_id)
    DELETE FROM public.observer_invitations WHERE student_id = OLD.id;

    -- Clear foreign key references (set to NULL)
    UPDATE public.org_invitations SET accepted_by = NULL WHERE accepted_by = OLD.id;
    UPDATE public.org_invitations SET invited_by = NULL WHERE invited_by = OLD.id;
    UPDATE public.quests SET created_by = NULL WHERE created_by = OLD.id;

    -- Delete the user record from public.users
    DELETE FROM public.users WHERE id = OLD.id;

    RETURN OLD;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.count_moments_by_topic(p_user_id uuid, p_topic_type text)
 RETURNS TABLE(topic_id uuid, moment_count bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT let.topic_id, COUNT(DISTINCT let.learning_event_id)
  FROM learning_event_topics let
  JOIN learning_events le ON le.id = let.learning_event_id
  WHERE le.user_id = p_user_id AND let.topic_type = p_topic_type
  GROUP BY let.topic_id;
$function$
;
CREATE OR REPLACE FUNCTION public.create_verified_parent_link(p_parent_id uuid, p_student_id uuid, p_admin_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_link_id UUID;
BEGIN
    -- Check if link already exists
    SELECT id INTO v_link_id
    FROM parent_student_links
    WHERE parent_user_id = p_parent_id
    AND student_user_id = p_student_id;

    -- If link exists, update it
    IF v_link_id IS NOT NULL THEN
        UPDATE parent_student_links
        SET admin_verified = TRUE,
            verified_by_admin_id = p_admin_id,
            verified_at = NOW(),
            admin_notes = p_notes,
            updated_at = NOW()
        WHERE id = v_link_id;

        RETURN v_link_id;
    END IF;

    -- Otherwise, create new link
    INSERT INTO parent_student_links (
        parent_user_id,
        student_user_id,
        admin_verified,
        verified_by_admin_id,
        verified_at,
        admin_notes
    ) VALUES (
        p_parent_id,
        p_student_id,
        TRUE,
        p_admin_id,
        NOW(),
        p_notes
    )
    RETURNING id INTO v_link_id;

    RETURN v_link_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.decrement_track_moment_count(track_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE interest_tracks 
  SET moment_count = GREATEST(0, moment_count - 1),
      updated_at = now()
  WHERE id = track_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.delete_old_activity_events()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    rows_affected INTEGER;
BEGIN
    DELETE FROM user_activity_events WHERE created_at < NOW() - INTERVAL '2 years';
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    DELETE FROM user_sessions WHERE started_at < NOW() - INTERVAL '2 years';
    DELETE FROM error_events WHERE created_at < NOW() - INTERVAL '1 year';
    RETURN rows_affected;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.docs_articles_search_vector_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'C');
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.docs_categories_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_publication_consent_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text;
begin
  if new.is_public is not true then
    return new;
  end if;

  -- Only evaluate when publication is being turned on, or when the recorded
  -- consenter changes. Unrelated updates to an already-public row (slug,
  -- issued_date) must not fail.
  if tg_op = 'UPDATE'
     and old.is_public is true
     and old.public_consent_given_by is not distinct from new.public_consent_given_by then
    return new;
  end if;

  select role into v_role from public.users where id = new.user_id;
  if v_role = 'superadmin' then
    return new;
  end if;

  -- Consent from someone other than the student (parent, org admin, advisor) is
  -- the normal path and is not second-guessed here; can_manage_privacy owns
  -- that question. This guard covers only the case the reset mishandled.
  if new.public_consent_given_by is null
     or new.public_consent_given_by = new.user_id then
    if public.is_minor_for_publication(new.user_id) then
      raise exception
        'Portfolio for user % cannot be published on self-consent: the student '
        'is a minor (or has no date of birth on file, which is treated as a '
        'minor). Publication requires consent from a parent or an accountable '
        'adult -- see utils/portfolio_access.py::find_approver.', new.user_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION public.expire_old_observer_invitations()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE observer_invitations
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < NOW();

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.finalize_subject_xp(p_user_id uuid, p_school_subject text, p_completion_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pending_xp INTEGER;
  v_new_total INTEGER;
BEGIN
  -- Get the pending XP for this subject
  SELECT pending_xp INTO v_pending_xp
  FROM user_subject_xp
  WHERE user_id = p_user_id AND school_subject = p_school_subject;

  IF v_pending_xp IS NULL OR v_pending_xp = 0 THEN
    RETURN 0;
  END IF;

  -- Move pending to finalized
  UPDATE user_subject_xp
  SET xp_amount = xp_amount + pending_xp,
      pending_xp = 0,
      updated_at = NOW()
  WHERE user_id = p_user_id AND school_subject = p_school_subject
  RETURNING xp_amount INTO v_new_total;

  -- Update the completion record
  UPDATE quest_task_completions
  SET diploma_status = 'finalized',
      finalized_at = NOW()
  WHERE id = p_completion_id;

  RETURN v_new_total;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.generate_portfolio_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    IF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.first_name || '-' || NEW.last_name, '[^a-zA-Z0-9-]', '-', 'g'));
    ELSIF NEW.display_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.display_name, '[^a-zA-Z0-9]', '-', 'g'));
    ELSIF NEW.email IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9]', '-', 'g'));
    ELSE
        base_slug := 'user-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;

    final_slug := base_slug;

    WHILE EXISTS(SELECT 1 FROM public.diplomas WHERE portfolio_slug = final_slug AND user_id != NEW.id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;

    -- is_public intentionally omitted: the column default (FALSE) decides.
    INSERT INTO public.diplomas (user_id, portfolio_slug)
    VALUES (NEW.id, final_slug)
    ON CONFLICT (user_id)
    DO UPDATE SET portfolio_slug = EXCLUDED.portfolio_slug
    WHERE public.diplomas.portfolio_slug IS NULL;

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_ai_review_queue_stats()
 RETURNS TABLE(pending_count bigint, approved_count bigint, rejected_count bigint, avg_quality_score numeric, avg_review_time_hours numeric)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE status = 'pending_review') as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        AVG(quality_score) as avg_quality_score,
        AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600) FILTER (WHERE reviewed_at IS NOT NULL) as avg_review_time_hours
    FROM ai_quest_review_queue;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_auth_user_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    RETURN auth.uid();
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_effective_role(user_record users)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
    -- Superadmin always returns superadmin
    IF user_record.role = 'superadmin' THEN
        RETURN 'superadmin';
    END IF;

    -- org_managed users use their org_role
    IF user_record.role = 'org_managed' AND user_record.org_role IS NOT NULL THEN
        RETURN user_record.org_role;
    END IF;

    -- Otherwise return platform role
    RETURN user_record.role;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_effective_role(user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    user_record RECORD;
BEGIN
    SELECT role, org_role, organization_id INTO user_record
    FROM public.users WHERE id = user_id;

    IF user_record IS NULL THEN
        RETURN NULL;
    END IF;

    IF user_record.role = 'superadmin' THEN
        RETURN 'superadmin';
    END IF;

    IF user_record.organization_id IS NULL THEN
        RETURN user_record.role;
    END IF;

    IF user_record.role = 'org_managed' AND user_record.org_role IS NOT NULL THEN
        RETURN user_record.org_role;
    END IF;

    RETURN 'student';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_engagement_summary(p_user_id uuid, p_quest_id uuid DEFAULT NULL::uuid, p_since date DEFAULT NULL::date)
 RETURNS TABLE(activity_date date, activity_count bigint, activity_types text[])
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since DATE;
BEGIN
  v_since := COALESCE(p_since, (CURRENT_DATE - INTERVAL '12 weeks')::DATE);

  RETURN QUERY
  WITH all_activities AS (
    SELECT
      completed_at::DATE AS act_date,
      'task_completed'::TEXT AS evt_type
    FROM quest_task_completions
    WHERE user_id = p_user_id
      AND completed_at >= v_since
      AND (p_quest_id IS NULL OR quest_id = p_quest_id)

    UNION ALL

    SELECT
      created_at::DATE AS act_date,
      event_type::TEXT AS evt_type
    FROM user_activity_events
    WHERE user_id = p_user_id
      AND event_type IN ('task_viewed', 'evidence_uploaded', 'tutor_message_sent', 'quest_viewed')
      AND created_at >= v_since
      AND (p_quest_id IS NULL OR event_data->>'quest_id' = p_quest_id::TEXT)

    UNION ALL

    SELECT
      COALESCE(le.event_date, le.created_at::DATE) AS act_date,
      'learning_moment'::TEXT AS evt_type
    FROM learning_events le
    LEFT JOIN user_quest_tasks uqt ON uqt.id = le.attached_task_id
    WHERE le.user_id = p_user_id
      AND COALESCE(le.event_date, le.created_at::DATE) >= v_since
      AND (p_quest_id IS NULL OR uqt.quest_id = p_quest_id)
  )
  SELECT
    a.act_date,
    COUNT(*)::BIGINT,
    ARRAY_AGG(DISTINCT a.evt_type)
  FROM all_activities a
  GROUP BY a.act_date
  ORDER BY a.act_date;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_latest_improvement_insights(limit_count integer DEFAULT 10)
 RETURNS TABLE(created_at timestamp with time zone, avg_performance_score numeric, trend_direction character varying, quality_change numeric, prompts_needing_optimization integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT
        created_at,
        avg_performance_score,
        trend_direction,
        quality_change,
        prompts_needing_optimization
    FROM ai_improvement_logs
    ORDER BY created_at DESC
    LIMIT limit_count;
$function$
;
CREATE OR REPLACE FUNCTION public.get_learning_rhythm_status(p_student_id uuid)
 RETURNS TABLE(status text, has_overdue_tasks boolean, has_recent_progress boolean, last_activity_date timestamp with time zone, overdue_task_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_has_progress BOOLEAN := FALSE;
    v_last_activity TIMESTAMPTZ;
BEGIN
    -- Check for recent progress (last 7 days)
    SELECT MAX(activity_date) INTO v_last_activity
    FROM (
        SELECT completed_at AS activity_date
        FROM public.quest_task_completions
        WHERE user_id = p_student_id
        AND completed_at > NOW() - INTERVAL '7 days'

        UNION ALL

        SELECT started_at AS activity_date
        FROM public.user_quests
        WHERE user_id = p_student_id
        AND started_at > NOW() - INTERVAL '7 days'
    ) activities;

    v_has_progress := (v_last_activity IS NOT NULL);

    -- Determine status (no deadlines table, so overdue is always false)
    IF v_has_progress THEN
        status := 'flow';
    ELSE
        status := 'needs_support';
    END IF;

    RETURN QUERY SELECT
        status,
        FALSE,
        v_has_progress,
        v_last_activity,
        0;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_moments_for_topic(p_user_id uuid, p_topic_type text, p_topic_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS SETOF learning_events
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT le.* FROM learning_events le
  JOIN learning_event_topics let ON let.learning_event_id = le.id
  WHERE le.user_id = p_user_id AND let.topic_type = p_topic_type AND let.topic_id = p_topic_id
  ORDER BY le.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$
;
CREATE OR REPLACE FUNCTION public.get_monthly_active_users()
 RETURNS TABLE(month date, active_users bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        DATE_TRUNC('month', al.created_at)::DATE AS month,
        COUNT(DISTINCT al.user_id) AS active_users
    FROM public.activity_log al
    WHERE al.created_at >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', al.created_at)
    ORDER BY month DESC;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_org_total_xp(org_id_param uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT COALESCE(SUM(total_xp), 0)
    FROM users
    WHERE organization_id = org_id_param;
$function$
;
CREATE OR REPLACE FUNCTION public.get_organization_analytics(p_org_id uuid)
 RETURNS TABLE(total_users bigint, total_completions bigint, total_xp bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  BEGIN
      RETURN QUERY
      SELECT
          (SELECT COUNT(*) FROM public.users u WHERE u.organization_id = p_org_id)::BIGINT,
          (SELECT COUNT(*) FROM public.quest_task_completions qtc
           JOIN public.users u ON qtc.user_id = u.id
           WHERE u.organization_id = p_org_id)::BIGINT,
          COALESCE((
              SELECT SUM(COALESCE(sx.xp_amount, 0))
              FROM public.user_skill_xp sx
              JOIN public.users u ON sx.user_id = u.id
              WHERE u.organization_id = p_org_id
          ), 0)::BIGINT;
  END;
  $function$
;
CREATE OR REPLACE FUNCTION public.get_parent_dependents(p_parent_id uuid)
 RETURNS TABLE(dependent_id uuid, dependent_name character varying, first_name character varying, last_name character varying, date_of_birth date, avatar_url text, promotion_eligible boolean, total_xp integer, active_quest_count integer, ai_features_enabled boolean, ai_chatbot_enabled boolean, ai_lesson_helper_enabled boolean, ai_task_generation_enabled boolean, email character varying)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    COALESCE(
      NULLIF(TRIM(u.display_name), ''),
      NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
      u.email,
      'Student'
    )::varchar,
    u.first_name,
    u.last_name,
    u.date_of_birth,
    u.avatar_url,
    public.is_promotion_eligible(u.id),
    COALESCE(u.total_xp, 0)::INTEGER,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.user_quests uq
      WHERE uq.user_id = u.id AND uq.status = 'active'
    ), 0),
    COALESCE(u.ai_features_enabled, FALSE),
    COALESCE(u.ai_chatbot_enabled, TRUE),
    COALESCE(u.ai_lesson_helper_enabled, TRUE),
    COALESCE(u.ai_task_generation_enabled, TRUE),
    u.email
  FROM public.users u
  WHERE u.id IN (
    SELECT id FROM public.users
    WHERE managed_by_parent_id = p_parent_id AND is_dependent = TRUE
    UNION
    SELECT student_user_id FROM public.parent_student_links
    WHERE parent_user_id = p_parent_id AND status = 'approved'
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_parent_for_minor(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_parent_id UUID;
BEGIN
  SELECT managed_by_parent_id INTO v_parent_id
  FROM users WHERE id = p_user_id AND managed_by_parent_id IS NOT NULL;

  IF v_parent_id IS NOT NULL THEN
    RETURN v_parent_id;
  END IF;

  SELECT parent_user_id INTO v_parent_id
  FROM parent_student_links
  WHERE student_user_id = p_user_id AND status IN ('approved', 'active')
  LIMIT 1;

  RETURN v_parent_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_performance_trend(days integer DEFAULT 30)
 RETURNS TABLE(date date, avg_score numeric, trend character varying)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT
        DATE(created_at) as date,
        AVG(avg_performance_score) as avg_score,
        MODE() WITHIN GROUP (ORDER BY trend_direction) as trend
    FROM ai_improvement_logs
    WHERE created_at >= NOW() - INTERVAL '1 day' * days
    GROUP BY DATE(created_at)
    ORDER BY date DESC;
$function$
;
CREATE OR REPLACE FUNCTION public.get_tutorial_quest_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT id FROM quests WHERE is_tutorial = TRUE LIMIT 1;
$function$
;
CREATE OR REPLACE FUNCTION public.get_unassigned_moments(p_user_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS SETOF learning_events
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT le.* FROM learning_events le
  WHERE le.user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM learning_event_topics let WHERE let.learning_event_id = le.id)
  ORDER BY le.created_at DESC LIMIT p_limit OFFSET p_offset;
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_org_id(user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    org_id uuid;
BEGIN
    SELECT organization_id INTO org_id FROM public.users WHERE id = user_id;
    RETURN org_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_organization(p_user_id uuid)
 RETURNS TABLE(organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT u.organization_id
  FROM public.users u
  WHERE u.id = p_user_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.get_user_total_xp(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(xp_amount) FROM public.user_skill_xp WHERE user_id = p_user_id),
        0
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.increment_message_usage(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO tutor_settings (user_id, messages_used_today, last_reset_date)
    VALUES (p_user_id, 1, CURRENT_DATE)
    ON CONFLICT (user_id)
    DO UPDATE SET
        messages_used_today = tutor_settings.messages_used_today + 1,
        updated_at = NOW();
END;
$function$
;
CREATE OR REPLACE FUNCTION public.increment_task_usage(task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    UPDATE public.quest_sample_tasks
    SET usage_count = usage_count + 1,
        updated_at = NOW()
    WHERE id = task_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.increment_track_moment_count(track_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE interest_tracks 
  SET moment_count = moment_count + 1,
      updated_at = now()
  WHERE id = track_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.increment_user_xp(p_user_id uuid, p_pillar text, p_amount integer)
 RETURNS TABLE(new_xp_amount integer, was_created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_existing_id UUID;
    v_new_amount INTEGER;
    v_was_created BOOLEAN := FALSE;
BEGIN
    -- Validate inputs
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id cannot be null';
    END IF;

    IF p_pillar IS NULL OR p_pillar NOT IN ('art', 'stem', 'wellness', 'communication', 'civics') THEN
        RAISE EXCEPTION 'pillar must be one of: art, stem, wellness, communication, civics';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be a positive integer';
    END IF;

    -- Try to update existing record first (most common case)
    UPDATE user_skill_xp
    SET
        xp_amount = xp_amount + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id AND pillar = p_pillar
    RETURNING id, xp_amount INTO v_existing_id, v_new_amount;

    -- If no row was updated, insert new record
    IF NOT FOUND THEN
        INSERT INTO user_skill_xp (user_id, pillar, xp_amount, updated_at)
        VALUES (p_user_id, p_pillar, p_amount, NOW())
        ON CONFLICT (user_id, pillar)
        DO UPDATE SET
            xp_amount = user_skill_xp.xp_amount + EXCLUDED.xp_amount,
            updated_at = NOW()
        RETURNING xp_amount INTO v_new_amount;

        v_was_created := TRUE;
    END IF;

    new_xp_amount := v_new_amount;
    was_created := v_was_created;
    RETURN NEXT;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.initialize_user_skills()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Minimal trigger function that doesn't reference tables
    RAISE NOTICE 'initialize_user_skills called for user: %', NEW.id;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.insert_curriculum_attachment(p_quest_id uuid, p_file_name text, p_file_url text, p_file_size_bytes integer, p_file_type text, p_uploaded_by uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result curriculum_attachments;
BEGIN
  INSERT INTO curriculum_attachments (quest_id, file_name, file_url, file_size_bytes, file_type, uploaded_by, organization_id)
  VALUES (p_quest_id, p_file_name, p_file_url, p_file_size_bytes, p_file_type, p_uploaded_by, p_organization_id)
  RETURNING * INTO result;
  
  RETURN row_to_json(result);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    eff_role TEXT;
BEGIN
    eff_role := public.get_effective_role(user_id);
    RETURN eff_role IN ('superadmin', 'org_admin');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_advisor_user(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    eff_role TEXT;
BEGIN
    eff_role := public.get_effective_role(user_id);
    RETURN eff_role IN ('advisor', 'superadmin', 'org_admin');
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    user_role text;
BEGIN
    -- First check JWT claims
    IF (auth.jwt() ->> 'role')::text = 'admin' THEN
        RETURN true;
    END IF;
    
    -- Then check users table (this won't cause recursion because SECURITY DEFINER bypasses RLS)
    SELECT role INTO user_role
    FROM public.users
    WHERE id = auth.uid();
    
    RETURN user_role = 'admin';
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_minor(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_dependent BOOLEAN;
  v_dob DATE;
BEGIN
  SELECT is_dependent, date_of_birth::DATE INTO v_is_dependent, v_dob
  FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN TRUE;      -- unknown user -> treat as minor
  END IF;

  IF v_is_dependent = TRUE THEN
    RETURN TRUE;
  END IF;

  IF v_dob IS NULL THEN
    RETURN TRUE;      -- unknown age -> minor (was FALSE)
  END IF;

  RETURN DATE_PART('year', AGE(CURRENT_DATE, v_dob)) < 18;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_minor_for_publication(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select case
       when u.is_dependent is true      then true
       when u.date_of_birth is null     then true   -- unknown age -> minor
       else ((current_date - u.date_of_birth)::numeric / 365.25) < 18
     end
     from public.users u
     where u.id = p_user_id),
    true)  -- no such user -> minor
$function$
;
CREATE OR REPLACE FUNCTION public.is_org_admin_user(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    eff_role TEXT;
BEGIN
    eff_role := public.get_effective_role(user_id);
    RETURN eff_role = 'org_admin';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_promotion_eligible(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  eligible_date DATE;
BEGIN
  SELECT promotion_eligible_at INTO eligible_date
  FROM public.users
  WHERE id = p_user_id AND is_dependent = TRUE;

  RETURN eligible_date IS NOT NULL AND eligible_date <= CURRENT_DATE;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.is_superadmin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = user_id AND role = 'superadmin'
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.log_observer_access(p_observer_id uuid, p_student_id uuid, p_action_type character varying, p_resource_type character varying DEFAULT NULL::character varying, p_resource_id uuid DEFAULT NULL::uuid, p_ip_address character varying DEFAULT NULL::character varying, p_user_agent text DEFAULT NULL::text, p_request_path text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO public.observer_access_audit (
        observer_id, student_id, action_type, resource_type, resource_id,
        ip_address, user_agent, request_path, metadata
    ) VALUES (
        p_observer_id, p_student_id, p_action_type, p_resource_type, p_resource_id,
        p_ip_address, p_user_agent, p_request_path, p_metadata
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.match_student_by_email(p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_student_id UUID;
BEGIN
    -- Find student by email (case-insensitive)
    SELECT id INTO v_student_id
    FROM users
    WHERE LOWER(email) = LOWER(p_email)
    AND role = 'student'
    LIMIT 1;

    RETURN v_student_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.organization_content_summary(p_org_id uuid)
 RETURNS TABLE(rel_name text, row_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN
    SELECT c.table_name AS t
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema
     AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('admin_audit_logs', 'organization_secrets')
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE organization_id = $1', r.t
    ) INTO n USING p_org_id;

    IF n > 0 THEN
      rel_name := r.t;
      row_count := n;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.parent_has_access_to_student(p_parent_id uuid, p_student_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.parent_student_links
        WHERE parent_user_id = p_parent_id
        AND student_user_id = p_student_id
        AND status = 'active'
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.quest_visible_to_user(quest_id_param uuid, user_id_param uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    user_org_id UUID;
    user_org_policy VARCHAR(50);
    quest_org_id UUID;
BEGIN
    -- Get user's organization and policy
    SELECT organization_id, organizations.quest_visibility_policy
    INTO user_org_id, user_org_policy
    FROM users
    LEFT JOIN organizations ON users.organization_id = organizations.id
    WHERE users.id = user_id_param;

    -- If user has no organization, deny access
    IF user_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get quest's organization (NULL = global Optio quest)
    SELECT organization_id INTO quest_org_id
    FROM quests WHERE id = quest_id_param;

    -- Apply visibility policy logic
    IF user_org_policy = 'all_optio' THEN
        -- See global Optio quests (NULL) + same organization quests
        RETURN (quest_org_id IS NULL OR quest_org_id = user_org_id);

    ELSIF user_org_policy = 'curated' THEN
        -- See curated quests + same organization quests
        RETURN (
            quest_org_id = user_org_id
            OR EXISTS (
                SELECT 1 FROM organization_quest_access
                WHERE organization_id = user_org_id
                AND quest_id = quest_id_param
            )
        );

    ELSIF user_org_policy = 'private_only' THEN
        -- See only same organization quests
        RETURN quest_org_id = user_org_id;

    ELSE
        -- Unknown policy: deny access
        RETURN FALSE;
    END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.recalculate_track_moment_count(p_track_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE interest_tracks SET moment_count = (
    SELECT COUNT(DISTINCT learning_event_id) FROM learning_event_topics
    WHERE topic_type = 'topic' AND topic_id = p_track_id
  ), updated_at = now() WHERE id = p_track_id;
$function$
;
CREATE OR REPLACE FUNCTION public.recalculate_user_skill_xp(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    DELETE FROM public.user_skill_xp WHERE user_id = p_user_id;
    
    INSERT INTO public.user_skill_xp (user_id, pillar, xp_amount)
    SELECT 
        p_user_id,
        qt.pillar,
        SUM(qt.xp_amount)::INTEGER
    FROM public.user_quests uq
    JOIN public.user_quest_tasks uqt ON uqt.user_quest_id = uq.id
    JOIN public.quest_tasks qt ON qt.id = uqt.quest_task_id
    WHERE uq.user_id = p_user_id 
    AND uq.completed_at IS NOT NULL
    AND qt.pillar IS NOT NULL
    GROUP BY qt.pillar
    ON CONFLICT (user_id, pillar) DO UPDATE
    SET xp_amount = EXCLUDED.xp_amount;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reorder_evidence_blocks(p_task_completion_id uuid, p_new_order integer[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Minimal implementation without table dependencies
    RAISE NOTICE 'reorder_evidence_blocks called for task: %', p_task_completion_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reset_daily_message_limits()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    reset_count INTEGER;
BEGIN
    UPDATE tutor_settings
    SET messages_used_today = 0,
        last_reset_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE last_reset_date < CURRENT_DATE;

    GET DIAGNOSTICS reset_count = ROW_COUNT;
    RETURN reset_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.search_docs_articles(search_query text)
 RETURNS TABLE(id uuid, title text, slug text, summary text, category_id uuid, rank real)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.slug,
    a.summary,
    a.category_id,
    ts_rank(a.search_vector, to_tsquery('english', search_query)) AS rank
  FROM docs_articles a
  WHERE a.is_published = true
    AND a.search_vector @@ to_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT 20;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_quest_invitation_responded_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    IF NEW.status != OLD.status AND OLD.status = 'pending' THEN
        NEW.responded_at = NOW();
    END IF;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_auth_user_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Depth > 1: the public.users row is being removed BY the auth.users
    -- delete (cleanup_user_data, or the ON DELETE CASCADE off auth.users).
    -- Deleting auth.users again from in here re-enters a tuple the current
    -- command already has open, which Postgres refuses with 27000 -- and the
    -- whole deletion fails. The auth row is already going; nothing to sync.
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;

    -- Reached only when something deleted public.users on its own.
    DELETE FROM auth.users WHERE id = OLD.id;

    RAISE LOG 'Synced deletion of user % from auth.users', OLD.id;

    RETURN OLD;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_is_org_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
                                                                                                                                                                                                            BEGIN
                                                                                                                                                                                                                NEW.is_org_admin :=
                                                                                                                                                                                                                        NEW.role = 'org_admin'
                                                                                                                                                                                                                                OR NEW.org_role = 'org_admin'
                                                                                                                                                                                                                                        OR COALESCE(NEW.org_roles ? 'org_admin', FALSE);
                                                                                                                                                                                                                                            RETURN NEW;
                                                                                                                                                                                                                                            END;
                                                                                                                                                                                                                                            $function$
;
CREATE OR REPLACE FUNCTION public.update_advisor_checkins_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_advisor_notes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_ai_generation_performance_metrics()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    UPDATE ai_generation_metrics m
    SET
        completion_rate = perf.completion_rate,
        average_rating = perf.avg_rating,
        engagement_score = perf.engagement_score,
        last_performance_update = NOW()
    FROM (
        SELECT
            q.id as quest_id,
            COALESCE(
                COUNT(uq.completed_at)::DECIMAL / NULLIF(COUNT(uq.quest_id), 0),
                0
            ) as completion_rate,
            AVG(r.rating) as avg_rating,
            COALESCE(
                COUNT(tc.id)::DECIMAL / NULLIF(COUNT(uq.quest_id), 0) / NULLIF(
                    (SELECT COUNT(*) FROM quest_tasks_archived WHERE quest_id = q.id),
                    0
                ),
                0
            ) as engagement_score
        FROM quests q
        LEFT JOIN user_quests uq ON uq.quest_id = q.id
        LEFT JOIN quest_ratings r ON r.quest_id = q.id
        LEFT JOIN quest_task_completions tc ON tc.quest_id = q.id
        WHERE q.source = 'ai_generated' OR q.source = 'custom'
        GROUP BY q.id
    ) perf
    WHERE m.quest_id = perf.quest_id
    AND m.approved = TRUE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_ai_metrics_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_ai_quest_review_queue_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_announcements_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_class_attendance_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_contact_submissions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_conversation_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tutor_conversations
        SET message_count = message_count + 1,
            last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_course(p_id uuid, p_data jsonb)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE courses SET
    title = CASE WHEN p_data ? 'title' THEN (p_data->>'title')::varchar ELSE title END,
    description = CASE WHEN p_data ? 'description' THEN p_data->>'description' ELSE description END,
    cover_image_url = CASE WHEN p_data ? 'cover_image_url' THEN p_data->>'cover_image_url' ELSE cover_image_url END,
    status = CASE WHEN p_data ? 'status' THEN (p_data->>'status')::varchar ELSE status END,
    visibility = CASE WHEN p_data ? 'visibility' THEN (p_data->>'visibility')::varchar ELSE visibility END,
    navigation_mode = CASE WHEN p_data ? 'navigation_mode' THEN (p_data->>'navigation_mode')::varchar ELSE navigation_mode END,
    slug = CASE WHEN p_data ? 'slug' THEN p_data->>'slug' ELSE slug END,
    badge_id = CASE WHEN p_data ? 'badge_id' THEN (p_data->>'badge_id')::uuid ELSE badge_id END,
    intro_content = CASE WHEN p_data ? 'intro_content' THEN p_data->'intro_content' ELSE intro_content END,
    learning_outcomes = CASE WHEN p_data ? 'learning_outcomes' THEN p_data->'learning_outcomes' ELSE learning_outcomes END,
    final_deliverable = CASE WHEN p_data ? 'final_deliverable' THEN p_data->>'final_deliverable' ELSE final_deliverable END,
    educational_value = CASE WHEN p_data ? 'educational_value' THEN p_data->>'educational_value' ELSE educational_value END,
    parent_guidance = CASE WHEN p_data ? 'parent_guidance' THEN p_data->'parent_guidance' ELSE parent_guidance END,
    guidance_level = CASE WHEN p_data ? 'guidance_level' THEN p_data->>'guidance_level' ELSE guidance_level END,
    academic_alignment = CASE WHEN p_data ? 'academic_alignment' THEN p_data->>'academic_alignment' ELSE academic_alignment END,
    age_range = CASE WHEN p_data ? 'age_range' THEN p_data->>'age_range' ELSE age_range END,
    estimated_hours = CASE WHEN p_data ? 'estimated_hours' THEN (p_data->>'estimated_hours')::integer ELSE estimated_hours END,
    updated_at = now()
  WHERE id = p_id
  RETURNING to_json(courses.*);
$function$
;
CREATE OR REPLACE FUNCTION public.update_course_plan_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_course_refine_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_curriculum_attachments_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_curriculum_lesson_progress_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_curriculum_lesson_search_vector()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content::TEXT, '')), 'C');
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_curriculum_lessons_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_curriculum_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_evidence_document_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Minimal trigger function with secure search_path
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_evidence_report_configs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_group_conversation_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_group_last_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE group_conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.message_content, 100)
    WHERE id = NEW.group_id;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_learning_events_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_org_classes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_org_invitations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_philosophy_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$
;
CREATE OR REPLACE FUNCTION public.update_quest_invitations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_quest_quality_score()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    UPDATE public.ai_generated_quests
    SET quality_score = (
        SELECT AVG(rating)::NUMERIC
        FROM public.quest_ratings
        WHERE quest_id = NEW.quest_id
    )
    WHERE published_quest_id = NEW.quest_id;
    
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_quest_templates_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_services_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_user_mastery(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Return default mastery level without table dependencies
    RETURN 'Explorer';
END;
$function$
;
CREATE OR REPLACE FUNCTION public.update_user_mastery_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    INSERT INTO public.user_mastery (user_id, total_xp, mastery_level, last_updated)
    VALUES (
        NEW.user_id,
        public.get_user_total_xp(NEW.user_id),
        public.calculate_mastery_level(public.get_user_total_xp(NEW.user_id)),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_xp = public.get_user_total_xp(NEW.user_id),
        mastery_level = public.calculate_mastery_level(public.get_user_total_xp(NEW.user_id)),
        last_updated = NOW();

    RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.upsert_search_miss(p_query text, p_normalized text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO docs_search_misses (query, normalized_query)
    VALUES (p_query, p_normalized)
    ON CONFLICT (normalized_query) DO UPDATE SET
        miss_count = docs_search_misses.miss_count + 1,
        last_searched_at = now();
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_org_roles(roles jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    valid_roles TEXT[] := ARRAY['student', 'parent', 'advisor', 'org_admin',
                                    'campus_coordinator', 'observer'];
                                        role_value TEXT;
                                        BEGIN
                                            IF roles IS NULL THEN
                                                    RETURN TRUE;
                                                        END IF;
                                                            IF jsonb_typeof(roles) <> 'array' THEN
                                                                    RETURN FALSE;
                                                                        END IF;
                                                                            FOR role_value IN SELECT jsonb_array_elements_text(roles)
                                                                                LOOP
                                                                                        IF NOT (role_value = ANY(valid_roles)) THEN
                                                                                                    RETURN FALSE;
                                                                                                            END IF;
                                                                                                                END LOOP;
                                                                                                                    RETURN TRUE;
                                                                                                                    END;
                                                                                                                    $function$
;
CREATE OR REPLACE FUNCTION public.verify_parent_student_access(p_parent_id uuid, p_student_id uuid)
 RETURNS TABLE(has_access boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN QUERY
    SELECT EXISTS (
        SELECT 1 FROM public.parent_student_links
        WHERE parent_user_id = p_parent_id
          AND student_user_id = p_student_id
          AND status IN ('approved', 'active')

        UNION

        SELECT 1 FROM public.users
        WHERE id = p_student_id
          AND is_dependent = TRUE
          AND managed_by_parent_id = p_parent_id
    );
END;
$function$
;

--
-- VIEWS (1)
--
CREATE OR REPLACE VIEW public.announcement_read_stats AS
 SELECT id AS announcement_id,
    NULLIF(( SELECT count(*) AS count
           FROM announcement_recipients r
          WHERE r.announcement_id = a.id), 0) AS recipient_count,
    ( SELECT count(*) AS count
           FROM announcement_reads rd
          WHERE rd.announcement_id = a.id) AS read_count
   FROM announcements a;

--
-- MATERIALIZED VIEWS (0)
--
-- (none)

--
-- TRIGGERS (44)
--
CREATE TRIGGER advisor_checkins_updated_at BEFORE UPDATE ON advisor_checkins FOR EACH ROW EXECUTE FUNCTION update_advisor_checkins_updated_at();
CREATE TRIGGER advisor_notes_updated_at BEFORE UPDATE ON advisor_notes FOR EACH ROW EXECUTE FUNCTION update_advisor_notes_updated_at();
CREATE TRIGGER ai_quest_review_queue_updated_at BEFORE UPDATE ON ai_quest_review_queue FOR EACH ROW EXECUTE FUNCTION update_ai_quest_review_queue_updated_at();
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_announcements_updated_at();
CREATE TRIGGER update_automation_sequences_updated_at BEFORE UPDATE ON automation_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER contact_submissions_updated_at BEFORE UPDATE ON contact_submissions FOR EACH ROW EXECUTE FUNCTION update_contact_submissions_updated_at();
CREATE TRIGGER update_course_plan_sessions_timestamp BEFORE UPDATE ON course_plan_sessions FOR EACH ROW EXECUTE FUNCTION update_course_plan_sessions_updated_at();
CREATE TRIGGER update_course_refine_sessions_timestamp BEFORE UPDATE ON course_refine_sessions FOR EACH ROW EXECUTE FUNCTION update_course_refine_sessions_updated_at();
CREATE TRIGGER trigger_update_curriculum_attachments_updated_at BEFORE UPDATE ON curriculum_attachments FOR EACH ROW EXECUTE FUNCTION update_curriculum_attachments_updated_at();
CREATE TRIGGER trigger_update_curriculum_lesson_progress_updated_at BEFORE UPDATE ON curriculum_lesson_progress FOR EACH ROW EXECUTE FUNCTION update_curriculum_lesson_progress_updated_at();
CREATE TRIGGER trigger_update_curriculum_lesson_search_vector BEFORE INSERT OR UPDATE OF title, description, content ON curriculum_lessons FOR EACH ROW EXECUTE FUNCTION update_curriculum_lesson_search_vector();
CREATE TRIGGER trigger_update_curriculum_lessons_updated_at BEFORE UPDATE ON curriculum_lessons FOR EACH ROW EXECUTE FUNCTION update_curriculum_lessons_updated_at();
CREATE TRIGGER trigger_update_curriculum_settings_updated_at BEFORE UPDATE ON curriculum_settings FOR EACH ROW EXECUTE FUNCTION update_curriculum_settings_updated_at();
CREATE TRIGGER trg_publication_consent_provenance BEFORE INSERT OR UPDATE ON diplomas FOR EACH ROW EXECUTE FUNCTION enforce_publication_consent_provenance();
CREATE TRIGGER docs_articles_search_update BEFORE INSERT OR UPDATE OF title, content, summary ON docs_articles FOR EACH ROW EXECUTE FUNCTION docs_articles_search_vector_update();
CREATE TRIGGER docs_categories_updated_at_trigger BEFORE UPDATE ON docs_categories FOR EACH ROW EXECUTE FUNCTION docs_categories_updated_at();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER evidence_report_configs_updated_at_trigger BEFORE UPDATE ON evidence_report_configs FOR EACH ROW EXECUTE FUNCTION update_evidence_report_configs_updated_at();
CREATE TRIGGER update_group_conversations_updated_at BEFORE UPDATE ON group_conversations FOR EACH ROW EXECUTE FUNCTION update_group_conversation_timestamp();
CREATE TRIGGER update_group_last_message_trigger AFTER INSERT ON group_messages FOR EACH ROW EXECUTE FUNCTION update_group_last_message();
CREATE TRIGGER update_learning_event_evidence_blocks_updated_at BEFORE UPDATE ON learning_event_evidence_blocks FOR EACH ROW EXECUTE FUNCTION update_learning_events_updated_at();
CREATE TRIGGER update_learning_events_updated_at BEFORE UPDATE ON learning_events FOR EACH ROW EXECUTE FUNCTION update_learning_events_updated_at();
CREATE TRIGGER org_classes_updated_at_trigger BEFORE UPDATE ON org_classes FOR EACH ROW EXECUTE FUNCTION update_org_classes_updated_at();
CREATE TRIGGER org_invitations_updated_at BEFORE UPDATE ON org_invitations FOR EACH ROW EXECUTE FUNCTION update_org_invitations_updated_at();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_parent_links_updated_at BEFORE UPDATE ON parent_student_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER philosophy_edges_updated_at BEFORE UPDATE ON philosophy_edges FOR EACH ROW EXECUTE FUNCTION update_philosophy_updated_at();
CREATE TRIGGER philosophy_nodes_updated_at BEFORE UPDATE ON philosophy_nodes FOR EACH ROW EXECUTE FUNCTION update_philosophy_updated_at();
CREATE TRIGGER set_prior_learning_records_updated_at BEFORE UPDATE ON prior_learning_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER quest_invitations_responded_at BEFORE UPDATE ON quest_invitations FOR EACH ROW EXECUTE FUNCTION set_quest_invitation_responded_at();
CREATE TRIGGER quest_invitations_updated_at BEFORE UPDATE ON quest_invitations FOR EACH ROW EXECUTE FUNCTION update_quest_invitations_updated_at();
CREATE TRIGGER trigger_quests_updated_at BEFORE UPDATE ON quests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_student_weekly_xp_goals_updated_at BEFORE UPDATE ON student_weekly_xp_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_calculate_transfer_total_xp BEFORE INSERT OR UPDATE OF subject_xp ON transfer_credits FOR EACH ROW EXECUTE FUNCTION calculate_transfer_credits_total_xp();
CREATE TRIGGER trigger_update_conversation_stats AFTER INSERT ON tutor_messages FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();
CREATE TRIGGER trigger_update_user_mastery AFTER INSERT OR UPDATE ON user_skill_xp FOR EACH ROW EXECUTE FUNCTION update_user_mastery_trigger();
CREATE TRIGGER trigger_user_skill_xp_updated_at BEFORE UPDATE ON user_skill_xp FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_user_subject_xp_updated_at BEFORE UPDATE ON user_subject_xp FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER evidence_documents_updated_at BEFORE UPDATE ON user_task_evidence_documents FOR EACH ROW EXECUTE FUNCTION update_evidence_document_updated_at();
CREATE TRIGGER generate_slug_trigger AFTER INSERT OR UPDATE OF first_name, last_name, display_name ON users FOR EACH ROW EXECUTE FUNCTION generate_portfolio_slug();
CREATE TRIGGER sync_is_org_admin_trigger BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION sync_is_org_admin();
CREATE TRIGGER trigger_check_parental_consent BEFORE INSERT OR UPDATE OF date_of_birth ON users FOR EACH ROW EXECUTE FUNCTION check_parental_consent_requirement();
CREATE TRIGGER trigger_sync_auth_user_deletion AFTER DELETE ON users FOR EACH ROW EXECUTE FUNCTION sync_auth_user_deletion();

--
-- ROW LEVEL SECURITY (241)
--
ALTER TABLE public.academy_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_masquerade_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_quest_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_task_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bounties FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bounty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bounty_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_advisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_discussion_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_refine_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_review_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_calendar_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_funnel_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_funnel_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_lesson_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diploma_review_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diplomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diplomas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_search_misses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_document_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_document_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_report_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_report_parent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_item_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_event_evidence_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_event_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_grade_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_pending_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_email_relays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observer_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observer_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observer_invitation_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observer_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observer_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oea_compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oea_credit_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oea_credit_grade_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oea_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oea_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oea_help_video_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_course_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_quest_group_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_quest_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_course_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_quest_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_secrets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_digest_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parental_consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_connect_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_connection_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.philosophy_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.philosophy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poe_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poe_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poe_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_visibility_reset_20260801 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_visibility_reset_20260801 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_visibility_reset_20260802 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_visibility_reset_20260802 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.prior_learning_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prior_learning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_visibility_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_personalization_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_sample_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refresh_token_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_warnings_documentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_age_exception_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_assignment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_attendance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_billing_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_billing_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sis_carpool_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_clp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_curriculum ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_curriculum_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_curriculum_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_curriculum_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_curriculum_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_engagement_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_enrollment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_family_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_form_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_learning_day_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_lost_found ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_onboarding_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_quickbooks_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_recognition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_recognition_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_recurring_tuition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_registration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_resource_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_saved_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_schedule_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_secure_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_staff_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_student_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_student_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_student_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_student_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_submission_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_xp_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_planned_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_records_destination ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_weekly_xp_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_transfer_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treehouse_kiosk_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treehouse_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treehouse_showcase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treehouse_showcase_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treehouse_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_safety_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_tier_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutorial_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mastery FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_xp FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_subject_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_evidence_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_evidence_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_award_failures ENABLE ROW LEVEL SECURITY;

--
-- POLICIES (302)
--
CREATE POLICY account_deletion_log_select ON public.account_deletion_log AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY "School admins can view their org audit logs" ON public.admin_audit_logs AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = admin_audit_logs.organization_id) AND ((users.is_org_admin = true) OR ((users.role)::text = 'admin'::text))))));
CREATE POLICY "System can insert audit logs" ON public.admin_audit_logs AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "Admins can insert masquerade logs" ON public.admin_masquerade_log AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Admins can update masquerade logs" ON public.admin_masquerade_log AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Admins can view all masquerade logs" ON public.admin_masquerade_log AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY admin_delete_checkins ON public.advisor_checkins AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY advisor_create_checkins ON public.advisor_checkins AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((advisor_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'advisor'::text])))))));
CREATE POLICY advisor_update_own_checkins ON public.advisor_checkins AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY advisor_view_own_checkins ON public.advisor_checkins AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'advisor'::text])))))));
CREATE POLICY advisor_notes_advisor_delete ON public.advisor_notes AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY advisor_notes_advisor_insert ON public.advisor_notes AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'advisor'::text])))))));
CREATE POLICY advisor_notes_advisor_select ON public.advisor_notes AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY advisor_notes_advisor_update ON public.advisor_notes AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY "Admins can manage advisor assignments" ON public.advisor_student_assignments AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Advisors can view their assignments" ON public.advisor_student_assignments AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY ai_generated_quests_admin_all ON public.ai_generated_quests AS PERMISSIVE FOR ALL TO PUBLIC
  USING (is_admin());
CREATE POLICY ai_generation_jobs_admin_all ON public.ai_generation_jobs AS PERMISSIVE FOR ALL TO PUBLIC
  USING (is_admin());
CREATE POLICY "Superadmin full access to ai_prompt_components" ON public.ai_prompt_components AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY admin_all_access ON public.ai_quest_review_queue AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY ai_seeds_admin_all ON public.ai_seeds AS PERMISSIVE FOR ALL TO PUBLIC
  USING (is_admin());
CREATE POLICY "Users can view cached tasks" ON public.ai_task_cache AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);
CREATE POLICY ai_usage_logs_superadmin_all ON public.ai_usage_logs AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Users can mark announcements as read" ON public.announcement_reads AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own read records" ON public.announcement_reads AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own announcement reads" ON public.announcement_reads AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Advisors and admins can create announcements" ON public.announcements AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid) = author_id) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = announcements.organization_id) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'educator'::text, 'admin'::text])))))));
CREATE POLICY "Authors and admins can delete announcements" ON public.announcements AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((( SELECT auth.uid() AS uid) = author_id) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = announcements.organization_id) AND (((users.role)::text = 'admin'::text) OR (users.is_org_admin = true)))))));
CREATE POLICY "Authors can update their announcements" ON public.announcements AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = author_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = author_id));
CREATE POLICY "Users can view announcements from their organization" ON public.announcements AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = announcements.organization_id)))));
CREATE POLICY "Admins can manage automation sequences" ON public.automation_sequences AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));
CREATE POLICY "Service role full access on bounties" ON public.bounties AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Service role full access on bounty_claims" ON public.bounty_claims AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Students can create claims" ON public.bounty_claims AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((student_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Students can update own claims" ON public.bounty_claims AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((student_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((student_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Students can view own claims" ON public.bounty_claims AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((student_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM bounties b
  WHERE ((b.id = bounty_claims.bounty_id) AND (b.poster_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Posters can create reviews" ON public.bounty_reviews AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((reviewer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (bounty_claims bc
     JOIN bounties b ON ((b.id = bc.bounty_id)))
  WHERE ((bc.id = bounty_reviews.claim_id) AND (b.poster_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Reviewers can view own reviews" ON public.bounty_reviews AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((reviewer_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM bounty_claims bc
  WHERE ((bc.id = bounty_reviews.claim_id) AND (bc.student_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Service role full access on bounty_reviews" ON public.bounty_reviews AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY buddies_insert_own ON public.buddies AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY buddies_select_own ON public.buddies AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY buddies_superadmin ON public.buddies AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY buddies_update_own ON public.buddies AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY class_advisors_admin_policy ON public.class_advisors AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM (org_classes oc
     JOIN users u ON ((u.id = ( SELECT auth.uid() AS uid))))
  WHERE ((oc.id = class_advisors.class_id) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id = oc.organization_id) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY class_advisors_self_policy ON public.class_advisors AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((advisor_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY class_enrollments_admin_policy ON public.class_enrollments AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM (org_classes oc
     JOIN users u ON ((u.id = ( SELECT auth.uid() AS uid))))
  WHERE ((oc.id = class_enrollments.class_id) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id = oc.organization_id) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY class_enrollments_advisor_policy ON public.class_enrollments AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM class_advisors ca
  WHERE ((ca.class_id = class_enrollments.class_id) AND (ca.advisor_id = ( SELECT auth.uid() AS uid)) AND (ca.is_active = true)))));
CREATE POLICY class_enrollments_student_policy ON public.class_enrollments AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((student_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY class_quests_admin_policy ON public.class_quests AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM (org_classes oc
     JOIN users u ON ((u.id = ( SELECT auth.uid() AS uid))))
  WHERE ((oc.id = class_quests.class_id) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id = oc.organization_id) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY class_quests_advisor_policy ON public.class_quests AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM class_advisors ca
  WHERE ((ca.class_id = class_quests.class_id) AND (ca.advisor_id = ( SELECT auth.uid() AS uid)) AND (ca.is_active = true)))));
CREATE POLICY class_quests_student_policy ON public.class_quests AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM class_enrollments ce
  WHERE ((ce.class_id = class_quests.class_id) AND (ce.student_id = ( SELECT auth.uid() AS uid)) AND ((ce.status)::text = 'active'::text)))));
CREATE POLICY "Allow service role all operations" ON public.consultation_requests AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Allow service role inserts" ON public.consultation_requests AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "Superadmins can read contact submissions" ON public.contact_submissions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Superadmins can update contact submissions" ON public.contact_submissions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Service role full access on content_reports" ON public.content_reports AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users can file reports" ON public.content_reports AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((reporter_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own reports" ON public.content_reports AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((reporter_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY course_enrollments_insert ON public.course_enrollments AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((((user_id = ( SELECT auth.uid() AS uid)) AND (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (((courses.status)::text = 'published'::text) AND (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid)))))))) OR (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text, 'superadmin'::text])))))))));
CREATE POLICY course_enrollments_select ON public.course_enrollments AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text, 'superadmin'::text])))))))));
CREATE POLICY course_enrollments_update ON public.course_enrollments AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text, 'superadmin'::text])))))))))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text, 'superadmin'::text])))))))));
CREATE POLICY teachers_admins_delete_enrollments ON public.course_enrollments AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text]))))))));
CREATE POLICY "Users can create own generation jobs" ON public.course_generation_jobs AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own generation jobs" ON public.course_generation_jobs AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own generation jobs" ON public.course_generation_jobs AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Advisors can manage own plan sessions" ON public.course_plan_sessions AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (((users.role)::text = 'advisor'::text) OR (((users.role)::text = 'org_managed'::text) AND (users.org_role = 'advisor'::text))))))));
CREATE POLICY "Org admins can manage org plan sessions" ON public.course_plan_sessions AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = course_plan_sessions.organization_id) AND (((users.role)::text = 'org_managed'::text) AND (users.org_role = 'org_admin'::text))))));
CREATE POLICY "Superadmin can manage all plan sessions" ON public.course_plan_sessions AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Anyone can view course tasks" ON public.course_quest_tasks AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);
CREATE POLICY "Only admins can manage course tasks" ON public.course_quest_tasks AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY creators_admins_manage_course_quests ON public.course_quests AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((course_id IN ( SELECT courses.id
   FROM courses
  WHERE ((courses.created_by = ( SELECT auth.uid() AS uid)) OR (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])))))))))
  WITH CHECK ((course_id IN ( SELECT courses.id
   FROM courses
  WHERE ((courses.created_by = ( SELECT auth.uid() AS uid)) OR (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])))))))));
CREATE POLICY users_view_course_quests ON public.course_quests AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Superadmin can manage refine sessions" ON public.course_refine_sessions AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY admins_teachers_create_courses ON public.courses AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text]))))));
CREATE POLICY creators_admins_delete_courses ON public.courses AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text])))))));
CREATE POLICY creators_admins_update_courses ON public.courses AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text])))))))
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text])))))));
CREATE POLICY users_view_org_courses ON public.courses AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY credit_ledger_insert_policy ON public.credit_ledger AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY credit_ledger_select_policy ON public.credit_ledger AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'admin'::text])))))));
CREATE POLICY curriculum_lesson_progress_delete_own ON public.curriculum_lesson_progress AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY curriculum_lesson_progress_insert_own ON public.curriculum_lesson_progress AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY curriculum_lesson_progress_select ON public.curriculum_lesson_progress AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_lesson_progress.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = ANY (ARRAY['org_admin'::text, 'advisor'::text])))))))));
CREATE POLICY curriculum_lesson_progress_update_own ON public.curriculum_lesson_progress AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY curriculum_lesson_tasks_admin_all ON public.curriculum_lesson_tasks AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_lesson_tasks.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY curriculum_lesson_tasks_select ON public.curriculum_lesson_tasks AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY curriculum_lessons_admin_all ON public.curriculum_lessons AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_lessons.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY curriculum_lessons_select ON public.curriculum_lessons AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((((( SELECT auth.uid() AS uid) IS NOT NULL) AND (is_published = true)) OR (created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_lessons.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = 'org_admin'::text))))))));
CREATE POLICY curriculum_settings_admin_all ON public.curriculum_settings AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_settings.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY curriculum_settings_select ON public.curriculum_settings AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY curriculum_uploads_all ON public.curriculum_uploads AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))) OR ((uploaded_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'org_admin'::text, 'superadmin'::text]))))))));
CREATE POLICY curriculum_uploads_org_admin_select ON public.curriculum_uploads AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'org_admin'::text)))));
CREATE POLICY "Service role full access on device_tokens" ON public.device_tokens AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users can delete own tokens" ON public.device_tokens AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can register tokens" ON public.device_tokens AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update own tokens" ON public.device_tokens AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own tokens" ON public.device_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Advisors read assigned student rounds" ON public.diploma_review_rounds AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((completion_id IN ( SELECT qtc.id
   FROM (quest_task_completions qtc
     JOIN advisor_student_assignments asa ON ((asa.student_id = qtc.user_id)))
  WHERE ((asa.advisor_id = ( SELECT auth.uid() AS uid)) AND (asa.is_active = true)))));
CREATE POLICY "Service role full access to review rounds" ON public.diploma_review_rounds AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Students read own review rounds" ON public.diploma_review_rounds AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((completion_id IN ( SELECT quest_task_completions.id
   FROM quest_task_completions
  WHERE (quest_task_completions.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY diplomas_insert ON public.diplomas AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY diplomas_update ON public.diplomas AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY "Users can send messages" ON public.direct_messages AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((sender_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update messages they received" ON public.direct_messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((recipient_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((recipient_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY direct_messages_select ON public.direct_messages AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((sender_id = ( SELECT auth.uid() AS uid)) OR (recipient_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY docs_articles_public_read ON public.docs_articles AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((is_published = true));
CREATE POLICY docs_articles_service_full ON public.docs_articles AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY docs_categories_public_read ON public.docs_categories AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((is_published = true));
CREATE POLICY docs_categories_service_full ON public.docs_categories AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Service role full access on docs_search_misses" ON public.docs_search_misses AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Admins can manage email templates" ON public.email_templates AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));
CREATE POLICY "Users can delete blocks from their own documents" ON public.evidence_document_blocks AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can insert blocks into their own documents" ON public.evidence_document_blocks AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can update blocks in their own documents" ON public.evidence_document_blocks AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY evidence_report_configs_delete_own ON public.evidence_report_configs AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_configs_insert_own ON public.evidence_report_configs AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_configs_select_own ON public.evidence_report_configs AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_configs_update_own ON public.evidence_report_configs AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_parent_approvals_select_parent ON public.evidence_report_parent_approvals AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((parent_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_parent_approvals_select_student ON public.evidence_report_parent_approvals AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((report_config_id IN ( SELECT evidence_report_configs.id
   FROM evidence_report_configs
  WHERE (evidence_report_configs.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY evidence_report_parent_approvals_update_parent ON public.evidence_report_parent_approvals AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((parent_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Service role manages feed views" ON public.feed_item_views AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users insert own feed views" ON public.feed_item_views AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((viewer_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users read own feed views" ON public.feed_item_views AS PERMISSIVE FOR SELECT TO authenticated
  USING ((viewer_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can create own share tokens" ON public.feed_share_tokens AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = created_by));
CREATE POLICY "Users can delete own share tokens" ON public.feed_share_tokens AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = created_by));
CREATE POLICY "Users can view own share tokens" ON public.feed_share_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((( SELECT auth.uid() AS uid) = created_by) OR (( SELECT auth.uid() AS uid) = student_id)));
CREATE POLICY "Authorized users can create groups" ON public.group_conversations AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('advisor'::character varying)::text, ('org_admin'::character varying)::text, ('superadmin'::character varying)::text]))))));
CREATE POLICY "Group admins can update groups" ON public.group_conversations AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_conversations.id) AND (group_members.user_id = ( SELECT auth.uid() AS uid)) AND ((group_members.role)::text = 'admin'::text)))));
CREATE POLICY "Users can view their groups" ON public.group_conversations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_conversations.id) AND (group_members.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Group admins can add members" ON public.group_members AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM group_members group_members_1
  WHERE ((group_members_1.group_id = group_members_1.group_id) AND (group_members_1.user_id = ( SELECT auth.uid() AS uid)) AND ((group_members_1.role)::text = 'admin'::text)))));
CREATE POLICY "Group admins can remove members" ON public.group_members AS PERMISSIVE FOR DELETE TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM group_members admin_check
  WHERE ((admin_check.group_id = group_members.group_id) AND (admin_check.user_id = ( SELECT auth.uid() AS uid)) AND ((admin_check.role)::text = 'admin'::text))))));
CREATE POLICY "Members can update their read status" ON public.group_members AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view group members" ON public.group_members AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM group_members my_membership
  WHERE ((my_membership.group_id = group_members.group_id) AND (my_membership.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Members can send messages" ON public.group_messages AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_messages.group_id) AND (group_members.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can delete their messages" ON public.group_messages AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((sender_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view group messages" ON public.group_messages AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_messages.group_id) AND (group_members.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Service role has full access to interest_tracks" ON public.interest_tracks AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users can create own tracks" ON public.interest_tracks AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own tracks" ON public.interest_tracks AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own tracks" ON public.interest_tracks AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own tracks" ON public.interest_tracks AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own evidence blocks" ON public.learning_event_evidence_blocks AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM learning_events
  WHERE ((learning_events.id = learning_event_evidence_blocks.learning_event_id) AND (learning_events.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can insert own evidence blocks" ON public.learning_event_evidence_blocks AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM learning_events
  WHERE ((learning_events.id = learning_event_evidence_blocks.learning_event_id) AND (learning_events.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can update own evidence blocks" ON public.learning_event_evidence_blocks AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM learning_events
  WHERE ((learning_events.id = learning_event_evidence_blocks.learning_event_id) AND (learning_events.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view own evidence blocks" ON public.learning_event_evidence_blocks AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM learning_events
  WHERE ((learning_events.id = learning_event_evidence_blocks.learning_event_id) AND (learning_events.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can delete own event topics" ON public.learning_event_topics AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((learning_event_id IN ( SELECT learning_events.id
   FROM learning_events
  WHERE (learning_events.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert own event topics" ON public.learning_event_topics AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((learning_event_id IN ( SELECT learning_events.id
   FROM learning_events
  WHERE (learning_events.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view own event topics" ON public.learning_event_topics AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((learning_event_id IN ( SELECT learning_events.id
   FROM learning_events
  WHERE (learning_events.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can delete own learning events" ON public.learning_events AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own learning events" ON public.learning_events AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own learning events" ON public.learning_events AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own learning events" ON public.learning_events AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own reflections" ON public.lesson_reflections AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own reflections" ON public.lesson_reflections AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own reflections" ON public.lesson_reflections AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_grade_sync_select_own ON public.lms_grade_sync AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_integrations_delete_own ON public.lms_integrations AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_integrations_insert_own ON public.lms_integrations AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_integrations_select_own ON public.lms_integrations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_integrations_update_own ON public.lms_integrations AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_sessions_select_own ON public.lms_sessions AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Service role only" ON public.login_attempts AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Users can create conversations" ON public.message_conversations AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((participant_1_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update their conversations" ON public.message_conversations AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((participant_1_id = ( SELECT auth.uid() AS uid)) OR (participant_2_id = ( SELECT auth.uid() AS uid))))
  WITH CHECK (((participant_1_id = ( SELECT auth.uid() AS uid)) OR (participant_2_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY message_conversations_select ON public.message_conversations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((participant_1_id = ( SELECT auth.uid() AS uid)) OR (participant_2_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY "Service role full access on notification_preferences" ON public.notification_preferences AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "System can create notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "Users can delete their own notifications" ON public.notifications AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY admin_insert_audit_logs ON public.observer_access_audit AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text]))))) OR (( SELECT auth.uid() AS uid) IS NULL)));
CREATE POLICY observer_access_audit_select ON public.observer_access_audit AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((observer_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));
CREATE POLICY observer_comments_insert_by_observer ON public.observer_comments AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid) = observer_id) AND (EXISTS ( SELECT 1
   FROM observer_student_links
  WHERE ((observer_student_links.observer_id = ( SELECT auth.uid() AS uid)) AND (observer_student_links.student_id = observer_comments.student_id) AND (observer_student_links.can_comment = true))))));
CREATE POLICY observer_comments_select_related ON public.observer_comments AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((( SELECT auth.uid() AS uid) = observer_id) OR (( SELECT auth.uid() AS uid) = student_id) OR (( SELECT auth.uid() AS uid) IN ( SELECT observer_student_links.observer_id
   FROM observer_student_links
  WHERE (observer_student_links.student_id = observer_comments.student_id)))));
CREATE POLICY creator_delete_observer_invitation_students ON public.observer_invitation_students AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM observer_invitations oi
  WHERE ((oi.id = observer_invitation_students.invitation_id) AND (oi.invited_by_user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY creator_insert_observer_invitation_students ON public.observer_invitation_students AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM observer_invitations oi
  WHERE ((oi.id = observer_invitation_students.invitation_id) AND (oi.invited_by_user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY creator_read_observer_invitation_students ON public.observer_invitation_students AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM observer_invitations oi
  WHERE ((oi.id = observer_invitation_students.invitation_id) AND (oi.invited_by_user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY parent_read_observer_invitation_students ON public.observer_invitation_students AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = observer_invitation_students.student_id) AND (u.managed_by_parent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM parent_student_links psl
  WHERE ((psl.student_user_id = observer_invitation_students.student_id) AND (psl.parent_user_id = ( SELECT auth.uid() AS uid)) AND ((psl.status)::text = 'approved'::text))))));
CREATE POLICY student_read_own_invitation_students ON public.observer_invitation_students AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((student_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY superadmin_all_observer_invitation_students ON public.observer_invitation_students AS PERMISSIVE FOR ALL TO PUBLIC
  USING (private.is_superadmin(( SELECT auth.uid() AS uid)));
CREATE POLICY observer_invitations_delete_own ON public.observer_invitations AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_invitations_insert_own ON public.observer_invitations AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_invitations_select_own ON public.observer_invitations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((( SELECT auth.uid() AS uid) = student_id) OR (observer_email = (( SELECT users.email
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))::text)));
CREATE POLICY observer_invitations_update_own ON public.observer_invitations AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_links_delete_by_student ON public.observer_student_links AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_links_insert_by_student ON public.observer_student_links AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_links_select_own ON public.observer_student_links AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((( SELECT auth.uid() AS uid) = observer_id) OR (( SELECT auth.uid() AS uid) = student_id)));
CREATE POLICY org_classes_advisor_policy ON public.org_classes AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM class_advisors ca
  WHERE ((ca.class_id = org_classes.id) AND (ca.advisor_id = ( SELECT auth.uid() AS uid)) AND (ca.is_active = true)))));
CREATE POLICY org_classes_org_admin_policy ON public.org_classes AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id = org_classes.organization_id) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY "Org admins can create org invitations" ON public.org_invitations AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid) = invited_by) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = org_invitations.organization_id) AND ((users.role)::text = ANY (ARRAY['org_admin'::text, 'superadmin'::text])))))));
CREATE POLICY "Org admins can delete org invitations" ON public.org_invitations AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = org_invitations.organization_id) AND ((users.role)::text = ANY (ARRAY['org_admin'::text, 'superadmin'::text]))))));
CREATE POLICY "Org admins can update org invitations" ON public.org_invitations AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = org_invitations.organization_id) AND ((users.role)::text = ANY (ARRAY['org_admin'::text, 'superadmin'::text]))))));
CREATE POLICY org_invitations_select ON public.org_invitations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (((users.role)::text = 'superadmin'::text) OR (((users.role)::text = ANY (ARRAY['org_admin'::text, 'superadmin'::text])) AND (users.organization_id = org_invitations.organization_id)))))));
CREATE POLICY org_admins_can_manage_course_access ON public.organization_course_access AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.is_org_admin = true) OR ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text, 'org_admin'::text])))))));
CREATE POLICY users_can_view_org_course_access ON public.organization_course_access AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY org_admins_can_manage_quest_access ON public.organization_quest_access AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.is_org_admin = true) OR ((users.role)::text = 'admin'::text))))));
CREATE POLICY users_can_view_org_quest_access ON public.organization_quest_access AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY org_admin_update_own_org ON public.organizations AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((private.is_org_admin_user(( SELECT auth.uid() AS uid)) AND (id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY organizations_select ON public.organizations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((is_active = true) OR (private.is_org_admin_user(( SELECT auth.uid() AS uid)) AND (id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))) OR private.is_superadmin(( SELECT auth.uid() AS uid))));
CREATE POLICY superadmin_can_manage_organizations ON public.organizations AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) IN ( SELECT users.id
   FROM users
  WHERE (((users.role)::text = 'admin'::text) AND ((users.email)::text = 'tannerbowman@gmail.com'::text)))));
CREATE POLICY parent_links_update_student ON public.parent_student_links AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = student_user_id));
CREATE POLICY parent_student_links_admin_manage ON public.parent_student_links AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY parent_student_links_select ON public.parent_student_links AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((parent_user_id = ( SELECT auth.uid() AS uid)) OR (student_user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY parental_consent_log_select ON public.parental_consent_log AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY password_reset_attempts_service_role_only ON public.password_reset_attempts AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Service role can manage password reset tokens" ON public.password_reset_tokens AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Public can read visible philosophy edges" ON public.philosophy_edges AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((is_visible = true));
CREATE POLICY "Public can read visible philosophy nodes" ON public.philosophy_nodes AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((is_visible = true));
CREATE POLICY "Anyone can submit interest" ON public.promo_interest AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (true);
CREATE POLICY parent_respond_to_visibility_requests ON public.public_visibility_requests AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((parent_user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((parent_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY public_visibility_requests_select ON public.public_visibility_requests AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((student_user_id = ( SELECT auth.uid() AS uid)) OR (parent_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['superadmin'::text, 'org_admin'::text])))))));
CREATE POLICY service_insert_visibility_requests ON public.public_visibility_requests AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid) IS NULL) OR (student_user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Users can create own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Advisors can create quest invitations" ON public.quest_invitations AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid) = advisor_id) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = quest_invitations.organization_id) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'school_admin'::text, 'superadmin'::text, 'admin'::text, 'educator'::text])))))));
CREATE POLICY "Advisors can delete their quest invitations" ON public.quest_invitations AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = advisor_id));
CREATE POLICY quest_invitations_select ON public.quest_invitations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY quest_invitations_update ON public.quest_invitations AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid))))
  WITH CHECK (((advisor_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Users can create their own sessions" ON public.quest_personalization_sessions AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own sessions" ON public.quest_personalization_sessions AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own sessions" ON public.quest_personalization_sessions AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Anyone can view sample tasks" ON public.quest_sample_tasks AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);
CREATE POLICY "Only admins can manage sample tasks" ON public.quest_sample_tasks AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Only admins can manage quest sources" ON public.quest_sources AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Public read access to quest sources" ON public.quest_sources AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);
CREATE POLICY admin_advisor_access_completions ON public.quest_task_completions AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((private.is_superadmin(( SELECT auth.uid() AS uid)) OR private.is_advisor_user(( SELECT auth.uid() AS uid))));
CREATE POLICY quest_task_completions_own_insert ON public.quest_task_completions AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY quest_task_completions_own_read ON public.quest_task_completions AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY advisor_create_template_tasks ON public.quest_template_tasks AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((private.is_superadmin(( SELECT auth.uid() AS uid)) OR private.is_advisor_user(( SELECT auth.uid() AS uid))));
CREATE POLICY advisor_delete_template_tasks ON public.quest_template_tasks AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((private.is_superadmin(( SELECT auth.uid() AS uid)) OR private.is_advisor_user(( SELECT auth.uid() AS uid))));
CREATE POLICY advisor_update_template_tasks ON public.quest_template_tasks AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((private.is_superadmin(( SELECT auth.uid() AS uid)) OR private.is_advisor_user(( SELECT auth.uid() AS uid))));
CREATE POLICY authenticated_read_template_tasks ON public.quest_template_tasks AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY "Quests are viewable by everyone" ON public.quests AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((is_active = true));
CREATE POLICY admin_full_access_quests ON public.quests AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((private.is_superadmin(( SELECT auth.uid() AS uid)) OR (private.is_org_admin_user(( SELECT auth.uid() AS uid)) AND ((organization_id = ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = ( SELECT auth.uid() AS uid)))) OR (organization_id IS NULL)))));
CREATE POLICY quests_update ON public.quests AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.is_org_admin = true) OR ((users.role)::text = 'admin'::text)))))))
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.is_org_admin = true) OR ((users.role)::text = 'admin'::text)))))));
CREATE POLICY users_can_create_quests ON public.quests AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Service role can manage refresh token families" ON public.refresh_token_families AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Only admins can insert role changes" ON public.role_change_log AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Only admins can view role changes" ON public.role_change_log AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Admin can delete scheduled jobs" ON public.scheduled_jobs AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'educator'::text]))))));
CREATE POLICY "Admin can insert scheduled jobs" ON public.scheduled_jobs AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'educator'::text]))))));
CREATE POLICY "Admin can update scheduled jobs" ON public.scheduled_jobs AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'educator'::text]))))));
CREATE POLICY "Admin can view all scheduled jobs" ON public.scheduled_jobs AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'educator'::text]))))));
CREATE POLICY "Only admins can manage security documentation" ON public.security_warnings_documentation AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY site_settings_admin_all ON public.site_settings AS PERMISSIVE FOR ALL TO PUBLIC
  USING (is_admin());
CREATE POLICY site_settings_select_all ON public.site_settings AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);
CREATE POLICY student_access_logs_select ON public.student_access_logs AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((student_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR (student_id IN ( SELECT users.id
   FROM users
  WHERE ((users.managed_by_parent_id = ( SELECT auth.uid() AS uid)) AND (users.is_dependent = true))))));
CREATE POLICY system_insert_access_logs ON public.student_access_logs AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "Service role full access on student_wallets" ON public.student_wallets AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Superadmins can manage all feedback" ON public.task_feedback AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Users can view feedback on own completions" ON public.task_feedback AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM quest_task_completions qtc
  WHERE ((qtc.id = task_feedback.completion_id) AND (qtc.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can delete their own task steps" ON public.task_steps AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert their own task steps" ON public.task_steps AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own task steps" ON public.task_steps AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own task steps" ON public.task_steps AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY parent_view_child_transcript_shares ON public.transcript_share_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = transcript_share_tokens.user_id) AND (u.managed_by_parent_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM parent_student_links l
  WHERE ((l.student_user_id = transcript_share_tokens.user_id) AND (l.parent_user_id = auth.uid()) AND ((l.status)::text = ANY ((ARRAY['approved'::character varying, 'active'::character varying])::text[])))))));
CREATE POLICY student_view_own_transcript_shares ON public.transcript_share_tokens AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins can delete transfer credits" ON public.transfer_credits AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))));
CREATE POLICY "Admins can insert transfer credits" ON public.transfer_credits AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))));
CREATE POLICY "Admins can read all transfer credits" ON public.transfer_credits AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))));
CREATE POLICY "Admins can update transfer credits" ON public.transfer_credits AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))));
CREATE POLICY "Users can view own transfer credits" ON public.transfer_credits AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can create own conversations" ON public.tutor_conversations AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own conversations" ON public.tutor_conversations AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own conversations" ON public.tutor_conversations AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can create messages in own conversations" ON public.tutor_messages AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tutor_conversations
  WHERE ((tutor_conversations.id = tutor_messages.conversation_id) AND (tutor_conversations.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view own messages" ON public.tutor_messages AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM tutor_conversations
  WHERE ((tutor_conversations.id = tutor_messages.conversation_id) AND (tutor_conversations.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view own safety reports" ON public.tutor_safety_reports AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own settings" ON public.tutor_settings AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "All users can view tier limits" ON public.tutor_tier_limits AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (true);
CREATE POLICY "Service role can modify tier limits" ON public.tutor_tier_limits AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Admins can view tutorial verification logs" ON public.tutorial_verification_log AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));
CREATE POLICY admin_activity_select_all ON public.user_activity_events AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY service_activity_insert ON public.user_activity_events AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY user_activity_select_own ON public.user_activity_events AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Service role full access on user_blocks" ON public.user_blocks AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users manage own blocks" ON public.user_blocks AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((blocker_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((blocker_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert their own tasks" ON public.user_quest_tasks AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own tasks" ON public.user_quest_tasks AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own tasks" ON public.user_quest_tasks AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY admin_full_access_user_quest_tasks ON public.user_quest_tasks AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((private.is_superadmin(( SELECT auth.uid() AS uid)) OR (private.is_org_admin_user(( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = user_quest_tasks.user_id) AND (u.organization_id = ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid))))))))));
CREATE POLICY "Users can enroll in quests" ON public.user_quests AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update their own quest enrollments" ON public.user_quests AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view their own quest enrollments" ON public.user_quests AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Service role can manage skill details" ON public.user_skill_details AS PERMISSIVE FOR ALL TO PUBLIC
  USING (((( SELECT auth.role() AS role) = 'service_role'::text) OR (( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "User skill details insertable by system" ON public.user_skill_details AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "User skill details updatable by system" ON public.user_skill_details AS PERMISSIVE FOR UPDATE TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users can view their own skill details" ON public.user_skill_details AS PERMISSIVE FOR SELECT TO PUBLIC
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Service role manages subject xp" ON public.user_subject_xp AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users read own subject xp" ON public.user_subject_xp AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can delete their own evidence documents" ON public.user_task_evidence_documents AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert their own evidence documents" ON public.user_task_evidence_documents AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own evidence documents" ON public.user_task_evidence_documents AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY parent_delete_dependents ON public.users AS PERMISSIVE FOR DELETE TO PUBLIC
  USING ((managed_by_parent_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY users_admin_all ON public.users AS PERMISSIVE FOR ALL TO PUBLIC
  USING ((private.is_superadmin(( SELECT auth.uid() AS uid)) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text)));
CREATE POLICY users_insert_consolidated ON public.users AS PERMISSIVE FOR INSERT TO PUBLIC
  WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR ((is_dependent = true) AND (managed_by_parent_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY users_select_consolidated ON public.users AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.role() AS role) = 'service_role'::text) OR private.is_superadmin(( SELECT auth.uid() AS uid)) OR (private.is_org_admin_user(( SELECT auth.uid() AS uid)) AND (organization_id = private.get_user_org_id(( SELECT auth.uid() AS uid)))) OR (managed_by_parent_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY users_update_consolidated ON public.users AS PERMISSIVE FOR UPDATE TO PUBLIC
  USING (((id = ( SELECT auth.uid() AS uid)) OR (private.is_org_admin_user(( SELECT auth.uid() AS uid)) AND (organization_id = private.get_user_org_id(( SELECT auth.uid() AS uid))) AND (id <> ( SELECT auth.uid() AS uid)) AND ((role)::text <> 'superadmin'::text)) OR (managed_by_parent_id = ( SELECT auth.uid() AS uid))))
  WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR (private.is_org_admin_user(( SELECT auth.uid() AS uid)) AND (organization_id = private.get_user_org_id(( SELECT auth.uid() AS uid))) AND (id <> ( SELECT auth.uid() AS uid)) AND ((role)::text <> 'superadmin'::text)) OR (managed_by_parent_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Service role full access on xp_award_failures" ON public.xp_award_failures AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

--
-- GRANTS (table level) (698)
--
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.academy_enrollments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.academy_enrollments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.academy_enrollments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.account_deletion_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.account_deletion_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.account_deletion_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_audit_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_audit_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_audit_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_masquerade_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_masquerade_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.admin_masquerade_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_checkins TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_checkins TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_checkins TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_notes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_notes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_notes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_student_assignments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_student_assignments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.advisor_student_assignments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_generated_quests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_generated_quests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_generated_quests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_generation_jobs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_generation_jobs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_generation_jobs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_prompt_components TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_prompt_components TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_prompt_components TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_quest_review_queue TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_quest_review_queue TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_quest_review_queue TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_seeds TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_seeds TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_seeds TO service_role;
GRANT SELECT, UPDATE, USAGE ON public.ai_seeds_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON public.ai_seeds_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON public.ai_seeds_id_seq TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_task_cache TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_task_cache TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_task_cache TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_usage_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_usage_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ai_usage_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.announcement_read_stats TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.announcement_reads TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.announcement_reads TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.announcement_reads TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.announcement_recipients TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.announcements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.announcements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.announcements TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.automation_sequences TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.automation_sequences TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.automation_sequences TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bounties TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bounty_claims TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bounty_claims TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bounty_claims TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bounty_reviews TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bounty_reviews TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bounty_reviews TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.buddies TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.buddies TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.buddies TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bug_reports TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bug_reports TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.bug_reports TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_advisors TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_advisors TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_advisors TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_discussion_posts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_discussion_posts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_discussion_posts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_enrollments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_enrollments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_enrollments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_materials TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_materials TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_materials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_meetings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_meetings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_meetings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_prerequisites TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_prerequisites TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_prerequisites TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_quests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_quests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.class_quests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.consultation_requests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.consultation_requests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.consultation_requests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contact_submissions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contact_submissions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.contact_submissions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.content_reports TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.content_reports TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.content_reports TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_enrollments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_enrollments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_enrollments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_generation_jobs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_generation_jobs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_generation_jobs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_plan_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_plan_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_plan_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_quest_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_quest_tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_quest_tasks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_quests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_quests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_quests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_refine_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_refine_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.course_refine_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.courses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.courses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.courses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_ledger TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_ledger TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_ledger TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_review_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_review_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_review_messages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_calendar_bookings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_calendar_bookings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_calendar_bookings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_email_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_email_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_email_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnel_memberships TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnel_memberships TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnel_memberships TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnel_steps TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnel_steps TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnel_steps TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnels TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnels TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_funnels TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_leads TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_leads TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_leads TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_sends TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_sends TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_sends TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_suppressions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_suppressions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.crm_suppressions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_attachments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lesson_progress TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lesson_progress TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lesson_progress TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lesson_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lesson_tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lesson_tasks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lessons TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lessons TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_lessons TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_uploads TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_uploads TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.curriculum_uploads TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.device_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.device_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.device_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.diploma_review_rounds TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.diploma_review_rounds TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.diploma_review_rounds TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.diplomas TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.direct_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.direct_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.direct_messages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_articles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_articles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_articles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_categories TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_search_misses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_search_misses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.docs_search_misses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.email_templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.email_templates TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.email_templates TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.emergency_contacts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.emergency_contacts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.emergency_contacts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.evidence_document_blocks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.evidence_report_configs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.evidence_report_configs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.evidence_report_configs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.evidence_report_parent_approvals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.evidence_report_parent_approvals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.evidence_report_parent_approvals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_highlights TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_highlights TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_highlights TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_item_views TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_item_views TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_item_views TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_share_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_share_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.feed_share_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_conversations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_conversations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_conversations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_members TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.group_messages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.household_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.household_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.household_members TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.households TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.households TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.households TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.interest_tracks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.interest_tracks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.interest_tracks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_event_evidence_blocks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_event_evidence_blocks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_event_evidence_blocks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_event_topics TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_event_topics TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_event_topics TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.learning_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lesson_reflections TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lesson_reflections TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lesson_reflections TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_grade_sync TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_grade_sync TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_grade_sync TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_integrations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_integrations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_integrations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lms_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.login_attempts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.login_attempts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.login_attempts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_auth_codes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_auth_codes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_auth_codes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_nonces TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_nonces TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_nonces TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_pending_launches TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_pending_launches TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_pending_launches TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_registrations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_registrations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.lti_registrations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.message_conversations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.message_conversations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.message_conversations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.message_email_relays TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.message_reactions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.message_reactions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.message_reactions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notification_preferences TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notification_preferences TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notification_preferences TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.notifications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_access_audit TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_access_audit TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_access_audit TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_comments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_comments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_comments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_invitation_students TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_invitation_students TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_invitation_students TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_invitations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_invitations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_invitations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_student_links TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_student_links TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.observer_student_links TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_compliance_alerts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_compliance_alerts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_compliance_alerts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credit_evidence TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credit_evidence TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credit_evidence TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credit_grade_periods TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credit_grade_periods TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credit_grade_periods TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credits TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credits TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_credits TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_enrollments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_enrollments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_enrollments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.oea_help_video_views TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_classes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_classes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_classes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_course_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_course_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_course_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_invitations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_invitations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_invitations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_kiosk_devices TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_kiosk_devices TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_kiosk_devices TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_quest_group_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_quest_group_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_quest_group_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_quest_groups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_quest_groups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_quest_groups TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_resources TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_resources TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.org_resources TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_course_access TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_course_access TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_course_access TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_quest_access TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_quest_access TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_quest_access TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organization_secrets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.organizations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.parent_digest_sends TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.parent_student_links TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.parent_student_links TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.parent_student_links TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.parental_consent_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.parental_consent_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.parental_consent_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.password_reset_attempts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.password_reset_attempts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.password_reset_attempts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.password_reset_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.password_reset_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.password_reset_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_comments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_comments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_comments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connect_codes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connect_codes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connect_codes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connection_approvals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connection_approvals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connection_approvals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connections TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connections TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.peer_connections TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.philosophy_edges TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.philosophy_edges TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.philosophy_edges TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.philosophy_nodes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.philosophy_nodes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.philosophy_nodes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.phone_verification_codes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.phone_verification_codes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.phone_verification_codes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.planned_credits TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.planned_credits TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.planned_credits TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_cohorts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_cohorts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_cohorts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_participants TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_participants TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_participants TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_signups TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_signups TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.poe_signups TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.portfolio_visibility_reset_20260801 TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.portfolio_visibility_reset_20260802 TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prior_learning_evidence TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prior_learning_evidence TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prior_learning_evidence TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prior_learning_records TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prior_learning_records TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.prior_learning_records TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.promo_interest TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.promo_interest TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.promo_interest TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.public_visibility_requests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.public_visibility_requests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.public_visibility_requests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.push_subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.push_subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.push_subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_invitations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_invitations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_invitations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_personalization_sessions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_personalization_sessions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_personalization_sessions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_sample_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_sample_tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_sample_tasks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_sources TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_sources TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_sources TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_task_completions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_task_completions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_task_completions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_template_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_template_tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quest_template_tasks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.quests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.refresh_token_families TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.refresh_token_families TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.refresh_token_families TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.registrations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.registrations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.registrations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.role_change_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.role_change_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.role_change_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.scheduled_jobs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.scheduled_jobs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.scheduled_jobs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.school_enrollments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.school_enrollments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.school_enrollments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_warnings_documentation TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_warnings_documentation TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.security_warnings_documentation TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_age_exception_requests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_age_exception_requests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_age_exception_requests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_announcements TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_announcements TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_announcements TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_assignment_templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_assignment_templates TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_assignment_templates TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_attendance TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_attendance TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_attendance TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_attendance_alerts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_attendance_alerts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_attendance_alerts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_billing_audit TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_carpool_posts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_carpool_posts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_carpool_posts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_clp_records TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_clp_records TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_clp_records TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_classes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_classes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_classes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_courses TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_courses TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_courses TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_materials TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_materials TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_materials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_quests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_quests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_curriculum_quests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_discount_rules TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_discount_rules TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_discount_rules TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_engagement_alerts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_engagement_alerts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_engagement_alerts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_enrollment_waitlist TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_enrollment_waitlist TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_enrollment_waitlist TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_event_rsvps TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_event_rsvps TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_event_rsvps TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_family_directives TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_family_directives TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_family_directives TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_comments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_comments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_comments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_submissions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_submissions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_submissions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_templates TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_form_templates TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_installments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_installments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_installments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_invoice_line_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_invoice_line_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_invoice_line_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_invoices TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_invoices TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_invoices TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_learning_day_selections TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_learning_day_selections TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_learning_day_selections TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_lost_found TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_lost_found TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_lost_found TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_onboarding_assignments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_onboarding_assignments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_onboarding_assignments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_onboarding_templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_onboarding_templates TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_onboarding_templates TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_plans TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_plans TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_plans TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_records TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_records TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_records TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_reminders TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_reminders TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_payment_reminders TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_quickbooks_sync_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_quickbooks_sync_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_quickbooks_sync_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recognition TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recognition TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recognition TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recognition_comments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recognition_comments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recognition_comments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recurring_tuition TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recurring_tuition TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_recurring_tuition TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_registration_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_registration_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_registration_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_registrations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_registrations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_registrations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_resource_acks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_resource_acks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_resource_acks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_saved_payment_methods TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_saved_payment_methods TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_saved_payment_methods TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_schedule_submissions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_schedule_submissions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_schedule_submissions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_secure_documents TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_secure_documents TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_secure_documents TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_assignments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_assignments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_assignments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_profiles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_training TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_training TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_staff_training TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_assignments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_assignments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_assignments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_goals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_goals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_goals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_materials TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_materials TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_materials TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_records TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_records TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_student_records TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_submission_reviews TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_submission_reviews TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_submission_reviews TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_time_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_time_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_time_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_waitlist_entries TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_waitlist_entries TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_waitlist_entries TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_xp_adjustments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_xp_adjustments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.sis_xp_adjustments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.site_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.site_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.site_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_access_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_access_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_access_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_planned_absences TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_planned_absences TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_planned_absences TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_records_destination TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_records_destination TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_records_destination TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_wallets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_wallets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_wallets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_weekly_xp_goals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_weekly_xp_goals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.student_weekly_xp_goals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.task_feedback TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.task_feedback TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.task_feedback TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.task_steps TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.task_steps TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.task_steps TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_overrides TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_overrides TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_overrides TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_share_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_share_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_share_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_transfer_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_transfer_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transcript_transfer_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transfer_credits TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transfer_credits TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.transfer_credits TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_kiosk_devices TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_kiosk_devices TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_kiosk_devices TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_pins TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_pins TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_pins TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_showcase_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_showcase_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_showcase_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_showcase_participants TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_showcase_participants TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_showcase_participants TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_signals TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_signals TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.treehouse_signals TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_conversations TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_conversations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_conversations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_messages TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_messages TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_safety_reports TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_safety_reports TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_safety_reports TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_tier_limits TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_tier_limits TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutor_tier_limits TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutorial_verification_log TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutorial_verification_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.tutorial_verification_log TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_activity_events TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_activity_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_activity_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_blocks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_blocks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_blocks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_mastery TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_quest_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_quest_tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_quest_tasks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_quests TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_quests TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_quests TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_skill_details TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_skill_details TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_skill_details TO service_role;
GRANT SELECT, UPDATE, USAGE ON public.user_skill_details_id_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON public.user_skill_details_id_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON public.user_skill_details_id_seq TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_skill_xp TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_subject_xp TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_subject_xp TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_subject_xp TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.user_task_evidence_documents TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.users TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.xp_award_failures TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.xp_award_failures TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.xp_award_failures TO service_role;

--
-- GRANTS (column level) (2)
--
GRANT SELECT (id, name, slug, quest_visibility_policy, branding_config, is_active, created_at, updated_at, ai_features_enabled, ai_chatbot_enabled, ai_lesson_helper_enabled, ai_task_generation_enabled, course_visibility_policy, timezone, accreditation_source) ON public.organizations TO anon;
GRANT SELECT (id, name, slug, quest_visibility_policy, branding_config, is_active, created_at, updated_at, ai_features_enabled, ai_chatbot_enabled, ai_lesson_helper_enabled, ai_task_generation_enabled, course_visibility_policy, timezone, accreditation_source) ON public.organizations TO authenticated;

--
-- DEFAULT PRIVILEGES (18)
--
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO anon;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO authenticated;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLES TO service_role;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;
-- (platform-provisioned; postgres cannot set these) ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;

--
-- COMMENTS (316)
--
COMMENT ON COLUMN public.account_deletion_log.user_id IS 'ID of the deleted user. Intentionally NOT a foreign key: this audit row outlives the user row it describes.';
COMMENT ON COLUMN public.advisor_checkins.quest_notes IS 'Quest-specific notes for this check-in. Structure: [{ quest_id: uuid, notes: text }]';
COMMENT ON COLUMN public.ai_usage_logs.estimated_cost IS 'Estimated cost in USD based on token counts';
COMMENT ON COLUMN public.ai_usage_logs.prompt_hash IS 'SHA256 hash of prompt for cache hit analysis';
COMMENT ON COLUMN public.announcements.source_announcement_id IS 'The sis_announcements board post this send came from, when it was published via the Community Hub composer. NULL for sends from the SIS Messaging page.';
COMMENT ON COLUMN public.bounties.platform_fee_cents IS 'Platform fee charged to sponsor in cents. Only set for sponsored bounties.';
COMMENT ON COLUMN public.bounties.sponsored_reward IS 'For sponsored bounties: {type, description, value, sponsor_name, sponsor_logo_url}.';
COMMENT ON COLUMN public.bounty_claims.evidence IS 'Submission evidence: {text, media_urls[], links[]}';
COMMENT ON COLUMN public.class_enrollments.status IS 'active = enrolled, completed = met xp_threshold, withdrawn = removed from class';
COMMENT ON COLUMN public.class_quests.due_date IS 'Optional due date shown to the class''s students (badge + agenda). Informational only; does not hide the quest. Gated by org feature flag due_dates.';
COMMENT ON COLUMN public.class_quests.publish_at IS 'Optional scheduled time at which this quest becomes visible to the class''s students. NULL = visible now. Future = hidden from students, shown to teachers. Gated by org feature flag scheduled_publish.';
COMMENT ON COLUMN public.class_quests.sequence_order IS 'Display order for quests within the class';
COMMENT ON COLUMN public.consultation_requests.child_age IS 'Optional - child age field (legacy)';
COMMENT ON COLUMN public.consultation_requests.preferred_times IS 'Optional - preferred times field (legacy)';
COMMENT ON COLUMN public.course_enrollments.current_quest_id IS 'The quest the student is currently working on';
COMMENT ON COLUMN public.course_enrollments.status IS 'active = in progress, completed = finished all required quests, dropped = student withdrew';
COMMENT ON COLUMN public.course_quests.custom_title IS 'Optional override for quest title within this course';
COMMENT ON COLUMN public.course_quests.intro_content IS 'Optional intro content specific to this quest in this course';
COMMENT ON COLUMN public.course_quests.sequence_order IS 'Order in which quests appear (1, 2, 3, ...)';
COMMENT ON COLUMN public.course_quests.xp_threshold IS 'Minimum XP students must have earned before accessing this project. 0 or NULL means no requirement (auto-unlocked for first project).';
COMMENT ON COLUMN public.courses.academic_alignment IS 'How course content aligns with traditional academic standards';
COMMENT ON COLUMN public.courses.age_range IS 'Target age range or grade level for the course';
COMMENT ON COLUMN public.courses.credit_amount IS 'Credits awarded on full completion (e.g., 0.50 for a half-credit class)';
COMMENT ON COLUMN public.courses.credit_subject IS 'Subject area the class maps to (e.g., Science, Math, Language Arts)';
COMMENT ON COLUMN public.courses.estimated_hours IS 'Estimated total hours to complete the course';
COMMENT ON COLUMN public.courses.final_deliverable IS 'Description of the tangible end product students will create';
COMMENT ON COLUMN public.courses.guidance_level IS 'Amount of support provided: guided, moderate, or independent';
COMMENT ON COLUMN public.courses.intro_content IS 'Rich content (text, images, videos) shown before course starts';
COMMENT ON COLUMN public.courses.learning_outcomes IS 'JSON array of skills/competencies students will develop';
COMMENT ON COLUMN public.courses.navigation_mode IS 'sequential = must complete in order, freeform = can jump around';
COMMENT ON COLUMN public.courses.slug IS 'URL-friendly slug for public course pages (e.g., picture-book-creation)';
COMMENT ON COLUMN public.credit_ledger.academic_year IS 'Year for transcript organization';
COMMENT ON COLUMN public.credit_ledger.credit_type IS 'Subject area: math, science, english, etc.';
COMMENT ON COLUMN public.credit_ledger.credits_earned IS 'Calculated: xp_amount / 1000';
COMMENT ON COLUMN public.credit_ledger.xp_amount IS 'Source XP earned for this task';
COMMENT ON COLUMN public.curriculum_lesson_progress.last_position IS 'JSONB snapshot of user scroll/position for resuming lesson';
COMMENT ON COLUMN public.curriculum_lesson_progress.status IS 'not_started | in_progress | completed';
COMMENT ON COLUMN public.curriculum_lesson_progress.time_spent_seconds IS 'Total seconds spent on this lesson (for analytics)';
COMMENT ON COLUMN public.curriculum_lessons.content IS 'Structured JSONB: { "blocks": [{ "type": "text|iframe|document", "content": "...", "data": {...} }] }';
COMMENT ON COLUMN public.curriculum_lessons.files IS 'JSONB array of file attachments: [{name, url, size}, ...]';
COMMENT ON COLUMN public.curriculum_lessons.prerequisite_lesson_ids IS 'Array of lesson IDs that must be completed before this one (for sequential mode)';
COMMENT ON COLUMN public.curriculum_lessons.search_vector IS 'Full-text search index (auto-updated via trigger)';
COMMENT ON COLUMN public.curriculum_lessons.sequence_order IS 'Order of lesson within quest (1, 2, 3, ...) - enforced unique per quest';
COMMENT ON COLUMN public.curriculum_lessons.video_url IS 'URL for embedded video (YouTube, Vimeo). Null if no video.';
COMMENT ON COLUMN public.curriculum_lessons.xp_threshold IS 'Minimum XP students must have earned before accessing this lesson. 0 or NULL means no requirement.';
COMMENT ON COLUMN public.curriculum_settings.navigation_mode IS 'sequential = must complete in order | free = can access any lesson';
COMMENT ON COLUMN public.curriculum_settings.require_all_lessons IS 'TRUE = must complete all lessons | FALSE = use minimum_lessons_required';
COMMENT ON COLUMN public.curriculum_uploads.can_resume IS 'Whether upload can be resumed from checkpoint';
COMMENT ON COLUMN public.curriculum_uploads.created_course_id IS 'The course created from this curriculum upload';
COMMENT ON COLUMN public.curriculum_uploads.current_item IS 'Current item being processed (e.g., Module 3 of 5)';
COMMENT ON COLUMN public.curriculum_uploads.current_stage IS 'Last completed stage (1-4)';
COMMENT ON COLUMN public.curriculum_uploads.current_stage_name IS 'Human-readable stage name for UI';
COMMENT ON COLUMN public.curriculum_uploads.generated_content IS 'Final AI output: {course, lessons, tasks} ready for preview';
COMMENT ON COLUMN public.curriculum_uploads.human_edits IS 'JSON tracking edits made during human review';
COMMENT ON COLUMN public.curriculum_uploads.human_structure_edits IS 'Structure corrections made during Stage 2 review';
COMMENT ON COLUMN public.curriculum_uploads.progress_percent IS 'Overall progress 0-100';
COMMENT ON COLUMN public.curriculum_uploads.resume_from_stage IS 'Stage to resume from (1-4)';
COMMENT ON COLUMN public.curriculum_uploads.source_type IS 'Type of uploaded content: imscc (Canvas), pdf, docx, or text';
COMMENT ON COLUMN public.curriculum_uploads.stage_progress IS 'Per-stage detailed progress data';
COMMENT ON COLUMN public.curriculum_uploads.status IS 'Current state in the upload/review workflow';
COMMENT ON COLUMN public.device_tokens.is_active IS 'Set to false when token is invalidated (logout, FCM rotation).';
COMMENT ON COLUMN public.device_tokens.token IS 'Firebase Cloud Messaging registration token. Rotated periodically by FCM.';
COMMENT ON COLUMN public.diplomas.parent_approval_denied IS 'Parent denied the public visibility request';
COMMENT ON COLUMN public.diplomas.parent_approval_denied_at IS 'Timestamp when parent denied the request';
COMMENT ON COLUMN public.diplomas.pending_parent_approval IS 'Minor requested public visibility, waiting for parent approval';
COMMENT ON COLUMN public.diplomas.public_consent_given IS 'User explicitly consented to make portfolio public (FERPA compliance)';
COMMENT ON COLUMN public.diplomas.public_consent_given_at IS 'Timestamp when consent was given';
COMMENT ON COLUMN public.diplomas.public_consent_given_by IS 'Who gave consent: user themselves or parent (for minors under 18)';
COMMENT ON COLUMN public.direct_messages.sent_by_user_id IS 'When the sender is a school-inbox account: the staff member who actually wrote the message. Staff-inbox display only.';
COMMENT ON COLUMN public.email_templates.is_override IS 'True if this template overrides the YAML default (takes precedence)';
COMMENT ON COLUMN public.email_templates.is_system IS 'True if template was originally from YAML (system template)';
COMMENT ON COLUMN public.evidence_document_blocks.content IS 'JSONB storing type-specific content data';
COMMENT ON COLUMN public.evidence_document_blocks.is_private IS 'When true, evidence block is hidden from public diploma page but visible to student, parents, and advisors';
COMMENT ON COLUMN public.evidence_document_blocks.order_index IS 'Determines display order of blocks within document';
COMMENT ON COLUMN public.evidence_document_blocks.uploaded_by_role IS 'Role of the user who uploaded this evidence block';
COMMENT ON COLUMN public.evidence_document_blocks.uploaded_by_user_id IS 'User who uploaded this evidence block (may differ from document owner)';
COMMENT ON COLUMN public.evidence_report_configs.access_token IS 'URL-safe token for public access (generated via secrets.token_urlsafe)';
COMMENT ON COLUMN public.evidence_report_configs.parent_approval_status IS 'FERPA compliance: not_required for adults, pending/approved/denied for minors';
COMMENT ON COLUMN public.households.carpool_interest IS 'Family is open to arranging carpools with other families in the directory.';
COMMENT ON COLUMN public.households.directory_opt_in IS 'Family chose to appear in the org family directory (visible to other families, not just staff).';
COMMENT ON COLUMN public.households.directory_opted_out IS 'Family explicitly asked to be left out of the family directory. Beats the org-wide default-in setting.';
COMMENT ON COLUMN public.households.image_url IS 'Public URL of the family photo (family-images bucket).';
COMMENT ON COLUMN public.households.payment_plan_preference IS 'Family''s stated tuition payment plan: in_full or monthly. Set by staff, or derived from the registration funnel''s payment_plan question. Informational — billing does not price off it.';
COMMENT ON COLUMN public.households.registration_hold IS 'Blocks parent self-service class signup for the whole family until staff clear it.';
COMMENT ON COLUMN public.households.registration_tier IS 'Priority tier for staggered class-registration opening (dates in feature_flags.sis_settings.registration_tier_dates). NULL = the default/open tier.';
COMMENT ON COLUMN public.households.ufa_private IS 'Family is enrolling as a UFA (Utah Fits All) Private School, vs standard UFA. Set by staff or the iCreate registration funnel.';
COMMENT ON COLUMN public.learning_events.captured_by_user_id IS 'The user who captured this moment. NULL = self-captured by student, otherwise = parent/observer who captured it for the student (user_id)';
COMMENT ON COLUMN public.login_attempts.lockout_count IS 'Total times this account has been locked out. Drives exponential backoff: lockout duration = base * 2^(lockout_count - 1), capped at 24h. Persists across reset_login_attempts so backoff cannot be reset by guessing correctly.';
COMMENT ON COLUMN public.message_email_relays.owner_email IS 'The mailbox authorized to reply, snapshotted when the relay was minted. The inbound handler requires the envelope sender to match this, so the token alone is not sufficient.';
COMMENT ON COLUMN public.observer_comments.learning_event_id IS 'Reference to learning_events for comments on learning moments (optional, can coexist with task_completion_id)';
COMMENT ON COLUMN public.observer_invitations.consumed_at IS 'When this single-use code was redeemed. NULL means still redeemable. Set atomically by the accept endpoint together with status = accepted.';
COMMENT ON COLUMN public.observer_invitations.consumed_by_user_id IS 'The observer who redeemed this code. One code, one observer.';
COMMENT ON COLUMN public.observer_invitations.invited_by_role IS 'Role of the inviter: student or parent';
COMMENT ON COLUMN public.observer_invitations.invited_by_user_id IS 'User ID of who created the invitation (parent or student)';
COMMENT ON COLUMN public.oea_help_video_views.open_count IS 'How many times the link has been opened; the first open sets first_opened_at.';
COMMENT ON COLUMN public.org_classes.assistant_instructor_ids IS 'Optional assistant teachers for this class (user ids), in addition to primary_instructor_id.';
COMMENT ON COLUMN public.org_classes.discussion_enabled IS 'Whether the class discussion board is open. False: students are refused (403, the board hides), nobody can post, teachers and admins can still read and delete the history. Toggled from the teacher class page (PATCH /api/sis/classes/<id>/discussion/settings).';
COMMENT ON COLUMN public.org_classes.image_url IS 'Public URL of the class image (class-images bucket).';
COMMENT ON COLUMN public.org_classes.internal_notes IS 'Staff-only notes about the class (room setup, supplies, office reminders). Never serialized to family or public audiences.';
COMMENT ON COLUMN public.org_classes.show_assistants IS 'Whether family/public catalog views name this class''s assistant teachers. Staff views always show them.';
COMMENT ON COLUMN public.org_classes.status IS 'active = currently running, archived = no longer in use';
COMMENT ON COLUMN public.org_classes.supply_fee IS 'Optional per-class supply fee (USD). Stored/displayed only; not charged.';
COMMENT ON COLUMN public.org_classes.ui_mode IS 'Cohort learner UI mode: ''simple'' (young-learner big-button view) or NULL (standard).';
COMMENT ON COLUMN public.org_classes.xp_threshold IS 'Total XP required from class quests to complete the class';
COMMENT ON COLUMN public.org_invitations.metadata IS 'JSON metadata for invitation context. Parent invitations store {"student_ids": [...], "invitation_type": "parent"}';
COMMENT ON COLUMN public.org_kiosk_devices.token IS 'Plaintext device code, shown on the org settings card. NULL for devices provisioned before 2026-09-07; token_hash remains the lookup key.';
COMMENT ON COLUMN public.org_resources.paperwork_key IS 'Key of the registration paperwork item (feature_flags.icreate_registration.paperwork) this resource backs; the funnel reads the doc url from this resource when set.';
COMMENT ON COLUMN public.org_resources.visible_to_roles IS 'NULL = whole audience. Non-null narrows a staff resource to these org roles (superadmin always sees all). Values constrained to staff roles by CHECK.';
COMMENT ON COLUMN public.organizations.accreditation_source IS 'Whose accreditation an org student''s official transcript is issued under: optio (Optio Academy ACS WASC), self (org''s own accreditation), or none.';
COMMENT ON COLUMN public.organizations.ai_chatbot_enabled IS 'Whether AI Tutor chatbot is enabled org-wide';
COMMENT ON COLUMN public.organizations.ai_features_enabled IS 'Whether AI features are enabled for all users in this organization. Org admin can toggle.';
COMMENT ON COLUMN public.organizations.ai_lesson_helper_enabled IS 'Whether Lesson Helper AI is enabled org-wide';
COMMENT ON COLUMN public.organizations.ai_task_generation_enabled IS 'Whether AI task generation is enabled org-wide';
COMMENT ON COLUMN public.organizations.archived_at IS 'When the org was archived. NULL for live orgs. Set alongside is_active = false.';
COMMENT ON COLUMN public.organizations.archived_by IS 'Superadmin who archived the org.';
COMMENT ON COLUMN public.organizations.feature_flags IS 'Per-org capability gates, e.g. {"scheduled_publish": true}. Absent/false = off. Gated UI/writes only; reusable across microschools.';
COMMENT ON COLUMN public.organizations.inbox_user_id IS 'users.id of the school-inbox account members DM as "{org name}". Lazily created; the account is a platform user (organization_id NULL) that cannot log in.';
COMMENT ON COLUMN public.password_reset_attempts.lockout_count IS 'Same exponential-backoff semantics as login_attempts.lockout_count.';
COMMENT ON COLUMN public.peer_connection_approvals.approver_kind IS 'parent = a real parent/guardian link. org_admin = the school standing in under the COPPA school exception, which is only valid when BOTH students are in that same organization (enforced in services/peer_connection_service).';
COMMENT ON COLUMN public.prior_learning_records.ai_suggestion IS 'Proposed subject/credit split from the future analyzer. A suggestion, never an award - awarded_credits is what counts.';
COMMENT ON COLUMN public.prior_learning_records.source IS 'Who filed this record: family (a guardian uploaded it) or staff (the office received the document from the school it came from and entered it). Stored rather than derived from submitted_by, whose role can change.';
COMMENT ON COLUMN public.public_visibility_requests.denial_reason IS 'Optional reason provided by parent when denying';
COMMENT ON COLUMN public.public_visibility_requests.parent_user_id IS 'The parent who must approve the request';
COMMENT ON COLUMN public.public_visibility_requests.status IS 'pending = awaiting response, approved = parent approved, denied = parent denied';
COMMENT ON COLUMN public.public_visibility_requests.student_user_id IS 'The minor who wants to make their portfolio public';
COMMENT ON COLUMN public.quest_task_completions.is_confidential IS 'If true, evidence is only visible to the student who submitted it. Others see a confidential message.';
COMMENT ON COLUMN public.quest_task_completions.user_quest_task_id IS 'Links to the specific user-personalized task that was completed';
COMMENT ON COLUMN public.quest_template_tasks.flag_count IS 'Number of times this task has been flagged by users';
COMMENT ON COLUMN public.quest_template_tasks.is_flagged IS 'Auto-set to true when flag_count >= 3, requires admin review';
COMMENT ON COLUMN public.quest_template_tasks.is_required IS 'If TRUE, task is auto-copied to user on enrollment. If FALSE, shown as optional suggestion in wizard.';
COMMENT ON COLUMN public.quest_template_tasks.source_metadata IS 'Flexible JSON storage for tracking task origin (migrated_from, original_table, etc.)';
COMMENT ON COLUMN public.quests.allow_custom_tasks IS 'If TRUE, students can add their own custom tasks in addition to template tasks';
COMMENT ON COLUMN public.quests.approach_examples IS 'AI-generated diverse approach examples showing different ways to tackle the quest. Cached to avoid repeated API calls. Structure: {"approaches": [{"label": "...", "description": "..."}]}';
COMMENT ON COLUMN public.quests.is_public IS 'Whether quest is publicly visible in quest library (true) or private to creator (false)';
COMMENT ON COLUMN public.quests.is_tutorial IS 'Indicates if this quest is the platform tutorial with auto-verified tasks';
COMMENT ON COLUMN public.quests.material_link IS 'Optional URL link to external materials or resources for this quest';
COMMENT ON COLUMN public.quests.quest_type IS 'Quest type: optio (self-directed) or course (curriculum-aligned)';
COMMENT ON COLUMN public.quests.source_material IS 'Source text the quest was drafted from (a handbook, syllabus, outline). Used as authoritative context when a learner generates their own tasks. Server-side only -- do not add to the quest-detail select list.';
COMMENT ON COLUMN public.refresh_token_families.last_client_fp IS 'Per-family salted hash of (user agent + IP) as of the last rotation: sha256(family_id || ua || ip) truncated to 16 hex chars. Comparable only within this family, by design. Used to tell a replay from a race when a reuse is detected (Sentry OPTIO-BACKEND-6N). Not an identifier, not PII to read back -- never join or report on it across families.';
COMMENT ON COLUMN public.registrations.stripe_session_ids IS 'History of Stripe Checkout Session ids created for this registration (latest last, capped at 10 by the app). stripe_session_id remains the most recent.';
COMMENT ON COLUMN public.scheduled_jobs.job_type IS 'Type: content_generation, quality_monitor, metrics_update, monthly_report';
COMMENT ON COLUMN public.scheduled_jobs.priority IS 'Job priority from 1 (lowest) to 10 (highest)';
COMMENT ON COLUMN public.sis_events.audience IS 'Who sees the event: school (everyone), teachers (staff only), admins (admins only). Families see only school.';
COMMENT ON COLUMN public.sis_form_submissions.form_type_label IS 'The form type''s display name AS OF submission. Written at submit time so renaming or retiring a form type never rewrites what past submissions say.';
COMMENT ON COLUMN public.sis_form_submissions.submitter_role IS 'Who filed this submission: staff (teacher/admin) or parent (guardian family request).';
COMMENT ON COLUMN public.sis_invoice_line_items.kind IS 'What the line charges for (tuition/supply/registration/fee/other). NULL means unclassified — lines written before 2026-08-19 and manual charges. Set by the tuition approver''s seeded line items so payments can be reconciled by category.';
COMMENT ON COLUMN public.sis_onboarding_assignments.batch_id IS 'Groups the per-person assignments created by one send-for-signature action.';
COMMENT ON COLUMN public.sis_onboarding_assignments.blocks_access IS 'Holds the recipient out of the platform until every required item is done. Enforced by backend/middleware/signature_gate.py.';
COMMENT ON COLUMN public.sis_onboarding_assignments.description IS 'Directions copied from the template when this checklist was assigned. A later template edit does not reach it (see the Sync assigned checklists action).';
COMMENT ON COLUMN public.sis_onboarding_assignments.kind IS 'checklist = an assigned onboarding template; signature_request = a single document sent out for signature (see services/sis_onboarding_service.send_for_signature).';
COMMENT ON COLUMN public.sis_onboarding_templates.audience IS 'Who the checklist is for: staff | family.';
COMMENT ON COLUMN public.sis_onboarding_templates.blocks_access IS 'Copied onto assignments created from this template (see assignments.blocks_access).';
COMMENT ON COLUMN public.sis_onboarding_templates.description IS 'Directions shown at the top of the checklist, above the items. Snapshotted onto each assignment at assign time, like name and items.';
COMMENT ON COLUMN public.sis_recurring_tuition.next_charge_on IS 'The next date the sweep should bill this student. NULL means the family has not saved a card yet - set when the card is saved, advanced a month after each attempt (success or decline; declines are handed to staff, never retried the next day).';
COMMENT ON COLUMN public.sis_recurring_tuition.setup_link_sent_at IS 'When the household was last emailed the card-setup link. NULL means the family has never been asked to save a card, so an active schedule with no next_charge_on is waiting on the school, not on the parent.';
COMMENT ON COLUMN public.sis_recurring_tuition.status IS 'active: swept monthly. paused: kept, with its amount, but skipped (a family taking a term off). canceled: ended, retained for history and excluded from the one-live-per-student index.';
COMMENT ON COLUMN public.sis_secure_documents.requires_signature IS 'The office is asking the owner to sign this document. Narrows the pool a checklist signature item signs against (services/sis_onboarding_service.office_documents); when a person has none flagged, every shared document stays in the pool as before.';
COMMENT ON COLUMN public.sis_secure_documents.sensitivity IS 'hr = employment/confidential paperwork, HR_ROLES only. general = ordinary campus paperwork a campus_coordinator may send and track (ADMIN_ROLES).';
COMMENT ON COLUMN public.sis_staff_training.audience IS 'The row''s primary group (staff > family > student), kept in step with audiences. Carries the one-row-per-quest unique index and the guardian family-portal read.';
COMMENT ON COLUMN public.sis_staff_training.audiences IS 'Every group this quest is set for: staff, family (guardians), student. Source of truth for assignment and for the catalog read.';
COMMENT ON COLUMN public.sis_staff_training.auto_assign IS 'Enroll everyone in the audience automatically, including people who join later. Checked on the audience''s own read path (GET /api/sis/training, GET /api/sis/parent/quests).';
COMMENT ON COLUMN public.sis_staff_training.student_max_age IS 'Oldest student this reaches, in whole years. NULL means no ceiling.';
COMMENT ON COLUMN public.sis_staff_training.student_min_age IS 'Youngest student this reaches, in whole years from date_of_birth. NULL means no floor. Students with no recorded DOB are left out whenever either bound is set.';
COMMENT ON COLUMN public.sis_staff_training.visible_to_roles IS 'NULL = whole audience. Non-null narrows staff training to these org roles (superadmin always sees all). Values constrained to staff roles by CHECK.';
COMMENT ON COLUMN public.student_access_logs.accessor_id IS 'Who read the student record. NULL means either an unauthenticated/system read (accessor_role says which) or an accessor whose account has since been erased -- the FK is ON DELETE SET NULL because the disclosure record belongs to the student and must outlive the reader''s account. Never re-add NOT NULL: it makes every accessor undeletable (Sentry OPTIO-BACKEND-75/76).';
COMMENT ON COLUMN public.student_access_logs.accessor_role IS 'Effective role of the accessor at time of access, or a sentinel (public/system/unknown) when it could not be resolved. Kept in step with utils/roles.py by backend/tests/test_access_log_role_constraint.py.';
COMMENT ON COLUMN public.student_access_logs.data_accessed IS 'JSON describing what data was accessed: {type, fields, endpoint}';
COMMENT ON COLUMN public.student_access_logs.ip_address IS 'Source IP address for security audit';
COMMENT ON COLUMN public.student_access_logs.purpose IS 'Legitimate educational interest or other FERPA-compliant purpose';
COMMENT ON COLUMN public.student_access_logs.student_id IS 'The student whose data was accessed';
COMMENT ON COLUMN public.student_access_logs.user_agent IS 'Browser/client user agent for security audit';
COMMENT ON COLUMN public.student_planned_absences.class_id IS 'NULL = whole day out; set = absent from just this scheduled class.';
COMMENT ON COLUMN public.student_weekly_xp_goals.effective_from IS 'Monday (org timezone) this target starts applying from. Standing until superseded.';
COMMENT ON COLUMN public.student_weekly_xp_goals.set_by_role IS 'Capacity the setter acted in, recorded at write time - not re-derived later.';
COMMENT ON COLUMN public.transcript_share_tokens.label IS 'Who this link was issued to, e.g. "State University admissions" — so a parent reviewing the list knows what they are revoking.';
COMMENT ON COLUMN public.transcript_share_tokens.revoked_at IS 'Set on revocation. Checked on every read, so revocation is immediate.';
COMMENT ON COLUMN public.transfer_credits.prior_learning_record_ids IS 'prior_learning_records converted into this row. Empty for credits typed in by hand. Guards against converting the same record twice, and answers "which family submission is this credit from".';
COMMENT ON COLUMN public.transfer_credits.subject_xp IS 'JSONB mapping of school_subject enum values to XP amounts (e.g., {"math": 4000, "science": 2000})';
COMMENT ON COLUMN public.user_quest_tasks.auto_complete IS 'If true, task completion is verified programmatically via database checks';
COMMENT ON COLUMN public.user_quest_tasks.diploma_subjects IS 'Array of diploma subjects this task contributes to (Language Arts, Mathematics, Science, etc.)';
COMMENT ON COLUMN public.user_quest_tasks.is_required IS 'Whether task completion is required. Defaults to false (optional).';
COMMENT ON COLUMN public.user_quest_tasks.source_moment_id IS 'Links task to the learning moment it was converted from.';
COMMENT ON COLUMN public.user_quest_tasks.source_template_task_id IS 'Reference to the template task this was copied from (for analytics and updates)';
COMMENT ON COLUMN public.user_quest_tasks.subject_xp_distribution IS 'XP distribution across school subjects as key-value pairs. Example: {"Math": 50, "Science": 50}';
COMMENT ON COLUMN public.user_quest_tasks.verification_query IS 'JSONB object containing verification logic for auto-complete tasks';
COMMENT ON COLUMN public.user_quests.archive_feedback IS 'Optional free-text detail the learner gave when archiving.';
COMMENT ON COLUMN public.user_quests.archive_reason IS 'Exit-survey reason code: break | done | too_hard | too_easy | lost_interest | no_materials.';
COMMENT ON COLUMN public.user_quests.archived_at IS 'When the learner archived (non-destructively hid) this enrollment. NULL = not archived.';
COMMENT ON COLUMN public.user_quests.personalization_completed IS 'Indicates if user has completed the AI personalization wizard for this quest';
COMMENT ON COLUMN public.user_quests.personalization_session_id IS 'Links to the personalization session used to create this quest';
COMMENT ON COLUMN public.user_subject_xp.pending_xp IS 'XP from drafts marked ready for credit, awaiting student finalization';
COMMENT ON COLUMN public.user_subject_xp.xp_amount IS 'Finalized XP that counts toward diploma credits';
COMMENT ON COLUMN public.user_task_evidence_documents.is_confidential IS 'If true, evidence is only visible to the student who submitted it. Others see a confidential message.';
COMMENT ON COLUMN public.users.address_line1 IS 'User address line 1 (optional)';
COMMENT ON COLUMN public.users.address_line2 IS 'User address line 2 (optional)';
COMMENT ON COLUMN public.users.ai_chatbot_enabled IS 'Whether AI Tutor chatbot is enabled for this user';
COMMENT ON COLUMN public.users.ai_features_enabled IS 'Whether AI features (tutor, suggestions) are enabled for this user. For dependents, parent must enable.';
COMMENT ON COLUMN public.users.ai_features_enabled_at IS 'Timestamp when AI features were enabled/disabled';
COMMENT ON COLUMN public.users.ai_features_enabled_by IS 'User ID of parent who enabled AI features for this dependent';
COMMENT ON COLUMN public.users.ai_lesson_helper_enabled IS 'Whether Lesson Helper AI is enabled for this user';
COMMENT ON COLUMN public.users.ai_task_generation_enabled IS 'Whether AI task generation/suggestions are enabled for this user';
COMMENT ON COLUMN public.users.apple_user_id IS 'Apple Sign in user identifier for account linking.';
COMMENT ON COLUMN public.users.city IS 'User city (optional)';
COMMENT ON COLUMN public.users.country IS 'User country (optional)';
COMMENT ON COLUMN public.users.date_of_birth IS 'User date of birth - required for COPPA age verification';
COMMENT ON COLUMN public.users.date_of_birth_locked_at IS 'Set when the student self-attested their date of birth through the peer connection age screen. Non-null means the value is one-shot: the student may no longer edit it themselves. Parents and admins still can.';
COMMENT ON COLUMN public.users.deletion_attempts IS 'Failed erasure attempts by the deletion sweep. >0 with deletion_status=''pending'' means an account is stuck and needs a look.';
COMMENT ON COLUMN public.users.deletion_last_error IS 'Last failure from the deletion sweep. Cleared when the user cancels.';
COMMENT ON COLUMN public.users.deletion_scheduled_for IS 'Date when account will be permanently deleted (30 days after request)';
COMMENT ON COLUMN public.users.deletion_status IS 'Account deletion status - none, pending (30-day grace period), or completed';
COMMENT ON COLUMN public.users.google_user_id IS 'Supabase Auth user_id for Google OAuth identity';
COMMENT ON COLUMN public.users.is_org_admin IS 'Derived from role/org_role/org_roles by the sync_is_org_admin trigger. Do not write it directly — write the role columns and read this back. Kept because four auth gates and the admin user list still read it.';
COMMENT ON COLUMN public.users.last_logout_at IS 'Timestamp of last logout - used to invalidate tokens issued before this time';
COMMENT ON COLUMN public.users.org_role IS 'Organization-specific role. Only used when role=org_managed. Values: student, parent, advisor, org_admin, campus_coordinator, observer';
COMMENT ON COLUMN public.users.parental_consent_email IS 'Parent/guardian email address for COPPA compliance';
COMMENT ON COLUMN public.users.parental_consent_status IS 'Status values: pending_submission, pending_review, approved, rejected';
COMMENT ON COLUMN public.users.parental_consent_verified IS 'Whether parent/guardian has verified consent';
COMMENT ON COLUMN public.users.phone_number IS 'User phone number (optional)';
COMMENT ON COLUMN public.users.phone_verified_at IS 'When the user verified phone_number via SMS code. NULL = never verified. Gates org adults when the org sets feature_flags.sis_settings.require_adult_phone_verification (backend/middleware/phone_verification_gate.py).';
COMMENT ON COLUMN public.users.postal_code IS 'User postal/zip code (optional)';
COMMENT ON COLUMN public.users.requires_parental_consent IS 'Automatically set to true if user is under 13 years old';
COMMENT ON COLUMN public.users.role IS 'Platform role. org_managed indicates role is controlled by organization via org_role column';
COMMENT ON COLUMN public.users.state IS 'User state/province (optional)';
COMMENT ON COLUMN public.users.username IS 'Username for org students without email. Unique within each organization.';
COMMENT ON COLUMN public.users.welcome_email_sent IS 'Tracks whether the welcome email has been sent to this user on first login';
COMMENT ON COLUMN public.xp_award_failures.processed_at IS 'Set when the failed award is successfully retried. NULL indicates pending retry.';
COMMENT ON TABLE public.account_deletion_log IS 'Audit log of account deletions for compliance purposes';
COMMENT ON TABLE public.admin_masquerade_log IS 'Audit log for admin masquerade sessions - tracks when admins view the platform as other users';
COMMENT ON TABLE public.advisor_checkins IS 'Tracks advisor check-ins with students for progress monitoring and support';
COMMENT ON TABLE public.advisor_notes IS 'Confidential notes that advisors maintain about students and parents';
COMMENT ON TABLE public.ai_prompt_components IS 'Stores editable AI prompt components. Python file (prompts/components.py) provides defaults.';
COMMENT ON TABLE public.ai_quest_review_queue IS 'Stores AI-generated quests awaiting admin review before publication';
COMMENT ON TABLE public.ai_task_cache IS 'Caches AI-generated tasks based on interests and subjects for performance';
COMMENT ON TABLE public.ai_usage_logs IS 'Tracks AI API usage for cost monitoring and optimization. Only accessible by superadmin.';
COMMENT ON TABLE public.announcement_read_stats IS 'Per-announcement recipient/read counts for the staff Messaging list. recipient_count is NULL for sends that predate the snapshot.';
COMMENT ON TABLE public.announcement_reads IS 'Tracks which announcements each user has read for unread badge counts.';
COMMENT ON TABLE public.announcement_recipients IS 'Who an announcement was sent to, snapshotted at publish time. Read stats and nudges diff this against announcement_reads.';
COMMENT ON TABLE public.bounties IS 'Bounty board postings. Service-role only -- never expose to the Data API. Rows carry allowed_student_ids and moderation_notes, so a status-keyed RLS policy publishes who a private bounty was offered to. Read authorization is the @require_role decorators in routes/bounties.py, and the visibility rules in BountyService. If a logged-out bounty board is ever built, give it a Flask endpoint that selects the public columns explicitly; do not re-grant anon.';
COMMENT ON TABLE public.bounty_claims IS 'Tracks student participation in bounties. One claim per student per bounty.';
COMMENT ON TABLE public.bounty_reviews IS 'Review decisions on bounty claim submissions.';
COMMENT ON TABLE public.class_advisors IS 'Junction table for advisors assigned to manage a class';
COMMENT ON TABLE public.class_enrollments IS 'Student enrollments in classes with status tracking';
COMMENT ON TABLE public.class_quests IS 'Quests assigned to a class for students to complete';
COMMENT ON TABLE public.consultation_requests IS 'Stores consultation booking requests from parents';
COMMENT ON TABLE public.content_reports IS 'User-submitted reports on feed content for admin moderation review.';
COMMENT ON TABLE public.course_enrollments IS 'Student enrollments in courses';
COMMENT ON TABLE public.course_generation_jobs IS 'Tracks background AI course generation jobs with progress and logging';
COMMENT ON TABLE public.course_quest_tasks IS 'Preset tasks for course quests - auto-copied to user_quest_tasks on enrollment';
COMMENT ON TABLE public.course_quests IS 'Quests assigned to courses with specific sequence order';
COMMENT ON TABLE public.courses IS 'Structured learning paths that group quests (Projects) in a specific sequence. After migration 032, all course quests must be inside a Course.';
COMMENT ON TABLE public.credit_ledger IS 'Tracks academic credits derived from XP (1000 XP = 1 credit)';
COMMENT ON TABLE public.curriculum_attachments IS 'Org curriculum uploads. Service-role only -- never expose to the Data API. file_url points at stored course material, and organization_id is NULL on every row today, so any policy with an `organization_id IS NULL` branch publishes the whole table rather than isolating orgs. Access goes through routes/curriculum/attachments.py on the admin client.';
COMMENT ON TABLE public.curriculum_lesson_progress IS 'Tracks individual user progress through curriculum lessons';
COMMENT ON TABLE public.curriculum_lesson_tasks IS 'Links quest tasks to curriculum lessons for Just-in-Time Teaching';
COMMENT ON TABLE public.curriculum_lessons IS 'Individual lessons within a quest curriculum (ordered, with prerequisites)';
COMMENT ON TABLE public.curriculum_settings IS 'Global curriculum settings per quest (navigation mode, completion rules, UI preferences)';
COMMENT ON TABLE public.curriculum_uploads IS 'Tracks AI-powered curriculum upload and transformation sessions';
COMMENT ON TABLE public.device_tokens IS 'FCM registration tokens for push notifications. Users can have multiple tokens (multiple devices).';
COMMENT ON TABLE public.direct_messages IS 'Stores individual messages between users (advisor-student, friend-friend)';
COMMENT ON TABLE public.evidence_document_blocks IS 'Student work content. Service-role only -- never expose to the Data API. Read authorization is utils/portfolio_access.py::can_view_portfolio, which encodes consent, minor status and parent revocation. An RLS policy keyed on diplomas.is_public cannot express that and must not be reintroduced.';
COMMENT ON TABLE public.evidence_report_configs IS 'Stores configurations for shareable evidence reports that students can create';
COMMENT ON TABLE public.evidence_report_parent_approvals IS 'Tracks parent approval workflow for minor students creating public evidence reports (FERPA compliance)';
COMMENT ON TABLE public.message_conversations IS 'Tracks conversation metadata and unread counts between two users';
COMMENT ON TABLE public.message_email_relays IS 'Per (superadmin, recipient) email relay. The token is the local part of the Reply-To address on a "Send to Gmail" copy of an Optio message; an inbound reply to it is posted back into the Optio thread. Service-role only.';
COMMENT ON TABLE public.notification_preferences IS 'Per-user, per-type notification opt-outs. Absence of row means default (enabled).';
COMMENT ON TABLE public.observer_access_audit IS 'COPPA/FERPA compliance: Audit trail of observer access to student data';
COMMENT ON TABLE public.oea_help_video_views IS 'One row per user who has opened the program getting-started video link. Records the click, not playback - the video is hosted off-platform.';
COMMENT ON TABLE public.org_classes IS 'Organization classes for grouping students around quests with XP-based completion tracking';
COMMENT ON TABLE public.org_invitations IS 'Stores user invitations from org admins. Users receive email with invitation link to join the organization.';
COMMENT ON TABLE public.org_resources IS 'Org document library (guidebooks, contracts, links). Staff manage in the SIS; org families read them in the learning app.';
COMMENT ON TABLE public.organization_secrets IS 'Org-scoped credentials (Stripe secret keys, calendar feed tokens). Never exposed to PostgREST: RLS is on with no policies and all grants are revoked. Read/write only via the service-role client through backend/utils/org_secrets.py. Do NOT put credentials back into organizations.feature_flags -- that column is anon-readable by row policy and is echoed to clients.';
COMMENT ON TABLE public.parent_digest_sends IS 'One row per (org, parent, local week date) for the weekly parent digest. The unique constraint is the send-once guard for a cron that ticks every 10 minutes inside the send hour.';
COMMENT ON TABLE public.parental_consent_log IS 'Audit log of parental consent requests and verifications for COPPA compliance';
COMMENT ON TABLE public.password_reset_attempts IS 'Per-email rate limiting + lockout for /api/auth/forgot-password to prevent targeted reset-email flooding (separate from per-IP @rate_limit on the route).';
COMMENT ON TABLE public.peer_connections IS 'A mutual, parent-approved link between two students, allowing each to view and comment on the other''s work. See utils/portfolio_access.is_peer_of.';
COMMENT ON TABLE public.phone_verification_codes IS 'One row per verification SMS sent. Backend-only (service role); codes stored hashed. See services/phone_verification_service.py.';
COMMENT ON TABLE public.portfolio_visibility_reset_20260801 IS 'Pre-reset snapshot from the 2026-08-01 private-by-default migration. Contains per-student minor/consent flags -- service-role only, never expose to the Data API.';
COMMENT ON TABLE public.prior_learning_records IS 'Guardian-submitted records of learning done before/outside Optio, reviewed by school staff and awarded as Optio high-school credit. Opt-in per org via feature_flags.sis_settings.prior_learning_enabled.';
COMMENT ON TABLE public.public_visibility_requests IS 'Track parent approval requests for minors making portfolio public (FERPA/COPPA compliance)';
COMMENT ON TABLE public.push_subscriptions IS 'Web Push API subscriptions for browser push notifications';
COMMENT ON TABLE public.quest_personalization_sessions IS 'Tracks the AI personalization workflow for each user-quest combination';
COMMENT ON TABLE public.quest_sample_tasks IS 'Sample tasks for Optio quests - used as inspiration, not personalized per-user';
COMMENT ON TABLE public.quest_sources IS 'V3 table with RLS enabled for security compliance';
COMMENT ON TABLE public.quest_template_tasks IS 'Unified template tasks for quests - replaces both course_quest_tasks and quest_sample_tasks';
COMMENT ON TABLE public.refresh_token_families IS 'One row per refresh-token chain. current_jti is the only token id that may be presented next; presenting a superseded jti is a replay and revokes the family. Rows are deleted once expired -- see cleanup_expired_refresh_token_families().';
COMMENT ON TABLE public.scheduled_jobs IS 'Stores scheduled background jobs for AI content generation and quality monitoring';
COMMENT ON TABLE public.security_warnings_documentation IS 'Documentation for infrastructure security warnings requiring Supabase admin action';
COMMENT ON TABLE public.sis_age_exception_requests IS 'Family requests to enroll a student in a class outside its age band. Timestamped; staff approve (enrolls immediately) or decline on the SIS Registration page.';
COMMENT ON TABLE public.sis_clp_records IS 'Per-student CLP meeting state: finished_at set = the CLP was completed for this year; notes are staff-only meeting notes (hidden in presentation mode).';
COMMENT ON TABLE public.sis_curriculum_courses IS 'Courses attached to a curriculum. A live link, not a copy (contrast sis_curriculum_quests): classes attached to the curriculum inherit these as teaching resources, so correcting the library corrects every class.';
COMMENT ON TABLE public.sis_curriculum_quests IS 'Reusable quest set for a curriculum. Classes COPY from it (see POST /api/sis/classes/:id/quests/from-curriculum); it is not a live join.';
COMMENT ON TABLE public.sis_enrollment_waitlist IS 'Students waitlisted at registration because their age falls in a gated band (sis_settings.enrollment_age_gates). Waiting students cannot select classes; staff release them individually.';
COMMENT ON TABLE public.sis_family_directives IS 'Per-parent-email settings staged before a family registers: prepaid legacy fee, registration hold, priority tier. Applied by the iCreate funnel when the household is created (matched_household_id records the match).';
COMMENT ON TABLE public.sis_form_templates IS 'Org-defined forms. Mirrors sis_onboarding_templates. `key` is written into sis_form_submissions.form_type; the built-in types keep working because they resolve from code when no template row matches.';
COMMENT ON TABLE public.sis_learning_day_selections IS 'UFA private school learning-day choice (Quest Learning Day or Elementary At-Home Academic Learning Day). Not an enrollable class; counts toward the 3 instructional days but not the 5 in-person blocks.';
COMMENT ON TABLE public.sis_recurring_tuition IS 'Open-ended monthly tuition: a set amount per student charged every month until paused or cancelled. One row per student; the monthly sweep groups a household''s active rows into one invoice (a line per student) and takes one card charge for the total.';
COMMENT ON TABLE public.sis_schedule_submissions IS 'Parent "Submit for approval" state per student schedule. submitted/approved lock parent self-service changes; sent_back unlocks. Approval is status-only (billing happens outside Optio).';
COMMENT ON TABLE public.student_access_logs IS 'FERPA compliance: Tracks all access to student educational records';
COMMENT ON TABLE public.student_planned_absences IS 'Parent-reported planned absences (whole-day or per-class). Backend-only; distinct from teacher-recorded sis_attendance.';
COMMENT ON TABLE public.student_wallets IS 'Spendable-XP ("coin") ledger, one per student. A wallet exists only for students in programs that use the coin economy (e.g. Treehouse). Total XP (mastery) is never reduced by spending here.';
COMMENT ON TABLE public.student_weekly_xp_goals IS 'Weekly XP targets for a student, set by the student, a parent, or a teacher. One row per change; the target in force for a week is the newest row with effective_from <= that week''s Monday. Opt-in per org via feature_flags.xp_goals.';
COMMENT ON TABLE public.task_feedback IS 'Stores iterative feedback from reviewers on task draft submissions';
COMMENT ON TABLE public.task_steps IS 'AI-generated step breakdowns for tasks, supporting neurodivergent-friendly granularity';
COMMENT ON TABLE public.transcript_share_tokens IS 'Revocable, expiring grants to view one student transcript. Issued by the student''s parent or org approver; the token is the auth surface for recipients who have no Optio account.';
COMMENT ON TABLE public.transfer_credits IS 'Stores transfer credits from external transcripts. Multiple records allowed per student (one per source institution).';
COMMENT ON TABLE public.tutor_conversations IS 'Stores AI tutor conversation sessions';
COMMENT ON TABLE public.tutor_messages IS 'Stores individual messages within tutor conversations';
COMMENT ON TABLE public.tutor_safety_reports IS 'Logs safety incidents and blocked content for admin review';
COMMENT ON TABLE public.tutor_settings IS 'User-specific tutor preferences and settings';
COMMENT ON TABLE public.tutor_tier_limits IS 'Subscription tier limits with RLS enabled. All users can read, only service role can modify.';
COMMENT ON TABLE public.tutorial_verification_log IS 'Tracks when tutorial tasks are automatically verified for users';
COMMENT ON TABLE public.user_blocks IS 'User-to-user blocks. Blocked users are hidden from feed and cannot message the blocker.';
COMMENT ON TABLE public.user_quest_tasks IS 'Stores user-specific personalized tasks generated through AI or created manually';
COMMENT ON TABLE public.user_quests IS 'User quest enrollments. Migration 033 cleans up orphaned enrollments from deleted courses.';
COMMENT ON TABLE public.user_task_evidence_documents IS 'Stores evidence documents for task completion with draft/completed status';
COMMENT ON TABLE public.xp_award_failures IS 'Tracks XP award failures for later reconciliation. Records are created when xp_service.award_xp() fails during task completion.';
