import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { confirmProPayment } from '../../services/paymentService';
import { fetchEffectiveUserPlan } from '../../services/userService';
import { isProPlan } from '../../lib/planLimits';

export function PaymentSuccessView() {
  const { user, refreshUserProfile } = useAuth();
  const { t, setActiveTab } = useUI();
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const orderCodeParam = new URLSearchParams(window.location.search).get('orderCode');
    const orderCode = orderCodeParam ? Number(orderCodeParam) : NaN;

    let attempts = 0;
    const maxAttempts = 20;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;

      if (Number.isFinite(orderCode)) {
        try {
          await confirmProPayment(orderCode);
        } catch (err) {
          console.warn('confirmProPayment:', err);
        }
      }

      await refreshUserProfile();
      const plan = await fetchEffectiveUserPlan(user.id);
      if (isProPlan(plan)) {
        setActivated(true);
        return;
      }
      if (attempts < maxAttempts) {
        window.setTimeout(() => void poll(), 2000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [user?.id, refreshUserProfile]);

  useEffect(() => {
    if (!activated) return;
    const timer = window.setTimeout(() => setActiveTab('analyze'), 4000);
    return () => window.clearTimeout(timer);
  }, [activated, setActiveTab]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-6">
      {activated ? (
        <CheckCircle2 className="size-16 text-success mx-auto" />
      ) : (
        <Loader2 className="size-16 text-accent animate-spin mx-auto" />
      )}
      <h1 className="text-2xl font-black text-text-main">{t.paymentSuccessTitle}</h1>
      <p className="text-text-muted">
        {activated ? t.paymentSuccessDone : t.paymentSuccessWaiting}
      </p>
      {!activated && (
        <p className="text-xs text-text-light">{t.paymentSuccessDesc}</p>
      )}
      <button
        type="button"
        onClick={() => setActiveTab('analyze')}
        className="text-sm font-bold text-accent cursor-pointer hover:underline"
      >
        {t.paymentBackToApp}
      </button>
    </div>
  );
}
