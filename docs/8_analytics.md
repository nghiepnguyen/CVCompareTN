# Phân tích & Đo lường (Analytics)

Ứng dụng dùng **hai lớp đo lường độc lập**: Vercel Analytics (hiệu năng, luôn bật) và Google Analytics 4 — GA4 (hành vi sản phẩm, **chỉ sau khi người dùng đồng ý cookie**).

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
| **Vercel Analytics** | Lượt xem, Core Web Vitals trên dashboard Vercel | Không qua banner cookie GA | `<Analytics />` trong `src/App.tsx` |
| **GA4** | Funnel phân tích CV, JD, lịch sử | Bắt buộc — banner cookie | `VITE_GA_MEASUREMENT_ID` |

**Measurement ID production:** `G-GVTPXY9S3D` (đặt qua biến môi trường, không hardcode trong mã nguồn).

---

## Cookie consent (EU / VN)

GA4 được **nhúng vào `index.html` lúc build** (plugin Vite `inject-google-tag` trong `vite.config.ts`) khi có `VITE_GA_MEASUREMENT_ID`. Trình duyệt tải `gtag/js` ngay — Google Tag Assistant nhận diện được. **Consent Mode** mặc định `analytics_storage: denied`; chỉ sau khi người dùng bấm **Chấp nhận phân tích** thì `ga4.ts` gọi `gtag('consent', 'update', { analytics_storage: 'granted' })` và mới gửi hit phân tích.

### Luồng

1. Lần đầu truy cập (chưa có lựa chọn trong `localStorage`) → hiện `CookieConsentBanner`.
2. **Chấp nhận** → `grantAnalyticsConsent()` → tải gtag, `gtag('config', …)`, gửi event đã xếp hàng.
3. **Từ chối** → `denyAnalyticsConsent()` → không tải Google; xóa hàng đợi event.
4. Lần sau → `restoreAnalyticsConsent()` trong `App.tsx` (nếu đã chấp nhận trước đó, tự load GA4).
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
| `VITE_GA_MEASUREMENT_ID` | Có (để bật GA4) | ID dạng `G-XXXXXXXXXX`. Ví dụ: `G-GVTPXY9S3D` |

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
| `jd_create` | Người dùng có JD mới (trích URL hoặc lưu thủ công) | `method`: `'extract_url'` \| `'manual'` | Sau khi trích JD từ link thành công; sau khi lưu JD vào kho | `AnalysisContext.tsx` |
| `analyze_cv` | Bắt đầu một lượt phân tích CV–JD | `input_mode`: `'file'` \| `'text'` — `jd_mode`: `'text'` \| `'link'` — `cv_count`: số file (khi upload) | Đầu `handleAnalyze`, sau bước reCAPTCHA (production) | `AnalysisContext.tsx` |
| `analysis_success` | Một CV hoàn tất phân tích AI | `match_score`: điểm ATS — `jd_type`: chế độ JD — `input_mode`: `'file'` \| `'text'` | Sau mỗi `analyzeCV` thành công (từng file hoặc paste) | `AnalysisContext.tsx` |
| `view_history` | Mở tab Lịch sử | _(không có)_ | Click tab History trên Header | `Header.tsx` |

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

Đánh dấu conversion trong **Admin → Events → Mark as conversion** (hoặc tạo custom conversion tương ứng).

---

## Vercel Analytics

- Package: `@vercel/analytics` (`package.json`).
- Component: `<Analytics />` trong `src/App.tsx` — **không** phụ thuộc consent GA4.
- Dữ liệu xem trên [Vercel Dashboard](https://vercel.com) → project **`cvcompare`** → Analytics.
- Phù hợp: theo dõi traffic, performance; **không** thay thế funnel event tùy chỉnh của GA4.

---

## Admin nội bộ (không phải GA4)

Trang **Admin** (`AdminView`) hiển thị cột « Analytics » là **`usage_count`** từ bảng Supabase `profiles` (RPC `increment_usage_count` sau mỗi phân tích thành công) — **không** liên quan Google Analytics hay Vercel Analytics.

---

## Kiểm tra & debug

### GA4

1. Cài [Google Analytics Debugger](https://chrome.google.com/webstore) hoặc dùng **DebugView** (Admin → DebugView).
2. Mở site → **Chấp nhận** cookie → Network có request tới `googletagmanager.com/gtag/js?id=G-GVTPXY9S3D`.
3. Chạy một lượt phân tích CV → DebugView thấy `analyze_cv`, sau đó `analysis_success`.
4. **Từ chối** cookie → không có request Google; `trackEvent` không gửi gì.

### Vercel

- Deploy lên `cvcompare` → tab Analytics trên Vercel sau vài phút có pageview.

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
- [7_deployment.md](7_deployment.md) — Biến môi trường Vercel
