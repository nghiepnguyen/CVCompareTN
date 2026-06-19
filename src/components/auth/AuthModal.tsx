import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth, AuthModalMode } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { cn } from '../../lib/utils';

type TabMode = Extract<AuthModalMode, 'signIn' | 'signUp' | 'resetPassword'>;

interface FormErrors {
  email?: string;
  password?: string;
  name?: string;
}

// Mapping Supabase/result error codes to translation keys
const ERROR_KEY_MAP: Record<string, string> = {
  authInvalidCredentials: 'authInvalidCredentials',
  authEmailInUse: 'authEmailInUse',
  authEmailNotConfirmed: 'authEmailNotConfirmed',
};

function getErrorKey(resultError: string | undefined): string | null {
  if (!resultError) return null;
  // Direct match
  if (ERROR_KEY_MAP[resultError]) return ERROR_KEY_MAP[resultError];
  // Fallback: if it's a known translation key, return as-is
  if (resultError.startsWith('auth')) return resultError;
  // Raw error message
  return null;
}

function resolveError(resultError: string | undefined, fallback: string, t: Record<string, string>): string {
  const key = getErrorKey(resultError);
  if (key && t[key]) return t[key];
  // If resultError looks like a translation key, try to resolve it
  if (resultError && /^auth[A-Z]/.test(resultError) && t[resultError]) return t[resultError];
  return resultError || fallback;
}

function validateForm(
  mode: TabMode,
  email: string,
  password: string,
  name: string,
  t: Record<string, string>,
): FormErrors {
  const errors: FormErrors = {};

  if (!email.trim()) {
    errors.email = t.authInvalidEmail;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = t.authInvalidEmail;
  }

  if (mode === 'signUp' || mode === 'signIn') {
    if (!password) {
      errors.password = t.authWeakPassword;
    } else if (password.length < 6) {
      errors.password = t.authWeakPassword;
    }
  }

  if (mode === 'signUp' && !name.trim()) {
    errors.name = t.authNameRequired;
  }

  return errors;
}

export function AuthModal() {
  const {
    authModalMode,
    closeAuthModal,
    signInWithEmail,
    signUpWithEmail,
    resetPasswordForEmail,
    login,
  } = useAuth();
  const { t } = useUI();

  const [mode, setMode] = useState<TabMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Always open on signIn tab; resetPassword is a special deep-link case
  useEffect(() => {
    if (authModalMode) {
      setMode(authModalMode === 'resetPassword' ? 'resetPassword' : 'signIn');
    }
  }, [authModalMode]);

  // Reset state on open
  useEffect(() => {
    if (authModalMode) {
      setFormError(null);
      setFieldErrors({});
      setSuccessMessage(null);
      setEmail('');
      setPassword('');
      setName('');
      setShowPassword(false);
      setIsSubmitting(false);
      // Focus email input after open animation
      setTimeout(() => emailInputRef.current?.focus(), 200);
    }
  }, [authModalMode]);

  // Reset errors when switching mode
  useEffect(() => {
    setFormError(null);
    setFieldErrors({});
    setSuccessMessage(null);
  }, [mode]);

  const handleClose = () => {
    closeAuthModal();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    // Validate
    const errors = validateForm(mode, email, password, name, t as unknown as Record<string, string>);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signIn') {
        const result = await signInWithEmail(email, password);
        if (result.success) {
          handleClose();
        } else {
          const tk = t as unknown as Record<string, string>;
          setFormError(resolveError(result.error, tk.authGenericError, tk));
        }
      } else if (mode === 'signUp') {
        const result = await signUpWithEmail(email, password, name);
        const tk = t as unknown as Record<string, string>;
        if (result.success) {
          if (result.checkEmail) {
            setSuccessMessage(`${tk.authSignUpSuccess} ${tk.authSignUpSuccessDesc}`);
          } else {
            handleClose();
          }
        } else {
          setFormError(resolveError(result.error, tk.authGenericError, tk));
        }
      } else if (mode === 'resetPassword') {
        const result = await resetPasswordForEmail(email);
        const tk = t as unknown as Record<string, string>;
        if (result.success) {
          setSuccessMessage(tk.authResetPasswordSuccess);
        } else {
          setFormError(resolveError(result.error, tk.authGenericError, tk));
        }
      }
    } catch {
      setFormError((t as unknown as Record<string, string>).authGenericError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    await login();
  };

  const switchMode = (newMode: TabMode) => {
    setMode(newMode);
    setEmail('');
    setPassword('');
    setName('');
    setShowPassword(false);
  };

  return (
    <AnimatePresence>
      {authModalMode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleOverlayClick}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full max-w-md bg-primary-light/95 backdrop-blur-2xl border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Tab Switcher */}
            <div className="flex items-center gap-1 dark:bg-white/[0.02] bg-surface-muted p-1 m-4 rounded-xl">
              <button
                type="button"
                onClick={() => switchMode('signIn')}
                className={cn(
                  'flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer',
                  mode === 'signIn'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-main',
                )}
              >
                {(t as unknown as Record<string, string>).authSignInTitle}
              </button>
              <button
                type="button"
                onClick={() => switchMode('signUp')}
                className={cn(
                  'flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer',
                  mode === 'signUp'
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-text-main',
                )}
              >
                {(t as unknown as Record<string, string>).authSignUpTitle}
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pb-6">
              {successMessage ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center text-center py-8"
                >
                  <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                    <Mail className="w-7 h-7 text-accent" />
                  </div>
                  <p className="text-sm font-bold text-text-main leading-relaxed">{successMessage}</p>
                  {mode === 'resetPassword' && (
                    <button
                      type="button"
                      onClick={() => switchMode('signIn')}
                      className="mt-4 text-sm font-bold text-accent hover:text-accent-hover transition-colors cursor-pointer hover:scale-105 active:scale-95"
                    >
                      {(t as unknown as Record<string, string>).authBackToSignIn}
                    </button>
                  )}
                </motion.div>
              ) : (
                <>
                  {/* Form Error Banner */}
                  <AnimatePresence>
                    {formError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 flex items-start gap-2.5 bg-error/10 border border-error/20 rounded-xl p-3"
                      >
                        <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-error leading-relaxed">{formError}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleSubmit} noValidate>
                    {/* Name field (sign up only) */}
                    {mode === 'signUp' && (
                      <div className="mb-4">
                        <label
                          htmlFor="auth-name"
                          className="block text-xs font-black text-text-muted uppercase tracking-widest mb-1.5"
                        >
                          {(t as unknown as Record<string, string>).authNameLabel}
                        </label>
                        <div className="relative">
                          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
                          <input
                            ref={mode === 'signUp' ? emailInputRef : undefined}
                            id="auth-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={(t as unknown as Record<string, string>).authNamePlaceholder}
                            autoComplete="name"
                            className={cn(
                              'w-full pl-10 pr-4 py-3 dark:bg-white/[0.03] bg-surface-secondary border rounded-xl text-sm font-bold text-text-main placeholder:text-text-light/50 outline-none transition-all',
                              fieldErrors.name
                                ? 'border-error/50 focus:border-error focus:ring-2 focus:ring-error/20'
                                : 'border-border focus:border-accent/50 focus:ring-2 focus:ring-accent/20',
                            )}
                          />
                        </div>
                        {fieldErrors.name && (
                          <p className="mt-1.5 text-xs font-bold text-error">{fieldErrors.name}</p>
                        )}
                      </div>
                    )}

                    {/* Email */}
                    <div className="mb-4">
                      <label
                        htmlFor="auth-email"
                        className="block text-xs font-black text-text-muted uppercase tracking-widest mb-1.5"
                      >
                        {(t as unknown as Record<string, string>).authEmailLabel}
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
                        <input
                          ref={mode !== 'signUp' ? emailInputRef : undefined}
                          id="auth-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={(t as unknown as Record<string, string>).emailPlaceholder}
                          autoComplete="email"
                          className={cn(
                            'w-full pl-10 pr-4 py-3 dark:bg-white/[0.03] bg-surface-secondary border rounded-xl text-sm font-bold text-text-main placeholder:text-text-light/50 outline-none transition-all',
                            fieldErrors.email
                              ? 'border-error/50 focus:border-error focus:ring-2 focus:ring-error/20'
                              : 'border-border focus:border-accent/50 focus:ring-2 focus:ring-accent/20',
                          )}
                        />
                      </div>
                      {fieldErrors.email && (
                        <p className="mt-1.5 text-xs font-bold text-error">{fieldErrors.email}</p>
                      )}
                    </div>

                    {/* Password (not for resetPassword) */}
                    {mode !== 'resetPassword' && (
                      <div className="mb-4">
                        <label
                          htmlFor="auth-password"
                          className="block text-xs font-black text-text-muted uppercase tracking-widest mb-1.5"
                        >
                          {(t as unknown as Record<string, string>).authPasswordLabel}
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light pointer-events-none" />
                          <input
                            id="auth-password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                            className={cn(
                              'w-full pl-10 pr-12 py-3 dark:bg-white/[0.03] bg-surface-secondary border rounded-xl text-sm font-bold text-text-main placeholder:text-text-light/50 outline-none transition-all',
                              fieldErrors.password
                                ? 'border-error/50 focus:border-error focus:ring-2 focus:ring-error/20'
                                : 'border-border focus:border-accent/50 focus:ring-2 focus:ring-accent/20',
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-light hover:text-text-muted transition-colors cursor-pointer p-1 rounded-lg dark:hover:bg-white/[0.04] hover:bg-surface-secondary"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {fieldErrors.password && (
                          <p className="mt-1.5 text-xs font-bold text-error">{fieldErrors.password}</p>
                        )}
                      </div>
                    )}

                    {/* Forgot password link (sign in only) */}
                    {mode === 'signIn' && (
                      <button
                        type="button"
                        onClick={() => switchMode('resetPassword')}
                        className="text-xs font-bold text-text-light hover:text-accent transition-colors cursor-pointer mb-4"
                      >
                        {(t as unknown as Record<string, string>).authForgotPassword}
                      </button>
                    )}

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        'w-full py-3 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 mb-4',
                        isSubmitting
                          ? 'bg-accent/50 text-white/50 cursor-not-allowed'
                          : 'bg-accent text-white hover:bg-accent-hover hover:scale-[1.02] active:scale-[0.98]',
                      )}
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isSubmitting
                        ? mode === 'signIn'
                          ? (t as unknown as Record<string, string>).authSignInBtnLoading
                          : mode === 'signUp'
                            ? (t as unknown as Record<string, string>).authSignUpBtnLoading
                            : (t as unknown as Record<string, string>).authResetPasswordBtnLoading
                        : mode === 'signIn'
                          ? (t as unknown as Record<string, string>).authSignInBtn
                          : mode === 'signUp'
                            ? (t as unknown as Record<string, string>).authSignUpBtn
                            : (t as unknown as Record<string, string>).authResetPasswordBtn}
                    </button>
                  </form>

                  {/* Divider */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px dark:bg-white/[0.06] bg-border" />
                    <span className="text-[10px] font-black text-text-light uppercase tracking-widest">
                      {(t as unknown as Record<string, string>).authDivider}
                    </span>
                    <div className="flex-1 h-px dark:bg-white/[0.06] bg-border" />
                  </div>

                  {/* Google OAuth */}
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-3 py-3 dark:bg-white/[0.03] bg-surface-muted border border-border rounded-xl text-sm font-bold text-text-main dark:hover:bg-white/[0.06] hover:bg-surface-secondary dark:hover:border-white/[0.12] transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    {(t as unknown as Record<string, string>).authGoogleBtn}
                  </button>

                  {/* Switch mode link */}
                  <p className="text-center mt-5">
                    <button
                      type="button"
                      onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
                      className="text-xs font-bold text-text-light hover:text-accent transition-colors cursor-pointer"
                    >
                      {mode === 'signIn'
                        ? (t as unknown as Record<string, string>).authSwitchToSignUp
                        : (t as unknown as Record<string, string>).authSwitchToSignIn}
                    </button>
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}