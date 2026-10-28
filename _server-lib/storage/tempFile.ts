import { assertOwnedKey, parseTempReference } from './validation.js';
import { readTempUpload } from './handler.js';
import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { ControlledError, createDeadline, STORAGE_REF_TIMEOUT_MS, type Deadline } from '../deadline.js';

const BUCKET = 'cv-analyze-tmp';

// Resolves one storage reference within min(STORAGE_REF_TIMEOUT_MS, parent):
// the DB lookup, R2 HEAD + GET + body (or the Supabase download) all share
// one abort signal, so a hung request is cancelled, not left running.
// Throws ControlledError('storage_timeout') when that deadline cut it off.
export async function resolveStorageRef(
  path: string,
  userId: string,
  parent: Deadline = createDeadline(STORAGE_REF_TIMEOUT_MS)
): Promise<string> {
  const signal = parent.child(STORAGE_REF_TIMEOUT_MS).signal();
  try {
    const uploadId = parseTempReference(path);
    if (uploadId) return await readTempUpload(uploadId, userId, signal);
    assertOwnedKey(path, userId);
    const { data, error } = await getSupabaseAdmin().storage.from(BUCKET).download(path, {}, { signal });
    if (error) throw new Error(`Failed to load uploaded file: ${error.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    return buffer.toString('base64');
  } catch (err) {
    if (signal.aborted) throw new ControlledError('storage_timeout');
    throw err;
  }
}
