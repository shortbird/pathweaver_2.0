-- A hold keeps the pictures too.
--
-- peer_text_holds stored the text of a refused message and nothing else, so a
-- parent reading "Sam wrote a message that our safety check held" saw the
-- words and not the photo that may have been the reason. The composer uploads
-- attachments before the send, so the objects exist whether or not the message
-- posted; the hold now carries the same [{url, type, name, size}] rows the
-- message would have, and the parent view signs them on read like any thread.
ALTER TABLE public.peer_text_holds
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
