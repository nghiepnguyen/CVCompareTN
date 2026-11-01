/** Result & ATS analysis */
export const result = {
  atsScore: {
    vi: "Mức độ tương thích hệ thống",
    en: "ATS Compatibility Score",
  },
  atsDesc: {
    vi: "Dựa trên phân tích từ khóa, cấu trúc và yêu cầu kỹ thuật của JD, CV của bạn đạt mức tương thích này với hệ thống lọc tự động (ATS).",
    en: "Based on keyword analysis, structure, and technical requirements of the JD, your CV achieves this compatibility level with automated filtering systems (ATS).",
  },
  atsFormatTitle: {
    vi: "Khả năng đọc được của ATS (định dạng file)",
    en: "ATS Readability (File Format)",
  },
  atsFormatDesc: {
    vi: "Đánh giá riêng về bố cục/định dạng file CV — độc lập với nội dung — dựa trên việc quan sát trực tiếp file gốc.",
    en: "A separate assessment of your CV file's layout/format — independent of content — based on directly inspecting the original file.",
  },
  atsFormatScoreLabel: {
    vi: "Điểm khả năng đọc",
    en: "Parseability Score",
  },
  atsFormatUnavailable: {
    vi: "Chưa thể phân tích định dạng cho lần này — hãy tải lên file PDF dưới ~15MB để nhận đánh giá bố cục/layout chi tiết.",
    en: "Format analysis wasn't available for this upload — try uploading a PDF under ~15MB for a detailed layout assessment.",
  },
  atsFormatIssuesTitle: {
    vi: "Phát hiện cụ thể",
    en: "Specific Findings",
  },
  atsFormatFlagMultiColumn: {
    vi: "Bố cục nhiều cột",
    en: "Multi-column layout",
  },
  atsFormatFlagTablesGraphics: {
    vi: "Dùng bảng/hình ảnh cho nội dung chính",
    en: "Tables/graphics for core content",
  },
  atsFormatFlagStandardHeadings: {
    vi: "Tên section chuẩn ATS",
    en: "Standard section headings",
  },
  atsFormatFlagContactHeaderFooter: {
    vi: "Contact info trong header/footer",
    en: "Contact info in header/footer",
  },
  atsFormatFlagFontConsistency: {
    vi: "Font chữ nhất quán",
    en: "Consistent font",
  },
  atsFormatFlagDateConsistency: {
    vi: "Định dạng ngày nhất quán",
    en: "Consistent date format",
  },
  atsFormatFlagScannedImage: {
    vi: "File dạng scan/ảnh",
    en: "Scanned/image file",
  },
  skills: {
    vi: "Kỹ năng",
    en: "Skills",
  },
  experience: {
    vi: "Kinh nghiệm",
    en: "Experience",
  },
  tools: {
    vi: "Công cụ",
    en: "Tools",
  },
  education: {
    vi: "Học vấn",
    en: "Education",
  },
  passProb: {
    vi: "Khả năng pass vòng CV",
    en: "CV Pass Probability",
  },
  probabilityHistoryLabel: {
    vi: "Khả năng vượt vòng lọc",
    en: "Screening probability",
  },
  explanation: {
    vi: "Giải thích ngắn gọn",
    en: "Brief Explanation",
  },
  mainFactor: {
    vi: "Yếu tố ảnh hưởng nhiều nhất",
    en: "Most Influential Factor",
  },
  matchingPoints: {
    vi: "Điểm tương đồng",
    en: "Matching Points",
  },
  matchingPointsDesc: {
    vi: "Các điểm mạnh và sự phù hợp của CV với JD",
    en: "Strengths and alignment of your CV with the JD",
  },
  matchingPointsCount: {
    vi: "điểm",
    en: "points",
  },
  partialRequirements: {
    vi: "Yêu cầu đáp ứng một phần",
    en: "Partial Requirements",
  },
  partialRequirementsDesc: {
    vi: "Các yêu cầu mới được đáp ứng một phần — không tính là đạt hay thiếu",
    en: "Requirements only partly satisfied — not counted as matched or missing",
  },
  partialRequirementsCount: {
    vi: "yêu cầu",
    en: "requirements",
  },
  requiredRequirement: {
    vi: "Bắt buộc",
    en: "Required",
  },
  preferredRequirement: {
    vi: "Ưu tiên",
    en: "Preferred",
  },
  missingGaps: {
    vi: "Điểm cần cải thiện",
    en: "Missing Gaps",
  },
  missingGapsDesc: {
    vi: "Các lỗ hổng kỹ năng hoặc kinh nghiệm cần bổ sung",
    en: "Skill or experience gaps that need to be addressed",
  },
  missingGapsCount: {
    vi: "lỗ hổng",
    en: "gaps",
  },
  detailedComparison: {
    vi: "So sánh chi tiết",
    en: "Detailed Comparison",
  },
  detailedComparisonDesc: {
    vi: "Đối chiếu từng yêu cầu của JD với nội dung CV",
    en: "Comparison of each JD requirement with CV content",
  },
  detailedComparisonCount: {
    vi: "yêu cầu",
    en: "requirements",
  },
  atsKeywords: {
    vi: "Từ khóa ATS quan trọng",
    en: "Important ATS Keywords",
  },
  atsKeywordsDesc: {
    vi: "Các từ khóa quan trọng từ JD mà CV nên có",
    en: "Key terms from the JD that your CV should include",
  },
  rewriteSuggestions: {
    vi: "Gợi ý chỉnh sửa nội dung",
    en: "Content Rewrite Suggestions",
  },
  rewriteSuggestionsDesc: {
    vi: "Cách viết lại các phần trong CV để tối ưu hơn",
    en: "How to rewrite sections of your CV for better optimization",
  },
  fullRewrittenCV: {
    vi: "CV đã được tối ưu hoàn chỉnh",
    en: "Full Optimized CV",
  },
  fullRewrittenCVDesc: {
    vi: "Bản thảo CV mới dựa trên thông tin của bạn và yêu cầu của JD",
    en: "A new CV draft based on your information and JD requirements",
  },
  analysisShownInEnglish: {
    vi: "Phần phân tích đang hiển thị bằng tiếng Anh do bản dịch chưa hoàn tất. Điểm số không bị ảnh hưởng.",
    en: "The analysis is shown in English because the translation did not complete. Scores are not affected.",
  },
  copyMarkdown: {
    vi: "Sao chép Markdown",
    en: "Copy Markdown",
  },
  copyPlainText: {
    vi: "Sao chép văn bản thuần",
    en: "Copy plain text",
  },
  fullCvDraftFooter: {
    vi: "cvfit.pro · Bản nháp do cvFit tạo ra.",
    en: "cvfit.pro · Draft produced by cvFit.",
  },
  fullCvSpecimenEyebrow: {
    vi: "Mẫu · CV hoàn chỉnh",
    en: "Specimen · full CV",
  },
  premiumViewTab: {
    vi: "Premium View",
    en: "Premium View",
  },
  freePreviewTab: {
    vi: "Xem trước",
    en: "Free Preview",
  },
  freePreviewBadge: {
    vi: "Bản xem trước · Nâng cấp để mở khóa",
    en: "Preview · Upgrade to unlock",
  },
  upgradeToUnlock: {
    vi: "Nâng cấp lên Pro",
    en: "Upgrade to Pro",
  },
  freePreviewWatermarkPrimary: {
    vi: "cvFit.pro",
    en: "cvFit.pro",
  },
  freePreviewWatermarkSecondary: {
    vi: "NÂNG CẤP ĐỂ MỞ KHÓA",
    en: "UPGRADE TO UNLOCK",
  },
  upgradeFeatureExportCv: {
    vi: "Xuất CV tối ưu",
    en: "Export Optimized CV",
  },
  copy: {
    vi: "Sao chép",
    en: "Copy",
  },
  copied: {
    vi: "Đã sao chép",
    en: "Copied",
  },
  download: {
    vi: "Tải xuống",
    en: "Download",
  },
  original: {
    vi: "Gốc",
    en: "Original",
  },
  optimized: {
    vi: "Tối ưu",
    en: "Optimized",
  },
  reason: {
    vi: "Lý do",
    en: "Reason",
  },
  requirement: {
    vi: "Yêu cầu",
    en: "Requirement",
  },
  status: {
    vi: "Trạng thái",
    en: "Status",
  },
  evidence: {
    vi: "Minh chứng trong CV",
    en: "Evidence in CV",
  },
  verificationLabel: {
    vi: "Xác minh",
    en: "Verification",
  },
  verificationMet: {
    vi: "Đạt",
    en: "Met",
  },
  verificationUnmet: {
    vi: "Không đạt",
    en: "Not met",
  },
  verificationUnknown: {
    vi: "Chưa xác minh",
    en: "Unverified",
  },
  improvement: {
    vi: "Gợi ý cải thiện",
    en: "Improvement Suggestion",
  },
  matched: {
    vi: "Đạt",
    en: "Matched",
  },
  partial: {
    vi: "Một phần",
    en: "Partial",
  },
  missing: {
    vi: "Thiếu",
    en: "Missing",
  },
  high: {
    vi: "Cao",
    en: "High",
  },
  medium: {
    vi: "Trung bình",
    en: "Medium",
  },
  low: {
    vi: "Thấp",
    en: "Low",
  },
  detailedAnalysis: {
    vi: "Phân tích chi tiết:",
    en: "Detailed Analysis:",
  },
  comparisonJD: {
    vi: "Thông tin JD so sánh:",
    en: "Comparison JD Info:",
  },
  analysisProgress: {
    vi: "Tiến trình phân tích",
    en: "Analysis Progress",
  },
  aiThinking: {
    vi: "AI đang suy nghĩ...",
    en: "AI is thinking...",
  },
  analysisTime: {
    vi: "Thời gian phân tích",
    en: "Analysis Time",
  },
  sectionOther: {
    vi: "Khác",
    en: "Other",
  },
  printOptimized: {
    vi: "In CV",
    en: "Print CV",
  },
  premiumOptimizedBadge: {
    vi: "Tối ưu bởi AI Premium",
    en: "Premium AI Optimized",
  },
  processingFile: {
    vi: "Đang xử lý File...",
    en: "Processing file...",
  },
  readyToAnalyze: {
    vi: "Sẵn sàng phân tích",
    en: "Ready to analyze",
  },
  readyToAnalyzeDesc: {
    vi: "Tải lên CV của bạn và cung cấp mô tả công việc để xem thông tin chi tiết về mức độ phù hợp.",
    en: "Upload your CV and provide a job description to see detailed matching insights.",
  },
  rateResults: {
    vi: "Đánh giá kết quả phân tích",
    en: "Rate Analysis Results",
  },
  rateResultsDesc: {
    vi: "Phản hồi của bạn giúp chúng tôi cải thiện độ chính xác của AI.",
    en: "Your feedback helps us improve AI accuracy.",
  },
  thankYouRating: {
    vi: "Cảm ơn bạn đã đánh giá!",
    en: "Thank you for your rating!",
  },
  submitRating: {
    vi: "Gửi đánh giá",
    en: "Submit Rating",
  },
  feedbackPlaceholder: {
    vi: "Bạn có góp ý gì để kết quả chính xác hơn không? (Tùy chọn)",
    en: "Do you have any suggestions to make the results more accurate? (Optional)",
  },
  atsCompatibilityScore: {
    vi: "Điểm tương thích ATS",
    en: "ATS Compatibility Score",
  },
  scoreDistribution: {
    vi: "Phân bổ điểm thành phần",
    en: "Component Score Breakdown",
  },
  skillDistribution: {
    vi: "Phân bổ kỹ năng",
    en: "Skill Distribution",
  },
  comparisonColCandidate: {
    vi: "Ứng viên / CV",
    en: "Candidate / CV",
  },
  comparisonColScore: {
    vi: "Điểm số",
    en: "Score",
  },
  comparisonColProbability: {
    vi: "Khả năng vượt vòng lọc",
    en: "Screening probability",
  },
  comparisonColAction: {
    vi: "Hành động",
    en: "Action",
  },
  noComparisonDataTitle: {
    vi: "Không có dữ liệu so sánh",
    en: "No comparison data available",
  },
  noComparisonDataDesc: {
    vi: "Thông tin so sánh chi tiết hiện không khả dụng cho kết quả này.",
    en: "Detailed comparison information is currently unavailable for this result.",
  },
  categoryKeywords: {
    vi: "Từ khóa",
    en: "Keywords",
  },
  categoryGeneralSkills: {
    vi: "Kỹ năng chung",
    en: "General Skills",
  },
  categorySoftSkills: {
    vi: "Kỹ năng mềm",
    en: "Soft Skills",
  },
  categoryHardSkills: {
    vi: "Kỹ năng cứng",
    en: "Hard Skills",
  },
  categoryTechnicalSkills: {
    vi: "Kỹ năng kỹ thuật",
    en: "Technical Skills",
  },
  categoryLanguageSkills: {
    vi: "Ngoại ngữ",
    en: "Language Skills",
  },
  matchVerdictHigh: {
    vi: "CV của bạn rất phù hợp với vị trí này. Hãy tự tin ứng tuyển!",
    en: "Your CV is a great match for this position. Apply with confidence!",
  },
  matchVerdictMid: {
    vi: "CV của bạn khá phù hợp. Hãy tối ưu thêm các từ khóa để tăng cơ hội.",
    en: "Your CV is a good match. Optimize with more keywords to increase your chances.",
  },
  matchVerdictLow: {
    vi: "CV cần cải thiện đáng kể để phù hợp với yêu cầu. Hãy xem kỹ các gợi ý bên dưới.",
    en: "Your CV needs significant improvement to match the requirements. Review the suggestions below carefully.",
  },
  noChartMatchingPoints: {
    vi: "Chưa có nhóm điểm khớp để hiển thị biểu đồ.",
    en: "No matching-point categories yet for this chart.",
  },
  noMatchingGapsData: {
    vi: "Chưa có danh sách điểm khớp / khoảng trống từ phân tích. Thử chạy phân tích lại; nếu tải từ lịch sử, bản ghi có thể được lưu trước khi có đủ trường JSON.",
    en: "No matching points or gaps in this result. Try analyzing again; history rows saved before schema updates may lack this data.",
  },
  coverLetterCreate: {
    vi: "Tạo Cover Letter",
    en: "Create Cover Letter",
  },
  coverLetterTitle: {
    vi: "Cover Letter",
    en: "Cover Letter",
  },
  coverLetterIntro: {
    vi: "Thư chỉ dùng thông tin có trong CV của bạn và JD vừa phân tích. Hãy đọc lại trước khi gửi.",
    en: "The letter only uses facts from your CV and the JD you just analyzed. Review it before sending.",
  },
  coverLetterLanguage: {
    vi: "Ngôn ngữ thư",
    en: "Letter language",
  },
  coverLetterGenerate: {
    vi: "Tạo thư",
    en: "Generate",
  },
  coverLetterGenerating: {
    vi: "Đang tạo thư ứng tuyển...",
    en: "Generating cover letter...",
  },
  coverLetterCopy: {
    vi: "Sao chép",
    en: "Copy",
  },
  coverLetterCopied: {
    vi: "Đã sao chép",
    en: "Copied",
  },
  coverLetterRegenerate: {
    vi: "Tạo lại",
    en: "Regenerate",
  },
  coverLetterClose: {
    vi: "Đóng",
    en: "Close",
  },
  coverLetterFallback: {
    vi: "Không thể tạo thư ứng tuyển đủ an toàn từ thông tin hiện có. Vui lòng thử lại hoặc kiểm tra nội dung CV.",
    en: "Could not create a cover letter that is safely grounded in the available information. Please try again or check your CV content.",
  },
  coverLetterError: {
    vi: "Không thể tạo thư ứng tuyển. Vui lòng thử lại.",
    en: "Could not create the cover letter. Please try again.",
  },
  coverLetterTimeout: {
    vi: "Tạo thư mất quá nhiều thời gian. Vui lòng thử lại.",
    en: "Generating the letter took too long. Please try again.",
  },
  coverLetterRateLimited: {
    vi: "Bạn đã tạo quá nhiều thư trong giờ qua. Vui lòng thử lại sau.",
    en: "You have created too many letters in the past hour. Please try again later.",
  },
  coverLetterUnavailableHistory: {
    vi: "Chỉ khả dụng ngay sau khi phân tích (cần JD gốc).",
    en: "Available right after an analysis (needs the original JD).",
  },
  coverLetterWaitingParsedCv: {
    vi: "Đang chuẩn bị thông tin CV...",
    en: "Preparing CV data...",
  },
  coverLetterNoParsedCv: {
    vi: "Cần dữ liệu CV đã chuẩn hóa để tạo thư.",
    en: "Parsed CV data is required to create a letter.",
  },
  tabParsedCv: {
    vi: "Thông tin CV",
    en: "Parsed CV",
  },
  tabComparison: {
    vi: "So sánh",
    en: "Comparison",
  },
  tabFullCv: {
    vi: "CV Tối ưu",
    en: "Full CV",
  },
  parsedCvEmpty: {
    vi: "Không có dữ liệu CV chuẩn hóa cho kết quả này.",
    en: "No parsed CV data available for this result.",
  },
  parsedPersonalInfo: {
    vi: "Thông tin cá nhân",
    en: "Personal Information",
  },
  parsedEducation: {
    vi: "Học vấn",
    en: "Education",
  },
  parsedExperience: {
    vi: "Kinh nghiệm làm việc",
    en: "Work Experience",
  },
  parsedSkillsLang: {
    vi: "Kỹ năng & Ngôn ngữ",
    en: "Skills & Languages",
  },
  parsedProjects: {
    vi: "Dự án tiêu biểu",
    en: "Featured Projects",
  },
  parsedCertifications: {
    vi: "Chứng chỉ",
    en: "Certifications",
  },
  parsedAtsAnalysis: {
    vi: "Phân tích ATS chi tiết",
    en: "Detailed ATS Analysis",
  },
  parsedYearsExp: {
    vi: "Tổng năm kinh nghiệm",
    en: "Total Experience",
  },
  parsedHighlights: {
    vi: "Điểm mạnh nổi bật",
    en: "Key Highlights",
  },
  parsedMissingKeywords: {
    vi: "Từ khóa còn thiếu",
    en: "Missing Keywords",
  },
  parsedMissingRequirements: {
    vi: "Yêu cầu còn thiếu",
    en: "Missing requirements",
  },
  parsedPresent: {
    vi: "Hiện tại",
    en: "Present",
  },
  parsedTechSkills: {
    vi: "Kỹ năng chuyên môn",
    en: "Technical Skills",
  },
  parsedSoftSkills: {
    vi: "Kỹ năng mềm",
    en: "Soft Skills",
  },
  parsedToolsSoftware: {
    vi: "Công cụ & Phần mềm",
    en: "Tools & Software",
  },
  parsedLanguages: {
    vi: "Ngoại ngữ",
    en: "Languages",
  },
  parsedYearsUnit: {
    vi: "Năm",
    en: "Years",
  },
  progressStart: {
    vi: "Khởi tạo",
    en: "Start",
  },
  progressEstLeft: {
    vi: "Ước tính: {seconds}s còn lại",
    en: "Est: {seconds}s left",
  },
  progressEstLeftApprox: {
    vi: "Khoảng 10-20 giây",
    en: "About 10-20 seconds",
  },
  progressDone: {
    vi: "Hoàn tất",
    en: "Done",
  },
  loadingStepReadCv: {
    vi: "Đọc CV",
    en: "Read CV",
  },
  loadingStepAnalyze: {
    vi: "Phân tích",
    en: "Analyze",
  },
  loadingStepMatch: {
    vi: "Đối chiếu",
    en: "Match",
  },
  loadingStepReport: {
    vi: "Báo cáo",
    en: "Report",
  },
} as const;
