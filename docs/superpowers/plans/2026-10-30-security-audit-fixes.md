# Security Audit Fixes (2026-10-30) Implementation Plan

> **Trạng thái 2026-10-31: HOÀN TẤT toàn bộ backlog security audit.** P0-1/P1-1/P2-1/NV-1–NV-4 đóng qua PR #22–#35; dependency, §4.1, §4.5b, §4.6, §4.7, §4.10, §4.11, §4.12 đóng qua PR #37–#43 và deploy production. Bảng tổng hợp + bằng chứng: `docs/audits/security-audit-2026-10-30.md` mục "Plan tiếp theo"; migration/trạng thái drift: `docs/7_deployment.md`.
> **Trạng thái 2026-10-30:** HOÀN TẤT. Task 1–4 merge trong PR #22 (+ #23 drop v1), migration áp prod, verify end-to-end trên prod. Owner checklist đã chạy (1 admin, không plan trả phí lạ). NV-2/3/4 xử lý ở PR #25, #26, #28. Trạng thái chi tiết + việc còn mở: `docs/audits/security-audit-2026-10-30.md` mục "Trạng thái xử lý".


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đóng P0-1 (tự phong admin), P1-1 (ghi chéo tenant candidate), P2-1 (giả mạo audit log), NV-1 (welcome email relay); đưa NV-2/3/4 thành checklist xác minh cho chủ hệ thống.

**Architecture:** Sửa ở tầng DB là chính: trigger + column grant trên `profiles`, ownership check trong RPC `save_candidate_analysis`, RPC `log_admin_action` thay cho INSERT trực tiếp. API chỉ đổi tham số truyền vào RPC và map lỗi. Không thêm serverless function.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Vercel handlers + Express routes, Vitest.

**Spec:** [docs/audits/security-audit-2026-10-30.md](../../audits/security-audit-2026-10-30.md). Migration/test mẫu của audit: `~/security-audit-skill/cv-compare-tn/run-1/findings.json` (records có `remediation`) và `harness/*.sql`. **Mẫu đó viết trên `af518c7` — rebase vào schema hiện tại, không copy nguyên.**

## Global Constraints

- Branch mới từ `main`: `fix/security-audit-2026-10-30`. Không đụng file dirty không liên quan trong worktree hiện tại.
- Migration mới đặt tên sau `20261031000000` → dùng `20261101xxxxxx_*.sql`.
- Không tạo file mới trong `api/` (Vercel Hobby giới hạn function, xem AGENTS.md §6).
- Hàm `SECURITY DEFINER` mới: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` rồi GRANT đúng role. `REVOKE FROM PUBLIC` một mình không đủ trên Supabase.
- SQL test theo style `supabase/tests/r2_storage.test.sql`: `BEGIN; DO $$ ... ASSERT ... $$; ROLLBACK;`, fixture inline. Kiểm tra `auth.uid()` đọc claim nào (`request.jwt.claims` JSON hay `request.jwt.claim.sub`) và set cả hai trong test để chắc chắn.
- Mã lỗi: quyền → `42501`, không tìm thấy → `P0002`.
- Không trả `rpcError.message` ra client ở các handler được sửa.
- Xong mỗi task code: `npm run lint`, `npm test`; cuối cùng `npm run build`.

## Review Focus

1. **Signup vẫn chạy với client cũ** đang deploy: `createUserProfile` vẫn gửi `role:'user'`, `has_permission`, `usage_count`, ... → INSERT phải được nhận (ép giá trị), không bị lỗi permission. Test: insert đúng shape client hiện tại thành công.
2. **Xoá-rồi-tạo-lại profile để reset quota**: policy `profiles_delete_own_or_admin` cho user tự xoá dòng mình; sau khi INSERT ép `usage_count=0` thì đây là đường reset quota. Không có code client nào xoá profile (xoá user đi qua `/api/admin` service_role). Test: user tự DELETE bị từ chối.
3. **Admin thao tác qua client vẫn chạy**: `updateUserPermission`, `updateUserMonthlyAnalyticsLimit`, `resetUserToGlobalAnalyticsLimit`, `markUserAsRead` (AdminView) cập nhật dòng người khác bằng anon key. Test: admin update `has_permission`/limit/`is_new` của user khác thành công.
4. **Đường SECURITY DEFINER + service_role không bị trigger chặn**: `increment_usage_count`, `check_analytics_quota` (reset usage), payment webhook ghi `plan`, `/api/admin/set-user-role`. Test: gọi 2 RPC trong test với `current_user` = owner thành công; update `plan` dưới `SET ROLE service_role` thành công.
5. **Deploy window P1-1**: app cũ gọi bản 4 tham số. Bỏ hàm cũ trước khi deploy app → recruiter save hỏng, candidate kẹt trạng thái. Giải quyết bằng 2 migration (Task 2).

---

### Task 1: P0-1 — Khoá cột quyền lực trên `profiles`

**Files:**
- Create: `supabase/migrations/20261101000000_profiles_lock_privileged_columns.sql`
- Create: `supabase/tests/profiles_authority.test.sql`

**Interfaces:**
- Produces: function `public.profiles_guard_privileged_columns() RETURNS trigger` (SECURITY INVOKER), trigger `profiles_guard_privileged_columns` `BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW`.

Chỉ chạy logic khi `current_user IN ('authenticated','anon')` — RPC SECURITY DEFINER (owner) và `service_role` đi thẳng.

- [ ] **Step 1: Viết test `supabase/tests/profiles_authority.test.sql`** — fixture: `auth.users` + profiles cho `attacker` (user), `victim` (user, `has_permission=false`), `admin` (role admin). Assertions (mỗi case dưới `SET LOCAL ROLE authenticated` + claim sub tương ứng, lỗi bắt bằng `EXCEPTION WHEN insufficient_privilege`):
  - attacker `UPDATE ... SET role='admin' WHERE id=attacker` → 42501.
  - attacker set `plan='recruiter'`, `plan_expires_at=null`, `usage_count=0`, `usage_month`, `quota_reset_day` → mỗi cái 42501.
  - victim tự `SET has_permission=true` → 42501; tự set `monthly_analytics_limit=9999` / `monthly_analytics_limit_custom=true` → 42501.
  - attacker update `display_name`, `photo_url`, `is_new` của chính mình → OK.
  - attacker `DELETE` dòng của mình → 0 rows / bị từ chối, dòng vẫn còn.
  - user mới INSERT đúng shape `createUserProfile` nhưng `role='admin', has_permission=true, usage_count=0, monthly_analytics_limit_custom=true, plan='recruiter', quota_reset_day=1, usage_month='2020-01-01'` → nhận; đọc lại: `role='user'`, `plan='free'`, `plan_expires_at IS NULL`, `usage_count=0`, `has_permission=true`, `monthly_analytics_limit_custom=false`, `quota_reset_day = LEAST(day ICT hôm nay, 28)`, `usage_month = current_quota_cycle(quota_reset_day)`.
  - admin update `has_permission`, `monthly_analytics_limit`, `monthly_analytics_limit_custom`, `is_new` của victim → OK.
  - admin update `role`/`plan` của victim qua client → 42501 (đường đúng là `/api/admin`).
  - `RESET ROLE`; `SELECT public.increment_usage_count(attacker)` và `public.check_analytics_quota(...)` (đúng chữ ký hiện tại) → chạy, `usage_count` tăng.
  - `SET LOCAL ROLE service_role; UPDATE ... SET plan='pro'` → OK.

- [ ] **Step 2: Chạy test trên DB disposable trước migration** — dùng lệnh docker ở spec §5, mount migrations + test (harness `profiles-rls.sql` có sẵn stub `auth`/roles — tái dùng phần setup của nó). Expected: FAIL ở assertion self-promote. Đồng thời chạy `harness/profiles-rls.sql` → exploit thành công (baseline).

- [ ] **Step 3: Viết migration**
  - Trigger INSERT (current_user authenticated/anon): ép `role:='user'`, `plan:='free'`, `plan_expires_at:=NULL`, `plan_updated_at:=NULL`, `usage_count:=0`, `has_permission:=true`, `monthly_analytics_limit_custom:=false`, `quota_reset_day:=LEAST(EXTRACT(DAY FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int, 28)`, `usage_month:=public.current_quota_cycle(NEW.quota_reset_day)` — khớp `vnSignupQuotaCycle` (`src/lib/vnTime.ts:21`).
  - Trigger UPDATE: `role, plan, plan_expires_at, plan_updated_at, usage_count, usage_month, quota_reset_day` `IS DISTINCT FROM OLD` → `RAISE ... USING ERRCODE='42501'` (cả admin). `has_permission, monthly_analytics_limit, monthly_analytics_limit_custom` đổi mà `NOT public.is_admin()` → 42501.
  - `REVOKE UPDATE, DELETE ON public.profiles FROM authenticated, anon;` rồi `GRANT UPDATE (display_name, photo_url, is_new, has_permission, monthly_analytics_limit, monthly_analytics_limit_custom) ON public.profiles TO authenticated;`. Trước khi viết: query `information_schema.columns` trên production cho `profiles` — nếu có cột client cần ghi mà migration không biết (2 stub `remote_applied`), thêm vào GRANT.
  - `DROP POLICY "profiles_delete_own_or_admin"` (không thay thế — xoá user đi qua service_role).
  - Grep migrations sau file này không có `GRANT ALL ... ON ALL TABLES IN SCHEMA public` mở lại (đã kiểm tra tới `20261031`: không có).

- [ ] **Step 4: Chạy lại test + `harness/profiles-rls.sql`** — Expected: test PASS hết; harness: self-promote bị 42501, `is_admin()=f`.

- [ ] **Step 5: Commit** — `fix(db): lock privileged profiles columns against self-escalation`

---

### Task 2: P1-1 — Ownership check cho `save_candidate_analysis`

**Files:**
- Create: `supabase/migrations/20261101010000_save_candidate_analysis_owner.sql`
- Create: `supabase/migrations/20261101020000_drop_save_candidate_analysis_v1.sql` (**apply sau khi app mới deploy**) — **đã hoãn sang PR follow-up, xem `docs/7_deployment.md` "Thứ tự deploy"**
- Create: `supabase/tests/save_candidate_analysis_ownership.test.sql`
- Modify: `api/recruiter/save-analysis.ts:39-52`, `server/routes/recruiter.ts:27-37`
- Test: `api/__tests__/recruiter-save-analysis.test.ts` (theo style `api/__tests__/admin.test.ts`)

**Interfaces:**
- Produces: `public.save_candidate_analysis(p_user_id uuid, p_candidate_id uuid, p_analysis_result jsonb, p_match_score integer, p_status text DEFAULT 'done') RETURNS void`, SECURITY DEFINER, EXECUTE chỉ `service_role`.

- [ ] **Step 1: Viết SQL test** — fixture: owner + attacker, campaign của owner, candidate `82/done`.
  - Gọi với `p_user_id=attacker` → 42501; candidate vẫn `82/done`.
  - Candidate id không tồn tại → P0002.
  - Gọi với `p_user_id=owner` → `match_score=100`, `score_version`/`probability_version` lấy từ JSON, counter campaign đồng bộ.
  - `has_function_privilege('authenticated', 'public.save_candidate_analysis(uuid,uuid,jsonb,integer,text)', 'EXECUTE') = false`; tương tự `anon`.
- [ ] **Step 2: Chạy test** — Expected: FAIL (hàm 5 tham số chưa có).
- [ ] **Step 3: Migration 1** — copy body **từ `20261031000000_probability_version.sql:28-70`** (không lấy bản audit), thêm trước UPDATE: lấy `campaign_id` của candidate (`NOT FOUND` → P0002), rồi `NOT EXISTS (recruitment_campaigns WHERE id=v_campaign_id AND user_id=p_user_id)` → `not_allowed` 42501 (pattern `update_candidate_hr_status`, nhưng dùng `p_user_id` vì `auth.uid()` NULL dưới service_role). Grants như Global Constraints. Header ghi DEPLOY ORDER: migration 1 → deploy app → migration 2. **Giữ nguyên bản 4 tham số** trong migration này.
- [ ] **Step 4: Migration 2** — `DROP FUNCTION public.save_candidate_analysis(uuid, jsonb, integer, text);` Cập nhật COMMENT của `sync_campaign_counters` nếu cần.
- [ ] **Step 5: Vitest handler** — mock `getUserFromBearerToken` → `{id:'u1'}`, mock `getSupabaseAdmin().rpc`:
  - assert `rpc` gọi với `('save_candidate_analysis', expect.objectContaining({ p_user_id: 'u1', p_candidate_id: 'c1' }))`.
  - rpc trả `{ error: { code: '42501' } }` → status 403, body không có `detail`.
  - rpc trả `{ error: { code: 'P0002' } }` → 404.
- [ ] **Step 6: Sửa 2 handler** — truyền `p_user_id: user.id`; map `42501`→403, `P0002`→404, còn lại 500 `{ error: 'Không lưu được kết quả phân tích' }` không `detail`. Express route làm y hệt.
- [ ] **Step 7: Chạy SQL test + `harness/candidate-write.sql` + `npm test`** — Expected: PASS; harness ghi chéo bị chặn.
- [ ] **Step 8: Commit** — `fix(recruiter): enforce campaign ownership in save_candidate_analysis`

---

### Task 3: P2-1 — Chặn giả mạo `admin_audit_log`

**Files:**
- Create: `supabase/migrations/20261101030000_admin_audit_log_rpc.sql`
- Create: `supabase/tests/admin_audit_log.test.sql`
- Modify: `src/services/userService.ts:213-230` (`logAdminAction`)

**Interfaces:**
- Produces: `public.log_admin_action(p_action text, p_target_user_id uuid, p_details jsonb DEFAULT NULL) RETURNS void`, SECURITY DEFINER, EXECUTE cho `authenticated` (revoke PUBLIC, anon).

- [ ] **Step 0 (owner, trước khi viết CHECK):** chạy trên production `SELECT action, count(*) FROM public.admin_audit_log GROUP BY 1;`. Nếu có giá trị ngoài 6 action dưới → đó có thể là dòng giả: ghi lại, quyết định xoá hay thêm `NOT VALID`.
- [ ] **Step 1: SQL test**
  - non-admin `INSERT INTO admin_audit_log` trực tiếp → 42501.
  - non-admin `SELECT public.log_admin_action('update_permission', victim)` → 42501.
  - admin gọi RPC → 1 dòng, `admin_id = admin` (không nhận admin_id từ caller).
  - action `'foo'` → `check_violation`.
  - `service_role` INSERT trực tiếp (`_server-lib/admin/audit.ts`) → OK.
- [ ] **Step 2: Chạy test** — Expected: FAIL.
- [ ] **Step 3: Migration** — `REVOKE INSERT ON public.admin_audit_log FROM authenticated, anon;` `DROP POLICY "self_insert_audit_log"`; `ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN ('update_role','update_plan','delete_user','update_permission','update_analytics_limit','reset_analytics_limit'))`; tạo `log_admin_action` (gate `is_admin()` → 42501, insert `admin_id := auth.uid()`).
- [ ] **Step 4: Client** — `logAdminAction` gọi `supabase.rpc('log_admin_action', { p_action: action, p_target_user_id: targetUserId, p_details: details ?? null })`; bỏ `getUser()`. Giữ try/catch non-critical.
- [ ] **Step 5: Chạy SQL test + `harness/audit-log-forge.sql` + `npm test`** — Expected: PASS; forge bị từ chối.
- [ ] **Step 6: Commit** — `fix(audit): route client admin audit writes through is_admin RPC`

---

### Task 4: NV-1 — Welcome email chỉ gửi tới email của token

Làm luôn, không cần chờ xác minh Resend: fix nhỏ, đóng open relay bất kể cấu hình production.

**Files:**
- Modify: `_server-lib/email/handlers.ts:122` (`handleSendWelcomeEmail`), `api/send-email.ts`, route Express gọi `handleSendWelcomeEmail` (grep), `src/services/userService.ts:174-182`
- Test: `_server-lib/email/__tests__/welcome.test.ts`

**Interfaces:**
- Produces: `handleSendWelcomeEmail(body: unknown, authHeader: string | undefined): Promise<HandlerResult>`.

- [ ] **Step 1: Test** — mock `getUserFromBearerToken` + `Resend`:
  - không header → 401, Resend không được gọi.
  - token của `a@x.com`, body `userEmail: 'victim@y.com'` → Resend gọi với `to: ['a@x.com']`.
- [ ] **Step 2: Chạy test** — Expected: FAIL.
- [ ] **Step 3: Sửa handler** — lấy user từ token (401 nếu null), gửi tới `user.email`, bỏ `userEmail` khỏi validate. Hai entry point truyền `req.headers.authorization`. Client thêm `Authorization: Bearer <session.access_token>` vào fetch welcome.
- [ ] **Step 4: `npm test`, `npm run lint`** — PASS.
- [ ] **Step 5: Commit** — `fix(email): send welcome email only to authenticated user`

---

## Owner checklist (sau deploy — không phải code)

Làm ngay sau khi Task 1 lên production. Lỗ đã mở từ lâu, fix không gỡ được leo quyền đã xảy ra:

- [ ] `SELECT id, email, role, created_at FROM profiles WHERE role='admin';` — mọi admin phải là người bạn biết.
- [ ] `SELECT p.id, p.email, p.plan, p.plan_expires_at FROM profiles p WHERE p.plan <> 'free' AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.user_id = p.id AND x.status = 'paid');` (chỉnh tên cột theo bảng `payments` thật) — plan trả phí không có giao dịch = đáng ngờ.
- [ ] `SELECT id, email, monthly_analytics_limit FROM profiles WHERE monthly_analytics_limit_custom AND id NOT IN (SELECT target_user_id FROM admin_audit_log WHERE action='update_analytics_limit');`
- [ ] `has_permission=false` rows từng bị bật lại: đối chiếu `admin_audit_log` action `update_permission`.

Xác minh NV (quyết định sau khi có kết quả):

- [ ] **NV-3:** `select id, public from storage.buckets where id='cv-files';`. Nếu `true`: đếm `SELECT count(*) FROM history WHERE cv_url LIKE '%/object/public/%' OR jd_url LIKE '%/object/public/%';` (và `saved_cvs` tương ứng). 0 → migration `UPDATE storage.buckets SET public=false WHERE id='cv-files'` + sửa seed `20260516120000:221-239` không còn ép `public=EXCLUDED.public`. >0 → cần đường đọc signed URL cho link cũ trước khi flip.
- [ ] **NV-4:** chỉ có ý nghĩa sau Task 1. Khoá account test, gọi `POST /api/analyze` bằng token đó. 200 → thêm check `has_permission` trong `handleAnalyze` (đã đọc `profiles` ở `_server-lib/analyze/handler.ts:137`), `handleRewriteCv`, `handleParseCv` — không đặt trong `getUserFromBearerToken` (payment dùng chung).
- [ ] **NV-2:** quyết định sản phẩm/chi phí — rewrite/parse có tính quota hay chỉ rate limit? Chưa làm cho tới khi bạn chọn.

## Deferred (hardening backlog §4, không trong plan này)

Rate limit trên Vercel; reCAPTCHA hostname/action; PayOS webhook ký `code`/amount + constant-time; job retention 7 ngày; plan caps server-side; giới hạn upload trực tiếp Storage; batch entitlement fail-open; `detail` lỗi upstream ở handler khác; Sentry scrub lồng nhau; Edge Functions auth/CORS; schema stub `remote_applied`; CORS/body limit Vercel. Admin-từ-`app_metadata` (P0-1 defense in depth) bỏ — sau Task 1 `role` không còn client ghi được.
