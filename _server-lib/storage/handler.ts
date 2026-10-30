import { checkAccountAccess } from '../accountLock.js';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin, getUserFromBearerToken } from '../payment/supabaseAdmin.js';
import { copyObject, readObject, removeObject, signDownload, signUpload, type BucketKind } from './r2.js';
import { assertOwnedKey, parseTempReference, StorageError, UUID, validateContent, validateUpload } from './validation.js';

export interface UploadRow {
  id: string; user_id: string; purpose: 'temp' | 'saved' | 'candidate'; campaign_id: string | null;
  staging_key: string; final_key: string | null; file_name: string; mime_type: string; file_size: number;
  status: string; lease_token: string | null; result_id: string | null; expires_at: string;
}
export function storageWriteProvider(): 'r2' | 'supabase' {
  return process.env.STORAGE_WRITE_PROVIDER === 'r2' ? 'r2' : 'supabase';
}
export function r2PurposeEnabled(purpose: string): boolean {
  return storageWriteProvider() === 'r2' && (process.env.STORAGE_R2_PURPOSES || 'temp').split(',').map(s => s.trim()).includes(purpose);
}
export function checkDb(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
export async function queueCleanup(provider: string, kind: BucketKind, key: string, delayMs = 0) {
  const { error } = await getSupabaseAdmin().from('storage_cleanup_jobs').upsert({ provider, bucket_kind: kind, object_key: key, not_before: new Date(Date.now() + delayMs).toISOString() }, { onConflict: 'provider,bucket_kind,object_key,scope' });
  checkDb(error);
}
export async function loadUpload(id: string, userId: string, signal?: AbortSignal): Promise<UploadRow> {
  const query = getSupabaseAdmin().from('storage_uploads').select('*').eq('id', id).eq('user_id', userId);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  checkDb(error);
  if (!data) throw new StorageError('Không tìm thấy file', 404);
  return data as UploadRow;
}
function uploadResult(row: UploadRow) {
  return { uploadId: row.id, filePath: row.final_key, cvId: row.result_id, candidateId: row.purpose === 'candidate' ? row.result_id : undefined, reference: row.purpose === 'temp' ? `r2:${row.id}` : undefined, provider: 'r2' };
}
async function finalize(userId: string, id: string) {
  let row = await loadUpload(id, userId);
  if (row.status === 'ready') return uploadResult(row);
  const db = getSupabaseAdmin(); const token = randomUUID();
  const { data, error } = await db.rpc('storage_claim_upload', { p_user: userId, p_id: id, p_token: token });
  checkDb(error);
  row = data?.[0];
  if (!row) throw new StorageError('File đang được xử lý hoặc đã hết hạn', 409);
  const kind: BucketKind = row.purpose === 'temp' ? 'temp' : 'saved';
  // Record each lease's distinct output before I/O so crashes and stale workers cannot leave untracked objects.
  await queueCleanup('r2', kind, row.final_key!, 24 * 3600000);
  try {
    await copyObject(kind, row.staging_key, row.final_key!);
    const bytes = await readObject(kind, row.final_key!, row.purpose === 'temp' ? 15 * 1024 * 1024 : 50 * 1024 * 1024);
    if (bytes.length !== Number(row.file_size)) throw new StorageError('Dung lượng file không khớp');
    await validateContent(bytes, row.mime_type);
    const published = await db.rpc('storage_publish_upload', { p_user: userId, p_id: id, p_token: token });
    checkDb(published.error);
    return uploadResult(published.data as UploadRow);
  } catch (err) {
    // Leave pending for a retry; the fencing token prevents an expired worker from publishing.
    const released = await db.from('storage_uploads').update({ lease_until: null, lease_token: null }).eq('id', id).eq('lease_token', token).eq('status', 'pending');
    checkDb(released.error);
    throw err;
  }
}
async function authorizedFile(userId: string, path: string): Promise<{ storage_provider: string; file_path: string; id: string; table: 'saved_cvs' | 'candidate_cvs' }> {
  assertOwnedKey(path, userId);
  const db = getSupabaseAdmin();
  const saved = await db.from('saved_cvs').select('id,storage_provider,file_path').eq('file_path', path).eq('user_id', userId).eq('storage_status', 'ready').maybeSingle();
  checkDb(saved.error);
  if (saved.data) return { ...saved.data, table: 'saved_cvs' };
  const candidate = await db.from('candidate_cvs').select('id,storage_provider,file_path,recruitment_campaigns!inner(user_id)').eq('file_path', path).eq('recruitment_campaigns.user_id', userId).eq('storage_status', 'ready').maybeSingle();
  checkDb(candidate.error);
  if (!candidate.data) throw new StorageError('Không tìm thấy file', 404);
  return { ...candidate.data, table: 'candidate_cvs' };
}
async function download(userId: string, path: string) {
  const file = await authorizedFile(userId, path);
  if (file.storage_provider === 'r2') return { url: await signDownload('saved', file.file_path) };
  const { data, error } = await getSupabaseAdmin().storage.from('cv-files').createSignedUrl(file.file_path, 120, { download: true });
  checkDb(error);
  return { url: data!.signedUrl };
}
export async function readTempUpload(id: string, userId: string, signal?: AbortSignal): Promise<string> {
  const row = await loadUpload(id, userId, signal);
  if (row.purpose !== 'temp' || row.status !== 'ready' || new Date(row.expires_at).getTime() <= Date.now()) throw new StorageError('File tạm chưa sẵn sàng hoặc đã hết hạn');
  return (await readObject('temp', row.final_key!, 15 * 1024 * 1024, signal)).toString('base64');
}
export async function handleStorage(authHeader: string | undefined, input: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const user = await getUserFromBearerToken(authHeader);
    if (!user) return { status: 401, body: { error: 'Vui lòng đăng nhập' } };
    const access = await checkAccountAccess(user.id);
    if (access === 'locked') return { status: 403, body: { error: 'Account locked' } };
    if (access === 'unavailable') return { status: 503, body: { error: 'Account verification unavailable' } };
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StorageError('Yêu cầu không hợp lệ');
    const body = input as Record<string, unknown>;
    const action = body.action;
    if (!['upload', 'finalize', 'download', 'delete', 'delete-temp'].includes(String(action))) throw new StorageError('Thao tác không hợp lệ');
    if (action === 'upload') {
      if (storageWriteProvider() !== 'r2') throw new StorageError('R2 upload chưa được bật', 409);
      const meta = validateUpload(body); const id = randomUUID();
      if (!r2PurposeEnabled(meta.purpose)) throw new StorageError('R2 chưa được bật cho luồng này', 409);
      const { data, error } = await getSupabaseAdmin().rpc('storage_reserve_upload', { p_user: user.id, p_id: id, p_purpose: meta.purpose, p_campaign: meta.campaignId, p_name: meta.fileName, p_mime: meta.mimeType, p_size: meta.size });
      if (error) throw new StorageError('Không thể khởi tạo upload; kiểm tra quyền hoặc giới hạn upload', 409);
      const row = data as UploadRow;
      return { status: 200, body: { uploadId: row.id, url: await signUpload(meta.purpose === 'temp' ? 'temp' : 'saved', row.staging_key, meta.mimeType) } };
    }
    if (action === 'finalize') {
      if (typeof body.uploadId !== 'string' || !UUID.test(body.uploadId)) throw new StorageError('Upload ID không hợp lệ');
      return { status: 200, body: await finalize(user.id, body.uploadId) };
    }
    if (action === 'delete') {
      if (typeof body.filePath !== 'string' || body.filePath.length > 1024) throw new StorageError('File không hợp lệ');
      const file = await authorizedFile(user.id, body.filePath);
      const db = getSupabaseAdmin();
      // The update trigger persists a cleanup job in the same transaction.
      const pending = await db.from(file.table).update({ storage_status: 'delete_pending' }).eq('id', file.id); checkDb(pending.error);
      try {
        if (file.storage_provider === 'r2') await removeObject('saved', file.file_path);
        else { const removed = await db.storage.from('cv-files').remove([file.file_path]); checkDb(removed.error); }
        const removed = await db.from(file.table).delete().eq('id', file.id).eq('storage_status', 'delete_pending'); checkDb(removed.error);
      } catch { return { status: 200, body: { ok: true, cleanupPending: true } }; }
      return { status: 200, body: { ok: true } };
    }
    if (action === 'download') {
      if (typeof body.filePath !== 'string' || body.filePath.length > 1024) throw new StorageError('File không hợp lệ');
      return { status: 200, body: await download(user.id, body.filePath) };
    }
    if (!Array.isArray(body.paths) || body.paths.length > 100 || body.paths.some(p => typeof p !== 'string' || p.length > 1024)) throw new StorageError('Danh sách file không hợp lệ');
    for (const path of body.paths as string[]) {
      const id = parseTempReference(path);
      if (id) {
        const row = await loadUpload(id, user.id);
        if (row.purpose !== 'temp') throw new StorageError('File không phải file tạm');
        if (row.final_key) {
          await queueCleanup('r2', 'temp', row.final_key);
          try { await removeObject('temp', row.final_key); }
          catch { console.error('Temp file cleanup queued', { uploadId: id }); }
        }
        const { error } = await getSupabaseAdmin().from('storage_uploads').update({ status: 'deleted', expires_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
        checkDb(error);
      } else {
        assertOwnedKey(path, user.id);
        const { error } = await getSupabaseAdmin().storage.from('cv-analyze-tmp').remove([path]); checkDb(error);
      }
    }
    return { status: 200, body: { ok: true } };
  } catch (err) {
    if (err instanceof StorageError) return { status: err.status, body: { error: err.message } };
    console.error('Storage operation failed:', err instanceof Error ? err.name : 'unknown');
    return { status: 500, body: { error: 'Không thể xử lý file. Vui lòng thử lại.' } };
  }
}
