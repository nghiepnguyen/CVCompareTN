import React from 'react';
import { UserX } from 'lucide-react';

export function NoPermissionView() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mb-6">
        <UserX className="w-10 h-10 text-red-600" />
      </div>
      <h2 className="text-3xl font-black text-slate-900 mb-4">Tài khoản bị khóa</h2>
      <p className="text-slate-600 max-w-md mb-8">
        Tài khoản của bạn đã bị quản trị viên tạm khóa. Vui lòng liên hệ <a href={`mailto:${import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}`} className="text-indigo-600 font-bold hover:underline">{import.meta.env.VITE_FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'}</a> để được hỗ trợ.
      </p>
    </div>
  );
}
