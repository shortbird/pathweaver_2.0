-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.account_deletion_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email character varying NOT NULL,
  first_name character varying,
  last_name character varying,
  deletion_requested_at timestamp with time zone NOT NULL,
  deletion_completed_at timestamp with time zone,
  reason text,
  user_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT account_deletion_log_pkey PRIMARY KEY (id),
  CONSTRAINT account_deletion_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.activity_log (
  id integer NOT NULL DEFAULT nextval('activity_log_id_seq'::regclass),
  user_id uuid,
  event_type text NOT NULL,
  event_details jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.advisor_group_members (
  group_id uuid NOT NULL,
  student_id uuid NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT advisor_group_members_pkey PRIMARY KEY (student_id, group_id),
  CONSTRAINT advisor_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.advisor_groups(id),
  CONSTRAINT advisor_group_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id)
);
CREATE TABLE public.advisor_groups (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  advisor_id uuid,
  group_name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  CONSTRAINT advisor_groups_pkey PRIMARY KEY (id),
  CONSTRAINT advisor_groups_advisor_id_fkey FOREIGN KEY (advisor_id) REFERENCES public.users(id)
);
CREATE TABLE public.ai_content_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content_type character varying NOT NULL CHECK (content_type::text = ANY (ARRAY['badge'::character varying, 'quest'::character varying, 'task'::character varying]::text[])),
  content_id uuid NOT NULL,
  engagement_score numeric DEFAULT 0.00 CHECK (engagement_score >= 0::numeric AND engagement_score <= 1::numeric),
  completion_rate numeric DEFAULT 0.00 CHECK (completion_rate >= 0::numeric AND completion_rate <= 1::numeric),
  avg_time_to_complete integer,
  student_feedback_avg numeric DEFAULT 0.00 CHECK (student_feedback_avg >= 0::numeric AND student_feedback_avg <= 5::numeric),
  teacher_override_count integer DEFAULT 0,
  view_count integer DEFAULT 0,
  start_count integer DEFAULT 0,
  last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_content_metrics_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_cycle_logs (
  id integer NOT NULL DEFAULT nextval('ai_cycle_logs_id_seq'::regclass),
  status text NOT NULL,
  result jsonb,
  executed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_cycle_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_generated_quests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  generation_job_id uuid,
  quest_data jsonb NOT NULL,
  quality_score numeric CHECK (quality_score >= 0::numeric AND quality_score <= 100::numeric),
  review_status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (review_status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'modified'::character varying, 'published'::character varying]::text[])),
  review_notes text,
  reviewer_id uuid,
  published_quest_id uuid,
  duplicate_of_quest_id uuid,
  quality_metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  reviewed_at timestamp with time zone,
  published_at timestamp with time zone,
  CONSTRAINT ai_generated_quests_pkey PRIMARY KEY (id),
  CONSTRAINT ai_generated_quests_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id),
  CONSTRAINT ai_generated_quests_generation_job_id_fkey FOREIGN KEY (generation_job_id) REFERENCES public.ai_generation_jobs(id)
);
CREATE TABLE public.ai_generation_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying]::text[])),
  generated_count integer DEFAULT 0,
  approved_count integer DEFAULT 0,
  rejected_count integer DEFAULT 0,
  error_message text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT ai_generation_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT ai_generation_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.ai_generation_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  review_queue_id uuid,
  quest_id uuid,
  generation_source character varying NOT NULL CHECK (generation_source::text = ANY (ARRAY['manual'::character varying, 'batch'::character varying, 'student_idea'::character varying, 'badge_aligned'::character varying]::text[])),
  prompt_version character varying,
  model_name character varying,
  time_to_generate_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  quality_score numeric,
  approved boolean,
  rejection_reason text,
  completion_rate numeric,
  average_rating numeric,
  engagement_score numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_performance_update timestamp with time zone,
  CONSTRAINT ai_generation_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT ai_generation_metrics_review_queue_id_fkey FOREIGN KEY (review_queue_id) REFERENCES public.ai_quest_review_queue(id),
  CONSTRAINT ai_generation_metrics_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id)
);
CREATE TABLE public.ai_improvement_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  analysis_period_days integer NOT NULL,
  total_prompts integer NOT NULL,
  prompts_needing_optimization integer NOT NULL,
  avg_performance_score numeric NOT NULL,
  trend_direction character varying NOT NULL,
  quality_change numeric NOT NULL,
  best_prompt_version character varying,
  best_prompt_score numeric,
  worst_prompt_version character varying,
  worst_prompt_score numeric,
  recommendations_count integer NOT NULL DEFAULT 0,
  detailed_insights jsonb NOT NULL,
  updated_at timestamp with time zone,
  CONSTRAINT ai_improvement_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_prompt_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  description text,
  prompt_template text NOT NULL,
  skill_category character varying,
  difficulty_level character varying,
  is_active boolean DEFAULT true,
  performance_metrics jsonb DEFAULT '{}'::jsonb,
  usage_count integer DEFAULT 0,
  success_rate numeric,
  average_quality_score numeric,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ai_prompt_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_prompt_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version_name character varying NOT NULL UNIQUE,
  prompt_type character varying NOT NULL CHECK (prompt_type::text = ANY (ARRAY['quest_generation'::character varying, 'task_generation'::character varying, 'description_enhancement'::character varying, 'quality_validation'::character varying]::text[])),
  system_prompt text,
  user_prompt_template text NOT NULL,
  is_active boolean DEFAULT false,
  avg_quality_score numeric,
  approval_rate numeric,
  avg_completion_rate numeric,
  avg_student_rating numeric,
  total_generations integer DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  activated_at timestamp with time zone,
  deactivated_at timestamp with time zone,
  last_metrics_update timestamp with time zone,
  CONSTRAINT ai_prompt_versions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_prompt_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.ai_quest_review_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  generated_quest_id uuid,
  reviewer_id uuid,
  action character varying NOT NULL CHECK (action::text = ANY (ARRAY['approve'::character varying, 'reject'::character varying, 'modify'::character varying, 'request_changes'::character varying]::text[])),
  previous_data jsonb,
  updated_data jsonb,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ai_quest_review_history_pkey PRIMARY KEY (id),
  CONSTRAINT ai_quest_review_history_generated_quest_id_fkey FOREIGN KEY (generated_quest_id) REFERENCES public.ai_generated_quests(id),
  CONSTRAINT ai_quest_review_history_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id)
);
CREATE TABLE public.ai_quest_review_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quest_data jsonb NOT NULL,
  quality_score numeric CHECK (quality_score >= 0::numeric AND quality_score <= 10::numeric),
  ai_feedback jsonb,
  status character varying NOT NULL DEFAULT 'pending_review'::character varying CHECK (status::text = ANY (ARRAY['pending_review'::character varying, 'approved'::character varying, 'rejected'::character varying, 'edited'::character varying]::text[])),
  reviewer_id uuid,
  review_notes text,
  was_edited boolean DEFAULT false,
  created_quest_id uuid,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  generation_source character varying DEFAULT 'manual'::character varying CHECK (generation_source::text = ANY (ARRAY['manual'::character varying, 'batch'::character varying, 'student_idea'::character varying, 'badge_aligned'::character varying]::text[])),
  badge_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_quest_review_queue_pkey PRIMARY KEY (id),
  CONSTRAINT ai_quest_review_queue_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id),
  CONSTRAINT ai_quest_review_queue_created_quest_id_fkey FOREIGN KEY (created_quest_id) REFERENCES public.quests(id),
  CONSTRAINT ai_quest_review_queue_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id)
);
CREATE TABLE public.ai_seeds (
  id integer NOT NULL DEFAULT nextval('ai_seeds_id_seq'::regclass),
  prompt_name text NOT NULL DEFAULT 'primary_seed'::text UNIQUE,
  prompt_text text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_seeds_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_task_cache (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quest_id uuid NOT NULL,
  cache_key text NOT NULL,
  interests_hash text,
  generated_tasks jsonb NOT NULL,
  hit_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
  CONSTRAINT ai_task_cache_pkey PRIMARY KEY (id),
  CONSTRAINT ai_task_cache_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id)
);
CREATE TABLE public.badge_quests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  badge_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  is_required boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  ai_confidence integer,
  ai_reasoning text,
  CONSTRAINT badge_quests_pkey PRIMARY KEY (id),
  CONSTRAINT badge_quests_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id),
  CONSTRAINT badge_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id)
);
CREATE TABLE public.badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  identity_statement character varying NOT NULL,
  description text NOT NULL,
  pillar_primary character varying NOT NULL,
  pillar_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_quests integer NOT NULL DEFAULT 5,
  min_xp integer NOT NULL DEFAULT 1500,
  portfolio_requirement text,
  ai_generated boolean DEFAULT false,
  status character varying DEFAULT 'active'::character varying CHECK (status::text = ANY (ARRAY['active'::character varying, 'beta'::character varying, 'archived'::character varying]::text[])),
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT badges_pkey PRIMARY KEY (id)
);
CREATE TABLE public.credit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  task_id uuid NOT NULL,
  credit_type character varying NOT NULL,
  xp_amount integer NOT NULL,
  credits_earned numeric NOT NULL CHECK (credits_earned >= 0::numeric),
  date_earned timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  academic_year integer NOT NULL,
  CONSTRAINT credit_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT credit_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT credit_ledger_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id),
  CONSTRAINT credit_ledger_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.quest_tasks_archived(id)
);
CREATE TABLE public.diplomas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  issued_date timestamp without time zone DEFAULT now(),
  portfolio_slug text UNIQUE,
  is_public boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT diplomas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.evidence_document_blocks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  block_type text NOT NULL CHECK (block_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'link'::text, 'document'::text])),
  content jsonb NOT NULL,
  order_index integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT evidence_document_blocks_pkey PRIMARY KEY (id),
  CONSTRAINT evidence_document_blocks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.user_task_evidence_documents(id)
);
CREATE TABLE public.friendships (
  id integer NOT NULL DEFAULT nextval('friendships_id_seq'::regclass),
  requester_id uuid,
  addressee_id uuid,
  status USER-DEFINED DEFAULT 'pending'::friendship_status,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT friendships_pkey PRIMARY KEY (id)
);
CREATE TABLE public.leaderboards (
  id integer NOT NULL DEFAULT nextval('leaderboards_id_seq'::regclass),
  period_type character varying NOT NULL CHECK (period_type::text = ANY (ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'all_time'::character varying]::text[])),
  period_start date NOT NULL,
  skill_name character varying,
  user_id uuid NOT NULL,
  xp_earned integer NOT NULL DEFAULT 0,
  rank integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT leaderboards_pkey PRIMARY KEY (id),
  CONSTRAINT leaderboards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.learning_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_quest_id uuid NOT NULL,
  entry_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT learning_logs_pkey PRIMARY KEY (id),
  CONSTRAINT learning_logs_user_quest_id_fkey FOREIGN KEY (user_quest_id) REFERENCES public.user_quests(id)
);
CREATE TABLE public.learning_logs_backup (
  id uuid,
  user_quest_id integer,
  user_id uuid,
  log_entry text,
  media_url text,
  created_at timestamp with time zone
);
CREATE TABLE public.parent_child_relationships (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  parent_id uuid,
  child_id uuid,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  created_at timestamp with time zone DEFAULT now(),
  approved_at timestamp with time zone,
  CONSTRAINT parent_child_relationships_pkey PRIMARY KEY (id),
  CONSTRAINT parent_child_relationships_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.users(id),
  CONSTRAINT parent_child_relationships_child_id_fkey FOREIGN KEY (child_id) REFERENCES public.users(id)
);
CREATE TABLE public.parental_consent_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  child_email character varying NOT NULL,
  parent_email character varying NOT NULL,
  consent_token character varying NOT NULL,
  consent_sent_at timestamp with time zone DEFAULT now(),
  consent_verified_at timestamp with time zone,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT parental_consent_log_pkey PRIMARY KEY (id),
  CONSTRAINT parental_consent_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.pillar_subcategories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pillar character varying NOT NULL,
  subcategory character varying NOT NULL,
  description text,
  icon character varying,
  display_order integer,
  CONSTRAINT pillar_subcategories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.promo_signups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_name character varying NOT NULL,
  email character varying NOT NULL,
  teen_age integer NOT NULL CHECK (teen_age >= 13 AND teen_age <= 18),
  activity text,
  source character varying DEFAULT 'promo_landing_page'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT promo_signups_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quality_action_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type = ANY (ARRAY['quest'::text, 'badge'::text, 'task'::text])),
  content_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type = ANY (ARRAY['archive'::text, 'deactivate'::text, 'approve'::text, 'reject'::text, 'flag'::text])),
  reason text,
  automated boolean DEFAULT false,
  performed_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quality_action_logs_pkey PRIMARY KEY (id),
  CONSTRAINT quality_action_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id)
);
CREATE TABLE public.quest_collaborations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quest_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  status USER-DEFINED DEFAULT 'pending'::collaboration_status,
  message text,
  created_at timestamp with time zone DEFAULT now(),
  responded_at timestamp with time zone,
  CONSTRAINT quest_collaborations_pkey PRIMARY KEY (id),
  CONSTRAINT quest_collaborations_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id),
  CONSTRAINT quest_collaborations_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id),
  CONSTRAINT quest_collaborations_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.users(id)
);
CREATE TABLE public.quest_customizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quest_id uuid,
  user_id uuid,
  custom_tasks jsonb,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying]::text[])),
  admin_notes text,
  admin_id uuid,
  created_at timestamp without time zone DEFAULT now(),
  reviewed_at timestamp without time zone,
  CONSTRAINT quest_customizations_pkey PRIMARY KEY (id),
  CONSTRAINT quest_customizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT quest_customizations_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id)
);
CREATE TABLE public.quest_ideas (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending_expansion'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quest_ideas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quest_metadata (
  quest_id uuid NOT NULL,
  category character varying,
  difficulty_tier integer CHECK (difficulty_tier >= 1 AND difficulty_tier <= 5),
  location_type character varying CHECK (location_type::text = ANY (ARRAY['anywhere'::character varying, 'specific_location'::character varying, 'local_community'::character varying]::text[])),
  location_address text,
  location_coordinates point,
  location_radius_km double precision,
  venue_name character varying,
  estimated_hours character varying,
  materials_needed ARRAY,
  prerequisites ARRAY,
  tags ARRAY,
  seasonal_start date,
  seasonal_end date,
  is_featured boolean DEFAULT false,
  team_size_limit integer DEFAULT 5 CHECK (team_size_limit >= 1 AND team_size_limit <= 5),
  path_id uuid,
  unlocks_quests ARRAY,
  collaboration_prompts ARRAY,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT quest_metadata_pkey PRIMARY KEY (quest_id),
  CONSTRAINT fk_quest_metadata_path FOREIGN KEY (path_id) REFERENCES public.quest_paths(id)
);
CREATE TABLE public.quest_paths (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title character varying NOT NULL,
  description text,
  icon_url text,
  quest_order ARRAY,
  completion_badge_url text,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT quest_paths_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quest_personalization_sessions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  selected_approach text,
  selected_interests jsonb DEFAULT '[]'::jsonb,
  cross_curricular_subjects jsonb DEFAULT '[]'::jsonb,
  ai_generated_tasks jsonb,
  finalized_tasks jsonb,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quest_personalization_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT quest_personalization_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT quest_personalization_sessions_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id)
);
CREATE TABLE public.quest_ratings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quest_id uuid,
  user_id uuid,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quest_ratings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quest_reviews (
  id integer NOT NULL DEFAULT nextval('quest_reviews_id_seq'::regclass),
  quest_id uuid NOT NULL,
  user_quest_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  review_type character varying NOT NULL CHECK (review_type::text = ANY (ARRAY['peer'::character varying, 'instructor'::character varying, 'auto'::character varying]::text[])),
  score numeric,
  feedback text,
  rubric_scores jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quest_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT quest_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id)
);
CREATE TABLE public.quest_sources (
  id text NOT NULL,
  name text NOT NULL,
  header_image_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quest_sources_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quest_submissions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  suggested_tasks jsonb DEFAULT '[]'::jsonb,
  make_public boolean DEFAULT false,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  approved_quest_id uuid,
  admin_feedback text,
  submitted_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  CONSTRAINT quest_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT quest_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT quest_submissions_approved_quest_id_fkey FOREIGN KEY (approved_quest_id) REFERENCES public.quests(id)
);
CREATE TABLE public.quest_task_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  task_id uuid NOT NULL,
  evidence_url text,
  evidence_text text,
  completed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_quest_task_id uuid,
  CONSTRAINT quest_task_completions_pkey PRIMARY KEY (id),
  CONSTRAINT quest_task_completions_user_quest_task_id_fkey FOREIGN KEY (user_quest_task_id) REFERENCES public.user_quest_tasks(id),
  CONSTRAINT quest_task_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.quest_tasks_archived (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quest_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  evidence_prompt text,
  materials_needed jsonb DEFAULT '[]'::jsonb,
  pillar USER-DEFINED NOT NULL,
  xp_amount integer NOT NULL CHECK (xp_amount > 0),
  order_index integer DEFAULT 0,
  is_required boolean DEFAULT true,
  is_collaboration_eligible boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  school_subjects ARRAY DEFAULT '{}'::school_subject[],
  subject_xp_distribution jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT quest_tasks_archived_pkey PRIMARY KEY (id),
  CONSTRAINT quest_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id)
);
CREATE TABLE public.quest_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  goal_statement text NOT NULL,
  applicable_badges ARRAY DEFAULT '{}'::uuid[],
  complexity_level character varying DEFAULT 'intermediate'::character varying CHECK (complexity_level::text = ANY (ARRAY['beginner'::character varying, 'intermediate'::character varying, 'advanced'::character varying]::text[])),
  estimated_xp integer NOT NULL,
  estimated_hours numeric,
  credit_mappings jsonb DEFAULT '{}'::jsonb,
  resources ARRAY DEFAULT '{}'::jsonb[],
  ai_generated boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  success_rate numeric DEFAULT 0.00 CHECK (success_rate >= 0::numeric AND success_rate <= 1::numeric),
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT quest_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.quests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  big_idea text,
  source character varying DEFAULT 'custom'::quest_source,
  header_image_url text,
  is_v3 boolean DEFAULT true,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  material_link text,
  applicable_badges jsonb DEFAULT '[]'::jsonb,
  archived_at timestamp with time zone,
  archive_reason text,
  deactivated_at timestamp with time zone,
  deactivation_reason text,
  requires_review boolean DEFAULT false,
  CONSTRAINT quests_pkey PRIMARY KEY (id),
  CONSTRAINT quests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.role_change_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  changed_by uuid,
  old_role text,
  new_role text,
  reason text,
  changed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT role_change_log_pkey PRIMARY KEY (id),
  CONSTRAINT role_change_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT role_change_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id)
);
CREATE TABLE public.scheduled_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  job_data jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])),
  priority integer DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  scheduled_for timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  result_data jsonb,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT scheduled_jobs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.security_warnings_documentation (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warning_type character varying NOT NULL,
  description text NOT NULL,
  required_action text NOT NULL,
  responsible_party character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT security_warnings_documentation_pkey PRIMARY KEY (id)
);
CREATE TABLE public.site_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  logo_url text,
  favicon_url text,
  site_name character varying DEFAULT 'Optio'::character varying,
  site_description text,
  meta_keywords text,
  footer_text text,
  primary_color character varying,
  secondary_color character varying,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT site_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.submissions (
  id uuid,
  educator_id uuid,
  feedback text,
  submitted_at timestamp with time zone,
  ai_validation_score numeric,
  ai_validation_summary text,
  status text,
  user_quest_id uuid
);
CREATE TABLE public.subscription_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_subscription_id text,
  tier text NOT NULL CHECK (tier = ANY (ARRAY['free'::text, 'supported'::text, 'academy'::text])),
  status text NOT NULL,
  stripe_event_id text NOT NULL,
  event_type text NOT NULL,
  ended_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscription_history_pkey PRIMARY KEY (id),
  CONSTRAINT subscription_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.task_collaborations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  task_id uuid NOT NULL,
  student_1_id uuid NOT NULL,
  student_2_id uuid NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'completed'::text])),
  double_xp_awarded boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT task_collaborations_pkey PRIMARY KEY (id),
  CONSTRAINT task_collaborations_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.user_quest_tasks(id),
  CONSTRAINT task_collaborations_student_1_id_fkey FOREIGN KEY (student_1_id) REFERENCES public.users(id),
  CONSTRAINT task_collaborations_student_2_id_fkey FOREIGN KEY (student_2_id) REFERENCES public.users(id)
);
CREATE TABLE public.tutor_analytics (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  messages_sent integer DEFAULT 0,
  topics_discussed ARRAY,
  learning_pillars_covered ARRAY,
  average_session_length integer,
  xp_bonuses_earned integer DEFAULT 0,
  safety_flags integer DEFAULT 0,
  engagement_score numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tutor_analytics_pkey PRIMARY KEY (id),
  CONSTRAINT tutor_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tutor_conversations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  title character varying,
  conversation_mode USER-DEFINED DEFAULT 'study_buddy'::conversation_mode,
  quest_id uuid,
  task_id uuid,
  is_active boolean DEFAULT true,
  message_count integer DEFAULT 0,
  total_tokens integer DEFAULT 0,
  last_message_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tutor_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT tutor_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT tutor_conversations_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id),
  CONSTRAINT tutor_conversations_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.quest_tasks_archived(id)
);
CREATE TABLE public.tutor_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  content text NOT NULL,
  tokens_used integer DEFAULT 0,
  safety_level USER-DEFINED DEFAULT 'safe'::safety_level,
  safety_reasons ARRAY,
  flagged_terms ARRAY,
  context_data jsonb,
  xp_bonus_awarded boolean DEFAULT false,
  parent_notified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tutor_messages_pkey PRIMARY KEY (id),
  CONSTRAINT tutor_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.tutor_conversations(id)
);
CREATE TABLE public.tutor_parent_access (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  parent_user_id uuid NOT NULL,
  child_user_id uuid NOT NULL,
  access_level character varying DEFAULT 'full'::character varying,
  notification_frequency character varying DEFAULT 'daily'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tutor_parent_access_pkey PRIMARY KEY (id),
  CONSTRAINT tutor_parent_access_parent_user_id_fkey FOREIGN KEY (parent_user_id) REFERENCES auth.users(id),
  CONSTRAINT tutor_parent_access_child_user_id_fkey FOREIGN KEY (child_user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tutor_safety_reports (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  conversation_id uuid,
  message_id uuid,
  incident_type character varying NOT NULL,
  safety_level USER-DEFINED NOT NULL,
  original_message text NOT NULL,
  flagged_terms ARRAY,
  safety_reasons ARRAY,
  confidence_score numeric,
  admin_reviewed boolean DEFAULT false,
  admin_notes text,
  parent_notified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  CONSTRAINT tutor_safety_reports_pkey PRIMARY KEY (id),
  CONSTRAINT tutor_safety_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT tutor_safety_reports_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.tutor_conversations(id),
  CONSTRAINT tutor_safety_reports_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.tutor_messages(id)
);
CREATE TABLE public.tutor_settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE,
  preferred_mode USER-DEFINED DEFAULT 'study_buddy'::conversation_mode,
  daily_message_limit integer DEFAULT 50,
  messages_used_today integer DEFAULT 0,
  last_reset_date date DEFAULT CURRENT_DATE,
  parent_monitoring_enabled boolean DEFAULT true,
  notification_preferences jsonb DEFAULT '{}'::jsonb,
  age_verification integer,
  learning_style character varying,
  topic_restrictions ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tutor_settings_pkey PRIMARY KEY (id),
  CONSTRAINT tutor_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.tutor_tier_limits (
  tier character varying NOT NULL,
  daily_message_limit integer NOT NULL,
  features ARRAY DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tutor_tier_limits_pkey PRIMARY KEY (tier)
);
CREATE TABLE public.user_achievements (
  id integer NOT NULL DEFAULT nextval('user_achievements_id_seq'::regclass),
  user_id uuid NOT NULL,
  achievement_type character varying NOT NULL,
  achievement_name character varying NOT NULL,
  achievement_data jsonb DEFAULT '{}'::jsonb,
  earned_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_achievements_pkey PRIMARY KEY (id),
  CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_badges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  badge_type character varying NOT NULL,
  badge_name character varying,
  badge_description text,
  badge_icon_url text,
  badge_data jsonb,
  earned_at timestamp without time zone DEFAULT now(),
  badge_id uuid,
  is_active boolean DEFAULT false,
  progress_percentage integer DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  quests_completed integer DEFAULT 0,
  xp_earned integer DEFAULT 0,
  CONSTRAINT user_badges_pkey PRIMARY KEY (id),
  CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id)
);
CREATE TABLE public.user_mastery (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE,
  total_xp integer NOT NULL DEFAULT 0,
  mastery_level integer NOT NULL DEFAULT 1,
  last_updated timestamp with time zone DEFAULT now(),
  CONSTRAINT user_mastery_pkey PRIMARY KEY (id),
  CONSTRAINT user_mastery_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_quest_tasks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  user_quest_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  pillar text NOT NULL,
  xp_value integer DEFAULT 100,
  order_index integer DEFAULT 0,
  is_required boolean DEFAULT true,
  is_manual boolean DEFAULT false,
  approval_status text DEFAULT 'approved'::text CHECK (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  diploma_subjects jsonb DEFAULT '["Electives"]'::jsonb,
  subject_xp_distribution jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT user_quest_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT user_quest_tasks_user_id_fkey1 FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_quest_tasks_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id),
  CONSTRAINT user_quest_tasks_user_quest_id_fkey1 FOREIGN KEY (user_quest_id) REFERENCES public.user_quests(id)
);
CREATE TABLE public.user_quest_tasks_legacy_archived (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  quest_task_id uuid NOT NULL,
  user_quest_id uuid NOT NULL,
  evidence_type USER-DEFINED NOT NULL,
  evidence_content text NOT NULL,
  xp_awarded integer NOT NULL CHECK (xp_awarded > 0),
  completed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_quest_tasks_legacy_archived_pkey PRIMARY KEY (id),
  CONSTRAINT user_quest_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_quest_tasks_quest_task_id_fkey FOREIGN KEY (quest_task_id) REFERENCES public.quest_tasks_archived(id),
  CONSTRAINT user_quest_tasks_user_quest_id_fkey FOREIGN KEY (user_quest_id) REFERENCES public.user_quests(id)
);
CREATE TABLE public.user_quests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  personalization_completed boolean DEFAULT false,
  personalization_session_id uuid,
  CONSTRAINT user_quests_pkey PRIMARY KEY (id),
  CONSTRAINT user_quests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_quests_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id),
  CONSTRAINT user_quests_personalization_session_id_fkey FOREIGN KEY (personalization_session_id) REFERENCES public.quest_personalization_sessions(id)
);
CREATE TABLE public.user_skill_details (
  id integer NOT NULL DEFAULT nextval('user_skill_details_id_seq'::regclass),
  user_id uuid,
  skill_name text NOT NULL,
  times_practiced integer DEFAULT 0,
  last_practiced timestamp without time zone,
  CONSTRAINT user_skill_details_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_skill_xp (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  pillar USER-DEFINED NOT NULL,
  xp_amount integer NOT NULL DEFAULT 0 CHECK (xp_amount >= 0),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_skill_xp_pkey PRIMARY KEY (id),
  CONSTRAINT user_skill_xp_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_subject_xp (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  school_subject USER-DEFINED NOT NULL,
  xp_amount integer NOT NULL DEFAULT 0 CHECK (xp_amount >= 0),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_subject_xp_pkey PRIMARY KEY (id),
  CONSTRAINT user_subject_xp_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_task_evidence_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quest_id uuid NOT NULL,
  task_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'completed'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT user_task_evidence_documents_pkey PRIMARY KEY (id),
  CONSTRAINT user_task_evidence_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_task_evidence_documents_quest_id_fkey FOREIGN KEY (quest_id) REFERENCES public.quests(id),
  CONSTRAINT user_task_evidence_documents_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.quest_tasks_archived(id)
);
CREATE TABLE public.user_xp (
  id integer NOT NULL DEFAULT nextval('user_xp_id_seq'::regclass),
  user_id uuid,
  subject text NOT NULL,
  total_xp integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_xp_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  first_name character varying,
  last_name character varying,
  display_name character varying,
  email character varying,
  role character varying DEFAULT 'student'::character varying CHECK (role::text = ANY (ARRAY['student'::character varying, 'educator'::character varying, 'admin'::character varying]::text[])),
  level integer DEFAULT 1,
  streak_days integer DEFAULT 0,
  last_active timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  preferences jsonb DEFAULT '{}'::jsonb,
  badges jsonb DEFAULT '[]'::jsonb,
  bio text,
  avatar_url text,
  portfolio_slug character varying UNIQUE,
  subscription_tier character varying DEFAULT 'free'::character varying CHECK (subscription_tier::text = ANY (ARRAY['free'::character varying, 'explorer'::character varying, 'supported'::character varying, 'creator'::character varying, 'premium'::character varying, 'academy'::character varying, 'visionary'::character varying, 'enterprise'::character varying]::text[])),
  subscription_status character varying DEFAULT 'inactive'::character varying,
  subscription_end_date timestamp with time zone,
  total_xp integer DEFAULT 0,
  achievements_count integer DEFAULT 0,
  tos_accepted_at timestamp with time zone,
  privacy_policy_accepted_at timestamp with time zone,
  tos_version character varying DEFAULT '1.0'::character varying,
  privacy_policy_version character varying DEFAULT '1.0'::character varying,
  stripe_customer_id text,
  stripe_subscription_id text,
  date_of_birth date,
  requires_parental_consent boolean DEFAULT false,
  parental_consent_email character varying,
  parental_consent_verified boolean DEFAULT false,
  parental_consent_verified_at timestamp with time zone,
  parental_consent_token character varying UNIQUE,
  deletion_requested_at timestamp with time zone,
  deletion_status character varying DEFAULT 'none'::character varying CHECK (deletion_status::text = ANY (ARRAY['none'::character varying, 'pending'::character varying, 'completed'::character varying]::text[])),
  deletion_scheduled_for timestamp with time zone,
  marketing_emails_enabled boolean DEFAULT true,
  product_updates_enabled boolean DEFAULT true,
  educational_content_enabled boolean DEFAULT true,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_auth_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);