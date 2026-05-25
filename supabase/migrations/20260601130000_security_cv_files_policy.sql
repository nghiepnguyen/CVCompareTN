-- Security: restrict cv-files SELECT to each user's own folder ({user_id}/filename).

DROP POLICY IF EXISTS "cv_files_select_public_bucket" ON storage.objects;

CREATE POLICY "User reads own cv files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'cv-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
