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
          className="flex items-center gap-2 text-text-muted hover:text-accent transition-colors font-bold text-sm cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.back}
        </button>

        <button 
          onClick={handleCopyLink}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 dark:bg-white/[0.03] bg-surface-muted border border-border text-text-muted rounded-xl text-sm font-bold dark:hover:bg-white/[0.06] hover:bg-surface-secondary transition-all cursor-pointer"
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

      <div className="dark:bg-white/[0.02] bg-white/80 backdrop-blur-xl rounded-[2rem] border border-border overflow-hidden">
        {/* Hero Section */}
        <div className="bg-accent p-8 md:p-12 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          
          <div className="relative z-10">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
              <Heart className="w-6 h-6 md:w-8 md:h-8 fill-white/20" />
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4 leading-tight">{t.title}</h1>
            <p className="text-white/80 text-base md:text-lg max-w-2xl leading-relaxed font-medium">
              {t.heroDesc}
            </p>
          </div>
        </div>

        <div className="p-6 md:p-12">
          {/* Why Support Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-12">
            {[
              { icon: Rocket, title: t.feature1Title, desc: t.feature1Desc },
              { icon: ShieldCheck, title: t.feature2Title, desc: t.feature2Desc },
              { icon: Sparkles, title: t.feature3Title, desc: t.feature3Desc }
            ].map((item, idx) => (
              <div key={idx} className="dark:bg-white/[0.03] bg-surface-secondary backdrop-blur-sm p-6 rounded-3xl border border-border hover:border-accent/20 transition-all group">
                <div className="w-12 h-12 dark:bg-white/[0.05] bg-accent/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <item.icon className="w-6 h-6 text-accent" />
                </div>
                <p className="font-bold text-text-main mb-2">{item.title}</p>
                <p className="text-sm text-text-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Donation Info Section */}
          <div className="dark:bg-white/[0.03] bg-surface-secondary rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-10 border border-border">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 md:w-10 md:h-10 bg-accent rounded-lg md:rounded-xl flex items-center justify-center">
                <CreditCard className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-text-main tracking-tight">{t.bankInfo}</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
              {/* Bank Details */}
              <div className="space-y-6">
                {bankAccounts.map((bank, idx) => (
                  <div key={idx} className="dark:bg-white/[0.02] bg-surface p-6 rounded-3xl border border-border">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-semibold text-text-light uppercase tracking-widest block mb-1">{t.bankLabel}</label>
                        <p className="font-bold text-text-main">{bank.bankName}</p>
                      </div>
                      
                      <div className="flex items-start justify-between group">
                        <div>
                          <label className="text-[10px] font-semibold text-text-light uppercase tracking-widest block mb-1">{t.accountLabel}</label>
                          <p className="text-xl md:text-2xl font-black text-accent tracking-tight break-all">{bank.accountNumber}</p>
                        </div>
                        <button 
                          onClick={() => handleCopyAccount(bank.accountNumber)}
                          className="p-2 md:p-3 dark:bg-white/[0.03] bg-surface-muted text-text-muted rounded-xl md:rounded-2xl hover:bg-accent hover:text-white transition-all flex-shrink-0 ml-2 cursor-pointer"
                          title={t.copyAccount}
                        >
                          {copiedAccount === bank.accountNumber ? <Check className="w-4 h-4 md:w-5 md:h-5" /> : <Copy className="w-4 h-4 md:w-5 md:h-5" />}
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] font-semibold text-text-light uppercase tracking-widest block mb-1">{t.holderLabel}</label>
                        <p className="font-bold text-text-main uppercase">{bank.accountName}</p>
                      </div>

                      <div className="pt-4 border-t border-white/[0.06] flex items-center gap-2 text-text-light text-xs italic">
                        <Coffee className="w-3 h-3" />
                        {t.motivation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="dark:bg-white/[0.02] bg-surface p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-border relative group w-full max-w-[320px]">
                  <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 w-10 h-10 md:w-12 md:h-12 bg-accent rounded-xl md:rounded-2xl flex items-center justify-center z-10">
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
                    <p className="text-[10px] md:text-xs font-semibold text-text-light uppercase tracking-widest">{t.scanToSupport}</p>
                  </div>
                </div>
                <p className="text-xs text-text-muted text-center max-w-xs italic px-4">
                  {t.scanDesc}
                </p>
              </div>
            </div>
          </div>

          {/* Footer Message */}
          <div className="mt-12 text-center space-y-4">
            <p className="text-text-light text-sm">
              {t.thanks}
            </p>
            <a
              href={`/${language === 'en' ? 'en' : 'vi'}/`}
              onClick={(e) => { e.preventDefault(); onBack(); window.scrollTo(0, 0); }}
              className="inline-flex items-center gap-2 text-sm font-bold text-accent hover:underline"
            >
              {t.back}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};