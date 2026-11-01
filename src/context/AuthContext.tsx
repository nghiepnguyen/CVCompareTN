// @refresh reset — provider and hook share this module; see UIContext.tsx.
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, bootstrapSupabase } from '../lib/supabase';
import {
  UserProfile,
  UserPlan,
  getUserProfile,
  createUserProfile,
  fetchEffectiveUserPlan,
} from '../services/userService';
import { trackEvent } from '../lib/ga4';
import { setSentryUser } from '../lib/sentry';

const SESSION_INIT_TIMEOUT_MS = 6000;
const PROFILE_LOAD_TIMEOUT_MS = 8000;

/** Resolves to the promise's value, or null if it doesn't settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export type AuthModalMode ='signIn' | 'signUp' | 'resetPassword' | 'resendConfirmation' | null;

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
  /** null = still bootstrapping, false = config missing */
  isSupabaseConfigured: boolean | null;
  refreshUserProfile: () => Promise<void>;
  /** Auth modal */
  authModalMode: AuthModalMode;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
  /** Email auth */
  signInWithEmail: (email: string, password: string) => Promise<EmailAuthResult>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<EmailAuthResult>;
  resetPasswordForEmail: (email: string) => Promise<EmailAuthResult>;
  resendConfirmationEmail: (email: string) => Promise<EmailAuthResult>;
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
  const [isSupabaseConfigured, setIsSupabaseConfigured] = useState<boolean | null>(null);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>(null);
  const currentUserId = useRef<string | null>(null);
  const profileRequestId = useRef(0);
  
  const loadUserProfileData = async (currentUser: User) => {
    if (currentUser.id !== currentUserId.current) return;
    const requestId = ++profileRequestId.current;
    setIsLoadingProfile(true);
    try {
      const result = await withTimeout((async () => {
        let profile = await getUserProfile(currentUser.id);
        if (requestId !== profileRequestId.current) return null;
        if (!profile) {
          try {
            profile = await createUserProfile(currentUser);
          } catch (createErr: unknown) {
            if ((createErr as { code?: string })?.code === '23505') {
              profile = await getUserProfile(currentUser.id);
            } else {
              throw createErr;
            }
          }
        }
        const plan = profile?.role === 'admin' ? 'pro' : profile
          ? await fetchEffectiveUserPlan(currentUser.id) : 'free';
        return { profile, plan };
      })(), PROFILE_LOAD_TIMEOUT_MS);
      if (requestId !== profileRequestId.current) return;
      if (!result?.profile) throw new Error('Không tải được hồ sơ trong thời gian cho phép.');
      setUserProfile(result.profile);
      setEffectivePlan(result.plan);
    } catch (err: unknown) {
      if (requestId !== profileRequestId.current) return;
      setUserProfile(null);
      setEffectivePlan('free');
      console.error("Lỗi khi tải thông tin người dùng:", err);
      setError("Không thể tải thông tin hồ sơ: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (requestId === profileRequestId.current) {
        ++profileRequestId.current;
        setIsLoadingProfile(false);
      }
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
    let subscription: { unsubscribe: () => void } | undefined;
    let profileTimer: ReturnType<typeof setTimeout> | undefined;
    let authEventVersion = 0;

    const applyUser = (currentUser: User | null) => {
      if (!isMounted) return;
      if (profileTimer) clearTimeout(profileTimer);
      ++profileRequestId.current;
      if (currentUserId.current !== (currentUser?.id ?? null)) {
        setUserProfile(null);
        setEffectivePlan('free');
      }
      currentUserId.current = currentUser?.id ?? null;
      setUser(currentUser);
      setSentryUser(currentUser?.id ?? null);
      setIsLoadingProfile(!!currentUser);
      if (currentUser) {
        setAuthModalMode(null);
        // Profile queries must run outside Supabase's auth callback/lock.
        profileTimer = setTimeout(() => {
          if (isMounted) void loadUserProfileData(currentUser);
        }, 0);
      }
    };

    const run = async () => {
      const ready = await bootstrapSupabase();
      if (!isMounted) return;

      if (!ready) {
        setIsSupabaseConfigured(false);
        setIsAuthInitialized(true);
        return;
      }
      setIsSupabaseConfigured(true);

      // Detect auth error redirects from Supabase. These arrive either as query
      // params (OAuth code flow) or as a URL hash fragment (email link flow, e.g.
      // expired signup/reset links: #error=access_denied&error_code=otp_expired).
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const oauthErrorCode = urlParams.get('error_code') || hashParams.get('error_code');
      const oauthError = urlParams.get('error') || hashParams.get('error');
      if (oauthError || oauthErrorCode) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('error');
        cleanUrl.searchParams.delete('error_code');
        cleanUrl.searchParams.delete('error_description');
        window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search);

        if (oauthErrorCode === 'otp_expired') {
          setError('Link xác nhận đã hết hạn. Vui lòng gửi lại email xác nhận.');
          setAuthModalMode('resendConfirmation');
        } else if (oauthErrorCode === 'bad_oauth_state' || oauthErrorCode === 'pkce_not_found') {
          setError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử đăng nhập lại.');
        } else if (oauthError !== 'access_denied') {
          setError('Đăng nhập thất bại. Vui lòng thử lại.');
        }
      }

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!isMounted) return;
        ++authEventVersion;
        applyUser(session?.user ?? null);
        setIsAuthInitialized(true);
      });
      subscription = data.subscription;

      // Keep session recovery bounded; events can still deliver a late session.
      try {
        const result = await withTimeout(supabase.auth.getSession(), SESSION_INIT_TIMEOUT_MS);
        if (!isMounted) return;
        // A newer sign-in/sign-out event takes precedence over this snapshot.
        if (authEventVersion === 0) {
          if (result) {
            if (result.error) throw result.error;
            applyUser(result.data.session?.user ?? null);
          } else {
            console.warn('[Auth] getSession() timed out; continuing without session');
            setIsLoadingProfile(false);
          }
        }
      } catch (err) {
        console.error('[Auth] getSession() failed:', err);
        if (!isMounted) return;
        if (authEventVersion === 0) setIsLoadingProfile(false);
      }
      setIsAuthInitialized(true);
    };

    run().catch((err) => {
      console.error('[Auth] Initialization failed:', err);
      if (isMounted) {
        setIsLoadingProfile(false);
        setIsAuthInitialized(true);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
      if (profileTimer) clearTimeout(profileTimer);
      ++profileRequestId.current;
    };
  }, []); // Không phụ thuộc vào executeRecaptcha để tránh re-subscribe loop

  useEffect(() => {
    if (userProfile?.role === 'admin') {
      fetchAdminNewUsersCount();

      // A burst of profile writes (one per analysis) must not trigger a count
      // query per event; the Admin Users RPC uses the same debounce window.
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleCount = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void fetchAdminNewUsersCount();
        }, 1000);
      };

      const channel = supabase
        .channel('admin_new_users_count')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleCount)
        .subscribe();

      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase.removeChannel(channel);
      };
    }
  }, [userProfile]);

  // Refresh effectivePlan periodically so an expired plan is detected without
  // requiring a full page reload. Skipped for admins (always 'pro').
  useEffect(() => {
    if (!user || userProfile?.role === 'admin') return;

    let active = true;
    const refresh = async () => {
      const plan = await fetchEffectiveUserPlan(user.id);
      if (active && currentUserId.current === user.id) setEffectivePlan(plan);
    };

    const interval = setInterval(refresh, 5 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // getSession() proactively refreshes the token if it's near/past expiry —
        // guards against autoRefreshToken's timer missing while the tab was backgrounded.
        void supabase.auth.getSession().then(() => refresh());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
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
      const normalizedEmail = email.trim().toLowerCase();

      // Permanently deleted accounts must not come back: check the blocklist
      // before creating a new auth user (20261102100000_deleted_accounts.sql).
      // Fail open — a missing RPC/migration must never block normal signups.
      const { data: emailDeleted, error: blocklistError } = await supabase.rpc(
        'email_is_deleted_account',
        { p_email: normalizedEmail }
      );
      if (blocklistError) {
        console.error('Deleted-account check failed:', blocklistError);
      } else if (emailDeleted === true) {
        return { success: false, error: 'authAccountPermanentlyDeleted' };
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: displayName.trim() },
          emailRedirectTo: `${window.location.origin}`,
        },
      });

      if (error) {
        // Fallback when the pre-check above is skipped (e.g. a client calling
        // Supabase Auth directly): the before_user_created hook forwards this
        // message verbatim (see the same migration).
        if (error.message?.includes('ACCOUNT_DELETED')) {
          return { success: false, error: 'authAccountPermanentlyDeleted' };
        }
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

  const resendConfirmationEmail = async (email: string): Promise<EmailAuthResult> => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}`,
        },
      });

      if (error) {
        trackEvent('resend_confirmation_error', { method: 'email', error: error.message?.slice(0, 100) || 'unknown' });
        return { success: false, error: error.message };
      }

      trackEvent('resend_confirmation', { method: 'email' });
      return { success: true };
    } catch (err: unknown) {
      console.error('Resend confirmation error:', err);
      const message = err instanceof Error ? err.message : String(err);
      trackEvent('resend_confirmation_error', { method: 'email', error: message.slice(0, 100) || 'unknown' });
      return { success: false, error: message || 'authGenericError' };
    }
  };

  const refreshUserProfile = async () => {
    if (!user) return;
    setError(null);
    await loadUserProfileData(user);
  };

  // Re-read the caller's own profile when the tab regains focus and every
  // 5 minutes. This makes a demotion/promotion (or a lock) visible without a
  // full reload; server-side RLS/API guards remain authoritative.
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadUserProfileData(user);
    };
    const onFocus = () => void loadUserProfileData(user);
    window.addEventListener('focus', onFocus);
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [user]);

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      currentUserId.current = null;
      ++profileRequestId.current;
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
      isSupabaseConfigured,
      refreshUserProfile,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      signInWithEmail,
      signUpWithEmail,
      resetPasswordForEmail,
      resendConfirmationEmail,
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
