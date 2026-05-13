import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, signInWithRedirect, signInWithPopup, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
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
      console.log("AuthProvider: Khởi tạo Firebase Auth...");
      
      // 1. Setup onAuthStateChanged immediately
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        console.log("AuthProvider: onAuthStateChanged fired. User:", currentUser?.email || 'Guest');
        setUser(currentUser);
        
        if (currentUser) {
          loadUserProfileData(currentUser);
        } else {
          setUserProfile(null);
          setIsLoadingProfile(false);
        }
        
        setIsAuthInitialized(true);
      }, (err) => {
        console.error("AuthProvider: onAuthStateChanged error:", err);
        setIsAuthInitialized(true);
        setError("Lỗi kết nối Firebase: " + err.message);
      });

      // 2. Fallback timeout to prevent stuck screen
      const timeoutId = setTimeout(() => {
        if (!isAuthInitialized) {
          console.warn("AuthProvider: Initialization timeout reached. Forcing true.");
          setIsAuthInitialized(true);
        }
      }, 8000);

      // 3. Handle redirect result
      try {
        console.log("AuthProvider: Đang kiểm tra Redirect Result...");
        const result = await getRedirectResult(auth).catch(e => {
          console.warn("Lỗi kiểm tra Redirect Result:", e);
          return null;
        });

        setIsRedirectChecked(true);

        if (result && result.user) {
          console.log("AuthProvider: Đăng nhập thành công qua redirect:", result.user.email);
          setUser(result.user);
        }
      } catch (err: any) {
        console.error("Lỗi nặng khi xử lý kết quả chuyển hướng:", err);
        setIsRedirectChecked(true);
        if (err.code === 'auth/unauthorized-domain') {
          setError('Lỗi tên miền: Tên miền hiện tại không được phép đăng nhập qua Firebase. Vui lòng thêm domain này vào Authorized Domains trong Firebase Console.');
        } else {
          setError("Lỗi đăng nhập: " + err.message);
        }
        setIsLoadingProfile(false);
        setIsAuthInitialized(true); // Ensure we don't get stuck
      }

      return () => {
        clearTimeout(timeoutId);
        unsubscribe();
      };
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
      console.log("AuthProvider: Bắt đầu đăng nhập với Popup...");
      await signInWithPopup(auth, googleProvider);
      console.log("AuthProvider: Đăng nhập thành công!");
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'auth/unauthorized-domain') {
        setError('Lỗi tên miền: Tên miền hiện tại không được phép đăng nhập qua Firebase. Vui lòng thêm ' + window.location.hostname + ' vào Authorized Domains trong Firebase Console.');
      } else {
        setError("Lỗi đăng nhập: " + err.message);
      }
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
