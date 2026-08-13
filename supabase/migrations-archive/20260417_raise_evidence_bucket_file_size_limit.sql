-- Raise per-bucket file_size_limit on storage buckets used for evidence/moment
-- uploads. This lets the new signed-upload (direct-to-Supabase) flow accept
-- videos up to 500MB without changing backend memory pressure — legacy
-- multipart-through-backend uploads are still bounded server-side by
-- MAX_CONTENT_LENGTH (50MB) via Flask/Werkzeug.
--
-- Must stay in sync with backend/config/constants.py::MAX_VIDEO_SIZE_SIGNED.

UPDATE storage.buckets
SET file_size_limit = 524288000  -- 500 * 1024 * 1024
WHERE name IN ('quest-evidence', 'user-uploads');
