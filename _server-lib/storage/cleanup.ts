import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getSupabaseAdmin } from '../payment/supabaseAdmin.js';
import { listObjects, removeObject, type BucketKind } from './r2.js';
import { checkDb } from './handler.js';

export function validCleanupSecret(header: string | undefined): boolean {
  const secret = process.env.STORAGE_CLEANUP_SECRET?.trim();
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`); const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function removePrefix(provider: string, kind: BucketKind, prefix: string, deadline: number): Promise<boolean> {
  if (Date.now() >= deadline) return false;
  if (provider === 'r2') {
    const page = await listObjects(kind, prefix);
    for (const key of page.keys) { if (Date.now() >= deadline) return false; await removeObject(kind, key); }
    return !page.more;
  }
  const storage = getSupabaseAdmin().storage.from(kind === 'temp' ? 'cv-analyze-tmp' : 'cv-files');
  const root = prefix.replace(/\/$/, '');
  const { data, error } = await storage.list(root, { limit: 100 }); checkDb(error);
  for (const item of data ?? []) {
    if (Date.now() >= deadline) return false;
    const key = `${root}/${item.name}`;
    if (item.id === null) { if (!await removePrefix(provider, kind, key, deadline)) return false; }
    else { const result = await storage.remove([key]); checkDb(result.error); }
  }
  return (data?.length ?? 0) < 100;
}
export async function runStorageCleanup(): Promise<{ completed: number; failed: number }> {
  const db = getSupabaseAdmin(); const now = new Date().toISOString(); const deadline = Date.now() + 20000;
  // Registry rows survive owner deletion, so a crash never destroys the cleanup inventory.
  const expired = await db.from('storage_uploads').select('*').lt('expires_at', now).neq('status', 'deleted').limit(25); checkDb(expired.error);
  for (const row of expired.data ?? []) {
    if (row.status === 'ready' && row.purpose !== 'temp') continue;
    const kind = row.purpose === 'temp' ? 'temp' : 'saved';
    for (const key of [row.staging_key, row.final_key].filter(Boolean)) {
      const queued = await db.from('storage_cleanup_jobs').upsert({ provider: 'r2', bucket_kind: kind, object_key: key }, { onConflict: 'provider,bucket_kind,object_key,scope', ignoreDuplicates: true }); checkDb(queued.error);
    }
    const result = await db.from('storage_uploads').update({ status: 'deleted' }).eq('id', row.id).eq('status', row.status); checkDb(result.error);
  }
  const jobs = await db.from('storage_cleanup_jobs').select('*').lte('not_before', now).order('not_before').limit(25); checkDb(jobs.error);
  let completed = 0; let failed = 0;
  for (const job of jobs.data ?? []) {
    if (Date.now() >= deadline) break;
    const token = randomUUID();
    const claimed = await db.from('storage_cleanup_jobs').update({ lease_token: token, lease_until: new Date(Date.now() + 120000).toISOString() }).eq('id', job.id).or(`lease_until.is.null,lease_until.lt.${now}`).select('id'); checkDb(claimed.error);
    if (!claimed.data?.length) continue;
    try {
      let done = true;
      if (job.scope === 'prefix') done = await removePrefix(job.provider, job.bucket_kind, job.object_key, deadline);
      else {
        let isActive = false;
        for (const table of ['saved_cvs', 'candidate_cvs']) {
          const active = await db.from(table).select('id').eq('file_path', job.object_key).eq('storage_provider', job.provider).eq('storage_status', 'ready').limit(1);
          checkDb(active.error);
          if (active.data?.length) isActive = true;
        }
        if (!isActive) {
          if (job.provider === 'r2') await removeObject(job.bucket_kind, job.object_key);
          else { const result = await db.storage.from(job.bucket_kind === 'temp' ? 'cv-analyze-tmp' : 'cv-files').remove([job.object_key]); checkDb(result.error); }
        }
      }
      if (done) {
        if (job.scope === 'object') {
          for (const table of ['saved_cvs', 'candidate_cvs']) {
            const removed = await db.from(table).delete().eq('file_path', job.object_key).eq('storage_provider', job.provider).eq('storage_status', 'delete_pending'); checkDb(removed.error);
          }
        }
        const result = await db.from('storage_cleanup_jobs').delete().eq('id', job.id).eq('lease_token', token); checkDb(result.error); completed++;
      } else {
        const result = await db.from('storage_cleanup_jobs').update({ lease_until: null, lease_token: null }).eq('id', job.id).eq('lease_token', token); checkDb(result.error);
      }
    } catch {
      failed++;
      const attempts = job.attempts + 1;
      const result = await db.from('storage_cleanup_jobs').update({ attempts, lease_until: null, lease_token: null, last_error: 'Storage cleanup failed', not_before: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6))).toISOString() }).eq('id', job.id).eq('lease_token', token); checkDb(result.error);
      console.error('Storage cleanup retry required', { jobId: job.id, attempts });
    }
  }
  const retention = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
  const pruned = await db.from('storage_uploads').delete().eq('status', 'deleted').lt('expires_at', retention); checkDb(pruned.error);
  const blocked = await db.from('storage_blocked_users').delete().lt('created_at', retention); checkDb(blocked.error);
  return { completed, failed };
}
