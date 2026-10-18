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
5. Cấu hình CORS/lifecycle bên dưới; cấu hình scheduler và chạy thủ công thành công.
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

## Scheduler

Workflow `.github/workflows/storage-cleanup.yml` chạy mỗi 15 phút hoặc `workflow_dispatch` và chỉ hoạt động khi repository variable `STORAGE_CLEANUP_ENABLED=true`.

Thiết lập GitHub repository:

- Variable `STORAGE_CLEANUP_URL=https://<deployment-host>/api/storage?action=cleanup`.
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
