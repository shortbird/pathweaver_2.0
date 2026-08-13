-- Per-class discussion boards (2026-07-24). MVP: threaded discussion for a single
-- SIS class (org_classes row) — top-level posts + one level of replies. Participants
-- are the class's teacher(s) and its enrolled students (plus org_admin/superadmin);
-- the Flask backend enforces that participant gate in Python.
--
-- Additive and org-generic. RLS-locked to the backend (no policies: the service
-- role is the only reader/writer), same convention as the other sis_* tables. Data
-- API grants are inherited via the 20260527 default-privileges migration, so no
-- per-table GRANTs are needed here.

CREATE TABLE IF NOT EXISTS public.class_discussion_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The owning SIS class. class_id == org_classes.id (NOT a quests.id).
  class_id uuid NOT NULL REFERENCES public.org_classes(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- null = top-level post; otherwise a reply to another post in the same class.
  parent_post_id uuid REFERENCES public.class_discussion_posts(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Soft delete: set instead of removing the row so a deleted parent can still
  -- render as a "[deleted]" tombstone when it has surviving replies.
  deleted_at timestamptz
);

-- Board read: all posts for a class, in time order.
CREATE INDEX IF NOT EXISTS idx_class_discussion_posts_class_created
  ON public.class_discussion_posts (class_id, created_at);

-- Reply lookup: children of a given post.
CREATE INDEX IF NOT EXISTS idx_class_discussion_posts_parent
  ON public.class_discussion_posts (parent_post_id);

ALTER TABLE public.class_discussion_posts ENABLE ROW LEVEL SECURITY;
