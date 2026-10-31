import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, BarChart3, Search, UserPlus, Check, User as UserIcon, UserCog, UserCheck, UserCheck2, UserX, Trash2, Loader2, CheckCircle2, HelpCircle, ShieldCheck, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Activity, Crown, Briefcase, AlertCircle, X, ClipboardList, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatLabel } from '../../translations';
import { cn } from '../../lib/utils';
import { UserAvatar } from '../ui/UserAvatar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { supabase } from '../../lib/supabase';
import {
  getDefaultMonthlyAnalyticsLimit,
  updateDefaultMonthlyAnalyticsLimit,
} from '../../services/appSettingsService';
import {
  markUserAsRead,
  updateUserRole,
  updateUserPermission,
  resolveEffectiveMonthlyAnalyticsLimit,
  adminUpdateUser,
  adminBulkUpdateUsers,
  fetchAdminUsersPage,
  type AdminBulkAction,
  adminPlanSelectValue,
  getDisplayEffectivePlan,
  deleteUser,
  type AdminPlanGrant,
  type UserProfile,
} from '../../services/userService';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { AdminReportTab } from './AdminReportTab';
import { AdminAuditTab } from './AdminAuditTab';
import { VN_TIME_ZONE } from '../../lib/vnTime';
import { csvDateStamp, downloadCsv } from '../../lib/csv';
import { logAdminExport } from '../../services/adminExportService';

const toErrorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

type AdminSection = 'users' | 'report' | 'audit';

function adminSectionFromPath(): AdminSection {
  const match = window.location.pathname.match(/\/admin\/(users|report|audit)(?:\/|$)/);
  return (match?.[1] as AdminSection | undefined) ?? 'users';
}

type AdminUserFilters = {
  q: string;
  plan: 'all' | 'free' | 'pro' | 'recruiter';
  role: 'all' | 'user' | 'admin';
  status: 'all' | 'active' | 'locked';
  flag: 'all' | 'new' | 'expiring';
  sort: 'created_desc' | 'created_asc' | 'usage_desc' | 'name_asc' | 'expiry_asc';
  page: number;
};

function adminFiltersFromSearch(): AdminUserFilters {
  const params = new URLSearchParams(window.location.search);
  const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  const page = Number(params.get('page'));
  return {
    q: params.get('q') ?? '',
    plan: pick(params.get('plan'), ['all', 'free', 'pro', 'recruiter'] as const, 'all'),
    role: pick(params.get('role'), ['all', 'user', 'admin'] as const, 'all'),
    status: pick(params.get('status'), ['all', 'active', 'locked'] as const, 'all'),
    flag: pick(params.get('flag'), ['all', 'new', 'expiring'] as const, 'all'),
    sort: pick(
      params.get('sort'),
      ['created_desc', 'created_asc', 'usage_desc', 'name_asc', 'expiry_asc'] as const,
      'created_desc'
    ),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function AdminView() {
  const { user, userProfile } = useAuth();
  const { t, reportLanguage } = useUI();
  const dateLocale = reportLanguage === 'vi' ? 'vi-VN' : 'en-US';

  const [adminSubTab, setAdminSubTabState] = useState<AdminSection>(adminSectionFromPath);
  const [initialFilters] = useState(adminFiltersFromSearch);
  const [searchInput, setSearchInput] = useState(initialFilters.q);
  const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.q);
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'pro' | 'recruiter'>(initialFilters.plan);
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>(initialFilters.role);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'locked'>(initialFilters.status);
  const [quickFilter, setQuickFilter] = useState<'all' | 'new' | 'expiring'>(initialFilters.flag);
  const [sort, setSort] = useState<
    'created_desc' | 'created_asc' | 'usage_desc' | 'name_asc' | 'expiry_asc'
  >(initialFilters.sort);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingPlanUserId, setSavingPlanUserId] = useState<string | null>(null);
  const savingPlanRef = useRef(false);
  const planDialogRef = useRef<HTMLDivElement>(null);
  const [globalDefaultLimit, setGlobalDefaultLimit] = useState(5);
  const [isGlobalLimitLoaded, setIsGlobalLimitLoaded] = useState(false);
  const [globalLimitError, setGlobalLimitError] = useState<string | null>(null);
  const [globalLimitDraft, setGlobalLimitDraft] = useState('5');
  const [isSavingGlobalLimit, setIsSavingGlobalLimit] = useState(false);
  const [globalLimitMessage, setGlobalLimitMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialFilters.page);
  const [planModal, setPlanModal] = useState<{
    user: UserProfile;
    grant: AdminPlanGrant;
    limitMode: 'inherit' | 'custom';
    limitDraft: string;
    requestId: string;
  } | null>(null);
  const pageSize = 20;

  const [confirmState, setConfirmState] = useState<
    | { kind: 'delete'; user: UserProfile }
    | { kind: 'role'; user: UserProfile; nextRole: 'admin' | 'user' }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const {
    users: allUsers,
    isLoading: isLoadingUsers,
    totalCount,
    newUsersCount,
    newUsers,
    error: usersError,
    refresh: refreshUsers,
    applyUser,
    removeUser,
  } = useAdminUsers({
    search: debouncedSearch,
    plan: planFilter,
    role: roleFilter,
    status: statusFilter,
    flag: quickFilter,
    sort,
    page: currentPage,
    pageSize,
  });

  // Search is the only free-text filter; debounce it so typing doesn't fire one
  // RPC per keystroke. Other filters reset to page 1 immediately.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchInput, planFilter, roleFilter, statusFilter, quickFilter, sort]);

  const totalPages = Math.max(1, Math.ceil((totalCount ?? 0) / pageSize));

  // Realtime refreshes/deletes can shrink the list under the current page —
  // clamp so the table never lands on an empty page past the end.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setSelectedIds([]);
  }, [currentPage, debouncedSearch, planFilter, roleFilter, statusFilter, quickFilter, sort]);

  const setAdminSubTab = (next: AdminSection) => {
    setAdminSubTabState(next);
    const prefix = reportLanguage === 'en' ? '/en' : '/vi';
    const nextPath = `${prefix}/admin/${next}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath + window.location.search + window.location.hash);
    }
  };

  useEffect(() => {
    const onPopState = () => {
      setAdminSubTabState(adminSectionFromPath());
      const filters = adminFiltersFromSearch();
      setSearchInput(filters.q);
      setDebouncedSearch(filters.q);
      setPlanFilter(filters.plan);
      setRoleFilter(filters.role);
      setStatusFilter(filters.status);
      setQuickFilter(filters.flag);
      setSort(filters.sort);
      setCurrentPage(filters.page);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Keep the Users filters/page shareable. replaceState avoids one history entry
  // per keystroke; back/forward still restores because popstate re-parses.
  useEffect(() => {
    if (adminSubTab !== 'users') return;
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set('q', searchInput.trim());
    if (planFilter !== 'all') params.set('plan', planFilter);
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (quickFilter !== 'all') params.set('flag', quickFilter);
    if (sort !== 'created_desc') params.set('sort', sort);
    if (currentPage > 1) params.set('page', String(currentPage));

    const prefix = reportLanguage === 'en' ? '/en' : '/vi';
    const qs = params.toString();
    const next = `${prefix}/admin/users${qs ? `?${qs}` : ''}`;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState(null, '', next + window.location.hash);
    }
  }, [
    adminSubTab,
    searchInput,
    planFilter,
    roleFilter,
    statusFilter,
    quickFilter,
    sort,
    currentPage,
    reportLanguage,
  ]);

  const loadGlobalDefaultLimit = useCallback(async () => {
    setGlobalLimitError(null);
    setGlobalLimitMessage(null);
    try {
      const value = await getDefaultMonthlyAnalyticsLimit();
      setGlobalDefaultLimit(value);
      setGlobalLimitDraft(String(value));
      setIsGlobalLimitLoaded(true);
    } catch (err: unknown) {
      // Never let a failed load leave the input showing a stale default: saving
      // it would overwrite the real setting with the hardcoded fallback.
      console.error('Failed to load global analytics limit:', err);
      setIsGlobalLimitLoaded(false);
      setGlobalLimitError(toErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (adminSubTab === 'users') {
      void loadGlobalDefaultLimit();
    }
  }, [adminSubTab, loadGlobalDefaultLimit]);

  const formatUsageLimit = (u: UserProfile) => {
    // A free user without a custom limit inherits the global setting. While that
    // setting is still loading (or failed), don't display a made-up fallback.
    if (!u.monthlyAnalyticsLimitCustom && getDisplayEffectivePlan(u) === 'free' && !isGlobalLimitLoaded) {
      return '—';
    }
    const effective = resolveEffectiveMonthlyAnalyticsLimit(u, globalDefaultLimit);
    const limitLabel = effective === null ? t.adminAnalyticsUnlimited : String(effective);
    return formatLabel(t.adminAnalyticsUsedOfLimit, {
      used: String(u.effectiveUsageCount),
      limit: limitLabel,
    });
  };

  const handleSaveGlobalDefaultLimit = async () => {
    if (!isGlobalLimitLoaded) {
      setError(t.adminGlobalAnalyticsLoadError);
      return;
    }
    const raw = globalLimitDraft.trim();
    const parsed = Number(raw);
    if (raw === '' || !Number.isInteger(parsed) || parsed < 0) {
      setError(t.adminInvalidAnalyticsLimit);
      return;
    }
    setIsSavingGlobalLimit(true);
    setError(null);
    setGlobalLimitMessage(null);
    try {
      await updateDefaultMonthlyAnalyticsLimit(parsed);
      setGlobalDefaultLimit(parsed);
      setGlobalLimitMessage(t.adminGlobalAnalyticsSaved);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setIsSavingGlobalLimit(false);
    }
  };

  useFocusTrap(planModal !== null, planDialogRef, () => {
    if (!savingPlanRef.current) {
      setError(null);
      setPlanModal(null);
    }
  });

  const handleSavePlanModal = async () => {
    if (!planModal || savingPlanRef.current) return;
    const { user: target, limitDraft, grant, limitMode } = planModal;

    const planChanged = grant !== adminPlanSelectValue(target);
    let nextLimitMode: 'keep' | 'inherit' | 'custom' = 'keep';
    let nextLimit: number | null = null;

    if (limitMode === 'inherit') {
      if (target.monthlyAnalyticsLimitCustom) nextLimitMode = 'inherit';
    } else {
      const raw = limitDraft.trim();
      const limit = Number(raw);
      if (raw === '' || !Number.isInteger(limit) || limit < 0) {
        setError(t.adminInvalidAnalyticsLimit);
        return;
      }
      const limitChanged =
        !target.monthlyAnalyticsLimitCustom || target.monthlyAnalyticsLimit !== limit;
      if (limitChanged) {
        nextLimitMode = 'custom';
        nextLimit = limit;
      }
    }

    if (!planChanged && nextLimitMode === 'keep') {
      setPlanModal(null);
      return;
    }

    savingPlanRef.current = true;
    setSavingPlanUserId(target.id);
    setError(null);
    try {
      await adminUpdateUser(target.id, {
        requestId: planModal.requestId,
        plan: planChanged ? grant : null,
        limitMode: nextLimitMode,
        limit: nextLimit,
      });
      setToast({ type: 'success', message: t.adminToastSaved });
      setPlanModal(null);
    } catch (err: unknown) {
      setError(formatLabel(t.adminPlanChangeError, { message: toErrorMessage(err) }));
    } finally {
      savingPlanRef.current = false;
      setSavingPlanUserId(null);
    }
  };

  const handleToggleRole = (u: UserProfile) => {
    setConfirmState({ kind: 'role', user: u, nextRole: u.role === 'admin' ? 'user' : 'admin' });
  };

  const handleTogglePermission = async (u: UserProfile) => {
    const next = !u.hasPermission;
    setError(null);
    // Optimistic: lock/unlock is reversible and the server response is a single
    // boolean update; a failed call refreshes the row back from the DB.
    applyUser(u.id, { hasPermission: next });
    try {
      await updateUserPermission(u.id, next);
      setToast({ type: 'success', message: next ? t.adminToastLocked : t.adminToastUnlocked });
    } catch (err: unknown) {
      setError(toErrorMessage(err));
      void refreshUsers();
    }
  };

  const handleDeleteUser = (u: UserProfile) => {
    setConfirmState({ kind: 'delete', user: u });
  };

  const handleConfirm = async () => {
    if (!confirmState || confirmBusy) return;
    setConfirmBusy(true);
    setError(null);
    try {
      if (confirmState.kind === 'role') {
        await updateUserRole(confirmState.user.id, confirmState.nextRole);
        applyUser(confirmState.user.id, { role: confirmState.nextRole });
        setToast({ type: 'success', message: t.adminToastRoleUpdated });
      } else {
        setDeletingUserId(confirmState.user.id);
        await deleteUser(confirmState.user.id);
        removeUser(confirmState.user.id);
        setToast({ type: 'success', message: t.adminToastDeleted });
      }
      setConfirmState(null);
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      setError(message);
      setToast({ type: 'error', message });
    } finally {
      setConfirmBusy(false);
      setDeletingUserId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectableIds = allUsers
    .filter((u) => u.role !== 'admin' && u.id !== user?.id)
    .map((u) => u.id);
  const allPageSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    setSelectedIds(allPageSelected ? [] : selectableIds);
  };

  const handleBulkAction = async (action: AdminBulkAction) => {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setError(null);
    try {
      const count = await adminBulkUpdateUsers(selectedIds, action);
      setToast({
        type: 'success',
        message: formatLabel(t.adminToastBulkDone, { count: String(count) }),
      });
      setSelectedIds([]);
      await refreshUsers();
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExportUsers = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setError(null);
    try {
      const query = {
        search: debouncedSearch,
        plan: planFilter,
        role: roleFilter,
        status: statusFilter,
        flag: quickFilter,
        sort,
        pageSize: 100,
      };
      const rows: UserProfile[] = [];
      let total = 0;
      for (let page = 1; page <= 10; page += 1) {
        const result = await fetchAdminUsersPage({ ...query, page });
        total = result.total;
        rows.push(...result.rows);
        if (rows.length >= total || result.rows.length < 100) break;
      }

      if (total > 1000) {
        setError(formatLabel(t.adminExportTooMany, { max: '1000', count: String(total) }));
        return;
      }

      await logAdminExport('users', rows.length, {
        search: debouncedSearch,
        plan: planFilter,
        role: roleFilter,
        status: statusFilter,
        sort,
      });
      downloadCsv(`admin-users-${csvDateStamp()}.csv`, [
        ['id', 'email', 'display_name', 'role', 'plan', 'active', 'used', 'limit_custom', 'limit', 'created_at'],
        ...rows.map((u) => [
          u.id,
          u.email,
          u.displayName,
          u.role,
          getDisplayEffectivePlan(u),
          u.role === 'admin' || u.hasPermission ? 'true' : 'false',
          u.effectiveUsageCount,
          u.monthlyAnalyticsLimitCustom ? 'true' : 'false',
          u.monthlyAnalyticsLimit ?? '',
          u.createdAt,
        ]),
      ]);
      setToast({ type: 'success', message: t.adminToastExported });
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-border pb-8">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-accent font-black text-[10px] uppercase tracking-[0.2em]">
            <ShieldCheck className="w-4 h-4" />
            {t.adminSystemControl}
          </div>
          <h1 className="text-4xl font-black text-text-main tracking-tight">{t.adminPageTitle}</h1>
          <p className="text-text-muted text-sm max-w-md">{t.adminPageDesc}</p>
        </div>

        <div className="flex items-center bg-surface-secondary p-1 rounded-xl border border-border">
          <button 
            onClick={() => setAdminSubTab('users')}
            className={cn(
              "px-5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95",
              adminSubTab === 'users' ? "bg-surface text-accent shadow-sm border border-border" : "text-text-muted hover:text-text-main"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            {t.adminTabUsers}
          </button>
          <button
            onClick={() => setAdminSubTab('report')}
            className={cn(
              "px-5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95",
              adminSubTab === 'report' ? "bg-surface text-accent shadow-sm border border-border" : "text-text-muted hover:text-text-main"
            )}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            {t.adminTabReport}
          </button>
          <button
            onClick={() => setAdminSubTab('audit')}
            className={cn(
              "px-5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95",
              adminSubTab === 'audit' ? "bg-surface text-accent shadow-sm border border-border" : "text-text-muted hover:text-text-main"
            )}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            {t.adminTabAudit}
          </button>
        </div>
      </div>

      {adminSubTab === 'users' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {error && !planModal && (
            <div role="alert" className="p-4 rounded-xl border bg-error-light border-error/10 text-error flex items-center gap-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label={t.adminDismissError}
                className="p-1 rounded-md cursor-pointer hover:scale-105 active:scale-95 transition-transform"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {/* Quick Stats / New Users */}
          <AnimatePresence>
            {newUsersCount > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-accent rounded-2xl p-1 shadow-xl shadow-accent-light overflow-hidden"
              >
                <div className="bg-white/5 backdrop-blur-sm p-6 rounded-[14px]">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-surface rounded-xl flex items-center justify-center shadow-sm">
                        <UserPlus className="w-6 h-6 text-accent" />
                      </div>
                      <div>
                        <h3 className="font-black text-white text-lg">{formatLabel(t.adminNewProfilesTitle, { count: newUsersCount })}</h3>
                        <p className="text-accent-light text-[10px] uppercase font-bold tracking-wider opacity-80 underline underline-offset-4">{t.adminNewProfilesSubtitle}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {newUsers.map(u => (
                      <div key={u.id} className="group bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 transition-all cursor-default">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <UserAvatar
                            src={u.photoURL}
                            imgClassName="w-8 h-8 rounded-lg border border-white/20"
                            fallbackClassName="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center text-text-light border border-white/10"
                          >
                            <UserIcon className="w-4 h-4" />
                          </UserAvatar>
                          <div className="overflow-hidden">
                            <div className="text-xs font-black text-white truncate">{u.displayName || t.adminGuest}</div>
                            <div className="text-[9px] text-accent-light/60 truncate font-mono">{u.email}</div>
                          </div>
                        </div>
                        <button 
                          onClick={async (e) => {
                            const btn = e.currentTarget;
                            btn.disabled = true;
                            btn.style.opacity = '0.5';
                            try {
                              await markUserAsRead(u.id);
                              await refreshUsers();
                            } catch (err: unknown) {
                              alert(formatLabel(t.adminMarkReadError, { message: err instanceof Error ? err.message : String(err) }));
                            } finally {
                              btn.disabled = false;
                              btn.style.opacity = '1';
                            }
                          }}
                          className="p-1.5 bg-surface text-accent rounded-lg hover:scale-110 active:scale-90 transition-all shadow-lg disabled:cursor-not-allowed"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-surface border-2 border-border rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1 max-w-lg">
                <h3 className="text-sm font-black text-text-main uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-accent" />
                  {t.adminGlobalAnalyticsTitle}
                </h3>
                <p className="text-xs text-text-muted">{t.adminGlobalAnalyticsDesc}</p>
                {globalLimitError && !isGlobalLimitLoaded && (
                  <div role="alert" className="flex items-center gap-2 text-xs font-bold text-error">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1" title={globalLimitError}>
                      {t.adminGlobalAnalyticsLoadError}
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadGlobalDefaultLimit()}
                      className="rounded-md border border-error/30 px-2 py-1 text-[10px] font-black uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95"
                    >
                      {t.adminRetry}
                    </button>
                  </div>
                )}
                {globalLimitMessage && (
                  <p className="text-xs font-bold text-success flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {globalLimitMessage}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={globalLimitDraft}
                  onChange={(e) => setGlobalLimitDraft(e.target.value)}
                  disabled={!isGlobalLimitLoaded || isSavingGlobalLimit}
                  className="w-24 px-3 py-2 text-sm font-mono border-2 border-border rounded-xl bg-surface focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={t.adminGlobalAnalyticsTitle}
                />
                <button
                  type="button"
                  onClick={() => void handleSaveGlobalDefaultLimit()}
                  disabled={!isGlobalLimitLoaded || isSavingGlobalLimit}
                  className="px-4 py-2 bg-accent text-white text-xs font-black uppercase tracking-wider rounded-xl hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSavingGlobalLimit ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {t.adminGlobalAnalyticsSave}
                </button>
              </div>
            </div>
          </div>

          {/* Users Table Controls */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <h3 className="text-xl font-black text-text-main flex items-center gap-2">
                <Activity className="w-5 h-5 text-accent" />
                {t.adminDirectoryTitle}
              </h3>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => void handleExportUsers()}
                  disabled={exportBusy}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-[10px] font-black uppercase tracking-wider text-text-muted cursor-pointer hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {t.adminExportUsersCsv}
                </button>
                <div className="relative w-full sm:w-72 group">
                {isLoadingUsers ? (
                  <Loader2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light animate-spin" />
                ) : (
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light group-focus-within:text-accent transition-colors" />
                )}
                <input
                  type="text"
                  placeholder={t.adminSearchPlaceholder}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface border-2 border-border rounded-xl text-sm font-medium focus:border-accent focus:ring-0 transition-all outline-none text-text-main"
                />
                </div>
              </div>
            </div>

            {/* Filter Row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-text-light uppercase tracking-widest">
                  {t.adminQuickFilterLabel}
                </span>
                <div className="flex items-center bg-surface-secondary rounded-lg p-0.5 border border-border">
                  {(['all', 'new', 'expiring'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setQuickFilter(opt)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all cursor-pointer',
                        quickFilter === opt
                          ? 'bg-surface text-accent shadow-sm border border-border'
                          : 'text-text-muted hover:text-text-main'
                      )}
                    >
                      {opt === 'all'
                        ? t.adminQuickFilterAll
                        : opt === 'new'
                          ? t.adminQuickFilterNew
                          : t.adminQuickFilterExpiring}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-text-light uppercase tracking-widest">
                  {t.adminFilterPlan}
                </span>
                <div className="flex items-center bg-surface-secondary rounded-lg p-0.5 border border-border">
                  {(['all', 'free', 'pro', 'recruiter'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setPlanFilter(opt)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all cursor-pointer',
                        planFilter === opt
                          ? 'bg-surface text-accent shadow-sm border border-border'
                          : 'text-text-muted hover:text-text-main'
                      )}
                    >
                      {opt === 'all'
                        ? t.adminFilterPlanAll
                        : opt === 'free'
                          ? t.adminFilterPlanFree
                          : opt === 'pro'
                            ? t.adminFilterPlanPro
                            : t.adminFilterPlanRecruiter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-text-light uppercase tracking-widest">
                  {t.adminFilterRole}
                </span>
                <div className="flex items-center bg-surface-secondary rounded-lg p-0.5 border border-border">
                  {(['all', 'user', 'admin'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setRoleFilter(opt)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all cursor-pointer',
                        roleFilter === opt
                          ? 'bg-surface text-accent shadow-sm border border-border'
                          : 'text-text-muted hover:text-text-main'
                      )}
                    >
                      {opt === 'all'
                        ? t.adminFilterRoleAll
                        : opt === 'user'
                          ? t.adminFilterRoleUser
                          : t.adminFilterRoleAdmin}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-text-light uppercase tracking-widest">
                  {t.adminFilterStatus}
                </span>
                <div className="flex items-center bg-surface-secondary rounded-lg p-0.5 border border-border">
                  {(['all', 'active', 'locked'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setStatusFilter(opt)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-all cursor-pointer',
                        statusFilter === opt
                          ? 'bg-surface text-accent shadow-sm border border-border'
                          : 'text-text-muted hover:text-text-main'
                      )}
                    >
                      {opt === 'all'
                        ? t.adminFilterStatusAll
                        : opt === 'active'
                          ? t.adminFilterStatusActive
                          : t.adminFilterStatusLocked}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2">
                <span className="text-[10px] font-black text-text-light uppercase tracking-widest">
                  {t.adminSortLabel}
                </span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="rounded-lg border border-border bg-surface-secondary px-2 py-1.5 text-[11px] font-bold text-text-main cursor-pointer"
                >
                  <option value="created_desc">{t.adminSortCreatedDesc}</option>
                  <option value="created_asc">{t.adminSortCreatedAsc}</option>
                  <option value="usage_desc">{t.adminSortUsageDesc}</option>
                  <option value="name_asc">{t.adminSortNameAsc}</option>
                  <option value="expiry_asc">{t.adminSortExpiryAsc}</option>
                </select>
              </label>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/20 bg-accent-light/40 p-3">
              <span className="mr-2 text-xs font-black text-text-main">
                {formatLabel(t.adminBulkSelected, { count: String(selectedIds.length) })}
              </span>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulkAction('mark_read')}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-text-main cursor-pointer hover:border-accent/40 disabled:opacity-50"
              >
                {t.adminBulkMarkRead}
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulkAction('lock')}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-warning cursor-pointer hover:border-warning/40 disabled:opacity-50"
              >
                {t.adminBulkLock}
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulkAction('unlock')}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-success cursor-pointer hover:border-success/40 disabled:opacity-50"
              >
                {t.adminBulkUnlock}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-text-muted cursor-pointer hover:text-text-main"
              >
                {t.adminBulkClear}
              </button>
            </div>
          )}

          {usersError && allUsers.length > 0 && (
            <div role="alert" className="flex items-center gap-3 rounded-xl border border-error/10 bg-error-light p-4 text-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-xs font-bold">
                {formatLabel(t.adminUsersLoadError, { message: usersError })}
              </span>
              <button
                type="button"
                onClick={() => void refreshUsers()}
                className="rounded-lg border border-error/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95"
              >
                {t.adminRetry}
              </button>
            </div>
          )}

          {/* Precision Table */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-secondary/50 border-b border-border">
                    <th scope="col" className="w-10 px-3 py-4">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAll}
                        disabled={selectableIds.length === 0}
                        aria-label={t.adminBulkSelected.replace('{count}', String(selectableIds.length))}
                        className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                      />
                    </th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColMember}</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColFormat}</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColPlan}</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColAnalytics}</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColStatus}</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColInit}</th>
                    <th scope="col" className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em] text-right">{t.adminColActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoadingUsers &&
                    allUsers.length === 0 &&
                    Array.from({ length: 5 }).map((_, rowIndex) => (
                      <tr key={`admin-skeleton-${rowIndex}`} className="animate-pulse">
                        {Array.from({ length: 8 }).map((__, cellIndex) => (
                          <td key={cellIndex} className="px-6 py-4">
                            <div
                              className={cn(
                                'h-3 rounded bg-surface-secondary',
                                cellIndex === 0 ? 'w-40' : 'w-16'
                              )}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  {!(isLoadingUsers && allUsers.length === 0) &&
                    allUsers.map((u) => (
                    <tr key={u.id} className={cn(
                      "group hover:bg-surface-secondary/80 transition-all duration-200", 
                      u.role !== 'admin' && !u.hasPermission
                        ? "bg-red-50/80 hover:bg-red-100/70 dark:bg-red-950/25 dark:hover:bg-red-950/40"
                        : u.isNew && "bg-accent-light/40"
                    )}>
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(u.id)}
                          onChange={() => toggleSelected(u.id)}
                          disabled={u.role === 'admin' || u.id === user?.id}
                          aria-label={u.email}
                          className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className={cn("px-6 py-4 border-l-4", u.role !== 'admin' && !u.hasPermission ? "border-l-red-600 dark:border-l-red-400" : "border-l-transparent")}>
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <UserAvatar
                              src={u.photoURL}
                              imgClassName="w-9 h-9 rounded-xl border border-border object-cover"
                              fallbackClassName="w-9 h-9 rounded-xl bg-surface-secondary flex items-center justify-center text-text-light border border-border"
                            >
                              <UserIcon className="w-4 h-4" />
                            </UserAvatar>
                            {u.isNew && <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent border-2 border-surface rounded-full" />}
                          </div>
                          <div className="overflow-hidden">
                            <div className="text-sm font-black text-text-main leading-tight">{u.displayName || t.unknownUser}</div>
                            <div className="text-[11px] text-text-light font-mono truncate tracking-tighter">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border",
                            u.role === 'admin' 
                              ? "bg-accent-light border-accent/10 text-accent" 
                              : "bg-surface-secondary border-border text-text-muted"
                          )}>
                            {u.role === 'admin' ? t.adminFilterRoleAdmin : t.adminFilterRoleUser}
                          </span>
                          {u.id !== user?.id && (
                            <button 
                              onClick={() => void handleToggleRole(u)}
                              className="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 p-1 text-text-light hover:text-accent transition-all cursor-pointer hover:scale-110 active:scale-95"
                              title={t.adminToggleRole}
                            >
                              <UserCog className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 min-w-[148px]">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border',
                              getDisplayEffectivePlan(u) === 'recruiter'
                                ? 'dark:bg-purple-500/10 bg-purple-100 dark:border-purple-400/20 border-purple-300 dark:text-purple-400 text-purple-700'
                                : getDisplayEffectivePlan(u) === 'pro'
                                  ? 'bg-accent-light border-accent/20 text-accent'
                                  : 'bg-surface-secondary border-border text-text-muted'
                            )}
                          >
                            {getDisplayEffectivePlan(u) === 'recruiter' ? (
                              <Briefcase className="w-3 h-3" />
                            ) : getDisplayEffectivePlan(u) === 'pro' ? (
                              <Crown className="w-3 h-3" />
                            ) : null}
                            {getDisplayEffectivePlan(u) === 'recruiter'
                              ? t.adminFilterPlanRecruiter
                              : getDisplayEffectivePlan(u) === 'pro'
                                ? t.adminPlanPro
                                : t.adminPlanFree}
                          </span>
                          {u.role !== 'admin' && u.id !== user?.id && (
                            <button
                              type="button"
                              onClick={() =>
                                setPlanModal({
                                  user: u,
                                  grant: adminPlanSelectValue(u),
                                  // A legacy custom-null row is invalid under the
                                  // admin-only unlimited policy: start on "inherit"
                                  // and show the warning instead of preserving it.
                                  limitMode: u.monthlyAnalyticsLimitCustom && u.monthlyAnalyticsLimit !== null
                                    ? 'custom'
                                    : 'inherit',
                                  limitDraft: u.monthlyAnalyticsLimitCustom && u.monthlyAnalyticsLimit !== null
                                    ? String(u.monthlyAnalyticsLimit)
                                    : '',
                                  requestId:
                                    typeof crypto !== 'undefined' && 'randomUUID' in crypto
                                      ? crypto.randomUUID()
                                      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                                })
                              }
                              className={cn(
                                'px-2 py-1 text-[10px] font-bold uppercase tracking-wide rounded-md border border-border bg-surface text-text-muted',
                                'cursor-pointer hover:scale-105 active:scale-95 transition-transform hover:border-accent/30 hover:text-accent',
                              )}
                            >
                              {t.adminEditUserButton}
                            </button>
                          )}
                          {u.planExpiresAt && (getDisplayEffectivePlan(u) === 'pro' || getDisplayEffectivePlan(u) === 'recruiter') && (
                            <span className="text-[9px] text-text-light font-mono">
                              {new Date(u.planExpiresAt).toLocaleDateString(dateLocale, { timeZone: VN_TIME_ZONE })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-accent-light shrink-0" />
                          <span className="text-[11px] font-black text-text-main">
                            {formatUsageLimit(u)}
                          </span>
                          {u.monthlyAnalyticsLimitCustom && (
                            <span className="text-[9px] font-bold text-success uppercase tracking-wider ml-1">
                              {t.adminCustomLimitBadge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-bold",
                          u.role === 'admin' || u.hasPermission
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                            : "border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-950/50 dark:text-red-200"
                        )}>
                          {u.role === 'admin' || u.hasPermission
                            ? <UserCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                            : <UserX className="h-3 w-3 shrink-0" aria-hidden="true" />}
                          {u.role === 'admin' || u.hasPermission ? t.adminStatusActive : t.adminStatusLocked}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[11px] text-text-muted font-medium">
                        {new Date(u.createdAt).toLocaleDateString(dateLocale, { timeZone: VN_TIME_ZONE })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {u.id !== user?.id && (
                            <>
                              {u.role !== 'admin' && <button
                                onClick={() => void handleTogglePermission(u)}
                                className={cn(
                                  "inline-flex min-h-11 items-center gap-2 px-3 rounded-lg border transition-colors cursor-pointer hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                                  u.hasPermission ? "border-border text-text-muted hover:text-warning hover:bg-warning-light" : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                                )}
                                title={u.hasPermission ? t.adminLock : t.adminUnlock}
                              >
                                {u.hasPermission ? <UserX className="w-4 h-4" aria-hidden="true" /> : <UserCheck className="w-4 h-4" aria-hidden="true" />}
                                <span className="text-xs font-bold whitespace-nowrap">{u.hasPermission ? t.adminLock : t.adminUnlock}</span>
                              </button>}
                              {u.role !== 'admin' && (
                              <button 
                                onClick={() => void handleDeleteUser(u)}
                                disabled={deletingUserId === u.id}
                                className="p-2 text-text-light hover:text-error hover:bg-error-light rounded-lg transition-all cursor-pointer hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={t.adminDelete}
                              >
                                {deletingUserId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                              )}
                            </>
                          )}
                          <ChevronRight className="w-4 h-4 text-border group-hover:text-accent-light transition-colors" />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {allUsers.length === 0 && !(isLoadingUsers && allUsers.length === 0) && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-sm text-text-muted">
                        {usersError ? (
                          <div role="alert" className="flex flex-col items-center gap-3 text-error">
                            <span className="text-xs font-bold">
                              {formatLabel(t.adminUsersLoadError, { message: usersError })}
                            </span>
                            <button
                              type="button"
                              onClick={() => void refreshUsers()}
                              className="rounded-lg border border-error/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider cursor-pointer hover:scale-105 active:scale-95"
                            >
                              {t.adminRetry}
                            </button>
                          </div>
                        ) : (
                          t.adminUsersEmptyState
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm px-1">
              <p className="text-xs font-bold text-text-muted">
                {formatLabel(t.adminPaginationInfo, {
                  start: String((totalCount ?? 0) === 0 ? 0 : (currentPage - 1) * pageSize + 1),
                  end: String(Math.min(currentPage * pageSize, totalCount ?? 0)),
                  total: String(totalCount ?? 0),
                })}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-2 rounded-lg text-text-light hover:text-text-main hover:bg-surface-secondary transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <ChevronsLeft className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-2 rounded-lg text-text-light hover:text-text-main hover:bg-surface-secondary transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <ChevronLeft className="size-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => (
                    <React.Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-text-light">…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(p)}
                        className={cn(
                          'min-w-[32px] px-2 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer hover:scale-105 active:scale-95',
                          p === currentPage
                            ? 'bg-accent text-white'
                            : 'text-text-light hover:text-text-main hover:bg-surface-secondary'
                        )}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-2 rounded-lg text-text-light hover:text-text-main hover:bg-surface-secondary transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <ChevronRight className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-2 rounded-lg text-text-light hover:text-text-main hover:bg-surface-secondary transition-all cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <ChevronsRight className="size-4" />
                </button>
              </div>
            </div>

          </div>
      ) : adminSubTab === 'report' ? (
        <AdminReportTab />
      ) : (
        <AdminAuditTab />
      )}

      {/* Plan Change Modal */}
      <AnimatePresence>
        {planModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setError(null); setPlanModal(null); }}
            />
            <motion.div
              ref={planDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-plan-modal-title"
              tabIndex={-1}
              className="relative z-10 w-full max-w-sm bg-surface border border-border rounded-2xl shadow-2xl p-6"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              <h3 id="admin-plan-modal-title" className="text-lg font-black text-text-main mb-1">{t.adminEditUserTitle}</h3>
              <p className="text-xs text-text-muted mb-4">
                {planModal.user.displayName || planModal.user.email}
              </p>

              {/* Plan Section */}
              <div className="mb-5">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted mb-2">{t.adminPlanSectionLabel}</p>
                <p className="text-[10px] font-medium text-text-muted mb-2">{t.adminPlanStackingHint}</p>
                {getDisplayEffectivePlan(planModal.user) === 'recruiter' && (
                  <p className="text-[10px] font-bold text-warning mb-2">{t.adminPlanRecruiterNoDowngrade}</p>
                )}
                <div className="space-y-1.5">
                  {([
                    { value: 'free', label: t.adminPlanGrantFree },
                    { value: 'pro_30', label: t.adminPlanGrantPro30 },
                    { value: 'pro_90', label: t.adminPlanGrantPro90 },
                    { value: 'pro_365', label: t.adminPlanGrantPro365 },
                    { value: 'recruiter_30', label: t.adminPlanGrantRecruiter30 },
                  ] as const)
                    .filter(
                      (opt) =>
                        !opt.value.startsWith('pro_') ||
                        getDisplayEffectivePlan(planModal.user) !== 'recruiter'
                    )
                    .map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setPlanModal((prev) =>
                          prev ? { ...prev, grant: opt.value } : prev
                        )
                      }
                      className={cn(
                        'w-full px-3 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer border',
                        planModal.grant === opt.value
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface-secondary text-text-main border-border hover:border-accent/30',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Analytics Limit Section */}
              <div className="mb-5 pt-4 border-t border-border">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted mb-2">
                  {t.adminAnalyticsLimitLabel}
                </p>

                {planModal.user.monthlyAnalyticsLimitCustom &&
                  planModal.user.monthlyAnalyticsLimit === null && (
                    <p
                      role="alert"
                      className="mb-3 rounded-lg border border-warning/20 bg-warning-light px-3 py-2 text-[11px] font-bold text-warning"
                    >
                      {t.adminLegacyUnlimitedWarning}
                    </p>
                  )}

                <div role="radiogroup" aria-label={t.adminAnalyticsLimitLabel} className="space-y-2">
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      planModal.limitMode === 'inherit'
                        ? 'border-accent bg-accent-light/40'
                        : 'border-border bg-surface-secondary'
                    )}
                  >
                    <input
                      type="radio"
                      name="admin-limit-mode"
                      className="mt-0.5 h-4 w-4 cursor-pointer"
                      checked={planModal.limitMode === 'inherit'}
                      onChange={() =>
                        setPlanModal((prev) =>
                          prev ? { ...prev, limitMode: 'inherit' } : prev
                        )
                      }
                    />
                    <span className="text-xs font-bold text-text-main">
                      {t.adminLimitModeInherit}
                      <span className="mt-0.5 block text-[10px] font-medium text-text-muted">
                        {isGlobalLimitLoaded
                          ? formatLabel(t.adminAnalyticsUsingDefault, {
                              limit: String(globalDefaultLimit),
                            })
                          : t.adminGlobalAnalyticsLoadError}
                      </span>
                    </span>
                  </label>

                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      planModal.limitMode === 'custom'
                        ? 'border-accent bg-accent-light/40'
                        : 'border-border bg-surface-secondary'
                    )}
                  >
                    <input
                      type="radio"
                      name="admin-limit-mode"
                      className="mt-0.5 h-4 w-4 cursor-pointer"
                      checked={planModal.limitMode === 'custom'}
                      onChange={() =>
                        setPlanModal((prev) =>
                          prev ? { ...prev, limitMode: 'custom' } : prev
                        )
                      }
                    />
                    <span className="text-xs font-bold text-text-main">
                      {t.adminLimitModeCustom}
                    </span>
                  </label>
                </div>

                {planModal.limitMode === 'custom' && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={planModal.limitDraft}
                      onChange={(e) =>
                        setPlanModal((prev) =>
                          prev ? { ...prev, limitDraft: e.target.value } : prev
                        )
                      }
                      placeholder={t.adminAnalyticsLimitPlaceholder}
                      aria-label={t.adminAnalyticsLimitLabel}
                      className="flex-1 px-3 py-2 text-sm font-mono border border-border rounded-xl bg-surface-secondary focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <span className="text-xs text-text-muted">
                      {t.adminAnalyticsLimitPlaceholder}
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <div role="alert" className="mb-4 p-3 rounded-xl border bg-error-light border-error/10 text-error flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-bold">{error}</span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setError(null); setPlanModal(null); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-border text-text-muted hover:text-text-main cursor-pointer transition-colors bg-surface-secondary"
                >
                  {t.adminCancel}
                </button>
                <button
                  type="button"
                  disabled={savingPlanUserId === planModal.user.id || savingPlanUserId === planModal.user.id}
                  onClick={() => void handleSavePlanModal()}
                  className={cn(
                    'flex-1 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider text-white cursor-pointer transition-all bg-accent hover:scale-[1.02] active:scale-[0.98]',
                    (savingPlanUserId === planModal.user.id || savingPlanUserId === planModal.user.id) &&
                      'opacity-50 cursor-not-allowed',
                  )}
                >
                  {savingPlanUserId === planModal.user.id || savingPlanUserId === planModal.user.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    t.adminSaveChanges
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmState !== null}
        title={
          confirmState?.kind === 'delete'
            ? t.adminConfirmDeleteTitle
            : t.adminConfirmRoleTitle
        }
        message={
          confirmState?.kind === 'delete'
            ? formatLabel(t.adminConfirmDelete, { email: confirmState.user.email })
            : confirmState?.kind === 'role'
              ? formatLabel(t.adminConfirmRoleChange, {
                  email: confirmState.user.email,
                  role: confirmState.nextRole === 'admin' ? t.adminFilterRoleAdmin : t.adminFilterRoleUser,
                })
              : ''
        }
        confirmLabel={confirmState?.kind === 'delete' ? t.adminDelete : t.adminSaveChanges}
        cancelLabel={t.adminCancel}
        danger={confirmState?.kind === 'delete'}
        requiredText={confirmState?.kind === 'delete' ? confirmState.user.email : undefined}
        requiredTextLabel={
          confirmState?.kind === 'delete'
            ? formatLabel(t.adminTypeEmailToConfirm, { email: confirmState.user.email })
            : undefined
        }
        isBusy={confirmBusy}
        onConfirm={() => void handleConfirm()}
        onCancel={() => {
          if (!confirmBusy) setConfirmState(null);
        }}
      />

      {toast && (
        <div
          role="status"
          className={cn(
            'fixed bottom-6 right-6 z-[70] max-w-sm rounded-xl border px-4 py-3 text-sm font-bold shadow-xl',
            toast.type === 'success'
              ? 'border-success/20 bg-success-light text-success'
              : 'border-error/20 bg-error-light text-error'
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
