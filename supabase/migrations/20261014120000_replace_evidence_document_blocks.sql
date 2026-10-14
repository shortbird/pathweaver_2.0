-- ============================================================================
-- replace_evidence_document_blocks: swap a document's blocks in ONE transaction.
-- ============================================================================
-- Ticket a9d3cedb (Nicole Bunting, parent of Brock): "anytime he tries to
-- submit something on an assignment, it shows as being there, but when you
-- leave and then click back in, the submission is gone."
--
-- The save route (backend/routes/evidence_documents.py, update_document_blocks)
-- deleted every block of the document and then re-inserted the new list as two
-- separate PostgREST requests. When the insert failed, the delete had already
-- committed: the student got a 500 AND lost every block saved before. Brock's
-- document for "Scavenger Hunt" sat at 0 blocks with four files in storage.
--
-- A plpgsql function body runs inside the caller's single statement, so the
-- DELETE and the INSERT below commit together or not at all. If any row fails
-- (block_type CHECK, bad enum, NOT NULL), the error aborts the whole call and
-- the old blocks are still there. This is the atomicity the route relies on;
-- the backend unit tests can only check that it sends one rpc and no separate
-- delete.
--
-- p_blocks is a jsonb array, already in final order, of objects with:
--   block_type          text    (required)
--   content             jsonb   (required)
--   is_private          boolean (default false)
--   uploaded_by_user_id uuid    (nullable)
--   uploaded_by_role    text    (evidence_uploader_role; default 'student')
-- order_index is the array position (0-based), so the unique
-- (document_id, order_index) key cannot collide with the rows being replaced.
--
-- SECURITY INVOKER: the route calls this with the admin (service-role) client,
-- exactly as it ran the DELETE and INSERT before, so nothing gains access it
-- did not already have. Execute is granted to service_role only; RLS still
-- applies to any other caller that is ever granted it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.replace_evidence_document_blocks(
  p_document_id uuid,
  p_blocks jsonb
)
 RETURNS TABLE (id uuid, order_index integer)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
    RAISE EXCEPTION 'p_blocks must be a jsonb array' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.evidence_document_blocks b
   WHERE b.document_id = p_document_id;

  RETURN QUERY
  INSERT INTO public.evidence_document_blocks AS b (
    document_id, block_type, content, order_index, is_private,
    uploaded_by_user_id, uploaded_by_role
  )
  SELECT
    p_document_id,
    e.value->>'block_type',
    COALESCE(e.value->'content', '{}'::jsonb),
    (e.ordinality - 1)::integer,
    COALESCE((e.value->>'is_private')::boolean, false),
    NULLIF(e.value->>'uploaded_by_user_id', '')::uuid,
    COALESCE(NULLIF(e.value->>'uploaded_by_role', ''), 'student')::public.evidence_uploader_role
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS e(value, ordinality)
  ORDER BY e.ordinality
  RETURNING b.id, b.order_index;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_evidence_document_blocks(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_evidence_document_blocks(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.replace_evidence_document_blocks(uuid, jsonb) IS
  'Replaces every block of one evidence document in a single transaction; a '
  'failed insert keeps the old blocks (ticket a9d3cedb, 2026-10-14).';

NOTIFY pgrst, 'reload schema';
