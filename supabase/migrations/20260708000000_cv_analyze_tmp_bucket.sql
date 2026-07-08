-- Temp bucket for large CV files during analysis (removes the 4.5MB Vercel
-- body limit — client uploads raw file here, server downloads it via
-- service-role key, then removes it after processing). Distinct from
-- `cv-files` (permanent saved-CV storage) to keep quota and cleanup separate.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cv-analyze-tmp',
  'cv-analyze-tmp',
  false,
  15728640, -- 15MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "User uploads own temp analyze file"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cv-analyze-tmp'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "User deletes own temp analyze file"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'cv-analyze-tmp'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
