-- cv-files: accept text/plain. The Recruiter campaign CV input and the saved-CV
-- flow both advertise .txt, and the browser uploads it with contentType
-- text/plain, but the bucket allowlist (20260516120000) never included it, so
-- Storage rejected every .txt upload ("mime type text/plain is not supported").
-- Downstream already handles text: processFile reads it with file.text().
--
-- Append-only and idempotent: keeps public/file_size_limit/policies and every
-- existing MIME type. A NULL allowlist already accepts everything, so skip it.

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'text/plain')
WHERE id = 'cv-files'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('text/plain' = ANY (allowed_mime_types));
