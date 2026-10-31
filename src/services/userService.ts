import { supabase } from "../lib/supabase";
import type { UserPlan } from "../lib/planLimits";
import { vnSignupQuotaCycle } from "../lib/vnTime";
export type { UserPlan } from "../lib/planLimits";

export const DEFAULT_AVATAR_URL = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";


/** Plan-based monthly analytics limits — must match DB's resolve_monthly_analytics_limit. */
export const PRO_MONTHLY_ANALYTICS_LIMIT = 100;
export const RECRUITER_MONTHLY_ANALYTICS_LIMIT = 500;

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'user' | 'admin';
  createdAt: string;
  isNew: boolean;
  hasPermission: boolean;
  usageCount: number;
  /** usage_count projected through the pending lazy monthly rollover, if any (see effective_usage_count RPC). */
  effectiveUsageCount: number;
  /** Stored override when monthlyAnalyticsLimitCustom; NULL = unlimited */
  monthlyAnalyticsLimit: number | null;
  /** false = inherit app_settings default_monthly_analytics_limit */
  monthlyAnalyticsLimitCustom: boolean;
  usageMonth: string;
  plan: UserPlan;
  planExpiresAt: string | null;
  /** Day of month (1–28) when the monthly usage_count resets. */
  quotaResetDay: number;
}

export type AdminUserPlanFilter = 'all' | 'free' | 'pro' | 'recruiter';
export type AdminUserRoleFilter = 'all' | 'user' | 'admin';
export type AdminUserStatusFilter = 'all' | 'active' | 'locked';
export type AdminUserSort = 'created_desc' | 'created_asc' | 'usage_desc' | 'name_asc' | 'expiry_asc';

export interface AdminUsersQuery {
  search: string;
  plan: AdminUserPlanFilter;
  role: AdminUserRoleFilter;
  status: AdminUserStatusFilter;
  sort: AdminUserSort;
  page: number;
  pageSize: number;
}

export interface AdminUsersPage {
  rows: UserProfile[];
  total: number;
  newUsersCount: number;
  newUsers: UserProfile[];
}

/** Effective limit for display/enforcement (pass global default from app_settings). */
export function resolveEffectiveMonthlyAnalyticsLimit(
  profile: Pick<UserProfile, 'monthlyAnalyticsLimitCustom' | 'monthlyAnalyticsLimit' | 'plan' | 'planExpiresAt' | 'role'>,
  globalDefault: number
): number | null {
  // Mirrors check_analytics_quota/increment_usage_count: role='admin' is always
  // unlimited at the DB layer regardless of plan or custom override.
  if (profile.role === 'admin') return null;
  if (profile.monthlyAnalyticsLimitCustom) {
    return profile.monthlyAnalyticsLimit;
  }
  const effectivePlan = getDisplayEffectivePlan(profile);
  if (effectivePlan === 'recruiter') return RECRUITER_MONTHLY_ANALYTICS_LIMIT;
  if (effectivePlan === 'pro') return PRO_MONTHLY_ANALYTICS_LIMIT;
  return globalDefault;
}

// Map database fields to UserProfile interface
export function mapProfile(data: Record<string, unknown>): UserProfile {
  return {
    id: data['id'] as string,
    email: data['email'] as string,
    displayName: data['display_name'] as string,
    photoURL: (data['photo_url'] as string | undefined) || DEFAULT_AVATAR_URL,
    role: data['role'] === 'admin' ? 'admin' : 'user',
    createdAt: data['created_at'] as string,
    isNew: Boolean(data['is_new']),
    hasPermission: Boolean(data['has_permission']),
    usageCount: (data['usage_count'] as number | undefined) || 0,
    effectiveUsageCount:
      (data['effective_usage_count'] as number | undefined) ??
      (data['usage_count'] as number | undefined) ??
      0,
    monthlyAnalyticsLimit:
      data['monthly_analytics_limit'] === null || data['monthly_analytics_limit'] === undefined
        ? null
        : Number(data['monthly_analytics_limit']),
    monthlyAnalyticsLimitCustom: Boolean(data['monthly_analytics_limit_custom']),
    usageMonth: (data['usage_month'] as string | undefined) || '',
    plan: (data['plan'] === 'pro' || data['plan'] === 'recruiter') ? data['plan'] as UserPlan : 'free',
    planExpiresAt: (data['plan_expires_at'] as string | null) ?? null,
    quotaResetDay: typeof data['quota_reset_day'] === 'number' ? data['quota_reset_day'] : 1,
  };
}

/**
 * Server-side Admin > Users page. One RPC returns the current page plus the
 * DB-wide new-user count/preview, so search/filter never downloads the whole
 * profiles table. Filters/sort are validated again inside the RPC.
 */
export async function fetchAdminUsersPage(query: AdminUsersQuery): Promise<AdminUsersPage> {
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize) || 20, 1), 100);
  const page = Math.max(Math.trunc(query.page) || 1, 1);
  const { data, error } = await supabase.rpc('admin_list_profiles', {
    p_search: query.search.trim() || null,
    p_plan: query.plan,
    p_role: query.role,
    p_status: query.status,
    p_sort: query.sort,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) throw error;
  const result = (data ?? {}) as {
    rows?: unknown[];
    total?: number;
    new_users_count?: number;
    new_users?: unknown[];
  };
  return {
    rows: (result.rows ?? []).map((row) => mapProfile(row as Record<string, unknown>)),
    total: Number(result.total ?? 0),
    newUsersCount: Number(result.new_users_count ?? 0),
    newUsers: (result.new_users ?? []).map((row) => mapProfile(row as Record<string, unknown>)),
  };
}

export async function fetchEffectiveUserPlan(userId: string): Promise<UserPlan> {
  const { data, error } = await supabase.rpc('get_user_plan', { p_user_id: userId });
  if (error) {
    console.error('get_user_plan failed:', error);
    return 'free';
  }
  return (data === 'pro' || data === 'recruiter') ? data : 'free';
}

export async function getUserProfile(id: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle(); // Sử dụng maybeSingle để tránh lỗi 406/PGRST116

    if (error) {
      console.error('Lỗi truy vấn hồ sơ:', error);
      throw error; // Ném lỗi ra ngoài để AuthContext biết
    }

    if (!data) return null;

    return mapProfile(data);
  } catch (error) {
    console.error('Lỗi nghiêm trọng trong getUserProfile:', error);
    throw error; // Đảm bảo lỗi được truyền đi
  }
}

interface AuthUserInput {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; avatar_url?: string };
  displayName?: string;
  photoURL?: string;
}

export async function createUserProfile(user: AuthUserInput): Promise<UserProfile> {
  const { resetDay, usageMonth } = vnSignupQuotaCycle(new Date());

  const profileData = {
    id: user.id,
    email: user.email || '',
    display_name: user.user_metadata?.full_name || user.displayName || '',
    photo_url: user.user_metadata?.avatar_url || user.photoURL || DEFAULT_AVATAR_URL,
    role: 'user',
    has_permission: true,
    usage_count: 0,
    usage_month: usageMonth,
    monthly_analytics_limit_custom: false,
    quota_reset_day: resetDay,
    is_new: true,
  };

  try {
    const { data, error } = await supabase
      .from('profiles')
      .insert([profileData])
      .select()
      .single();

    if (error) throw error;

    const profile = mapProfile(data);

    // Gởi welcome email (non-blocking); server chỉ gửi tới email của token.
    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session?.access_token) return;
        return fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ type: 'welcome', userName: profile.displayName }),
        }).then(async res => {
          if (!res.ok) {
            console.error('Gửi email chào mừng thất bại:', res.status, await res.text());
          }
        });
      })
      .catch(emailError => {
        console.error('Lỗi khi gửi email chào mừng:', emailError);
      });

    return profile;
  } catch (error) {
    // 23505 = duplicate key — expected race condition, caller retries with getUserProfile
    if ((error as { code?: string })?.code !== '23505') {
      console.error('Error creating user profile:', error);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

// Role/plan/delete are audited server-side in _server-lib/admin/audit.ts,
// next to the privileged write. Only direct client-side profile writes log here.
type AuditAction =
  | 'update_permission'
  | 'update_analytics_limit'
  | 'reset_analytics_limit';

async function logAdminAction(
  action: AuditAction,
  targetUserId: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_admin_action', {
      p_action: action,
      p_target_user_id: targetUserId,
      p_details: details ?? null,
    });
    if (error) throw error;
  } catch (err) {
    // Non-critical — log failure must never block the admin action
    console.error('log_admin_action failed:', err);
  }
}

// ---------------------------------------------------------------------------

export async function markUserAsRead(uid: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_new: false })
    .eq('id', uid);
  
  if (error) throw error;
}

export async function updateUserPermission(uid: string, hasPermission: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ has_permission: hasPermission })
    .eq('id', uid);

  if (error) throw error;
  void logAdminAction('update_permission', uid, { has_permission: hasPermission });
}

export async function updateUserMonthlyAnalyticsLimit(
  uid: string,
  limit: number
): Promise<void> {
  // "Unlimited" is admin-only (admins already resolve to unlimited by role);
  // a normal user always gets an explicit non-negative integer limit.
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('Monthly analytics limit must be a non-negative integer');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      monthly_analytics_limit: limit,
      monthly_analytics_limit_custom: true,
    })
    .eq('id', uid);

  if (error) throw error;
  void logAdminAction('update_analytics_limit', uid, { monthly_analytics_limit: limit });
}

export async function resetUserToGlobalAnalyticsLimit(uid: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ monthly_analytics_limit_custom: false })
    .eq('id', uid);

  if (error) throw error;
  void logAdminAction('reset_analytics_limit', uid);
}

export async function updateUserRole(uid: string, role: 'admin' | 'user'): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch('/api/admin/set-user-role', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ p_user_id: uid, p_role: role }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || `Request failed: ${res.status}`);
  }
}

export type AdminPlanGrant = 'free' | 'pro_30' | 'pro_90' | 'pro_365' | 'recruiter_30';

/** Effective tier for UI (expiry-aware; admins always pro for limits). */
export function getDisplayEffectivePlan(
  profile: Pick<UserProfile, 'plan' | 'planExpiresAt' | 'role'>
): UserPlan {
  if (profile.role === 'admin') return 'pro';
  if (profile.plan !== 'pro' && profile.plan !== 'recruiter') return 'free';
  if (!profile.planExpiresAt) return profile.plan as UserPlan;
  return new Date(profile.planExpiresAt) > new Date() ? (profile.plan as UserPlan) : 'free';
}

export function adminPlanSelectValue(profile: UserProfile): AdminPlanGrant {
  const effective = getDisplayEffectivePlan(profile);
  if (effective === 'free') return 'free';
  if (effective === 'recruiter') return 'recruiter_30';
  if (!profile.planExpiresAt) return 'pro_30';
  const daysLeft = Math.ceil(
    (new Date(profile.planExpiresAt).getTime() - Date.now()) / 86_400_000
  );
  if (daysLeft > 180) return 'pro_365';
  if (daysLeft > 45) return 'pro_90';
  return 'pro_30';
}

function planGrantTarget(grant: AdminPlanGrant): {
  plan: 'free' | 'pro' | 'recruiter';
  durationDays: number;
} {
  const plan = grant === 'free' ? 'free' : grant === 'recruiter_30' ? 'recruiter' : 'pro';
  const durationDays =
    grant === 'pro_90' ? 90 : grant === 'pro_365' ? 365 : grant === 'pro_30' ? 30 : 30;
  return { plan, durationDays };
}

export type AdminLimitMode = 'keep' | 'inherit' | 'custom';

export interface AdminUpdateUserInput {
  /** null = leave the plan untouched. */
  plan: AdminPlanGrant | null;
  limitMode: AdminLimitMode;
  limit?: number | null;
}

/**
 * One backend call for plan + limit. The server runs a single RPC in one
 * transaction and writes the audit rows there, so a partial failure cannot
 * leave the limit changed while the plan failed (or double-stack the plan on
 * a double submit).
 */
export async function adminUpdateUser(
  uid: string,
  input: AdminUpdateUserInput
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const body: Record<string, unknown> = {
    p_user_id: uid,
    p_limit_mode: input.limitMode,
  };

  if (input.plan) {
    const target = planGrantTarget(input.plan);
    body.p_plan = target.plan;
    body.p_duration_days = target.durationDays;
  }

  if (input.limitMode === 'custom') {
    if (!Number.isInteger(input.limit) || (input.limit as number) < 0) {
      throw new Error('Monthly analytics limit must be a non-negative integer');
    }
    body.p_limit = input.limit;
  }

  const res = await fetch('/api/admin/update-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error((errorBody as { error?: string })?.error || `Request failed: ${res.status}`);
  }
}

export async function adminUpdateUserPlan(
  uid: string,
  grant: AdminPlanGrant
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const target = planGrantTarget(grant);
  const res = await fetch('/api/admin/set-user-plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      p_user_id: uid,
      p_plan: target.plan,
      p_duration_days: target.durationDays,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || `Request failed: ${res.status}`);
  }
}

export type AdminBulkAction = 'mark_read' | 'lock' | 'unlock';

export async function adminBulkUpdateUsers(
  userIds: string[],
  action: AdminBulkAction
): Promise<number> {
  if (userIds.length < 1 || userIds.length > 100) {
    throw new Error('Select between 1 and 100 users');
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch('/api/admin/bulk-users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ p_user_ids: userIds, p_action: action }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || `Request failed: ${res.status}`);
  }
  const body = (await res.json().catch(() => ({}))) as { count?: unknown };
  return Number(body.count ?? 0);
}

// Server-side hard delete (auth user + cascaded rows + storage). Deleting only
// the profiles row left the auth account alive, so the next login re-created a
// fresh profile with usage_count 0. The server also writes the audit log entry.
export async function deleteUser(id: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch('/api/admin/delete-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ p_user_id: id }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || `Request failed: ${res.status}`);
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, effective_usage_count')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data.map(mapProfile);
}

export function subscribeToAllUsers(callback: (users: UserProfile[]) => void) {
  const subscription = supabase
    .channel('public:profiles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
      const users = await getAllUsers();
      callback(users);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(subscription);
  };
}
