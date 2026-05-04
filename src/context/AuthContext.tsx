import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, signInWithRedirect, signInWithPopup, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { UserProfile, getUserProfile, createUserProfile, subscribeToAllUsers } from '../services/geminiService';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | React.ReactNode | null>(null);
  const [isAuthInitialized, setIsAuthInitialized] = useState(false);
  const [isRedirectChecked, setIsRedirectChecked] = useState(false);
  
  const { executeRecaptcha } = useGoogleReCaptcha();

  const loadUserProfileData = async (currentUser: User) => {
    setIsLoadingProfile(true);
    try {
      let profile = await getUserProfile(currentUser.uid);
      
      if (!profile) {
        let token = undefined;
        if (executeRecaptcha) {
          try {
            token = await executeRecaptcha('welcome_email');
          } catch (recaptchaErr) {
            console.error("Lỗi thực thi reCAPTCHA cho email chào mừng:", recaptchaErr);
          }
        }
        profile = await createUserProfile(currentUser, token);
      }
      setUserProfile(profile);
    } catch (err: any) {
      console.error("Lỗi khi tải thông tin người dùng:", err);
      setError("Không thể tải thông tin hồ sơ: " + err.message);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  useEffect(() => {
    let isRedirecting = false;

    const handleAuth = async () => {
      try {
        const result = await getRedirectResult(auth).catch(e => {
          console.warn("Lỗi kiểm tra Redirect Result:", e);
          return null;
        });

        setIsRedirectChecked(true);

        if (result && result.user) {
          isRedirecting = true;
          setUser(result.user);
        }
      } catch (err: any) {
        console.error("Lỗi nặng khi xử lý kết quả chuyển hướng:", err);
        setIsRedirectChecked(true);
        if (err.code === 'auth/unauthorized-domain') {
          setError('Lỗi tên miền: Tên miền hiện tại không được phép đăng nhập qua Firebase.');
        } else {
          setError("Lỗi đăng nhập: " + err.message);
        }
        setIsLoadingProfile(false);
      }

      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        
        if (isRedirecting) {
          isRedirecting = false;
        }

        if (currentUser) {
          await loadUserProfileData(currentUser);
        } else {
          setUserProfile(null);
          setIsLoadingProfile(false);
        }
        
        setIsAuthInitialized(true);
      });
      return unsubscribe;
    };

    const unsubscribePromise = handleAuth();
    return () => {
      unsubscribePromise.then(unsubscribe => unsubscribe && unsubscribe());
    };
  }, [executeRecaptcha]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (userProfile?.role === 'admin' || user?.email?.toLowerCase() === (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase()) {
      unsubscribe = subscribeToAllUsers(setAllUsers);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userProfile, user]);

  const login = async () => {
    try {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        await signInWithPopup(auth, googleProvider);
      } else {
        await signInWithRedirect(auth, googleProvider);
      }
    } catch (err: any) {
      console.error("Login Error:", err);
      setError("Lỗi đăng nhập: " + err.message);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
    } catch (err: any) {
      console.error("Logout Error:", err);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, userProfile, isLoadingProfile, allUsers, login, logout, error, setError, isAuthInitialized
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
