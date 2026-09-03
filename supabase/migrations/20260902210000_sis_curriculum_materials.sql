-- Curriculum resources: the things a teacher saves on a curriculum, each with
-- the option to show it to the students of every class that teaches it.
--
-- iCreate/Horizon, 2026-09-02: "teachers want to be able to deliver documents to
-- students via the classes. it makes most sense to be able to do this through
-- curriculum" and "youtube links, documents, all the same. it's things that are
-- saved in curriculum that teachers have the option to have appear in the
-- student class view so they can access some kind of resource."
--
-- A link and an uploaded file are one kind of thing here, told apart only by
-- `kind`, because to a student they are both just something to open.
--
-- Why on the curriculum rather than the class: class_materials already delivers
-- to students, but it hangs off ONE section, so the same handout is re-uploaded
-- onto each section and again next year. A curriculum outlives the timetable and
-- already backs several sections at once -- that reuse is the whole ask.
--
-- Same column shape as class_materials on purpose (kind/title/url/file_path, the
-- org-documents bucket, the canonical-pointer-plus-signed-read rule), so the two
-- merge into one student-facing list without translation.
--
-- visible_to_students is the toggle. It defaults to FALSE because a curriculum
-- has always been the staff-only working area -- answer keys, teacher's guides,
-- planning notes live there, and a default of true would publish all of them the
-- moment this shipped. New rows added through the UI send it explicitly (the add
-- form checks the box by default), so the safe default costs a deliberate adder
-- nothing and protects everything already treated as private.
--
-- This does NOT make sis_curriculum itself student-visible. Its notes and its
-- drive_url stay staff-only: a teacher's working Drive folder is not a handout.
-- (On 2026-09-02 a Horizon teacher had put a YouTube link in Horizon's "Test"
-- curriculum drive_url expecting students to see it -- that link belongs here,
-- as a resource with the box ticked.)

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

-- Re-runnable: the column is added here too, so an environment that already got
-- the CREATE TABLE above from an earlier version of this file still gains it.
ALTER TABLE public.sis_curriculum_materials
  ADD COLUMN IF NOT EXISTS visible_to_students boolean DEFAULT false NOT NULL;

ALTER TABLE public.sis_curriculum_materials
  DROP CONSTRAINT IF EXISTS sis_curriculum_materials_pkey;
ALTER TABLE public.sis_curriculum_materials
  ADD CONSTRAINT sis_curriculum_materials_pkey PRIMARY KEY (id);

ALTER TABLE public.sis_curriculum_materials
  DROP CONSTRAINT IF EXISTS sis_curriculum_materials_kind_check;
ALTER TABLE public.sis_curriculum_materials
  ADD CONSTRAINT sis_curriculum_materials_kind_check
  CHECK ((kind = ANY (ARRAY['file'::text, 'link'::text])));

ALTER TABLE public.sis_curriculum_materials
  DROP CONSTRAINT IF EXISTS sis_curriculum_materials_curriculum_id_fkey;
ALTER TABLE public.sis_curriculum_materials
  ADD CONSTRAINT sis_curriculum_materials_curriculum_id_fkey
  FOREIGN KEY (curriculum_id) REFERENCES sis_curriculum(id) ON DELETE CASCADE;

ALTER TABLE public.sis_curriculum_materials
  DROP CONSTRAINT IF EXISTS sis_curriculum_materials_organization_id_fkey;
ALTER TABLE public.sis_curriculum_materials
  ADD CONSTRAINT sis_curriculum_materials_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- A deleted author must not take the handout with them: the material belongs to
-- the school's curriculum, not to whoever happened to upload it.
ALTER TABLE public.sis_curriculum_materials
  DROP CONSTRAINT IF EXISTS sis_curriculum_materials_created_by_fkey;
ALTER TABLE public.sis_curriculum_materials
  ADD CONSTRAINT sis_curriculum_materials_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- The read is always "this curriculum's resources, newest first", and the
-- student-facing read fans out over several curricula at once.
CREATE INDEX IF NOT EXISTS idx_sis_curriculum_materials_curriculum
  ON public.sis_curriculum_materials USING btree (curriculum_id, created_at DESC);

-- Deny-all, like class_materials and the rest of the SIS tables: every read and
-- write goes through the Flask routes, which run the participant gate in Python.
ALTER TABLE public.sis_curriculum_materials ENABLE ROW LEVEL SECURITY;
