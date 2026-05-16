import React, { useState } from 'react';
import { Users, Mail, Search, UserPlus, Check, User as UserIcon, UserCog, UserCheck, UserCheck2, UserX, Trash2, Loader2, Send, AlertCircle, CheckCircle2, HelpCircle, ShieldCheck, ChevronRight, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { formatLabel } from '../../translations';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { markUserAsRead, updateUserRole, updateUserPermission, deleteUser } from '../../services/userService';
import { motion, AnimatePresence } from 'framer-motion';

export function AdminView() {
  const { user, userProfile, allUsers } = useAuth();
  const { t, reportLanguage } = useUI();
  const dateLocale = reportLanguage === 'vi' ? 'vi-VN' : 'en-US';
  const newRegularUsers = allUsers.filter(u => u.isNew && u.role !== 'admin');
  const newUsersCount = newRegularUsers.length;
  
  const [adminSubTab, setAdminSubTab] = useState<'users' | 'email'>('users');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{success: boolean, message: string} | null>(null);
  const [testName, setTestName] = useState('');

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient || !testEmailRecipient.includes('@')) {
      setTestEmailStatus({ success: false, message: t.adminInvalidEmail });
      return;
    }
    
    setIsSendingTestEmail(true);
    setTestEmailStatus(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          type: 'welcome',
          data: {
            userEmail: testEmailRecipient,
            userName: testName || t.adminGuest
          }
        }
      });
      
      if (error) throw error;
      setTestEmailStatus({
        success: true,
        message: formatLabel(t.adminEmailSent, { id: data.id || 'OK' }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown';
      console.error('Test email send failed:', err);
      setTestEmailStatus({
        success: false,
        message: formatLabel(t.adminEmailError, { message }),
      });
    } finally {
      setIsSendingTestEmail(false);
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
              "px-5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 uppercase tracking-wider",
              adminSubTab === 'users' ? "bg-surface text-accent shadow-sm border border-border" : "text-text-muted hover:text-text-main"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            {t.adminTabUsers}
          </button>
          <button 
            onClick={() => setAdminSubTab('email')}
            className={cn(
              "px-5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 uppercase tracking-wider",
              adminSubTab === 'email' ? "bg-surface text-accent shadow-sm border border-border" : "text-text-muted hover:text-text-main"
            )}
          >
            <Mail className="w-3.5 h-3.5" />
            {t.adminTabEmail}
          </button>
        </div>
      </div>

      {adminSubTab === 'users' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                    {newRegularUsers.map(u => (
                      <div key={u.id} className="group bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 transition-all cursor-default">
                        <div className="flex items-center gap-3 overflow-hidden">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt="" className="w-8 h-8 rounded-lg border border-white/20" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center text-text-light border border-white/10">
                              <UserIcon className="w-4 h-4" />
                            </div>
                          )}
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
                            } catch (err: any) {
                              alert(formatLabel(t.adminMarkReadError, { message: err.message }));
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

          {/* Users Table Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <h3 className="text-xl font-black text-text-main flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" />
              {t.adminDirectoryTitle}
            </h3>
            <div className="relative w-full sm:w-72 group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light group-focus-within:text-accent transition-colors" />
              <input 
                type="text" 
                placeholder={t.adminSearchPlaceholder}
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-surface border-2 border-border rounded-xl text-sm font-medium focus:border-accent focus:ring-0 transition-all outline-none text-text-main"
              />
            </div>
          </div>

          {/* Precision Table */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-secondary/50 border-b border-border">
                    <th className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColMember}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColFormat}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColAnalytics}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColStatus}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em]">{t.adminColInit}</th>
                    <th className="px-6 py-4 text-[10px] font-black text-text-light uppercase tracking-[0.15em] text-right">{t.adminColActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allUsers
                    .filter(u => u.email.toLowerCase().includes(userSearchTerm.toLowerCase()))
                    .map((u) => (
                    <tr key={u.id} className={cn(
                      "group hover:bg-surface-secondary/80 transition-all duration-200", 
                      u.isNew && "bg-accent-light/40"
                    )}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-9 h-9 rounded-xl border border-border object-cover" />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-surface-secondary flex items-center justify-center text-text-light border border-border">
                                <UserIcon className="w-4 h-4" />
                              </div>
                            )}
                            {u.isNew && <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent border-2 border-surface rounded-full" />}
                          </div>
                          <div className="overflow-hidden">
                            <div className="text-sm font-black text-text-main leading-tight">{u.displayName || 'Unknown'}</div>
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
                            {u.role}
                          </span>
                          {u.id !== user?.id && (
                            <button 
                              onClick={() => updateUserRole(u.id, u.role === 'admin' ? 'user' : 'admin')}
                              className="opacity-0 group-hover:opacity-100 p-1 text-text-light hover:text-accent transition-all hover:scale-110"
                              title={t.adminToggleRole}
                            >
                              <UserCog className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-accent-light" />
                          <span className="text-[11px] font-black text-text-main">{u.usageCount} <span className="text-[9px] text-text-light font-normal">{t.adminUsageAnalytic}</span></span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            u.hasPermission ? "bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-text-light"
                          )} />
                          <span className={cn(
                            "text-[11px] font-bold uppercase tracking-tight",
                            u.hasPermission ? "text-success" : "text-text-light"
                          )}>
                            {u.hasPermission ? t.adminStatusActive : t.adminStatusLocked}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[11px] text-text-muted font-medium">
                        {new Date(u.createdAt).toLocaleDateString(dateLocale)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {u.id !== user?.id && (
                            <>
                              <button 
                                onClick={() => updateUserPermission(u.id, !u.hasPermission)}
                                className={cn(
                                  "p-2 rounded-lg transition-all hover:scale-110 active:scale-95",
                                  u.hasPermission ? "text-text-light hover:text-warning hover:bg-warning-light" : "text-success hover:bg-success-light"
                                )}
                                title={u.hasPermission ? t.adminLock : t.adminUnlock}
                              >
                                {u.hasPermission ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </button>
                              <button 
                                onClick={() => {
                                  if (window.confirm(t.adminConfirmDelete)) {
                                    deleteUser(u.id);
                                  }
                                }}
                                className="p-2 text-text-light hover:text-error hover:bg-error-light rounded-lg transition-all hover:scale-110"
                                title={t.adminDelete}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <ChevronRight className="w-4 h-4 text-border group-hover:text-accent-light transition-colors" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-xl mx-auto py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-surface rounded-3xl border border-border p-10 text-center space-y-6">
            <div className="w-20 h-20 bg-accent-light rounded-2xl flex items-center justify-center mx-auto border-2 border-accent/10 border-dashed">
              <Mail className="w-10 h-10 text-accent" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-text-main tracking-tight">{t.adminMailTitle}</h2>
              <p className="text-text-muted text-sm">{t.adminMailDesc}</p>
            </div>

            <div className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-light uppercase tracking-widest ml-1">{t.adminRecipientLabel}</label>
                <input 
                  type="email"
                  placeholder="name@example.com"
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-secondary border border-border rounded-xl focus:ring-2 focus:ring-accent focus:bg-surface transition-all outline-none font-medium text-text-main"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-light uppercase tracking-widest ml-1">{t.adminDisplayNameLabel}</label>
                <input 
                  type="text" 
                  placeholder={t.adminDisplayNamePlaceholder}
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-secondary border border-border rounded-xl focus:ring-2 focus:ring-accent focus:bg-surface transition-all outline-none font-medium text-text-main"
                />
              </div>

              {testEmailStatus && (
                <div className={cn(
                  "p-4 rounded-xl border flex items-center gap-3",
                  testEmailStatus.success ? "bg-success-light border-success/10 text-success" : "bg-error-light border-error/10 text-error"
                )}>
                  {testEmailStatus.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span className="text-xs font-bold truncate">{testEmailStatus.message}</span>
                </div>
              )}

              <button 
                onClick={handleSendTestEmail}
                disabled={isSendingTestEmail}
                className="w-full py-4 bg-accent text-white font-black rounded-xl hover:bg-accent-hover transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-accent-light cursor-pointer group"
              >
                {isSendingTestEmail ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    {t.adminSendTestEmail}
                  </>
                )}
              </button>
            </div>
            
            <div className="pt-6 border-t border-border flex items-center gap-2 justify-center text-[10px] text-text-light font-bold uppercase tracking-widest">
              <AlertCircle className="w-3 h-3" />
              {t.adminTrialNote}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
