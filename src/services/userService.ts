import { supabase } from "../lib/supabase";

export const DEFAULT_AVATAR_URL = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

export type UserPlan = 'free' | 'pro' | 'recruiter';

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
  /** Stored override when monthlyAnalyticsLimitCustom; NULL = unlimited */
  monthlyAnalyticsLimit: number | null;
  /** false = inherit app_settings default_monthly_analytics_limit */
  monthlyAnalyticsLimitCustom: boolean;
  usageMonth: string;
  plan: UserPlan;
  planExpiresAt: string | null;
}

/** Effective limit for display/enforcement (pass global default from app_settings). */
export function resolveEffectiveMonthlyAnalyticsLimit(
  profile: Pick<UserProfile, 'monthlyAnalyticsLimitCustom' | 'monthlyAnalyticsLimit'>,
  globalDefault: number
): number | null {
  if (profile.monthlyAnalyticsLimitCustom) {
    return profile.monthlyAnalyticsLimit;
  }
  return globalDefault;
}

// Map database fields to UserProfile interface
function mapProfile(data: any): UserProfile {
  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    photoURL: data.photo_url || DEFAULT_AVATAR_URL,
    role: data.role || 'user',
    createdAt: data.created_at,
    isNew: data.is_new,
    hasPermission: data.has_permission,
    usageCount: data.usage_count || 0,
    monthlyAnalyticsLimit:
      data.monthly_analytics_limit === null || data.monthly_analytics_limit === undefined
        ? null
        : Number(data.monthly_analytics_limit),
    monthlyAnalyticsLimitCustom: Boolean(data.monthly_analytics_limit_custom),
    usageMonth: data.usage_month || '',
    plan: (data.plan === 'pro' || data.plan === 'recruiter') ? data.plan : 'free',
    planExpiresAt: data.plan_expires_at ?? null,
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

export async function createUserProfile(user: any, recaptchaToken?: string): Promise<UserProfile> {
  const profileData = {
    id: user.id,
    email: user.email || '',
    display_name: user.user_metadata?.full_name || user.displayName || '',
    photo_url: user.user_metadata?.avatar_url || user.photoURL || DEFAULT_AVATAR_URL,
    role: 'user',
    has_permission: true,
    usage_count: 0,
    usage_month: new Date().toISOString().slice(0, 7),
    monthly_analytics_limit_custom: false,
    created_at: new Date().toISOString(),
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
    // Token reCAPTCHA được gởi lên server nếu có; server tự quyết định verify.
    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'welcome',
        token: recaptchaToken || '',
        userEmail: profile.email,
        userName: profile.displayName,
      }),
    }).catch(emailError => {
      console.error("Lỗi khi gửi email chào mừng:", emailError);
    });

    return profile;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
}

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
}

export async function resetUserToGlobalAnalyticsLimit(uid: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ monthly_analytics_limit_custom: false })
    .eq('id', uid);

  if (error) throw error;
}

export async function updateUserRole(uid: string, role: 'admin' | 'user'): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', uid);
  
  if (error) throw error;
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
  const plan = grant === 'free' ? 'free' : grant === 'recruiter_30' ? 'recruiter' : 'pro';
  const durationDays =
    grant === 'pro_90' ? 90 : grant === 'pro_365' ? 365 : grant === 'pro_30' ? 30 : 30;

  const { error } = await supabase.rpc('admin_set_user_plan', {
    p_user_id: uid,
    p_plan: plan,
    p_duration_days: plan === 'free' ? 30 : durationDays,
  });

  if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
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
