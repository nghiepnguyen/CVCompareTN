import React, { useState } from 'react';
import { Shield, Lock, Eye, FileText, ArrowLeft, Share2, Check, Cookie } from 'lucide-react';

export const PrivacyPolicyPage = ({ onBack }: { onBack: () => void }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('policy', 'true');
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-bold text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại trang chủ
        </button>

        <button 
          onClick={handleCopyLink}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-500" />
              Đã sao chép
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              Chia sẻ liên kết
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-indigo-600 p-12 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-4">Chính sách bảo mật</h1>
            <p className="text-indigo-100 text-lg max-w-xl leading-relaxed">
              Cam kết bảo vệ quyền riêng tư và dữ liệu cá nhân của bạn tại thanhnghiep.top
            </p>
          </div>
        </div>

        <div className="p-12 text-slate-700 space-y-10">
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <Eye className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">1. Thông tin chúng tôi thu thập</h2>
            </div>
            <p className="leading-relaxed">
              Chúng tôi thu thập thông tin bạn cung cấp trực tiếp khi sử dụng dịch vụ, bao gồm:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Nội dung CV/Resume bạn tải lên hoặc dán vào hệ thống.</li>
              <li>Mô tả công việc (Job Description) bạn cung cấp để so sánh.</li>
              <li>Thông tin hồ sơ từ tài khoản Google của bạn (Tên, Email, Ảnh đại diện) khi bạn đăng nhập.</li>
              <li>Dữ liệu phân tích hành vi (chỉ khi bạn chấp nhận cookie) qua Google Analytics 4 (GA4).</li>
              <li>Dữ liệu hiệu năng ẩn danh qua Vercel Analytics (không dùng cho quảng cáo).</li>
            </ul>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <Lock className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">2. Cách chúng tôi sử dụng thông tin</h2>
            </div>
            <p className="leading-relaxed">
              Thông tin của bạn được sử dụng cho các mục đích sau:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Cung cấp tính năng phân tích và so sánh CV với JD bằng công nghệ AI.</li>
              <li>Lưu trữ lịch sử phân tích để bạn có thể xem lại sau này.</li>
              <li>Cải thiện chất lượng dịch vụ và trải nghiệm người dùng.</li>
              <li>Gửi các thông báo quan trọng liên quan đến tài khoản hoặc dịch vụ.</li>
            </ul>
            <p className="bg-slate-50 p-4 rounded-xl border-l-4 border-indigo-500 italic text-sm">
              Chúng tôi cam kết không bán hoặc chia sẻ thông tin cá nhân của bạn cho bất kỳ bên thứ ba nào vì mục đích quảng cáo mà không có sự đồng ý của bạn.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <Shield className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">3. Bảo mật dữ liệu</h2>
            </div>
            <p className="leading-relaxed">
              Chúng tôi áp dụng các biện pháp bảo mật kỹ thuật và tổ chức nghiêm ngặt để bảo vệ dữ liệu của bạn khỏi việc truy cập, thay đổi hoặc phá hủy trái phép. Dữ liệu của bạn được lưu trữ trên hạ tầng Supabase (PostgreSQL và Storage), được triển khai trên đám mây với các điều khiển truy cập và mã hóa phù hợp.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <Cookie className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">4. Cookie và phân tích</h2>
            </div>
            <p className="leading-relaxed">
              Google Analytics 4 (GA4) chỉ được kích hoạt sau khi bạn bấm &quot;Chấp nhận phân tích&quot;. Nếu từ chối,
              script Google không được tải. Đổi lựa chọn qua &quot;Cài đặt cookie&quot; ở chân trang.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 text-sm">
              <li><strong>GA4:</strong> sự kiện phân tích (không gửi nội dung CV/JD).</li>
              <li><strong>Vercel Analytics:</strong> hiệu năng trang, độc lập với GA4.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <FileText className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">5. Quyền của bạn</h2>
            </div>
            <p className="leading-relaxed">
              Bạn có quyền truy cập, chỉnh sửa hoặc yêu cầu xóa dữ liệu cá nhân của mình bất kỳ lúc nào thông qua các tính năng trên trang web hoặc liên hệ trực tiếp với chúng tôi.
            </p>
          </section>

          <div className="pt-8 border-t border-slate-100 text-sm text-slate-400 text-center">
            Cập nhật lần cuối: Ngày 16 tháng 05 năm 2026
          </div>
        </div>
      </div>
    </div>
  );
};
