# Phân tích & Đo lường (Analytics)

Tài liệu này gồm **hai chủ đề tách biệt** (đừng nhầm tên):

| Chủ đề | Mục đích | Công cụ / lưu trữ |
|--------|----------|-------------------|
| **Đo lường web (GA4 + Vercel)** | Traffic, funnel, Web Vitals | Google Analytics 4, `@vercel/analytics` |
| **Hạn mức phân tích CV/tháng** | Giới hạn lượt so khớp CV–JD mỗi user | Supabase `app_settings` + `profiles` + RPC + gói **Pro** |
| **Gói Pro (PayOS)** | Thanh toán 69.000đ/tháng, nâng hạn mức & tính năng | `profiles.plan`, `payments`, PayOS webhook |

Phần dưới mô tả lần lượt từng chủ đề.

## Tổng quan kiến trúc

```text
┌─────────────────────────────────────────────────────────────┐
│                        Trình duyệt                          │
├────────────────────────────┬────────────────────────────────┤
│   Vercel Analytics         │   Google Analytics 4 (GA4)   │
│   (@vercel/analytics)      │   gtag.js — load có điều kiện │
│   Luôn mount trong App     │   Chỉ khi consent = granted    │
│   Pageview / Web Vitals    │   Custom events (bảng dưới)    │
└────────────────────────────┴────────────────────────────────┘
```

| Công cụ | Mục đích | Consent | Cấu hình |
|---------|----------|---------|----------|
| **Vercel Analytics** | Lượt xem, Core Web Vitals trên dashboard Vercel | Không qua banner cookie GA | `<Analytics />` trong `src/app/AppShell.tsx` |
| **GA4** | Funnel phân tích CV, JD, lịch sử | Bắt buộc — banner cookie | `VITE_GA_MEASUREMENT_ID` |

**Measurement ID production:** `G-4SB0WWRBQC` (đặt qua biến môi trường, không hardcode trong mã nguồn).

---

## Cookie consent (EU / VN)

GA4 được **nhúng vào `index.html` lúc build** (plugin Vite `inject-google-tag` trong `vite.config.ts`) khi có `VITE_GA_MEASUREMENT_ID`. Trình duyệt tải `gtag/js` ngay — Google Tag Assistant nhận diện được. **Consent Mode** mặc định `analytics_storage: denied`; chỉ sau khi người dùng bấm **Chấp nhận phân tích** thì `ga4.ts` gọi `gtag('consent', 'update', { analytics_storage: 'granted' })` và mới gửi hit phân tích.

### Luồng

1. Lần đầu truy cập (chưa có lựa chọn trong `localStorage`) → hiện `CookieConsentBanner`.
2. **Chấp nhận** → `grantAnalyticsConsent()` → tải gtag, `gtag('config', …)`, gửi event đã xếp hàng.
3. **Từ chối** → `denyAnalyticsConsent()` → không tải Google; xóa hàng đợi event.
4. Lần sau → `restoreAnalyticsConsent()` qua `AnalyticsBootstrap` (mount từ `AppShell`; nếu đã chấp nhận trước đó, tự load GA4).
5. **Đổi ý** → Footer → **Cài đặt cookie** → xóa consent → banner hiện lại.

### Lưu trữ consent

| Khóa `localStorage` | Giá trị |
|---------------------|---------|
| `cv_compare_analytics_consent` | `granted` \| `denied` |

### Cấu hình privacy trên GA4

Khi load, client gửi:

- `anonymize_ip: true`
- `allow_google_signals: false`
- `allow_ad_personalization_signals: false`
- Consent update: `analytics_storage: granted`, quảng cáo (`ad_*`) = `denied`

### File liên quan

| File | Vai trò |
|------|---------|
| `src/lib/ga4.ts` | Consent, `loadGA4()`, `trackEvent()` |
| `src/components/layout/CookieConsentBanner.tsx` | UI banner |
| `src/components/layout/Footer.tsx` | Nút « Cài đặt cookie » |
| `src/components/PrivacyPolicyPage.tsx` | Mô tả pháp lý GA4 + Vercel |

---

## Biến môi trường

| Biến | Bắt buộc | Mô tả |
|------|----------|--------|
| `VITE_GA_MEASUREMENT_ID` | Có (để bật GA4) | ID dạng `G-XXXXXXXXXX`. Ví dụ: `G-4SB0WWRBQC` |

- **Local:** `.env.local` (xem `.env.example`).
- **Vercel (project `cvcompare`):** Settings → Environment Variables → Production + Preview → **Redeploy**.

Nếu thiếu biến này, banner cookie **không** hiện (`isGa4Configured()` = false) và mọi `trackEvent()` là no-op.

---

## API theo dõi sự kiện

Mọi event GA4 đi qua **`trackEvent(name, params?)`** trong `src/lib/ga4.ts`. Không gọi `window.gtag` trực tiếp từ component (trừ bootstrap trong `ga4.ts`).

Điều kiện gửi:

- Consent = `granted`
- `VITE_GA_MEASUREMENT_ID` đã cấu hình
- Script gtag đã load (hoặc event được xếp hàng rồi flush sau khi load)

---

## Bảng event đang track

| Event | Mô tả | Thuộc tính (params) | Trigger | File |
|-------|--------|---------------------|---------|------|
| `jd_create` | Người dùng có JD mới (trích URL hoặc lưu thủ công) | `method`: `'extract_url'` \| `'manual'` | Trích link thành công; lưu JD vào kho | `AnalysisRunContext.tsx` (`extract_url`) — `SavedJdContext.tsx` (`manual`) |
| `analyze_cv` | Bắt đầu một lượt phân tích CV–JD | `input_mode`: `'file'` \| `'text'` — `jd_mode`: `'text'` \| `'link'` — `cv_count`: số file (khi upload) | Đầu `handleAnalyze`, sau reCAPTCHA (production) | `AnalysisRunContext.tsx` |
| `analysis_success` | Một CV hoàn tất phân tích AI | `match_score`: điểm ATS — `jd_type`: chế độ JD — `input_mode`: `'file'` \| `'text'` | Sau mỗi `analyzeCV` thành công | `AnalysisRunContext.tsx` |
| `view_history` | Mở tab Lịch sử | _(không có)_ | Click tab History trên Header | `Header.tsx` |
| `sign_in_email` | Đăng nhập thành công bằng email/password | `method`: `'email'` | Supabase `signInWithPassword` thành công | `AuthContext.tsx` |
| `sign_in_email_error` | Đăng nhập email thất bại | `method`: `'email'`, `error`: message lỗi (cắt 100 ký tự) | Supabase `signInWithPassword` thất bại | `AuthContext.tsx` |
| `sign_up_email` | Đăng ký thành công bằng email/password | `method`: `'email'`, `needs_confirmation`: `true/false` | Supabase `signUp` thành công | `AuthContext.tsx` |
| `sign_up_email_error` | Đăng ký email thất bại | `method`: `'email'`, `error`: message lỗi (cắt 100 ký tự) | Supabase `signUp` thất bại | `AuthContext.tsx` |
| `reset_password` | Gửi yêu cầu đặt lại mật khẩu thành công | `method`: `'email'` | Supabase `resetPasswordForEmail` thành công | `AuthContext.tsx` |
| `reset_password_error` | Gửi yêu cầu đặt lại mật khẩu thất bại | `method`: `'email'`, `error`: message lỗi (cắt 100 ký tự) | Supabase `resetPasswordForEmail` thất bại | `AuthContext.tsx` |

### Ghi chú quan trọng

- **Không gửi** nội dung CV, JD, email, tên file đầy đủ, hay URL JD lên GA4 (đã bỏ `url` / `cv_name` để giảm rủi ro PII).
- **Không có** event đăng nhập/đăng xuất, xóa lịch sử, hay admin — có thể bổ sung sau qua `trackEvent`.
- GA4 tự thu **page_view** sau `gtag('config', …)` khi script đã load (không cần event tùy chỉnh cho từng tab React).

### Conversion đề xuất (cấu hình trong GA4 Admin)

| Conversion (tên gợi ý) | Event nguồn | Ý nghĩa |
|------------------------|-------------|---------|
| `analysis_completed` | `analysis_success` | Hoàn thành giá trị cốt lõi |
| `jd_saved` | `jd_create` (`method: manual`) | Người dùng lưu JD để dùng lại |
| `analysis_started` | `analyze_cv` | Ý định phân tích (phễu trên) |
| `sign_up_completed` | `sign_up_email` (`needs_confirmation: false`) | Đăng ký mới (không cần xác nhận email) |

Đánh dấu conversion trong **Admin → Events → Mark as conversion** (hoặc tạo custom conversion tương ứng).

---

## Vercel Analytics

- Package: `@vercel/analytics` (`package.json`).
- Component: `<Analytics />` trong `src/app/AppShell.tsx` — **không** phụ thuộc consent GA4.
- Dữ liệu xem trên [Vercel Dashboard](https://vercel.com) → project **`cvfit`** → Analytics.
- Phù hợp: theo dõi traffic, performance; **không** thay thế funnel event tùy chỉnh của GA4.

---

## Hạn mức phân tích CV/tháng (Supabase — không phải GA4)

Giới hạn số lượt **phân tích CV–JD thành công** mỗi user. Mặc định hệ thống: **10** lượt/chu kỳ (có thể đổi runtime qua `app_settings`).

### Chu kỳ quota (quota_reset_day)

Mỗi user có **`quota_reset_day`** (1–28) — ngày trong tháng mà `usage_count` được reset về 0. Mặc định = 1 (tương thích ngược với cơ chế cũ theo đầu tháng).

- **User mới:** `quota_reset_day` = ngày đăng ký (clamped ≤28).
- **Upgrade Free → Pro/Recruiter:** Giữ nguyên `usage_count` + `usage_month` — user thấy tally thực tế trên limit mới (VD: đã dùng 10/10 free → upgrade → thấy **10/100**).
- **Gia hạn cùng plan (Pro → Pro, Recruiter → Recruiter):** `usage_count` reset về 0 — user nhận **quota mới 0/100** khi mua thêm.
- **Pro/Recruiter hết hạn tự nhiên → Free:** `usage_count` reset về 0, `quota_reset_day` giữ nguyên (xử lý bởi `sync_profile_usage_month`).
- **Chu kỳ:** Tính từ ngày reset tháng này đến trước ngày reset tháng sau (VD: `quota_reset_day=20` → chu kỳ 20/6–19/7).

`usage_month` lưu key chu kỳ dạng `YYYY-MM-DD` (ngày bắt đầu chu kỳ hiện tại). Hàm `current_quota_cycle(reset_day)` trả về key này.

### Gói Free vs Pro vs Recruiter

| | Free | Pro (PayOS) | Recruiter (PayOS) |
|---|------|-------------|-------------------|
| Phân tích / chu kỳ | `app_settings` (mặc định 10) hoặc override admin | **100** (trừ khi admin đặt unlimited) | **500** |
| CV / lần | 1 | 5 | 50 |
| Kho JD | 3 | Không giới hạn | Không giới hạn |
| Lịch sử | 7 ngày | Toàn bộ | Toàn bộ |
| Chiến dịch tuyển dụng | Không | Không | 10 campaigns × 50 CV |
| Xuất CV tối ưu | Không | Có | Có |

- Cột `profiles.plan`, `plan_expires_at`, `quota_reset_day`; RPC `get_user_plan`, `activate_pro_plan` (webhook PayOS).
- Migration: `supabase/migrations/20260601000000_add_plan_to_profiles.sql`, `20260601300000_add_recruiter_campaigns.sql`, `20260626110000_quota_reset_by_registration_day.sql`.
- UI: `/upgrade`, `/payment/success`, `/payment/cancel`.
- **Plan expiry:** Khi `plan_expires_at <= now()`, `sync_profile_usage_month` tự động downgrade về `free`, reset `usage_count = 0`. Không cần cron job.
- **Perpetual plan (`plan_expires_at IS NULL`):** Admin có thể grant plan không hạn (NULL expiry). Khi user tự gia hạn qua PayOS, `plan_expires_at` vẫn giữ NULL (không bị convert thành finite). Nếu cần revoke, admin downgrade về free.
- **Frontend refresh:** `AuthContext` tự refresh `effectivePlan` mỗi 5 phút và khi tab trở lại foreground (`visibilitychange`) — plan hết hạn mid-session được phát hiện mà không cần reload trang.
- **Pro/Recruiter renewal UI (`UpgradeView`):** User đang Pro thấy nút **"Gia hạn thêm 30 ngày"** (Pro) hoặc **"Gia hạn thêm 30 ngày"** (Recruiter) thay vì badge "Gói hiện tại". Banner thông báo ở đầu trang giải thích: gia hạn sẽ cộng 30 ngày vào hạn hiện tại và reset `usage_count` về 0. Key dịch: `proRenewalNotice`, `proRenewalCta`, `recruiterRenewalNotice`, `recruiterRenewalCta` (trong `billing.ts`).
- **Quota exhausted CTA (`ProfileView`):** Khi `used >= limit`, hiển thị link inline: "Mua thêm" (Pro/Recruiter → `/upgrade`) hoặc "Nâng cấp Pro" (Free → `/upgrade`). Key dịch: `quotaExhaustedBuyMore`, `quotaExhaustedUpgradePro`.

### Bảo mật RPC (Security Advisor)

- Client đăng nhập (`authenticated` JWT) gọi: `check_analytics_quota`, `get_user_plan`, `increment_usage_count`, `sync_profile_usage_month`.
- **`activate_pro_plan`** chỉ backend PayOS webhook (`SUPABASE_SERVICE_ROLE_KEY`) — không gọi từ browser.
- Role **`anon`** đã bị revoke execute trên các RPC trên (migrations `20260601110000`–`20260601140000`).

### Kiến trúc

```mermaid
flowchart TD
  subgraph config [Cau hinh runtime]
    AS[app_settings.default_monthly_analytics_limit]
    AdminUI[AdminView - Luu mac dinh]
    SQL[Supabase SQL / Table Editor]
    AdminUI --> AS
    SQL --> AS
  end
  subgraph profile [profiles]
    P[monthly_analytics_limit_custom]
    L[monthly_analytics_limit]
    U[usage_count + usage_month]
  end
  subgraph resolve [Tinh han muc hieu luc]
    PLAN[plan pro = 100]
    EFF[effective_monthly_analytics_limit]
    P -->|custom false| AS
    P -->|custom true| L
    AS --> EFF
    L --> EFF
    PLAN --> CHK
  end
  subgraph enforce [Enforcement]
    CHK[check_analytics_quota]
    INC[increment_usage_count]
    EFF --> CHK
    EFF --> INC
  end
  Client[AnalysisRunContext.handleAnalyze] --> CHK
  CHK -->|allowed| AI[Gemini analyze]
  AI --> INC
```

### Bảng & cột

| Đối tượng | Cột / key | Ý nghĩa |
|-----------|-----------|---------|
| **`app_settings`** | `key = 'default_monthly_analytics_limit'`, `value` (jsonb số) | Hạn mức **mặc định toàn hệ thống**. Đổi tại đây **không cần deploy** Vercel. |
| **`profiles`** | `monthly_analytics_limit_custom` | `false` → theo `app_settings`. `true` → dùng override cột dưới. |
| **`profiles`** | `monthly_analytics_limit` | Chỉ khi `custom = true`: số ≥ 0, hoặc `NULL` = **không giới hạn**. |
| **`profiles`** | `usage_count`, `usage_month` | Số lượt **thành công** trong chu kỳ hiện tại; `sync_profile_usage_month` reset `usage_count` khi sang chu kỳ mới (dựa trên `quota_reset_day`) hoặc khi plan hết hạn. |
| **`profiles`** | `quota_reset_day` | Ngày trong tháng (1–28) reset `usage_count` về 0. Mặc định = 1. User mới set = ngày đăng ký. |

### Hàm SQL (Supabase)

| Hàm | Vai trò |
|-----|---------|
| `get_default_monthly_analytics_limit()` | Đọc `app_settings` (fallback **10**). |
| `effective_monthly_analytics_limit(custom, stored_limit)` | `custom = false` → global default; `custom = true` → `stored_limit` (`NULL` = unlimited). |
| `resolve_monthly_analytics_limit(plan, custom, stored_limit)` | Plan-aware: `recruiter` = 500, `pro` = 100, `free` = effective limit. |
| `check_analytics_quota(user_id, additional?)` | Trả JSON `allowed`, `used`, `limit`, `month` (chu kỳ `YYYY-MM-DD`), `plan`, `resetDay`, `reason`. Gọi **trước** khi chạy batch analyze. |
| `increment_usage_count(user_id)` | Tăng `usage_count` sau mỗi CV thành công; chặn nếu đã đạt limit. |
| `sync_profile_usage_month(user_id)` | Reset `usage_count` khi chu kỳ thay đổi (theo `quota_reset_day`) **HOẶC** khi plan pro/recruiter hết hạn → tự động downgrade về free + reset usage. |
| `current_quota_cycle(reset_day)` | Trả về key chu kỳ `YYYY-MM-DD` cho `reset_day` (1–28). |
| `effective_plan_from_row(plan, expires_at)` | Trả về plan hiệu lực (`free`/`pro`/`recruiter`) dựa trên `plan_expires_at`. |
| `get_user_plan(user_id)` | RPC convenience — trả về plan hiệu lực của user. |
| `activate_pro_plan(user_id, order_code, duration, data, plan)` | Service role only — kích hoạt pro/recruiter sau thanh toán PayOS. **Free→paid:** giữ `usage_count`. **Paid renewal (same plan, future expiry):** cộng thêm duration vào `plan_expires_at`, reset `usage_count = 0`. **Perpetual (NULL expiry):** giữ nguyên NULL khi renewal. **Plan thay đổi hoặc hết hạn:** reset `plan_expires_at = now() + duration`. |

### Migration (thứ tự)

Chạy **theo thứ tự timestamp** trong `supabase/migrations/`:

| File | Nội dung |
|------|----------|
| `20260520120000_profiles_monthly_analytics_limit.sql` | Cột `monthly_analytics_limit`, `usage_month`, RPC quota cơ bản. |
| `20260520130000_profiles_default_monthly_limit_20.sql` | `DEFAULT 20` trên cột profile (thế hệ cũ — trước `app_settings`). |
| `20260523100000_app_settings_analytics_default.sql` | Bảng `app_settings`, cột `monthly_analytics_limit_custom`, hàm effective limit, cập nhật RPC, RLS, backfill. |
| `20260601000000_add_plan_to_profiles.sql` | Cột `plan`, `plan_expires_at`, bảng `payments`, RPC `get_user_plan`, `activate_pro_plan`, `resolve_monthly_analytics_limit` (pro=100). |
| `20260601300000_add_recruiter_campaigns.sql` | Plan `recruiter` (500 quota), bảng `recruitment_campaigns` + `candidate_cvs`, RPC campaign. |
| `20260619000000_switch_usage_month_to_gmt7.sql` | `current_usage_month()` chuyển từ UTC → GMT+7. |
| `20260626100000_fix_plan_expiry_reset_usage_count.sql` | `sync_profile_usage_month` + `admin_set_user_plan`: reset `usage_count` khi plan hết hạn. |
| `20260626110000_quota_reset_by_registration_day.sql` | Cột `quota_reset_day` (1–28), `current_quota_cycle()`, quota theo chu kỳ user thay vì đầu tháng. |
| `20260626120000_free_quota_default_10.sql` | Đổi giới hạn mặc định Free từ 20 → **10** lượt/chu kỳ (cả `app_settings` lẫn fallback hàm). |
| `20260626130000_fix_quota_reset_day_from_created_at.sql` | Backfill `quota_reset_day` từ `created_at` cho user cũ bị gán nhầm = 1 ở migration trước. |
| `20260626140000_fix_perpetual_plan_stacking.sql` | Fix `activate_pro_plan` + `admin_set_user_plan`: plan perpetual (`plan_expires_at IS NULL`) giữ nguyên NULL khi user gia hạn, không bị convert thành finite. |
| `20260626150000_preserve_usage_on_free_to_paid_upgrade.sql` | `activate_pro_plan` + `admin_set_user_plan`: free→paid giữ `usage_count`; paid renewal reset về 0. |
| `20260627000000_fix_perpetual_plan_regression.sql` | Fix regression từ `20260626150000`: tách lại 2 CASE branch riêng cho perpetual (`IS NULL`) và stacking (future expiry), tránh `COALESCE(NULL, now())` làm mất NULL. |

Áp dụng: `supabase db push` hoặc chạy từng file trong SQL Editor.

**Backfill** (migration `20260523100000`):

- `monthly_analytics_limit = 20` → `monthly_analytics_limit_custom = false` (theo mặc định hệ thống).
- `NULL` hoặc giá trị **khác 20** → `custom = true` (giữ override / unlimited như trước).

User mới (`createUserProfile`): `monthly_analytics_limit_custom = false`, **không** ghi cứng `20` trên client.

### Luồng ứng dụng

1. User bấm phân tích → `AnalysisRunContext.handleAnalyze` gọi `checkAnalyticsQuota(userId, plannedRuns)` (`src/services/analyticsQuotaService.ts`).
2. Nếu `allowed = false` → hiển thị toast lỗi kèm CTA:
   - **Free plan:** nút "Nâng cấp Pro để tiếp tục" → navigate `/upgrade`.
   - **Pro/Recruiter plan:** nút "Mua thêm" → navigate `/upgrade`, kèm ngày reset ("hoặc chờ đến {date} để reset").
3. Mỗi CV thành công → `increment_usage_count` (server-side, qua service hiện có).

### Admin UI (`AdminView`)

| Thao tác | Hành vi |
|----------|---------|
| **Hạn mức phân tích mặc định / tháng** (đầu tab Users) | Ghi `app_settings` qua `updateDefaultMonthlyAnalyticsLimit` — áp dụng cho mọi user `custom = false`. |
| Cột « Phân tích / tháng » | Hiển thị `usage_count / effectiveLimit` (`resolveEffectiveMonthlyAnalyticsLimit` + global default đã load). |
| Nhập số + blur | `updateUserMonthlyAnalyticsLimit` → `custom = true`, lưu limit. |
| Ô trống + blur (khi đã custom) | `monthly_analytics_limit = NULL` → **không giới hạn**. |
| **Dùng mặc định** | `resetUserToGlobalAnalyticsLimit` → `custom = false` (nhận lại giá trị từ `app_settings`). |
| Blur ô trống khi **chưa** custom | Không gọi API (tránh vô tình set unlimited). |

### File mã nguồn

| File | Vai trò |
|------|---------|
| `src/services/appSettingsService.ts` | `getDefaultMonthlyAnalyticsLimit`, `updateDefaultMonthlyAnalyticsLimit` |
| `src/services/userService.ts` | Profile map, `resolveEffectiveMonthlyAnalyticsLimit`, `resetUserToGlobalAnalyticsLimit` |
| `src/services/analyticsQuotaService.ts` | Client gọi RPC `check_analytics_quota` |
| `src/context/analysis/AnalysisRunContext.tsx` | Kiểm tra quota trước analyze |
| `src/components/views/AdminView.tsx` | UI cấu hình global + override từng user |
| `src/translations/admin.ts` | Nhãn VI/EN cho cấu hình global |

### Đổi hạn mức **không deploy** Vercel

**Cách 1 — Admin UI:** Tab Users → « Hạn mức phân tích mặc định / tháng » → nhập số → **Lưu mặc định**.

**Cách 2 — Supabase Dashboard:** Table Editor → `app_settings` → sửa `value` của row `default_monthly_analytics_limit`.

**Cách 3 — SQL:**

```sql
UPDATE public.app_settings
SET value = '30'::jsonb,
    updated_at = now()
WHERE key = 'default_monthly_analytics_limit';
```

Chỉ user có `monthly_analytics_limit_custom = false` nhận giá trị mới. User admin đã set override (`custom = true`) **không** đổi theo global.

### RLS `app_settings`

- **SELECT:** mọi user `authenticated` (client đọc default để hiển thị Admin).
- **INSERT/UPDATE/DELETE:** chỉ `public.is_admin()`.

### Kiểm tra (quota)

1. User `custom = false`, global = 10, `usage_count = 10` → lượt 11 bị `check_analytics_quota` từ chối.
2. `UPDATE app_settings` → 30 → cùng user được thêm quota (không redeploy frontend).
3. User `custom = true`, `monthly_analytics_limit = 5` → vẫn 5 dù global = 30.
4. User `custom = true`, `monthly_analytics_limit IS NULL` → unlimited.
5. Sang tháng UTC mới → `usage_count` reset về 0 (giữ limit).

### Thông báo lỗi (UI)

| Key dịch | Khi nào |
|----------|---------|
| `monthlyUsageLimitExceeded` | Vượt hạn mức (tiêu đề ngắn) |
| `monthlyUsageLimitExceededDetail` | `{used} / {limit}` chi tiết |
| `quotaExhaustedBuyMore` | CTA khi Pro/Recruiter hết quota — nút navigate `/upgrade` |
| `quotaExhaustedOrWait` | `{date}` — ngày reset để quay về Free; hiển thị kèm "Mua thêm" |
| `quotaExhaustedUpgradePro` | CTA khi Free hết quota — nút navigate `/upgrade` |

Định nghĩa trong `src/translations/system.ts`. Toast lỗi (`AppContent.tsx`) render `ReactNode` để chứa các nút CTA inline. `ProfileView` cũng hiển thị link tương tự ngay dưới dòng usage khi `used >= limit`.

**Không** liên quan Google Analytics hay Vercel Analytics.

---

## Kiểm tra & debug

### GA4

1. Cài [Google Analytics Debugger](https://chrome.google.com/webstore) hoặc dùng **DebugView** (Admin → DebugView).
2. Mở site → **Chấp nhận** cookie → Network có request tới `googletagmanager.com/gtag/js?id=G-4SB0WWRBQC`.
3. Chạy một lượt phân tích CV → DebugView thấy `analyze_cv`, sau đó `analysis_success`.
4. **Từ chối** cookie → không có request Google; `trackEvent` không gửi gì.

### Vercel

- Deploy lên `cvfit` → tab Analytics trên Vercel sau vài phút có pageview.

---

## Mở rộng event mới

1. Gọi `trackEvent('ten_event', { ... })` tại điểm hành vi có ý nghĩa (intent / completion).
2. Cập nhật bảng event trong file này.
3. (Tùy chọn) Đăng ký / đánh dấu conversion trong GA4 Admin.
4. Tránh PII và nội dung CV/JD trong `params`.

Ví dụ:

```ts
import { trackEvent } from '../lib/ga4';

trackEvent('signup_completed', { method: 'google' });
```

---

## Tài liệu liên quan

- [2_tech_stack.md](2_tech_stack.md) — Stack tổng quan
- [3_frontend.md](3_frontend.md) — Context và component UI
- [5_api.md](5_api.md) — RPC Supabase (`check_analytics_quota`, …)
- [6_workflow.md](6_workflow.md) — Luồng phân tích có bước kiểm tra quota
- [7_deployment.md](7_deployment.md) — Migration Supabase & biến môi trường Vercel
