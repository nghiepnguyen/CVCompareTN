import { supabase } from "../lib/supabase";

export const DEFAULT_AVATAR_URL = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

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
    usageCount: data.usage_count || 0
  };
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

    const profile = mapProfile(data);
    
    // Tự động nâng cấp admin dựa trên email
    const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();
    if (profile.email.toLowerCase() === adminEmail && profile.role !== 'admin') {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'admin', has_permission: true })
        .eq('id', id);
      
      if (!updateError) {
        profile.role = 'admin';
        profile.hasPermission = true;
      }
    }
    
    return profile;
  } catch (error) {
    console.error('Lỗi nghiêm trọng trong getUserProfile:', error);
    throw error; // Đảm bảo lỗi được truyền đi
  }
}

export async function createUserProfile(user: any, recaptchaToken?: string): Promise<UserProfile> {
  const isAdmin = user.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();
  
  const profileData = {
    id: user.id,
    email: user.email || '',
    display_name: user.user_metadata?.full_name || user.displayName || '',
    photo_url: user.user_metadata?.avatar_url || user.photoURL || DEFAULT_AVATAR_URL,
    role: isAdmin ? 'admin' : 'user',
    has_permission: true,
    usage_count: 0,
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

    if (recaptchaToken) {
      supabase.functions.invoke('send-email', {
        body: {
          type: 'welcome',
          data: {
            userEmail: profile.email,
            userName: profile.displayName
          }
        }
      }).catch(emailError => {
        console.error("Lỗi khi gửi email chào mừng (Edge Function):", emailError);
      });
    }

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

export async function updateUserRole(uid: string, role: 'admin' | 'user'): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', uid);
  
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
