-- Secure documents get a title of their own, separate from the uploaded
-- filename (iCreate, 2026-08-11: "Can we have a way for teachers to NAME the
-- file and also a way for us to rename them file? It's easier if they name it
-- something in the standardized manner first, but if they [don't], then we
-- can.").
--
-- `filename` stays exactly as it was: the untouched name of the blob the
-- browser sent, kept as provenance. `title` is what the office reads and can
-- edit. The storage path is a random uuid and never contained the filename
-- (routes/sis/secure_documents.py), so a rename is a metadata update — no
-- object move, no new signed URL.

alter table public.sis_secure_documents
  add column if not exists title text;

-- Everything already filed keeps reading the way it does today: the list has
-- always shown `filename`, so that is what those documents are called.
update public.sis_secure_documents
   set title = filename
 where title is null;
