import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  UserProfile,
  UserPlan,
  getUserProfile,
  createUserProfile,
  fetchEffectiveUserPlan,
} from '../services/userService';
import { trackEvent } from '../lib/ga4';
import { setSentryUser } from '../lib/sentryUser';

export type AuthModalMode = 'signIn' | 'signUp' | 'resetPassword' | null;

export interface EmailAuthResult {
  success: boolean;
  error?: string;
  /** When true, user needs to check email (e.g., email confirmation required) */
  checkEmail?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  /** Effective tier (expiry-aware); admins treated as pro for limits */
  effectivePlan: UserPlan;
  isLoadingProfile: boolean;
  /** Count of new non-admin users — lightweight badge for Header */
  adminNewUsersCount: number;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  error: string | React.ReactNode | null;
  setError: React.Dispatch<React.SetStateAction<string | React.ReactNode | null>>;
  isAuthInitialized: boolean;
  isRedirectChecked: boolean;
  refreshUserProfile: () => Promise<void>;
  /** Auth modal */
  authModalMode: AuthModalMode;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
  /** Email auth */
  signInWithEmail: (email: string, password: string) => Promise<EmailAuthResult>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<EmailAuthResult>;
  resetPasswordForEmail: (email: string) => Promise<EmailAuthResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [effectivePlan, setEffectivePlan] = useState<UserPlan>('free');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [adminNewUsersCount, setAdminNewUsersCount] = useState(0);
  const [error, setError] = useState<string | React.ReactNode | null>(null);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isRedirectChecked, setIsRedirectChecked] = useState(true); // OAuth redirect handled by Supabase session
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>(null);
  
  const loadUserProfileData = async (currentUser: User) => {
    setIsLoadingProfile(true);
    try {
      let profile = await getUserProfile(currentUser.id);
      
      if (!profile) {
        try {
          profile = await createUserProfile(currentUser);
        } catch (createErr: unknown) {
          // Nếu báo lỗi trùng ID (23505), nghĩa là hồ sơ vừa được tạo hoặc đã tồn tại
          if ((createErr as { code?: string })?.code === '23505') {
            profile = await getUserProfile(currentUser.id);
          } else {
            throw createErr;
          }
        }
      }
      setUserProfile(profile);
      if (profile) {
        const plan =
          profile.role === 'admin' ? 'pro' : await fetchEffectiveUserPlan(currentUser.id);
        setEffectivePlan(plan);
      } else {
        setEffectivePlan('free');
      }
    } catch (err: unknown) {
      console.error("Lỗi khi tải thông tin người dùng:", err);
      setError("Không thể tải thông tin hồ sơ: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const fetchAdminNewUsersCount = async () => {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('is_new', true)
      .neq('role', 'admin');
    setAdminNewUsersCount(count ?? 0);
  };

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      // Detect OAuth error redirects from Supabase (e.g. bad_oauth_state, access_denied)
      const urlParams = new URLSearchParams(window.location.search);
      const oauthErrorCode = urlParams.get('error_code');
      const oauthError = urlParams.get('error');
      if (oauthError || oauthErrorCode) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('error');
        cleanUrl.searchParams.delete('error_code');
        cleanUrl.searchParams.delete('error_description');
        window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);

        if (oauthErrorCode === 'bad_oauth_state' || oauthErrorCode === 'pkce_not_found') {
          setError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử đăng nhập lại.');
        } else if (oauthError !== 'access_denied') {
          // access_denied = user cancelled, no need to show an error
          setError('Đăng nhập thất bại. Vui lòng thử lại.');
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setSentryUser(currentUser?.id ?? null);

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

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setSentryUser(currentUser?.id ?? null);

      if (currentUser) {
        loadUserProfileData(currentUser);
      } else {
        setUserProfile(null);
        setEffectivePlan('free');
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
      fetchAdminNewUsersCount();

      const channel = supabase
        .channel('admin_new_users_count')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          fetchAdminNewUsersCount();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userProfile]);

  // Refresh effectivePlan periodically so an expired plan is detected without
  // requiring a full page reload. Skipped for admins (always 'pro').
  useEffect(() => {
    if (!user || userProfile?.role === 'admin') return;

    const refresh = async () => {
      const plan = await fetchEffectiveUserPlan(user.id);
      setEffectivePlan(plan);
    };

    const interval = setInterval(refresh, 5 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, userProfile?.role]);

  const login = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      
      if (error) throw error;
    } catch (err: unknown) {
      console.error("Login Error:", err);
      setError("Lỗi đăng nhập: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const openAuthModal = (mode?: AuthModalMode) => {
    setAuthModalMode(mode || 'signIn');
  };

  const closeAuthModal = () => {
    setAuthModalMode(null);
  };

  const signInWithEmail = async (email: string, password: string): Promise<EmailAuthResult> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        if (error.message?.includes('Invalid login') || error.message?.includes('Invalid email')) {
          return { success: false, error: 'authInvalidCredentials' };
        }
        if (error.message?.includes('Email not confirmed')) {
          return { success: false, error: 'authEmailNotConfirmed' };
        }
        return { success: false, error: error.message };
      }

      trackEvent('sign_in_email', { method: 'email' });
      return { success: true };
    } catch (err: unknown) {
      console.error('Sign in error:', err);
      const message = err instanceof Error ? err.message : String(err);
      trackEvent('sign_in_email_error', { method: 'email', error: message.slice(0, 100) || 'unknown' });
      return { success: false, error: message || 'authGenericError' };
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<EmailAuthResult> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: displayName.trim() },
          emailRedirectTo: `${window.location.origin}`,
        },
      });

      if (error) {
        if (error.message?.includes('already registered') || error.message?.includes('already in use')) {
          return { success: false, error: 'authEmailInUse' };
        }
        return { success: false, error: error.message };
      }

      // If user is created but not confirmed, show check-email message
      if (data?.user && data?.user?.identities?.length === 0) {
        return { success: false, error: 'authEmailInUse' };
      }

      // If email confirmation is enabled, user needs to check email
      if (data?.session === null) {
        trackEvent('sign_up_email', { method: 'email', needs_confirmation: true });
        return { success: true, checkEmail: true };
      }

      trackEvent('sign_up_email', { method: 'email', needs_confirmation: false });
      return { success: true };
    } catch (err: unknown) {
      console.error('Sign up error:', err);
      const message = err instanceof Error ? err.message : String(err);
      trackEvent('sign_up_email_error', { method: 'email', error: message.slice(0, 100) || 'unknown' });
      return { success: false, error: message || 'authGenericError' };
    }
  };

  const resetPasswordForEmail = async (email: string): Promise<EmailAuthResult> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}`,
      });

      if (error) {
        trackEvent('reset_password_error', { method: 'email', error: error.message?.slice(0, 100) || 'unknown' });
        return { success: false, error: error.message };
      }

      trackEvent('reset_password', { method: 'email' });
      return { success: true };
    } catch (err: unknown) {
      console.error('Reset password error:', err);
      const message = err instanceof Error ? err.message : String(err);
      trackEvent('reset_password_error', { method: 'email', error: message.slice(0, 100) || 'unknown' });
      return { success: false, error: message || 'authGenericError' };
    }
  };

  const refreshUserProfile = async () => {
    if (!user) return;
    await loadUserProfileData(user);
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserProfile(null);
      setEffectivePlan('free');
    } catch (err: unknown) {
      console.error("Logout Error:", err);
    }
  };

  const resolvedPlan: UserPlan =
    userProfile?.role === 'admin' ? 'pro' : effectivePlan;

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      effectivePlan: resolvedPlan,
      isLoadingProfile,
      adminNewUsersCount,
      login,
      logout,
      error,
      setError,
      isAuthInitialized,
      isRedirectChecked,
      refreshUserProfile,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      signInWithEmail,
      signUpWithEmail,
      resetPasswordForEmail,
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
