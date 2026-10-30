# Hướng dẫn Triển khai (Deployment Guide)

Dự án **cvFit** được triển khai theo mô hình **Vercel Native**, tích hợp cả Frontend (React/Vite) và Backend (Serverless Functions) trên cùng một hạ tầng Vercel.

## 1. Triển khai trên Vercel

Vercel phục vụ cả ứng dụng React và các hàm API trong thư mục `/api`.

### Project Vercel đúng (đã đối chiếu domain production)

| | |
|---|---|
| **Scope / project** | `nghiepnguyens/cv-compare-tn` |
| **Project ID** | `prj_9ojmBXjiHRDi56zHS2uvYvJABOaI` |
| **GitHub repo** | `nghiepnguyen/CVCompareTN` |
| **Production domain** | `https://cvfit.pro` |

CLI `vercel inspect https://cvfit.pro` và `vercel project inspect cv-compare-tn --scope nghiepnguyens` đã xác nhận project trên ngày 2026-10-31. Hướng dẫn cũ trỏ tới `cvfit` không còn khớp hạ tầng đang chạy. Trước khi đổi liên kết Git hoặc deploy, đối chiếu domain bằng CLI; không tạo project mới theo tên suy đoán.

Local CLI: `vercel link --project cv-compare-tn --scope nghiepnguyens`.

### Các bước thực hiện:

1.  **Kết nối GitHub:** Đẩy mã nguồn lên `nghiepnguyen/CVCompareTN` và kết nối **project Vercel `cv-compare-tn`** (xem bảng trên).
2.  **Cấu hình Environment Variables:** Trong Dashboard của Vercel, hãy thiết lập các biến môi trường sau:
    -   `GEMINI_API_KEY`: API Key từ Google AI Studio.
    -   `RECAPTCHA_SECRET_KEY`: Secret Key cho reCAPTCHA v3.
    -   `RECAPTCHA_ALLOWED_HOSTNAMES`: Danh sách hostname chính xác, phân cách bằng dấu phẩy; mặc định `cvfit.pro,www.cvfit.pro`. Domain preview cần thêm rõ ràng ở environment tương ứng; localhost chỉ thêm trong `.env` local. Backend luôn xác minh token, kể cả development, và yêu cầu action `feedback` hoặc `extract_pdf` khớp luồng gọi. Không dùng wildcard.
    -   `RESEND_API_KEY`: API Key từ Resend.com.
    -   `RESEND_FROM_EMAIL`: Email gửi đi (phải được verify trên Resend).
    -   `FEEDBACK_RECIPIENT_EMAIL`: Email nhận thông báo góp ý.
    -   `VITE_ADMIN_EMAIL`: Email có quyền truy cập trang Admin.
    -   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: Project Supabase (client).
    -   `VITE_GA_MEASUREMENT_ID`: Google Analytics 4 (ví dụ `G-4SB0WWRBQC`) — bắt buộc nếu bật theo dõi hành vi GA4.
    -   `VITE_SENTRY_DSN`: DSN Sentry project **React** — capture lỗi frontend. Để trống local nếu không muốn noise.
    -   `SENTRY_DSN`: DSN Sentry project **Node.js** — capture lỗi backend (Express + Vercel Functions). Để trống local nếu không muốn noise.
    -   `VITE_APP_VERSION` *(tùy chọn)*: Set `$VERCEL_GIT_COMMIT_SHA` để Sentry gắn release vào từng event.
-   **PayOS (Pro plan):** Thêm các biến sau để kích hoạt thanh toán:
    -   `PAYOS_CLIENT_ID`: Client ID từ cổng PayOS.
    -   `PAYOS_API_KEY`: API Key từ PayOS.
    -   `PAYOS_CHECKSUM_KEY`: Checksum Key để xác thực webhook (HMAC-SHA256).
    -   `SUPABASE_SERVICE_ROLE_KEY`: Service role key — webhook cần quyền ghi `profiles` và `payments`.
    -   `APP_URL`: URL đầy đủ của ứng dụng (vd: `https://cvfit.pro`), dùng cho `returnUrl`/`cancelUrl` của PayOS.
3.  **Cấu hình Frontend (Client-side):** Các biến có tiền tố `VITE_` sẽ được nhúng vào mã nguồn khi build.
4.  **Tự động triển khai:** Vercel sẽ tự động nhận diện thư mục `/api` và triển khai chúng dưới dạng Serverless Functions dựa trên cấu hình trong `vercel.json`.

## 2. Cấu hình Supabase (Bắt buộc)

Ứng dụng dùng **Supabase** cho xác thực (OAuth Google), cơ sở dữ liệu PostgreSQL và Storage (bucket file CV).

### Các bước thực hiện:

1.  **Tạo project Supabase:** Truy cập [Supabase Dashboard](https://supabase.com/dashboard).
2.  **Authentication:** Bật nhà cung cấp **Google**. Trong URL Redirect / Site URL, thêm domain production (ví dụ `https://cvfit.pro`) và URL preview của Vercel (`https://*.vercel.app`) cùng `http://localhost:5173` (hoặc cổng dev bạn dùng).
    -   **Email confirm signup — Custom SMTP:** Project Settings > Auth > SMTP Settings, dùng **Resend** làm SMTP relay (sender email set riêng ở đây, độc lập với `RESEND_FROM_EMAIL` của app). Domain gởi (`cvfit.pro`) cần verify SPF + DKIM trên Resend Dashboard, và thêm DMARC thủ công ở DNS provider (Resend không tự cấu hình DMARC): `_dmarc.cvfit.pro` TXT `v=DMARC1; p=none; rua=mailto:<email nhận report>`.
    -   **Giới hạn free plan:** link xác nhận signup luôn dùng domain `*.supabase.co` (không match domain gởi `cvfit.pro`) trừ khi bật **Custom Auth Domain** (Supabase Pro). Mismatch này có thể khiến mail server nhận delay/greylist → link hết hạn trước khi user click. Safety net: nút "Gửi lại email xác nhận" trong `AuthModal.tsx` (mode `resendConfirmation`), tự mở khi phát hiện lỗi `otp_expired` trên URL redirect.
3.  **Database:** Áp dụng migration trong `supabase/migrations/` (khuyến nghị: `supabase db push`, hoặc chạy lần lượt trong SQL Editor):

    | Migration | Nội dung chính |
    |-----------|----------------|
    | `20260516120000_cv_matcher_core_schema.sql` | `profiles`, `history`, `saved_jds`, RPC `increment_usage_count`, RLS, bucket **`cv-files`** |
    | `20260516120100_history_add_parsed_cv.sql` | Cột `history.parsed_cv` (jsonb) — nếu DB cũ thiếu cột |
    | `20260520120000_profiles_monthly_analytics_limit.sql` | Hạn mức phân tích/tháng trên `profiles`, `check_analytics_quota` |
    | `20260520130000_profiles_default_monthly_limit_20.sql` | `DEFAULT 20` trên cột limit (thế hệ trước `app_settings`) |
    | `20260523100000_app_settings_analytics_default.sql` | Bảng **`app_settings`** (default **20**, đổi runtime), `monthly_analytics_limit_custom`, RPC effective limit |
    | `20260601000000_add_plan_to_profiles.sql` | Gói Pro: cột `plan`, `plan_expires_at`, `plan_updated_at` trên `profiles`; bảng `payments`; RPC `activate_pro_plan`, `get_user_plan`; cập nhật `check_analytics_quota` plan-aware |
    | `20260601110000`–`20260601150000_security_*.sql` | Security Advisor: revoke `anon` trên RPC nhạy cảm; `activate_pro_plan` chỉ `service_role`; SELECT bucket `cv-files` theo folder user; `search_path` cố định |
    | `20260601200000_admin_set_user_plan.sql` | RPC admin đổi plan free/pro (guard `is_admin()`) |
    | `20260601210000_activate_pro_plan_idempotent.sql` | `activate_pro_plan` idempotent (claim payment trước); **cần** migration security tiếp theo để giữ revoke EXECUTE |
    | `20260602100000_security_reapply_function_grants.sql` | Re-apply revoke `anon`/`authenticated` sau recreate `activate_pro_plan`; revoke `anon` trên `admin_set_user_plan`, `get_default_monthly_analytics_limit` |
    | `20260602110000_security_revoke_resolve_limit_public.sql` | Revoke `PUBLIC` execute trên `resolve_monthly_analytics_limit` (anon kế thừa qua `=X/postgres`) |
    | `20260708000000_cv_analyze_tmp_bucket.sql` | Bucket **`cv-analyze-tmp`** (private, 15MB) — file tạm cho luồng phân tích khi CV 2–15MB, INSERT/DELETE RLS scope theo folder `{user_id}/...` |

    **Auth (Dashboard, không qua SQL):** Bật **Leaked password protection** tại Authentication → Password security ([hướng dẫn](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

    Chi tiết hạn mức phân tích (Admin, SQL, không cần redeploy Vercel): [8_analytics.md § Hạn mức phân tích CV/tháng](8_analytics.md#hạn-mức-phân-tích-cvtháng-supabase--không-phải-ga4).
4.  **Storage:** Bucket **`cv-files`** — sau migration security, user **authenticated** chỉ SELECT object trong path `{user_id}/...`. Cân nhắc tắt Public bucket trên Dashboard nếu không cần URL công khai. Bucket **`cv-analyze-tmp`** (2026-07) — private, không có SELECT policy (server đọc qua service-role); INSERT/DELETE chỉ trong folder của chính user; client tự xoá file sau khi phân tích xong, không có cron/lifecycle sweep cho orphan (crash giữa chừng để lại rác — chấp nhận được, chưa cần xử lý).
5.  **Biến môi trường:** Trên Vercel và trong `.env` local, thiết lập ít nhất `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. Với tác vụ server-side hoặc migration, dùng `SUPABASE_SERVICE_ROLE_KEY` (không đưa vào frontend).

### Edge Functions (tùy chọn)

Thư mục `supabase/functions/` có thể triển khai qua Supabase CLI khi bạn dùng `supabase.functions.invoke(...)` từ client — không còn phụ thuộc Firebase Functions.

## 3. Chế độ Phát triển (Local Development)

- **`npm run dev`:** Chỉ Vite (frontend); gọi API production hoặc `vercel dev` nếu cần `/api/*`.
- **`npm start`:** Express (`server.ts`) + Vite middleware — API path đã thống nhất với Vercel (PDF, reCAPTCHA dùng cùng path gốc, không còn suffix `/extract` hay `/verify`).
- **CI/CD:** Push lên `main`/`master` hoặc mở PR sẽ trigger GitHub Actions (`.github/workflows/ci.yml`): `lint` → `test` (78 tests, Vitest) → `build`.

Để mô phỏng đúng serverless Vercel tại máy:

1.  **Cài đặt Vercel CLI:** `npm install -g vercel`
2.  **Chạy lệnh:** `npm run vercel-dev` hoặc `vercel dev`.
3.  Local server (thường cổng do CLI chọn) gần với hạ tầng Vercel.

## 4. Cấu hình điều hướng (vercel.json)

Tệp `vercel.json` ở thư mục gốc đóng vai trò quan trọng trong việc định tuyến:

-   **Rewrites:** Điều hướng các request `/api/:path*` vào đúng thư mục `/api`.
-   **SPA Support:** Đảm bảo các route của React (như `/history`, `/admin`) luôn trả về `index.html` thay vì lỗi 404 khi người dùng tải lại trang.
-   **Redirects (2026-05):** 301 redirect từ legacy paths không có language prefix (`/privacy`, `/terms`, `/support`, `/upgrade`, `/about`) về `/vi/:path` để chuẩn hóa URL và hỗ trợ hreflang.
-   **Security Headers (2026-06):** Áp dụng cho tất cả request:

    | Header | Giá trị | Mục đích |
    |--------|---------|---------|
    | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Bắt buộc HTTPS |
    | `X-Content-Type-Options` | `nosniff` | Chặn MIME sniffing |
    | `Referrer-Policy` | `strict-origin-when-cross-origin` | Giới hạn referrer leak |
    | `X-Frame-Options` | `DENY` | Chặn clickjacking (iframe từ domain khác) |
    | `Content-Security-Policy` | Xem bên dưới | Whitelist nguồn tài nguyên hợp lệ |

    **CSP whitelist theo directive:**

    | Directive | Cho phép |
    |-----------|---------|
    | `script-src` | `'self'`, `'unsafe-inline'`, GTM, Google (reCAPTCHA), `va.vercel-scripts.com`, `static.cloudflareinsights.com` |
    | `style-src` | `'self'`, `'unsafe-inline'`, `fonts.googleapis.com` |
    | `font-src` | `'self'`, `fonts.gstatic.com` |
    | `img-src` | `'self'`, `data:`, `blob:`, `data.cvfit.pro`, `google-analytics.com`, `lh3.googleusercontent.com`, `api.vietqr.io` |
    | `connect-src` | `'self'`, `*.supabase.co`, `wss://*.supabase.co`, GA4 endpoints, `www.google.com`, `va.vercel-scripts.com`, `cloudflareinsights.com`, `*.ingest.sentry.io` |
    | `frame-src` | `'self'`, `www.google.com` (reCAPTCHA) |
    | `worker-src` | `blob:` (PDF.js workers của unpdf) |
    | `object-src` | `'none'` |
    | `frame-ancestors` | `'none'` (bổ sung cho `X-Frame-Options`) |

    > `'unsafe-inline'` cho script/style là cần thiết do có inline script SEO pre-hydration, script gắn class `js` (ẩn `#seo-static`) và gtag init trong `index.html`. Nếu muốn loại bỏ, cần chuyển các script inline ra file ngoài và dùng nonce/hash.

## 4b. Cloudflare edge và verify branding Google Auth Platform

Domain `cvfit.pro` đi qua Cloudflare trước khi tới Vercel. Hai thứ ở tầng edge từng làm hỏng nội dung mà bot đọc được, dù browser vẫn hiển thị đúng:

| Vấn đề | Triệu chứng | Cách xử lý |
|--------|-------------|------------|
| **Email Address Obfuscation** (Scrape Shield, bật mặc định) | Mọi email trong HTML bị đổi thành link `/cdn-cgi/l/email-protection`, chỉ JS giải mã. Bot đọc `[email protected]` → chính sách bảo mật coi như không có contact | Bọc `<!--email_off--> … <!--/email_off-->` (helper `emailOff()` trong `scripts/generate-static-pages.ts`). Không cần chỉnh dashboard |
| **Redirect gốc** | `https://cvfit.pro/` trả `308` → `/vi/` | Khai báo URL trực tiếp `https://cvfit.pro/vi/...` trong Google Console thay vì URL gốc |
| **Cookie banner che trang** | Google render JS khi verify. Banner cookie cũ có scrim `backdrop-blur` toàn màn hình + `aria-modal` → home bị coi là "behind a login page", privacy "not sufficient content" dù HTML thô đầy đủ | `CookieConsentBanner` là dải không chặn: không scrim, không blur, `role="region"`. Không thêm overlay/modal tự bật nào lên trang public |

### Checklist trước khi resubmit verification

Google Auth Platform kiểm tra **cả HTML thô lẫn bản render JS** (screenshot). Kiểm tra bản render bằng `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1280,1600 --virtual-time-budget=8000 --screenshot=out.png https://cvfit.pro/en/privacy` — trang không được mờ/bị che. Verify trên edge live sau khi Vercel deploy xong, không chỉ trên `dist/`:

```bash
curl -s https://cvfit.pro/vi/privacy | grep -c "Limited Use"      # mong đợi 2
curl -s https://cvfit.pro/vi/privacy | grep -c "admin@cvfit.pro"  # mong đợi 2
curl -s https://cvfit.pro/ -L | grep -c "cvFit là gì"             # mong đợi 1
```

Yêu cầu nội dung của Google (đáp ứng bởi `src/translations/legal.ts` mục 1–12 + `HOME_PURPOSE` trong `scripts/generate-static-pages.ts`):

-   **Privacy policy** phải nêu: dữ liệu thu thập, cách dùng, scope OAuth cụ thể (`openid`, `userinfo.email`, `userinfo.profile`), **Limited Use disclosure** kèm link [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), danh sách bên thứ ba, thời gian lưu trữ, cách yêu cầu xóa, email liên hệ.
-   **Home page** phải đọc được khi chưa đăng nhập và phải nói rõ ứng dụng làm gì, cho ai, và rằng không cần đăng nhập để xem thông tin.
-   Mọi claim về dữ liệu phải **nhất quán giữa các trang** — FAQ landing từng ghi "tự động xóa sau 24 giờ" trái với retention thật trong chính sách bảo mật.

Trong Google Cloud Console → OAuth consent screen, khai báo: home `https://cvfit.pro/en/`, privacy `https://cvfit.pro/en/privacy`, terms `https://cvfit.pro/en/terms` (bản tiếng Anh cho reviewer). Domain phải được verify trong Search Console cùng tài khoản submit.

## 5. Bảo mật mã nguồn và bí mật

### Biến môi trường

| Loại | Ví dụ | Ghi chú |
|------|--------|---------|
| **Client (`VITE_*`)** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RECAPTCHA_SITE_KEY`, `VITE_GA_MEASUREMENT_ID` | Được nhúng vào bundle build — chỉ dùng khóa **public** |
| **Server / Vercel** | `GEMINI_API_KEY`, `RECAPTCHA_SECRET_KEY`, `RESEND_API_KEY` | Cấu hình trên Vercel Dashboard hoặc `.env` local (không commit) |
| **Server-only** | `SUPABASE_SERVICE_ROLE_KEY` | Migration, script admin — **không** thêm tiền tố `VITE_` |

Sao chép `.env.example` → `.env` khi dev local. Chỉ `.env.example` được theo dõi trên Git.

### `.gitignore` (không đưa lên Git)

- `.env*`, trừ `!.env.example`
- `supabase/.temp/` — cache Supabase CLI (project ref, pooler URL, …)
- `.vercel/` — liên kết project local
- Khóa & credential: `*.pem`, `*.p12`, `id_rsa*`, `credentials.json`, `service-account*.json`
- Backup local có thể chứa PII: `users_backup.json`, `*-backup.json`
- **`graphify-out/*`** — artifact Graphify (graph.json, cache, …) **không** commit; ngoại lệ: **`!graphify-out/GRAPH_REPORT.md`** (báo cáo đọc được cho agent/CI). Tái tạo local: `graphify update .`. Hook post-commit có thể ghi `~/.cache/graphify-rebuild.log` — lỗi sandbox không chặn push.

Nếu đã commit nhầm secret: xoá khỏi lịch sử Git, **rotate** key trên Google / Supabase / Resend / Vercel, rồi cập nhật biến môi trường mới.

### Supabase CLI

Sau `supabase link`, thư mục `supabase/.temp/` được tạo tự động — **không** add vào repo. Migrations trong `supabase/migrations/` vẫn được commit bình thường.


## Cập nhật storage R2 (2026-10-18)

Các mô tả Supabase Storage ở trên là luồng legacy. Tích hợp mới giữ Supabase làm nơi upload mặc định và đọc theo metadata; có thể bật R2 riêng cho `temp`, `saved`, `candidate` qua cấu hình server. File tạm R2 dùng reference `r2:{uploadId}`, file lâu dài giữ `file_path` cùng `storage_provider`. Tải file cá nhân/recruiter qua `POST /api/storage` với JWT, không dùng public URL. Cleanup có queue bền vững và scheduler, kể cả khi xoá campaign/user. Xem [10_storage_r2.md](10_storage_r2.md) cho migration bắt buộc, API, CORS/lifecycle, kiểm thử và rollback.

## Thứ tự deploy — security fixes 2026-10-30

Làm đúng thứ tự sau. Bước 1–3 đã làm trên production ngày 2026-10-30 (áp từng file qua `supabase db query --linked -f`, rồi `supabase migration repair --status applied`; không dùng `db push` vì `20261029000000`/`20261030000000` chưa được ghi nhận trong lịch sử migration của remote).

1. **Owner pre-check (production):** `SELECT action, count(*) FROM public.admin_audit_log GROUP BY 1;` — chỉ được có 6 giá trị `update_role`, `update_plan`, `delete_user`, `update_permission`, `update_analytics_limit`, `reset_analytics_limit`; nếu có giá trị khác, migration `20261101030000` sẽ fail.
2. **Owner pre-check:** `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position;` — cột nào client có ghi mà chưa nằm trong GRANT thì phải thêm vào GRANT trong `20261101000000`.
3. `supabase db push` (áp dụng `20261101000000`, `20261101010000`, `20261101030000`).
4. Merge / deploy app lên Vercel.
5. PR follow-up: migration mới (timestamp mới, tạo sau khi app đã deploy) xoá bản v1 4 tham số:
   ```sql
   DROP FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text);
   ```
6. Verify sau deploy — kỳ vọng `f | f | t`:
   ```sql
   SELECT has_table_privilege('authenticated','public.profiles','UPDATE'),
          has_table_privilege('authenticated','public.profiles','DELETE'),
          EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='profiles_guard_privileged_columns');
   ```
7. Owner kiểm tra dấu hiệu bị xâm phạm ngay sau đó: danh sách `role='admin'`, user có `plan<>'free'` mà không có payment đã thanh toán, `monthly_analytics_limit_custom=true` không có dòng audit `update_analytics_limit` tương ứng.

**Cửa sổ rủi ro:** giữa bước 3 và 4, audit log admin phía client ghi thất bại âm thầm (bundle cũ insert trực tiếp); bundle cũ còn cache sẽ nhận 401 khi gửi welcome email.

### Account lock — phần API và DB guard

**Trạng thái production 2026-10-30 23:13 ICT:** migration `20261101090000` đã áp và ghi migration history. Verify metadata đạt 8 trigger, 6 restrictive SELECT policies, RLS/ACL đúng. Bundle API đã deploy ngày 2026-10-31: `dpl_5pzMwXHxqqUYGSitzYT5A2z9YwUm` (Ready), `cvfit.pro` đã chuyển sang bản này. Chưa kiểm thử khóa/mở khóa bằng tài khoản test trên production.

Áp migration `20261101090000_enforce_account_lock_writes.sql` rồi deploy bundle API cùng thay đổi `_server-lib/accountLock.ts`. Cần cả hai: DB guard bảo vệ ghi trực tiếp qua PostgREST và RPC chạy bằng owner; API guard bảo vệ các thao tác dùng service-role ở storage, payment create, PDF và recruiter save-analysis. Không thêm serverless function hay biến môi trường.

User không phải admin có `has_permission=false` nhận 403; không đọc được profile hoặc timeout kiểm tra nhận 503. Admin vẫn mở khóa được user. Profile được đọc lại mỗi request, không dựa vào JWT metadata hoặc đợi refresh token. Guard DB dùng role thực thi và `auth.role()` để giữ danh tính caller trong `SECURITY DEFINER`, giữ ownership RLS và thêm restrictive SELECT policy để chặn đọc trực tiếp hoặc cấp signed URL mới; áp cho `history`, `saved_jds`, `saved_cvs`, `recruitment_campaigns`, `candidate_cvs` và ghi object trong hai bucket CV.

Luồng PDF không có bearer vẫn là public có reCAPTCHA; bearer sai không được chuyển sang luồng này. Đây là khóa quyền theo danh tính, không phải chặn người dùng truy cập chức năng public. Payment confirm/webhook và cleanup nội bộ vẫn xử lý các giao dịch/file đã có. Signed URL phát hành trước khi khóa vẫn có hiệu lực đến TTL; không thể thu hồi bằng thay đổi profile.

Kiểm tra local: `supabase/tests/account_lock.test.sql` trên DB disposable; regression gần nhất là `plan_caps.test.sql` và `save_candidate_analysis_ownership.test.sql`. Trước khi coi đã đóng trên production, owner cần áp migration và deploy app, rồi xác minh bằng account test khóa/mở khóa; không dùng dữ liệu của user thật để thử.

### Bằng chứng deploy security bundle — 2026-10-31

- Project: `nghiepnguyens/cv-compare-tn`; deployment `dpl_5pzMwXHxqqUYGSitzYT5A2z9YwUm`.
- URL bất biến: `https://cv-compare-ljxi6vr0d-nghiepnguyens.vercel.app`; đã promote và đối chiếu `vercel inspect https://cvfit.pro`.
- Trước deploy: `npm run lint`, `npm run lint:api`, 54 file / 637 test Vitest và `npm run build` đạt trong Docker offline. Test debug xác minh production vẫn chặn nội dung chi tiết khi cờ debug bật.
- Sau deploy: curl GET `/vi/`, `/en/privacy/`, `/api/config` trên `cvfit.pro` đều 200; HTML có nội dung tĩnh và config public đủ Supabase URL/anon key.
- Đây là deploy CLI từ snapshot khớp worktree `codex/security-sentry-scrub`; chưa commit/merge/push bản sửa. Cần tích hợp Git trước lần deploy từ `main` tiếp theo để tránh ghi đè.
- Chưa chạy account test khóa/mở khóa trên production, thanh toán, email hoặc AI có phí. Npm trên Vercel báo 27 cảnh báo dependency (4 moderate, 19 high, 4 critical); chưa phân loại khả năng ảnh hưởng, chưa thay lockfile trong đợt này.
