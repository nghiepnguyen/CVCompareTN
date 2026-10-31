/** Admin */
export const admin = {
  adminSystemControl: {
    vi: "System Control Center",
    en: "System Control Center",
  },
  adminPageTitle: {
    vi: "Trang Quản Trị",
    en: "Administration",
  },
  adminPageDesc: {
    vi: "Quản lý người dùng, phân quyền hệ thống và kiểm tra hạ tầng thông báo.",
    en: "Manage users, permissions, and notification infrastructure.",
  },
  adminTabUsers: {
    vi: "Người dùng",
    en: "Users",
  },
  adminTabReport: {
    vi: "Báo cáo",
    en: "Report",
  },
  adminTabAudit: {
    vi: "Nhật ký",
    en: "Audit",
  },
  adminAuditTitle: {
    vi: "Nhật ký quản trị",
    en: "Admin audit log",
  },
  adminAuditDesc: {
    vi: "Các thao tác thay đổi quyền, gói, hạn mức và xoá tài khoản.",
    en: "Role, plan, limit and account-deletion actions.",
  },
  adminAuditFilterAction: {
    vi: "Hành động",
    en: "Action",
  },
  adminAuditAllActions: {
    vi: "Tất cả",
    en: "All",
  },
  adminAuditSearchPlaceholder: {
    vi: "Tìm email admin / user...",
    en: "Search admin / user email...",
  },
  adminAuditColTime: {
    vi: "Thời gian",
    en: "Time",
  },
  adminAuditColActor: {
    vi: "Admin",
    en: "Admin",
  },
  adminAuditColAction: {
    vi: "Hành động",
    en: "Action",
  },
  adminAuditColTarget: {
    vi: "Đối tượng",
    en: "Target",
  },
  adminAuditColDetails: {
    vi: "Chi tiết",
    en: "Details",
  },
  adminAuditEmpty: {
    vi: "Chưa có bản ghi phù hợp.",
    en: "No matching audit entries.",
  },
  adminAuditPaginationInfo: {
    vi: "Hiển thị {start}–{end} / {total} bản ghi",
    en: "Showing {start}–{end} of {total} entries",
  },
  adminAuditLoadError: {
    vi: "Không tải được nhật ký: {message}",
    en: "Could not load audit log: {message}",
  },
  adminAuditActionUpdateRole: {
    vi: "Đổi vai trò",
    en: "Role change",
  },
  adminAuditActionUpdatePlan: {
    vi: "Đổi gói",
    en: "Plan change",
  },
  adminAuditActionDeleteUser: {
    vi: "Xoá user",
    en: "Delete user",
  },
  adminAuditActionUpdatePermission: {
    vi: "Khoá / mở khoá",
    en: "Lock / unlock",
  },
  adminAuditActionUpdateAnalyticsLimit: {
    vi: "Đổi hạn mức",
    en: "Limit change",
  },
  adminAuditActionResetAnalyticsLimit: {
    vi: "Reset hạn mức",
    en: "Limit reset",
  },
  adminAuditActionUpdateAppSetting: {
    vi: "Đổi cấu hình",
    en: "Setting change",
  },
  adminAuditActionExportData: {
    vi: "Xuất dữ liệu",
    en: "Data export",
  },
  adminToastSaved: {
    vi: "Đã lưu thay đổi.",
    en: "Changes saved.",
  },
  adminToastRoleUpdated: {
    vi: "Đã cập nhật vai trò.",
    en: "Role updated.",
  },
  adminToastDeleted: {
    vi: "Đã xoá tài khoản.",
    en: "Account deleted.",
  },
  adminToastLocked: {
    vi: "Đã khoá tài khoản.",
    en: "Account locked.",
  },
  adminToastUnlocked: {
    vi: "Đã mở khoá tài khoản.",
    en: "Account unlocked.",
  },
  adminToastBulkDone: {
    vi: "Đã cập nhật {count} tài khoản.",
    en: "Updated {count} account(s).",
  },
  adminToastExported: {
    vi: "Đã xuất CSV.",
    en: "CSV exported.",
  },
  adminBulkSelected: {
    vi: "Đã chọn {count}",
    en: "{count} selected",
  },
  adminBulkMarkRead: {
    vi: "Đánh dấu đã đọc",
    en: "Mark read",
  },
  adminBulkLock: {
    vi: "Khoá",
    en: "Lock",
  },
  adminBulkUnlock: {
    vi: "Mở khoá",
    en: "Unlock",
  },
  adminBulkClear: {
    vi: "Bỏ chọn",
    en: "Clear",
  },
  adminConfirmDeleteTitle: {
    vi: "Xoá tài khoản",
    en: "Delete account",
  },
  adminConfirmRoleTitle: {
    vi: "Đổi vai trò",
    en: "Change role",
  },
  adminTypeEmailToConfirm: {
    vi: "Gõ chính xác email {email} để xác nhận:",
    en: "Type the exact email {email} to confirm:",
  },
  adminExportUsersCsv: {
    vi: "Xuất CSV",
    en: "Export CSV",
  },
  adminExportReportCsv: {
    vi: "Xuất báo cáo CSV",
    en: "Export report CSV",
  },
  adminExportTooMany: {
    vi: "Chỉ xuất tối đa {max} dòng mỗi lần (hiện có {count}). Hãy thu hẹp bộ lọc.",
    en: "Export is limited to {max} rows per file ({count} matching). Narrow the filters.",
  },
  adminReportFilterToday: {
    vi: "Hôm nay",
    en: "Today",
  },
  adminReportFilterWeek: {
    vi: "7 ngày",
    en: "7 days",
  },
  adminReportFilterMonth: {
    vi: "30 ngày",
    en: "30 days",
  },
  adminReportNewUsers: {
    vi: "User mới đăng ký",
    en: "New registrations",
  },
  adminReportTotalAnalyses: {
    vi: "Tổng lượt phân tích",
    en: "Total analyses",
  },
  adminReportAnalysesThisMonth: {
    vi: "Lượt phân tích / tháng",
    en: "Analyses / month",
  },
  adminReportAnalysesThisMonthTooltip: {
    vi: "Tổng lượt phân tích (thành công + lỗi) từ đầu tháng dương lịch hiện tại đến nay, không đổi theo bộ lọc Hôm nay/7 ngày/30 ngày ở trên.",
    en: "Total analyses (success + error) since the start of the current calendar month, regardless of the Today/7d/30d filter above.",
  },
  adminReportQuotaUsed: {
    vi: "Quota đã dùng (chu kỳ hiện tại)",
    en: "Quota used (current cycle)",
  },
  adminReportQuotaTooltip: {
    vi: "Tổng usage_count hiện tại của user không phải admin. Mỗi user reset theo ngày đăng ký (quota_reset_day), nên số này không theo bộ lọc ngày ở trên.",
    en: "Current usage_count total across non-admin users. Each user resets on their own quota_reset_day, so this is not scoped to the date filter above.",
  },
  adminReportQuotaAsOf: {
    vi: "Tính đến {time}",
    en: "As of {time}",
  },
  adminReportOpsTitle: {
    vi: "Vận hành",
    en: "Operations",
  },
  adminReportLatencyP50: {
    vi: "Latency p50",
    en: "Latency p50",
  },
  adminReportLatencyP95: {
    vi: "Latency p95",
    en: "Latency p95",
  },
  adminReportErrorCategories: {
    vi: "Lỗi analyze theo loại",
    en: "Analyze errors by category",
  },
  adminReportNoErrors: {
    vi: "Không có lỗi trong khoảng này.",
    en: "No errors in this range.",
  },
  adminReportModelMix: {
    vi: "Model & chi phí",
    en: "Model & cost",
  },
  adminReportRefresh: {
    vi: "Làm mới",
    en: "Refresh",
  },
  adminReportSuccessCount: {
    vi: "Thành công",
    en: "Successful",
  },
  adminReportErrorCount: {
    vi: "Thất bại",
    en: "Failed",
  },
  adminReportDailyChartTitle: {
    vi: "Lượt phân tích theo ngày",
    en: "Analyses per day",
  },
  adminReportTopUsersTitle: {
    vi: "Người dùng phân tích nhiều nhất",
    en: "Most active users",
  },
  adminReportColRank: {
    vi: "#",
    en: "#",
  },
  adminReportColUser: {
    vi: "Người dùng",
    en: "User",
  },
  adminReportColCount: {
    vi: "Số lượt",
    en: "Analyses",
  },
  adminReportColCountTooltip: {
    vi: "Bao gồm cả lượt lỗi (status='error'), không chỉ lượt thành công.",
    en: "Includes failed attempts (status='error'), not just successful ones.",
  },
  adminReportEmptyState: {
    vi: "Chưa có dữ liệu phân tích trong khoảng thời gian này.",
    en: "No analysis data in this time range yet.",
  },
  adminReportLoadError: {
    vi: "Không tải được báo cáo: {message}",
    en: "Could not load report: {message}",
  },
  adminReportTokenSectionTitle: {
    vi: "Token & Chi phí AI",
    en: "AI Token & Cost",
  },
  adminReportAvgInputTokens: {
    vi: "TB Input Tokens",
    en: "Avg Input Tokens",
  },
  adminReportAvgOutputTokens: {
    vi: "TB Output Tokens",
    en: "Avg Output Tokens",
  },
  adminReportAvgTotalTokens: {
    vi: "TB Total Tokens",
    en: "Avg Total Tokens",
  },
  adminReportAvgCost: {
    vi: "Chi phí TB/lượt",
    en: "Avg Cost / Analysis",
  },
  adminReportTotalCostSubtitle: {
    vi: "Tổng chi phí kỳ này: {amount}",
    en: "Total this period: {amount}",
  },
  adminReportUnpricedModels: {
    vi: "Chưa có bảng giá, không tính vào chi phí: {models}",
    en: "No pricing yet, excluded from cost: {models}",
  },
  adminReportAvgTokenTooltip: {
    vi: "Tổng token của cả 3 loại gọi Gemini (analyze + parse_cv + rewrite) trong một lượt phân tích, chia cho số lượt phân tích thành công — không phải trung bình mỗi lệnh gọi Gemini riêng lẻ.",
    en: "Sums tokens across all 3 Gemini calls in one analysis (analyze + parse_cv + rewrite), divided by successful analyses — not the average per individual Gemini call.",
  },
  adminNewProfilesTitle: {
    vi: "Phát hiện {count} hồ sơ mới",
    en: "{count} new profile(s) detected",
  },
  adminNewProfilesSubtitle: {
    vi: "Yêu cầu xác nhận quyền truy cập",
    en: "Access approval required",
  },
  adminDirectoryTitle: {
    vi: "Danh sách định danh",
    en: "User directory",
  },
  adminSearchPlaceholder: {
    vi: "Tìm kiếm danh bạ...",
    en: "Search directory...",
  },
  adminFilterRole: {
    vi: "Vai trò",
    en: "Role",
  },
  adminFilterRoleAll: {
    vi: "Tất cả",
    en: "All",
  },
  adminFilterRoleUser: {
    vi: "User",
    en: "User",
  },
  adminFilterRoleAdmin: {
    vi: "Admin",
    en: "Admin",
  },
  adminFilterPlan: {
    vi: "Gói",
    en: "Plan",
  },
  adminFilterPlanAll: {
    vi: "Tất cả",
    en: "All",
  },
  adminFilterPlanFree: {
    vi: "Free",
    en: "Free",
  },
  adminFilterPlanPro: {
    vi: "Pro",
    en: "Pro",
  },
  adminFilterPlanRecruiter: {
    vi: "Recruiter",
    en: "Recruiter",
  },
  adminFilterStatus: {
    vi: "Trạng thái",
    en: "Status",
  },
  adminFilterStatusAll: {
    vi: "Tất cả",
    en: "All",
  },
  adminFilterStatusActive: {
    vi: "Hoạt động",
    en: "Active",
  },
  adminFilterStatusLocked: {
    vi: "Đã khóa",
    en: "Locked",
  },
  adminSortLabel: {
    vi: "Sắp xếp",
    en: "Sort",
  },
  adminSortCreatedDesc: {
    vi: "Mới nhất",
    en: "Newest",
  },
  adminSortCreatedAsc: {
    vi: "Cũ nhất",
    en: "Oldest",
  },
  adminSortUsageDesc: {
    vi: "Dùng nhiều nhất",
    en: "Most used",
  },
  adminSortNameAsc: {
    vi: "Tên A–Z",
    en: "Name A–Z",
  },
  adminSortExpiryAsc: {
    vi: "Sắp hết hạn",
    en: "Expiring first",
  },
  adminColMember: {
    vi: "Thành viên",
    en: "Member",
  },
  adminColFormat: {
    vi: "Vai trò",
    en: "Role",
  },
  adminColPlan: {
    vi: "Gói",
    en: "Plan",
  },
  adminPlanFree: {
    vi: "Free",
    en: "Free",
  },
  adminPlanPro: {
    vi: "Pro",
    en: "Pro",
  },
  adminPlanGrantFree: {
    vi: "Chuyển Free",
    en: "Set Free",
  },
  adminPlanGrantPro30: {
    vi: "Pro +30 ngày",
    en: "Pro +30 days",
  },
  adminPlanGrantPro90: {
    vi: "Pro +90 ngày",
    en: "Pro +90 days",
  },
  adminPlanGrantPro365: {
    vi: "Pro +365 ngày",
    en: "Pro +365 days",
  },
  adminPlanGrantRecruiter30: {
    vi: "Recruiter +30 ngày",
    en: "Recruiter +30 days",
  },
  adminPlanChangeError: {
    vi: "Không cập nhật được gói: {message}",
    en: "Could not update plan: {message}",
  },
  adminPlanRecruiterNoDowngrade: {
    vi: "User đang dùng Recruiter (cao hơn Pro) — không thể hạ xuống Pro. Muốn đổi, hãy chuyển về Free trước.",
    en: "User is on Recruiter (higher than Pro) — cannot downgrade to Pro. To change, switch to Free first.",
  },
  adminColAnalytics: {
    vi: "Phân tích / tháng",
    en: "Analyses / month",
  },
  adminAnalyticsUsedOfLimit: {
    vi: "{used} / {limit}",
    en: "{used} / {limit}",
  },
  adminAnalyticsUnlimited: {
    vi: "Không giới hạn",
    en: "Unlimited",
  },
  adminAnalyticsLimitLabel: {
    vi: "Giới hạn tháng",
    en: "Monthly limit",
  },
  adminAnalyticsLimitPlaceholder: {
    vi: "Số lượt / tháng",
    en: "Analyses / month",
  },
  adminColStatus: {
    vi: "Tình trạng",
    en: "Status",
  },
  adminColInit: {
    vi: "Khởi tạo",
    en: "Joined",
  },
  adminColActions: {
    vi: "Hành động",
    en: "Actions",
  },
  adminToggleRole: {
    vi: "Chuyển đổi vai trò",
    en: "Toggle role",
  },
  adminLock: {
    vi: "Khóa",
    en: "Lock",
  },
  adminUnlock: {
    vi: "Mở",
    en: "Unlock",
  },
  adminDelete: {
    vi: "Xóa",
    en: "Delete",
  },
  adminUsageAnalytic: {
    vi: "Analytic",
    en: "Analytic",
  },
  adminStatusActive: {
    vi: "Hoạt động",
    en: "Active",
  },
  adminStatusLocked: {
    vi: "Đã khóa",
    en: "Locked",
  },
  adminInvalidAnalyticsLimit: {
    vi: "Giới hạn phải là số nguyên không âm.",
    en: "Limit must be a non-negative integer.",
  },
  adminGlobalAnalyticsTitle: {
    vi: "Hạn mức phân tích mặc định / tháng",
    en: "Default monthly analysis limit",
  },
  adminGlobalAnalyticsDesc: {
    vi: "Áp dụng cho mọi user đang dùng mặc định hệ thống. Đổi tại đây hoặc trong Supabase — không cần deploy lại.",
    en: "Applies to users on the system default. Change here or in Supabase — no redeploy needed.",
  },
  adminGlobalAnalyticsSave: {
    vi: "Lưu mặc định",
    en: "Save default",
  },
  adminGlobalAnalyticsSaved: {
    vi: "Đã cập nhật hạn mức mặc định.",
    en: "Default limit updated.",
  },
  adminAnalyticsUsingDefault: {
    vi: "Mặc định ({limit}/tháng)",
    en: "Default ({limit}/mo)",
  },
  adminAnalyticsLimitPlaceholderInherit: {
    vi: "Mặc định: {limit}",
    en: "Default: {limit}",
  },
  adminConfirmDelete: {
    vi: "Xóa vĩnh viễn {email}? Toàn bộ CV, lịch sử và thanh toán sẽ mất, không thể hoàn tác.",
    en: "Permanently delete {email}? All CVs, history, and payments will be lost and cannot be restored.",
  },
  adminEditUserButton: {
    vi: "Chỉnh sửa ▾",
    en: "Edit ▾",
  },
  adminCustomLimitBadge: {
    vi: "(tuỳ chỉnh)",
    en: "(custom)",
  },
  adminEditUserTitle: {
    vi: "Chỉnh sửa người dùng",
    en: "Edit user",
  },
  adminPlanSectionLabel: {
    vi: "Gói dịch vụ",
    en: "Plan",
  },
  adminResetToGlobalLimitWithValue: {
    vi: "Dùng mặc định ({limit}/tháng)",
    en: "Use default ({limit}/month)",
  },
  adminCancel: {
    vi: "Huỷ",
    en: "Cancel",
  },
  adminSaveChanges: {
    vi: "Lưu thay đổi",
    en: "Save changes",
  },
  adminPaginationDbTotal: {
    vi: "· tổng {total} trong hệ thống",
    en: "· {total} total in database",
  },
  adminConfirmRoleChange: {
    vi: "Đổi quyền của {email} thành \"{role}\"?",
    en: "Change {email}'s role to \"{role}\"?",
  },
  adminDismissError: {
    vi: "Đóng thông báo lỗi",
    en: "Dismiss error",
  },
  adminUsersEmptyState: {
    vi: "Không có người dùng nào khớp.",
    en: "No matching users.",
  },
  adminLoadingMore: {
    vi: "Đang tải...",
    en: "Loading...",
  },
  adminLoadMoreUsers: {
    vi: "Tải thêm (đã tải {count})",
    en: "Load more ({count} loaded)",
  },
  adminMarkReadError: {
    vi: "Lỗi: {message}",
    en: "Error: {message}",
  },
  adminGuest: {
    vi: "Guest",
    en: "Guest",
  },
  adminPaginationInfo: {
    vi: "Hiển thị {start}–{end} / {total} người dùng",
    en: "Showing {start}–{end} of {total} users",
  },
  adminLimitModeInherit: {
    vi: "Theo mặc định hệ thống",
    en: "Use system default",
  },
  adminLimitModeCustom: {
    vi: "Giới hạn riêng",
    en: "Custom limit",
  },
  adminLegacyUnlimitedWarning: {
    vi: "Tài khoản đang ở trạng thái không giới hạn (dữ liệu cũ). Chọn mặc định hoặc nhập giới hạn cụ thể; không thể tạo mới trạng thái này.",
    en: "This account is currently unlimited (legacy data). Choose the system default or enter a specific limit; this state cannot be created anymore.",
  },
  adminPlanStackingHint: {
    vi: "Nếu gói còn hạn, thời gian sẽ được cộng thêm.",
    en: "If the plan is still active, the duration is added on top.",
  },
  adminGlobalAnalyticsLoadError: {
    vi: "Không tải được hạn mức mặc định. Kiểm tra kết nối rồi thử lại.",
    en: "Could not load the default limit. Check your connection and retry.",
  },
  adminUsersLoadError: {
    vi: "Không tải được danh sách người dùng: {message}",
    en: "Could not load users: {message}",
  },
  adminFilterLoadError: {
    vi: "Không tải được dữ liệu tìm kiếm: {message}",
    en: "Could not load search data: {message}",
  },
  adminRetry: {
    vi: "Thử lại",
    en: "Retry",
  },
} as const;