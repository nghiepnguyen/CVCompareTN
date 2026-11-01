-- Run against a disposable database after all migrations.
DO $$
DECLARE b storage.buckets;
BEGIN
 SELECT * INTO b FROM storage.buckets WHERE id = 'cv-files';
 ASSERT 'text/plain' = ANY (b.allowed_mime_types), 'cv-files rejects text/plain';
 ASSERT b.allowed_mime_types @> ARRAY[
   'application/pdf',
   'application/msword',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'image/jpeg', 'image/png', 'image/webp'
 ], 'cv-files lost an existing MIME type';
 ASSERT cardinality(b.allowed_mime_types) = 7, 'cv-files allowlist has unexpected entries';
 ASSERT NOT b.public, 'cv-files is public';
 ASSERT b.file_size_limit = 52428800, 'cv-files size limit changed';
 -- cv-analyze-tmp is untouched: main analyze reads .txt client-side.
 ASSERT NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'cv-analyze-tmp' AND 'text/plain' = ANY (allowed_mime_types)), 'cv-analyze-tmp changed';
END $$;

-- Re-applying the migration must not duplicate the entry.
\i /repo/migrations/20261102110000_cv_files_allow_text_plain.sql
DO $$
BEGIN
 ASSERT (SELECT cardinality(array_positions(allowed_mime_types, 'text/plain')) FROM storage.buckets WHERE id = 'cv-files') = 1, 'text/plain duplicated';
END $$;
