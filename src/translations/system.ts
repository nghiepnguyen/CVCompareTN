/** System, cookies & errors */
export const system = {
  inAppBrowserWarning: {
    vi: "Bạn đang mở ứng dụng từ trình duyệt trong ứng dụng (Zalo, Facebook, Messenger...). Google chặn đăng nhập từ các trình duyệt này.",
    en: "You are opening the app from an in-app browser (Zalo, Facebook, Messenger...). Google blocks login from these browsers.",
  },
  inAppBrowserAction: {
    vi: "Vui lòng nhấn vào dấu ba chấm (...) hoặc biểu tượng trình duyệt trên màn hình và chọn 'Mở bằng trình duyệt' (Chrome hoặc Safari) để tiếp tục.",
    en: "Please tap the three dots (...) or the browser icon on your screen and select 'Open in browser' (Chrome or Safari) to continue.",
  },
  openInExternalBrowser: {
    vi: "Mở bằng trình duyệt bên ngoài",
    en: "Open in External Browser",
  },
  loginErrorInApp: {
    vi: "Lỗi đăng nhập: Trình duyệt này không được Google hỗ trợ. Vui lòng mở trang web bằng Chrome hoặc Safari.",
    en: "Login Error: This browser is not supported by Google. Please open the website in Chrome or Safari.",
  },
  cookieConsentTitle: {
    vi: "Cookie phân tích",
    en: "Analytics cookies",
  },
  cookieConsentDesc: {
    vi: "Chúng tôi dùng Google Analytics (GA4) để hiểu cách bạn dùng công cụ so sánh CV — chỉ sau khi bạn đồng ý. Vercel Analytics (hiệu năng, không cookie marketing) vẫn chạy độc lập. Bạn có thể từ chối hoặc đổi lựa chọn bất cứ lúc nào trong Chính sách bảo mật.",
    en: "We use Google Analytics (GA4) to understand how you use the CV comparison tool — only after you consent. Vercel Analytics (performance, no marketing cookies) runs independently. You can decline or change your choice anytime in the Privacy Policy.",
  },
  cookieAccept: {
    vi: "Chấp nhận phân tích",
    en: "Accept analytics",
  },
  cookieAcceptLoading: {
    vi: "Đang tải…",
    en: "Loading…",
  },
  cookieReject: {
    vi: "Từ chối",
    en: "Decline",
  },
  cookiePolicy: {
    vi: "Chính sách",
    en: "Policy",
  },
  appErrorTitle: {
    vi: "Rất tiếc!",
    en: "We're sorry!",
  },
  appErrorDesc: {
    vi: "Đã có lỗi xảy ra khi khởi tạo ứng dụng. Vui lòng làm mới trang hoặc thử lại sau.",
    en: "Something went wrong while starting the app. Please refresh the page or try again later.",
  },
  appRefresh: {
    vi: "Làm mới trang",
    en: "Refresh page",
  },
  appInitializing: {
    vi: "Đang khởi tạo hệ thống...",
    en: "Initializing system...",
  },
  appLoadingContent: {
    vi: "Đang tải nội dung...",
    en: "Loading content...",
  },
  appErrorNotice: {
    vi: "Thông báo lỗi",
    en: "Error notice",
  },
  appUnknownError: {
    vi: "Đã xảy ra lỗi không xác định",
    en: "An unknown error occurred",
  },
} as const;
