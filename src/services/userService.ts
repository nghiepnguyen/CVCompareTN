import { supabase } from "../lib/supabase";

export const DEFAULT_AVATAR_URL = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

export type UserPlan = 'free' | 'pro' | 'recruiter';

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
 * Full profiles table for admin search/plan-filter. The default Admin > Users
 * browse view lazy-loads 50 at a time, which silently misses matches beyond
 * the loaded window once profiles exceeds 50 rows — this paginates through
 * PostgREST's row cap so search/filter results are always complete.
 */
export async function fetchAllProfiles(): Promise<UserProfile[]> {
  const PAGE_SIZE = 1000;
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, effective_usage_count')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows.map(mapProfile);
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
  // Compute usage_month in YYYY-MM-DD format matching public.current_quota_cycle(reset_day)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const today = now.getDate();
  const resetDay = Math.min(today, 28);
  const pad = (n: number) => String(n).padStart(2, '0');

  const usageMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(resetDay)}`;

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
    created_at: now.toISOString(),
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

    // Luôn gởi welcome email sau khi tạo profile thành công.
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'welcome',
        userEmail: profile.email,
        userName: profile.displayName,
      }),
    })
      .then(async res => {
        if (!res.ok) {
          console.error('Gửi email chào mừng thất bại:', res.status, await res.text());
        }
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

type AuditAction =
  | 'update_role'
  | 'update_permission'
  | 'update_plan'
  | 'update_analytics_limit'
  | 'reset_analytics_limit'
  | 'delete_user';

async function logAdminAction(
  action: AuditAction,
  targetUserId: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('admin_audit_log').insert({
      admin_id: user.id,
      action,
      target_user_id: targetUserId,
      details: details ?? null,
    });
  } catch (err) {
    // Non-critical — log failure must never block the admin action
    console.error('admin_audit_log insert failed:', err);
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
  limit: number | null
): Promise<void> {
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

  void logAdminAction('update_role', uid, { role });
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

export async function adminUpdateUserPlan(
  uid: string,
  grant: AdminPlanGrant
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const plan = grant === 'free' ? 'free' : grant === 'recruiter_30' ? 'recruiter' : 'pro';
  const durationDays =
    grant === 'pro_90' ? 90 : grant === 'pro_365' ? 365 : grant === 'pro_30' ? 30 : 30;

  const res = await fetch('/api/admin/set-user-plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      p_user_id: uid,
      p_plan: plan,
      p_duration_days: plan === 'free' ? 30 : durationDays,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string })?.error || `Request failed: ${res.status}`);
  }

  void logAdminAction('update_plan', uid, { grant, plan, duration_days: durationDays });
}

export async function deleteUser(id: string): Promise<void> {
  // Log before delete so target_user_id still resolves in the DB
  await logAdminAction('delete_user', id);

  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id);

  if (error) throw error;
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
