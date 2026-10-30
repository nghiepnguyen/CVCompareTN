-- cv-files must be private: files are read via /api/storage (JWT + owner check),
-- never through /object/public/ URLs. The core schema seed originally created it
-- with public = true; this pins it for any environment that ran that seed.
UPDATE storage.buckets SET public = false WHERE id = 'cv-files';
