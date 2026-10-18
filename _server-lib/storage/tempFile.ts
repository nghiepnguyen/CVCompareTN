import { assertOwnedKey, parseTempReference } from './validation.js';
import { readTempUpload } from './handler.js';
import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';

const BUCKET = 'cv-analyze-tmp';

export async function resolveStorageRef(path: string, userId: string): Promise<string> {
  const uploadId = parseTempReference(path);
  if (uploadId) return readTempUpload(uploadId, userId);
  assertOwnedKey(path, userId);
  const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(path);
  if (error) throw new Error(`Failed to load uploaded file: ${error.message}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer.toString('base64');
}
