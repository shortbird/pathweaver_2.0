-- Files, links and videos attached to a quest and to its individual tasks.
--
-- There has been nowhere to put them. A quest carries `material_link` -- ONE
-- free-text URL, rendered as a single anchor -- and a task carries nothing at
-- all. So a teacher with a worksheet for step 3 and a demo video for step 5 had
-- two bad options: paste both links into the task description, or put them on
-- the class as materials, where they sit in one undifferentiated list with no
-- way to say which task they are for.
--
-- task_id NULL means the resource belongs to the quest as a whole (the intro),
-- which is what material_link was doing badly.
--
-- Deliberately NOT here: an embed_html column. Storing markup a school pastes in
-- and rendering it back is a stored-XSS hole in a page students open. Video is a
-- URL, matched against the providers videoUtils knows, and anything else renders
-- as a link.

CREATE TABLE IF NOT EXISTS public.quest_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  -- NULL = the quest itself. Cascades: a task that is genuinely deleted takes
  -- its own attachments with it, which is why the training editor had to stop
  -- delete-and-reinserting the whole list on every save first
  -- (sis_quest_authoring.replace_template_tasks).
  task_id uuid REFERENCES public.quest_template_tasks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('link', 'file', 'video')),
  title text NOT NULL,
  -- For a file: the canonical org-documents pointer, signed on every read.
  -- For a link or video: the URL itself, http(s) only (enforced in the service).
  url text NOT NULL,
  file_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The one read this table has: everything for a quest, grouped by task, in order.
CREATE INDEX IF NOT EXISTS idx_quest_resources_quest
  ON public.quest_resources (quest_id, task_id, sort_order);

-- RLS on with NO policies: deny-all to anon and authenticated. Every read and
-- write goes through the service role behind the Python gate, the same pattern
-- as class_materials and sis_form_templates. A student reads these through the
-- quest detail route, which has already decided they may see the quest.
ALTER TABLE public.quest_resources ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.quest_resources IS
  'Files, links and videos attached to a quest (task_id NULL) or to one of its template tasks. Replaces the single quests.material_link for new content; that column is still read for existing quests.';
COMMENT ON COLUMN public.quest_resources.task_id IS
  'The template task this is for, or NULL for the quest as a whole. A student''s copy joins through user_quest_tasks.source_template_task_id.';
