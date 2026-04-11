import React, { useState } from 'react';
import { FileText, CheckCircle, AlertTriangle, Scale, ArrowLeft, Share2, Check } from 'lucide-react';

export const TermsOfServicePage = ({ onBack }: { onBack: () => void }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('terms', 'true');
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
              <FileText className="w-8 h-8" />
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-4">Điều khoản dịch vụ</h1>
            <p className="text-indigo-100 text-lg max-w-xl leading-relaxed">
              Các quy định và điều kiện khi sử dụng dịch vụ của thanhnghiep.top
            </p>
          </div>
        </div>

        <div className="p-12 text-slate-700 space-y-10">
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <CheckCircle className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">1. Chấp nhận điều khoản</h2>
            </div>
            <p className="leading-relaxed">
              Bằng cách truy cập và sử dụng trang web thanhnghiep.top, bạn đồng ý tuân thủ và bị ràng buộc bởi các điều khoản và điều kiện sử dụng này. Nếu bạn không đồng ý với bất kỳ phần nào của các điều khoản này, vui lòng không sử dụng dịch vụ của chúng tôi.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <Scale className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">2. Sử dụng dịch vụ hợp pháp</h2>
            </div>
            <p className="leading-relaxed">
              Bạn đồng ý sử dụng dịch vụ của chúng tôi chỉ cho các mục đích hợp pháp và theo cách không vi phạm quyền của bất kỳ bên thứ ba nào. Các hành vi bị cấm bao gồm:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Sử dụng dịch vụ để phát tán nội dung độc hại, lừa đảo hoặc vi phạm bản quyền.</li>
              <li>Cố gắng truy cập trái phép vào hệ thống hoặc dữ liệu của người dùng khác.</li>
              <li>Sử dụng các công cụ tự động để thu thập dữ liệu từ trang web mà không có sự cho phép.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">3. Giới hạn trách nhiệm</h2>
            </div>
            <p className="leading-relaxed">
              Dịch vụ của chúng tôi được cung cấp trên cơ sở "nguyên trạng" và "có sẵn". Chúng tôi không đưa ra bất kỳ đảm bảo nào, rõ ràng hay ngụ ý, về tính chính xác, đầy đủ hoặc độ tin cậy của kết quả phân tích AI. Kết quả so sánh CV chỉ mang tính chất tham khảo và không đảm bảo việc bạn sẽ được tuyển dụng.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-600 mb-2">
              <FileText className="w-6 h-6" />
              <h2 className="text-2xl font-black tracking-tight">4. Thay đổi điều khoản</h2>
            </div>
            <p className="leading-relaxed">
              Chúng tôi có quyền sửa đổi hoặc thay thế các điều khoản này bất kỳ lúc nào. Việc bạn tiếp tục sử dụng dịch vụ sau khi có bất kỳ thay đổi nào đồng nghĩa với việc bạn chấp nhận các điều khoản mới.
            </p>
          </section>

          <div className="pt-8 border-t border-slate-100 text-sm text-slate-400 text-center">
            Cập nhật lần cuối: Ngày 02 tháng 04 năm 2026
          </div>
        </div>
      </div>
    </div>
  );
};
