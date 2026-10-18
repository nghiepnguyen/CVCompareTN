# Kế hoạch tích hợp Cloudflare R2 — Final

Ngày lập: 2026-10-17. Phiên bản: final kế hoạch; chưa triển khai. Bản này là kế hoạch chính, thay thế bản gốc `2026-10-17-cloudflare-r2-integration.md`.

Phân tích dựa trên repository tại commit `5716ac6`, các migration, cấu hình Vercel và tài liệu Cloudflare. Chưa đối chiếu cấu hình Supabase/Vercel production, chưa chạy test/build. Các phát hiện từ migration không khẳng định cấu hình production đang giống repository.

## Tiến độ triển khai 2026-10-18

- Đã bổ sung mã R2 cho ba luồng, API dùng chung function PDF (giữ 9 handler), migration additive, registry/lease/finalize, cleanup queue và workflow scheduler có cờ bật riêng.
- Đã thêm rollout theo purpose, đọc legacy Supabase, script preflight và migration có SHA-256; chưa chạy copy dữ liệu thật.
- Đã sửa helper JWT backend để xác minh token bằng Supabase Auth trước khi cấp quyền storage.
- Đã kiểm tra chỉ đọc: hai bucket Supabase thực tế đang private, giới hạn lần lượt 50MiB và 15MiB. Preflight chưa xác nhận schema mới sẵn sàng; chưa áp dụng migration production.
- Kiểm chứng local gồm typecheck frontend/API, unit tests và SQL lifecycle bằng PostgreSQL nhúng. Kiểm chứng Supabase staging, R2 thật, native bundle Vercel, scheduler/canary vẫn là điều kiện trước rollout.
- R2 mặc định tắt. Hướng dẫn cấu hình, triển khai và rollback: [10_storage_r2.md](../../10_storage_r2.md).

## Cập nhật cấu hình thực tế 2026-10-18

- Đã lưu CORS bốn origin production/www/localhost 3000/5173 cho hai bucket private.
- Lifecycle `cvfit-cv` chỉ xoá prefix `staging/` sau 1 ngày; `cvfit-temp` xoá staging và file tạm sau 1 ngày; giữ abort multipart 7 ngày.
- Browser upload/download trực tiếp hai bucket đạt từ cả hai origin local, SHA-256 khớp và ETag đọc được; OPTIONS production/www đạt, origin ngoài danh sách bị chặn. Đã dọn toàn bộ file thử.
- Migration R2 `20261018023549` đã áp dụng và ghi nhận trong history; 4 cột, 3 bảng RLS, 7 trigger và service-only privileges đã xác minh trên Supabase thật; DB lint không có lỗi. Migration quota cũ không bị áp dụng kèm.
- Còn các gate deploy mã, scheduler cleanup thật, canary UI app và rollout theo purpose; chưa bật ghi R2 hoặc copy CV cũ. Chi tiết bằng chứng: [10_storage_r2.md](../../10_storage_r2.md).

## 1. Hướng tiếp cận và phạm vi

Giữ Supabase cho Auth, PostgreSQL và RLS dữ liệu; chuyển file sang R2 private theo từng giai đoạn, bắt đầu bằng file tạm. Đây là thay đổi tầng lưu trữ và phân quyền, không chỉ đổi endpoint upload.

Trong phạm vi:

- File tạm phục vụ phân tích, kho CV cá nhân và file ứng viên recruiter.
- Quyền upload/download/delete, vòng đời file, xoá người dùng.
- Metadata xác định provider, migration, kiểm chứng và rollback.
- Cấu hình môi trường, CORS, CSP, API Vercel/Express và tài liệu vận hành.

Ngoài phạm vi:

- Thay Supabase Auth/Database, quota, payment hoặc cấu trúc kết quả AI.
- Thay thuật toán/prompt Gemini hoặc bổ sung Cloudflare Worker khi chưa cần.

## 2. Hiện trạng và các điểm ảnh hưởng

| Luồng | Hiện trạng | Phần cần thay đổi |
| --- | --- | --- |
| Kho CV cá nhân | `cv-files`; metadata ở `saved_cvs` | Upload, tải lại, xoá CV, provider metadata |
| CV recruiter | `cv-files`; tải qua public URL | Upload, xem/tải CV, phân tích batch, xoá ứng viên/campaign |
| File tạm | File lớn hơn 2MB upload vào `cv-analyze-tmp` | Cấp quyền upload, đọc phía server, cleanup |
| API AI | Analyze/parse/rewrite đọc file tạm bằng service role | Bộ đọc file và hợp đồng storage reference |
| Xoá tài khoản | Admin quét hai bucket theo prefix user | Cleanup cả R2 và Supabase trong giai đoạn chuyển đổi |
| Triển khai | CSP chưa cho phép R2 | CSP, CORS, secrets, function count |

Các file chính:

- `src/services/cvService.ts`: kho CV và file tạm.
- `src/services/recruiterService.ts`: upload, URL và xoá file ứng viên.
- `src/hooks/useFileProcessor.ts`: chọn đường inline/storage.
- `_server-lib/storage/tempFile.ts`: `resolveStorageRef` dùng chung.
- `_server-lib/analyze/handler.ts`, `_server-lib/parseCv/handler.ts`, `_server-lib/rewriteCv/handler.ts`: resolve reference trước Gemini.
- `src/context/analysis/SavedCvContext.tsx`: lưu, tải và xoá CV.
- `src/context/analysis/AnalysisRunContext.tsx`: tải CV cũ và cleanup sau background work.
- `src/context/recruiter/RecruiterContext.tsx`: tải public URL, phân tích và cleanup.
- `_server-lib/admin/deleteUser.ts` và test tương ứng: xoá dữ liệu user.
- Migration `saved_cvs`, `candidate_cvs`; `.env.example`, `vercel.json`, `server.ts`, route Express và `docs/3_frontend.md` đến `docs/9_api_routes.md` theo phần liên quan.

Hành vi cần giữ đúng: PDF có text lớn hơn 15MB hiện có thể xử lý bằng text và bỏ file gốc; ảnh lớn hơn 15MB bị từ chối. Docs hiện có chỗ mô tả giới hạn khác code. Không vô tình đổi hành vi này khi chuyển storage.

## 3. Phát hiện và rủi ro

| Mức | Phát hiện trong repository | Hệ quả / cách xử lý |
| --- | --- | --- |
| Cao | Migration gốc tạo `cv-files` với `public=true`; migration security chỉ sửa SELECT policy | Kiểm tra bucket thực tế; thiết kế R2 private từ đầu |
| Cao | Policy INSERT/UPDATE/DELETE `cv-files` trong repository chỉ kiểm tra bucket, chưa scope folder user | Nếu production còn áp dụng thì quyền ghi/xoá quá rộng; đối chiếu và siết quyền nguồn cũ |
| Cao | Recruiter dùng `getPublicUrl()` rồi `fetch()` | Chuyển private sẽ hỏng nếu chưa thay tải có xác thực |
| Cao | R2 không kế thừa RLS Supabase | Xác thực JWT và kiểm tra quyền object/campaign ở backend |
| Vừa | Cleanup file tạm phụ thuộc browser và nhánh thành công | Đóng tab/lỗi request để lại orphan; cần cleanup lỗi và lifecycle |
| Vừa | Xoá CV vẫn xoá metadata khi xoá storage lỗi | Mất dấu file PII; cần ghi nhận và retry cleanup |
| Vừa | Metadata Supabase và R2 không có transaction chung | Cần finalize và dọn upload chưa hoàn tất |
| Vừa | API AI tải nguyên file và chuyển base64 | R2 không tự giảm RAM/thời gian Gemini; cần giới hạn, timeout và đo latency |

## 4. Kiến trúc đề xuất

### Upload

1. Frontend gửi Supabase access token, mục đích file và metadata.
2. Backend xác thực user, kiểm tra quyền campaign nếu có và tự sinh object key.
3. Backend trả presigned PUT URL thời hạn ngắn.
4. Browser upload trực tiếp lên R2, không đưa binary qua Vercel.
5. Backend xác minh object trước khi lưu metadata chính thức hoặc đưa vào AI.

### Download

1. Frontend gửi ID CV/candidate.
2. Backend tra metadata và kiểm tra quyền.
3. Trả presigned GET URL ngắn hạn; nếu phục vụ Gemini thì server đọc object trực tiếp.

### Quyết định thiết kế

- Hai bucket private, tách file lâu dài và file tạm.
- Object key theo user, UUID do backend sinh; không tin bucket/key/owner tuỳ ý từ client.
- Giữ `file_path` làm object key; thêm `storage_provider` và `storage_status` vào `saved_cvs`/`candidate_cvs`. Không thêm trường `storage_key` trùng nghĩa. Dữ liệu cũ mặc định provider `supabase`, trạng thái `ready`; inventory ghi nhận các reference thiếu object để xử lý riêng.
- Storage reference tạm cũng mang provider trong giai đoạn chuyển đổi; không dùng một cờ toàn cục khiến request đang chạy đọc nhầm nơi.
- Dùng SDK S3 ở server; repository hiện chưa có dependency S3.
- Không lưu signed URL vào DB hoặc log URL có chữ ký.
- Presigned URL là bearer token; TTL ngắn. URL ký dùng domain S3 API R2, không dùng trực tiếp custom domain.
- Kiểm tra size/MIME thực tế phía server, giới hạn luồng đọc và rate limit cấp URL. Metadata client hoặc `file.size` phía browser không đủ để bảo vệ trust boundary.
- Nếu cần chặn cứng dung lượng ngay khi nhận upload, thiết kế thêm lớp nhận upload có kiểm soát; kiểm tra hậu upload không ngăn được toàn bộ storage abuse.

## 5. Các bước triển khai

Triển khai theo 4 phase để giảm blast radius. Migration file cũ không block việc đưa R2 vào production.

### Phase 1 — R2 infrastructure và storage contract

- [ ] **Đối chiếu production và lập inventory tối thiểu.** Kiểm tra public/private, policy thực tế, số object/dung lượng, metadata thiếu file và file thiếu metadata. Không cần hoàn tất migration inventory chi tiết trước khi thử R2 cho file tạm.
- [ ] **Chốt storage contract và phân quyền.** Quy định `storage_provider`, `file_path`, `storage_status`, key format, quyền CV/campaign, TTL, MIME, size và mã lỗi. Owner luôn lấy từ JWT; không tin `uid`, bucket hoặc key từ client.
- [ ] **Chuẩn bị R2.** Tạo hai bucket private: file lâu dài và file tạm. Credentials giới hạn đúng bucket; CORS theo origin cụ thể; lifecycle cho bucket tạm; cập nhật `.env.example`, Vercel secrets và CSP.
- [ ] **Tạo storage abstraction ở server.** Dùng S3 SDK cho R2, giữ adapter Supabase để dual-read trong giai đoạn chuyển đổi. Không để business logic tự ghép URL hoặc gọi provider trực tiếp.
- [ ] **Tạo API cấp quyền dùng chung.** Hỗ trợ presigned upload, finalize, download và delete. Bắt buộc giữ tổng số function ≤9 theo AGENTS.md. Baseline đã kiểm tra có 9 handler; phải đếm lại trước triển khai. Nếu thêm handler storage, hợp nhất hoặc loại một handler trong thay đổi riêng trước deployment, sau khi xác minh consumer. Không bỏ `extract-pdf` chỉ vì frontend không gọi. Dùng một handler `/api/storage` phân phối action và một router Express tương ứng; tác vụ cleanup dùng cùng handler để không phát sinh function riêng.

### Phase 2 — Chuyển file tạm trước

- [ ] Chuyển `cv-analyze-tmp` sang R2 trước.
- [ ] Browser upload trực tiếp bằng presigned PUT; backend không proxy binary qua Vercel.
- [ ] Sau upload, gọi finalize theo cơ chế staging và xác minh nội dung ở mục 5a; HEAD chỉ xác minh tồn tại, dung lượng và metadata, không chứng minh định dạng thực tế. Chỉ reference `ready` được đưa vào analyze/parse/rewrite.
- [ ] Sửa `resolveStorageRef` để hiểu provider và đọc R2 trực tiếp phía server.
- [ ] Application xoá file ngay khi mọi consumer hoàn tất; lifecycle R2 (ví dụ 24 giờ, chốt theo nhu cầu thực tế) chỉ là safety net cho orphan do crash/timeout/đóng tab.
- [ ] Bổ sung cleanup cho nhánh lỗi và log/metric lỗi cleanup.

### Phase 3 — File lâu dài mới

- [ ] Chuyển **upload mới** của kho CV cá nhân và recruiter sang R2.
- [ ] Dữ liệu cũ trên Supabase tiếp tục đọc bình thường bằng `storage_provider`; chưa migrate file cũ trong phase này.
- [ ] Thay `getPublicUrl()` bằng backend authorization + presigned GET URL TTL ngắn.
- [ ] Rà đủ các luồng: xem/tải CV, chọn CV cũ, upload ứng viên, batch analysis, xoá CV, xoá ứng viên/campaign và xoá tài khoản.
- [ ] Áp dụng các trạng thái vòng đời dưới đây; bảng lưu từng trạng thái được quy định tại mục 5b:
  - `pending`: đã khởi tạo upload nhưng chưa finalize.
  - `ready`: object đã được backend xác minh và có thể sử dụng.
  - `delete_pending`: yêu cầu xoá đã ghi nhận nhưng storage cleanup chưa hoàn tất.
  - `failed`: upload/finalize thất bại cần cleanup hoặc retry.
- [ ] Triển khai scheduler và cleanup job ở mục 5b cho upload `pending`/`failed` quá hạn và file `delete_pending`; chạy thử trước khi mở upload mới.

### Phase 4 — Legacy migration, thực hiện sau khi R2 ổn định

Phase này **không block launch**. Chỉ bắt đầu khi R2 đã chạy ổn định, có baseline lỗi/latency và có lý do rõ ràng để giảm hoặc ngừng Supabase Storage.

- [ ] Lập inventory đầy đủ file lâu dài trên Supabase.
- [ ] Copy theo batch nhỏ và có checkpoint để có thể resume.
- [ ] Xác minh object tồn tại, size và SHA-256 nội dung nguồn/đích khớp trước khi đổi provider. Tính hash bằng luồng đọc giới hạn tài nguyên; không coi ETag là hash nội dung tương đương. Lưu manifest kết quả và checkpoint để resume.
- [ ] Chỉ đổi `storage_provider` sau khi object R2 được xác minh.
- [ ] Giữ bản nguồn Supabase trong cửa sổ nghiệm thu để rollback.
- [ ] File tạm không migrate; để request cũ hoàn tất và lifecycle dọn.
- [ ] Chỉ ngừng Supabase Storage sau khi toàn bộ luồng, dữ liệu và cleanup đã được kiểm chứng.

### Upload/finalize state machine

```text
POST /storage/upload-url
        │
        ├── authorize JWT / campaign
        ├── generate backend-owned object key
        └── metadata → pending
                    │
                    ▼
             presigned PUT
                    │
                    ▼
                R2 object
                    │
                    ▼
POST /storage/finalize
        │
        ├── claim finalize / authorize again
        ├── copy staging → server-only final key
        ├── HEAD + bounded content validation
        └── atomic publish → ready
```

Nếu upload/finalize lỗi, chuyển `failed` hoặc để `pending` hết hạn để cleanup. Khi delete storage lỗi, giữ metadata ở `delete_pending` để có thể retry thay vì xoá mất dấu file.

### 5a. Hợp đồng finalize và chống thay đổi file sau xác minh

- Presigned PUT chỉ ghi vào prefix `staging/{uid}/{uploadId}`; key được xuất bản nằm ở prefix khác, không bao giờ được cấp PUT URL cho browser.
- Finalize nhận upload ID, tra record phía server và kiểm tra lại user/campaign. Client không được tự chọn provider, bucket, final key hoặc trạng thái.
- Claim finalize bằng cập nhật có điều kiện để chỉ một tiến trình thực hiện. Dùng lease có thời hạn cho tiến trình bị crash; retry không tạo thêm CV/candidate hoặc chạy song song cùng upload.
- Copy staging sang final key do server quản lý, sau đó xác minh chính object final. PUT URL staging còn hạn không thể sửa object final. Chỉ publish reference khi xác minh xong; lần finalize đã thành công trả lại cùng kết quả.
- HEAD kiểm tra dung lượng và metadata; đọc giới hạn byte, kiểm tra chữ ký định dạng và dùng parser phù hợp trước `ready`. Giới hạn byte/time áp dụng cả lúc AI đọc; không tin Content-Type hoặc metadata client. Giữ giới hạn dung lượng theo từng luồng hiện tại, không tăng giới hạn trong migration.
- Nếu copy/validation/ghi DB lỗi, không publish object; lưu trạng thái để cleanup/retry. Staging vẫn có lifecycle, kể cả khi bị upload lại bằng URL chưa hết hạn.
- Chốt TTL URL, thời hạn lease và lifecycle trong Phase 1 dựa trên thời gian xử lý thực tế. Rate limit cấp URL theo user và giới hạn số upload đang chờ; ghi nhận rủi ro dung lượng phát sinh trước kiểm tra hậu upload.

### 5b. Lưu trạng thái và chạy cleanup

- Thêm bảng nội bộ `storage_uploads` để theo dõi upload tạm và upload lâu dài trước khi tạo business record. Lưu upload ID, owner ID, purpose, provider, staging/final key, size/type dự kiến, trạng thái, lease và thời điểm hết hạn. Chỉ backend ghi bảng; không cấp quyền truy cập trực tiếp từ client.
- `saved_cvs`/`candidate_cvs` chỉ được tạo khi finalize thành công; việc tạo record và đánh dấu upload hoàn tất nằm trong transaction DB. Trạng thái file của business record dùng `ready`/`delete_pending`; trạng thái upload dùng `pending`/`ready`/`failed`, cùng lease finalize. Mô tả ở Phase 3 áp dụng theo phân tách này.
- Lưu yêu cầu xoá cần retry trong bảng nội bộ `storage_cleanup_jobs` trước khi xoá metadata hoặc tài khoản/campaign. Job chứa provider/key và retry metadata, không chứa nội dung CV hoặc signed URL; không bị cascade khi owner bị xoá. Giới hạn truy cập backend và thời gian lưu job hoàn tất.
- Xoá lặp an toàn: object không tồn tại được coi là đã xoá. Dọn staging/final orphan, upload hết hạn và `delete_pending` theo batch có giới hạn, backoff, lease và số lần thử; lỗi vượt ngưỡng phải được ghi nhận để xử lý.
- Dùng lịch chạy phía server gọi action cleanup có secret trong header qua cùng `/api/storage`; chọn scheduler hiện có/được hỗ trợ khi kiểm tra môi trường Phase 1. Không phụ thuộc browser và không thêm function riêng. Cấu hình lịch, xác thực và lần chạy thử thành công là điều kiện trước rollout; lifecycle chỉ bổ trợ cho bucket tạm/staging.
- Khi xoá user, chặn cấp quyền upload mới, ghi job cleanup trước cascade và quét prefix có phân trang trên cả hai provider. Quét lại sau khi PUT URL đã cấp hết hạn để bắt file được upload muộn. Mọi bản sao migration đều thuộc phạm vi xoá.

### 5c. Điều kiện kết thúc từng phase

| Phase | Điều kiện trước khi đi tiếp |
| --- | --- |
| 1 | Đối chiếu quyền production; migration tương thích dữ liệu cũ; contract/TTL/giới hạn được chốt; scheduler được chọn; function count ≤9; kiểm tra JWT và quyền owner/campaign đạt |
| 2 | File tạm qua đủ inline/storage, PDF/ảnh và ba consumer AI; kiểm thử finalize lặp, upload lại sau finalize, crash/timeout; cleanup scheduler chạy thật; CORS/CSP staging đạt; canary đạt ngưỡng lỗi/latency đã chốt |
| 3 | CV cá nhân và recruiter đọc được cả hai provider; xoá CV/campaign/user và retry đạt; rollout nhỏ đạt ngưỡng lỗi/latency; rollback dừng ghi mới đã thử |
| 4 | Inventory đầy đủ, size/hash khớp cho mọi file chuyển provider; resume và xoá trong lúc copy đã thử; hết cửa sổ rollback và không còn reference hoạt động tới nguồn trước khi ngừng Supabase Storage |

Ngưỡng lỗi/latency và cửa sổ quan sát phải được ghi lại từ baseline ở Phase 1 trước canary; không mở rộng rollout khi chưa có số đo hoặc cleanup còn lỗi chưa xử lý. Các kiểm tra lint/API/test/build ở mục 6 áp dụng cho từng phase có thay đổi mã tương ứng.

## 6. Điều kiện nghiệm thu

| Nhóm | Điều kiện đạt |
| --- | --- |
| Phân quyền | User A không thể cấp URL, đọc, ghi đè hoặc xoá file user B; recruiter không truy cập campaign ngoài quyền |
| Upload | Sai loại/quá dung lượng không vào AI hoặc trạng thái `ready`; finalize chỉ thành công sau khi backend xác minh object; lỗi URL hết hạn có xử lý rõ |
| AI | PDF text, PDF scan, ảnh qua inline/storage hoạt động; parse/rewrite không mất file giữa chừng |
| Vòng đời | Analyze lỗi, đóng tab, DB lỗi, xoá user và retry được cleanup đầy đủ hoặc có cơ chế retry theo dõi được; `pending`/`failed`/`delete_pending` không trở thành orphan vĩnh viễn |
| Dữ liệu cũ | CV/candidate trên Supabase vẫn mở được khi migration |
| Triển khai | CORS/CSP trên domain thật hoạt động; function count đáp ứng quy định dự án |

Các lệnh xác minh khi triển khai:

```sh
npm run lint
npm run lint:api
npm run test -- <các-test-liên-quan>
npm run build
```

Bổ sung test tại trust boundary: JWT thiếu/hết hạn, key khác user, campaign khác owner, MIME giả, quá dung lượng, finalize thiếu object, finalize lặp/đồng thời, upload lại sau finalize, crash giữa copy và DB commit, cleanup sau cascade hoặc upload muộn, provider cũ/mới và lỗi R2. Kiểm tra upload/download trực tiếp trên staging để xác minh CORS/CSP, không chỉ mock SDK.

## 7. Rollback và bảo toàn dữ liệu

- Dừng ghi mới vào R2: chuyển upload mới về Supabase, vẫn dual-read theo `storage_provider`; không cần migrate ngược ngay các file R2 đã ở trạng thái `ready`.
- Rollback về code chỉ biết Supabase: phải copy ngược file chỉ có trên R2 trước.
- Giữ bản nguồn Supabase trong cửa sổ nghiệm thu; chưa xoá ngay sau copy.
- Áp dụng yêu cầu xoá user/file lên cả hai bên trong thời gian giữ bản sao, tránh khôi phục file đã xoá.
- Chỉ ngừng Supabase Storage sau khi kiểm chứng dữ liệu, luồng người dùng và cleanup; duy trì manifest migration không chứa nội dung CV hoặc secrets.

## 8. Chi phí và các thông tin còn thiếu

Theo bảng giá R2 kiểm tra ngày 2026-10-17, Standard: $0.015/GB-tháng; Class A $4.50/triệu request; Class B $0.36/triệu request; miễn phí egress. Free tier: 10GB-tháng, 1 triệu Class A và 10 triệu Class B. Cần kiểm tra lại tại thời điểm triển khai.

Cần tính thêm chi phí đọc/copy nguồn Supabase, HEAD/GET, vận hành hai provider và công migration. Chưa có storage/traffic thực tế nên chưa kết luận mức tiết kiệm hoặc R2 nhanh hơn.

Các thông tin cần thu thập trước rollout:

- Tổng dung lượng, số object, phân bố size và lưu lượng theo từng luồng.
- Cấu hình bucket và policy production hiện tại.
- Consumer ngoài frontend của API dự định hợp nhất.
- Khoảng giữ bản sao để rollback, thời hạn file tạm và yêu cầu lưu trữ dữ liệu cá nhân.
- Baseline tỷ lệ lỗi và độ trễ upload/download/AI để so sánh staging và canary.

Thứ tự ưu tiên: kiểm tra quyền storage hiện tại → Phase 1 infrastructure/contract → Phase 2 file tạm → Phase 3 upload mới cho kho CV/recruiter → vận hành ổn định → Phase 4 migrate file cũ khi thực sự cần → ngừng Supabase Storage sau nghiệm thu.

## 9. Nguồn tham khảo

- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Cloudflare R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- `supabase/migrations/20260516120000_cv_matcher_core_schema.sql`
- `supabase/migrations/20260601130000_security_cv_files_policy.sql`
- `supabase/migrations/20260708000000_cv_analyze_tmp_bucket.sql`
- `docs/4_backend.md`, `docs/7_deployment.md`, `docs/9_api_routes.md`
