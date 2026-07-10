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
    vi: "Đồng ý",
    en: "Accept",
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
  monthlyUsageLimitExceeded: {
    vi: "Bạn đã vượt quá số lượng sử dụng của tháng này.",
    en: "You have exceeded your usage limit for this month.",
  },
  monthlyUsageLimitExceededDetail: {
    vi: "(Đã dùng {used}/{limit} lượt phân tích)",
    en: "(Used {used}/{limit} analyses)",
  },
  quotaExhaustedBuyMore: {
    vi: "Mua thêm",
    en: "Buy more",
  },
  quotaExhaustedOrWait: {
    vi: "hoặc chờ đến {date} để reset.",
    en: "or wait until {date} to reset.",
  },
  quotaExhaustedUpgradePro: {
    vi: "Nâng cấp Pro để tiếp tục.",
    en: "Upgrade to Pro to continue.",
  },
  savedCvLimitFree: {
    vi: "Gói Free chỉ lưu được 1 CV. Nâng cấp Pro để lưu tối đa 10 CV.",
    en: "Free plan allows only 1 saved CV. Upgrade to Pro to save up to 10 CVs.",
  },
  savedCvLimitPro: {
    vi: "Bạn đã đạt giới hạn lưu 10 CV. Vui lòng xóa bớt CV cũ để lưu CV mới.",
    en: "You've reached the limit of 10 saved CVs. Please delete old CVs to save new ones.",
  },
  profileTitle: {
    vi: "Thông tin cá nhân",
    en: "Profile",
  },
  profileNameLabel: {
    vi: "Họ tên",
    en: "Full Name",
  },
  profileEmailLabel: {
    vi: "Email",
    en: "Email",
  },
  profilePlanLabel: {
    vi: "Loại tài khoản",
    en: "Account Type",
  },
  profilePlanFree: {
    vi: "Miễn phí",
    en: "Free",
  },
  profilePlanPro: {
    vi: "Pro",
    en: "Pro",
  },
  profileExpiryLabel: {
    vi: "Hạn sử dụng",
    en: "Expiry Date",
  },
  profileExpiryNone: {
    vi: "Không giới hạn",
    en: "Unlimited",
  },
  profileAnalyticsLabel: {
    vi: "Số lượt phân tích",
    en: "Analytics Usage",
  },
  profileAnalyticsUnlimited: {
    vi: "Không giới hạn",
    en: "Unlimited",
  },
  profileAnalyticsResetOn: {
    vi: "Reset ngày {{date}}",
    en: "Resets on {{date}}",
  },
  profileBack: {
    vi: "Quay lại",
    en: "Back",
  },
  profilePlanRecruiter: {
    vi: "Nhà tuyển dụng",
    en: "Recruiter",
  },
  profileRecruiterLabel: {
    vi: "Thông tin gói Nhà tuyển dụng",
    en: "Recruiter Plan Info",
  },
  profileRecruiterCampaigns: {
    vi: "Số đợt tuyển dụng",
    en: "Campaigns",
  },
  profileRecruiterCampaignsLimit: {
    vi: "{used}/{limit}/tháng",
    en: "{used}/{limit}/month",
  },
  profileRecruiterBatchLabel: {
    vi: "CV mỗi đợt",
    en: "CV per batch",
  },
  profileRecruiterBatchValue: {
    vi: "Tối đa {max} CV",
    en: "Up to {max} CVs",
  },
  profileRecruiterExportLabel: {
    vi: "Xuất Excel",
    en: "Excel Export",
  },
  profileRecruiterExportYes: {
    vi: "Có",
    en: "Yes",
  },
  profileRecruiterNoteLabel: {
    vi: "Ghi chú nội bộ",
    en: "Internal Notes",
  },
  openInNewTabTooltip: {
    vi: "Mở trong tab mới để đăng nhập dễ hơn",
    en: "Open in new tab for easier login",
  },
  appBrandName: {
    vi: "cvFit",
    en: "cvFit",
  },
  unknownUser: {
    vi: "Không rõ",
    en: "Unknown",
  },
  emailPlaceholder: {
    vi: "ten@example.com",
    en: "name@example.com",
  },

  // ── Auth Modal ──
  authSignInTitle: {
    vi: "Đăng nhập",
    en: "Sign In",
  },
  authSignUpTitle: {
    vi: "Đăng ký",
    en: "Sign Up",
  },
  authEmailLabel: {
    vi: "Email",
    en: "Email",
  },
  authPasswordLabel: {
    vi: "Mật khẩu",
    en: "Password",
  },
  authNameLabel: {
    vi: "Họ tên",
    en: "Full Name",
  },
  authNamePlaceholder: {
    vi: "Nguyễn Văn A",
    en: "John Doe",
  },
  authSignInBtn: {
    vi: "Đăng nhập bằng Email",
    en: "Sign In with Email",
  },
  authSignInBtnLoading: {
    vi: "Đang đăng nhập...",
    en: "Signing In...",
  },
  authSignUpBtn: {
    vi: "Tạo tài khoản",
    en: "Create Account",
  },
  authSignUpBtnLoading: {
    vi: "Đang tạo tài khoản...",
    en: "Creating Account...",
  },
  authSwitchToSignUp: {
    vi: "Chưa có tài khoản? Đăng ký",
    en: "No account? Sign Up",
  },
  authSwitchToSignIn: {
    vi: "Đã có tài khoản? Đăng nhập",
    en: "Already have an account? Sign In",
  },
  authGoogleBtn: {
    vi: "Tiếp tục với Google",
    en: "Continue with Google",
  },
  authDivider: {
    vi: "hoặc",
    en: "or",
  },
  authForgotPassword: {
    vi: "Quên mật khẩu?",
    en: "Forgot password?",
  },
  authInvalidEmail: {
    vi: "Email không hợp lệ.",
    en: "Invalid email address.",
  },
  authWeakPassword: {
    vi: "Mật khẩu phải có ít nhất 6 ký tự.",
    en: "Password must be at least 6 characters.",
  },
  authNameRequired: {
    vi: "Vui lòng nhập họ tên.",
    en: "Please enter your name.",
  },
  authEmailInUse: {
    vi: "Email này đã được đăng ký. Vui lòng đăng nhập.",
    en: "This email is already registered. Please sign in.",
  },
  authInvalidCredentials: {
    vi: "Email hoặc mật khẩu không đúng. Vui lòng thử lại.",
    en: "Invalid email or password. Please try again.",
  },
  authSignUpSuccess: {
    vi: "Đăng ký thành công!",
    en: "Registration successful!",
  },
  authSignUpSuccessDesc: {
    vi: "Kiểm tra email để xác nhận tài khoản của bạn.",
    en: "Check your email to confirm your account.",
  },
  authGenericError: {
    vi: "Đã xảy ra lỗi. Vui lòng thử lại.",
    en: "An error occurred. Please try again.",
  },
  authEmailNotConfirmed: {
    vi: "Email chưa được xác nhận. Vui lòng kiểm tra hộp thư của bạn.",
    en: "Email not confirmed. Please check your inbox.",
  },
  authOAuthStateError: {
    vi: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng thử đăng nhập lại.",
    en: "Login session expired or invalid. Please try signing in again.",
  },
  authOAuthError: {
    vi: "Đăng nhập thất bại. Vui lòng thử lại.",
    en: "Sign-in failed. Please try again.",
  },
  authResetPasswordTitle: {
    vi: "Đặt lại mật khẩu",
    en: "Reset Password",
  },
  authResetPasswordDesc: {
    vi: "Nhập email của bạn và chúng tôi sẽ gửi link đặt lại mật khẩu.",
    en: "Enter your email and we'll send you a reset link.",
  },
  authResetPasswordBtn: {
    vi: "Gửi link đặt lại",
    en: "Send Reset Link",
  },
  authResetPasswordBtnLoading: {
    vi: "Đang gửi...",
    en: "Sending...",
  },
  authResetPasswordSuccess: {
    vi: "Link đặt lại mật khẩu đã được gửi đến email của bạn.",
    en: "A password reset link has been sent to your email.",
  },
  authBackToSignIn: {
    vi: "Quay lại đăng nhập",
    en: "Back to Sign In",
  },
  authResendTitle: {
    vi: "Gửi lại email xác nhận",
    en: "Resend Confirmation Email",
  },
  authResendDesc: {
    vi: "Nhập email bạn đã đăng ký, chúng tôi sẽ gửi lại link xác nhận mới.",
    en: "Enter the email you signed up with and we'll send a new confirmation link.",
  },
  authResendBtn: {
    vi: "Gửi lại email xác nhận",
    en: "Resend Confirmation Email",
  },
  authResendBtnLoading: {
    vi: "Đang gửi...",
    en: "Sending...",
  },
  authResendCooldownBtn: {
    vi: "Gửi lại sau",
    en: "Resend in",
  },
  authResendSuccess: {
    vi: "Đã gửi lại email xác nhận. Vui lòng kiểm tra hộp thư của bạn.",
    en: "Confirmation email resent. Please check your inbox.",
  },
  authResendPrompt: {
    vi: "Chưa nhận được email?",
    en: "Didn't receive the email?",
  },
  authResendPromptLink: {
    vi: "Gửi lại",
    en: "Resend",
  },
} as const;
