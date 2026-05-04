import React, { useState } from 'react';
import { Users, Mail, Search, UserPlus, Check, User as UserIcon, UserCog, UserCheck, UserX, Trash2, Loader2, Send, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
import axios from 'axios';
import { markUserAsRead, updateUserRole, updateUserPermission, deleteUser } from '../../services/geminiService';

export function AdminView() {
  const { user, userProfile, allUsers } = useAuth();
  const newUsersCount = allUsers.filter(u => u.isNew).length;
  
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
      setTestEmailStatus({ success: false, message: 'Email không hợp lệ' });
      return;
    }
    
    setIsSendingTestEmail(true);
    setTestEmailStatus(null);
    try {
      const response = await axios.post('/api/test-email', {
        to: testEmailRecipient,
      });
      setTestEmailStatus({ success: true, message: 'Đã gửi thành công! Message ID: ' + response.data.id });
    } catch (err: any) {
      console.error('Lỗi khi gửi test email:', err);
      setTestEmailStatus({ 
        success: false, 
        message: 'Lỗi: ' + (err.response?.data?.message || err.message || 'Không xác định')
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  return (
    <>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center bg-slate-100 p-1 rounded-2xl w-fit">
                <button 
                  onClick={() => setAdminSubTab('users')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2",
                    adminSubTab === 'users' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Users className="w-4 h-4" />
                  Người dùng
                </button>
                <button 
                  onClick={() => setAdminSubTab('email')}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2",
                    adminSubTab === 'email' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Mail className="w-4 h-4" />
                  Test Email
                </button>
              </div>

              {adminSubTab === 'users' && (
                <div className="relative w-full lg:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Tìm kiếm email..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all w-full"
                  />
                </div>
              )}
            </div>

            {adminSubTab === 'users' ? (
              <>
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Quản lý người dùng</h2>
                  <p className="text-slate-500 text-sm">Cấp quyền hoặc thu hồi quyền truy cập ứng dụng.</p>
                </div>

            {newUsersCount > 0 && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <UserPlus className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-indigo-900">Người dùng mới đăng ký</h3>
                    <p className="text-indigo-700 text-xs">Có {newUsersCount} người dùng mới vừa tham gia hệ thống.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allUsers.filter(u => u.isNew && u.role !== 'admin').map(u => (
                    <div key={u.uid} className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-sm flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="" className="w-10 h-10 rounded-full" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <UserIcon className="w-5 h-5" />
                          </div>
                        )}
                        <div className="overflow-hidden">
                          <div className="text-sm font-bold text-slate-800 truncate">{u.displayName || 'N/A'}</div>
                          <div className="text-[10px] text-slate-400 truncate">{u.email}</div>
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          try {
                            await markUserAsRead(u.uid);
                          } catch (err: any) {
                            setError("Không thể đánh dấu đã đọc: " + err.message);
                          }
                        }}
                        className="p-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all shadow-md shadow-indigo-100"
                        title="Đánh dấu đã xem"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Người dùng</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vai trò</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Trạng thái</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Số lần dùng</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ngày tham gia</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allUsers
                      .filter(u => u.email.toLowerCase().includes(userSearchTerm.toLowerCase()))
                      .map((u) => (
                      <tr key={u.uid} className={cn("hover:bg-slate-50/50 transition-colors", u.isNew && "bg-indigo-50/30")}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <UserIcon className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-bold text-slate-800">{u.displayName || 'N/A'}</div>
                                {u.isNew && (
                                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 text-[8px] font-black uppercase rounded-full">Mới</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider",
                              u.role === 'admin' ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-600"
                            )}>
                              {u.role}
                            </span>
                            {u.uid !== user?.uid && (
                              <button 
                                onClick={async () => {
                                  if (window.confirm(`Bạn có chắc muốn đổi vai trò của ${u.email} thành ${u.role === 'admin' ? 'user' : 'admin'}?`)) {
                                    try {
                                      await updateUserRole(u.uid, u.role === 'admin' ? 'user' : 'admin');
                                    } catch (err: any) {
                                      setError("Không thể đổi vai trò: " + err.message);
                                    }
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                title="Đổi vai trò"
                              >
                                <UserCog className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {u.hasPermission ? (
                              <>
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-xs font-bold text-emerald-600">Hoạt động</span>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 rounded-full bg-red-500" />
                                <span className="text-xs font-bold text-red-600">Đã khóa</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black">
                              {u.usageCount || 0}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                          {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {u.uid !== user?.uid && (
                              <>
                                <button 
                                  onClick={async () => {
                                    try {
                                      await updateUserPermission(u.uid, !u.hasPermission);
                                    } catch (err: any) {
                                      setError("Không thể thay đổi quyền: " + err.message);
                                    }
                                  }}
                                  className={cn(
                                    "p-2 rounded-xl transition-all",
                                    u.hasPermission 
                                      ? "text-red-500 hover:bg-red-50" 
                                      : "text-emerald-500 hover:bg-emerald-50"
                                  )}
                                  title={u.hasPermission ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                                >
                                  {u.hasPermission ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                                </button>
                                 <button 
                                   onClick={async () => {
                                     if (window.confirm(`Bạn có chắc muốn XÓA vĩnh viễn người dùng ${u.email}? Hành động này không thể hoàn tác.`)) {
                                       setDeletingUserId(u.uid);
                                       try {
                                         await deleteUser(u.uid);
                                       } catch (err: any) {
                                         setError("Không thể xóa người dùng: " + err.message);
                                         setDeletingUserId(null);
                                       }
                                     }
                                   }}
                                   disabled={deletingUserId === u.uid}
                                   className={cn(
                                     "p-2 rounded-xl transition-all relative flex items-center justify-center min-w-[40px]",
                                     deletingUserId === u.uid 
                                       ? "bg-slate-50 text-slate-300 cursor-not-allowed" 
                                       : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                                   )}
                                   title="Xóa người dùng"
                                 >
                                   {deletingUserId === u.uid ? (
                                     <div className="flex items-center gap-2">
                                       <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                       <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">Đang xóa...</span>
                                     </div>
                                   ) : (
                                     <Trash2 className="w-5 h-5" />
                                   )}
                                 </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
              </>
            ) : (
              <div className="max-w-2xl mx-auto py-12">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12">
                  <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-8">
                    <Mail className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Kiểm tra Email chào mừng</h2>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    Nhập địa chỉ email bên dưới để gửi thử nghiệm một email chào mừng (Welcome Email). Tính năng này giúp bạn kiểm tra cấu hình Resend và nội dung mẫu email.
                  </p>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Địa chỉ Email nhận</label>
                      <input 
                        type="email"
                        placeholder="example@gmail.com"
                        value={testEmailRecipient}
                        onChange={(e) => setTestEmailRecipient(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Tên người nhận (Tùy chọn)</label>
                      <input 
                        type="text"
                        placeholder="Nguyễn Văn A"
                        value={testName}
                        onChange={(e) => setTestName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-900"
                      />
                    </div>

                    {testEmailStatus && (
                      <div className={cn(
                        "p-4 rounded-2xl border flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300",
                        testEmailStatus.success 
                          ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                          : "bg-red-50 border-red-100 text-red-700"
                      )}>
                        {testEmailStatus.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                        <p className="text-sm font-medium">{testEmailStatus.message}</p>
                      </div>
                    )}

                    <button 
                      onClick={handleSendTestEmail}
                      disabled={isSendingTestEmail}
                      className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-indigo-300 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {isSendingTestEmail ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Đang gửi...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Gửi Email Chào Mừng Thử Nghiệm
                        </>
                      )}
                    </button>
                    
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                      <HelpCircle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div className="text-xs text-amber-800 leading-relaxed">
                        <strong>Lưu ý:</strong> Nếu Resend đang ở chế độ Trial (Sandbox), bạn chỉ có thể gửi email đến địa chỉ email chính của mình. Để gửi được cho mọi địa chỉ, vui lòng xác thực tên miền trên Resend.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
    </>
  );
}
