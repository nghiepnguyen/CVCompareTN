# Time zone (ICT, `Asia/Ho_Chi_Minh`)

## Quy tắc

- **Lưu trữ:** mọi mốc thời gian lưu dạng `timestamptz`/ISO UTC. Database production giữ `TimeZone = UTC`, `cron.timezone = GMT`.
- **Ra lịch / ra mốc ngày-tháng** (chu kỳ quota, "hôm nay", ngày hết hạn, chart theo ngày): tính theo **ICT (UTC+7, không DST)**.
- **Hiển thị** một thời điểm (instant) từ DB: format với `timeZone: 'Asia/Ho_Chi_Minh'`, không phụ thuộc múi giờ trình duyệt hay runtime.
- **Không** thêm `timeZone` cho ngày dựng từ phần tử lịch (`new Date(y, m, d)`, ví dụ ngày reset quota tính từ cycle key `YYYY-MM-DD`): đó là nửa đêm local, format theo ICT sẽ lệch ngày ở trình duyệt UTC+8 trở lên.
- **Runtime:** không dựa vào biến `TZ` (Vercel reserve `TZ`, function chạy UTC). Truyền `timeZone` tường minh trong code.

## Rà soát (2026-10-19)

Đã kiểm tra production bằng query chỉ đọc: `current_quota_cycle` chứa `Asia/Ho_Chi_Minh`, không function `public`/`storage_internal` nào dùng `current_date`/`::date`/`date_trunc`/`to_char(now` mà thiếu ICT. Job `storage-cleanup` = `*/15 * * * *`.

### Đã đúng ICT, không đổi

| Chỗ | Ghi chú |
|-----|---------|
| `current_quota_cycle` — `supabase/migrations/20260626110000_quota_reset_by_registration_day.sql:29-45` | Chu kỳ quota theo ngày ICT. `check_analytics_quota` / `increment_usage_count` / `sync_profile_usage_month` / `effective_usage_count` đều gọi hàm này. |
| `quota_reset_day` khi nâng gói — `20260703060000_block_recruiter_to_pro_downgrade.sql:150` | `EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')`. |
| `plan_expires_at = now() + N days` — cùng file `:155-160`, `_server-lib/payment/handlers.ts:108` | Thời lượng, không phải mốc lịch. Giữ nguyên. |
| PayOS `transactionDateTime` — `_server-lib/payment/payos.ts:157-165` | Parse với `+07:00`. |
| Admin report — `src/services/adminReportService.ts:46-61` (dùng helper `vnTime`), `src/components/views/AdminReportTab.tsx:47` | Ranh giới ngày/tháng ICT; label dùng `timeZone: 'UTC'` trên day key, đúng. |
| Ngày reset quota hiển thị — `ProfileView.tsx:52-69`, `AnalysisRunContext.tsx:245`, `RecruiterContext.tsx:209` | Số học lịch thuần từ cycle key ICT; không cần `timeZone`. |
| pg_cron `storage-cleanup`, `.github/workflows/storage-cleanup.yml:4` | Chu kỳ 15 phút, không phụ thuộc múi giờ. |
| `.github/workflows/supabase-keepalive.yml:6` `0 6 */5 * *` | 06:00 UTC = 13:00 ICT; chỉ để giữ project sống. |
| `historyService.ts:156` | Cắt lịch sử theo N ngày tương đối. |

### Đã sửa (2026-10-19, đã được duyệt)

Helper chung: `src/lib/vnTime.ts` (`VN_TIME_ZONE`, `vnDateParts`, `vnStartOfDay`, `vnSignupQuotaCycle`). Test ranh giới: `src/__tests__/lib/vnTime.test.ts`; `vitest.config.ts` đặt `TZ=UTC` để test không pass nhờ máy đặt ở VN.

**(a) Chỉ hiển thị** — thêm `timeZone: 'Asia/Ho_Chi_Minh'`:

| Chỗ | Lỗi hiện tại |
|-----|--------------|
| `_server-lib/payment/vipUpgradeEmail.ts:39` | Email chạy trên Vercel (UTC): thanh toán sau 17:00 ICT hiện ngày hết hạn sớm 1 ngày. |
| `src/lib/planLimits.ts:59` (`formatPlanExpiryDate`) | Theo múi giờ trình duyệt. |
| `src/components/views/AdminView.tsx:580, 613` | `planExpiresAt`, `createdAt`. |
| `src/components/views/HistoryView.tsx:145, 326` | Chart + danh sách lịch sử. |
| `src/components/views/ResultView.tsx:98` | Thời gian phân tích. |
| `src/app/SavedCvsListModal.tsx:146`, `src/app/SavedJdsListModal.tsx:141` | Ngày lưu CV/JD. |
| `src/components/recruiter/CampaignCard.tsx:139` | Ngày tạo campaign. |
| `src/context/recruiter/RecruiterContext.tsx:424` | Cột "Thời gian PT" trong file Excel export. |

**(b) Thay đổi hành vi nhỏ:**

| Chỗ | Thay đổi |
|-----|----------|
| `src/services/userService.ts:146-159` (`createUserProfile`) | Bỏ `new Date(toLocaleString(...))` (parse chuỗi không chuẩn, có thể Invalid Date và làm hỏng tạo profile) bằng helper offset cố định. Bỏ `created_at` khỏi payload (DB có `DEFAULT now()`; giá trị hiện tại lệch theo offset trình duyệt ngoài ICT). `quota_reset_day`/`usage_month` không đổi giá trị với ICT. |
| `src/components/views/HistoryView.tsx:48-58` | Bộ lọc "Hôm nay / 7 ngày / 30 ngày" lấy nửa đêm ICT thay vì nửa đêm trình duyệt. |
| `src/services/ai/parsedCvNormalize.ts:55` | Tháng "hiện tại" khi tính số năm kinh nghiệm theo ICT (server chạy UTC). |
| `profiles.usage_month` DEFAULT (live: `to_char(now() AT TIME ZONE 'UTC','YYYY-MM')`, từ `20260520120000_profiles_monthly_analytics_limit.sql:9`) | Migration `20261019000000_usage_month_default_ict.sql` đổi default thành `public.current_quota_cycle(1::smallint)`. Ảnh hưởng thấp: client luôn gửi `usage_month`; row thiếu giá trị chỉ bị sync reset `usage_count` (vốn = 0). **Chưa áp production** — áp bằng `supabase db query --linked --file` + `supabase migration repair --status applied 20261019000000` khi được duyệt. |

**(c) Không làm (người dùng chọn giữ nguyên `plan_expires_at`):**

- Làm tròn `plan_expires_at` về cuối ngày ICT: đổi hành vi payment (khách được thêm tối đa ~1 ngày), lệch với logic stack hạn.
- Đổi `TimeZone` của database sang ICT: đổi chuỗi timestamp PostgREST trả về và ngữ nghĩa `::date`, không cần thiết vì SQL đã dùng `AT TIME ZONE`.
- Đặt `TZ` trên Vercel/Express: Vercel không cho đặt; code phải tường minh.
