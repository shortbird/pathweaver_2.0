-- Baseline: full public-schema snapshot of production (project vvfgxcykxjybtvpfzwyx),
-- generated 2026-08-12 from the live catalogs (pg_get_functiondef /
-- pg_get_constraintdef / pg_get_triggerdef / pg_indexes / pg_policies).
--
-- Why this exists: Supabase preview branches replay supabase/migrations/ onto
-- an EMPTY database. This repo's pre-baseline migrations assume the schema
-- already exists (the very first file ALTERs public.users), so every preview
-- branch died at statement 0 and the "Supabase Preview" check could never
-- pass. Production's migration history was already squashed to a baseline on
-- 2026-07-14 (baseline_squash_for_branching) -- this file is the repo-side
-- half of that squash. The historical migration files are preserved in
-- supabase/migrations-archive/.
--
-- Scope: schema objects only (tables, constraints, indexes, functions,
-- triggers, RLS policies, sequences, extensions). No grants, no cron jobs,
-- no storage buckets, no realtime publications -- preview branches do not
-- exercise those, and production never replays this file (its history already
-- contains version 20260714000000).
--
-- Do not hand-edit history: new schema changes go in NEW migration files.

set check_function_bodies = off;


-- ============================================================
-- extensions
-- ============================================================

create extension if not exists "hypopg" with schema "extensions";
create extension if not exists "index_advisor" with schema "extensions";
create extension if not exists "pg_cron" with schema "pg_catalog";
create extension if not exists "pg_net";
create extension if not exists "pg_stat_statements" with schema "extensions";
create extension if not exists "pg_trgm" with schema "extensions";
create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "supabase_vault" with schema "vault";
create extension if not exists "uuid-ossp" with schema "extensions";
create extension if not exists "vector" with schema "extensions";

-- ============================================================
-- sequences
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS public.ai_seeds_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.user_skill_details_id_seq;

-- ============================================================
-- enum types
-- ============================================================

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

-- ============================================================
-- tables
-- ============================================================

CREATE TABLE public.account_deletion_log (
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

CREATE TABLE public.admin_audit_logs (
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

CREATE TABLE public.admin_masquerade_log (
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

CREATE TABLE public.advisor_checkins (
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

CREATE TABLE public.advisor_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  advisor_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  note_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.advisor_student_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  advisor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  assigned_by uuid,
  is_active boolean DEFAULT true
);

CREATE TABLE public.ai_generated_quests (
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

CREATE TABLE public.ai_generation_jobs (
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

CREATE TABLE public.ai_prompt_components (
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

CREATE TABLE public.ai_quest_review_queue (
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

CREATE TABLE public.ai_seeds (
  id integer DEFAULT nextval('ai_seeds_id_seq'::regclass) NOT NULL,
  prompt_name text DEFAULT 'primary_seed'::text NOT NULL,
  prompt_text text NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ai_task_cache (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  quest_id uuid NOT NULL,
  cache_key text NOT NULL,
  interests_hash text,
  generated_tasks jsonb NOT NULL,
  hit_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval)
);

CREATE TABLE public.ai_usage_logs (
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

CREATE TABLE public.announcement_reads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  author_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  target_audience text DEFAULT 'everyone'::text NOT NULL,
  pinned boolean DEFAULT false NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.automation_sequences (
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

CREATE TABLE public.bounties (
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

CREATE TABLE public.bounty_claims (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bounty_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status text DEFAULT 'claimed'::text NOT NULL,
  evidence jsonb,
  submitted_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bounty_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  claim_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL,
  feedback text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.buddies (
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

CREATE TABLE public.bug_reports (
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

CREATE TABLE public.class_advisors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  advisor_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true
);

CREATE TABLE public.class_discussion_posts (
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

CREATE TABLE public.class_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  student_id uuid NOT NULL,
  status character varying(50) DEFAULT 'active'::character varying,
  enrolled_at timestamp with time zone DEFAULT now(),
  enrolled_by uuid NOT NULL,
  completed_at timestamp with time zone
);

CREATE TABLE public.class_materials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  file_path text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.class_meetings (
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

CREATE TABLE public.class_prerequisites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  prerequisite_class_id uuid,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.class_quests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  class_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  added_by uuid NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  sequence_order integer DEFAULT 0,
  publish_at timestamp with time zone,
  due_date timestamp with time zone
);

CREATE TABLE public.consultation_requests (
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

CREATE TABLE public.contact_submissions (
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

CREATE TABLE public.content_reports (
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

CREATE TABLE public.course_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  course_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status character varying(50) DEFAULT 'active'::character varying NOT NULL,
  enrolled_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  current_quest_id uuid,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.course_generation_jobs (
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

CREATE TABLE public.course_plan_sessions (
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

CREATE TABLE public.course_quest_tasks (
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

CREATE TABLE public.course_quests (
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

CREATE TABLE public.course_refine_sessions (
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

CREATE TABLE public.courses (
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

CREATE TABLE public.credit_ledger (
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

CREATE TABLE public.credit_review_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  completion_id uuid NOT NULL,
  author_id uuid NOT NULL,
  author_role text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.curriculum_attachments (
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

CREATE TABLE public.curriculum_lesson_progress (
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

CREATE TABLE public.curriculum_lesson_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lesson_id uuid NOT NULL,
  task_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  organization_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.curriculum_lessons (
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

CREATE TABLE public.curriculum_settings (
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

CREATE TABLE public.curriculum_uploads (
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

CREATE TABLE public.device_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL,
  device_name text,
  is_active boolean DEFAULT true NOT NULL,
  last_used_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.diploma_review_rounds (
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

CREATE TABLE public.diplomas (
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

CREATE TABLE public.direct_messages (
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
  is_deleted boolean DEFAULT false NOT NULL
);

CREATE TABLE public.docs_articles (
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

CREATE TABLE public.docs_categories (
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

CREATE TABLE public.docs_search_misses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  query text NOT NULL,
  normalized_query text NOT NULL,
  miss_count integer DEFAULT 1 NOT NULL,
  first_searched_at timestamp with time zone DEFAULT now(),
  last_searched_at timestamp with time zone DEFAULT now(),
  generated_article_id uuid
);

CREATE TABLE public.email_templates (
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

CREATE TABLE public.emergency_contacts (
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

CREATE TABLE public.evidence_document_blocks (
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

CREATE TABLE public.evidence_report_configs (
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

CREATE TABLE public.evidence_report_parent_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  report_config_id uuid NOT NULL,
  parent_user_id uuid,
  status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  requested_at timestamp with time zone DEFAULT now(),
  responded_at timestamp with time zone,
  denial_reason text
);

CREATE TABLE public.feed_highlights (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.feed_item_views (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  viewer_id uuid NOT NULL,
  completion_id uuid,
  learning_event_id uuid,
  viewed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.feed_share_tokens (
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

CREATE TABLE public.group_conversations (
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
  announcement_only boolean DEFAULT false NOT NULL
);

CREATE TABLE public.group_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role character varying(20) DEFAULT 'member'::character varying,
  joined_at timestamp with time zone DEFAULT now(),
  added_by uuid,
  last_read_at timestamp with time zone
);

CREATE TABLE public.group_messages (
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

CREATE TABLE public.household_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  household_id uuid NOT NULL,
  user_id uuid NOT NULL,
  relationship text DEFAULT 'student'::text NOT NULL,
  is_primary_guardian boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.households (
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
  carpool_interest boolean DEFAULT false NOT NULL
);

CREATE TABLE public.icreate_registrations (
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

CREATE TABLE public.interest_tracks (
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

CREATE TABLE public.learning_event_evidence_blocks (
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

CREATE TABLE public.learning_event_topics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  learning_event_id uuid NOT NULL,
  topic_type text NOT NULL,
  topic_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.learning_events (
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

CREATE TABLE public.lesson_reflections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  prompt text NOT NULL,
  response text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lms_grade_sync (
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

CREATE TABLE public.lms_integrations (
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

CREATE TABLE public.lms_sessions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  lms_platform character varying(50) NOT NULL,
  session_token character varying(500) NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.login_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  attempt_count integer DEFAULT 0,
  locked_until timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  lockout_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.lti_auth_codes (
  code text NOT NULL,
  user_id uuid,
  quest_id uuid,
  target_path text,
  expires_at timestamp with time zone NOT NULL,
  used boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  pending_launch_id uuid
);

CREATE TABLE public.lti_nonces (
  nonce text NOT NULL,
  issuer text NOT NULL,
  seen_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);

CREATE TABLE public.lti_pending_launches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  registration_id uuid NOT NULL,
  claims jsonb NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lti_registrations (
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

CREATE TABLE public.message_conversations (
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

CREATE TABLE public.message_reactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_type text NOT NULL,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notification_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notifications (
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

CREATE TABLE public.observer_access_audit (
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

CREATE TABLE public.observer_comments (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  observer_id uuid NOT NULL,
  student_id uuid NOT NULL,
  quest_id uuid,
  task_completion_id uuid,
  comment_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  learning_event_id uuid
);

CREATE TABLE public.observer_invitation_students (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  invitation_id uuid NOT NULL,
  student_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.observer_invitations (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  student_id uuid,
  observer_email text NOT NULL,
  observer_name text NOT NULL,
  invitation_code text NOT NULL,
  status text DEFAULT 'pending'::text,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  accepted_at timestamp with time zone,
  invited_by_user_id uuid,
  invited_by_role character varying(20) DEFAULT 'student'::character varying
);

CREATE TABLE public.observer_student_links (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  observer_id uuid NOT NULL,
  student_id uuid NOT NULL,
  can_comment boolean DEFAULT true,
  can_view_evidence boolean DEFAULT true,
  notifications_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  invited_by_parent_id uuid
);

CREATE TABLE public.oea_compliance_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid,
  student_id uuid NOT NULL,
  credit_id uuid,
  school_year text NOT NULL,
  term_index smallint NOT NULL,
  context jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.oea_credit_evidence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  credit_id uuid NOT NULL,
  student_id uuid NOT NULL,
  block_type text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.oea_credit_grade_periods (
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

CREATE TABLE public.oea_credits (
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

CREATE TABLE public.oea_enrollments (
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

CREATE TABLE public.org_classes (
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
  show_assistants boolean DEFAULT true NOT NULL
);

CREATE TABLE public.org_course_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  course_id uuid NOT NULL,
  teacher_id uuid,
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tuition_cents integer
);

CREATE TABLE public.org_invitations (
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

CREATE TABLE public.org_kiosk_devices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL,
  class_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone
);

CREATE TABLE public.org_quest_group_items (
  group_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  added_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.org_quest_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.org_resources (
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
  visible_to_roles text[]
);

CREATE TABLE public.organization_course_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  course_id uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now(),
  granted_by uuid
);

CREATE TABLE public.organization_quest_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now(),
  granted_by uuid
);

CREATE TABLE public.organization_secrets (
  organization_id uuid NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

CREATE TABLE public.organizations (
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
  accreditation_source text DEFAULT 'none'::text NOT NULL
);

CREATE TABLE public.parent_student_links (
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

CREATE TABLE public.parental_consent_log (
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

CREATE TABLE public.password_reset_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  attempt_count integer DEFAULT 0 NOT NULL,
  lockout_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.password_reset_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean DEFAULT false,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.philosophy_edges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  edge_type text DEFAULT 'includes'::text NOT NULL,
  label_text text,
  is_visible boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.philosophy_nodes (
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

CREATE TABLE public.planned_credits (
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

CREATE TABLE public.poe_cohorts (
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

CREATE TABLE public.poe_participants (
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

CREATE TABLE public.poe_signups (
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

CREATE TABLE public.portfolio_visibility_reset_20260801 (
  user_id uuid NOT NULL,
  portfolio_slug text,
  was_public boolean NOT NULL,
  had_consent boolean NOT NULL,
  was_minor boolean NOT NULL,
  reset_at timestamp with time zone DEFAULT now() NOT NULL,
  notified_at timestamp with time zone
);

CREATE TABLE public.portfolio_visibility_reset_20260802 (
  user_id uuid NOT NULL,
  portfolio_slug text,
  was_public boolean NOT NULL,
  consent_given_by uuid,
  was_self_consented boolean NOT NULL,
  was_minor boolean NOT NULL,
  reset_at timestamp with time zone DEFAULT now() NOT NULL,
  notified_at timestamp with time zone
);

CREATE TABLE public.promo_interest (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  classes_interested text,
  source text DEFAULT 'for-students'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.public_visibility_requests (
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

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  last_used_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.quest_invitations (
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

CREATE TABLE public.quest_personalization_sessions (
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

CREATE TABLE public.quest_sample_tasks (
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

CREATE TABLE public.quest_sources (
  id text NOT NULL,
  name text NOT NULL,
  header_image_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.quest_task_completions (
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

CREATE TABLE public.quest_template_tasks (
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

CREATE TABLE public.quests (
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
  recommended_age text
);

CREATE TABLE public.role_change_log (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid,
  changed_by uuid,
  old_role text,
  new_role text,
  reason text,
  changed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.scheduled_jobs (
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

CREATE TABLE public.school_enrollments (
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

CREATE TABLE public.security_warnings_documentation (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warning_type character varying(100) NOT NULL,
  description text NOT NULL,
  required_action text NOT NULL,
  responsible_party character varying(50) NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.sis_age_exception_requests (
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

CREATE TABLE public.sis_announcements (
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
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_assignment_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  class_id uuid,
  name text NOT NULL,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_attendance (
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

CREATE TABLE public.sis_attendance_alerts (
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

CREATE TABLE public.sis_billing_audit (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  invoice_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_carpool_posts (
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

CREATE TABLE public.sis_clp_records (
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

CREATE TABLE public.sis_curriculum (
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

CREATE TABLE public.sis_curriculum_classes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  curriculum_id uuid NOT NULL,
  class_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_curriculum_courses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  curriculum_id uuid NOT NULL,
  course_id uuid NOT NULL,
  sequence_order integer DEFAULT 0 NOT NULL,
  added_by uuid,
  added_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_curriculum_quests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  curriculum_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  sequence_order integer DEFAULT 0 NOT NULL,
  added_by uuid,
  added_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_discount_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  rule_type text NOT NULL,
  criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_engagement_alerts (
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

CREATE TABLE public.sis_enrollment_waitlist (
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

CREATE TABLE public.sis_events (
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
  categories text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE public.sis_family_directives (
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

CREATE TABLE public.sis_form_comments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  submission_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_form_submissions (
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
  due_date date
);

CREATE TABLE public.sis_installments (
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

CREATE TABLE public.sis_invoice_line_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  class_id uuid,
  amount_cents integer DEFAULT 0 NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_invoices (
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

CREATE TABLE public.sis_learning_day_selections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  choice text NOT NULL,
  answers jsonb DEFAULT '{}'::jsonb NOT NULL,
  selected_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_lost_found (
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

CREATE TABLE public.sis_onboarding_assignments (
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
  audience text DEFAULT 'staff'::text NOT NULL
);

CREATE TABLE public.sis_onboarding_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  role_type text,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  audience text DEFAULT 'staff'::text NOT NULL
);

CREATE TABLE public.sis_payment_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  cadence text NOT NULL,
  installment_count integer DEFAULT 1 NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  auto_charge boolean DEFAULT false NOT NULL,
  saved_payment_method_id uuid
);

CREATE TABLE public.sis_payment_records (
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

CREATE TABLE public.sis_payment_reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  installment_id uuid,
  sent_to text NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_quickbooks_sync_log (
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

CREATE TABLE public.sis_recognition (
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

CREATE TABLE public.sis_registration_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  registration_id uuid NOT NULL,
  class_id uuid NOT NULL,
  status text DEFAULT 'selected'::text NOT NULL,
  price_snapshot_cents integer,
  discount_snapshot_cents integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_registrations (
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

CREATE TABLE public.sis_resource_acks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  resource_id uuid NOT NULL,
  user_id uuid NOT NULL,
  version_date timestamp with time zone,
  acknowledged_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_saved_payment_methods (
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

CREATE TABLE public.sis_schedule_submissions (
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

CREATE TABLE public.sis_secure_documents (
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
  title text
);

CREATE TABLE public.sis_staff_assignments (
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

CREATE TABLE public.sis_staff_profiles (
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

CREATE TABLE public.sis_staff_training (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  category text,
  is_required boolean DEFAULT false NOT NULL,
  sequence_order integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  audience text DEFAULT 'staff'::text NOT NULL,
  visible_to_roles text[]
);

CREATE TABLE public.sis_student_assignments (
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

CREATE TABLE public.sis_student_goals (
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

CREATE TABLE public.sis_student_materials (
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

CREATE TABLE public.sis_student_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  profile jsonb DEFAULT '{}'::jsonb NOT NULL,
  assessments jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_submission_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  completion_id uuid NOT NULL,
  reviewed_by uuid NOT NULL,
  action text DEFAULT 'accepted'::text NOT NULL,
  reviewed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sis_time_entries (
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

CREATE TABLE public.sis_waitlist_entries (
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

CREATE TABLE public.sis_xp_adjustments (
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

CREATE TABLE public.site_settings (
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

CREATE TABLE public.student_access_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  accessor_id uuid NOT NULL,
  accessor_role text NOT NULL,
  data_accessed jsonb NOT NULL,
  access_timestamp timestamp with time zone DEFAULT now(),
  purpose text,
  ip_address inet,
  user_agent text
);

CREATE TABLE public.student_planned_absences (
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

CREATE TABLE public.student_wallets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  spendable_xp integer DEFAULT 0 NOT NULL,
  total_xp_spent integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.task_feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  completion_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  feedback_text text NOT NULL,
  revision_number integer NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.task_steps (
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

CREATE TABLE public.transcript_overrides (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.transcript_share_tokens (
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

CREATE TABLE public.transcript_transfer_log (
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

CREATE TABLE public.transfer_credits (
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
  course_names jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.treehouse_kiosk_devices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  label text NOT NULL,
  token_hash text NOT NULL,
  created_by uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_used_at timestamp with time zone
);

CREATE TABLE public.treehouse_pins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  student_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  status text DEFAULT 'created'::text NOT NULL,
  marked_by uuid,
  marked_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.treehouse_showcase_events (
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

CREATE TABLE public.treehouse_showcase_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL,
  student_id uuid NOT NULL,
  project_title text,
  project_category text,
  quest_id uuid,
  joined_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.treehouse_signals (
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

CREATE TABLE public.tutor_conversations (
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

CREATE TABLE public.tutor_messages (
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

CREATE TABLE public.tutor_safety_reports (
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

CREATE TABLE public.tutor_settings (
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

CREATE TABLE public.tutor_tier_limits (
  tier character varying(20) NOT NULL,
  daily_message_limit integer NOT NULL,
  features text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tutorial_verification_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  task_id uuid NOT NULL,
  verified_at timestamp with time zone DEFAULT now(),
  verification_data jsonb
);

CREATE TABLE public.user_activity_events (
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

CREATE TABLE public.user_blocks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_mastery (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  total_xp integer DEFAULT 0 NOT NULL,
  mastery_level integer DEFAULT 1 NOT NULL,
  last_updated timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_quest_tasks (
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

CREATE TABLE public.user_quests (
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

CREATE TABLE public.user_skill_details (
  id integer DEFAULT nextval('user_skill_details_id_seq'::regclass) NOT NULL,
  user_id uuid,
  skill_name text NOT NULL,
  times_practiced integer DEFAULT 0,
  last_practiced timestamp without time zone
);

CREATE TABLE public.user_skill_xp (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  pillar text NOT NULL,
  xp_amount integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_subject_xp (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  school_subject school_subject NOT NULL,
  xp_amount integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  pending_xp integer DEFAULT 0
);

CREATE TABLE public.user_task_evidence_documents (
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

CREATE TABLE public.users (
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
  preferred_challenge_level text
);

CREATE TABLE public.xp_award_failures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  task_id uuid,
  pillar text NOT NULL,
  xp_amount integer NOT NULL,
  reason text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- ============================================================
-- functions
-- ============================================================

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
$function$;

CREATE OR REPLACE FUNCTION public.add_user_skill_xp(p_user_id uuid, p_pillar text, p_xp_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Input validation
    IF p_user_id IS NULL OR p_pillar IS NULL OR p_xp_amount IS NULL THEN
        RAISE EXCEPTION 'All parameters are required';
    END IF;

    IF p_xp_amount < 0 OR p_xp_amount > 10000 THEN
        RAISE EXCEPTION 'XP amount must be between 0 and 10000';
    END IF;

    -- Validate pillar is one of the allowed values
    IF p_pillar NOT IN ('stem', 'wellness', 'communication', 'civics', 'art') THEN
        RAISE EXCEPTION 'Invalid pillar. Must be one of: stem, wellness, communication, civics, art';
    END IF;

    -- Insert or update user_skill_xp
    INSERT INTO user_skill_xp (user_id, pillar, xp_amount)
    VALUES (p_user_id, p_pillar, p_xp_amount)
    ON CONFLICT (user_id, pillar)
    DO UPDATE SET
        xp_amount = user_skill_xp.xp_amount + p_xp_amount,
        updated_at = NOW();

    -- Also update total_xp on users table
    UPDATE users
    SET total_xp = total_xp + p_xp_amount,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.calculate_age(birth_date date)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  RETURN EXTRACT(YEAR FROM AGE(birth_date));
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.calculate_promotion_eligible_date(dob date)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN dob + INTERVAL '13 years';
END;
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_spark_codes()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    DELETE FROM spark_auth_codes
    WHERE expires_at < NOW() OR used = TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_user_data()
 RETURNS trigger
 LANGUAGE plpgsql
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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.generate_portfolio_slug()
 RETURNS trigger
 LANGUAGE plpgsql
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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_auth_user_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    RETURN auth.uid();
END;
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_human_quest_performance(days_back_param integer)
 RETURNS TABLE(total_quests bigint, avg_completion_rate numeric, avg_rating numeric, avg_engagement_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    date_cutoff TIMESTAMPTZ;
BEGIN
    -- Input validation
    IF days_back_param IS NULL OR days_back_param < 1 OR days_back_param > 365 THEN
        RAISE EXCEPTION 'days_back_param must be between 1 and 365';
    END IF;

    -- Safe INTERVAL construction using multiplication (no string concatenation)
    date_cutoff := NOW() - (days_back_param * INTERVAL '1 day');

    RETURN QUERY
    SELECT
        COUNT(DISTINCT q.id) as total_quests,
        COALESCE(
            AVG(
                CASE
                    WHEN uq_counts.total_enrollments > 0
                    THEN uq_counts.completed_count::DECIMAL / uq_counts.total_enrollments
                    ELSE 0
                END
            ),
            0
        ) as avg_completion_rate,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COALESCE(
            AVG(
                CASE
                    WHEN task_counts.total_tasks > 0 AND uq_counts.total_enrollments > 0
                    THEN tc_counts.completion_count::DECIMAL / (task_counts.total_tasks * uq_counts.total_enrollments)
                    ELSE 0
                END
            ),
            0
        ) as avg_engagement_score
    FROM quests q
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) as total_enrollments,
            COUNT(uq.completed_at) as completed_count
        FROM user_quests uq
        WHERE uq.quest_id = q.id
    ) uq_counts ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as total_tasks
        FROM quest_tasks_archived qt
        WHERE qt.quest_id = q.id
    ) task_counts ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as completion_count
        FROM quest_task_completions tc
        WHERE tc.quest_id = q.id
    ) tc_counts ON TRUE
    LEFT JOIN quest_ratings r ON r.quest_id = q.id
    WHERE
        q.created_at >= date_cutoff
        AND q.source NOT IN ('ai_generated', 'custom')
        AND q.is_active = TRUE;
END;
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_org_total_xp(org_id_param uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT COALESCE(SUM(total_xp), 0)
    FROM users
    WHERE organization_id = org_id_param;
$function$;

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
  $function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_parent_for_minor(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_tutorial_quest_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    SELECT id FROM quests WHERE is_tutorial = TRUE LIMIT 1;
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.get_user_organization(p_user_id uuid)
 RETURNS TABLE(organization_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT u.organization_id
  FROM users u
  WHERE u.id = p_user_id;
END;
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.is_minor(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.log_observer_access(p_observer_id uuid, p_student_id uuid, p_action_type character varying, p_resource_type character varying DEFAULT NULL::character varying, p_resource_id uuid DEFAULT NULL::uuid, p_ip_address character varying DEFAULT NULL::character varying, p_user_agent text DEFAULT NULL::text, p_request_path text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO observer_access_audit (
        observer_id,
        student_id,
        action_type,
        resource_type,
        resource_id,
        ip_address,
        user_agent,
        request_path,
        metadata
    ) VALUES (
        p_observer_id,
        p_student_id,
        p_action_type,
        p_resource_type,
        p_resource_id,
        p_ip_address,
        p_user_agent,
        p_request_path,
        p_metadata
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Delete the corresponding auth.users record
    DELETE FROM auth.users WHERE id = OLD.id;

    RAISE LOG 'Synced deletion of user % from auth.users', OLD.id;

    RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_is_org_admin()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
                                                                                                                                                                                                            BEGIN
                                                                                                                                                                                                                NEW.is_org_admin :=
                                                                                                                                                                                                                        NEW.role = 'org_admin'
                                                                                                                                                                                                                                OR NEW.org_role = 'org_admin'
                                                                                                                                                                                                                                        OR COALESCE(NEW.org_roles ? 'org_admin', FALSE);
                                                                                                                                                                                                                                            RETURN NEW;
                                                                                                                                                                                                                                            END;
                                                                                                                                                                                                                                            $function$;

CREATE OR REPLACE FUNCTION public.update_advisor_checkins_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_advisor_notes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.update_ai_metrics_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_ai_quest_review_queue_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_announcements_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_class_attendance_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_contact_submissions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.update_course_plan_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_course_refine_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_curriculum_attachments_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_curriculum_lesson_progress_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.update_curriculum_lessons_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_curriculum_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.update_evidence_report_configs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_group_conversation_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.update_learning_events_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_org_classes_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_org_invitations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_philosophy_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.update_quest_invitations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.update_quest_templates_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_services_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

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
$function$;

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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.validate_org_roles(roles jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
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
                                                                                                                    $function$;

CREATE OR REPLACE FUNCTION public.verify_parent_student_access(p_parent_id uuid, p_student_id uuid)
 RETURNS TABLE(has_access boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN QUERY
    SELECT EXISTS (
        -- Check if parent is linked to 13+ student
        SELECT 1 FROM parent_student_links
        WHERE parent_id = p_parent_id
          AND student_id = p_student_id
          AND status = 'accepted'
        
        UNION
        
        -- Check if student is a dependent of parent
        SELECT 1 FROM users
        WHERE id = p_student_id
          AND is_dependent = TRUE
          AND managed_by_parent_id = p_parent_id
    );
END;
$function$;

-- ============================================================
-- primary keys, unique, check
-- ============================================================

ALTER TABLE account_deletion_log ADD CONSTRAINT account_deletion_log_pkey PRIMARY KEY (id);
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE admin_masquerade_log ADD CONSTRAINT admin_masquerade_log_pkey PRIMARY KEY (id);
ALTER TABLE advisor_checkins ADD CONSTRAINT advisor_checkins_pkey PRIMARY KEY (id);
ALTER TABLE advisor_notes ADD CONSTRAINT advisor_notes_pkey PRIMARY KEY (id);
ALTER TABLE advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_pkey PRIMARY KEY (id);
ALTER TABLE ai_generated_quests ADD CONSTRAINT ai_generated_quests_pkey PRIMARY KEY (id);
ALTER TABLE ai_generation_jobs ADD CONSTRAINT ai_generation_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ai_prompt_components ADD CONSTRAINT ai_prompt_components_pkey PRIMARY KEY (id);
ALTER TABLE ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_pkey PRIMARY KEY (id);
ALTER TABLE ai_seeds ADD CONSTRAINT ai_seeds_pkey PRIMARY KEY (id);
ALTER TABLE ai_task_cache ADD CONSTRAINT ai_task_cache_pkey PRIMARY KEY (id);
ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);
ALTER TABLE announcement_reads ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (id);
ALTER TABLE announcements ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE automation_sequences ADD CONSTRAINT automation_sequences_pkey PRIMARY KEY (id);
ALTER TABLE bounties ADD CONSTRAINT bounties_pkey PRIMARY KEY (id);
ALTER TABLE bounty_claims ADD CONSTRAINT bounty_claims_pkey PRIMARY KEY (id);
ALTER TABLE bounty_reviews ADD CONSTRAINT bounty_reviews_pkey PRIMARY KEY (id);
ALTER TABLE buddies ADD CONSTRAINT buddies_pkey PRIMARY KEY (id);
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);
ALTER TABLE class_advisors ADD CONSTRAINT class_advisors_pkey PRIMARY KEY (id);
ALTER TABLE class_discussion_posts ADD CONSTRAINT class_discussion_posts_pkey PRIMARY KEY (id);
ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE class_materials ADD CONSTRAINT class_materials_pkey PRIMARY KEY (id);
ALTER TABLE class_meetings ADD CONSTRAINT class_meetings_pkey PRIMARY KEY (id);
ALTER TABLE class_prerequisites ADD CONSTRAINT class_prerequisites_pkey PRIMARY KEY (id);
ALTER TABLE class_quests ADD CONSTRAINT class_quests_pkey PRIMARY KEY (id);
ALTER TABLE consultation_requests ADD CONSTRAINT consultation_requests_pkey PRIMARY KEY (id);
ALTER TABLE contact_submissions ADD CONSTRAINT contact_submissions_pkey PRIMARY KEY (id);
ALTER TABLE content_reports ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);
ALTER TABLE course_enrollments ADD CONSTRAINT course_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE course_generation_jobs ADD CONSTRAINT course_generation_jobs_pkey PRIMARY KEY (id);
ALTER TABLE course_plan_sessions ADD CONSTRAINT course_plan_sessions_pkey PRIMARY KEY (id);
ALTER TABLE course_quest_tasks ADD CONSTRAINT course_quest_tasks_pkey PRIMARY KEY (id);
ALTER TABLE course_quests ADD CONSTRAINT course_quests_pkey PRIMARY KEY (id);
ALTER TABLE course_refine_sessions ADD CONSTRAINT course_refine_sessions_pkey PRIMARY KEY (id);
ALTER TABLE courses ADD CONSTRAINT courses_pkey PRIMARY KEY (id);
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_pkey PRIMARY KEY (id);
ALTER TABLE credit_review_messages ADD CONSTRAINT credit_review_messages_pkey PRIMARY KEY (id);
ALTER TABLE curriculum_attachments ADD CONSTRAINT curriculum_attachments_pkey PRIMARY KEY (id);
ALTER TABLE curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_pkey PRIMARY KEY (id);
ALTER TABLE curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_pkey PRIMARY KEY (id);
ALTER TABLE curriculum_lessons ADD CONSTRAINT curriculum_lessons_pkey PRIMARY KEY (id);
ALTER TABLE curriculum_settings ADD CONSTRAINT curriculum_settings_pkey PRIMARY KEY (id);
ALTER TABLE curriculum_uploads ADD CONSTRAINT curriculum_uploads_pkey PRIMARY KEY (id);
ALTER TABLE device_tokens ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);
ALTER TABLE diploma_review_rounds ADD CONSTRAINT diploma_review_rounds_pkey PRIMARY KEY (id);
ALTER TABLE diplomas ADD CONSTRAINT diplomas_pkey PRIMARY KEY (id);
ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);
ALTER TABLE docs_articles ADD CONSTRAINT docs_articles_pkey PRIMARY KEY (id);
ALTER TABLE docs_categories ADD CONSTRAINT docs_categories_pkey PRIMARY KEY (id);
ALTER TABLE docs_search_misses ADD CONSTRAINT docs_search_misses_pkey PRIMARY KEY (id);
ALTER TABLE email_templates ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);
ALTER TABLE emergency_contacts ADD CONSTRAINT emergency_contacts_pkey PRIMARY KEY (id);
ALTER TABLE evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_pkey PRIMARY KEY (id);
ALTER TABLE evidence_report_configs ADD CONSTRAINT evidence_report_configs_pkey PRIMARY KEY (id);
ALTER TABLE evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_pkey PRIMARY KEY (id);
ALTER TABLE feed_highlights ADD CONSTRAINT feed_highlights_pkey PRIMARY KEY (id);
ALTER TABLE feed_item_views ADD CONSTRAINT feed_item_views_pkey PRIMARY KEY (id);
ALTER TABLE feed_share_tokens ADD CONSTRAINT feed_share_tokens_pkey PRIMARY KEY (id);
ALTER TABLE group_conversations ADD CONSTRAINT group_conversations_pkey PRIMARY KEY (id);
ALTER TABLE group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);
ALTER TABLE group_messages ADD CONSTRAINT group_messages_pkey PRIMARY KEY (id);
ALTER TABLE household_members ADD CONSTRAINT household_members_pkey PRIMARY KEY (id);
ALTER TABLE households ADD CONSTRAINT households_pkey PRIMARY KEY (id);
ALTER TABLE icreate_registrations ADD CONSTRAINT icreate_registrations_pkey PRIMARY KEY (id);
ALTER TABLE interest_tracks ADD CONSTRAINT interest_tracks_pkey PRIMARY KEY (id);
ALTER TABLE learning_event_evidence_blocks ADD CONSTRAINT learning_event_evidence_blocks_pkey PRIMARY KEY (id);
ALTER TABLE learning_event_topics ADD CONSTRAINT learning_event_topics_pkey PRIMARY KEY (id);
ALTER TABLE learning_events ADD CONSTRAINT learning_events_pkey PRIMARY KEY (id);
ALTER TABLE lesson_reflections ADD CONSTRAINT lesson_reflections_pkey PRIMARY KEY (id);
ALTER TABLE lms_grade_sync ADD CONSTRAINT lms_grade_sync_pkey PRIMARY KEY (id);
ALTER TABLE lms_integrations ADD CONSTRAINT lms_integrations_pkey PRIMARY KEY (id);
ALTER TABLE lms_sessions ADD CONSTRAINT lms_sessions_pkey PRIMARY KEY (id);
ALTER TABLE login_attempts ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);
ALTER TABLE lti_auth_codes ADD CONSTRAINT lti_auth_codes_pkey PRIMARY KEY (code);
ALTER TABLE lti_nonces ADD CONSTRAINT lti_nonces_pkey PRIMARY KEY (nonce);
ALTER TABLE lti_pending_launches ADD CONSTRAINT lti_pending_launches_pkey PRIMARY KEY (id);
ALTER TABLE lti_registrations ADD CONSTRAINT lti_registrations_pkey PRIMARY KEY (id);
ALTER TABLE message_conversations ADD CONSTRAINT message_conversations_pkey PRIMARY KEY (id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);
ALTER TABLE notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE observer_access_audit ADD CONSTRAINT observer_access_audit_pkey PRIMARY KEY (id);
ALTER TABLE observer_comments ADD CONSTRAINT observer_comments_pkey PRIMARY KEY (id);
ALTER TABLE observer_invitation_students ADD CONSTRAINT observer_invitation_students_pkey PRIMARY KEY (id);
ALTER TABLE observer_invitations ADD CONSTRAINT observer_invitations_pkey PRIMARY KEY (id);
ALTER TABLE observer_student_links ADD CONSTRAINT observer_student_links_pkey PRIMARY KEY (id);
ALTER TABLE oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_pkey PRIMARY KEY (id);
ALTER TABLE oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_pkey PRIMARY KEY (id);
ALTER TABLE oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_pkey PRIMARY KEY (id);
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_pkey PRIMARY KEY (id);
ALTER TABLE oea_enrollments ADD CONSTRAINT oea_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE org_classes ADD CONSTRAINT org_classes_pkey PRIMARY KEY (id);
ALTER TABLE org_course_settings ADD CONSTRAINT org_course_teachers_pkey PRIMARY KEY (id);
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_pkey PRIMARY KEY (id);
ALTER TABLE org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_pkey PRIMARY KEY (id);
ALTER TABLE org_quest_group_items ADD CONSTRAINT org_quest_group_items_pkey PRIMARY KEY (group_id, quest_id);
ALTER TABLE org_quest_groups ADD CONSTRAINT org_quest_groups_pkey PRIMARY KEY (id);
ALTER TABLE org_resources ADD CONSTRAINT org_resources_pkey PRIMARY KEY (id);
ALTER TABLE organization_course_access ADD CONSTRAINT organization_course_access_pkey PRIMARY KEY (id);
ALTER TABLE organization_quest_access ADD CONSTRAINT organization_quest_access_pkey PRIMARY KEY (id);
ALTER TABLE organization_secrets ADD CONSTRAINT organization_secrets_pkey PRIMARY KEY (organization_id, name);
ALTER TABLE organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE parent_student_links ADD CONSTRAINT parent_student_links_pkey PRIMARY KEY (id);
ALTER TABLE parental_consent_log ADD CONSTRAINT parental_consent_log_pkey PRIMARY KEY (id);
ALTER TABLE password_reset_attempts ADD CONSTRAINT password_reset_attempts_pkey PRIMARY KEY (id);
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);
ALTER TABLE philosophy_edges ADD CONSTRAINT philosophy_edges_pkey PRIMARY KEY (id);
ALTER TABLE philosophy_nodes ADD CONSTRAINT philosophy_nodes_pkey PRIMARY KEY (id);
ALTER TABLE planned_credits ADD CONSTRAINT planned_credits_pkey PRIMARY KEY (id);
ALTER TABLE poe_cohorts ADD CONSTRAINT poe_cohorts_pkey PRIMARY KEY (id);
ALTER TABLE poe_participants ADD CONSTRAINT poe_participants_pkey PRIMARY KEY (id);
ALTER TABLE poe_signups ADD CONSTRAINT poe_signups_pkey PRIMARY KEY (id);
ALTER TABLE portfolio_visibility_reset_20260801 ADD CONSTRAINT portfolio_visibility_reset_20260801_pkey PRIMARY KEY (user_id);
ALTER TABLE portfolio_visibility_reset_20260802 ADD CONSTRAINT portfolio_visibility_reset_20260802_pkey PRIMARY KEY (user_id);
ALTER TABLE promo_interest ADD CONSTRAINT promo_interest_pkey PRIMARY KEY (id);
ALTER TABLE public_visibility_requests ADD CONSTRAINT public_visibility_requests_pkey PRIMARY KEY (id);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE quest_invitations ADD CONSTRAINT quest_invitations_pkey PRIMARY KEY (id);
ALTER TABLE quest_personalization_sessions ADD CONSTRAINT quest_personalization_sessions_pkey PRIMARY KEY (id);
ALTER TABLE quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_pkey PRIMARY KEY (id);
ALTER TABLE quest_sources ADD CONSTRAINT quest_sources_pkey PRIMARY KEY (id);
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_pkey PRIMARY KEY (id);
ALTER TABLE quest_template_tasks ADD CONSTRAINT quest_template_tasks_pkey PRIMARY KEY (id);
ALTER TABLE quests ADD CONSTRAINT quests_pkey PRIMARY KEY (id);
ALTER TABLE role_change_log ADD CONSTRAINT role_change_log_pkey PRIMARY KEY (id);
ALTER TABLE scheduled_jobs ADD CONSTRAINT scheduled_jobs_pkey PRIMARY KEY (id);
ALTER TABLE school_enrollments ADD CONSTRAINT school_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE security_warnings_documentation ADD CONSTRAINT security_warnings_documentation_pkey PRIMARY KEY (id);
ALTER TABLE sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_pkey PRIMARY KEY (id);
ALTER TABLE sis_announcements ADD CONSTRAINT sis_announcements_pkey PRIMARY KEY (id);
ALTER TABLE sis_assignment_templates ADD CONSTRAINT sis_assignment_templates_pkey PRIMARY KEY (id);
ALTER TABLE sis_attendance ADD CONSTRAINT sis_attendance_pkey PRIMARY KEY (id);
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_pkey PRIMARY KEY (id);
ALTER TABLE sis_billing_audit ADD CONSTRAINT sis_billing_audit_pkey PRIMARY KEY (id);
ALTER TABLE sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_pkey PRIMARY KEY (id);
ALTER TABLE sis_clp_records ADD CONSTRAINT sis_clp_records_pkey PRIMARY KEY (id);
ALTER TABLE sis_curriculum ADD CONSTRAINT sis_curriculum_pkey PRIMARY KEY (id);
ALTER TABLE sis_curriculum_classes ADD CONSTRAINT sis_curriculum_classes_pkey PRIMARY KEY (id);
ALTER TABLE sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_pkey PRIMARY KEY (id);
ALTER TABLE sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_pkey PRIMARY KEY (id);
ALTER TABLE sis_discount_rules ADD CONSTRAINT sis_discount_rules_pkey PRIMARY KEY (id);
ALTER TABLE sis_engagement_alerts ADD CONSTRAINT sis_engagement_alerts_pkey PRIMARY KEY (id);
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_pkey PRIMARY KEY (id);
ALTER TABLE sis_events ADD CONSTRAINT sis_events_pkey PRIMARY KEY (id);
ALTER TABLE sis_family_directives ADD CONSTRAINT sis_family_directives_pkey PRIMARY KEY (id);
ALTER TABLE sis_form_comments ADD CONSTRAINT sis_form_comments_pkey PRIMARY KEY (id);
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_pkey PRIMARY KEY (id);
ALTER TABLE sis_installments ADD CONSTRAINT sis_installments_pkey PRIMARY KEY (id);
ALTER TABLE sis_invoice_line_items ADD CONSTRAINT sis_invoice_line_items_pkey PRIMARY KEY (id);
ALTER TABLE sis_invoices ADD CONSTRAINT sis_invoices_pkey PRIMARY KEY (id);
ALTER TABLE sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_pkey PRIMARY KEY (id);
ALTER TABLE sis_lost_found ADD CONSTRAINT sis_lost_found_pkey PRIMARY KEY (id);
ALTER TABLE sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_pkey PRIMARY KEY (id);
ALTER TABLE sis_onboarding_templates ADD CONSTRAINT sis_onboarding_templates_pkey PRIMARY KEY (id);
ALTER TABLE sis_payment_plans ADD CONSTRAINT sis_payment_plans_pkey PRIMARY KEY (id);
ALTER TABLE sis_payment_records ADD CONSTRAINT sis_payment_records_pkey PRIMARY KEY (id);
ALTER TABLE sis_payment_reminders ADD CONSTRAINT sis_payment_reminders_pkey PRIMARY KEY (id);
ALTER TABLE sis_quickbooks_sync_log ADD CONSTRAINT sis_quickbooks_sync_log_pkey PRIMARY KEY (id);
ALTER TABLE sis_recognition ADD CONSTRAINT sis_recognition_pkey PRIMARY KEY (id);
ALTER TABLE sis_registration_items ADD CONSTRAINT sis_registration_items_pkey PRIMARY KEY (id);
ALTER TABLE sis_registrations ADD CONSTRAINT sis_registrations_pkey PRIMARY KEY (id);
ALTER TABLE sis_resource_acks ADD CONSTRAINT sis_resource_acks_pkey PRIMARY KEY (id);
ALTER TABLE sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_pkey PRIMARY KEY (id);
ALTER TABLE sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_pkey PRIMARY KEY (id);
ALTER TABLE sis_secure_documents ADD CONSTRAINT sis_secure_documents_pkey PRIMARY KEY (id);
ALTER TABLE sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_pkey PRIMARY KEY (id);
ALTER TABLE sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_pkey PRIMARY KEY (user_id);
ALTER TABLE sis_staff_training ADD CONSTRAINT sis_staff_training_pkey PRIMARY KEY (id);
ALTER TABLE sis_student_assignments ADD CONSTRAINT sis_student_assignments_pkey PRIMARY KEY (id);
ALTER TABLE sis_student_goals ADD CONSTRAINT sis_student_goals_pkey PRIMARY KEY (id);
ALTER TABLE sis_student_materials ADD CONSTRAINT sis_student_materials_pkey PRIMARY KEY (id);
ALTER TABLE sis_student_records ADD CONSTRAINT sis_student_records_pkey PRIMARY KEY (id);
ALTER TABLE sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_pkey PRIMARY KEY (id);
ALTER TABLE sis_time_entries ADD CONSTRAINT sis_time_entries_pkey PRIMARY KEY (id);
ALTER TABLE sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_pkey PRIMARY KEY (id);
ALTER TABLE sis_xp_adjustments ADD CONSTRAINT sis_xp_adjustments_pkey PRIMARY KEY (id);
ALTER TABLE site_settings ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);
ALTER TABLE student_access_logs ADD CONSTRAINT student_access_logs_pkey PRIMARY KEY (id);
ALTER TABLE student_planned_absences ADD CONSTRAINT student_planned_absences_pkey PRIMARY KEY (id);
ALTER TABLE student_wallets ADD CONSTRAINT student_wallets_pkey PRIMARY KEY (id);
ALTER TABLE task_feedback ADD CONSTRAINT task_feedback_pkey PRIMARY KEY (id);
ALTER TABLE task_steps ADD CONSTRAINT task_steps_pkey PRIMARY KEY (id);
ALTER TABLE transcript_overrides ADD CONSTRAINT transcript_overrides_pkey PRIMARY KEY (id);
ALTER TABLE transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_pkey PRIMARY KEY (id);
ALTER TABLE transcript_transfer_log ADD CONSTRAINT transcript_transfer_log_pkey PRIMARY KEY (id);
ALTER TABLE transfer_credits ADD CONSTRAINT transfer_credits_pkey PRIMARY KEY (id);
ALTER TABLE treehouse_kiosk_devices ADD CONSTRAINT treehouse_kiosk_devices_pkey PRIMARY KEY (id);
ALTER TABLE treehouse_pins ADD CONSTRAINT treehouse_pins_pkey PRIMARY KEY (id);
ALTER TABLE treehouse_showcase_events ADD CONSTRAINT treehouse_showcase_events_pkey PRIMARY KEY (id);
ALTER TABLE treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_pkey PRIMARY KEY (id);
ALTER TABLE treehouse_signals ADD CONSTRAINT treehouse_signals_pkey PRIMARY KEY (id);
ALTER TABLE tutor_conversations ADD CONSTRAINT tutor_conversations_pkey PRIMARY KEY (id);
ALTER TABLE tutor_messages ADD CONSTRAINT tutor_messages_pkey PRIMARY KEY (id);
ALTER TABLE tutor_safety_reports ADD CONSTRAINT tutor_safety_reports_pkey PRIMARY KEY (id);
ALTER TABLE tutor_settings ADD CONSTRAINT tutor_settings_pkey PRIMARY KEY (id);
ALTER TABLE tutor_tier_limits ADD CONSTRAINT tutor_tier_limits_pkey PRIMARY KEY (tier);
ALTER TABLE tutorial_verification_log ADD CONSTRAINT tutorial_verification_log_pkey PRIMARY KEY (id);
ALTER TABLE user_activity_events ADD CONSTRAINT user_activity_events_pkey PRIMARY KEY (id);
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);
ALTER TABLE user_mastery ADD CONSTRAINT user_mastery_pkey PRIMARY KEY (id);
ALTER TABLE user_quest_tasks ADD CONSTRAINT user_quest_tasks_pkey1 PRIMARY KEY (id);
ALTER TABLE user_quests ADD CONSTRAINT user_quests_pkey PRIMARY KEY (id);
ALTER TABLE user_skill_details ADD CONSTRAINT user_skill_details_pkey PRIMARY KEY (id);
ALTER TABLE user_skill_xp ADD CONSTRAINT user_skill_xp_pkey PRIMARY KEY (id);
ALTER TABLE user_subject_xp ADD CONSTRAINT user_subject_xp_pkey PRIMARY KEY (id);
ALTER TABLE user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE xp_award_failures ADD CONSTRAINT xp_award_failures_pkey PRIMARY KEY (id);
ALTER TABLE advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_advisor_id_student_id_key UNIQUE (advisor_id, student_id);
ALTER TABLE ai_prompt_components ADD CONSTRAINT ai_prompt_components_name_key UNIQUE (name);
ALTER TABLE ai_seeds ADD CONSTRAINT ai_seeds_prompt_name_key UNIQUE (prompt_name);
ALTER TABLE announcement_reads ADD CONSTRAINT announcement_reads_unique UNIQUE (announcement_id, user_id);
ALTER TABLE bounty_claims ADD CONSTRAINT unique_student_bounty UNIQUE (bounty_id, student_id);
ALTER TABLE buddies ADD CONSTRAINT buddies_user_id_key UNIQUE (user_id);
ALTER TABLE class_advisors ADD CONSTRAINT class_advisors_class_id_advisor_id_key UNIQUE (class_id, advisor_id);
ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_class_id_student_id_key UNIQUE (class_id, student_id);
ALTER TABLE class_quests ADD CONSTRAINT class_quests_class_id_quest_id_key UNIQUE (class_id, quest_id);
ALTER TABLE content_reports ADD CONSTRAINT unique_reporter_target UNIQUE (reporter_id, target_type, target_id);
ALTER TABLE course_enrollments ADD CONSTRAINT unique_course_enrollment UNIQUE (course_id, user_id);
ALTER TABLE course_quests ADD CONSTRAINT unique_course_quest UNIQUE (course_id, quest_id);
ALTER TABLE course_quests ADD CONSTRAINT unique_course_sequence UNIQUE (course_id, sequence_order);
ALTER TABLE courses ADD CONSTRAINT courses_slug_key UNIQUE (slug);
ALTER TABLE curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_user_id_lesson_id_key UNIQUE (user_id, lesson_id);
ALTER TABLE curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_lesson_id_task_id_key UNIQUE (lesson_id, task_id);
ALTER TABLE curriculum_lessons ADD CONSTRAINT curriculum_lessons_quest_id_sequence_order_key UNIQUE (quest_id, sequence_order);
ALTER TABLE curriculum_settings ADD CONSTRAINT curriculum_settings_quest_id_key UNIQUE (quest_id);
ALTER TABLE device_tokens ADD CONSTRAINT unique_user_token UNIQUE (user_id, token);
ALTER TABLE diplomas ADD CONSTRAINT diplomas_portfolio_slug_key UNIQUE (portfolio_slug);
ALTER TABLE diplomas ADD CONSTRAINT diplomas_user_id_key UNIQUE (user_id);
ALTER TABLE docs_articles ADD CONSTRAINT docs_articles_slug_key UNIQUE (slug);
ALTER TABLE docs_categories ADD CONSTRAINT docs_categories_slug_key UNIQUE (slug);
ALTER TABLE docs_search_misses ADD CONSTRAINT docs_search_misses_normalized_query_key UNIQUE (normalized_query);
ALTER TABLE email_templates ADD CONSTRAINT email_templates_template_key_key UNIQUE (template_key);
ALTER TABLE evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_document_id_order_index_key UNIQUE (document_id, order_index);
ALTER TABLE evidence_report_configs ADD CONSTRAINT evidence_report_configs_access_token_key UNIQUE (access_token);
ALTER TABLE feed_highlights ADD CONSTRAINT feed_highlights_target_type_target_id_key UNIQUE (target_type, target_id);
ALTER TABLE feed_item_views ADD CONSTRAINT unique_view_completion UNIQUE (viewer_id, completion_id);
ALTER TABLE feed_item_views ADD CONSTRAINT unique_view_learning_event UNIQUE (viewer_id, learning_event_id);
ALTER TABLE feed_share_tokens ADD CONSTRAINT feed_share_tokens_token_key UNIQUE (token);
ALTER TABLE group_members ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);
ALTER TABLE household_members ADD CONSTRAINT household_members_household_id_user_id_key UNIQUE (household_id, user_id);
ALTER TABLE learning_event_topics ADD CONSTRAINT learning_event_topics_learning_event_id_topic_type_topic_id_key UNIQUE (learning_event_id, topic_type, topic_id);
ALTER TABLE lesson_reflections ADD CONSTRAINT lesson_reflections_user_id_lesson_id_key UNIQUE (user_id, lesson_id);
ALTER TABLE lms_integrations ADD CONSTRAINT lms_integrations_unique_platform_user UNIQUE (lms_platform, lms_user_id);
ALTER TABLE lti_registrations ADD CONSTRAINT lti_registrations_unique UNIQUE (issuer, client_id, deployment_id);
ALTER TABLE message_conversations ADD CONSTRAINT unique_conversation_participants UNIQUE (participant_1_id, participant_2_id);
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_type_message_id_user_id_emoji_key UNIQUE (message_type, message_id, user_id, emoji);
ALTER TABLE notification_preferences ADD CONSTRAINT unique_user_type UNIQUE (user_id, notification_type);
ALTER TABLE observer_invitation_students ADD CONSTRAINT observer_invitation_students_invitation_id_student_id_key UNIQUE (invitation_id, student_id);
ALTER TABLE observer_invitations ADD CONSTRAINT observer_invitations_invitation_code_key UNIQUE (invitation_code);
ALTER TABLE observer_student_links ADD CONSTRAINT observer_student_links_unique UNIQUE (observer_id, student_id);
ALTER TABLE oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_student_id_credit_id_school_year_term_key UNIQUE (student_id, credit_id, school_year, term_index);
ALTER TABLE oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_credit_id_term_type_term_index_sch_key UNIQUE (credit_id, term_type, term_index, school_year);
ALTER TABLE oea_enrollments ADD CONSTRAINT oea_enrollments_student_id_key UNIQUE (student_id);
ALTER TABLE org_course_settings ADD CONSTRAINT org_course_teachers_organization_id_course_id_key UNIQUE (organization_id, course_id);
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_invitation_code_key UNIQUE (invitation_code);
ALTER TABLE org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_token_hash_key UNIQUE (token_hash);
ALTER TABLE org_quest_groups ADD CONSTRAINT org_quest_groups_organization_id_name_key UNIQUE (organization_id, name);
ALTER TABLE organization_course_access ADD CONSTRAINT organization_course_access_organization_id_course_id_key UNIQUE (organization_id, course_id);
ALTER TABLE organization_quest_access ADD CONSTRAINT organization_quest_access_organization_id_quest_id_key UNIQUE (organization_id, quest_id);
ALTER TABLE organizations ADD CONSTRAINT organizations_slug_key UNIQUE (slug);
ALTER TABLE parent_student_links ADD CONSTRAINT parent_student_links_parent_user_id_student_user_id_key UNIQUE (parent_user_id, student_user_id);
ALTER TABLE password_reset_attempts ADD CONSTRAINT password_reset_attempts_email_key UNIQUE (email);
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);
ALTER TABLE philosophy_nodes ADD CONSTRAINT philosophy_nodes_slug_key UNIQUE (slug);
ALTER TABLE poe_cohorts ADD CONSTRAINT poe_cohorts_slug_key UNIQUE (slug);
ALTER TABLE poe_participants ADD CONSTRAINT poe_participants_user_id_poe_cohort_id_key UNIQUE (user_id, poe_cohort_id);
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_user_id_task_id_key UNIQUE (user_id, task_id);
ALTER TABLE school_enrollments ADD CONSTRAINT school_enrollments_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE sis_attendance ADD CONSTRAINT sis_attendance_class_id_student_user_id_date_key UNIQUE (class_id, student_user_id, date);
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_student_user_id_date_alert_type_key UNIQUE (student_user_id, date, alert_type);
ALTER TABLE sis_clp_records ADD CONSTRAINT sis_clp_records_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE sis_curriculum_classes ADD CONSTRAINT sis_curriculum_classes_curriculum_id_class_id_key UNIQUE (curriculum_id, class_id);
ALTER TABLE sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_curriculum_id_course_id_key UNIQUE (curriculum_id, course_id);
ALTER TABLE sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_curriculum_id_quest_id_key UNIQUE (curriculum_id, quest_id);
ALTER TABLE sis_family_directives ADD CONSTRAINT sis_family_directives_organization_id_email_key UNIQUE (organization_id, email);
ALTER TABLE sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE sis_registration_items ADD CONSTRAINT sis_registration_items_registration_id_class_id_key UNIQUE (registration_id, class_id);
ALTER TABLE sis_resource_acks ADD CONSTRAINT sis_resource_acks_resource_id_user_id_key UNIQUE (resource_id, user_id);
ALTER TABLE sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_organization_id_guardian_user_id_key UNIQUE (organization_id, guardian_user_id);
ALTER TABLE sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE sis_student_goals ADD CONSTRAINT sis_student_goals_organization_id_student_user_id_school_ye_key UNIQUE (organization_id, student_user_id, school_year);
ALTER TABLE sis_student_records ADD CONSTRAINT sis_student_records_organization_id_student_user_id_key UNIQUE (organization_id, student_user_id);
ALTER TABLE sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_completion_id_key UNIQUE (completion_id);
ALTER TABLE sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_class_id_student_user_id_key UNIQUE (class_id, student_user_id);
ALTER TABLE student_wallets ADD CONSTRAINT unique_user_wallet UNIQUE (user_id);
ALTER TABLE transcript_overrides ADD CONSTRAINT transcript_overrides_user_id_key UNIQUE (user_id);
ALTER TABLE transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_token_key UNIQUE (token);
ALTER TABLE transfer_credits ADD CONSTRAINT transfer_credits_user_school_unique UNIQUE (user_id, school_name);
ALTER TABLE treehouse_pins ADD CONSTRAINT treehouse_pins_student_id_quest_id_key UNIQUE (student_id, quest_id);
ALTER TABLE treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_event_id_student_id_key UNIQUE (event_id, student_id);
ALTER TABLE tutor_settings ADD CONSTRAINT tutor_settings_user_id_key UNIQUE (user_id);
ALTER TABLE tutorial_verification_log ADD CONSTRAINT tutorial_verification_log_user_id_task_id_key UNIQUE (user_id, task_id);
ALTER TABLE user_blocks ADD CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id);
ALTER TABLE user_mastery ADD CONSTRAINT user_mastery_user_id_key UNIQUE (user_id);
ALTER TABLE user_skill_details ADD CONSTRAINT user_skill_details_user_id_skill_name_key UNIQUE (user_id, skill_name);
ALTER TABLE user_skill_xp ADD CONSTRAINT user_skill_xp_user_id_pillar_key UNIQUE (user_id, pillar);
ALTER TABLE user_subject_xp ADD CONSTRAINT user_subject_xp_user_id_school_subject_key UNIQUE (user_id, school_subject);
ALTER TABLE user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_user_id_task_id_key UNIQUE (user_id, task_id);
ALTER TABLE users ADD CONSTRAINT users_parental_consent_token_key UNIQUE (parental_consent_token);
ALTER TABLE users ADD CONSTRAINT users_portfolio_slug_key UNIQUE (portfolio_slug);
ALTER TABLE ai_generated_quests ADD CONSTRAINT ai_generated_quests_quality_score_check CHECK (((quality_score >= (0)::numeric) AND (quality_score <= (100)::numeric)));
ALTER TABLE ai_generated_quests ADD CONSTRAINT ai_generated_quests_review_status_check CHECK (((review_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'modified'::character varying, 'published'::character varying])::text[])));
ALTER TABLE ai_generation_jobs ADD CONSTRAINT ai_generation_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])));
ALTER TABLE ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_generation_source_check CHECK (((generation_source)::text = ANY ((ARRAY['manual'::character varying, 'batch'::character varying, 'student_idea'::character varying, 'badge_aligned'::character varying])::text[])));
ALTER TABLE ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_quality_score_check CHECK (((quality_score >= (0)::numeric) AND (quality_score <= (10)::numeric)));
ALTER TABLE ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'edited'::character varying])::text[])));
ALTER TABLE bounties ADD CONSTRAINT bounties_bounty_type_check CHECK ((bounty_type = ANY (ARRAY['open'::text, 'challenge'::text, 'family'::text, 'org'::text, 'sponsored'::text])));
ALTER TABLE bounties ADD CONSTRAINT bounties_max_participants_check CHECK ((max_participants >= 0));
ALTER TABLE bounties ADD CONSTRAINT bounties_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'ai_approved'::text, 'manually_approved'::text, 'rejected'::text])));
ALTER TABLE bounties ADD CONSTRAINT bounties_pillar_check CHECK ((pillar = ANY (ARRAY['stem'::text, 'art'::text, 'communication'::text, 'civics'::text, 'wellness'::text])));
ALTER TABLE bounties ADD CONSTRAINT bounties_platform_fee_cents_check CHECK (((platform_fee_cents IS NULL) OR (platform_fee_cents >= 0)));
ALTER TABLE bounties ADD CONSTRAINT bounties_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'active'::text, 'completed'::text, 'expired'::text, 'rejected'::text])));
ALTER TABLE bounties ADD CONSTRAINT bounties_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'organization'::text, 'family'::text])));
ALTER TABLE bounties ADD CONSTRAINT bounties_xp_reward_check CHECK (((xp_reward >= 0) AND (xp_reward <= 500)));
ALTER TABLE bounties ADD CONSTRAINT chk_bounties_audience CHECK ((audience = ANY (ARRAY['students'::text, 'staff'::text])));
ALTER TABLE bounty_claims ADD CONSTRAINT bounty_claims_status_check CHECK ((status = ANY (ARRAY['claimed'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'revision_requested'::text])));
ALTER TABLE bounty_reviews ADD CONSTRAINT bounty_reviews_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text, 'revision_requested'::text])));
ALTER TABLE buddies ADD CONSTRAINT buddies_bond_check CHECK (((bond >= (0)::double precision) AND (bond <= (1)::double precision)));
ALTER TABLE buddies ADD CONSTRAINT buddies_stage_check CHECK (((stage >= 0) AND (stage <= 6)));
ALTER TABLE buddies ADD CONSTRAINT buddies_vitality_check CHECK (((vitality >= (0)::double precision) AND (vitality <= (1)::double precision)));
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_status_check CHECK ((status = ANY (ARRAY['new'::text, 'triaged'::text, 'fixing'::text, 'resolved'::text, 'wont_fix'::text])));
ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'withdrawn'::character varying])::text[])));
ALTER TABLE class_materials ADD CONSTRAINT class_materials_kind_check CHECK ((kind = ANY (ARRAY['file'::text, 'link'::text])));
ALTER TABLE class_meetings ADD CONSTRAINT class_meetings_check CHECK (((day_of_week IS NOT NULL) OR (specific_date IS NOT NULL)));
ALTER TABLE class_meetings ADD CONSTRAINT class_meetings_day_of_week_check CHECK (((day_of_week IS NULL) OR ((day_of_week >= 0) AND (day_of_week <= 6))));
ALTER TABLE contact_submissions ADD CONSTRAINT contact_submissions_contact_type_check CHECK ((contact_type = ANY (ARRAY['demo'::text, 'sales'::text, 'general'::text, 'families'::text, 'philosophy'::text, 'academy'::text, 'claim_free_class'::text])));
ALTER TABLE contact_submissions ADD CONSTRAINT contact_submissions_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'converted'::text, 'closed'::text])));
ALTER TABLE content_reports ADD CONSTRAINT content_reports_reason_check CHECK ((reason = ANY (ARRAY['spam'::text, 'harassment'::text, 'inappropriate'::text, 'self_harm'::text, 'other'::text])));
ALTER TABLE content_reports ADD CONSTRAINT content_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text, 'actioned'::text])));
ALTER TABLE content_reports ADD CONSTRAINT content_reports_target_type_check CHECK ((target_type = ANY (ARRAY['learning_event'::text, 'task_completion'::text, 'comment'::text, 'user'::text])));
ALTER TABLE course_enrollments ADD CONSTRAINT completed_has_timestamp CHECK (((((status)::text = 'completed'::text) AND (completed_at IS NOT NULL)) OR (((status)::text <> 'completed'::text) AND (completed_at IS NULL))));
ALTER TABLE course_enrollments ADD CONSTRAINT valid_enrollment_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'dropped'::character varying])::text[])));
ALTER TABLE course_plan_sessions ADD CONSTRAINT course_plan_sessions_status_check CHECK ((status = ANY (ARRAY['drafting'::text, 'approved'::text, 'generating'::text, 'completed'::text, 'abandoned'::text])));
ALTER TABLE course_quest_tasks ADD CONSTRAINT course_quest_tasks_pillar_check CHECK ((pillar = ANY (ARRAY['stem'::text, 'wellness'::text, 'communication'::text, 'civics'::text, 'art'::text])));
ALTER TABLE course_quest_tasks ADD CONSTRAINT course_quest_tasks_xp_value_check CHECK ((xp_value > 0));
ALTER TABLE course_quests ADD CONSTRAINT check_course_quest_xp_threshold_non_negative CHECK (((xp_threshold IS NULL) OR (xp_threshold >= 0)));
ALTER TABLE course_refine_sessions ADD CONSTRAINT course_refine_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE courses ADD CONSTRAINT courses_guidance_level_check CHECK (((guidance_level IS NULL) OR (guidance_level = ANY (ARRAY['guided'::text, 'moderate'::text, 'independent'::text]))));
ALTER TABLE courses ADD CONSTRAINT valid_course_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE courses ADD CONSTRAINT valid_course_visibility CHECK (((visibility)::text = ANY ((ARRAY['organization'::character varying, 'public'::character varying, 'private'::character varying])::text[])));
ALTER TABLE courses ADD CONSTRAINT valid_credit_amount CHECK (((credit_amount IS NULL) OR ((credit_amount > (0)::numeric) AND (credit_amount <= (5)::numeric))));
ALTER TABLE courses ADD CONSTRAINT valid_navigation_mode CHECK (((navigation_mode)::text = ANY ((ARRAY['sequential'::character varying, 'freeform'::character varying])::text[])));
ALTER TABLE credit_ledger ADD CONSTRAINT credits_earned_valid CHECK ((credits_earned >= (0)::numeric));
ALTER TABLE curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_progress_percentage_check CHECK (((progress_percentage >= 0) AND (progress_percentage <= 100)));
ALTER TABLE curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])));
ALTER TABLE curriculum_lessons ADD CONSTRAINT check_xp_threshold_non_negative CHECK (((xp_threshold IS NULL) OR (xp_threshold >= 0)));
ALTER TABLE curriculum_settings ADD CONSTRAINT curriculum_settings_navigation_mode_check CHECK ((navigation_mode = ANY (ARRAY['sequential'::text, 'free'::text])));
ALTER TABLE curriculum_uploads ADD CONSTRAINT curriculum_uploads_source_type_check CHECK ((source_type = ANY (ARRAY['imscc'::text, 'pdf'::text, 'docx'::text, 'text'::text, 'generate'::text])));
ALTER TABLE curriculum_uploads ADD CONSTRAINT curriculum_uploads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready_for_review'::text, 'approved'::text, 'rejected'::text, 'error'::text])));
ALTER TABLE device_tokens ADD CONSTRAINT device_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])));
ALTER TABLE evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_block_type_check CHECK ((block_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'link'::text, 'document'::text])));
ALTER TABLE evidence_report_configs ADD CONSTRAINT evidence_report_configs_parent_approval_status_check CHECK (((parent_approval_status)::text = ANY ((ARRAY['not_required'::character varying, 'pending'::character varying, 'approved'::character varying, 'denied'::character varying])::text[])));
ALTER TABLE evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'denied'::character varying])::text[])));
ALTER TABLE feed_highlights ADD CONSTRAINT feed_highlights_target_type_check CHECK ((target_type = ANY (ARRAY['task_completed'::text, 'learning_moment'::text])));
ALTER TABLE feed_item_views ADD CONSTRAINT must_have_target CHECK (((completion_id IS NOT NULL) OR (learning_event_id IS NOT NULL)));
ALTER TABLE feed_share_tokens ADD CONSTRAINT one_target CHECK ((((completion_id IS NOT NULL) AND (learning_event_id IS NULL)) OR ((completion_id IS NULL) AND (learning_event_id IS NOT NULL))));
ALTER TABLE group_members ADD CONSTRAINT group_members_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'member'::character varying])::text[])));
ALTER TABLE households ADD CONSTRAINT households_funding_source_check CHECK (((funding_source IS NULL) OR (funding_source = ANY (ARRAY['ufa'::text, 'ufa_private'::text, 'private_pay'::text, 'other'::text]))));
ALTER TABLE icreate_registrations ADD CONSTRAINT icreate_registrations_status_check CHECK ((status = ANY (ARRAY['verify'::text, 'family'::text, 'details'::text, 'paperwork'::text, 'fee'::text, 'schedule'::text, 'appointment'::text, 'completed'::text])));
ALTER TABLE learning_event_evidence_blocks ADD CONSTRAINT learning_event_evidence_blocks_block_type_check CHECK ((block_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'link'::text, 'document'::text, 'audio'::text])));
ALTER TABLE learning_event_topics ADD CONSTRAINT learning_event_topics_topic_type_check CHECK ((topic_type = ANY (ARRAY['topic'::text, 'quest'::text])));
ALTER TABLE learning_events ADD CONSTRAINT learning_events_source_type_check CHECK ((source_type = ANY (ARRAY['realtime'::text, 'retroactive'::text, 'parent_captured'::text, 'task_evidence'::text])));
ALTER TABLE lms_grade_sync ADD CONSTRAINT lms_grade_sync_valid_platform CHECK (((lms_platform)::text = ANY ((ARRAY['canvas'::character varying, 'google_classroom'::character varying, 'schoology'::character varying, 'moodle'::character varying, 'spark'::character varying])::text[])));
ALTER TABLE lms_grade_sync ADD CONSTRAINT lms_grade_sync_valid_score CHECK (((score >= (0)::numeric) AND (score <= max_score)));
ALTER TABLE lms_grade_sync ADD CONSTRAINT lms_grade_sync_valid_status CHECK (((sync_status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])));
ALTER TABLE lms_integrations ADD CONSTRAINT lms_integrations_valid_platform CHECK (((lms_platform)::text = ANY ((ARRAY['canvas'::character varying, 'google_classroom'::character varying, 'schoology'::character varying, 'moodle'::character varying, 'spark'::character varying])::text[])));
ALTER TABLE lms_integrations ADD CONSTRAINT lms_integrations_valid_status CHECK (((sync_status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'error'::character varying])::text[])));
ALTER TABLE lms_sessions ADD CONSTRAINT lms_sessions_valid_platform CHECK (((lms_platform)::text = ANY ((ARRAY['canvas'::character varying, 'google_classroom'::character varying, 'schoology'::character varying, 'moodle'::character varying, 'spark'::character varying])::text[])));
ALTER TABLE lti_auth_codes ADD CONSTRAINT lti_auth_codes_subject_present CHECK (((user_id IS NOT NULL) OR (pending_launch_id IS NOT NULL)));
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_type_check CHECK ((message_type = ANY (ARRAY['dm'::text, 'group'::text])));
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['quest_invitation'::text, 'quest_started'::text, 'task_approved'::text, 'task_revision_requested'::text, 'announcement'::text, 'observer_comment'::text, 'observer_like'::text, 'badge_earned'::text, 'friendship_request'::text, 'message_received'::text, 'advisor_note'::text, 'system_alert'::text, 'parent_approval_required'::text, 'bounty_submission'::text, 'diploma_credit_approved'::text, 'diploma_credit_grow_this'::text, 'class_submitted_for_review'::text, 'bounty_posted'::text, 'bounty_claimed'::text, 'diploma_credit_requested'::text, 'observer_accepted'::text, 'observer_added'::text, 'org_approved_credit'::text, 'video_processing'::text, 'treehouse_help'::text, 'treehouse_proud'::text, 'treehouse_task_completed'::text, 'treehouse_quest_completed'::text, 'treehouse_showcase_joined'::text, 'student_absent'::text, 'attendance_reminder'::text])));
ALTER TABLE observer_comments ADD CONSTRAINT observer_comments_max_length CHECK ((length(comment_text) <= 2000));
ALTER TABLE observer_comments ADD CONSTRAINT observer_comments_not_empty CHECK ((length(TRIM(BOTH FROM comment_text)) > 0));
ALTER TABLE observer_invitations ADD CONSTRAINT observer_invitations_invited_by_role_check CHECK (((invited_by_role)::text = ANY ((ARRAY['student'::character varying, 'parent'::character varying])::text[])));
ALTER TABLE observer_invitations ADD CONSTRAINT observer_invitations_valid_email CHECK ((observer_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text));
ALTER TABLE observer_invitations ADD CONSTRAINT observer_invitations_valid_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text])));
ALTER TABLE observer_student_links ADD CONSTRAINT observer_student_links_no_self CHECK ((observer_id <> student_id));
ALTER TABLE oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_block_type_check CHECK ((block_type = ANY (ARRAY['text'::text, 'link'::text, 'file'::text])));
ALTER TABLE oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_grade_check CHECK ((grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'F'::text])));
ALTER TABLE oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_term_type_check CHECK ((term_type = ANY (ARRAY['quarter'::text, 'semester'::text, 'annual'::text])));
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_category_check CHECK ((category = ANY (ARRAY['foundation'::text, 'elective'::text])));
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_credit_source_check CHECK ((credit_source = ANY (ARRAY['direct'::text, 'transfer'::text, 'earned_elsewhere'::text])));
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_letter_grade_check CHECK ((letter_grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'F'::text])));
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'complete'::text])));
ALTER TABLE oea_enrollments ADD CONSTRAINT oea_enrollments_pathway_key_check CHECK ((pathway_key = ANY (ARRAY['open_balanced'::text, 'traditional'::text, 'college_bound'::text])));
ALTER TABLE oea_enrollments ADD CONSTRAINT oea_enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'withdrawn'::text, 'completed'::text])));
ALTER TABLE org_classes ADD CONSTRAINT chk_org_classes_supply_budget_nonneg CHECK (((supply_budget_per_student IS NULL) OR (supply_budget_per_student >= (0)::numeric)));
ALTER TABLE org_classes ADD CONSTRAINT chk_org_classes_supply_fee_nonneg CHECK (((supply_fee IS NULL) OR (supply_fee >= (0)::numeric)));
ALTER TABLE org_classes ADD CONSTRAINT org_classes_billing_cadence_check CHECK (((billing_cadence IS NULL) OR (billing_cadence = ANY (ARRAY['monthly'::text, 'semester'::text, 'full'::text]))));
ALTER TABLE org_classes ADD CONSTRAINT org_classes_billing_type_check CHECK (((billing_type IS NULL) OR (billing_type = ANY (ARRAY['flat'::text, 'per_class'::text, 'recurring'::text]))));
ALTER TABLE org_classes ADD CONSTRAINT org_classes_registration_status_check CHECK ((registration_status = ANY (ARRAY['open'::text, 'closed'::text])));
ALTER TABLE org_classes ADD CONSTRAINT org_classes_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_role_check CHECK ((role = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'org_admin'::text, 'observer'::text])));
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])));
ALTER TABLE org_resources ADD CONSTRAINT org_resources_audience_check CHECK ((audience = ANY (ARRAY['families'::text, 'staff'::text, 'all'::text])));
ALTER TABLE org_resources ADD CONSTRAINT org_resources_visible_to_roles_check CHECK (((visible_to_roles IS NULL) OR (visible_to_roles <@ ARRAY['org_admin'::text, 'campus_coordinator'::text, 'advisor'::text])));
ALTER TABLE organizations ADD CONSTRAINT organizations_accreditation_source_check CHECK ((accreditation_source = ANY (ARRAY['optio'::text, 'self'::text, 'none'::text])));
ALTER TABLE organizations ADD CONSTRAINT valid_course_policy CHECK (((course_visibility_policy)::text = ANY ((ARRAY['all_optio'::character varying, 'curated'::character varying, 'private_only'::character varying])::text[])));
ALTER TABLE organizations ADD CONSTRAINT valid_policy CHECK (((quest_visibility_policy)::text = ANY ((ARRAY['all_optio'::character varying, 'curated'::character varying, 'private_only'::character varying])::text[])));
ALTER TABLE parent_student_links ADD CONSTRAINT parent_student_links_check CHECK ((parent_user_id <> student_user_id));
ALTER TABLE parent_student_links ADD CONSTRAINT valid_link_status CHECK (((status)::text = ANY ((ARRAY['pending_approval'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])));
ALTER TABLE parental_consent_log ADD CONSTRAINT parental_consent_log_consent_method_check CHECK ((consent_method = ANY (ARRAY['email_link'::text, 'esignature'::text, 'admin_assisted'::text])));
ALTER TABLE philosophy_edges ADD CONSTRAINT philosophy_edges_edge_type_check CHECK ((edge_type = ANY (ARRAY['includes'::text, 'connects_to'::text])));
ALTER TABLE philosophy_nodes ADD CONSTRAINT philosophy_nodes_level_check CHECK ((level = ANY (ARRAY[0, 1, 2])));
ALTER TABLE planned_credits ADD CONSTRAINT planned_credits_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'dropped'::text])));
ALTER TABLE public_visibility_requests ADD CONSTRAINT public_visibility_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])));
ALTER TABLE quest_invitations ADD CONSTRAINT quest_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])));
ALTER TABLE quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_pillar_check CHECK ((pillar = ANY (ARRAY['stem'::text, 'wellness'::text, 'communication'::text, 'civics'::text, 'art'::text])));
ALTER TABLE quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_xp_value_check CHECK ((xp_value > 0));
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_diploma_status_check CHECK ((diploma_status = ANY (ARRAY['none'::text, 'draft'::text, 'ready_for_credit'::text, 'pending_review'::text, 'pending_org_approval'::text, 'grow_this'::text, 'finalized'::text, 'merged'::text])));
ALTER TABLE quests ADD CONSTRAINT check_quest_type CHECK (((quest_type)::text = ANY ((ARRAY['optio'::character varying, 'course'::character varying, 'class'::character varying])::text[])));
ALTER TABLE quests ADD CONSTRAINT check_xp_threshold_nonneg CHECK (((xp_threshold IS NULL) OR (xp_threshold >= 0)));
ALTER TABLE quests ADD CONSTRAINT quests_class_review_status_check CHECK (((class_review_status IS NULL) OR (class_review_status = ANY (ARRAY['submitted_for_review'::text, 'credit_awarded'::text, 'rejected'::text]))));
ALTER TABLE quests ADD CONSTRAINT quests_transcript_subject_check CHECK (((transcript_subject IS NULL) OR (transcript_subject = ANY (ARRAY['language_arts'::text, 'math'::text, 'science'::text, 'social_studies'::text, 'financial_literacy'::text, 'health'::text, 'pe'::text, 'fine_arts'::text, 'cte'::text, 'digital_literacy'::text, 'electives'::text]))));
ALTER TABLE scheduled_jobs ADD CONSTRAINT valid_priority CHECK (((priority >= 1) AND (priority <= 10)));
ALTER TABLE scheduled_jobs ADD CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE school_enrollments ADD CONSTRAINT school_enrollments_status_check CHECK ((status = ANY (ARRAY['applicant'::text, 'enrolled'::text, 'withdrawn'::text, 'graduated'::text])));
ALTER TABLE sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])));
ALTER TABLE sis_attendance ADD CONSTRAINT sis_attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])));
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_alert_type_check CHECK ((alert_type = ANY (ARRAY['checkin_reminder'::text, 'gap_alert'::text, 'unaccounted'::text])));
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_resolution_check CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['elsewhere_on_campus'::text, 'late'::text, 'absent_no_notice'::text, 'mismarked'::text, 'other'::text]))));
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])));
ALTER TABLE sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])));
ALTER TABLE sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_type_check CHECK ((type = ANY (ARRAY['offer'::text, 'need'::text])));
ALTER TABLE sis_discount_rules ADD CONSTRAINT sis_discount_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['sibling'::text, 'multi_class'::text, 'promo'::text, 'manual'::text])));
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_source_check CHECK ((source = ANY (ARRAY['registration'::text, 'manual'::text])));
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'released'::text, 'rejected'::text])));
ALTER TABLE sis_events ADD CONSTRAINT sis_events_audience_check CHECK ((audience = ANY (ARRAY['school'::text, 'teachers'::text, 'admins'::text])));
ALTER TABLE sis_events ADD CONSTRAINT sis_events_time_order CHECK (((end_at IS NULL) OR (end_at >= start_at)));
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'in_progress'::text, 'waiting'::text, 'resolved'::text])));
ALTER TABLE sis_installments ADD CONSTRAINT sis_installments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'due'::text, 'paid'::text, 'late'::text, 'waived'::text])));
ALTER TABLE sis_invoices ADD CONSTRAINT sis_invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'partial'::text, 'paid'::text, 'overdue'::text, 'void'::text])));
ALTER TABLE sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_choice_check CHECK ((choice = ANY (ARRAY['quest_learning_day'::text, 'elementary_at_home'::text])));
ALTER TABLE sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_audience_check CHECK ((audience = ANY (ARRAY['staff'::text, 'family'::text])));
ALTER TABLE sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'complete'::text])));
ALTER TABLE sis_payment_plans ADD CONSTRAINT sis_payment_plans_cadence_check CHECK ((cadence = ANY (ARRAY['monthly'::text, 'semester'::text, 'full'::text])));
ALTER TABLE sis_payment_plans ADD CONSTRAINT sis_payment_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE sis_quickbooks_sync_log ADD CONSTRAINT sis_quickbooks_sync_log_entity_type_check CHECK ((entity_type = ANY (ARRAY['invoice'::text, 'payment'::text, 'customer'::text])));
ALTER TABLE sis_quickbooks_sync_log ADD CONSTRAINT sis_quickbooks_sync_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'synced'::text, 'error'::text])));
ALTER TABLE sis_registration_items ADD CONSTRAINT sis_registration_items_status_check CHECK ((status = ANY (ARRAY['selected'::text, 'enrolled'::text, 'waitlisted'::text, 'dropped'::text])));
ALTER TABLE sis_registrations ADD CONSTRAINT sis_registrations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'submitted'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'sent_back'::text])));
ALTER TABLE sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_assignment_type_check CHECK ((assignment_type = ANY (ARRAY['duty'::text, 'event'::text, 'meeting'::text, 'substitute'::text, 'other'::text])));
ALTER TABLE sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_hourly_rate_cents_check CHECK (((hourly_rate_cents IS NULL) OR (hourly_rate_cents >= 0)));
ALTER TABLE sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_pay_type_check CHECK ((pay_type = ANY (ARRAY['hourly'::text, 'salaried'::text, 'stipend'::text, 'unpaid'::text])));
ALTER TABLE sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_staff_type_check CHECK ((staff_type = ANY (ARRAY['employee'::text, 'contractor'::text])));
ALTER TABLE sis_staff_training ADD CONSTRAINT sis_staff_training_audience_check CHECK ((audience = ANY (ARRAY['staff'::text, 'family'::text])));
ALTER TABLE sis_staff_training ADD CONSTRAINT sis_staff_training_visible_to_roles_check CHECK (((visible_to_roles IS NULL) OR (visible_to_roles <@ ARRAY['org_admin'::text, 'campus_coordinator'::text, 'advisor'::text])));
ALTER TABLE sis_time_entries ADD CONSTRAINT sis_time_entries_status_check CHECK ((status = ANY (ARRAY['open'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'offered'::text, 'accepted'::text, 'expired'::text, 'declined'::text, 'promoted'::text])));
ALTER TABLE student_access_logs ADD CONSTRAINT valid_accessor_role CHECK ((accessor_role = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'admin'::text, 'observer'::text])));
ALTER TABLE student_planned_absences ADD CONSTRAINT student_planned_absences_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text])));
ALTER TABLE student_wallets ADD CONSTRAINT student_wallets_spendable_xp_check CHECK ((spendable_xp >= 0));
ALTER TABLE student_wallets ADD CONSTRAINT student_wallets_total_xp_spent_check CHECK ((total_xp_spent >= 0));
ALTER TABLE treehouse_pins ADD CONSTRAINT treehouse_pins_status_check CHECK ((status = ANY (ARRAY['created'::text, 'distributed'::text])));
ALTER TABLE treehouse_showcase_events ADD CONSTRAINT treehouse_showcase_events_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])));
ALTER TABLE treehouse_signals ADD CONSTRAINT treehouse_signals_signal_type_check CHECK ((signal_type = ANY (ARRAY['help'::text, 'proud'::text])));
ALTER TABLE treehouse_signals ADD CONSTRAINT treehouse_signals_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])));
ALTER TABLE user_blocks ADD CONSTRAINT no_self_block CHECK ((blocker_id <> blocked_id));
ALTER TABLE user_quest_tasks ADD CONSTRAINT user_quest_tasks_approval_status_check CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE user_quests ADD CONSTRAINT task_display_mode_check CHECK ((task_display_mode = ANY (ARRAY['timeline'::text, 'flexible'::text])));
ALTER TABLE user_quests ADD CONSTRAINT valid_quest_status CHECK ((status = ANY (ARRAY['available'::text, 'picked_up'::text, 'set_down'::text])));
ALTER TABLE user_skill_xp ADD CONSTRAINT user_skill_xp_xp_amount_check CHECK ((xp_amount >= 0));
ALTER TABLE user_subject_xp ADD CONSTRAINT user_subject_xp_xp_amount_check CHECK ((xp_amount >= 0));
ALTER TABLE user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text])));
ALTER TABLE users ADD CONSTRAINT check_dependent_has_parent CHECK (((is_dependent = false) OR ((is_dependent = true) AND (managed_by_parent_id IS NOT NULL))));
ALTER TABLE users ADD CONSTRAINT check_dependent_no_email CHECK (((is_dependent = false) OR ((is_dependent = true) AND (email IS NULL))));
ALTER TABLE users ADD CONSTRAINT direct_role_no_org_role CHECK ((((role)::text = 'org_managed'::text) OR (org_role IS NULL)));
ALTER TABLE users ADD CONSTRAINT org_managed_requires_org CHECK ((((role)::text <> 'org_managed'::text) OR ((org_role IS NOT NULL) AND (organization_id IS NOT NULL))));
ALTER TABLE users ADD CONSTRAINT users_ai_assistance_level_check CHECK ((ai_assistance_level = ANY (ARRAY['off'::text, 'suggestions'::text, 'auto'::text])));
ALTER TABLE users ADD CONSTRAINT users_deletion_status_check CHECK (((deletion_status)::text = ANY ((ARRAY['none'::character varying, 'pending'::character varying, 'completed'::character varying])::text[])));
ALTER TABLE users ADD CONSTRAINT users_preferred_challenge_level_check CHECK ((preferred_challenge_level = ANY (ARRAY['easier'::text, 'standard'::text, 'challenge'::text])));
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'observer'::text, 'org_managed'::text, 'superadmin'::text])));
ALTER TABLE users ADD CONSTRAINT valid_org_role CHECK (((org_role IS NULL) OR (org_role = ANY (ARRAY['student'::text, 'parent'::text, 'advisor'::text, 'org_admin'::text, 'campus_coordinator'::text, 'observer'::text]))));
ALTER TABLE users ADD CONSTRAINT valid_org_roles CHECK (validate_org_roles(org_roles));
ALTER TABLE users ADD CONSTRAINT valid_role_check CHECK (((role)::text = ANY (ARRAY['superadmin'::text, 'org_admin'::text, 'student'::text, 'parent'::text, 'advisor'::text, 'observer'::text, 'org_managed'::text])));
ALTER TABLE xp_award_failures ADD CONSTRAINT xp_award_failures_xp_amount_check CHECK ((xp_amount > 0));

-- ============================================================
-- foreign keys
-- ============================================================

ALTER TABLE account_deletion_log ADD CONSTRAINT account_deletion_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE admin_masquerade_log ADD CONSTRAINT admin_masquerade_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE admin_masquerade_log ADD CONSTRAINT admin_masquerade_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE advisor_checkins ADD CONSTRAINT advisor_checkins_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE advisor_checkins ADD CONSTRAINT advisor_checkins_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE advisor_notes ADD CONSTRAINT advisor_notes_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE advisor_notes ADD CONSTRAINT advisor_notes_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE advisor_student_assignments ADD CONSTRAINT advisor_student_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ai_generated_quests ADD CONSTRAINT ai_generated_quests_generation_job_id_fkey FOREIGN KEY (generation_job_id) REFERENCES ai_generation_jobs(id) ON DELETE CASCADE;
ALTER TABLE ai_generated_quests ADD CONSTRAINT ai_generated_quests_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id);
ALTER TABLE ai_generation_jobs ADD CONSTRAINT ai_generation_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ai_prompt_components ADD CONSTRAINT ai_prompt_components_modified_by_fkey FOREIGN KEY (modified_by) REFERENCES users(id);
ALTER TABLE ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_created_quest_id_fkey FOREIGN KEY (created_quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE ai_quest_review_queue ADD CONSTRAINT ai_quest_review_queue_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ai_task_cache ADD CONSTRAINT ai_task_cache_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE announcement_reads ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE announcement_reads ADD CONSTRAINT announcement_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE announcements ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE announcements ADD CONSTRAINT announcements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE automation_sequences ADD CONSTRAINT automation_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bounties ADD CONSTRAINT bounties_cohort_class_id_fkey FOREIGN KEY (cohort_class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE bounties ADD CONSTRAINT bounties_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE bounties ADD CONSTRAINT bounties_poster_id_fkey FOREIGN KEY (poster_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE bounty_claims ADD CONSTRAINT bounty_claims_bounty_id_fkey FOREIGN KEY (bounty_id) REFERENCES bounties(id) ON DELETE CASCADE;
ALTER TABLE bounty_claims ADD CONSTRAINT bounty_claims_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE bounty_reviews ADD CONSTRAINT bounty_reviews_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES bounty_claims(id) ON DELETE CASCADE;
ALTER TABLE bounty_reviews ADD CONSTRAINT bounty_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE buddies ADD CONSTRAINT buddies_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE class_advisors ADD CONSTRAINT class_advisors_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE class_advisors ADD CONSTRAINT class_advisors_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE class_advisors ADD CONSTRAINT class_advisors_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE class_discussion_posts ADD CONSTRAINT class_discussion_posts_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE class_discussion_posts ADD CONSTRAINT class_discussion_posts_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE class_discussion_posts ADD CONSTRAINT class_discussion_posts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE class_discussion_posts ADD CONSTRAINT class_discussion_posts_parent_post_id_fkey FOREIGN KEY (parent_post_id) REFERENCES class_discussion_posts(id) ON DELETE CASCADE;
ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_enrolled_by_fkey FOREIGN KEY (enrolled_by) REFERENCES users(id);
ALTER TABLE class_enrollments ADD CONSTRAINT class_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE class_materials ADD CONSTRAINT class_materials_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE class_materials ADD CONSTRAINT class_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE class_materials ADD CONSTRAINT class_materials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE class_meetings ADD CONSTRAINT class_meetings_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE class_meetings ADD CONSTRAINT class_meetings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE class_prerequisites ADD CONSTRAINT class_prerequisites_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE class_prerequisites ADD CONSTRAINT class_prerequisites_prerequisite_class_id_fkey FOREIGN KEY (prerequisite_class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE class_quests ADD CONSTRAINT class_quests_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id);
ALTER TABLE class_quests ADD CONSTRAINT class_quests_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE class_quests ADD CONSTRAINT class_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE course_enrollments ADD CONSTRAINT course_enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE course_enrollments ADD CONSTRAINT course_enrollments_current_quest_id_fkey FOREIGN KEY (current_quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE course_enrollments ADD CONSTRAINT course_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE course_generation_jobs ADD CONSTRAINT course_generation_jobs_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE course_generation_jobs ADD CONSTRAINT course_generation_jobs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE course_generation_jobs ADD CONSTRAINT course_generation_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE course_plan_sessions ADD CONSTRAINT course_plan_sessions_created_course_id_fkey FOREIGN KEY (created_course_id) REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE course_plan_sessions ADD CONSTRAINT course_plan_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE course_plan_sessions ADD CONSTRAINT course_plan_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE course_quest_tasks ADD CONSTRAINT course_quest_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE course_quests ADD CONSTRAINT course_quests_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE course_quests ADD CONSTRAINT course_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE course_refine_sessions ADD CONSTRAINT course_refine_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE course_refine_sessions ADD CONSTRAINT course_refine_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE courses ADD CONSTRAINT courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE courses ADD CONSTRAINT courses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE credit_review_messages ADD CONSTRAINT credit_review_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE credit_review_messages ADD CONSTRAINT credit_review_messages_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE curriculum_attachments ADD CONSTRAINT curriculum_attachments_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE curriculum_attachments ADD CONSTRAINT curriculum_attachments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE curriculum_attachments ADD CONSTRAINT curriculum_attachments_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE curriculum_attachments ADD CONSTRAINT curriculum_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES curriculum_lessons(id) ON DELETE CASCADE;
ALTER TABLE curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE curriculum_lesson_progress ADD CONSTRAINT curriculum_lesson_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES curriculum_lessons(id) ON DELETE CASCADE;
ALTER TABLE curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE curriculum_lesson_tasks ADD CONSTRAINT curriculum_lesson_tasks_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE curriculum_lessons ADD CONSTRAINT curriculum_lessons_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE curriculum_lessons ADD CONSTRAINT curriculum_lessons_last_edited_by_fkey FOREIGN KEY (last_edited_by) REFERENCES users(id);
ALTER TABLE curriculum_lessons ADD CONSTRAINT curriculum_lessons_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE curriculum_lessons ADD CONSTRAINT curriculum_lessons_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE curriculum_settings ADD CONSTRAINT curriculum_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE curriculum_settings ADD CONSTRAINT curriculum_settings_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE curriculum_uploads ADD CONSTRAINT curriculum_uploads_created_course_id_fkey FOREIGN KEY (created_course_id) REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE curriculum_uploads ADD CONSTRAINT curriculum_uploads_created_quest_id_fkey FOREIGN KEY (created_quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE curriculum_uploads ADD CONSTRAINT curriculum_uploads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE curriculum_uploads ADD CONSTRAINT curriculum_uploads_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE curriculum_uploads ADD CONSTRAINT curriculum_uploads_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE device_tokens ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE diploma_review_rounds ADD CONSTRAINT diploma_review_rounds_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE diploma_review_rounds ADD CONSTRAINT diploma_review_rounds_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id);
ALTER TABLE diplomas ADD CONSTRAINT diplomas_public_consent_given_by_fkey FOREIGN KEY (public_consent_given_by) REFERENCES users(id);
ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES direct_messages(id) ON DELETE SET NULL;
ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE docs_articles ADD CONSTRAINT docs_articles_category_id_fkey FOREIGN KEY (category_id) REFERENCES docs_categories(id) ON DELETE CASCADE;
ALTER TABLE docs_articles ADD CONSTRAINT docs_articles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE docs_search_misses ADD CONSTRAINT docs_search_misses_generated_article_id_fkey FOREIGN KEY (generated_article_id) REFERENCES docs_articles(id) ON DELETE SET NULL;
ALTER TABLE email_templates ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE emergency_contacts ADD CONSTRAINT emergency_contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE emergency_contacts ADD CONSTRAINT emergency_contacts_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_document_id_fkey FOREIGN KEY (document_id) REFERENCES user_task_evidence_documents(id) ON DELETE CASCADE;
ALTER TABLE evidence_document_blocks ADD CONSTRAINT evidence_document_blocks_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE evidence_report_configs ADD CONSTRAINT evidence_report_configs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_report_config_id_fkey FOREIGN KEY (report_config_id) REFERENCES evidence_report_configs(id) ON DELETE CASCADE;
ALTER TABLE feed_highlights ADD CONSTRAINT feed_highlights_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE feed_item_views ADD CONSTRAINT feed_item_views_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE feed_item_views ADD CONSTRAINT feed_item_views_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE feed_item_views ADD CONSTRAINT feed_item_views_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE feed_share_tokens ADD CONSTRAINT feed_share_tokens_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE feed_share_tokens ADD CONSTRAINT feed_share_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE feed_share_tokens ADD CONSTRAINT feed_share_tokens_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE feed_share_tokens ADD CONSTRAINT feed_share_tokens_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id);
ALTER TABLE group_conversations ADD CONSTRAINT group_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE group_conversations ADD CONSTRAINT group_conversations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE group_conversations ADD CONSTRAINT group_conversations_pinned_message_id_fkey FOREIGN KEY (pinned_message_id) REFERENCES group_messages(id) ON DELETE SET NULL;
ALTER TABLE group_conversations ADD CONSTRAINT group_conversations_source_class_id_fkey FOREIGN KEY (source_class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE group_members ADD CONSTRAINT group_members_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id);
ALTER TABLE group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_conversations(id) ON DELETE CASCADE;
ALTER TABLE group_members ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_conversations(id) ON DELETE CASCADE;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES group_messages(id) ON DELETE SET NULL;
ALTER TABLE group_messages ADD CONSTRAINT group_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE household_members ADD CONSTRAINT household_members_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE household_members ADD CONSTRAINT household_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE households ADD CONSTRAINT households_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE households ADD CONSTRAINT households_primary_contact_user_id_fkey FOREIGN KEY (primary_contact_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE icreate_registrations ADD CONSTRAINT icreate_registrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE icreate_registrations ADD CONSTRAINT icreate_registrations_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE interest_tracks ADD CONSTRAINT interest_tracks_evolved_to_quest_id_fkey FOREIGN KEY (evolved_to_quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE interest_tracks ADD CONSTRAINT interest_tracks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE learning_event_evidence_blocks ADD CONSTRAINT learning_event_evidence_blocks_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE learning_event_topics ADD CONSTRAINT learning_event_topics_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE learning_events ADD CONSTRAINT learning_events_attached_task_id_fkey FOREIGN KEY (attached_task_id) REFERENCES user_quest_tasks(id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD CONSTRAINT learning_events_captured_by_user_id_fkey FOREIGN KEY (captured_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD CONSTRAINT learning_events_parent_moment_id_fkey FOREIGN KEY (parent_moment_id) REFERENCES learning_events(id) ON DELETE SET NULL;
ALTER TABLE learning_events ADD CONSTRAINT learning_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE lesson_reflections ADD CONSTRAINT lesson_reflections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE lms_grade_sync ADD CONSTRAINT lms_grade_sync_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE lms_grade_sync ADD CONSTRAINT lms_grade_sync_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lms_integrations ADD CONSTRAINT lms_integrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE lms_integrations ADD CONSTRAINT lms_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lms_sessions ADD CONSTRAINT lms_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lti_auth_codes ADD CONSTRAINT lti_auth_codes_pending_launch_id_fkey FOREIGN KEY (pending_launch_id) REFERENCES lti_pending_launches(id) ON DELETE CASCADE;
ALTER TABLE lti_auth_codes ADD CONSTRAINT lti_auth_codes_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE lti_auth_codes ADD CONSTRAINT lti_auth_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lti_pending_launches ADD CONSTRAINT lti_pending_launches_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES lti_registrations(id) ON DELETE CASCADE;
ALTER TABLE lti_registrations ADD CONSTRAINT lti_registrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE message_conversations ADD CONSTRAINT message_conversations_participant_1_id_fkey FOREIGN KEY (participant_1_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE message_conversations ADD CONSTRAINT message_conversations_participant_2_id_fkey FOREIGN KEY (participant_2_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE observer_access_audit ADD CONSTRAINT observer_access_audit_observer_id_fkey FOREIGN KEY (observer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE observer_access_audit ADD CONSTRAINT observer_access_audit_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE observer_comments ADD CONSTRAINT observer_comments_learning_event_id_fkey FOREIGN KEY (learning_event_id) REFERENCES learning_events(id) ON DELETE CASCADE;
ALTER TABLE observer_comments ADD CONSTRAINT observer_comments_observer_id_fkey FOREIGN KEY (observer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE observer_comments ADD CONSTRAINT observer_comments_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE observer_comments ADD CONSTRAINT observer_comments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE observer_comments ADD CONSTRAINT observer_comments_task_completion_id_fkey FOREIGN KEY (task_completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE observer_invitation_students ADD CONSTRAINT observer_invitation_students_invitation_id_fkey FOREIGN KEY (invitation_id) REFERENCES observer_invitations(id) ON DELETE CASCADE;
ALTER TABLE observer_invitation_students ADD CONSTRAINT observer_invitation_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE observer_invitations ADD CONSTRAINT observer_invitations_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE observer_invitations ADD CONSTRAINT observer_invitations_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE observer_student_links ADD CONSTRAINT observer_student_links_invited_by_parent_id_fkey FOREIGN KEY (invited_by_parent_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE observer_student_links ADD CONSTRAINT observer_student_links_observer_id_fkey FOREIGN KEY (observer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE observer_student_links ADD CONSTRAINT observer_student_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES oea_credits(id) ON DELETE CASCADE;
ALTER TABLE oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE oea_compliance_alerts ADD CONSTRAINT oea_compliance_alerts_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES oea_credits(id) ON DELETE CASCADE;
ALTER TABLE oea_credit_evidence ADD CONSTRAINT oea_credit_evidence_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES oea_credits(id) ON DELETE CASCADE;
ALTER TABLE oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE oea_credit_grade_periods ADD CONSTRAINT oea_credit_grade_periods_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES oea_enrollments(id) ON DELETE CASCADE;
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE oea_credits ADD CONSTRAINT oea_credits_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE oea_enrollments ADD CONSTRAINT oea_enrollments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE oea_enrollments ADD CONSTRAINT oea_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE org_classes ADD CONSTRAINT org_classes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE org_classes ADD CONSTRAINT org_classes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE org_classes ADD CONSTRAINT org_classes_primary_instructor_id_fkey FOREIGN KEY (primary_instructor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_course_settings ADD CONSTRAINT org_course_teachers_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_course_settings ADD CONSTRAINT org_course_teachers_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE org_course_settings ADD CONSTRAINT org_course_teachers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE org_course_settings ADD CONSTRAINT org_course_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES users(id);
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE org_invitations ADD CONSTRAINT org_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_kiosk_devices ADD CONSTRAINT org_kiosk_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE org_quest_group_items ADD CONSTRAINT org_quest_group_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES org_quest_groups(id) ON DELETE CASCADE;
ALTER TABLE org_quest_group_items ADD CONSTRAINT org_quest_group_items_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE org_quest_groups ADD CONSTRAINT org_quest_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_quest_groups ADD CONSTRAINT org_quest_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE org_resources ADD CONSTRAINT org_resources_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_resources ADD CONSTRAINT org_resources_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE organization_course_access ADD CONSTRAINT organization_course_access_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE organization_course_access ADD CONSTRAINT organization_course_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id);
ALTER TABLE organization_course_access ADD CONSTRAINT organization_course_access_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE organization_quest_access ADD CONSTRAINT organization_quest_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id);
ALTER TABLE organization_quest_access ADD CONSTRAINT organization_quest_access_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE organization_quest_access ADD CONSTRAINT organization_quest_access_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE organization_secrets ADD CONSTRAINT organization_secrets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE organization_secrets ADD CONSTRAINT organization_secrets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE parent_student_links ADD CONSTRAINT parent_student_links_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE parent_student_links ADD CONSTRAINT parent_student_links_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE parent_student_links ADD CONSTRAINT parent_student_links_verified_by_admin_id_fkey FOREIGN KEY (verified_by_admin_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE parental_consent_log ADD CONSTRAINT parental_consent_log_reviewed_by_admin_id_fkey FOREIGN KEY (reviewed_by_admin_id) REFERENCES users(id);
ALTER TABLE parental_consent_log ADD CONSTRAINT parental_consent_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE philosophy_edges ADD CONSTRAINT philosophy_edges_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES philosophy_nodes(id) ON DELETE CASCADE;
ALTER TABLE philosophy_edges ADD CONSTRAINT philosophy_edges_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES philosophy_nodes(id) ON DELETE CASCADE;
ALTER TABLE philosophy_nodes ADD CONSTRAINT philosophy_nodes_parent_node_id_fkey FOREIGN KEY (parent_node_id) REFERENCES philosophy_nodes(id) ON DELETE SET NULL;
ALTER TABLE planned_credits ADD CONSTRAINT planned_credits_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE planned_credits ADD CONSTRAINT planned_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE poe_participants ADD CONSTRAINT poe_participants_class_quest_id_fkey FOREIGN KEY (class_quest_id) REFERENCES quests(id);
ALTER TABLE poe_participants ADD CONSTRAINT poe_participants_poe_cohort_id_fkey FOREIGN KEY (poe_cohort_id) REFERENCES poe_cohorts(id) ON DELETE CASCADE;
ALTER TABLE poe_participants ADD CONSTRAINT poe_participants_track_id_fkey FOREIGN KEY (track_id) REFERENCES interest_tracks(id) ON DELETE SET NULL;
ALTER TABLE poe_participants ADD CONSTRAINT poe_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE poe_signups ADD CONSTRAINT poe_signups_poe_cohort_id_fkey FOREIGN KEY (poe_cohort_id) REFERENCES poe_cohorts(id) ON DELETE CASCADE;
ALTER TABLE public_visibility_requests ADD CONSTRAINT public_visibility_requests_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public_visibility_requests ADD CONSTRAINT public_visibility_requests_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE quest_invitations ADD CONSTRAINT quest_invitations_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE quest_invitations ADD CONSTRAINT quest_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE quest_invitations ADD CONSTRAINT quest_invitations_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE quest_invitations ADD CONSTRAINT quest_invitations_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE quest_personalization_sessions ADD CONSTRAINT quest_personalization_sessions_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE quest_personalization_sessions ADD CONSTRAINT quest_personalization_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE quest_sample_tasks ADD CONSTRAINT quest_sample_tasks_source_lesson_id_fkey FOREIGN KEY (source_lesson_id) REFERENCES curriculum_lessons(id) ON DELETE SET NULL;
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_credit_reviewer_id_fkey FOREIGN KEY (credit_reviewer_id) REFERENCES users(id);
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES quest_task_completions(id);
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id);
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE quest_task_completions ADD CONSTRAINT quest_task_completions_user_quest_task_id_fkey FOREIGN KEY (user_quest_task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE quest_template_tasks ADD CONSTRAINT quest_template_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE quests ADD CONSTRAINT quests_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE quests ADD CONSTRAINT quests_curriculum_last_edited_by_fkey FOREIGN KEY (curriculum_last_edited_by) REFERENCES users(id);
ALTER TABLE quests ADD CONSTRAINT quests_lti_registration_id_fkey FOREIGN KEY (lti_registration_id) REFERENCES lti_registrations(id) ON DELETE SET NULL;
ALTER TABLE quests ADD CONSTRAINT quests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE role_change_log ADD CONSTRAINT role_change_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE role_change_log ADD CONSTRAINT role_change_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE school_enrollments ADD CONSTRAINT school_enrollments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE school_enrollments ADD CONSTRAINT school_enrollments_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_age_exception_requests ADD CONSTRAINT sis_age_exception_requests_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_assignment_templates ADD CONSTRAINT sis_assignment_templates_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE sis_assignment_templates ADD CONSTRAINT sis_assignment_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_assignment_templates ADD CONSTRAINT sis_assignment_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_attendance ADD CONSTRAINT sis_attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE sis_attendance ADD CONSTRAINT sis_attendance_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES class_meetings(id) ON DELETE SET NULL;
ALTER TABLE sis_attendance ADD CONSTRAINT sis_attendance_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_attendance ADD CONSTRAINT sis_attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_attendance ADD CONSTRAINT sis_attendance_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_attendance_alerts ADD CONSTRAINT sis_attendance_alerts_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_carpool_posts ADD CONSTRAINT sis_carpool_posts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_clp_records ADD CONSTRAINT sis_clp_records_finished_by_fkey FOREIGN KEY (finished_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_clp_records ADD CONSTRAINT sis_clp_records_notes_updated_by_fkey FOREIGN KEY (notes_updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_clp_records ADD CONSTRAINT sis_clp_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_clp_records ADD CONSTRAINT sis_clp_records_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_curriculum ADD CONSTRAINT sis_curriculum_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_curriculum ADD CONSTRAINT sis_curriculum_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_curriculum_classes ADD CONSTRAINT sis_curriculum_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE sis_curriculum_classes ADD CONSTRAINT sis_curriculum_classes_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES sis_curriculum(id) ON DELETE CASCADE;
ALTER TABLE sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE sis_curriculum_courses ADD CONSTRAINT sis_curriculum_courses_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES sis_curriculum(id) ON DELETE CASCADE;
ALTER TABLE sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_curriculum_id_fkey FOREIGN KEY (curriculum_id) REFERENCES sis_curriculum(id) ON DELETE CASCADE;
ALTER TABLE sis_curriculum_quests ADD CONSTRAINT sis_curriculum_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE sis_discount_rules ADD CONSTRAINT sis_discount_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_engagement_alerts ADD CONSTRAINT sis_engagement_alerts_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE sis_engagement_alerts ADD CONSTRAINT sis_engagement_alerts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_engagement_alerts ADD CONSTRAINT sis_engagement_alerts_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_added_by_fkey FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_released_by_fkey FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_enrollment_waitlist ADD CONSTRAINT sis_enrollment_waitlist_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_events ADD CONSTRAINT sis_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_events ADD CONSTRAINT sis_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_family_directives ADD CONSTRAINT sis_family_directives_matched_household_id_fkey FOREIGN KEY (matched_household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE sis_family_directives ADD CONSTRAINT sis_family_directives_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_form_comments ADD CONSTRAINT sis_form_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_form_comments ADD CONSTRAINT sis_form_comments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_form_comments ADD CONSTRAINT sis_form_comments_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES sis_form_submissions(id) ON DELETE CASCADE;
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id);
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id);
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id);
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id);
ALTER TABLE sis_form_submissions ADD CONSTRAINT sis_form_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_installments ADD CONSTRAINT sis_installments_payment_plan_id_fkey FOREIGN KEY (payment_plan_id) REFERENCES sis_payment_plans(id) ON DELETE CASCADE;
ALTER TABLE sis_invoice_line_items ADD CONSTRAINT sis_invoice_line_items_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE sis_invoice_line_items ADD CONSTRAINT sis_invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sis_invoices(id) ON DELETE CASCADE;
ALTER TABLE sis_invoices ADD CONSTRAINT sis_invoices_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE sis_invoices ADD CONSTRAINT sis_invoices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_invoices ADD CONSTRAINT sis_invoices_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES sis_registrations(id) ON DELETE SET NULL;
ALTER TABLE sis_invoices ADD CONSTRAINT sis_invoices_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_selected_by_fkey FOREIGN KEY (selected_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_learning_day_selections ADD CONSTRAINT sis_learning_day_selections_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES sis_onboarding_templates(id) ON DELETE SET NULL;
ALTER TABLE sis_onboarding_assignments ADD CONSTRAINT sis_onboarding_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_onboarding_templates ADD CONSTRAINT sis_onboarding_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE sis_onboarding_templates ADD CONSTRAINT sis_onboarding_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_payment_plans ADD CONSTRAINT sis_payment_plans_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sis_invoices(id) ON DELETE CASCADE;
ALTER TABLE sis_payment_plans ADD CONSTRAINT sis_payment_plans_saved_payment_method_id_fkey FOREIGN KEY (saved_payment_method_id) REFERENCES sis_saved_payment_methods(id) ON DELETE SET NULL;
ALTER TABLE sis_payment_records ADD CONSTRAINT sis_payment_records_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES sis_installments(id) ON DELETE SET NULL;
ALTER TABLE sis_payment_records ADD CONSTRAINT sis_payment_records_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sis_invoices(id) ON DELETE CASCADE;
ALTER TABLE sis_payment_records ADD CONSTRAINT sis_payment_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_payment_records ADD CONSTRAINT sis_payment_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_payment_reminders ADD CONSTRAINT sis_payment_reminders_installment_id_fkey FOREIGN KEY (installment_id) REFERENCES sis_installments(id) ON DELETE CASCADE;
ALTER TABLE sis_payment_reminders ADD CONSTRAINT sis_payment_reminders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sis_invoices(id) ON DELETE CASCADE;
ALTER TABLE sis_payment_reminders ADD CONSTRAINT sis_payment_reminders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_quickbooks_sync_log ADD CONSTRAINT sis_quickbooks_sync_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_registration_items ADD CONSTRAINT sis_registration_items_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE sis_registration_items ADD CONSTRAINT sis_registration_items_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES sis_registrations(id) ON DELETE CASCADE;
ALTER TABLE sis_registrations ADD CONSTRAINT sis_registrations_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_registrations ADD CONSTRAINT sis_registrations_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_registrations ADD CONSTRAINT sis_registrations_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE sis_registrations ADD CONSTRAINT sis_registrations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_registrations ADD CONSTRAINT sis_registrations_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_resource_acks ADD CONSTRAINT sis_resource_acks_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES org_resources(id) ON DELETE CASCADE;
ALTER TABLE sis_resource_acks ADD CONSTRAINT sis_resource_acks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_household_id_fkey FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
ALTER TABLE sis_saved_payment_methods ADD CONSTRAINT sis_saved_payment_methods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_schedule_submissions ADD CONSTRAINT sis_schedule_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_secure_documents ADD CONSTRAINT sis_secure_documents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_secure_documents ADD CONSTRAINT sis_secure_documents_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_secure_documents ADD CONSTRAINT sis_secure_documents_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_secure_documents ADD CONSTRAINT sis_secure_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_staff_assignments ADD CONSTRAINT sis_staff_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_staff_profiles ADD CONSTRAINT sis_staff_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_staff_training ADD CONSTRAINT sis_staff_training_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_staff_training ADD CONSTRAINT sis_staff_training_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_staff_training ADD CONSTRAINT sis_staff_training_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE sis_student_assignments ADD CONSTRAINT sis_student_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE SET NULL;
ALTER TABLE sis_student_assignments ADD CONSTRAINT sis_student_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_student_assignments ADD CONSTRAINT sis_student_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_student_assignments ADD CONSTRAINT sis_student_assignments_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_student_goals ADD CONSTRAINT sis_student_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_student_goals ADD CONSTRAINT sis_student_goals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_student_goals ADD CONSTRAINT sis_student_goals_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_student_goals ADD CONSTRAINT sis_student_goals_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_student_materials ADD CONSTRAINT sis_student_materials_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_student_materials ADD CONSTRAINT sis_student_materials_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_student_records ADD CONSTRAINT sis_student_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_student_records ADD CONSTRAINT sis_student_records_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_student_records ADD CONSTRAINT sis_student_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_submission_reviews ADD CONSTRAINT sis_submission_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_time_entries ADD CONSTRAINT sis_time_entries_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id);
ALTER TABLE sis_time_entries ADD CONSTRAINT sis_time_entries_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id);
ALTER TABLE sis_time_entries ADD CONSTRAINT sis_time_entries_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES users(id);
ALTER TABLE sis_time_entries ADD CONSTRAINT sis_time_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_time_entries ADD CONSTRAINT sis_time_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_waitlist_entries ADD CONSTRAINT sis_waitlist_entries_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_xp_adjustments ADD CONSTRAINT sis_xp_adjustments_adjusted_by_fkey FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sis_xp_adjustments ADD CONSTRAINT sis_xp_adjustments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE sis_xp_adjustments ADD CONSTRAINT sis_xp_adjustments_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE student_access_logs ADD CONSTRAINT student_access_logs_accessor_id_fkey FOREIGN KEY (accessor_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE student_access_logs ADD CONSTRAINT student_access_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE student_planned_absences ADD CONSTRAINT student_planned_absences_class_id_fkey FOREIGN KEY (class_id) REFERENCES org_classes(id) ON DELETE CASCADE;
ALTER TABLE student_planned_absences ADD CONSTRAINT student_planned_absences_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE student_planned_absences ADD CONSTRAINT student_planned_absences_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE student_planned_absences ADD CONSTRAINT student_planned_absences_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE student_wallets ADD CONSTRAINT student_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE task_feedback ADD CONSTRAINT task_feedback_completion_id_fkey FOREIGN KEY (completion_id) REFERENCES quest_task_completions(id) ON DELETE CASCADE;
ALTER TABLE task_feedback ADD CONSTRAINT task_feedback_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id);
ALTER TABLE task_steps ADD CONSTRAINT task_steps_parent_step_id_fkey FOREIGN KEY (parent_step_id) REFERENCES task_steps(id) ON DELETE CASCADE;
ALTER TABLE task_steps ADD CONSTRAINT task_steps_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE task_steps ADD CONSTRAINT task_steps_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transcript_overrides ADD CONSTRAINT transcript_overrides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE transcript_overrides ADD CONSTRAINT transcript_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES users(id);
ALTER TABLE transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES users(id);
ALTER TABLE transcript_share_tokens ADD CONSTRAINT transcript_share_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transcript_transfer_log ADD CONSTRAINT transcript_transfer_log_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE transcript_transfer_log ADD CONSTRAINT transcript_transfer_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE transfer_credits ADD CONSTRAINT transfer_credits_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE transfer_credits ADD CONSTRAINT transfer_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE treehouse_kiosk_devices ADD CONSTRAINT treehouse_kiosk_devices_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE treehouse_kiosk_devices ADD CONSTRAINT treehouse_kiosk_devices_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE treehouse_pins ADD CONSTRAINT treehouse_pins_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE treehouse_pins ADD CONSTRAINT treehouse_pins_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE treehouse_pins ADD CONSTRAINT treehouse_pins_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE treehouse_pins ADD CONSTRAINT treehouse_pins_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE treehouse_showcase_events ADD CONSTRAINT treehouse_showcase_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE treehouse_showcase_events ADD CONSTRAINT treehouse_showcase_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES treehouse_showcase_events(id) ON DELETE CASCADE;
ALTER TABLE treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE treehouse_showcase_participants ADD CONSTRAINT treehouse_showcase_participants_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE treehouse_signals ADD CONSTRAINT treehouse_signals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE treehouse_signals ADD CONSTRAINT treehouse_signals_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE treehouse_signals ADD CONSTRAINT treehouse_signals_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE treehouse_signals ADD CONSTRAINT treehouse_signals_student_id_fkey FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE tutor_conversations ADD CONSTRAINT tutor_conversations_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE SET NULL;
ALTER TABLE tutor_conversations ADD CONSTRAINT tutor_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tutor_messages ADD CONSTRAINT tutor_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES tutor_conversations(id) ON DELETE CASCADE;
ALTER TABLE tutor_safety_reports ADD CONSTRAINT tutor_safety_reports_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES tutor_conversations(id) ON DELETE SET NULL;
ALTER TABLE tutor_safety_reports ADD CONSTRAINT tutor_safety_reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE SET NULL;
ALTER TABLE tutor_safety_reports ADD CONSTRAINT tutor_safety_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tutor_settings ADD CONSTRAINT tutor_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tutorial_verification_log ADD CONSTRAINT tutorial_verification_log_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE tutorial_verification_log ADD CONSTRAINT tutorial_verification_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_activity_events ADD CONSTRAINT user_activity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_blocks ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_mastery ADD CONSTRAINT user_mastery_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_quest_tasks ADD CONSTRAINT user_quest_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE user_quest_tasks ADD CONSTRAINT user_quest_tasks_source_moment_id_fkey FOREIGN KEY (source_moment_id) REFERENCES learning_events(id) ON DELETE SET NULL;
ALTER TABLE user_quest_tasks ADD CONSTRAINT user_quest_tasks_source_template_task_id_fkey FOREIGN KEY (source_template_task_id) REFERENCES quest_template_tasks(id) ON DELETE SET NULL;
ALTER TABLE user_quest_tasks ADD CONSTRAINT user_quest_tasks_user_id_fkey1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_quest_tasks ADD CONSTRAINT user_quest_tasks_user_quest_id_fkey1 FOREIGN KEY (user_quest_id) REFERENCES user_quests(id) ON DELETE CASCADE;
ALTER TABLE user_quests ADD CONSTRAINT user_quests_personalization_session_id_fkey FOREIGN KEY (personalization_session_id) REFERENCES quest_personalization_sessions(id);
ALTER TABLE user_quests ADD CONSTRAINT user_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE user_quests ADD CONSTRAINT user_quests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_skill_xp ADD CONSTRAINT user_skill_xp_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_subject_xp ADD CONSTRAINT user_subject_xp_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE;
ALTER TABLE user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE CASCADE;
ALTER TABLE user_task_evidence_documents ADD CONSTRAINT user_task_evidence_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_ai_features_enabled_by_fkey FOREIGN KEY (ai_features_enabled_by) REFERENCES users(id);
ALTER TABLE users ADD CONSTRAINT users_auth_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_managed_by_parent_id_fkey FOREIGN KEY (managed_by_parent_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE users ADD CONSTRAINT users_parental_consent_verified_by_fkey FOREIGN KEY (parental_consent_verified_by) REFERENCES users(id);
ALTER TABLE xp_award_failures ADD CONSTRAINT xp_award_failures_task_id_fkey FOREIGN KEY (task_id) REFERENCES user_quest_tasks(id) ON DELETE SET NULL;
ALTER TABLE xp_award_failures ADD CONSTRAINT xp_award_failures_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================
-- indexes
-- ============================================================

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
CREATE INDEX idx_group_members_added_by ON public.group_members USING btree (added_by);
CREATE INDEX idx_group_members_group_id ON public.group_members USING btree (group_id);
CREATE INDEX idx_group_members_user_id ON public.group_members USING btree (user_id);
CREATE INDEX idx_group_messages_created_at ON public.group_messages USING btree (created_at DESC);
CREATE INDEX idx_group_messages_group_id ON public.group_messages USING btree (group_id);
CREATE INDEX idx_group_messages_sender_id ON public.group_messages USING btree (sender_id);
CREATE INDEX idx_household_members_household ON public.household_members USING btree (household_id);
CREATE INDEX idx_household_members_user ON public.household_members USING btree (user_id);
CREATE INDEX idx_households_org ON public.households USING btree (organization_id);
CREATE INDEX idx_icreate_registrations_org ON public.icreate_registrations USING btree (organization_id);
CREATE INDEX idx_icreate_registrations_parent ON public.icreate_registrations USING btree (parent_user_id);
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
CREATE INDEX idx_organizations_is_active ON public.organizations USING btree (is_active);
CREATE INDEX idx_organizations_slug ON public.organizations USING btree (slug);
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
CREATE INDEX idx_philosophy_edges_source ON public.philosophy_edges USING btree (source_node_id);
CREATE INDEX idx_philosophy_edges_target ON public.philosophy_edges USING btree (target_node_id);
CREATE INDEX idx_philosophy_nodes_level ON public.philosophy_nodes USING btree (level);
CREATE INDEX idx_philosophy_nodes_parent ON public.philosophy_nodes USING btree (parent_node_id);
CREATE INDEX idx_philosophy_nodes_visible ON public.philosophy_nodes USING btree (is_visible);
CREATE INDEX idx_planned_credits_user_id ON public.planned_credits USING btree (user_id);
CREATE INDEX idx_poe_participants_class_quest_id ON public.poe_participants USING btree (class_quest_id);
CREATE INDEX idx_poe_participants_cohort ON public.poe_participants USING btree (poe_cohort_id);
CREATE INDEX idx_poe_signups_cohort ON public.poe_signups USING btree (poe_cohort_id);
CREATE UNIQUE INDEX idx_poe_signups_cohort_email ON public.poe_signups USING btree (poe_cohort_id, email);
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
CREATE INDEX idx_sis_curriculum_quests_curriculum ON public.sis_curriculum_quests USING btree (curriculum_id, sequence_order);
CREATE INDEX idx_sis_curriculum_quests_quest ON public.sis_curriculum_quests USING btree (quest_id);
CREATE INDEX idx_sis_discount_rules_org ON public.sis_discount_rules USING btree (organization_id);
CREATE UNIQUE INDEX idx_sis_engagement_alerts_open_dedupe ON public.sis_engagement_alerts USING btree (organization_id, student_user_id, quest_id, alert_type) WHERE (resolved_at IS NULL);
CREATE INDEX sis_enrollment_waitlist_org_idx ON public.sis_enrollment_waitlist USING btree (organization_id, status, created_at);
CREATE INDEX sis_enrollment_waitlist_queue_idx ON public.sis_enrollment_waitlist USING btree (organization_id, band_min_age, band_max_age, manual_rank, queued_at) WHERE (status = 'waiting'::text);
CREATE UNIQUE INDEX sis_enrollment_waitlist_waiting_uniq ON public.sis_enrollment_waitlist USING btree (organization_id, student_user_id) WHERE (status = 'waiting'::text);
CREATE INDEX idx_sis_events_categories ON public.sis_events USING gin (categories);
CREATE INDEX sis_events_org_start_idx ON public.sis_events USING btree (organization_id, start_at);
CREATE INDEX sis_form_comments_submission_idx ON public.sis_form_comments USING btree (submission_id, created_at);
CREATE INDEX sis_form_submissions_assignee_idx ON public.sis_form_submissions USING btree (assigned_to, status);
CREATE INDEX sis_form_submissions_org_status_idx ON public.sis_form_submissions USING btree (organization_id, status);
CREATE INDEX sis_form_submissions_submitter_idx ON public.sis_form_submissions USING btree (submitted_by);
CREATE INDEX idx_sis_installments_plan ON public.sis_installments USING btree (payment_plan_id);
CREATE INDEX idx_sis_installments_status ON public.sis_installments USING btree (status);
CREATE INDEX idx_sis_invoice_line_items_invoice ON public.sis_invoice_line_items USING btree (invoice_id);
CREATE INDEX idx_sis_invoices_household ON public.sis_invoices USING btree (household_id);
CREATE INDEX idx_sis_invoices_org ON public.sis_invoices USING btree (organization_id);
CREATE INDEX idx_sis_invoices_status ON public.sis_invoices USING btree (organization_id, status);
CREATE INDEX idx_sis_lost_found_org ON public.sis_lost_found USING btree (organization_id, created_at DESC);
CREATE INDEX idx_sis_onboarding_assignments_user_audience ON public.sis_onboarding_assignments USING btree (user_id, audience);
CREATE INDEX sis_onboarding_assignments_org_user_idx ON public.sis_onboarding_assignments USING btree (organization_id, user_id);
CREATE INDEX sis_onboarding_templates_org_idx ON public.sis_onboarding_templates USING btree (organization_id);
CREATE INDEX idx_sis_payment_plans_invoice ON public.sis_payment_plans USING btree (invoice_id);
CREATE INDEX idx_sis_payment_records_invoice ON public.sis_payment_records USING btree (invoice_id);
CREATE INDEX idx_sis_payment_records_org ON public.sis_payment_records USING btree (organization_id);
CREATE INDEX idx_sis_payment_reminders_invoice ON public.sis_payment_reminders USING btree (invoice_id, sent_at);
CREATE INDEX idx_sis_qbo_sync_org ON public.sis_quickbooks_sync_log USING btree (organization_id, status);
CREATE INDEX idx_sis_recognition_org ON public.sis_recognition USING btree (organization_id, created_at DESC);
CREATE INDEX idx_sis_registration_items_class ON public.sis_registration_items USING btree (class_id);
CREATE INDEX idx_sis_registration_items_reg ON public.sis_registration_items USING btree (registration_id);
CREATE INDEX idx_sis_registrations_org ON public.sis_registrations USING btree (organization_id);
CREATE INDEX idx_sis_registrations_status ON public.sis_registrations USING btree (organization_id, status);
CREATE INDEX idx_sis_registrations_student ON public.sis_registrations USING btree (student_user_id);
CREATE INDEX idx_sis_saved_pm_guardian ON public.sis_saved_payment_methods USING btree (guardian_user_id);
CREATE INDEX idx_sis_saved_pm_org ON public.sis_saved_payment_methods USING btree (organization_id);
CREATE INDEX sis_schedule_submissions_org_idx ON public.sis_schedule_submissions USING btree (organization_id, status, submitted_at);
CREATE INDEX idx_sis_secure_documents_org_owner ON public.sis_secure_documents USING btree (organization_id, owner_user_id);
CREATE INDEX idx_sis_secure_documents_org_student ON public.sis_secure_documents USING btree (organization_id, student_user_id);
CREATE INDEX idx_sis_secure_documents_owner_shared ON public.sis_secure_documents USING btree (organization_id, owner_user_id, shared_with_owner);
CREATE INDEX sis_staff_assignments_org_user_idx ON public.sis_staff_assignments USING btree (organization_id, user_id);
CREATE INDEX sis_staff_profiles_org_idx ON public.sis_staff_profiles USING btree (organization_id);
CREATE INDEX idx_sis_staff_training_audience ON public.sis_staff_training USING btree (organization_id, audience, sequence_order);
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
CREATE UNIQUE INDEX uq_planned_absence_active ON public.student_planned_absences USING btree (student_user_id, absence_date, class_id) WHERE (status = 'active'::text);
CREATE INDEX idx_student_wallets_user_id ON public.student_wallets USING btree (user_id);
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

-- ============================================================
-- triggers
-- ============================================================

CREATE TRIGGER advisor_checkins_updated_at BEFORE UPDATE ON public.advisor_checkins FOR EACH ROW EXECUTE FUNCTION update_advisor_checkins_updated_at();
CREATE TRIGGER advisor_notes_updated_at BEFORE UPDATE ON public.advisor_notes FOR EACH ROW EXECUTE FUNCTION update_advisor_notes_updated_at();
CREATE TRIGGER ai_quest_review_queue_updated_at BEFORE UPDATE ON public.ai_quest_review_queue FOR EACH ROW EXECUTE FUNCTION update_ai_quest_review_queue_updated_at();
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION update_announcements_updated_at();
CREATE TRIGGER update_automation_sequences_updated_at BEFORE UPDATE ON public.automation_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER contact_submissions_updated_at BEFORE UPDATE ON public.contact_submissions FOR EACH ROW EXECUTE FUNCTION update_contact_submissions_updated_at();
CREATE TRIGGER update_course_plan_sessions_timestamp BEFORE UPDATE ON public.course_plan_sessions FOR EACH ROW EXECUTE FUNCTION update_course_plan_sessions_updated_at();
CREATE TRIGGER update_course_refine_sessions_timestamp BEFORE UPDATE ON public.course_refine_sessions FOR EACH ROW EXECUTE FUNCTION update_course_refine_sessions_updated_at();
CREATE TRIGGER trigger_update_curriculum_attachments_updated_at BEFORE UPDATE ON public.curriculum_attachments FOR EACH ROW EXECUTE FUNCTION update_curriculum_attachments_updated_at();
CREATE TRIGGER trigger_update_curriculum_lesson_progress_updated_at BEFORE UPDATE ON public.curriculum_lesson_progress FOR EACH ROW EXECUTE FUNCTION update_curriculum_lesson_progress_updated_at();
CREATE TRIGGER trigger_update_curriculum_lesson_search_vector BEFORE INSERT OR UPDATE OF title, description, content ON public.curriculum_lessons FOR EACH ROW EXECUTE FUNCTION update_curriculum_lesson_search_vector();
CREATE TRIGGER trigger_update_curriculum_lessons_updated_at BEFORE UPDATE ON public.curriculum_lessons FOR EACH ROW EXECUTE FUNCTION update_curriculum_lessons_updated_at();
CREATE TRIGGER trigger_update_curriculum_settings_updated_at BEFORE UPDATE ON public.curriculum_settings FOR EACH ROW EXECUTE FUNCTION update_curriculum_settings_updated_at();
CREATE TRIGGER trg_publication_consent_provenance BEFORE INSERT OR UPDATE ON public.diplomas FOR EACH ROW EXECUTE FUNCTION enforce_publication_consent_provenance();
CREATE TRIGGER docs_articles_search_update BEFORE INSERT OR UPDATE OF title, content, summary ON public.docs_articles FOR EACH ROW EXECUTE FUNCTION docs_articles_search_vector_update();
CREATE TRIGGER docs_categories_updated_at_trigger BEFORE UPDATE ON public.docs_categories FOR EACH ROW EXECUTE FUNCTION docs_categories_updated_at();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER evidence_report_configs_updated_at_trigger BEFORE UPDATE ON public.evidence_report_configs FOR EACH ROW EXECUTE FUNCTION update_evidence_report_configs_updated_at();
CREATE TRIGGER update_group_conversations_updated_at BEFORE UPDATE ON public.group_conversations FOR EACH ROW EXECUTE FUNCTION update_group_conversation_timestamp();
CREATE TRIGGER update_group_last_message_trigger AFTER INSERT ON public.group_messages FOR EACH ROW EXECUTE FUNCTION update_group_last_message();
CREATE TRIGGER update_learning_event_evidence_blocks_updated_at BEFORE UPDATE ON public.learning_event_evidence_blocks FOR EACH ROW EXECUTE FUNCTION update_learning_events_updated_at();
CREATE TRIGGER update_learning_events_updated_at BEFORE UPDATE ON public.learning_events FOR EACH ROW EXECUTE FUNCTION update_learning_events_updated_at();
CREATE TRIGGER org_classes_updated_at_trigger BEFORE UPDATE ON public.org_classes FOR EACH ROW EXECUTE FUNCTION update_org_classes_updated_at();
CREATE TRIGGER org_invitations_updated_at BEFORE UPDATE ON public.org_invitations FOR EACH ROW EXECUTE FUNCTION update_org_invitations_updated_at();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_parent_links_updated_at BEFORE UPDATE ON public.parent_student_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER philosophy_edges_updated_at BEFORE UPDATE ON public.philosophy_edges FOR EACH ROW EXECUTE FUNCTION update_philosophy_updated_at();
CREATE TRIGGER philosophy_nodes_updated_at BEFORE UPDATE ON public.philosophy_nodes FOR EACH ROW EXECUTE FUNCTION update_philosophy_updated_at();
CREATE TRIGGER quest_invitations_responded_at BEFORE UPDATE ON public.quest_invitations FOR EACH ROW EXECUTE FUNCTION set_quest_invitation_responded_at();
CREATE TRIGGER quest_invitations_updated_at BEFORE UPDATE ON public.quest_invitations FOR EACH ROW EXECUTE FUNCTION update_quest_invitations_updated_at();
CREATE TRIGGER trigger_quests_updated_at BEFORE UPDATE ON public.quests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_calculate_transfer_total_xp BEFORE INSERT OR UPDATE OF subject_xp ON public.transfer_credits FOR EACH ROW EXECUTE FUNCTION calculate_transfer_credits_total_xp();
CREATE TRIGGER trigger_update_conversation_stats AFTER INSERT ON public.tutor_messages FOR EACH ROW EXECUTE FUNCTION update_conversation_stats();
CREATE TRIGGER trigger_update_user_mastery AFTER INSERT OR UPDATE ON public.user_skill_xp FOR EACH ROW EXECUTE FUNCTION update_user_mastery_trigger();
CREATE TRIGGER trigger_user_skill_xp_updated_at BEFORE UPDATE ON public.user_skill_xp FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_user_subject_xp_updated_at BEFORE UPDATE ON public.user_subject_xp FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER evidence_documents_updated_at BEFORE UPDATE ON public.user_task_evidence_documents FOR EACH ROW EXECUTE FUNCTION update_evidence_document_updated_at();
CREATE TRIGGER generate_slug_trigger AFTER INSERT OR UPDATE OF first_name, last_name, display_name ON public.users FOR EACH ROW EXECUTE FUNCTION generate_portfolio_slug();
CREATE TRIGGER sync_is_org_admin_trigger BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION sync_is_org_admin();
CREATE TRIGGER trigger_check_parental_consent BEFORE INSERT OR UPDATE OF date_of_birth ON public.users FOR EACH ROW EXECUTE FUNCTION check_parental_consent_requirement();
CREATE TRIGGER trigger_sync_auth_user_deletion AFTER DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION sync_auth_user_deletion();

-- ============================================================
-- row level security
-- ============================================================

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
ALTER TABLE public.icreate_registrations ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parental_consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.philosophy_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.philosophy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planned_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poe_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poe_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poe_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_visibility_reset_20260801 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_visibility_reset_20260801 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_visibility_reset_20260802 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_visibility_reset_20260802 FORCE ROW LEVEL SECURITY;
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
ALTER TABLE public.sis_curriculum_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_engagement_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_enrollment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_family_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_form_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_form_submissions ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.student_wallets ENABLE ROW LEVEL SECURITY;
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

-- ============================================================
-- policies
-- ============================================================

CREATE POLICY account_deletion_log_select ON public.account_deletion_log FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY "School admins can view their org audit logs" ON public.admin_audit_logs FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = admin_audit_logs.organization_id) AND ((users.is_org_admin = true) OR ((users.role)::text = 'admin'::text))))));
CREATE POLICY "System can insert audit logs" ON public.admin_audit_logs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Admins can insert masquerade logs" ON public.admin_masquerade_log FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Admins can update masquerade logs" ON public.admin_masquerade_log FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Admins can view all masquerade logs" ON public.admin_masquerade_log FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY admin_delete_checkins ON public.advisor_checkins FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY advisor_create_checkins ON public.advisor_checkins FOR INSERT TO public WITH CHECK (((advisor_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'advisor'::text])))))));
CREATE POLICY advisor_update_own_checkins ON public.advisor_checkins FOR UPDATE TO public USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY advisor_view_own_checkins ON public.advisor_checkins FOR SELECT TO public USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'advisor'::text])))))));
CREATE POLICY advisor_notes_advisor_delete ON public.advisor_notes FOR DELETE TO public USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY advisor_notes_advisor_insert ON public.advisor_notes FOR INSERT TO public WITH CHECK (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'advisor'::text])))))));
CREATE POLICY advisor_notes_advisor_select ON public.advisor_notes FOR SELECT TO public USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY advisor_notes_advisor_update ON public.advisor_notes FOR UPDATE TO public USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY "Admins can manage advisor assignments" ON public.advisor_student_assignments FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Advisors can view their assignments" ON public.advisor_student_assignments FOR SELECT TO public USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text))))));
CREATE POLICY ai_generated_quests_admin_all ON public.ai_generated_quests FOR ALL TO public USING (is_admin());
CREATE POLICY ai_generation_jobs_admin_all ON public.ai_generation_jobs FOR ALL TO public USING (is_admin());
CREATE POLICY "Superadmin full access to ai_prompt_components" ON public.ai_prompt_components FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY admin_all_access ON public.ai_quest_review_queue FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY ai_seeds_admin_all ON public.ai_seeds FOR ALL TO public USING (is_admin());
CREATE POLICY "Users can view cached tasks" ON public.ai_task_cache FOR SELECT TO public USING (true);
CREATE POLICY ai_usage_logs_superadmin_all ON public.ai_usage_logs FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Users can mark announcements as read" ON public.announcement_reads FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own read records" ON public.announcement_reads FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own announcement reads" ON public.announcement_reads FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Advisors and admins can create announcements" ON public.announcements FOR INSERT TO public WITH CHECK (((( SELECT auth.uid() AS uid) = author_id) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = announcements.organization_id) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'educator'::text, 'admin'::text])))))));
CREATE POLICY "Authors and admins can delete announcements" ON public.announcements FOR DELETE TO public USING (((( SELECT auth.uid() AS uid) = author_id) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = announcements.organization_id) AND (((users.role)::text = 'admin'::text) OR (users.is_org_admin = true)))))));
CREATE POLICY "Authors can update their announcements" ON public.announcements FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = author_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = author_id));
CREATE POLICY "Users can view announcements from their organization" ON public.announcements FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = announcements.organization_id)))));
CREATE POLICY "Admins can manage automation sequences" ON public.automation_sequences FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));
CREATE POLICY "Service role full access on bounties" ON public.bounties FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on bounty_claims" ON public.bounty_claims FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Students can create claims" ON public.bounty_claims FOR INSERT TO public WITH CHECK ((student_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Students can update own claims" ON public.bounty_claims FOR UPDATE TO public USING ((student_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((student_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Students can view own claims" ON public.bounty_claims FOR SELECT TO public USING (((student_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM bounties b
  WHERE ((b.id = bounty_claims.bounty_id) AND (b.poster_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Posters can create reviews" ON public.bounty_reviews FOR INSERT TO public WITH CHECK (((reviewer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM (bounty_claims bc
     JOIN bounties b ON ((b.id = bc.bounty_id)))
  WHERE ((bc.id = bounty_reviews.claim_id) AND (b.poster_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Reviewers can view own reviews" ON public.bounty_reviews FOR SELECT TO public USING (((reviewer_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM bounty_claims bc
  WHERE ((bc.id = bounty_reviews.claim_id) AND (bc.student_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Service role full access on bounty_reviews" ON public.bounty_reviews FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY buddies_insert_own ON public.buddies FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY buddies_select_own ON public.buddies FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY buddies_superadmin ON public.buddies FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY buddies_update_own ON public.buddies FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY class_advisors_admin_policy ON public.class_advisors FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (org_classes oc
     JOIN users u ON ((u.id = ( SELECT auth.uid() AS uid))))
  WHERE ((oc.id = class_advisors.class_id) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id = oc.organization_id) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY class_advisors_self_policy ON public.class_advisors FOR SELECT TO public USING ((advisor_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY class_enrollments_admin_policy ON public.class_enrollments FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (org_classes oc
     JOIN users u ON ((u.id = ( SELECT auth.uid() AS uid))))
  WHERE ((oc.id = class_enrollments.class_id) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id = oc.organization_id) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY class_enrollments_advisor_policy ON public.class_enrollments FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM class_advisors ca
  WHERE ((ca.class_id = class_enrollments.class_id) AND (ca.advisor_id = ( SELECT auth.uid() AS uid)) AND (ca.is_active = true)))));
CREATE POLICY class_enrollments_student_policy ON public.class_enrollments FOR SELECT TO public USING ((student_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY class_quests_admin_policy ON public.class_quests FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (org_classes oc
     JOIN users u ON ((u.id = ( SELECT auth.uid() AS uid))))
  WHERE ((oc.id = class_quests.class_id) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id = oc.organization_id) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY class_quests_advisor_policy ON public.class_quests FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM class_advisors ca
  WHERE ((ca.class_id = class_quests.class_id) AND (ca.advisor_id = ( SELECT auth.uid() AS uid)) AND (ca.is_active = true)))));
CREATE POLICY class_quests_student_policy ON public.class_quests FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM class_enrollments ce
  WHERE ((ce.class_id = class_quests.class_id) AND (ce.student_id = ( SELECT auth.uid() AS uid)) AND ((ce.status)::text = 'active'::text)))));
CREATE POLICY "Allow authenticated reads" ON public.consultation_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow service role all operations" ON public.consultation_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role inserts" ON public.consultation_requests FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Superadmins can read contact submissions" ON public.contact_submissions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Superadmins can update contact submissions" ON public.contact_submissions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Service role full access on content_reports" ON public.content_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can file reports" ON public.content_reports FOR INSERT TO public WITH CHECK ((reporter_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own reports" ON public.content_reports FOR SELECT TO public USING ((reporter_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY course_enrollments_insert ON public.course_enrollments FOR INSERT TO public WITH CHECK ((((user_id = ( SELECT auth.uid() AS uid)) AND (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (((courses.status)::text = 'published'::text) AND (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid)))))))) OR (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text, 'superadmin'::text])))))))));
CREATE POLICY course_enrollments_select ON public.course_enrollments FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text, 'superadmin'::text])))))))));
CREATE POLICY course_enrollments_update ON public.course_enrollments FOR UPDATE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text, 'superadmin'::text]))))))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text, 'superadmin'::text])))))))));
CREATE POLICY teachers_admins_delete_enrollments ON public.course_enrollments FOR DELETE TO public USING ((course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text]))))))));
CREATE POLICY "Users can create own generation jobs" ON public.course_generation_jobs FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own generation jobs" ON public.course_generation_jobs FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own generation jobs" ON public.course_generation_jobs FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Advisors can manage own plan sessions" ON public.course_plan_sessions FOR ALL TO public USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (((users.role)::text = 'advisor'::text) OR (((users.role)::text = 'org_managed'::text) AND (users.org_role = 'advisor'::text))))))));
CREATE POLICY "Org admins can manage org plan sessions" ON public.course_plan_sessions FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = course_plan_sessions.organization_id) AND (((users.role)::text = 'org_managed'::text) AND (users.org_role = 'org_admin'::text))))));
CREATE POLICY "Superadmin can manage all plan sessions" ON public.course_plan_sessions FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Anyone can view course tasks" ON public.course_quest_tasks FOR SELECT TO public USING (true);
CREATE POLICY "Only admins can manage course tasks" ON public.course_quest_tasks FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY creators_admins_manage_course_quests ON public.course_quests FOR ALL TO public USING ((course_id IN ( SELECT courses.id
   FROM courses
  WHERE ((courses.created_by = ( SELECT auth.uid() AS uid)) OR (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text]))))))))) WITH CHECK ((course_id IN ( SELECT courses.id
   FROM courses
  WHERE ((courses.created_by = ( SELECT auth.uid() AS uid)) OR (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])))))))));
CREATE POLICY users_view_course_quests ON public.course_quests FOR SELECT TO public USING ((course_id IN ( SELECT courses.id
   FROM courses
  WHERE (courses.organization_id IN ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Superadmin can manage refine sessions" ON public.course_refine_sessions FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY admins_teachers_create_courses ON public.courses FOR INSERT TO public WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text]))))));
CREATE POLICY creators_admins_delete_courses ON public.courses FOR DELETE TO public USING (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text])))))));
CREATE POLICY creators_admins_update_courses ON public.courses FOR UPDATE TO public USING (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text]))))))) WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'org_admin'::text])))))));
CREATE POLICY users_view_org_courses ON public.courses FOR SELECT TO public USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY credit_ledger_insert_policy ON public.credit_ledger FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY credit_ledger_select_policy ON public.credit_ledger FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'admin'::text])))))));
CREATE POLICY curriculum_lesson_progress_delete_own ON public.curriculum_lesson_progress FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY curriculum_lesson_progress_insert_own ON public.curriculum_lesson_progress FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY curriculum_lesson_progress_select ON public.curriculum_lesson_progress FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_lesson_progress.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = ANY (ARRAY['org_admin'::text, 'advisor'::text])))))))));
CREATE POLICY curriculum_lesson_progress_update_own ON public.curriculum_lesson_progress FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY curriculum_lesson_tasks_admin_all ON public.curriculum_lesson_tasks FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_lesson_tasks.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY curriculum_lesson_tasks_select ON public.curriculum_lesson_tasks FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY curriculum_lessons_admin_all ON public.curriculum_lessons FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_lessons.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY curriculum_lessons_select ON public.curriculum_lessons FOR SELECT TO public USING ((((( SELECT auth.uid() AS uid) IS NOT NULL) AND (is_published = true)) OR (created_by = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_lessons.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = 'org_admin'::text))))))));
CREATE POLICY curriculum_settings_admin_all ON public.curriculum_settings FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id IS NOT NULL) AND (u.organization_id = curriculum_settings.organization_id) AND ((u.role)::text = 'org_managed'::text) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY curriculum_settings_select ON public.curriculum_settings FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY curriculum_uploads_all ON public.curriculum_uploads FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))) OR ((uploaded_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'org_admin'::text, 'superadmin'::text]))))))));
CREATE POLICY curriculum_uploads_org_admin_select ON public.curriculum_uploads FOR SELECT TO public USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'org_admin'::text)))));
CREATE POLICY "Service role full access on device_tokens" ON public.device_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can delete own tokens" ON public.device_tokens FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can register tokens" ON public.device_tokens FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update own tokens" ON public.device_tokens FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view own tokens" ON public.device_tokens FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Advisors read assigned student rounds" ON public.diploma_review_rounds FOR SELECT TO public USING ((completion_id IN ( SELECT qtc.id
   FROM (quest_task_completions qtc
     JOIN advisor_student_assignments asa ON ((asa.student_id = qtc.user_id)))
  WHERE ((asa.advisor_id = ( SELECT auth.uid() AS uid)) AND (asa.is_active = true)))));
CREATE POLICY "Service role full access to review rounds" ON public.diploma_review_rounds FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Students read own review rounds" ON public.diploma_review_rounds FOR SELECT TO public USING ((completion_id IN ( SELECT quest_task_completions.id
   FROM quest_task_completions
  WHERE (quest_task_completions.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY diplomas_insert ON public.diplomas FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY diplomas_update ON public.diplomas FOR UPDATE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY "Users can send messages" ON public.direct_messages FOR INSERT TO public WITH CHECK ((sender_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update messages they received" ON public.direct_messages FOR UPDATE TO authenticated USING ((recipient_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((recipient_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY direct_messages_select ON public.direct_messages FOR SELECT TO public USING (((sender_id = ( SELECT auth.uid() AS uid)) OR (recipient_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY docs_articles_public_read ON public.docs_articles FOR SELECT TO public USING ((is_published = true));
CREATE POLICY docs_articles_service_full ON public.docs_articles FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY docs_categories_public_read ON public.docs_categories FOR SELECT TO public USING ((is_published = true));
CREATE POLICY docs_categories_service_full ON public.docs_categories FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Service role full access on docs_search_misses" ON public.docs_search_misses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Admins can manage email templates" ON public.email_templates FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));
CREATE POLICY "Users can delete blocks from their own documents" ON public.evidence_document_blocks FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can insert blocks into their own documents" ON public.evidence_document_blocks FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can update blocks in their own documents" ON public.evidence_document_blocks FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM user_task_evidence_documents uted
  WHERE ((uted.id = evidence_document_blocks.document_id) AND (uted.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY evidence_report_configs_delete_own ON public.evidence_report_configs FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_configs_insert_own ON public.evidence_report_configs FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_configs_select_own ON public.evidence_report_configs FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_configs_update_own ON public.evidence_report_configs FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_parent_approvals_select_parent ON public.evidence_report_parent_approvals FOR SELECT TO public USING ((parent_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY evidence_report_parent_approvals_select_student ON public.evidence_report_parent_approvals FOR SELECT TO public USING ((report_config_id IN ( SELECT evidence_report_configs.id
   FROM evidence_report_configs
  WHERE (evidence_report_configs.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY evidence_report_parent_approvals_update_parent ON public.evidence_report_parent_approvals FOR UPDATE TO public USING ((parent_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Service role manages feed views" ON public.feed_item_views FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users insert own feed views" ON public.feed_item_views FOR INSERT TO authenticated WITH CHECK ((viewer_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users read own feed views" ON public.feed_item_views FOR SELECT TO authenticated USING ((viewer_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can create own share tokens" ON public.feed_share_tokens FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = created_by));
CREATE POLICY "Users can delete own share tokens" ON public.feed_share_tokens FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = created_by));
CREATE POLICY "Users can view own share tokens" ON public.feed_share_tokens FOR SELECT TO public USING (((( SELECT auth.uid() AS uid) = created_by) OR (( SELECT auth.uid() AS uid) = student_id)));
CREATE POLICY "Authorized users can create groups" ON public.group_conversations FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('advisor'::character varying)::text, ('org_admin'::character varying)::text, ('superadmin'::character varying)::text]))))));
CREATE POLICY "Group admins can update groups" ON public.group_conversations FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_conversations.id) AND (group_members.user_id = ( SELECT auth.uid() AS uid)) AND ((group_members.role)::text = 'admin'::text)))));
CREATE POLICY "Users can view their groups" ON public.group_conversations FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_conversations.id) AND (group_members.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Group admins can add members" ON public.group_members FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM group_members group_members_1
  WHERE ((group_members_1.group_id = group_members_1.group_id) AND (group_members_1.user_id = ( SELECT auth.uid() AS uid)) AND ((group_members_1.role)::text = 'admin'::text)))));
CREATE POLICY "Group admins can remove members" ON public.group_members FOR DELETE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM group_members admin_check
  WHERE ((admin_check.group_id = group_members.group_id) AND (admin_check.user_id = ( SELECT auth.uid() AS uid)) AND ((admin_check.role)::text = 'admin'::text))))));
CREATE POLICY "Members can update their read status" ON public.group_members FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view group members" ON public.group_members FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM group_members my_membership
  WHERE ((my_membership.group_id = group_members.group_id) AND (my_membership.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Members can send messages" ON public.group_messages FOR INSERT TO public WITH CHECK (((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_messages.group_id) AND (group_members.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users can delete their messages" ON public.group_messages FOR UPDATE TO public USING ((sender_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view group messages" ON public.group_messages FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_messages.group_id) AND (group_members.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Service role has full access to interest_tracks" ON public.interest_tracks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can create own tracks" ON public.interest_tracks FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own tracks" ON public.interest_tracks FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own tracks" ON public.interest_tracks FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own tracks" ON public.interest_tracks FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own evidence blocks" ON public.learning_event_evidence_blocks FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM learning_events
  WHERE ((learning_events.id = learning_event_evidence_blocks.learning_event_id) AND (learning_events.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can insert own evidence blocks" ON public.learning_event_evidence_blocks FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM learning_events
  WHERE ((learning_events.id = learning_event_evidence_blocks.learning_event_id) AND (learning_events.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can update own evidence blocks" ON public.learning_event_evidence_blocks FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM learning_events
  WHERE ((learning_events.id = learning_event_evidence_blocks.learning_event_id) AND (learning_events.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view own evidence blocks" ON public.learning_event_evidence_blocks FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM learning_events
  WHERE ((learning_events.id = learning_event_evidence_blocks.learning_event_id) AND (learning_events.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can delete own event topics" ON public.learning_event_topics FOR DELETE TO public USING ((learning_event_id IN ( SELECT learning_events.id
   FROM learning_events
  WHERE (learning_events.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can insert own event topics" ON public.learning_event_topics FOR INSERT TO public WITH CHECK ((learning_event_id IN ( SELECT learning_events.id
   FROM learning_events
  WHERE (learning_events.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can view own event topics" ON public.learning_event_topics FOR SELECT TO public USING ((learning_event_id IN ( SELECT learning_events.id
   FROM learning_events
  WHERE (learning_events.user_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "Users can delete own learning events" ON public.learning_events FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own learning events" ON public.learning_events FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own learning events" ON public.learning_events FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own learning events" ON public.learning_events FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own reflections" ON public.lesson_reflections FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own reflections" ON public.lesson_reflections FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own reflections" ON public.lesson_reflections FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_grade_sync_select_own ON public.lms_grade_sync FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_integrations_delete_own ON public.lms_integrations FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_integrations_insert_own ON public.lms_integrations FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_integrations_select_own ON public.lms_integrations FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_integrations_update_own ON public.lms_integrations FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY lms_sessions_select_own ON public.lms_sessions FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Service role only" ON public.login_attempts FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Users can create conversations" ON public.message_conversations FOR INSERT TO public WITH CHECK ((participant_1_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update their conversations" ON public.message_conversations FOR UPDATE TO authenticated USING (((participant_1_id = ( SELECT auth.uid() AS uid)) OR (participant_2_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((participant_1_id = ( SELECT auth.uid() AS uid)) OR (participant_2_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY message_conversations_select ON public.message_conversations FOR SELECT TO public USING (((participant_1_id = ( SELECT auth.uid() AS uid)) OR (participant_2_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY "Service role full access on notification_preferences" ON public.notification_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences FOR ALL TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY admin_insert_audit_logs ON public.observer_access_audit FOR INSERT TO public WITH CHECK (((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text]))))) OR (( SELECT auth.uid() AS uid) IS NULL)));
CREATE POLICY observer_access_audit_select ON public.observer_access_audit FOR SELECT TO public USING (((observer_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text])))))));
CREATE POLICY observer_comments_insert_by_observer ON public.observer_comments FOR INSERT TO public WITH CHECK (((( SELECT auth.uid() AS uid) = observer_id) AND (EXISTS ( SELECT 1
   FROM observer_student_links
  WHERE ((observer_student_links.observer_id = ( SELECT auth.uid() AS uid)) AND (observer_student_links.student_id = observer_comments.student_id) AND (observer_student_links.can_comment = true))))));
CREATE POLICY observer_comments_select_related ON public.observer_comments FOR SELECT TO public USING (((( SELECT auth.uid() AS uid) = observer_id) OR (( SELECT auth.uid() AS uid) = student_id) OR (( SELECT auth.uid() AS uid) IN ( SELECT observer_student_links.observer_id
   FROM observer_student_links
  WHERE (observer_student_links.student_id = observer_comments.student_id)))));
CREATE POLICY creator_delete_observer_invitation_students ON public.observer_invitation_students FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM observer_invitations oi
  WHERE ((oi.id = observer_invitation_students.invitation_id) AND (oi.invited_by_user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY creator_insert_observer_invitation_students ON public.observer_invitation_students FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM observer_invitations oi
  WHERE ((oi.id = observer_invitation_students.invitation_id) AND (oi.invited_by_user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY creator_read_observer_invitation_students ON public.observer_invitation_students FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM observer_invitations oi
  WHERE ((oi.id = observer_invitation_students.invitation_id) AND (oi.invited_by_user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY parent_read_observer_invitation_students ON public.observer_invitation_students FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = observer_invitation_students.student_id) AND (u.managed_by_parent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM parent_student_links psl
  WHERE ((psl.student_user_id = observer_invitation_students.student_id) AND (psl.parent_user_id = ( SELECT auth.uid() AS uid)) AND ((psl.status)::text = 'approved'::text))))));
CREATE POLICY student_read_own_invitation_students ON public.observer_invitation_students FOR SELECT TO public USING ((student_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY superadmin_all_observer_invitation_students ON public.observer_invitation_students FOR ALL TO public USING (is_superadmin(( SELECT auth.uid() AS uid)));
CREATE POLICY observer_invitations_delete_own ON public.observer_invitations FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_invitations_insert_own ON public.observer_invitations FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_invitations_select_own ON public.observer_invitations FOR SELECT TO public USING (((( SELECT auth.uid() AS uid) = student_id) OR (observer_email = (( SELECT users.email
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))::text)));
CREATE POLICY observer_invitations_update_own ON public.observer_invitations FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_links_delete_by_student ON public.observer_student_links FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_links_insert_by_student ON public.observer_student_links FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = student_id));
CREATE POLICY observer_links_select_own ON public.observer_student_links FOR SELECT TO public USING (((( SELECT auth.uid() AS uid) = observer_id) OR (( SELECT auth.uid() AS uid) = student_id)));
CREATE POLICY org_classes_advisor_policy ON public.org_classes FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM class_advisors ca
  WHERE ((ca.class_id = org_classes.id) AND (ca.advisor_id = ( SELECT auth.uid() AS uid)) AND (ca.is_active = true)))));
CREATE POLICY org_classes_org_admin_policy ON public.org_classes FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (((u.role)::text = 'superadmin'::text) OR ((u.organization_id = org_classes.organization_id) AND (u.org_role = 'org_admin'::text)))))));
CREATE POLICY "Org admins can create org invitations" ON public.org_invitations FOR INSERT TO public WITH CHECK (((( SELECT auth.uid() AS uid) = invited_by) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = org_invitations.organization_id) AND ((users.role)::text = ANY (ARRAY['org_admin'::text, 'superadmin'::text])))))));
CREATE POLICY "Org admins can delete org invitations" ON public.org_invitations FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = org_invitations.organization_id) AND ((users.role)::text = ANY (ARRAY['org_admin'::text, 'superadmin'::text]))))));
CREATE POLICY "Org admins can update org invitations" ON public.org_invitations FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = org_invitations.organization_id) AND ((users.role)::text = ANY (ARRAY['org_admin'::text, 'superadmin'::text]))))));
CREATE POLICY org_invitations_select ON public.org_invitations FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (((users.role)::text = 'superadmin'::text) OR (((users.role)::text = ANY (ARRAY['org_admin'::text, 'superadmin'::text])) AND (users.organization_id = org_invitations.organization_id)))))));
CREATE POLICY org_admins_can_manage_course_access ON public.organization_course_access FOR ALL TO public USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.is_org_admin = true) OR ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text, 'org_admin'::text])))))));
CREATE POLICY users_can_view_org_course_access ON public.organization_course_access FOR SELECT TO public USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY org_admins_can_manage_quest_access ON public.organization_quest_access FOR ALL TO public USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.is_org_admin = true) OR ((users.role)::text = 'admin'::text))))));
CREATE POLICY users_can_view_org_quest_access ON public.organization_quest_access FOR SELECT TO public USING ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY org_admin_update_own_org ON public.organizations FOR UPDATE TO public USING ((is_org_admin_user(( SELECT auth.uid() AS uid)) AND (id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY organizations_select ON public.organizations FOR SELECT TO public USING (((is_active = true) OR (is_org_admin_user(( SELECT auth.uid() AS uid)) AND (id = ( SELECT users.organization_id
   FROM users
  WHERE (users.id = ( SELECT auth.uid() AS uid))))) OR is_superadmin(( SELECT auth.uid() AS uid))));
CREATE POLICY superadmin_can_manage_organizations ON public.organizations FOR ALL TO public USING ((( SELECT auth.uid() AS uid) IN ( SELECT users.id
   FROM users
  WHERE (((users.role)::text = 'admin'::text) AND ((users.email)::text = 'tannerbowman@gmail.com'::text)))));
CREATE POLICY parent_links_update_student ON public.parent_student_links FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = student_user_id));
CREATE POLICY parent_student_links_admin_manage ON public.parent_student_links FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY parent_student_links_select ON public.parent_student_links FOR SELECT TO public USING (((parent_user_id = ( SELECT auth.uid() AS uid)) OR (student_user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY parental_consent_log_select ON public.parental_consent_log FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY password_reset_attempts_service_role_only ON public.password_reset_attempts FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Service role can manage password reset tokens" ON public.password_reset_tokens FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Public can read visible philosophy edges" ON public.philosophy_edges FOR SELECT TO public USING ((is_visible = true));
CREATE POLICY "Public can read visible philosophy nodes" ON public.philosophy_nodes FOR SELECT TO public USING ((is_visible = true));
CREATE POLICY "Anyone can submit interest" ON public.promo_interest FOR INSERT TO public WITH CHECK (true);
CREATE POLICY parent_respond_to_visibility_requests ON public.public_visibility_requests FOR UPDATE TO public USING ((parent_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((parent_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY public_visibility_requests_select ON public.public_visibility_requests FOR SELECT TO public USING (((student_user_id = ( SELECT auth.uid() AS uid)) OR (parent_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['superadmin'::text, 'org_admin'::text])))))));
CREATE POLICY service_insert_visibility_requests ON public.public_visibility_requests FOR INSERT TO public WITH CHECK (((( SELECT auth.uid() AS uid) IS NULL) OR (student_user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Users can create own push subscriptions" ON public.push_subscriptions FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can delete own push subscriptions" ON public.push_subscriptions FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own push subscriptions" ON public.push_subscriptions FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Advisors can create quest invitations" ON public.quest_invitations FOR INSERT TO public WITH CHECK (((( SELECT auth.uid() AS uid) = advisor_id) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.organization_id = quest_invitations.organization_id) AND ((users.role)::text = ANY (ARRAY['advisor'::text, 'school_admin'::text, 'superadmin'::text, 'admin'::text, 'educator'::text])))))));
CREATE POLICY "Advisors can delete their quest invitations" ON public.quest_invitations FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = advisor_id));
CREATE POLICY quest_invitations_select ON public.quest_invitations FOR SELECT TO public USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY quest_invitations_update ON public.quest_invitations FOR UPDATE TO public USING (((advisor_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((advisor_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Users can create their own sessions" ON public.quest_personalization_sessions FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own sessions" ON public.quest_personalization_sessions FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own sessions" ON public.quest_personalization_sessions FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Anyone can view sample tasks" ON public.quest_sample_tasks FOR SELECT TO public USING (true);
CREATE POLICY "Only admins can manage sample tasks" ON public.quest_sample_tasks FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Only admins can manage quest sources" ON public.quest_sources FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Public read access to quest sources" ON public.quest_sources FOR SELECT TO public USING (true);
CREATE POLICY admin_advisor_access_completions ON public.quest_task_completions FOR ALL TO public USING ((is_superadmin(( SELECT auth.uid() AS uid)) OR is_advisor_user(( SELECT auth.uid() AS uid))));
CREATE POLICY quest_task_completions_own_insert ON public.quest_task_completions FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY quest_task_completions_own_read ON public.quest_task_completions FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY advisor_create_template_tasks ON public.quest_template_tasks FOR INSERT TO public WITH CHECK ((is_superadmin(( SELECT auth.uid() AS uid)) OR is_advisor_user(( SELECT auth.uid() AS uid))));
CREATE POLICY advisor_delete_template_tasks ON public.quest_template_tasks FOR DELETE TO public USING ((is_superadmin(( SELECT auth.uid() AS uid)) OR is_advisor_user(( SELECT auth.uid() AS uid))));
CREATE POLICY advisor_update_template_tasks ON public.quest_template_tasks FOR UPDATE TO public USING ((is_superadmin(( SELECT auth.uid() AS uid)) OR is_advisor_user(( SELECT auth.uid() AS uid))));
CREATE POLICY authenticated_read_template_tasks ON public.quest_template_tasks FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY "Quests are viewable by everyone" ON public.quests FOR SELECT TO public USING ((is_active = true));
CREATE POLICY admin_full_access_quests ON public.quests FOR ALL TO public USING ((is_superadmin(( SELECT auth.uid() AS uid)) OR (is_org_admin_user(( SELECT auth.uid() AS uid)) AND ((organization_id = ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = ( SELECT auth.uid() AS uid)))) OR (organization_id IS NULL)))));
CREATE POLICY quests_update ON public.quests FOR UPDATE TO public USING (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.is_org_admin = true) OR ((users.role)::text = 'admin'::text))))))) WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR (organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.is_org_admin = true) OR ((users.role)::text = 'admin'::text)))))));
CREATE POLICY users_can_create_quests ON public.quests FOR INSERT TO public WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Only admins can insert role changes" ON public.role_change_log FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Only admins can view role changes" ON public.role_change_log FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Admin can delete scheduled jobs" ON public.scheduled_jobs FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'educator'::text]))))));
CREATE POLICY "Admin can insert scheduled jobs" ON public.scheduled_jobs FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'educator'::text]))))));
CREATE POLICY "Admin can update scheduled jobs" ON public.scheduled_jobs FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'educator'::text]))))));
CREATE POLICY "Admin can view all scheduled jobs" ON public.scheduled_jobs FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'educator'::text]))))));
CREATE POLICY "Only admins can manage security documentation" ON public.security_warnings_documentation FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY "Public read access to security documentation" ON public.security_warnings_documentation FOR SELECT TO public USING (true);
CREATE POLICY site_settings_admin_all ON public.site_settings FOR ALL TO public USING (is_admin());
CREATE POLICY site_settings_select_all ON public.site_settings FOR SELECT TO public USING (true);
CREATE POLICY student_access_logs_select ON public.student_access_logs FOR SELECT TO public USING (((student_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR (student_id IN ( SELECT users.id
   FROM users
  WHERE ((users.managed_by_parent_id = ( SELECT auth.uid() AS uid)) AND (users.is_dependent = true))))));
CREATE POLICY system_insert_access_logs ON public.student_access_logs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role full access on student_wallets" ON public.student_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Superadmins can manage all feedback" ON public.task_feedback FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'superadmin'::text)))));
CREATE POLICY "Users can view feedback on own completions" ON public.task_feedback FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM quest_task_completions qtc
  WHERE ((qtc.id = task_feedback.completion_id) AND (qtc.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can delete their own task steps" ON public.task_steps FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert their own task steps" ON public.task_steps FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own task steps" ON public.task_steps FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own task steps" ON public.task_steps FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY parent_view_child_transcript_shares ON public.transcript_share_tokens FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = transcript_share_tokens.user_id) AND (u.managed_by_parent_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM parent_student_links l
  WHERE ((l.student_user_id = transcript_share_tokens.user_id) AND (l.parent_user_id = auth.uid()) AND ((l.status)::text = ANY ((ARRAY['approved'::character varying, 'active'::character varying])::text[])))))));
CREATE POLICY student_view_own_transcript_shares ON public.transcript_share_tokens FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can delete transfer credits" ON public.transfer_credits FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))));
CREATE POLICY "Admins can insert transfer credits" ON public.transfer_credits FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))));
CREATE POLICY "Admins can read all transfer credits" ON public.transfer_credits FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))));
CREATE POLICY "Admins can update transfer credits" ON public.transfer_credits FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY[('superadmin'::character varying)::text, ('org_admin'::character varying)::text]))))));
CREATE POLICY "Users can view own transfer credits" ON public.transfer_credits FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can create own conversations" ON public.tutor_conversations FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update own conversations" ON public.tutor_conversations FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own conversations" ON public.tutor_conversations FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can create messages in own conversations" ON public.tutor_messages FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM tutor_conversations
  WHERE ((tutor_conversations.id = tutor_messages.conversation_id) AND (tutor_conversations.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view own messages" ON public.tutor_messages FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM tutor_conversations
  WHERE ((tutor_conversations.id = tutor_messages.conversation_id) AND (tutor_conversations.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "Users can view own safety reports" ON public.tutor_safety_reports FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view own settings" ON public.tutor_settings FOR ALL TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "All users can view tier limits" ON public.tutor_tier_limits FOR SELECT TO public USING (true);
CREATE POLICY "Service role can modify tier limits" ON public.tutor_tier_limits FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Admins can view tutorial verification logs" ON public.tutorial_verification_log FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));
CREATE POLICY admin_activity_select_all ON public.user_activity_events FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.role)::text = 'admin'::text)))));
CREATE POLICY service_activity_insert ON public.user_activity_events FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY user_activity_select_own ON public.user_activity_events FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Service role full access on user_blocks" ON public.user_blocks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users manage own blocks" ON public.user_blocks FOR ALL TO public USING ((blocker_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((blocker_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can insert their own tasks" ON public.user_quest_tasks FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own tasks" ON public.user_quest_tasks FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can view their own tasks" ON public.user_quest_tasks FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY admin_full_access_user_quest_tasks ON public.user_quest_tasks FOR ALL TO public USING ((is_superadmin(( SELECT auth.uid() AS uid)) OR (is_org_admin_user(( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = user_quest_tasks.user_id) AND (u.organization_id = ( SELECT users.organization_id
           FROM users
          WHERE (users.id = ( SELECT auth.uid() AS uid))))))))));
CREATE POLICY "Users can enroll in quests" ON public.user_quests FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can update their own quest enrollments" ON public.user_quests FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view their own quest enrollments" ON public.user_quests FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Service role can manage skill details" ON public.user_skill_details FOR ALL TO public USING (((( SELECT auth.role() AS role) = 'service_role'::text) OR (( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "User skill details insertable by system" ON public.user_skill_details FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "User skill details updatable by system" ON public.user_skill_details FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view their own skill details" ON public.user_skill_details FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Service role manages subject xp" ON public.user_subject_xp FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own subject xp" ON public.user_subject_xp FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can delete their own evidence documents" ON public.user_task_evidence_documents FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert their own evidence documents" ON public.user_task_evidence_documents FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can update their own evidence documents" ON public.user_task_evidence_documents FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY parent_delete_dependents ON public.users FOR DELETE TO public USING ((managed_by_parent_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY users_admin_all ON public.users FOR ALL TO public USING ((is_superadmin(( SELECT auth.uid() AS uid)) OR ((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'service_role'::text)));
CREATE POLICY users_insert_consolidated ON public.users FOR INSERT TO public WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR ((is_dependent = true) AND (managed_by_parent_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY users_select_consolidated ON public.users FOR SELECT TO public USING (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.role() AS role) = 'service_role'::text) OR is_superadmin(( SELECT auth.uid() AS uid)) OR (is_org_admin_user(( SELECT auth.uid() AS uid)) AND (organization_id = get_user_org_id(( SELECT auth.uid() AS uid)))) OR (managed_by_parent_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY users_update_consolidated ON public.users FOR UPDATE TO public USING (((id = ( SELECT auth.uid() AS uid)) OR (is_org_admin_user(( SELECT auth.uid() AS uid)) AND (organization_id = get_user_org_id(( SELECT auth.uid() AS uid))) AND (id <> ( SELECT auth.uid() AS uid)) AND ((role)::text <> 'superadmin'::text)) OR (managed_by_parent_id = ( SELECT auth.uid() AS uid)))) WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR (is_org_admin_user(( SELECT auth.uid() AS uid)) AND (organization_id = get_user_org_id(( SELECT auth.uid() AS uid))) AND (id <> ( SELECT auth.uid() AS uid)) AND ((role)::text <> 'superadmin'::text)) OR (managed_by_parent_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "Service role full access on xp_award_failures" ON public.xp_award_failures FOR ALL TO service_role USING (true) WITH CHECK (true);
