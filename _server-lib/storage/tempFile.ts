import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';

const BUCKET = 'cv-analyze-tmp';

// The path's first segment is the uploader's uid (see uploadTempAnalysisFile
// in src/services/cvService.ts). Storage RLS only restricts INSERT/DELETE to
// the owner's folder — reads here go through the service-role client, which
// bypasses RLS entirely, so this check is the only thing stopping one user
// from passing another user's path and having the server read it for them.
function assertOwnedStoragePath(path: string, userId: string): void {
  if (path.split('/')[0] !== userId) {
    throw new Error('Storage path does not belong to the authenticated user');
  }
}

export async function resolveStorageRef(path: string, userId: string): Promise<string> {
  assertOwnedStoragePath(path, userId);
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(path);
  if (error) throw new Error(`Failed to load uploaded file: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.toString('base64');
}
