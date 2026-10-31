# Security audit — cv-compare-tn (cvFit)

Ngày: 2026-10-30. **AUDIT ONLY — không thay đổi production code.**
Phạm vi: toàn bộ source tracked — `src/`, `api/`, `server/`, `server.ts`, `_server-lib/`,
`supabase/` (55 migrations + 2 Edge Functions), `scripts/`, `public/`, `vercel.json`,
`package.json`, `.github/workflows/`, `.env.example`.
Nguồn: `af518c7` (worktree dirty — chỉ review source tracked).
Phương pháp: source-first, chạy local trong PostgreSQL 16 container
(`--network none`, uid không đặc quyền, chỉ ghi tmpfs, 512 MB / 0.5 CPU / 128 PIDs).
Không gọi endpoint deployed, không gọi provider (Gemini / PayOS / Resend / R2 / Supabase).

Báo cáo này viết để **lên plan sửa**. Kết quả máy đọc được (findings.json,
coverage-ledger.json, transcript harness, bản tiếng Anh chi tiết) nằm ngoài repo tại
`~/security-audit-skill/cv-compare-tn/run-1/`.

---

## Cập nhật deploy — 2026-10-31

Security bundle §4.9, §4.8, §4.2 và phần còn lại NV-4 đã deploy production bằng CLI từ snapshot khớp worktree `/private/tmp/cv-security-sentry`, branch `codex/security-sentry-scrub` (base `b57d2b0`). Đã commit/push và merge PR #35 vào main (`b28845e`); CI main đạt, production `dpl_C7Z6RWeanDpZcN6tbY2Z3b4b7q2E` Ready. Các ghi chú “chưa deploy” ở phần lịch sử dưới đây mô tả thời điểm trước lượt này.

- Project thực tế: `nghiepnguyens/cv-compare-tn`, ID `prj_9ojmBXjiHRDi56zHS2uvYvJABOaI`; xác minh theo domain đang chạy. Hướng dẫn cũ ghi `cvfit` đã được sửa trong worktree.
- Deployment Ready: `dpl_5pzMwXHxqqUYGSitzYT5A2z9YwUm`, URL `https://cv-compare-ljxi6vr0d-nghiepnguyens.vercel.app`. Promote thành công; `vercel inspect https://cvfit.pro` trả đúng deployment này.
- Gate local offline: lint + lint:api + 54 file / 637 test Vitest + build đạt. Fixture debug dùng development rõ ràng; test production bật cờ debug vẫn không lộ nội dung.
- Smoke live bằng curl: `/vi/`, `/en/privacy/`, `/api/config` đều 200; HTML có h1/nội dung tĩnh; JSON config đủ public Supabase URL/anon key.
- Migration `20261101090000` đã áp và xác minh ở lượt trước (8 trigger, 6 restrictive SELECT policies). Không chạy lại migration.
- NV-4 đã đóng sau kiểm tra live khóa/mở khóa account test; xem bằng chứng và giới hạn phía dưới.
- Cảnh báo build npm: 27 dependency advisories (4 moderate, 19 high, 4 critical), chưa phân loại exploitability. Không tự nâng dependency ngoài phạm vi. → đã xử lý ngày 2026-10-31, xem "Cập nhật dependency".
- Việc còn lại với Git: tích hợp branch sửa vào main trước lần deploy Git tiếp theo để không ghi đè bản CLI.

---

## Cập nhật dependency — 2026-10-31

Branch `fix/dependency-advisories-2026-10-31` từ `origin/main` = `b28845e`; chưa commit, chưa deploy. `package-lock.json` trong worktree khớp `origin/main` trước khi sửa.

**Số liệu tái lập khác báo cáo gốc.** Chạy lại `npm audit` cùng ngày trả **65 advisory** trên 958 package (1 low, 22 moderate, 37 high, 5 critical), không phải 27 (4 moderate, 19 high, 4 critical) ghi ở plan. Khác biệt do advisory/registry cập nhật sau lượt audit; phân loại dưới đây dùng số tái lập được, không suy từ con số cũ.

### Phân loại theo khả năng ảnh hưởng

| Nhóm | Đường dẫn tiêu biểu | Trên production? | Xử lý |
|---|---|---|---|
| Runtime, input không tin cậy | `express` → `proxy-addr`/`body-parser`/`qs`, `express-rate-limit` → `ip-address` (chỉ đường Express `npm start` + blueprint `render.yaml`, không phải Vercel); `axios` → `follow-redirects` (gọi reCAPTCHA/PayOS); `@xmldom/xmldom` qua `mammoth` (validate DOCX upload ở `/api/storage`) | Có; `proxy-addr` không khai thác được vì Express không bật `trust proxy`, còn DOCX/axios là bề mặt thật | Nâng |
| Install/build | `tar` qua `@mapbox/node-pre-gyp`; `undici` qua `@vercel/node` (build) và `cheerio` (`scripts/generate-static-pages.ts`) | Không | Pin `tar`; bump `undici` nested |
| Dev/test | `vite`, `vitest` → `tinypool`, `jsdom`/`cssstyle`/`css-tree`, `postcss`/`nanoid`/`source-map-js`, `@babel/*`, `@tailwindcss/*`, `browserslist` | Không | Không nâng major |
| Vercel build tooling | `@vercel/node`, `@vercel/build-utils`, `@vercel/nft`, `@vercel/static-config`, `@vercel/python-analysis`, `ts-morph`, `ajv`/`fast-uri`, `js-yaml`, `smol-toml`, `zod`, `minimatch`/`brace-expansion` | Chỉ lúc build/deploy | Không nâng major |
| Client-only | `exceljs` → `archiver`/`zip-stream`/`readdir-glob`/`unzipper`/`rimraf` | Xuất XLSX ở browser, không parse file người dùng | Không nâng major |
| Runtime SDK | `@google/genai` → `protobufjs`, `google-auth-library`/`gaxios` | Gọi Gemini REST; không parse protobuf từ input | Không nâng major |

### Đã thay đổi

| Package | Trước → sau | Lý do |
|---|---|---|
| `express` | 5.2.1 → 5.3.0 | kéo `proxy-addr` 2.0.7→2.0.8 (critical), `body-parser` 2.2.2→2.4.0, `qs` 6.15.2→6.17.1 |
| `express-rate-limit` | 8.5.2 → 8.7.2 | `ip-address` 10.2.0→10.7.5 |
| `axios` | 1.16.0 → 1.21.0 | `follow-redirects` 1.16.0→1.16.2 |
| `@xmldom/xmldom` (transitive, `npm update`) | 0.8.13 → 0.8.15 | 10 advisory parse/memory DoS; vẫn trong range `^0.8.6` của `mammoth` 1.11.0 nên không cần nâng mammoth |
| `tar` (override mới) | 7.5.16 → 7.5.22 | critical decompression/parse DoS, chỉ install/build |
| `@vercel/node` → `undici` | 8.7.0 → 8.12.3 | advisory high, chỉ build |

Tổng: 21 package đổi version, 2 package nested thêm dưới `axios` (`agent-base`, `https-proxy-agent`). Không có major bump của direct dependency.

### Kết quả và gate

- `npm audit`: 65 → **33** (0 low, 19 moderate, 12 high, 2 critical).
- 2 critical còn lại: `vitest` + `tinypool`, dev/test; khai thác cần attacker kiểm soát worker options.
- 12 high còn lại: toàn bộ build/dev/export (`vite`, `postcss`, `browserslist`, `source-map-js`, `undici` qua `cheerio`, `@vercel/*` tooling).
- `npm run lint` + `npm run lint:api` đạt; **54 file / 637 test** đạt; `npm run build` đạt (sinh đủ 13 trang tĩnh).
- Smoke test DOCX thật: DOCX tối thiểu tạo bằng `jszip`, `mammoth.extractRawText` trả đúng nội dung với `xmldom` 0.8.15.

### Chấp nhận / còn mở

- `vitest` 3→4, `vite` 6→7/8 và `@google/genai` 1→2 là major — ngoài phạm vi "không nâng cấp hàng loạt", tách task riêng khi cần.
- `exceljs`/`archiver` chỉ ghi XLSX ở client; `undici` root 7.28.0 chỉ dùng trong script build tĩnh.
- Chưa chạy `npm ci` trên Node 22 của CI và build Vercel với lockfile mới; xác nhận ở lần CI/deploy kế tiếp. `npm install` local cảnh báo EBADENGINE từ `@renovatebot/pep440` (transitive của `@vercel/python-analysis`, cần Node 20.9/22.11/24) — cảnh báo có sẵn, không do thay đổi này.

---

## Cập nhật §4.1 rate limit — 2026-10-31

Tiếp trên branch `fix/dependency-advisories-2026-10-31`; **chưa commit phần này, chưa deploy, chưa áp migration production.**

**Vấn đề.** Limiter duy nhất trước đây là `express-rate-limit` trong `server/lib/rateLimiter.ts`, chỉ chạy khi `npm start`. Trên Vercel mỗi instance serverless không chia sẻ bộ nhớ nên `/api/extract-pdf`, `/api/storage` và nhánh feedback của `/api/send-email` không có giới hạn. `/api/rewrite-cv` + `/api/parse-cv` đã có cap giờ đếm từ `analysis_log`; `/api/payment/create` đã có cap đơn pending (§4.3b).

**Cách làm.** Bộ đếm dùng chung trong Postgres thay vì in-memory:

- `20261101100000_api_rate_limit.sql`: bảng `api_rate_limits` (PK `(subject, bucket)`, RLS bật, revoke `anon`/`authenticated`), RPC `consume_api_rate_limit(p_subject, p_bucket, p_limit, p_window_seconds)` SECURITY DEFINER trả `allowed/remaining/retry_after`, upsert nguyên tử theo cửa sổ cố định, validate độ dài/limit/window; hàm `purge_expired_api_rate_limits()` xoá row cũ hơn 2 ngày.
- `20261101100001_api_rate_limit_pg_cron.sql`: cron `purge-api-rate-limits` lúc 03:10 ICT.
- `_server-lib/rateLimit.ts`: `rateLimitSubject()` → `u:<uuid>` hoặc `ip:<hmac-sha256>` (không lưu IP thô; key là `RATE_LIMIT_SALT`, fallback `SUPABASE_SERVICE_ROLE_KEY`); `clientIpFromHeaders()` lấy hop đầu `x-forwarded-for` (Vercel sanitise header này trước handler), fallback `x-real-ip`; `enforceRateLimit()` timeout 1,5s, lỗi/malformed → fail-open + log warn (cùng chính sách với rate count AI).

| Endpoint | Bucket | Giới hạn | Subject |
|---|---|---|---|
| `POST /api/extract-pdf` | `extract_pdf` | 120/giờ | user nếu có Bearer, ngược lại IP hash |
| `POST /api/storage` (mọi action) | `storage` | 120/giờ | user |
| feedback (`type=feedback`) | `send_email_feedback` | 5/giờ | IP hash |
| welcome (`type=welcome`) | `send_email_welcome` | 5/giờ | user |

- Đếm **trước** reCAPTCHA/parse để cắt flood sớm; 429 dùng body `{ error: 'Too many requests. Please try again later.' }` như 429 hiện có. Không thêm header `Retry-After` để giữ shape cũ.
- Vercel truyền IP qua `clientIpFromHeaders(req.headers)`; Express dùng cùng helper (không dựa `req.ip`) để tránh bucket chung khi chạy sau proxy.

**Bằng chứng local.**

- `supabase/tests/api_rate_limit.test.sql`: **PASS** trên Postgres 16 disposable (`supabase/tests/local/run.sh`, không network): quyền bảng/RPC, 3 lần gọi limit 2 (allow/allow/deny + `retry_after`), bucket & subject độc lập, reset cửa sổ, 4 ca tham số sai, purge.
- Vitest: **56 file / 667 test** đạt (thêm 30: `_server-lib/__tests__/rateLimit.test.ts` 24 + 429 cho PDF/storage/feedback/welcome).
- `npm run lint`, `npm run lint:api`, `npm run build` đều đạt.

**Giới hạn.** Migration đã áp production nhưng **bundle API chưa deploy** nên endpoint chưa gọi RPC; chưa đo latency RPC thật; fail-open nghĩa là RPC lỗi thì endpoint vẫn phục vụ (auth, account lock và reCAPTCHA vẫn là gate chính). Giới hạn IP chỉ là defense-in-depth cho anonymous traffic; trên deployment không phải Vercel (Express/Render), `x-forwarded-for` do proxy đặt nhưng không được kiểm chứng sanitise, nên kẻ tấn công có thể xoay prefix để né giới hạn IP — các endpoint đã xác thực vẫn dùng subject `u:<uuid>` nên không bị ảnh hưởng.

**Đã áp production 2026-10-31:** `20261101100000` và `20261101100001` áp lên project `cvFit.pro` (`pgchcnmpuknbgyljdlyp`) bằng `supabase db query --linked -f` trong `BEGIN/COMMIT` (lock 5s, statement 30s), history ghi bằng `supabase migration repair --linked --status applied`. Verify sau áp: bảng `api_rate_limits` tồn tại + RLS bật, `anon`/`authenticated` không có quyền bảng hoặc EXECUTE, `service_role` chạy được; RPC limit 2 cho `true, true, false` với `retry_after ≥ 1`; cron `purge-api-rate-limits` active `10 20 * * *`. Fixture verify chạy trong transaction rollback, không để lại dòng nào. Không cần biến môi trường mới (`RATE_LIMIT_SALT` optional, đã thêm vào `.env.example`).

**Deploy 2026-10-31:** PR #37 merge vào main (`c4134d8`), Vercel production `dpl_2VDnmCD6NnnB5vpv1sMi4Uhk8ivB` Ready lúc 07:53 ICT, `cvfit.pro` trỏ đúng deployment. Smoke: `/api/config` 200, `/vi/` 200, `POST /api/extract-pdf` body rỗng trả 401. Gọi smoke này đã tạo 1 dòng `api_rate_limits` bucket `extract_pdf` (hits=1) — xác nhận bundle production thực sự gọi RPC; dòng sẽ được cron purge sau 2 ngày.

---

## Cập nhật §4.5b campaign cap — 2026-10-31

**Vấn đề.** `MAX_CAMPAIGNS.recruiter = 10` chỉ là hằng số UI; trigger `enforce_plan_caps` (`20261101070000`) mới chặn user không phải recruiter, chưa đếm số campaign. Recruiter gọi PostgREST trực tiếp tạo được không giới hạn; UI cũng không khoá nút tạo.

**Cách làm.**

- Migration `20261101110000_enforce_campaign_caps.sql`: `CREATE OR REPLACE` trigger function, thêm nhánh đếm `recruitment_campaigns` (mọi status) và raise `42501` `Campaign limit reached` khi recruiter đã có 10; admin miễn; `service_role`/`SECURITY DEFINER` không bị chặn (điều kiện `current_user` giữ nguyên).
- UI `RecruiterView`: nút "Tạo mới" bị `disabled` khi `campaigns.length >= MAX_CAMPAIGNS.recruiter`, kèm banner giải thích; guard trong `onCreate` của modal; `CreateCampaignModal` map lỗi `CAMPAIGN_LIMIT_REACHED` sang chuỗi dịch.
- `recruiterService.createCampaign` map lỗi Postgres `42501` + message `Campaign limit reached` thành sentinel `CAMPAIGN_LIMIT_REACHED` để UI hiển thị thông báo Việt/Anh thay vì text DB.
- Helper `campaignLimitForPlan`/`hasReachedCampaignLimit` trong `src/lib/planLimits.ts`.

**Bằng chứng local.**

- `supabase/tests/campaign_caps.test.sql`: **PASS** trên Postgres 16 disposable — recruiter tạo 10 (gồm 1 archived) rồi bị chặn ở đợt 11; free bị chặn; admin tạo 11 không bị chặn; `service_role` thêm 2 đợt vượt trần thành công.
- `supabase/tests/plan_caps.test.sql` vẫn PASS (không regression saved CV/JD/candidate caps).
- Vitest: `src/__tests__/planLimits.test.ts` (+5 case helper) và `RecruiterView.campaignLimit.test.tsx` (nút enabled ở 9, disabled + banner ở 10).
- `npm run lint`, `npm run lint:api`, full Vitest và build sẽ ghi ở lượt deploy kế tiếp.

**Giới hạn.** Đếm mọi status (khớp số "đã dùng" ở ProfileView); xoá campaign giải phóng slot ngay. Chưa chạy thử hành vi trên production (tránh tạo fixture user/campaign trong DB thật); enforcement được chứng minh bằng SQL test local + kiểm tra function/trigger trên prod.

**Đã deploy 2026-10-31:** PR #38 merge (`70dfa72`), Vercel production `dpl_8AzWW21Xp9Ws54sMCKjdVhRpXzWD` Ready lúc 08:03 ICT; bundle `/assets/index-*.js` trên `cvfit.pro` chứa `recruiterCampaignLimitReached`/`CAMPAIGN_LIMIT_REACHED`. Migration `20261101110000` áp sau deploy bằng `supabase db query --linked -f` trong transaction (lock 5s/statement 30s); `migration repair` không chạy được vì worktree chính không có file (file nằm ở worktree phụ), nên ghi history bằng INSERT trực tiếp vào `supabase_migrations.schema_migrations` với `statements` là nội dung migration. Verify prod: `pg_get_functiondef` chứa `Campaign limit reached` và `>= 10`, trigger `enforce_plan_caps` trên `recruitment_campaigns` còn đúng 1.

---

## Cập nhật §4.6 upload cap — 2026-10-31

**Vấn đề.** Upload thẳng Supabase Storage (`cv-files`, `cv-analyze-tmp`) chỉ bị chặn dung lượng từng file (50 MB / 15 MB) và folder owner; không giới hạn số object/user. Object tải trực tiếp không có row `storage_uploads` nên `runStorageCleanup` không bao giờ quét → tích luỹ vô hạn; object tạm bị bỏ quên còn chiếm chỗ.

**Cách làm.**

- Migration `20261101120000_storage_upload_quota.sql`: trigger `storage_quota` BEFORE INSERT trên `storage.objects` (chỉ `authenticated`/`anon`, dùng `auth.role()` nên service_role/SECURITY DEFINER đi thẳng; SECURITY DEFINER để count không bị RLS của bucket temp che):
  - saved `${uid}/${cvId}/${file}` hoặc `${uid}/${file}` → `MAX_SAVED_CV_BY_PLAN` (1/10/50).
  - candidate `${uid}/campaigns/${campaignId}/${file}` → 50/campaign, 500/user; chỉ recruiter/admin.
  - temp `${uid}/${file}` → 6/12/60 theo plan.
  - path khác → `42501 Invalid storage path` để không mở folder không đếm.
  - Tổng bytes bị chặn gián tiếp qua số object × `file_size_limit` của bucket.
- RPC `list_expired_temp_objects(p_limit)` (SECURITY DEFINER, chỉ service_role) + `runStorageCleanup` xoá object `cv-analyze-tmp` cũ hơn 24 giờ; lỗi sweep chỉ log, không fail cleanup. Không cần thêm serverless function/cron.
- Không đổi UI; lỗi quota trả về từ Storage API (message tiếng Anh) — mapping UX để follow-up.

**Bằng chứng local.**

- `supabase/tests/storage_upload_quota.test.sql`: **PASS** — free saved 1 rồi chặn; pro 10/11; recruiter saved 50/51, candidate 50/campaign/51, temp 60/61; path lạ bị chặn; free không tạo được folder campaign; service_role vượt trần; `list_expired_temp_objects` chỉ trả object > 24h và chỉ service_role execute.
- Các suite storage cũ: `account_lock`, `storage_buckets_private`, `plan_caps`, `campaign_caps` vẫn PASS. `r2_storage.test.sql` fail `Invalid storage identity` **cả trước và sau** thay đổi này (lỗi harness/stub có sẵn, không do trigger mới) — cần xử lý riêng khi làm §4.11.
- Vitest: `cleanup.test.ts` thêm 3 ca (sweep gọi RPC + xoá đúng list, không gọi khi rỗng, lỗi RPC không làm fail cleanup); **57 file / 676 test** đạt.
- `npm run lint`, `npm run lint:api`, `npm run build` đạt.

**Giới hạn.** Chưa thử hành vi trên production (tránh tạo object/user thật); enforcement chứng minh bằng SQL test local + kiểm tra function/trigger trên prod; cần theo dõi log cleanup sau deploy.

**Đã deploy 2026-10-31:** PR #39 merge (`14e69be`), Vercel production `dpl_GcZSNKsXYhT297BVd71rXqM8km7N` Ready lúc 08:18 ICT. Migration `20261101120000` áp sau deploy bằng `supabase db query --linked -f` trong transaction; do file không có trong worktree chính, history ghi bằng INSERT trực tiếp kèm `statements`. Verify prod: function `enforce_storage_quota()` tồn tại với `prosecdef = true`, chứa cả message saved/temp; trigger `storage_quota` trên `storage.objects` = 1; `list_expired_temp_objects` chỉ `service_role` execute; history = 1. Smoke: `/vi/` 200, `/api/config` 200, `POST /api/extract-pdf` rỗng → 401.

---

## Cập nhật §4.7 batch entitlement — 2026-10-31

**Hiện trạng trước khi sửa.** Đối chiếu source `14e69be`: profile lookup trong `handleAnalyze` **đã fail-closed** (`503 Account verification unavailable`, từ `b0bfe8e`), và `batchTotal` vượt `MAX_BATCH_BY_PLAN` đã trả `400`. Phần còn thực sự mở là `batchTotal` do client khai: mỗi request chỉ mang 1 CV, nên caller gửi `batchTotal: 1` lặp lại vẫn chạy được nhiều analyze hơn batch entitlement (chỉ còn bị quota tháng và cap giờ của rewrite/parse chặn một phần).

**Cách sửa.** Không tin `batchTotal` làm ranh giới thực thi; đếm chính số lần analyze trong 1 giờ:

- `_server-lib/accountLock.ts`: tách `checkHourlyAiLimit(userId, kind, plan, timeoutMs, signal)` khỏi `checkAiAccess`; `checkAiAccess` giữ nguyên hành vi (lock → cap giờ) và gọi helper này.
- `handleAnalyze`: sau lock + batch check, gọi `checkHourlyAiLimit(userId, 'analyze', effectivePlan)` → quá `max(10, 2 × MAX_BATCH_BY_PLAN)` (free/pro 10, recruiter 100) trả **429** `Too many requests. Please try again later.`; lookup lỗi/timeout fail-open như cũ. `batchTotal` vẫn được kiểm tra để fail sớm và giữ thông báo cũ, nhưng không còn là entitlement duy nhất.
- Không đổi client/API shape, không thêm migration hay endpoint.

**Bằng chứng.**

- `_server-lib/__tests__/analyzeLimits.test.ts` (mới): batch vượt plan → 400 trước rate/AI; hourly `rate_limited` → 429 và không gọi AI; recruiter dùng cap 100; profile lỗi → 503; account khoá → 403, không gọi rate.
- `accountLock.test.ts`: thêm 4 case cho `checkHourlyAiLimit` (ngưỡng 10/10/100, count thiếu, lookup ném lỗi → fail-open).
- `errorPrivacy.test.ts` cập nhật mock; **57 file / 685 test** đạt; `npm run lint`, `npm run lint:api`, `npm run build` đạt.
- Docs: `docs/5_api.md` sửa mô tả fail-open cũ của analyze thành fail-closed + cap giờ.

**Giới hạn.** Hourly cap đếm cả attempt lỗi sau auth (không đếm request thiếu JD/CV trước auth); fail-open khi `analysis_log` không truy vấn được. Chưa có test tích hợp gọi Gemini thật.

**Đã deploy 2026-10-31:** PR #40 merge (`b933dcd`), Vercel production `dpl_6QR2d41pcYfL7ySkxNTXEBL3LU3h` Ready lúc 08:31 ICT, `cvfit.pro` trỏ đúng bản này; CI main đạt. Không có migration. Smoke: `/vi/` 200, `/api/config` 200, `POST /api/analyze` body rỗng → 400 (validation JD trước auth, hành vi cũ); chưa gọi analyze bằng account thật để tránh tiêu quota.

---

## Cập nhật §4.10 Edge Functions — 2026-10-31

**Hiện trạng.** `supabase functions list` trên project production trước khi sửa: **3 function ACTIVE**, đều deploy từ 2026-05-15, không function nào được client gọi:

| Function | Ghi chú |
|---|---|
| `extract-pdf` | Parse PDF **không auth, không size cap**, CORS `*`, trả `error.message` thô |
| `verify-recaptcha` | Proxy Google reCAPTCHA, CORS `*`, trả nguyên JSON của Google; không còn client nào dùng |
| `send-email` | Deploy cũ nhưng **không có source trong repo**; mail flow đã chuyển sang `/api/send-email` |

Grep `supabase.functions.invoke`/`functions/v1` trong `src`, `server`, `api`, `_server-lib`: không có call site. Repo chỉ còn source `extract-pdf` + `verify-recaptcha`.

**Cách sửa.** Xoá thay vì harden: đây là endpoint chết, trùng chức năng với `/api/extract-pdf` và `/api/send-email` (đã có auth/account lock/rate limit/reCAPTCHA). Harden sẽ vẫn để một đường vòng dùng tài nguyên PDF/Resend ngoài các guard đó.

- `supabase functions delete extract-pdf verify-recaptcha send-email` trên project `pgchcnmpuknbgjdlyp` → `supabase functions list` rỗng sau khi xoá.
- Xoá `supabase/functions/extract-pdf/` và `supabase/functions/verify-recaptcha/` khỏi repo.
- Docs: `5_api.md`, `7_deployment.md`, `9_api_routes.md` ghi rõ không còn Edge Function; sửa luôn mô tả cũ về route `/api/verify-recaptcha` (route này chưa từng tồn tại trong `api/`/`server/`) và các chỗ nói auth flow verify qua endpoint đó — reCAPTCHA chỉ còn verify inline.
- Không thêm `supabase/config.toml` vì không còn function để cấu hình; trạng thái giờ kiểm tra bằng `supabase functions list`.

**Bằng chứng.** `functions list` rỗng; grep repo không còn `supabase/functions` (tsconfig vẫn exclude path này); client build không đổi. Vitest/lint/build chạy ở lượt này (xem PR). Không có migration; không cần deploy lại để thay đổi có hiệu lực vì xoá function là thao tác trên Supabase.

**Giới hạn.** Không kiểm tra access log của các function trước khi xoá (dashboard không có sẵn trong phiên này); dựa trên việc không có call site trong repo + tài liệu legacy. Nếu có client cũ ngoài repo gọi trực tiếp, các endpoint đó giờ trả 404 — chấp nhận vì đã được thay bằng `/api/*` từ 2026-07.

**Đã hoàn tất 2026-10-31:** 3 function đã xoá khỏi project (`functions list` rỗng, kiểm tra lại sau merge); PR #41 merge (`b34d7ac`) chỉ chứa xoá source + sửa docs; CI main đạt; Vercel deployment `dpl_AKFNVvesBGh222kU9WNKrVuPBRiT` Ready 08:40 ICT (không liên quan tới function). Smoke `/vi/` 200, `/api/config` 200.

---

## Cập nhật §4.11 migration drift — 2026-10-31

**Trước khi sửa.**

- `supabase migration list`: local có `20261029000000`/`20261030000000`, remote **không** (2 migration đã áp tay; cột `analysis_log.guard_metrics`, `history.score_version`, `candidate_cvs.score_version` đã có trên prod). `db push` vì vậy không chạy được.
- 2 file `20260613000000_remote_applied.sql`/`20260613010000_remote_applied.sql` chỉ là stub không có DDL.

**Đã sửa.**

- Repair history cho `20261029000000`/`20261030000000` sau khi kiểm tra cột tồn tại → `supabase db push --dry-run` trả **"Remote database is up to date"**.
- Xoá 2 stub khỏi repo và `migration repair --status reverted` khỏi remote (chúng không chứa DDL; giữ lại chỉ tạo cảm giác schema tái tạo được từ source trong khi không phải).
- Dựng **inventory schema** (bảng/cột/function/trigger/policy/index/constraint) từ production và từ bản replay toàn bộ migration trong Postgres 16 disposable để tìm phần lệch thật. Phát hiện 10 policy chỉ có trên prod, trong đó **`profiles.allow_read_all` cho mọi user `authenticated` đọc toàn bộ bảng `profiles`** (email, plan, usage, quyền) — rộng hơn nhu cầu; 9 policy còn lại là bản trùng của policy own/admin trong `20260516120000`, gồm `allow_admin_manage_all` gán quyền ALL theo email hard-code trong JWT.
- Migration `20261101130000_drop_legacy_dashboard_policies.sql`: drop 10 policy đó (idempotent). Sau áp, `pg_policies` chỉ còn policy từ source + restrictive `account_unlocked_read`.
- Migration `20261101140000_align_profiles_constraints.sql`: thêm `profiles_role_check`/`profiles_usage_count_check` mà fresh schema có từ base migration nhưng bảng `profiles` tạo tay trên prod đã bỏ qua (`CREATE TABLE IF NOT EXISTS`); bỏ `profiles_email_key` legacy (auth.users đã unique email). Dữ liệu prod được kiểm trước: 0 role lạ, 0 usage âm, 0 email trùng.

**Còn lại (chấp nhận, ghi rõ).** Inventory sau sửa chỉ còn 3 khác biệt kiểu cột: `history.id`/`saved_jds.id` là `bigint` trên prod nhưng `uuid` trong source, `history.match_score` `integer` vs `numeric`. Đây là bảng tồn tại trước chuỗi migration nên `CREATE TABLE IF NOT EXISTS` không đổi kiểu; đồng bộ cần tạo bảng mới + copy dữ liệu + đổi code — ngoài phạm vi audit, đã ghi trong `docs/7_deployment.md`.

**Bằng chứng.**

- `db push --dry-run`: up to date; `migration list` local/remote khớp (gồm `20261101130000`/`20261101140000`).
- Replay toàn bộ migration (gồm 2 migration mới) trên Postgres 16 + `account_lock.test.sql`: PASS (chỉ còn 2 lỗi GRANT cũ của `20260602100000` như mọi lượt).
- Prod sau áp: `pg_policies` không còn 10 policy legacy; `profiles_role_check`/`profiles_usage_count_check` tồn tại; `profiles_email_key` đã bỏ.
- Audit doc + `docs/7_deployment.md` cập nhật bảng migration và mục drift.

**Giới hạn.** Chưa chạy live test đọc profile bằng account user thật sau khi bỏ policy (dựa vào policy source + RLS hiện có); 3 khác biệt kiểu cột vẫn tồn tại như đã nêu.

**Đã hoàn tất 2026-10-31:** PR #42 merge (`f0fb534`) gồm 2 migration + xoá stub + docs; CI main đạt; Vercel production `dpl_8ycVvx6majnPpRAzv4gaZ1gCvXq6` Ready 08:49 ICT (không có thay đổi code app). Smoke `/vi/` 200, `/api/config` 200. Prod đã áp `20261101130000`/`20261101140000` và repair/revert history trước khi merge; `db push --dry-run` vẫn up to date.

---

## Cập nhật §4.12 CORS + body limit — 2026-10-31

**Vấn đề.** Express có CORS allowlist (`cvfit.pro`, `www.cvfit.pro`, localhost dev) và `express.json({ limit: '50mb' })`, nhưng các handler `api/*.ts` trên Vercel không set CORS header và không tự giới hạn body — chỉ dựa vào giới hạn 4.5 MB của platform, không có kiểm tra phía app.

**Cách làm.** Thêm `_server-lib/http/guard.ts`:

- `applyCors(req, res)`: luôn `Vary: Origin`; chỉ echo `Access-Control-Allow-Origin` đúng origin trong allowlist (không dùng `*`), kèm methods/headers/max-age. Cùng-origin (SPA gọi `/api/*`) không bị ảnh hưởng.
- `handlePreflight(req, res)`: trả `204` cho `OPTIONS` trước mọi kiểm tra method/body.
- `rejectOversizedBody(req, res, max)`: đọc `content-length` đã khai, vượt ngưỡng → **413** trước khi parse/lazy `req.body`.
- `BODY_LIMITS`: `ai` 16 MB (analyze/rewrite/parse/save-analysis, đủ cho base64 2 MB + JSON), `pdf` 16 MB (decode 10 MB), `json` 256 KB (email/payment/admin).
- Áp vào 9 entry handler: `config`, `analyze`, `rewrite-cv`, `parse-cv`, `extract-pdf` (gồm nhánh storage), `send-email`, `payment`, `admin`, `recruiter/save-analysis`. `server.ts` (Express) giữ nguyên allowlist + 50 MB.

**Bằng chứng.** `_server-lib/__tests__/httpGuard.test.ts` (7 case: echo origin, từ chối origin lạ, localhost chỉ ngoài production, preflight 204, 413 quá ngưỡng, đúng ngưỡng/không có header, parse content-length lỗi). Cập nhật mock `setHeader`/`end` trong 4 test API. **59 file / 692 test** đạt; `tsc` + `tsc -p tsconfig.api.json` đạt. Docs `9_api_routes.md` cập nhật.

**Giới hạn.** Chỉ kiểm `content-length` khai báo (không đọc lại body); platform Vercel vẫn là giới hạn thật (4.5 MB) nên ngưỡng 16 MB chủ yếu bảo vệ khi chạy ngoài Vercel hoặc nếu platform nới limit. Allowlist dùng chung danh sách với Express nhưng chưa import chung một hằng số — hai chỗ cần sửa cùng lúc nếu đổi domain.

---

## Plan tiếp theo (trạng thái hiện tại)

**Chốt 2026-10-31: toàn bộ backlog §4.1–§4.12 và các mục P0/NV của audit đã đóng trên production.**

| Mục | Trạng thái | PR / deploy |
|---|---|---|
| Dependency advisories | Đóng (65→33, 2 critical còn lại dev-only) | #37 · `dpl_2VDnmCD6NnnB5vpv1sMi4Uhk8ivB` |
| §4.1 rate limit chung | Đóng (migration `20261101100000/1`) | #37 · cùng deploy |
| §4.5b campaign cap | Đóng (migration `20261101110000` + UI) | #38 · `dpl_8AzWW21Xp9Ws54sMCKjdVhRpXzWD` |
| §4.6 upload cap | Đóng (migration `20261101120000`) | #39 · `dpl_GcZSNKsXYhT297BVd71rXqM8km7N` |
| §4.7 batch entitlement | Đóng (cap giờ analyze 10/10/100) | #40 · `dpl_6QR2d41pcYfL7ySkxNTXEBL3LU3h` |
| §4.10 Edge Functions | Đóng (xoá 3 function production + source) | #41 · `dpl_AKFNVvesBGh222kU9WNKrVuPBRiT` |
| §4.11 migration drift | Đóng (repair history, bỏ stub, policy/constraint drift) | #42 · `dpl_8ycVvx6majnPpRAzv4gaZ1gCvXq6` |
| §4.12 CORS + body limit | Đóng (guard 9 handler Vercel, live verified) | #43 · `dpl_GcCHJrzF1hYFirJ52LpDMJSimgcm` |
| P0-1 / P1-1 / P2-1 / NV-1..NV-4 | Đóng từ PR #22–#35 | xem bảng bên dưới |

**Việc còn lại (không phải lỗ hổng):** cảnh báo `DEP0169 url.parse()` từ dependency ở cron `/api/storage`; 3 khác biệt kiểu cột prod-vs-source đã ghi trong `docs/7_deployment.md` (§4.11); theo dõi `purge-api-rate-limits`/cleanup sau vài chu kỳ cron.

Checklist chi tiết từng mục giữ nguyên bên dưới làm lịch sử.

- [x] §4.9 scrub telemetry và chặn debug nội dung ở production.
- [x] §4.8 chuẩn hóa lỗi upstream; §4.2 xác minh reCAPTCHA action/hostname/score.
- [x] NV-4: triển khai API guard và áp migration `20261101090000` trên production.
- [x] Lint, typecheck API, 637 test và build; deploy/promote, kiểm tra public pages/config.
- [x] **Git:** commit/push branch, merge PR #35 vào main (`b28845e`); CI và deployment production sau merge đạt. Audit riêng tư không đưa vào PR.
- [x] **NV-4 — đóng:** kiểm tra live account test khóa/mở khóa, API và DB; chi tiết bên dưới.
- [x] **Dependency — 2026-10-31:** tái lập và phân loại advisory theo runtime/dev; nâng `express`, `express-rate-limit`, `axios`, `xmldom`, pin `tar`; 65 → 33 advisory (2 critical còn lại là dev/test). Chi tiết ở "Cập nhật dependency — 2026-10-31".
- [x] **§4.1 rate limit chung — 2026-10-31:** bộ đếm Postgres dùng chung + RPC `consume_api_rate_limit`, áp cho `extract-pdf` (120/giờ), `storage` (120/giờ), feedback (5/giờ/IP), welcome (5/giờ/user); SQL test + 667 test + lint/build đạt. Chi tiết ở "Cập nhật §4.1 rate limit". PR #37 đã merge (`c4134d8`) và deploy production (`dpl_2VDnmCD6NnnB5vpv1sMi4Uhk8ivB`).
- [x] **§4.5b campaign cap — 2026-10-31:** trigger đếm `MAX_CAMPAIGNS` = 10/recruiter (admin miễn) + UI khoá nút tạo/banner; SQL test `campaign_caps` + component test. Chi tiết ở "Cập nhật §4.5b campaign cap".
- [x] **§4.6 upload cap — 2026-10-31:** trigger `storage_quota` giới hạn object trực tiếp (saved 1/10/50, candidate 50/campaign + 500/user, temp 6/12/60) + sweep temp > 24h trong `runStorageCleanup`; SQL test + 676 test + lint/build đạt. Chi tiết ở "Cập nhật §4.6 upload cap". PR #39 đã merge (`14e69be`) và deploy production (`dpl_GcZSNKsXYhT297BVd71rXqM8km7N`).
- [x] **§4.7 batch entitlement — 2026-10-31:** thêm cap giờ analyze (10/10/100, đếm `analysis_log`) để không phụ thuộc `batchTotal` client khai; profile lookup vốn đã fail-closed, batch vượt plan vẫn 400. Test mới + 685 test đạt. Chi tiết ở "Cập nhật §4.7 batch entitlement". PR #40 đã merge (`b933dcd`) và deploy production (`dpl_6QR2d41pcYfL7ySkxNTXEBL3LU3h`).
- [x] **§4.10 Edge Functions — 2026-10-31:** xoá 3 function production (`extract-pdf`, `verify-recaptcha`, `send-email`) và source khỏi repo; không còn endpoint ngoài `/api/*`; sửa mô tả stale về `/api/verify-recaptcha`. Chi tiết ở "Cập nhật §4.10 Edge Functions". PR #41 đã merge (`b34d7ac`); function production đã xoá (`functions list` rỗng).
- [x] **§4.11 migration drift — 2026-10-31:** repair 2 version thiếu, bỏ 2 stub no-op, drop 10 policy legacy (gồm `profiles.allow_read_all`), align profile constraints; `db push --dry-run` up to date; còn 3 khác biệt kiểu cột có chủ đích. Chi tiết ở "Cập nhật §4.11 migration drift". PR #42 đã merge (`f0fb534`) và deploy production (`dpl_8ycVvx6majnPpRAzv4gaZ1gCvXq6`).
- [x] **§4.12 CORS + body limit — 2026-10-31:** guard chung cho 9 handler Vercel (allowlist echo + preflight 204 + 413 theo `content-length`); 59 file / 692 test đạt. Chi tiết ở "Cập nhật §4.12 CORS + body limit". PR #43 đã merge (`e09c322`), Vercel production `dpl_GcCHJrzF1hYFirJ52LpDMJSimgcm` Ready 08:57 ICT.
- [ ] Còn lại ngoài backlog: cảnh báo `DEP0169 url.parse()` ở cron `/api/storage` (từ dependency) — không phải lỗ hổng, theo dõi khi nâng dependency.

### NV-4 — bằng chứng đóng ngày 2026-10-31

- Profile account test có `role=user`, `has_permission=false` được xác nhận trên production; UI hiển thị màn hình khóa.
- Request bằng phiên đăng nhập thật do owner chạy trong Console: `/api/parse-cv`, `/api/storage`, `/api/recruiter/save-analysis`, `/api/extract-pdf`, `/api/payment/create` đều trả **403 `Account locked`** khi khóa. Không có phản hồi tạo đơn thanh toán thành công.
- PostgREST history bằng JWT thật: khi khóa trả 200 / 0 dòng, sau mở khóa trả 200 / 1 dòng, theo quy trình giữ nguyên phiên.
- Sau mở khóa: Storage trả 400 `Thao tác không hợp lệ`, recruiter trả 400 `Missing candidateId or analysisResult` với body `{}`; chứng minh đã vượt gate khóa, không phải bằng chứng thao tác nghiệp vụ thành công. Chrome đã reload và xác nhận form phân tích xuất hiện lại.
- Live DB INSERT history: dùng `SET LOCAL ROLE authenticated` và claims account test trong transaction rollback; nhận chính xác `account_locked` / SQLSTATE `42501`. Không lưu fixture. Script local: `/private/tmp/cv-security-nv4/live-write-check.sql`.
- Kết hợp 3 SQL suites local và 637 test đã đạt, đủ đóng NV-4 trong phạm vi audit hiện tại.
- **Giới hạn:** write live dùng role/claims mô phỏng, chưa gửi write qua JWT thật; chưa thử live mọi bảng/bucket hoặc tất cả nhánh CRUD. Không coi đây là bằng chứng kiểm thử mọi thao tác. Giới hạn không giữ NV-4 mở; lưu làm coverage follow-up khi có regression. Account test đã được khóa lại cho lượt PDF/payment và chưa mở lại trong phiên này.

Các phần dưới giữ bằng chứng và lịch sử audit; trạng thái hiện tại ưu tiên theo plan và cập nhật deploy phía trên.

## Trạng thái xử lý (cập nhật 2026-10-30, prod `b57d2b0`)

Tất cả PR #22–#33 đã merge và deploy. Migration `20261101000000`–`20261101080001` đã áp trên prod và ghi nhận trong migration history.

| ID | Trạng thái | PR / migration | Bằng chứng trên prod |
|---|---|---|---|
| P0-1 tự phong admin | **Đóng** | #22 · `20261101000000` | grant `f\|f\|t`; test rollback: self role/plan/usage/limit/delete bị từ chối, admin client vẫn sửa được permission/limit |
| P1-1 ghi chéo candidate | **Đóng** | #22, #23 · `20261101010000`, `20261101040000` | chỉ còn bản 5 tham số; sai owner → 42501; recruiter save thật `done` 92 điểm |
| P2-1 giả mạo audit | **Đóng** | #22 · `20261101030000` | client INSERT bị từ chối; 4 thao tác admin thật ghi qua `log_admin_action` |
| NV-1 welcome email | **Đóng** | #22 | không token → 401; mail thật tới đúng hộp thư |
| NV-2 rewrite/parse không quota | **Đóng** | #28 | rate limit/giờ: free/pro 10, recruiter 100 (429); phân tích thật sau deploy vẫn 200 |
| NV-3 bucket public | **Không ảnh hưởng prod; repo sửa** | #25 · `20261101060000` | `cv-files`/`cv-analyze-tmp` `public=false`, 0 URL public |
| NV-4 khoá chỉ ở UI | **Đóng** | #26, #35 · `20261101090000` | 5 API trả 403; history 0→1 sau mở khóa; INSERT live rollback bị chặn; UI/API phục hồi |
| §4.3 PayOS webhook | **Đóng** | #27 | chỉ tin `data.code` có chữ ký, so `amount`, `timingSafeEqual`; đơn 69.000đ thật kích hoạt qua webhook |
| §4.3b đơn pending | **Đóng** | #31 | tối đa 5 đơn pending / 15 phút / user (429) |
| §4.4 retention 7 ngày | **Đóng** | #33 · `20261101080000/1` | cron `purge-free-history` 03:00 ICT; lần đầu xoá 236 dòng (27 user), không backup theo quyết định chủ hệ thống |
| §4.5 plan caps client-side | **Đóng** | #32 · `20261101070000` | trigger `enforce_plan_caps`; user đủ trần bị chặn, free mới vẫn lưu được |
| §4.8 lỗi trả chi tiết upstream | **Một phần** | #22 | bỏ `detail` ở recruiter save; các handler khác chưa rà |
| (mới) admin đổi plan/role hỏng từ 2026-07 | **Đóng** | #24 · `20261101050000` | đổi plan thật thành công, có audit `update_plan` |
| (mới) `send-email` crash khi Content-Type sai | **Đóng** | #29 | `Content-Type: application/json; charset` → 400 (trước: 500 `FUNCTION_INVOCATION_FAILED`) |
| (mới) trang thanh toán gọi confirm 17 lần/2s | **Đóng** | #30 | test re-render; chưa quan sát giao dịch thật thứ hai |

### Lịch sử local trước deploy 2026-10-30 — §4.9 → §4.8 → §4.2

**Chưa merge / chưa deploy.** Branch `codex/security-sentry-scrub`, worktree `/private/tmp/cv-security-sentry`, base local `origin/main` = `b57d2b0` khớp mốc prod ghi ở trên. Workspace chính vẫn ở `af518c7`; không dùng source nhánh cũ để đánh giá lại các lỗi đã đóng. Chưa fetch remote hoặc kiểm tra lại production trong lượt này.

| Mục | Bản sửa local | Kiểm chứng |
|---|---|---|
| §4.9 Sentry + debug | Scrub đệ quy theo key cho frontend/server events và structured logs: nested objects, arrays, JSON serialized, circular context; `instrument.ts` dùng chung initializer. Nội dung suggestion/rewrite chỉ log khi `NODE_ENV=development` và `SUGGESTION_GUARD_DEBUG=1`. | Assert harness đạt cho helper, cả hai SDK hooks, Express initializer và bộ lọc noise cũ. Có test Vitest tương ứng; suite chưa chạy được. |
| §4.8 lỗi upstream | Thông báo cố định cho AI provider/storage failures, PDF, feedback/email, admin RPC/delete-user, payment insert/activation và các catch Vercel/Express. Giữ mã HTTP và cờ retry timeout. | 10 ca AI/PDF từng fail do lộ marker upstream nay đạt; bổ sung regression tests AI/PDF/payment/admin. Các đường admin/email/payment còn được đối chiếu source, chưa có full-suite evidence. |
| §4.2 reCAPTCHA | Bỏ auto-pass ngoài production. Kiểm success, score hữu hạn trong ngưỡng, action đúng luồng và hostname exact allowlist; axios timeout 5s, lỗi mạng trả 503 an toàn. | Harness offline đạt valid token, sai/thiếu action/hostname/score, NaN/out-of-range/low score, development không bypass, thiếu secret, token rỗng, lỗi mạng. Cập nhật fixture PDF theo action `extract_pdf`; có test Vitest riêng. |

**Các gate đã đạt:** `tsc --noEmit` (`npm run lint`) và `tsc --noEmit -p tsconfig.api.json` (`npm run lint:api`), `git diff --check`. Cả hai typecheck đã chạy lại và đạt sau chỉnh cleanup environment của test PDF để không rò biến môi trường giữa test.

**Gate còn chặn:** Vitest và Vite build không khởi động được trong Docker vì dependencies local chỉ có Rollup macOS, thiếu `@rollup/rollup-linux-arm64-gnu`. Không cài dependency / không bật network cho target code. Cần chạy full suite và `npm run build` trong sandbox có dependencies tương thích Linux sẵn có trước merge/deploy. `sandbox-exec` macOS bị từ chối, nhưng đã thay bằng Docker offline thành công; không còn dùng lỗi sandbox-exec làm blocker chung.

**Điều kiện kiểm chứng:** image local `mcr.microsoft.com/playwright:v1.63.0-noble` (Node 24.20.0), `--network none --read-only --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges`, giới hạn CPU 1–2, RAM 512MB–3GB, PID 64–128, CPU-time 30–120s, file 10–50MB, `timeout` 30–90s; chỉ ghi tmpfs `/scratch` 64–256MB. Chỉ mount bản source đã loại secrets và dependency tree read-only, không mount repo `.git`, env, home hoặc socket host. Process dùng `env -i`, chỉ `PATH`, scratch-local `HOME`/`TMPDIR`, `CI`, `NODE_ENV` an toàn.

Harness có thể xem tại `/private/tmp/cv-security-validation/check-{sentry,sentry-hooks,errors,recaptcha}.cjs`; source snapshot đã lọc nằm trong `source/` cạnh đó. Đây là self-check fixtures có dependency/SDK mock, không phải toàn bộ Vitest hay thử nghiệm production.

**Triển khai:** mặc định `RECAPTCHA_ALLOWED_HOSTNAMES=cvfit.pro,www.cvfit.pro`; hostname preview hoặc localhost phải thêm rõ trong environment thích hợp. Backend vẫn cần `RECAPTCHA_SECRET_KEY` ngay cả development. Action frontend hiện có `feedback`/`extract_pdf` đã khớp các caller backend. Tham khảo Google: https://developers.google.com/recaptcha/docs/v3 và https://developers.google.com/recaptcha/docs/verify.

**Giới hạn:** scrub theo key không phải bộ lọc PII trong free-form text và không xoá dữ liệu Sentry cũ; chưa xác minh cấu hình/deploy thực tế. Các mục bên dưới vẫn mở trên production. NV-4 phần còn lại đã có bản sửa local ở mục kế tiếp. Backlog sau đó: rate limit chung, campaign cap, upload cap, batch entitlement, Edge Functions, migration drift và CORS/body limit.

### Lịch sử NV-4 trước deploy — DB đã áp, API còn ở local

Worktree `/private/tmp/cv-security-sentry`, cùng branch `codex/security-sentry-scrub` với các bản sửa local phía trên. DB đã thay đổi theo yêu cầu áp migration của owner; chưa deploy bundle API trong lượt áp migration.


**Đã áp DB lúc 23:13 ICT, 2026-10-30** trên project liên kết `CV-compre-tn` (`pgchcnmpuknbgyljdlyp`), bằng `supabase db query --linked`. Chỉ áp `20261101090000`; DDL, assertions và INSERT migration history commit cùng transaction, lock timeout 5s / statement timeout 30s. Không dùng `db push` và không sửa các version lịch sử khác.

Truy vấn độc lập sau commit xác nhận **8 trigger đang bật**, **6 SELECT policies RESTRICTIVE cho authenticated**, RLS bật trên cả 6 bảng đích, guard SECURITY INVOKER và anon/authenticated không có EXECUTE. Hash SHA-256 source trong `supabase_migrations.schema_migrations.statements[1]` khớp file local: `c38eee44cf4ddf191c8541d5bf98b3397260279285ab14eed18cb10cae0b8a27`. Script áp/verify ở `/private/tmp/cv-security-nv4/apply-production.sql` và `verify-production.sql`. Chỉ kiểm metadata trên prod, không tạo fixtures hoặc thao tác dữ liệu user thật. Phần API vẫn cần deploy trước khi đóng toàn bộ NV-4.

- **API:** dùng chung `getAccountProfile`/`checkAccountAccess`; lookup profile có timeout 4s và kiểm tra shape dữ liệu. Tài khoản khóa nhận 403; lỗi/timeout/profile thiếu hoặc sai shape nhận 503. Gắn trước I/O của cả 5 storage actions, payment create, PDF có token và recruiter save-analysis ở cả Vercel/Express. Bearer sai không fallback thành PDF anonymous. Admin vẫn được miễn lock theo quy tắc UI.
- **AI:** account lookup của analyze/rewrite/parse không còn fail-open; analyze kiểm tra trước khi đọc file Storage. Rate-count và quota behavior khác không mở rộng trong task này.
- **DB:** migration `20261101090000_enforce_account_lock_writes.sql` (tạo bằng Supabase CLI, xếp sau migration hiện hữu mới nhất). Giữ ownership RLS, thêm 6 restrictive SELECT policies để chặn direct reads/cấp signed URL mới. Thêm trigger SECURITY INVOKER cho INSERT/UPDATE/DELETE ở 5 bảng (`history`, `saved_jds`, `saved_cvs`, `recruitment_campaigns`, `candidate_cvs`) và object trong 2 bucket CV. Guard kiểm cả role thực thi và JWT role để chặn cả RPC SECURITY DEFINER; Storage UPDATE xét bucket cũ/mới. Profile vẫn đọc được để hiển thị lock và admin phục hồi. Function guard revoke khỏi PUBLIC/anon/authenticated.
- **Bằng chứng:** snapshot trước sửa trả 200 cho locked storage/payment/PDF/recruiter trong fixture; DB test tái lập locked user ghi history và đọc history trực tiếp. Source cuối đạt **67/67 API self-check**, **3 SQL suites** (`account_lock`, `plan_caps`, `save_candidate_analysis_ownership`), cả `tsc --noEmit` và `tsc --noEmit -p tsconfig.api.json`, cùng `git diff --check`. Đã thêm/cập nhật Vitest fixtures để phù hợp fail-closed; full Vitest/build vẫn chưa chạy được vì dependency local thiếu Rollup Linux. Self-check có mock SDK/provider, không phải full integration production.
- **SQL coverage:** lock CRUD/read, 2 bucket và chuyển vào/ra CV bucket, SECURITY DEFINER HR update, ACL guard/RLS, admin recovery, unlock ngay với cùng JWT, service-role maintenance và bucket không liên quan. Chạy Postgres 16 disposable offline với auth/storage stubs trong repo; bỏ 2 migration cron. Có đúng 2 GRANT/REVOKE tại `20260602100000` tham chiếu hàm `activate_pro_plan` 4 tham số đã bị drop trước đó: chỉ loại 2 câu đó trong snapshot local, giữ ON_ERROR_STOP=1 cho phần còn lại; không sửa migration lịch sử trong repo. Đây không phải bằng chứng clean schema replay hoặc production schema khớp hoàn toàn.
- **Artifacts kiểm chứng:** `/private/tmp/cv-security-nv4/check-api.cjs`, `run-sql.sh`, `source/`, và `supabase/` snapshot cạnh đó. Container không network, root read-only, user không root, cap-drop ALL, no-new-privileges, chỉ ghi scratch tmpfs, có CPU/RAM/PID/file/wall-time limits, `env -i`; không mount secrets/home/socket host. Chưa chạy hosted advisors hoặc dùng production credentials.
- **Để đóng toàn bộ NV-4:** DB migration đã áp; còn deploy API; chạy full suite/build với dependencies tương thích; owner xác minh bằng account test khóa/mở khóa. Không thêm function serverless hoặc biến môi trường. Giới hạn replay cũ cần xử lý theo backlog migration drift, không đánh dấu đã giải quyết.
- **Giới hạn:** PDF không bearer vẫn là chức năng public có reCAPTCHA; không thể tra account lock khi caller bỏ danh tính. Signed URL đã phát hành vẫn có hiệu lực đến TTL. Payment confirm/webhook và cron cleanup vẫn xử lý giao dịch/bảo trì đã có. Không chặn admin hoặc đường phục hồi profile.

### Backlog hiện tại (không ghi vào repo public)

- **§4.1** rate limit chung trên Vercel (đã có cho rewrite/parse, payment create; chưa có cho `extract-pdf`, `storage`, `send-email`).
- **§4.5b** `MAX_CAMPAIGNS` = 10 chưa enforce (UI cũng không).
- **§4.6** upload thẳng vào Storage không giới hạn số object/dung lượng theo user.
- **§4.7** batch entitlement: `batchTotal` do client khai; lookup plan fail-open.
- **§4.10** Edge Functions `extract-pdf` không auth/size cap, CORS `*`.
- **§4.11** 2 migration stub `remote_applied`; prod chưa ghi nhận `20261029000000`/`20261030000000` → `supabase db push` vướng, dùng `migration repair` hoặc áp từng file.
- **§4.12** CORS allowlist + body limit trên Vercel.
- Cảnh báo `DEP0169 url.parse()` ở cron `/api/storage` (log mức error, từ dependency).

---

## 0. Tóm tắt điều hành

Database authorization của dự án được làm kỹ hơn mặt bằng chung: bảng nào cũng bật RLS,
grant `SECURITY DEFINER` đã thu hẹp dần về `service_role`, upload qua server có lease
fencing, xoá có tombstone + queue. **Nhưng một lỗ hổng duy nhất phá toàn bộ mô hình:**
policy UPDATE trên `profiles` chỉ kiểm tra "đúng dòng của mình", không giới hạn cột.
Vì `is_admin()` đọc chính `profiles.role`, một user tự đăng ký có thể tự phong admin
bằng một request, rồi đổi plan, reset quota, đọc/sửa profile người khác và reach được
`/api/admin/delete-user`.

Lớp API serverless yếu hơn lớp DB: handler xác thực bearer rồi tin định danh đối tượng
do client gửi lên (`candidateId`), để browser giữ các luật sản phẩm (`has_permission`,
plan), và **không có rate limit nào trên bề mặt Vercel đang chạy** (limiter chỉ nằm ở
đường Express). Không tìm thấy sink injection: mọi field email đều escape, markdown
được sanitize, không có `dangerouslySetInnerHTML` / `eval` / shell trong code first-party.

**Kết quả: 3 lỗi xác nhận (1 High, 1 Medium, 1 Low) + 4 điểm cần chủ hệ thống xác minh
(không gán severity) + danh sách hardening.**

---

## 1. Bảng ưu tiên sửa

| ID | Mức | Vị trí | Việc cần làm | Test hồi quy | Công sức |
|---|---|---|---|---|---|
| **P0-1** | High | `supabase/migrations/20260516120000_cv_matcher_core_schema.sql:157-168` | Thêm trigger chặn ghi cột quyền lực + chuyển sang column-level grant | `supabase/tests/profiles_authority.test.sql` (đã có trong findings.json) | 0.5–1 ngày |
| **P1-1** | Medium | `api/recruiter/save-analysis.ts:18-44`, `server/routes/recruiter.ts:11-32`, RPC `save_candidate_analysis` | Bind `p_user_id` + kiểm tra campaign owner trong hàm; revoke PUBLIC/anon/authenticated | `supabase/tests/save_candidate_analysis_ownership.test.sql` (đã có) | 0.5 ngày |
| **P2-1** | Low | `supabase/migrations/20260616000000_admin_audit_log.sql:24-31` | Revoke INSERT khỏi authenticated/anon, thêm CHECK action, RPC `log_admin_action` có `is_admin()` | Test: non-admin insert bị từ chối | 0.5 ngày |
| **NV-1** | — | `api/send-email.ts` → `_server-lib/email/handlers.ts:122-161` | Xác minh trước, rồi mới quyết định: auth/captcha/rate limit cho nhánh `welcome` | Owner-observed (mục 3) | 1–2 h |
| **NV-2** | — | `_server-lib/rewriteCv/handler.ts`, `_server-lib/parseCv/handler.ts`, `vercel.json` | Xác minh chi phí Gemini; nếu có, áp quota + rate limit cho 2 endpoint | Local harness stub SDK | 2–4 h |
| **NV-3** | — | `20260516120000:221-239` (`cv-files` bucket `public = true`) | Đọc `storage.buckets.public` trên project; nếu true thì flip private | 1 câu SQL + 1 GET | 15 phút |
| **NV-4** | — | `src/app/AppContent.tsx:271-277`, các handler | Xác minh lock có hiệu lực server-side; nếu không, enforce ở API | Lock 1 account test rồi gọi API | 1–2 h |

Thứ tự triển khai đề xuất: **P0-1 → P1-1 → (NV-3, NV-4 xác minh nhanh) → P2-1 → NV-1/NV-2 → hardening**.

---

## 2. Chi tiết lỗi đã xác nhận

### P0-1 — High — Tự phong admin qua `profiles`

**Nguyên nhân.** `profiles_update_own_or_admin` dùng
`USING/WITH CHECK (id = auth.uid() OR public.is_admin())` — chỉ kiểm tra dòng, không
giới hạn cột. `profiles_insert_own` cũng chỉ kiểm tra `id = auth.uid()`. Không migration
nào thêm trigger `ON public.profiles`, không `REVOKE UPDATE`, không column grant.
`authenticated` có UPDATE/INSERT bảng (Supabase default grant; chính app đang dựa vào —
`src/services/userService.ts:165,238` insert/update profile từ client anon-key).

**Chuỗi khai thác.**
1. User tự đăng ký, gọi trực tiếp PostgREST: `PATCH /rest/v1/profiles?id=eq.<uid>` body `{"role":"admin"}`.
2. `is_admin()` đọc `profiles.role` → true. Mọi policy `... OR is_admin()` mở ra.
3. Đổi luôn `plan='recruiter'`, `plan_expires_at=null`, `usage_count=0`, `quota_reset_day`.
4. `/api/admin/*` đọc `profiles.role` bằng service_role → pass gate → reach `delete-user`
   (xoá cứng account không phải admin khác).

**Đã tái lập local.** Container Postgres 16, `SET ROLE authenticated` với
`request.jwt.claims.sub` của attacker: write sang dòng người khác bị chặn (0 rows),
write lên dòng mình được nhận (`role=admin`, `plan=recruiter`), sau đó `is_admin()=t`
và đọc/sửa được dòng victim.

**Sửa (nhỏ nhất, đúng chỗ).**
- Trigger `BEFORE INSERT OR UPDATE` trên `public.profiles`: nếu `current_user` là
  `authenticated`/`anon` thì INSERT bị ép giá trị an toàn, UPDATE các cột
  `role, plan, plan_expires_at, plan_updated_at, usage_count, usage_month, quota_reset_day`
  → raise `42501`; `has_permission`/`monthly_analytics_limit` chỉ admin được đổi.
  Trigger dựa trên role thực thi nên RPC `SECURITY DEFINER` và backend `service_role`
  không bị ảnh hưởng.
- Thu hẹp quyền: `REVOKE UPDATE ON public.profiles FROM authenticated, anon;` rồi
  `GRANT UPDATE (display_name, photo_url, is_new, has_permission, monthly_analytics_limit, monthly_analytics_limit_custom)`.
- Defense in depth: admin API nên lấy quyền admin từ nguồn client không ghi được
  (`auth.users.raw_app_meta_data` hoặc bảng service-only), không từ `profiles.role`.
- Migration + test đầy đủ nằm trong `findings.json` (record
  `supabase/profiles-update-own-policy-privilege-columns`).

### P1-1 — Medium — Ghi chéo tenant vào kết quả phân tích ứng viên

**Nguyên nhân.** `api/recruiter/save-analysis.ts` chỉ xác thực bearer rồi đưa
`candidateId` từ body vào RPC `save_candidate_analysis` chạy bằng `service_role`.
Hàm update `candidate_cvs WHERE id = p_candidate_id`, không kiểm tra campaign owner.
RPC anh em `update_candidate_hr_status` (`20260601300000:194-237`) có kiểm tra
(`not_allowed`) — đó là pattern đúng.

**Đã tái lập local.** Victim row `82/done` → `100/done` với JSON của attacker; cùng
candidate đó, `update_candidate_hr_status` từ chối attacker bằng `not_allowed`.

**Điều kiện.** Chỉ cần account authenticated (free cũng được) + biết UUID candidate.
Source không lộ UUID cho người ngoài (RLS owner-only, download join owner), nên
likelihood **low**, impact **medium**.

**Sửa.** Thêm `p_user_id` vào `save_candidate_analysis`, join
`recruitment_campaigns.user_id`, raise `42501` nếu khác; truyền `user.id` từ cả hai
handler (Vercel + Express). **Lưu ý quan trọng:** khi tạo hàm mới phải
`REVOKE ... FROM PUBLIC, anon, authenticated` rồi `GRANT ... TO service_role` —
`REVOKE FROM PUBLIC` một mình không đủ trên Supabase (đúng như comment trong
`20260615030000`). Migration + test đã có trong `findings.json`.

### P2-1 — Low — Giả mạo bản ghi audit admin

**Nguyên nhân.** `admin_audit_log` grant INSERT cho `authenticated`, policy chỉ
`WITH CHECK (admin_id = auth.uid())`, `action` là text tự do, không trigger/CHECK.
Non-admin không đọc được bảng nhưng ghi được dòng giả (`delete_user`, `update_role`,
`target_user_id` tuỳ ý).

**Đã tái lập local.** `is_admin()=f`, `visible_audit_rows=0`, nhưng 2 insert giả được
nhận và hiện ra trong view của admin.

**Sửa.** Revoke INSERT khỏi `anon`/`authenticated`, giữ `service_role`; thêm CHECK
cho `action`; chuyển 3 chỗ log phía client (`src/services/userService.ts:213-228`)
sang RPC `log_admin_action` có `is_admin()` và ép `admin_id = auth.uid()`.

---

## 3. Bốn điểm cần xác minh (chưa phải lỗ hổng, chưa gán severity)

Mỗi mục có blocker chính xác + cách kiểm tra an toàn. Không gửi mail/spend cho bên thứ ba.

### NV-1 — Welcome email không cần đăng nhập, gửi tới địa chỉ tuỳ ý
`POST /api/send-email` với `type:"welcome"` không auth, không captcha, chỉ validate
định dạng email, rồi gửi bằng tài khoản Resend của chủ dự án tới `userEmail` do caller chọn.
Nhánh feedback cùng handler **có** reCAPTCHA → welcome là ngoại lệ. Limiter chỉ có ở Express.
- **Blocker:** `RESEND_API_KEY`/`RESEND_FROM_EMAIL` production, trạng thái verify domain, và
  có rule rate-limit ngoài repo (Cloudflare/Vercel WAF) hay không.
- **Kiểm tra:** gửi 1 mail tới **địa chỉ của chính bạn** từ client không cookie/token →
  xem Resend Activity (From/To/Delivered). Gửi 6 lần trong 10 phút để xem có 429.

### NV-2 — `/api/rewrite-cv` và `/api/parse-cv` không kiểm tra quota
Chỉ `handleAnalyze` gọi `check_analytics_quota` + `increment_usage_count`; 2 endpoint
còn lại xác thực rồi gọi Gemini. `analysis_log` chỉ là telemetry chi phí, không chặn.
- **Đính chính:** quota được định nghĩa là đếm **lượt analyze**, nên đây **không** phải
  "thêm lượt chấm điểm miễn phí" mà là **chi phí Gemini không được đo** trên 2 luồng enrichment.
- **Kiểm tra:** account free đã hết quota → `/api/analyze` trả 429; gửi 10 rewrite + 10 parse
  → xem billing dashboard tăng, `profiles.usage_count` không đổi.

### NV-3 — Bucket `cv-files` được tạo `public = true`
Migration tạo bucket với `public=true`, không migration nào đổi. Policy "chỉ đọc folder của mình"
chỉ áp cho `storage.objects`, không áp cho endpoint `/object/public/...`.
- **Kiểm tra:** `select id, public from storage.buckets where id='cv-files';` — nếu `false`
  thì loại bỏ hẳn mục này. Nếu `true`, GET URL public của **object của chính bạn**, không cookie.
- **Sửa nếu đúng:** `UPDATE storage.buckets SET public=false WHERE id='cv-files';`
  (đường tải qua signed URL vẫn chạy).

### NV-4 — Khoá tài khoản (`has_permission=false`) chỉ chặn ở UI
Không handler/RPC/RLS nào đọc cờ này; `has_permission` chỉ được đọc trong `AppContent.tsx`.
User bị khoá vẫn dùng API bình thường.
- **Kiểm tra:** tạo account test B, khoá B, dùng token B gọi `POST /api/analyze` (payload nhỏ)
  → 200 nghĩa là chưa enforce; 403 nghĩa là đã enforce.

---

## 4. Hardening backlog (không phải lỗ hổng, nên làm sau)

1. **Rate limit trên Vercel**: hiện chỉ Express có limiter; bề mặt production không có.
2. **reCAPTCHA**: `verifyRecaptcha` auto-pass khi `NODE_ENV !== 'production'`; chưa kiểm
   hostname/action của token.
3. **PayOS webhook**: HMAC chỉ phủ `data`, còn `code`/`success` (dùng để quyết định "đã thanh toán")
   không được ký; so sánh chữ ký không constant-time; không so `data.amount` với `payments.amount`.
   `/api/payment/create` không dedupe/expire đơn pending.
4. **Retention lịch sử**: UI hứa "xoá sau 7 ngày" cho free (`src/translations/history.ts:128-129`,
   `docs/8_analytics.md:168`) nhưng không có job/cron/predicate nào xoá; `history` giữ
   `full_rewritten_cv` + `parsed_cv`.
5. **Plan caps client-side**: `MAX_SAVED_*`, `MAX_CAMPAIGNS`, quyền recruiter chỉ chặn ở React;
   policy INSERT chỉ kiểm tra owner → gọi PostgREST trực tiếp vượt được. Riêng đường R2 publish
   có enforce.
6. **Upload trực tiếp vào Storage**: `cv-files`/`cv-analyze-tmp` cho phép client INSERT theo owner
   nhưng không có giới hạn số object/dung lượng theo user; object upload trực tiếp (không qua
   `/api/storage`) không có row registry nên `runStorageCleanup` không bao giờ quét → tích luỹ
   không giới hạn (15 MB temp / 50 MB saved).
7. **Batch entitlement**: `batchTotal` do client khai; lookup plan fail-open khi timeout/lỗi
   (`_server-lib/analyze/handler.ts:128-160`).
8. **Lỗi trả chi tiết upstream** cho client (`detail: rpcError.message`, message của unpdf).
9. **Sentry scrub** chỉ ở top-level; `cvData`/`jd` lồng nhau không bị che.
   `SUGGESTION_GUARD_DEBUG=1` log nội dung suggestion.
10. **Edge Functions**: `extract-pdf` không auth/size cap, `verify-recaptcha` trả raw JSON,
    cả hai `CORS *`; không có `supabase/config.toml` nên trạng thái deploy không rõ.
11. **Schema production không tái tạo được từ source**: `20260613000000_remote_applied.sql`
    và `20260613010000_remote_applied.sql` là stub ghi DDL đã chạy tay trên dashboard.
12. **Thiếu CORS allowlist + body limit 50 MB trên Vercel** (chỉ có ở Express).

---

## 5. Cách tái lập local (không cần network, không cần credential)

Harness nằm trong run dir: `harness/{profiles-rls,candidate-write,audit-log-forge}.sql`.

```bash
docker run -i --rm --network none -m 512m --cpus 0.5 --pids-limit 128 \
  --user 999:999 --tmpfs /tmp:rw,size=256m,mode=1777 -e PGDATA=/tmp/pg \
  -v "$HOME/security-audit-skill/cv-compare-tn/run-1/harness/profiles-rls.sql:/h.sql:ro" \
  postgres:16 sh -c 'initdb -D /tmp/pg -U postgres >/dev/null 2>&1;
    pg_ctl -D /tmp/pg -o "-c listen_addresses= -c unix_socket_directories=/tmp/pg -c fsync=off" -l /tmp/pg/pg.log start >/dev/null 2>&1;
    sleep 1; psql -h /tmp/pg -U postgres -X -q -f /h.sql'
```

Kết quả mong đợi (đã lưu transcript): xem `REPORT.md` mục 4 và
`agents/verifier-profiles/artifacts/profiles-rls-transcript.txt`.

---

## 6. Giới hạn của audit này

- **Không phải clean-coverage claim.** Wave 1 dự kiến 5 hunter độc lập nhưng cả 5 vượt thời
  gian và bị dừng; parent tự hoàn tất 18 unit bằng review trực tiếp. Coverage đủ ở mức unit
  nhưng mất tính độc lập giữa các reviewer cho phần đó.
- **4 kết luận phụ thuộc deployment fact** (mục 3) — không kết luận thay chủ hệ thống.
- Mọi kết luận authorization giả định schema deployed khớp migrations tracked; 2 migration
  stub ghi DDL chạy tay nên không chứng minh được từ repo.
- Riêng P0-1 dựa trên Supabase default table grant cho `authenticated` — không được viết
  trong migration nào nhưng được chứng minh gián tiếp bằng chính code client đang
  insert/update `profiles` bằng anon key.
- Ngoài phạm vi: memory safety native (không có native code), broker/messaging (không có),
  IPC desktop/mobile (không có), supply-chain release/signing (lockfile pinned, không có
  pipeline publish), `node_modules`, `dist`, git history.

---

## 7. Tham chiếu

- Báo cáo đầy đủ (EN): `~/security-audit-skill/cv-compare-tn/run-1/REPORT.md`
- Chi tiết 2 lỗi High/Medium + bản sửa: `.../FINDINGS-DETAIL.md`
- 4 lead + blocker + validation plan: `.../NEEDS-VALIDATION.md`
- Máy đọc: `.../findings.json`, `.../coverage-ledger.json` (34 unit: 25 covered, 9 candidate)
- 3 transcript bằng chứng trong `.../agents/*/artifacts/`
