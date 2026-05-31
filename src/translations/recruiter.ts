/** Recruiter / Tuyển dụng */
export const recruiter = {
  // ── Navigation ──
  recruiterTab: {
    vi: "Tuyển dụng",
    en: "Recruitment",
  },

  // ── RecruiterView ──
  recruiterViewTitle: {
    vi: "Đợt tuyển dụng",
    en: "Recruitment Campaigns",
  },
  recruiterViewCount: {
    vi: "{count} đợt",
    en: "{count} campaigns",
  },
  recruiterCreateBtn: {
    vi: "Tạo mới",
    en: "New",
  },
  recruiterEmptyTitle: {
    vi: "Chưa có đợt tuyển dụng nào",
    en: "No recruitment campaigns yet",
  },
  recruiterEmptyDesc: {
    vi: "Tạo đợt tuyển dụng đầu tiên, upload CV ứng viên và để AI phân tích, xếp hạng tự động.",
    en: "Create your first campaign, upload candidate CVs and let AI analyze and rank them automatically.",
  },
  recruiterCreateFirst: {
    vi: "Tạo đợt đầu tiên",
    en: "Create first campaign",
  },
  recruiterUpgradeFeature: {
    vi: "Gói Nhà tuyển dụng",
    en: "Recruiter Plan",
  },
  recruiterUpgradeDesc: {
    vi: "Nâng cấp lên gói Recruiter để mở khóa bộ công cụ tuyển dụng chuyên nghiệp với AI.",
    en: "Upgrade to the Recruiter plan to unlock professional AI-powered recruitment tools.",
  },
  recruiterUpgradeBenefitCampaigns: {
    vi: "Tạo tối đa 10 đợt tuyển dụng / tháng",
    en: "Create up to 10 recruitment campaigns / month",
  },
  recruiterUpgradeBenefitBatch: {
    vi: "Upload và phân tích 50 CV mỗi đợt",
    en: "Upload & analyze 50 CVs per campaign",
  },
  recruiterUpgradeBenefitExcel: {
    vi: "Xuất báo cáo Excel chi tiết",
    en: "Export detailed Excel reports",
  },
  recruiterUpgradeBenefitNotes: {
    vi: "Ghi chú nội bộ & quản lý trạng thái ứng viên",
    en: "Internal notes & candidate status management",
  },
  recruiterUpgradeSeeComparison: {
    vi: "Xem so sánh chi tiết",
    en: "See detailed comparison",
  },

  // ── CampaignCard ──
  campaignStatusActive: {
    vi: "Đang mở",
    en: "Active",
  },
  campaignStatusClosed: {
    vi: "Đã đóng",
    en: "Closed",
  },
  campaignStatusArchived: {
    vi: "Đã lưu trữ",
    en: "Archived",
  },
  campaignMenuClose: {
    vi: "Đóng đợt",
    en: "Close campaign",
  },
  campaignMenuReopen: {
    vi: "Mở lại",
    en: "Reopen",
  },
  campaignMenuDelete: {
    vi: "Xoá",
    en: "Delete",
  },
  campaignCvCount: {
    vi: "CV",
    en: "CVs",
  },
  campaignAnalyzedCount: {
    vi: "đã PT",
    en: "analyzed",
  },
  campaignShortlistedCount: {
    vi: "shortlist",
    en: "shortlist",
  },

  // ── CreateCampaignModal ──
  createCampaignTitle: {
    vi: "Tạo đợt tuyển dụng mới",
    en: "New Recruitment Campaign",
  },
  createCampaignNameLabel: {
    vi: "Tên đợt",
    en: "Campaign Name",
  },
  createCampaignNamePlaceholder: {
    vi: "Ví dụ: Tuyển Backend Developer Q3/2026",
    en: "e.g.: Backend Developer Q3/2026",
  },
  createCampaignJdLabel: {
    vi: "Mô tả công việc (JD)",
    en: "Job Description (JD)",
  },
  createCampaignJdPlaceholder: {
    vi: "Dán nội dung JD vào đây...",
    en: "Paste JD content here...",
  },
  createCampaignUploadFile: {
    vi: "Upload file",
    en: "Upload file",
  },
  createCampaignSelectJd: {
    vi: "Chọn từ kho JD",
    en: "Select from saved JDs",
  },
  createCampaignRequiredName: {
    vi: "Vui lòng nhập tên đợt tuyển dụng",
    en: "Please enter a campaign name",
  },
  createCampaignRequiredJd: {
    vi: "Vui lòng nhập mô tả công việc (JD)",
    en: "Please enter a job description (JD)",
  },
  createCampaignError: {
    vi: "Không thể tạo đợt tuyển dụng",
    en: "Unable to create campaign",
  },
  createCampaignJdFileError: {
    vi: "Không đọc được file JD",
    en: "Could not read JD file",
  },
  createCampaignCancel: {
    vi: "Huỷ",
    en: "Cancel",
  },
  createCampaignSubmit: {
    vi: "Tạo đợt →",
    en: "Create →",
  },
  createCampaignSubmitting: {
    vi: "Đang tạo...",
    en: "Creating...",
  },
  createCampaignRequiredMark: {
    vi: "*",
    en: "*",
  },

  // ── CampaignDetailView ──
  detailLoading: {
    vi: "Đang tải...",
    en: "Loading...",
  },
  detailUploadError: {
    vi: "Upload thất bại",
    en: "Upload failed",
  },
  detailAnalyzeError: {
    vi: "Phân tích thất bại",
    en: "Analysis failed",
  },
  detailUpdateError: {
    vi: "Cập nhật thất bại",
    en: "Update failed",
  },
  detailExportError: {
    vi: "Xuất Excel thất bại",
    en: "Excel export failed",
  },
  detailJdLabel: {
    vi: "Mô tả công việc (JD)",
    en: "Job Description (JD)",
  },
  detailCvAnalyzedCount: {
    vi: "{candidateCount} CV · {analyzedCount} đã phân tích",
    en: "{candidateCount} CVs · {analyzedCount} analyzed",
  },
  detailFilterAnalyzedOnly: {
    vi: "Đã PT",
    en: "Analyzed",
  },
  detailUploadCv: {
    vi: "Upload CV",
    en: "Upload CV",
  },
  detailUploadCvLoading: {
    vi: "Đang tải...",
    en: "Uploading...",
  },
  detailAnalyzeBtn: {
    vi: "PT {count} CV",
    en: "Analyze {count} CVs",
  },
  detailAnalyzeBtnRunning: {
    vi: "Đang PT...",
    en: "Analyzing...",
  },
  detailExportExcel: {
    vi: "Excel",
    en: "Excel",
  },
  detailErrorClose: {
    vi: "Đóng",
    en: "Close",
  },
  detailLoadingCandidates: {
    vi: "Đang tải danh sách ứng viên...",
    en: "Loading candidates...",
  },
  detailDeleteConfirm: {
    vi: 'Xoá CV của "{name}"? Hành động này không thể hoàn tác.',
    en: 'Delete CV of "{name}"? This action cannot be undone.',
  },

  // ── CandidateTable ──
  tableNoCandidates: {
    vi: "Chưa có ứng viên",
    en: "No candidates yet",
  },
  tableNoCandidatesDesc: {
    vi: "Tải lên CV để bắt đầu phân tích và xếp hạng.",
    en: "Upload CVs to start analysis and ranking.",
  },
  tableColIndex: {
    vi: "#",
    en: "#",
  },
  tableColCandidate: {
    vi: "Ứng viên",
    en: "Candidate",
  },
  tableColScore: {
    vi: "Điểm",
    en: "Score",
  },
  tableColStatus: {
    vi: "Trạng thái",
    en: "Status",
  },
  tableStatusAnalyzing: {
    vi: "Đang PT",
    en: "Analyzing",
  },
  tableStatusPending: {
    vi: "Chờ PT",
    en: "Pending",
  },
  tableStatusError: {
    vi: "Lỗi",
    en: "Error",
  },
  tableDeleteTitle: {
    vi: "Xoá CV",
    en: "Delete CV",
  },
  tableHrStatusNew: {
    vi: "Mới",
    en: "New",
  },
  tableHrStatusShortlisted: {
    vi: "Shortlist",
    en: "Shortlist",
  },
  tableHrStatusInterviewing: {
    vi: "Phỏng vấn",
    en: "Interviewing",
  },
  tableHrStatusRejected: {
    vi: "Loại",
    en: "Rejected",
  },
  tableHrStatusHired: {
    vi: "Đã tuyển",
    en: "Hired",
  },

  // ── CandidatePanel ──
  panelStatusAnalyzing: {
    vi: "Đang PT",
    en: "Analyzing",
  },
  panelStatusPending: {
    vi: "Chờ PT",
    en: "Pending",
  },
  panelStatusError: {
    vi: "Lỗi",
    en: "Error",
  },
  panelProbability: {
    vi: "Xác suất",
    en: "Probability",
  },
  panelMainFactor: {
    vi: "Yếu tố chính",
    en: "Main Factor",
  },
  panelMatchScore: {
    vi: "Điểm khớp",
    en: "Match Score",
  },
  panelVerdictPotential: {
    vi: "Ứng viên tiềm năng",
    en: "High Potential",
  },
  panelVerdictConsider: {
    vi: "Cân nhắc",
    en: "Consider",
  },
  panelVerdictNotFit: {
    vi: "Chưa phù hợp",
    en: "Not a fit",
  },
  panelAnalysisError: {
    vi: "Lỗi phân tích",
    en: "Analysis error",
  },
  panelHrStatusLabel: {
    vi: "Trạng thái tuyển dụng",
    en: "Recruitment Status",
  },
  panelHrNoteLabel: {
    vi: "Ghi chú nội bộ",
    en: "Internal Notes",
  },
  panelHrNotePlaceholder: {
    vi: "Ghi chú cho ứng viên này...",
    en: "Notes for this candidate...",
  },
  panelSaveNote: {
    vi: "Lưu ghi chú",
    en: "Save note",
  },
  panelSaving: {
    vi: "Đang lưu...",
    en: "Saving...",
  },
  panelSaved: {
    vi: "Đã lưu",
    en: "Saved",
  },
  panelSaveError: {
    vi: "Lỗi khi lưu — thử lại",
    en: "Error saving — try again",
  },
  panelAnalysisResult: {
    vi: "Kết quả phân tích",
    en: "Analysis Results",
  },
  panelStrengths: {
    vi: "Điểm mạnh",
    en: "Strengths",
  },
  panelWeaknesses: {
    vi: "Điểm yếu",
    en: "Weaknesses",
  },
  panelCategoryScores: {
    vi: "Điểm theo hạng mục",
    en: "Category Scores",
  },
  panelCatSkill: {
    vi: "Kỹ năng",
    en: "Skills",
  },
  panelCatExperience: {
    vi: "Kinh nghiệm",
    en: "Experience",
  },
  panelCatTools: {
    vi: "Công cụ",
    en: "Tools",
  },
  panelCatEducation: {
    vi: "Học vấn",
    en: "Education",
  },
  panelMatchedSkills: {
    vi: "Kỹ năng đạt",
    en: "Matched Skills",
  },
  panelMissingSkills: {
    vi: "Kỹ năng thiếu",
    en: "Missing Skills",
  },
  panelViewFullDetail: {
    vi: "Xem chi tiết đầy đủ",
    en: "View full details",
  },
} as const;