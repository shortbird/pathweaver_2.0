-- A family photo across the top of the family dashboard.
--
-- The family dashboard (/family, 2026-09-15) is the parent's home. It had
-- the children's pictures and no picture of the family. The photo belongs
-- to the parent's account: a platform family has no row of its own -- the
-- children hang off the parent through managed_by_parent_id, an approved
-- parent_student_links row, or a household -- so the parent's users row is
-- the one place every parent has. A co-parent sets their own. A household
-- image (households.image_url) is the SIS family directory's and stays
-- separate: it is what a school shows other families, this is what the
-- family shows itself.
--
-- The value is the canonical private-bucket pointer (user-uploads), the
-- same shape as users.avatar_url; the API signs it on read.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS family_cover_url text;

COMMENT ON COLUMN public.users.family_cover_url IS
    'Family photo across the top of the parent''s family dashboard. Private-bucket pointer (user-uploads), signed on read, like avatar_url. NULL = none set.';
