import React, { useState } from 'react';
import { Heart, Coffee, CreditCard, QrCode, ArrowLeft, Share2, Check, Sparkles, Rocket, ShieldCheck, Copy } from 'lucide-react';

export const SupportDevelopmentPage = ({ onBack, language = 'vi' }: { onBack: () => void; language?: 'vi' | 'en' }) => {
  const [copied, setCopied] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState<string | null>(null);

  const t = {
    vi: {
      back: "Quay lại trang chủ",
      copied: "Đã sao chép",
      share: "Chia sẻ liên kết",
      title: "Hỗ Trợ Phát Triển",
      heroDesc: "Nếu bạn thấy trang web hữu ích, hãy ủng hộ để chúng tôi có thêm động lực phát triển các tính năng mới tuyệt vời hơn.",
      feature1Title: "Tính năng mới",
      feature1Desc: "Nghiên cứu và triển khai các công cụ AI hỗ trợ tìm việc hiện đại nhất.",
      feature2Title: "Duy trì hệ thống",
      feature2Desc: "Đảm bảo trang web luôn hoạt động ổn định, nhanh chóng và bảo mật.",
      feature3Title: "Trải nghiệm tốt hơn",
      feature3Desc: "Cải thiện giao diện và tối ưu hóa trải nghiệm cho hàng ngàn người dùng.",
      bankInfo: "Thông tin chuyển khoản",
      bankLabel: "Ngân hàng",
      accountLabel: "Số tài khoản",
      copyAccount: "Sao chép số tài khoản",
      holderLabel: "Chủ tài khoản",
      motivation: "Mọi sự ủng hộ dù nhỏ nhất đều là nguồn động lực to lớn.",
      scanToSupport: "Quét mã để ủng hộ",
      scanDesc: "Sử dụng ứng dụng ngân hàng của bạn để quét mã VietQR này.",
      thanks: "Trân trọng cảm ơn sự đồng hành của bạn! ❤️"
    },
    en: {
      back: "Back to home",
      copied: "Copied",
      share: "Share link",
      title: "Support Development",
      heroDesc: "If you find this website helpful, please support us to have more motivation to develop even better features.",
      feature1Title: "New Features",
      feature1Desc: "Research and deploy the most modern AI tools for job searching.",
      feature2Title: "System Maintenance",
      feature2Desc: "Ensuring the website runs stably, quickly, and securely.",
      feature3Title: "Better Experience",
      feature3Desc: "Improving the interface and optimizing the experience for thousands of users.",
      bankInfo: "Transfer Information",
      bankLabel: "Bank",
      accountLabel: "Account Number",
      copyAccount: "Copy account number",
      holderLabel: "Account Holder",
      motivation: "Every support, no matter how small, is a huge source of motivation.",
      scanToSupport: "Scan to support",
      scanDesc: "Use your banking app to scan this VietQR code.",
      thanks: "Sincere thanks for your companionship! ❤️"
    }
  }[language];

  const handleCopyLink = () => {
    const langPath = language === 'en' ? '/en' : '/vi';
    const url = window.location.origin + langPath + '/support';
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAccount = (account: string) => {
    navigator.clipboard.writeText(account);
    setCopiedAccount(account);
    setTimeout(() => setCopiedAccount(null), 2000);
  };

  const bankAccounts = [
    {
      bankName: "Ngân hàng thương mại cổ phần Hàng hải Việt Nam (MSB)",
      accountNumber: "04301010773053",
      accountName: "NGUYEN THANH NGHIEP",
      branch: "Chi nhánh TP. Hồ Chí Minh",
      qrCode: "https://api.vietqr.io/image/970426-04301010773053-YU9vVwh.jpg?accountName=NGUYEN%20THANH%20NGHIEP&amount=0&addInfo=Donate%20App%20CV%20Compare"
    }
  ];

  return (
    <div className="max-w-4xl mx-auto py-6 md:py-12 px-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors font-bold text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.back}
        </button>

        <button 
          onClick={handleCopyLink}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-500" />
              {t.copied}
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4" />
              {t.share}
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        {/* Hero Section */}
        <div className="bg-indigo-600 p-8 md:p-12 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          
          <div className="relative z-10">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
              <Heart className="w-6 h-6 md:w-8 md:h-8 fill-white/20" />
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4 leading-tight">{t.title}</h1>
            <p className="text-indigo-100 text-base md:text-lg max-w-2xl leading-relaxed font-medium">
              {t.heroDesc}
            </p>
          </div>
        </div>

        <div className="p-6 md:p-12">
          {/* Why Support Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Rocket, title: t.feature1Title, desc: t.feature1Desc },
              { icon: ShieldCheck, title: t.feature2Title, desc: t.feature2Desc },
              { icon: Sparkles, title: t.feature3Title, desc: t.feature3Desc }
            ].map((item, idx) => (
              <div key={idx} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-all group">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                  <item.icon className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="font-black text-slate-800 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Donation Info Section */}
          <div className="bg-indigo-50/50 rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-10 border border-indigo-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <CreditCard className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">{t.bankInfo}</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
              {/* Bank Details */}
              <div className="space-y-6">
                {bankAccounts.map((bank, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t.bankLabel}</label>
                        <p className="font-bold text-slate-800">{bank.bankName}</p>
                      </div>
                      
                      <div className="flex items-start justify-between group">
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t.accountLabel}</label>
                          <p className="text-xl md:text-2xl font-black text-indigo-600 tracking-tight break-all">{bank.accountNumber}</p>
                        </div>
                        <button 
                          onClick={() => handleCopyAccount(bank.accountNumber)}
                          className="p-2 md:p-3 bg-slate-50 text-slate-400 rounded-xl md:rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm flex-shrink-0 ml-2"
                          title={t.copyAccount}
                        >
                          {copiedAccount === bank.accountNumber ? <Check className="w-4 h-4 md:w-5 md:h-5" /> : <Copy className="w-4 h-4 md:w-5 md:h-5" />}
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t.holderLabel}</label>
                        <p className="font-black text-slate-800 uppercase">{bank.accountName}</p>
                      </div>

                      <div className="pt-4 border-t border-slate-50 flex items-center gap-2 text-slate-400 text-xs italic">
                        <Coffee className="w-3 h-3" />
                        {t.motivation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="bg-white p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] shadow-xl shadow-indigo-100 border-4 border-indigo-100 relative group w-full max-w-[320px]">
                  <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 z-10">
                    <QrCode className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  <div className="aspect-square w-full overflow-hidden rounded-xl md:rounded-2xl">
                    <img 
                      src={bankAccounts[0].qrCode} 
                      alt="QR Code Donation" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="mt-4 text-center">
                    <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">{t.scanToSupport}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 text-center max-w-xs italic px-4">
                  {t.scanDesc}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Message */}
          <div className="mt-12 text-center">
            <p className="text-slate-400 text-sm">
              {t.thanks}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
