import type { SupabaseClient } from '@supabase/supabase-js';

// Buckets whose objects are keyed `${userId}/...` (see src/services/cvService.ts).
const USER_STORAGE_BUCKETS = ['cv-files', 'cv-analyze-tmp'] as const;

export type DeleteUserResult =
  | { ok: true; storageErrors: string[] }
  | { ok: false; status: number; error: string };

async function listFilesRecursive(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const paths: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    const entries = data ?? [];
    for (const entry of entries) {
      const fullPath = `${prefix}/${entry.name}`;
      // Folders come back with a null id; files have one.
      if (entry.id === null) {
        paths.push(...(await listFilesRecursive(supabase, bucket, fullPath)));
      } else {
        paths.push(fullPath);
      }
    }
    if (entries.length < PAGE) break;
  }
  return paths;
}

/**
 * Hard-deletes a user: auth.users row (profiles, history, saved_cvs, campaigns
 * cascade via FK) plus their storage objects.
 *
 * Deleting only the profiles row (the old client-side behaviour) left the auth
 * account alive — the next login re-created a fresh profile with usage_count 0,
 * silently resetting their quota.
 */
export async function adminDeleteUser(
  supabase: SupabaseClient,
  callerId: string,
  targetUserId: string
): Promise<DeleteUserResult> {
  if (targetUserId === callerId) {
    return { ok: false, status: 400, error: 'Cannot delete your own account' };
  }

  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('id', targetUserId)
    .maybeSingle();
  if (targetError) {
    return { ok: false, status: 500, error: targetError.message };
  }
  // Admins must be demoted first: prevents one-click removal of another admin,
  // and app_settings.updated_by references auth.users without ON DELETE, so
  // deleting an admin who ever saved settings would fail on the FK anyway.
  if (target?.role === 'admin') {
    return { ok: false, status: 400, error: 'Demote this admin to user before deleting' };
  }

  // Audit before delete: admin_audit_log.target_user_id is ON DELETE SET NULL,
  // so keep the email in details to know who was removed afterwards.
  const { error: auditError } = await supabase.from('admin_audit_log').insert({
    admin_id: callerId,
    action: 'delete_user',
    target_user_id: targetUserId,
    details: { email: target?.email ?? null },
  });
  if (auditError) console.error('admin_audit_log insert failed:', auditError);

  // Storage first: once the auth user is gone nothing else points at these
  // paths. Best-effort — orphaned files must not block the account deletion.
  const storageErrors: string[] = [];
  for (const bucket of USER_STORAGE_BUCKETS) {
    try {
      const paths = await listFilesRecursive(supabase, bucket, targetUserId);
      for (let i = 0; i < paths.length; i += 1000) {
        const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 1000));
        if (error) throw error;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`storage cleanup failed (${bucket}):`, err);
      storageErrors.push(`${bucket}: ${message}`);
    }
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    // Auth user already gone but a stray profile remains (legacy data) — clean it up.
    if (deleteError.status === 404) {
      const { error: profileDeleteError } = await supabase.from('profiles').delete().eq('id', targetUserId);
      if (profileDeleteError) return { ok: false, status: 500, error: profileDeleteError.message };
      return { ok: true, storageErrors };
    }
    return { ok: false, status: 500, error: deleteError.message };
  }

  return { ok: true, storageErrors };
}
