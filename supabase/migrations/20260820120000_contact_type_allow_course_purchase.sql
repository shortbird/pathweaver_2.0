-- Allow 'course_purchase' in contact_submissions.contact_type.
--
-- routes/contact.py has accepted type='course_purchase' since the catalog
-- interest-capture shipped (commit d0144714), but this CHECK was never widened,
-- so every /catalog and /course/:slug interest submission failed the insert and
-- the visitor saw "Something went wrong" — the lead was lost. Widening a CHECK
-- is metadata-only: no table rewrite, existing rows unaffected.

ALTER TABLE public.contact_submissions
  DROP CONSTRAINT contact_submissions_contact_type_check;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_contact_type_check
  CHECK (contact_type = ANY (ARRAY[
    'demo'::text,
    'sales'::text,
    'general'::text,
    'families'::text,
    'philosophy'::text,
    'academy'::text,
    'claim_free_class'::text,
    'course_purchase'::text
  ]));
