import { useUI } from '../../context/UIContext';
import { Skeleton } from '../ui/Skeleton';

export function PlanLimitValue({ value, isLoading }: { value?: number; isLoading: boolean }) {
  const { t } = useUI();
  if (value !== undefined) return <>{value}</>;
  return isLoading ? <Skeleton label={t.appLoadingContent} className="w-8" /> : <>—</>;
}

export function PublicPlanLimitsError({ retry }: { retry: () => void }) {
  const { t } = useUI();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-center gap-3 py-3 text-sm text-text-muted">
      <span>{t.appLimitsUnavailable}</span>
      <button type="button" onClick={retry}
        className="font-bold text-accent underline transition-transform cursor-pointer hover:scale-105 active:scale-95">
        {t.appRetry}
      </button>
    </div>
  );
}
