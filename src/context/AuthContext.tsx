import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile, getUserProfile, createUserProfile, subscribeToAllUsers } from '../services/userService';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isLoadingProfile: boolean;
  allUsers: UserProfile[];
  login: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | React.ReactNode | null;
  setError: React.Dispatch<React.SetStateAction<string | React.ReactNode | null>>;
  isAuthInitialized: boolean;
  isRedirectChecked: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | React.ReactNode | null>(null);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isRedirectChecked, setIsRedirectChecked] = useState(true); // OAuth redirect handled by Supabase session
  
  const { executeRecaptcha } = useGoogleReCaptcha();

  const loadUserProfileData = async (currentUser: User) => {
    setIsLoadingProfile(true);
    try {
      let profile = await getUserProfile(currentUser.id);
      
      if (!profile) {
        let token = undefined;
        if (executeRecaptcha) {
          try {
            token = await executeRecaptcha('welcome_email');
          } catch (recaptchaErr) {
            console.error("Lỗi thực thi reCAPTCHA cho email chào mừng:", recaptchaErr);
          }
        }
        
        try {
          profile = await createUserProfile(currentUser, token);
        } catch (createErr: any) {
          // Nếu báo lỗi trùng ID (23505), nghĩa là hồ sơ vừa được tạo hoặc đã tồn tại
          if (createErr.code === '23505') {
            console.log("AuthProvider: [RETRY] Hồ sơ đã tồn tại, đang thử tải lại...");
            profile = await getUserProfile(currentUser.id);
          } else {
            throw createErr;
          }
        }
      }
      setUserProfile(profile);
    } catch (err: any) {
      console.error("Lỗi khi tải thông tin người dùng:", err);
      setError("Không thể tải thông tin hồ sơ: " + err.message);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const mappedUsers: UserProfile[] = data.map(u => ({
        id: u.id,
        email: u.email,
        displayName: u.display_name,
        photoURL: u.photo_url,
        role: u.role,
        hasPermission: u.has_permission,
        usageCount: u.usage_count,
        createdAt: u.created_at,
        isNew: u.is_new
      }));
      
      setAllUsers(mappedUsers);
    } catch (err: any) {
      console.error("Lỗi khi tải danh sách người dùng:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    console.log("AuthProvider: [INIT] Bắt đầu khởi tạo Supabase Auth...");

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      const currentUser = session?.user ?? null;
      console.log("AuthProvider: [SESSION] User:", currentUser ? currentUser.email : "Trống");
      console.log("AuthProvider: [SESSION] Full Session Object:", session);
      setUser(currentUser);
      
      if (currentUser) {
        loadUserProfileData(currentUser);
      } else {
        setIsLoadingProfile(false);
      }
      setIsAuthInitialized(true);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      console.log("AuthProvider: [EVENT] Auth state changed:", _event);
      
      const currentUser = session?.user ?? null;
      console.log("AuthProvider: [EVENT] Auth event:", _event, "User:", currentUser?.email);
      setUser(currentUser);
      
      if (currentUser) {
        loadUserProfileData(currentUser);
      } else {
        setUserProfile(null);
        setIsLoadingProfile(false);
      }
      setIsAuthInitialized(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []); // Không phụ thuộc vào executeRecaptcha để tránh re-subscribe loop

  useEffect(() => {
    if (userProfile?.role === 'admin') {
      fetchAllUsers();
      
      // Đăng ký lắng nghe thay đổi để cập nhật realtime
      const channel = supabase
        .channel('admin_profiles_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          fetchAllUsers();
        })
        .subscribe();
        
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userProfile]);

  const login = async () => {
    try {
      console.log("AuthProvider: Bắt đầu đăng nhập với Google OAuth...");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      
      if (error) throw error;
    } catch (err: any) {
      console.error("Login Error:", err);
      setError("Lỗi đăng nhập: " + err.message);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserProfile(null);
    } catch (err: any) {
      console.error("Logout Error:", err);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, userProfile, isLoadingProfile, allUsers, login, logout, error, setError, isAuthInitialized, isRedirectChecked
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
