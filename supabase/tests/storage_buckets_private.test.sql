-- Run against a disposable database after all migrations.
DO $$
BEGIN
 ASSERT NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id IN ('cv-files','cv-analyze-tmp') AND public), 'a CV bucket is public';
END $$;
