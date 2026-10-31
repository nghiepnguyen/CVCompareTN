# Cloudflare R2: triển khai và vận hành

## Trạng thái

Code hỗ trợ R2 cho file tạm, kho CV và recruiter; mặc định tiếp tục upload lên Supabase. Chỉ bật từng luồng sau khi nghiệm thu staging. Supabase vẫn quản lý Auth, metadata và phân quyền. Chưa migrate dữ liệu cũ, chưa bật R2 production.

Final Plan: [2026-10-17-cloudflare-r2-integration-revised.md](superpowers/plans/2026-10-17-cloudflare-r2-integration-revised.md).

## Kiến trúc và đường dẫn

- `POST /api/storage`: action `upload`, `finalize`, `download`, `delete`, `delete-temp`.
- `GET /api/storage?action=cleanup`: chỉ scheduler có Bearer secret riêng.
- Vercel dùng chung function `api/extract-pdf.ts` cho storage và PDF qua rewrite `resource=storage`; giữ `POST /api/extract-pdf` tương thích. Tổng vẫn 9 handler. Express dùng `server/routes/storage.ts`.
- `storage_uploads` là registry chỉ backend truy cập. PUT URL 5 phút chỉ ghi `staging/{uid}/{uploadId}`. Finalize claim lease 2 phút, dùng final key riêng cho từng lease, copy rồi kiểm tra nội dung trước khi publish metadata trong transaction.
- `saved_cvs`/`candidate_cvs` giữ `file_path`, thêm `storage_provider` và `storage_status`. Đọc file qua metadata và owner/campaign, không tin provider client. File tạm R2 dùng reference `r2:{uploadId}`; path cũ tiếp tục đọc Supabase.
- URL tải 2 phút, không lưu trong DB. API storage trả `Cache-Control: private, no-store`. Bucket R2 phải private, không bật `r2.dev` hoặc public custom domain.
- Dung lượng: file tạm 15MiB, file lâu dài 50MiB (khớp bucket cũ); file ≤2MiB vẫn inline như trước. PDF có text >15MiB vẫn gửi text, không upload bản gốc.
- PDF được parse bằng unpdf (tối đa 500 trang cho upload R2), DOCX bằng mammoth sau giới hạn ZIP; ảnh được sharp kiểm tra/đọc với giới hạn 40 triệu pixel, không nhận ảnh nhiều trang. `.doc` cũ chỉ kiểm tra chữ ký OLE, không có parser Word binary đầy đủ; nên chuyển DOCX/PDF nếu cần trích xuất chính xác.
- Xoá CV/ứng viên chuyển metadata sang `delete_pending`, ghi job cùng transaction rồi thử xoá object; nếu lỗi, scheduler hoàn tất và xoá metadata. Danh sách ẩn record đang chờ xoá. Cleanup trước khi xoá metadata được ghi bằng trigger, bao gồm cascade campaign/user. Queue không FK cascade. Khi xoá user, chặn upload mới và thêm quét prefix trễ 20 phút để bắt PUT muộn. Xoá lặp an toàn; retry backoff tối đa 1 giờ, ghi log job ID/attempts, không log signed URL/file content. Registry đã xoá và tombstone user giữ 7 ngày; job chưa xong vẫn giữ để retry.

## Thứ tự triển khai

1. Giữ `STORAGE_WRITE_PROVIDER=supabase`; đọc diff, chạy kiểm tra bên dưới.
2. Áp dụng migration `supabase/migrations/20261018023549_cloudflare_r2_storage.sql` theo quy trình database của dự án trước khi deploy code mới. Migration additive, dữ liệu cũ mặc định provider Supabase/ready; policy mutation `cv-files` được giới hạn theo folder owner. Không rollback bằng cách drop metadata đang chứa reference R2.
3. Deploy code vẫn tắt R2. Xác minh tải CV/recruiter cũ và endpoint PDF. Sau khi code mới hoạt động, chuyển `cv-files` sang private trên Dashboard (hoặc `UPDATE storage.buckets SET public=false WHERE id='cv-files'` qua quy trình quản trị DB). Không tắt public trước khi thay code recruiter dùng public URL. SELECT policy owner phải được đối chiếu thực tế.
4. Tạo hai bucket R2 private; khai báo secrets phía server theo `.env.example`. Không dùng tiền tố `VITE_` cho secrets. Credentials chỉ giới hạn hai bucket cần thiết.
5. Cấu hình CORS/lifecycle bên dưới; áp dụng migration pg_cron, tạo secret Vault và xác nhận `net._http_response` có `status_code=200` liên tục qua nhiều mốc 15 phút.
6. Bật `STORAGE_WRITE_PROVIDER=r2`, `STORAGE_R2_PURPOSES=temp` trên staging. Kiểm tra PDF text/scan, ảnh, background parse/rewrite, đóng tab, lỗi phân tích và cleanup. Đo baseline/canary và chốt ngưỡng trước mở rộng.
7. Sau nghiệm thu, bật `STORAGE_R2_PURPOSES=temp,saved,candidate`. Kiểm tra lưu/tải/xoá CV, ứng viên, campaign, user và retry; dữ liệu Supabase cũ phải tiếp tục mở được.
8. Chỉ copy file cũ bằng script sau khi R2 ổn định. Giữ nguồn qua cửa sổ rollback được chốt. Không tự xoá nguồn production trong script.

Code mới cần migration kể cả khi R2 còn tắt: tải file private và cleanup dùng các cột/bảng mới.

## CORS và lifecycle

CORS đã áp dụng cho cả hai bucket; preview/staging khác phải được thêm bằng origin cụ thể khi cần:

```json
[
  {
    "AllowedOrigins": ["https://cvfit.pro", "https://www.cvfit.pro", "http://localhost:3000", "http://localhost:5173"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

CSP frontend đã cho phép kết nối `https://*.r2.cloudflarestorage.com`. CORS không thay thế authorization.

Lifecycle bắt buộc:

- Cả hai bucket: xoá prefix `staging/` sau 1 ngày.
- Bucket temp: xoá cả object final sau 1 ngày; không đặt rule này trên toàn bucket lâu dài.
- Lifecycle xử lý bất đồng bộ, không bảo đảm xoá đúng phút hết hạn. Application cleanup thực hiện trước, lifecycle là dự phòng.

## Giới hạn upload trực tiếp (2026-10)

Trước đây client upload thẳng vào Supabase Storage (bucket `cv-files` / `cv-analyze-tmp`) chỉ bị giới hạn dung lượng từng file và folder owner; số object mỗi user tăng không giới hạn và object tải trực tiếp không có row registry nên scheduler không quét. Từ migration `20261101120000`:

- Trigger `storage_quota` trên `storage.objects` (chỉ role `authenticated`/`anon`, service_role và SECURITY DEFINER đi thẳng) đếm theo path:
  - saved CV `${uid}/${cvId}/${file}` hoặc `${uid}/${file}`: `MAX_SAVED_CV_BY_PLAN` (1/10/50).
  - candidate `${uid}/campaigns/${campaignId}/${file}`: 50/campaign, 500/user, chỉ recruiter/admin.
  - temp `${uid}/${file}` trong `cv-analyze-tmp`: 6/12/60 theo plan.
  - Path khác bị từ chối (`Invalid storage path`) để không mở được folder không đếm.
- File quá giới hạn nhận lỗi `42501` (`Saved CV file limit reached`, `Temp upload limit reached`, …); tổng dung lượng bị chặn gián tiếp qua số object × `file_size_limit` của bucket.
- `runStorageCleanup` gọi RPC service-only `list_expired_temp_objects` và xoá object `cv-analyze-tmp` cũ hơn 24 giờ, nên object temp bị bỏ quên không chiếm slot vĩnh viễn. Lỗi sweep chỉ log, không làm fail toàn bộ cleanup.
- SQL test: `supabase/tests/storage_upload_quota.test.sql`.

## Scheduler

### Chính: Supabase pg_cron + pg_net

GitHub Actions `schedule` không bảo đảm chạy: sau khi đổi lịch ngày 2026-10-18 chỉ khoảng 3/43 mốc thực sự chạy (cách nhau khoảng 2,5 giờ). Vercel Hobby chỉ cho cron mỗi ngày một lần. Vì vậy dùng `pg_cron` trong Supabase làm scheduler chính và giữ workflow GitHub làm dự phòng. Hai scheduler chạy chồng nhau vẫn an toàn: job xoá có lease; bước quét upload hết hạn idempotent (upsert job bỏ trùng, cập nhật trạng thái có điều kiện); xoá object không tồn tại coi như đã xoá.

Migration `supabase/migrations/20261018230000_storage_cleanup_pg_cron.sql`:

- Bật `pg_cron` và `pg_net` (schema `extensions`).
- Tạo `storage_internal.invoke_storage_cleanup()`: đọc URL và secret từ Vault, gọi `net.http_get` với header Bearer và timeout 60 giây (mặc định của pg_net là 5 giây, quá ngắn so với budget endpoint). Thu hồi quyền execute của `anon`/`authenticated`/`service_role`.
- Lên lịch job `storage-cleanup` `*/15 * * * *` (UTC). `cron.schedule` upsert theo tên nên chạy lại không tạo job trùng.
- Chưa có secret Vault thì hàm trả `NULL`, không gọi HTTP. Nhờ vậy migration áp dụng an toàn trước khi cấu hình.

Áp dụng riêng file này như migration R2 trước (repo còn migration quota `20260912000000` chưa áp dụng, đừng dùng `db push`):

```sh
supabase db query --linked --file supabase/migrations/20261018230000_storage_cleanup_pg_cron.sql
supabase migration repair 20261018230000 --status applied --linked
```

Tạo 2 secret trong Dashboard, mục Vault, nút "Add new secret": name `storage_cleanup_url` với value là `https://cv-compare-tn.vercel.app/api/storage?action=cleanup`, và name `storage_cleanup_secret` với value là `STORAGE_CLEANUP_SECRET` production. Không đưa giá trị secret vào Git, file migration, lịch sử shell hay SQL Editor (SQL Editor lưu lịch sử và snippet). Nếu bắt buộc dùng SQL `vault.create_secret(...)` thì phải xoá snippet hoặc lịch sử ngay sau đó.

Đổi secret bằng `vault.update_secret(id, new_secret)`. Kiểm tra chỉ đọc bằng [storage_cleanup_cron_verify.sql](../supabase/tests/storage_cleanup_cron_verify.sql): job active, đủ 2 secret, 5 lượt chạy gần nhất ở `cron.job_run_details` và mã HTTP ở `net._http_response` (pg_net giữ khoảng 6 giờ). `job_run_details` `succeeded` chỉ có nghĩa là request đã vào queue; phải xem `status_code=200` mới chắc endpoint chạy được. Tắt tạm: `SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='storage-cleanup'), active := false);`.

Request trong queue của pg_net chứa header secret cho đến khi được gửi đi. Queue này chỉ role quản trị database đọc được, cùng mức tin cậy với Vault.

Kiểm chứng local (2026-10-19): Postgres 16 với stub cho pg_cron/pg_net/Vault. Không có secret thì không gọi HTTP; có secret thì gọi đúng URL, header Bearer và timeout 60000; `authenticated` bị từ chối execute; áp dụng hai lần vẫn chỉ có một job. Trên Supabase thật (chỉ đọc): role `postgres` có quyền SELECT `vault.decrypted_secrets`. Quyền `net`/`cron` chưa kiểm được vì hai extension chưa bật; chưa test với extension thật.

### Dự phòng: GitHub Actions

Workflow `.github/workflows/storage-cleanup.yml` chạy mỗi 15 phút hoặc `workflow_dispatch` và chỉ hoạt động khi repository variable `STORAGE_CLEANUP_ENABLED=true`. Lịch thực tế không đều; dùng để chạy thủ công và làm lớp dự phòng.

Thiết lập GitHub repository:

- Variable `STORAGE_CLEANUP_URL=https://cv-compare-tn.vercel.app/api/storage?action=cleanup`. Dùng alias production ổn định này để request từ GitHub runner không gặp browser challenge của Cloudflare trên `cvfit.pro`; endpoint vẫn bắt buộc Bearer secret.
- Secret `STORAGE_CLEANUP_SECRET`: cùng giá trị server, tối thiểu 32 ký tự ngẫu nhiên.
- Variable `STORAGE_CLEANUP_ENABLED=true` sau khi endpoint đã deploy và migration đã áp dụng.

Workflow chỉ được kích hoạt sau khi merge/push; file local không tạo lịch chạy thực tế. Không bật R2 nếu lần chạy thử scheduler chưa thành công. Theo dõi job tồn lâu, `attempts` tăng và log `Storage cleanup retry required`. Cleanup endpoint làm việc theo batch với budget khoảng 20 giây; mỗi network request có timeout nên một lần chạy có thể lâu hơn budget. Queue lớn cần chạy thường xuyên hơn, không tăng batch vô hạn.

## Kiểm tra và migration

```sh
npm run lint
npm run lint:api
npm test
npm run build
node --import tsx scripts/check-r2-storage.ts
node --import tsx scripts/migrate-r2-storage.ts
```

Preflight chỉ in reachability, count, migration/CORS/lifecycle summary; không in secret hoặc nội dung CV. Cần kiểm tra public R2 access trên Dashboard và test browser CORS thực tế; chỉ đếm rule không đủ để nghiệm thu.

Migration mặc định chỉ inventory metadata. Khi được lên lịch ở Phase 4:

```sh
node --import tsx scripts/migrate-r2-storage.ts --apply
```

Script copy theo trang/keyset, giữ nguyên object key, ghi SHA-256/size checkpoint vào `.r2-migration/manifest.jsonl` (Git ignored). Không ghi đè object R2 đã tồn tại: kiểm tra hash thay vì overwrite. Chỉ đổi provider trên record còn tồn tại, `ready` và vẫn trỏ nguồn cũ. Copy lỗi/hash khác thì dừng; chạy lại tiếp tục các record còn provider Supabase. Bản copy không publish được có cleanup job. Nguồn Supabase không bị script xoá.

SQL regression test: `supabase/tests/r2_storage.test.sql`, chạy trong database disposable đã áp dụng migration; toàn bộ fixture rollback. Trong phiên triển khai ban đầu đã chạy migration và assertions bằng PostgreSQL nhúng với schema fixture tối thiểu; vẫn cần chạy trên Supabase staging để xác minh schema/trigger/RLS thực tế.

## Rollback

Đặt `STORAGE_WRITE_PROVIDER=supabase` để dừng upload R2 mới. Tiếp tục giữ code đọc hai provider và scheduler cleanup; không thay provider của file R2 thành Supabase khi chưa copy ngược và xác minh. Quay về code chỉ biết Supabase chỉ sau khi các file R2 đã được copy ngược đầy đủ. Yêu cầu xoá file/user phải bao gồm cả bản sao ở hai provider.

## Những bước cần kiểm chứng ngoài repository

Credentials/bucket thật, migration production, RLS thực tế, private access, CORS browser, sharp native build trên Vercel, lịch cleanup chạy thật, canary và baseline latency/error. Không coi test mock hoặc build frontend là bằng chứng các bước này đã đạt.

## Kết quả kiểm chứng trong workspace (2026-10-18)

- `npm run lint`, `npm run lint:api`, `npm run build`: đạt.
- `npm test`: 20 file, 164 test đạt, gồm JWT giả, ownership/traversal, PUT signature, giới hạn stream, finalize và phân quyền cleanup endpoint.
- Migration và SQL lifecycle assertions đạt trên PostgreSQL nhúng với fixture tối thiểu; không thay thế nghiệm thu trên Supabase staging.
- Đếm handler Vercel: 9; không thêm function riêng cho storage/cleanup.
- Kiểm tra Supabase chỉ đọc: `cv-files` và `cv-analyze-tmp` đang private, giới hạn tương ứng 50MiB/15MiB. Schema R2 mới chưa được xác nhận sẵn sàng; chưa áp dụng migration production.
- `npm audit`: 33 advisory, giống lockfile gốc (4 critical, 21 high, 7 moderate, 1 low), không có package bị ảnh hưởng mới từ dependency thêm vào. Chưa xử lý nâng cấp dependency ngoài phạm vi R2.
- Chưa có đủ 6 biến cấu hình R2 trong `.env` tại thời điểm kiểm chứng; chưa kiểm thử bucket R2 thật, scheduler, native bundle Vercel hoặc canary production.

## Kiểm tra credentials R2 thật (2026-10-18)

- Đã đọc cấu hình `.env` và kết nối thành công `cvfit-temp`/`cvfit-cv`.
- Smoke test bằng ảnh tổng hợp 1 pixel đạt trên cả hai bucket: presigned PUT 200, copy, GET với SHA-256 khớp và presigned GET 200. Tất cả object thử đã được xoá trong `finally`; không dùng CV người dùng.
- Request không có chữ ký không tải được object thử (HTTP 400). Dashboard xác nhận public access của `cvfit-cv` đang tắt; còn cần đối chiếu bucket temp trên Dashboard.
- Preflight browser OPTIONS từ domain chính, www và local trả 403: chưa sẵn sàng upload từ browser tại thời điểm kiểm tra.
- Token hiện tại thao tác object được, nhưng đọc CORS/lifecycle trả AccessDenied. Đây là giới hạn quyền đọc cấu hình, không phải lỗi kết nối bucket; script preflight đã tách riêng các trạng thái và có regression test.
- Đối chiếu Supabase: cột provider/status còn thiếu (42703), registry còn thiếu (PGRST205). Chưa áp dụng migration và vẫn giữ provider ghi Supabase.
- Draft CORS đã được chuẩn bị trên Dashboard; chưa Save, đang chờ xác nhận CORS/lifecycle theo quy tắc thao tác trình duyệt.

## Cấu hình thực tế và migration đã áp dụng (2026-10-18)

Đã lưu qua Cloudflare Dashboard theo xác nhận của người dùng:

| Bucket | Rule | Prefix | Action |
| --- | --- | --- | --- |
| `cvfit-cv` | `expire-staging-1d` | `staging/` | Xoá object sau 1 ngày |
| `cvfit-temp` | `expire-staging-1d` | `staging/` | Xoá object sau 1 ngày |
| `cvfit-temp` | `expire-temp-1d` | rỗng (toàn bucket tạm) | Xoá object sau 1 ngày |

Cả hai giữ rule mặc định abort multipart chưa hoàn tất sau 7 ngày và vẫn tắt public development URL/custom domain. `cvfit-cv` không có rule xoá 1 ngày cho prefix rỗng hoặc file chính thức. File chính thức có key `{user UUID}/...`, khác prefix gốc `staging/`, nên rule staging không match chúng.

CORS đúng JSON bốn origin phía trên, GET/PUT/HEAD, header Content-Type, expose ETag, MaxAgeSeconds 3600. OPTIONS trả 204 và đúng Allowed-Origin cho production/www/local ở hai bucket; origin ngoài danh sách trả 403.

Browser Chrome đã thực hiện PUT và GET trực tiếp từ cả `http://localhost:3000` và `http://localhost:5173`: hai bucket đều 200/200, ảnh tổng hợp 90 byte có SHA-256 khớp, đọc được ETag. Cleanup trả 200, đã xoá toàn bộ object thử và dừng server test local. Đây là browser test trực tiếp R2; chưa phải canary toàn bộ flow UI app production.

Đã áp dụng riêng `20261018023549_cloudflare_r2_storage.sql` bằng `supabase db query --linked --file ...`, rồi ghi nhận đúng version bằng `supabase migration repair 20261018023549 --status applied --linked`. Migration quota `20260912000000_free_quota_default_5.sql` đang chờ được giữ nguyên, không áp dụng ngoài phạm vi R2.

Xác minh schema:

- [r2_schema_verify.sql](../supabase/tests/r2_schema_verify.sql): đạt 4 cột metadata, 3 bảng nội bộ bật RLS, 7 trigger; kiểm tra quyền anon/authenticated không được truy cập bảng nội bộ hoặc RPC service-only.
- REST API của app trả 200 khi chọn các cột mới trên `saved_cvs` và `candidate_cvs`.
- `supabase db lint --linked --schema public,storage_internal --level error --fail-on error`: không có lỗi schema.
- Security Advisor không có ERROR; còn 5 WARN thuộc các RPC có sẵn và Auth leaked-password protection, không thuộc các object storage mới.

R2 vẫn chưa được bật cho ghi thật; chưa deploy mã mới, chưa chạy lịch cleanup production hoặc migrate file CV cũ. Các kiểm chứng này thay thế các trạng thái "chưa cấu hình/chưa áp dụng migration" trong các ghi chú lịch sử ở trên.


## Deploy production, giữ R2 tắt (2026-10-18)

Đã đẩy nhánh `codex/cloudflare-r2-integration`, mở [PR #3](https://github.com/nghiepnguyen/CVCompareTN/pull/3) và deploy code commit `43f5958` lên [cvfit.pro](https://cvfit.pro). Deployment: `dpl_ATFenfFaEcJ1ks5yPePShSfkYkGB` ([Vercel](https://vercel.com/nghiepnguyens/cv-compare-tn/ATFenfFaEcJ1ks5yPePShSfkYkGB)). PR chưa merge vào main.

- 165 tests pass; frontend/API TypeScript và build pass. CI, CodeQL, GitGuardian và Vercel preview đều pass trên commit code này.
- Đã sửa thứ tự `functions` để pattern riêng `api/extract-pdf.ts` đứng trước `api/*.ts`; Vercel chỉ lấy pattern khớp đầu tiên. Bản production có 9 functions.
- Kiểm tra live edge: `/api/config` 200, `storageWriteProvider=supabase`, `storageR2Purposes=[temp]`; API storage không có/sai token trả 401; cleanup không secret trả 401; GET PDF trả 405.
- `/vi/privacy/` và `/en/privacy/` trả 200, raw HTML có nội dung Cloudflare R2.
- Thư mục deploy lấy từ Git archive; không mang `.env`, file riêng hoặc thay đổi Graphify vào deployment.

Chưa bật ghi R2, chưa bật scheduler cleanup, chưa migrate CV cũ và chưa chạy canary UI có đăng nhập trên production. Trạng thái deploy này thay thế ghi chú chưa deploy trong phần lịch sử phía trên. Dependency audit vẫn còn 33 advisory có sẵn; không có dependency cũ bị nâng phiên bản trong thay đổi này.


## Scheduler cleanup đã bật và kiểm chứng (2026-10-18)

Theo xác nhận của người dùng, [PR #3](https://github.com/nghiepnguyen/CVCompareTN/pull/3) đã merge vào `main` tại commit `977b86931f8d8d66ef5bc4bdc5af5d743f991611`. Workflow `storage-cleanup.yml` có trên nhánh mặc định, cron mỗi 15 phút và hỗ trợ chạy thủ công.

Đã cấu hình repository variable `STORAGE_CLEANUP_ENABLED=true`, `STORAGE_CLEANUP_URL=https://cv-compare-tn.vercel.app/api/storage?action=cleanup`, và repository secret `STORAGE_CLEANUP_SECRET` khớp production (không lưu giá trị trong Git). Request thiếu secret tới alias này trả 401.

- Thử API trực tiếp: 2 job R2 xử lý thành công, `completed=2`, `failed=0`; object thử đã xóa và queue về 0.
- [Lượt GitHub Actions đầu](https://github.com/nghiepnguyen/CVCompareTN/actions/runs/39109885284) dùng `cvfit.pro` bị Cloudflare managed challenge 403 trước API. Đã sửa URL scheduler sang alias production Vercel; không thay đổi firewall hoặc auth.
- [Lượt GitHub Actions kiểm chứng](https://github.com/nghiepnguyen/CVCompareTN/actions/runs/39109923999) trên `main` thành công, log API trả `{"completed":3,"failed":0}`. Fixture là 3 ảnh tổng hợp ở R2 temp, R2 CV dưới `staging/`, và Supabase temp; không dùng CV người dùng.
- Sau workflow: HEAD R2 xác nhận hai object không còn; list Supabase xác nhận object tạm không còn; ba hàng queue thử đã xóa, tổng queue còn lại bằng 0.

Ghi R2 vẫn tắt (`supabase`), chưa migrate file CV cũ. Đã kiểm chứng lượt chạy thủ công của workflow; chưa chờ lượt cron tự động đầu tiên. GitHub schedule có thể chạy trễ theo tải runner. Phần này thay thế trạng thái chưa merge/chưa bật scheduler trong lịch sử phía trên.


## Điều chỉnh lịch GitHub Actions (2026-10-18, 19:01 giờ Việt Nam)

Kiểm tra API GitHub vẫn chỉ có hai lượt `workflow_dispatch`, chưa có `schedule` sau gần 4 giờ. Workflow `active`, repo không archived/disabled, default branch `main`, và file cron có trên main. Chưa xác định được nguyên nhân GitHub không tạo schedule event; không kết luận cron đã hoạt động chỉ từ lần dispatch thành công.

Đã cập nhật cron thành `7,22,37,52 * * * *` (giữ chu kỳ 15 phút, lệch các mốc đầu giờ) trên main và gọi enable workflow để kích hoạt lại. Đây là biện pháp thử khắc phục, chưa phải bằng chứng đã sửa xong. Mốc kế tiếp dự kiến 19:07; GitHub có thể chạy trễ. Chỉ đánh dấu xác minh tự động sau khi API có event `schedule` thành công với `failed=0`.

Kết quả theo dõi đến 2026-10-18 22:45 UTC: GitHub tạo 3 event `schedule` thành công (15:46Z, 18:17Z, 20:53Z) trên khoảng 43 mốc dự kiến. Cron vẫn chạy, nhưng GitHub bỏ hoặc làm trễ phần lớn các mốc, nên không đạt yêu cầu scheduler trước khi bật R2. Hướng xử lý là chuyển sang pg_cron (mục Scheduler). Migration đã viết và đã test local, chưa áp dụng production.

## pg_cron đã áp dụng production (2026-10-19)

Đã áp dụng riêng `20261018230000_storage_cleanup_pg_cron.sql` bằng `supabase db query --linked --file ...`, rồi ghi nhận bằng `supabase migration repair 20261018230000 --status applied --linked`. Migration quota `20260912000000` vẫn chưa áp dụng.

- Extension: `pg_cron` 1.6.4, `pg_net` 0.20.0.
- `storage_cleanup_cron_verify.sql` đạt: job `storage-cleanup` active, `authenticated`/`anon` không có quyền execute.
- Chưa có secret Vault (`vault_secrets_present=0`), nên `invoke_storage_cleanup()` trả `NULL` và chưa gửi request nào. Scheduler chỉ thực sự chạy sau khi tạo 2 secret và có `status_code=200` trong `net._http_response`.
- Secret Vault đã tạo trên Dashboard. Lần gọi thử đầu trả 401 vì secret dán vào bị thiếu (22 ký tự, server yêu cầu ≥32); sửa thành giá trị đủ 64 ký tự. Lượt gọi thủ công `invoke_storage_cleanup()` lúc 23:07Z trả `200 {"completed":0,"failed":0}`. Lượt cron tự động đầu tiên chạy lúc 23:15:00Z (đúng mốc, `succeeded`), HTTP 200, không timeout; xác minh bằng `storage_cleanup_cron_verify.sql`. pg_cron là scheduler chính; workflow GitHub giữ làm dự phòng.
