# Kế hoạch tích hợp Cloudflare R2

Ngày lập: 2026-10-17. Trạng thái: đề xuất, chưa triển khai.

Phân tích dựa trên repository tại commit `5716ac6`, các migration, cấu hình Vercel và tài liệu Cloudflare. Chưa đối chiếu cấu hình Supabase/Vercel production, chưa chạy test/build. Các phát hiện từ migration không khẳng định cấu hình production đang giống repository.

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
- Giữ `file_path` làm object key; thêm `storage_provider` cho `saved_cvs` và `candidate_cvs`, dữ liệu cũ mặc định `supabase`.
- Storage reference tạm cũng mang provider trong giai đoạn chuyển đổi; không dùng một cờ toàn cục khiến request đang chạy đọc nhầm nơi.
- Dùng SDK S3 ở server; repository hiện chưa có dependency S3.
- Không lưu signed URL vào DB hoặc log URL có chữ ký.
- Presigned URL là bearer token; TTL ngắn. URL ký dùng domain S3 API R2, không dùng trực tiếp custom domain.
- Kiểm tra size/MIME thực tế phía server, giới hạn luồng đọc và rate limit cấp URL. Metadata client hoặc `file.size` phía browser không đủ để bảo vệ trust boundary.
- Nếu cần chặn cứng dung lượng ngay khi nhận upload, thiết kế thêm lớp nhận upload có kiểm soát; kiểm tra hậu upload không ngăn được toàn bộ storage abuse.

## 5. Các bước triển khai

- [ ] **Đối chiếu production và lập inventory.** Kiểm tra public/private, policy thực tế, số object/dung lượng, metadata thiếu file và file thiếu metadata. Đo traffic upload/download để xác định lợi ích chi phí.
- [ ] **Chốt hợp đồng storage và phân quyền.** Quy định key, provider, quyền CV/campaign, TTL, MIME, size và mã lỗi. Owner lấy từ JWT; không tin `uid` client.
- [ ] **Chuẩn bị R2 và môi trường.** Tạo bucket private, credentials giới hạn bucket, CORS theo origin cụ thể, lifecycle cho file tạm; cập nhật `.env.example`, Vercel secrets và CSP.
- [ ] **Tạo API storage dùng chung Vercel/Express.** Gom action cấp upload/download, finalize, delete vào một handler; logic ở `_server-lib/storage/`. Repository hiện có 9 handler API, thêm một thành 10 và vượt ngưỡng nội bộ ≤9. Hợp nhất một route trước; `extract-pdf` là ứng viên vì docs ghi frontend không còn gọi, nhưng phải kiểm tra consumer ngoài trước khi bỏ.
- [ ] **Chuyển file tạm trước.** Sửa upload, resolver, cleanup và hợp đồng analyze/parse/rewrite. Chỉ xoá sau khi mọi consumer kết thúc; bổ sung cleanup nhánh lỗi và lifecycle dự phòng. Lifecycle không thay việc xoá ngay sau xử lý.
- [ ] **Chuyển kho CV và recruiter.** Cập nhật service/type/mapping để đọc theo provider; thay public URL bằng URL ký. Rà đủ xem/tải, chọn CV cũ, upload ứng viên, batch analysis và xoá file/campaign.
- [ ] **Hoàn thiện xoá và migration.** Admin cleanup cả hai provider; lưu lỗi để retry. Copy file lâu dài theo batch với manifest/checkpoint, đối chiếu size và hash nội dung trước đổi provider. File tạm không migrate: để request cũ hoàn tất và hết hạn.
- [ ] **Kiểm thử và rollout từng đợt.** Chạy kiểm thử quyền, luồng file và lỗi giữa chừng; lint, lint API, test liên quan và build. Mở R2 cho nhóm nhỏ, đo lỗi/latency rồi mở rộng.

## 6. Điều kiện nghiệm thu

| Nhóm | Điều kiện đạt |
| --- | --- |
| Phân quyền | User A không thể cấp URL, đọc, ghi đè hoặc xoá file user B; recruiter không truy cập campaign ngoài quyền |
| Upload | Sai loại/quá dung lượng không vào AI hoặc metadata chính thức; lỗi URL hết hạn có xử lý rõ |
| AI | PDF text, PDF scan, ảnh qua inline/storage hoạt động; parse/rewrite không mất file giữa chừng |
| Vòng đời | Analyze lỗi, đóng tab, DB lỗi, xoá user và retry được cleanup đầy đủ hoặc có cơ chế retry theo dõi được |
| Dữ liệu cũ | CV/candidate trên Supabase vẫn mở được khi migration |
| Triển khai | CORS/CSP trên domain thật hoạt động; function count đáp ứng quy định dự án |

Các lệnh xác minh khi triển khai:

```sh
npm run lint
npm run lint:api
npm run test -- <các-test-liên-quan>
npm run build
```

Bổ sung test tại trust boundary: JWT thiếu/hết hạn, key khác user, campaign khác owner, MIME giả, quá dung lượng, finalize thiếu object, cleanup retry, provider cũ/mới và lỗi R2. Kiểm tra upload/download trực tiếp trên staging để xác minh CORS/CSP, không chỉ mock SDK.

## 7. Rollback và bảo toàn dữ liệu

- Dừng ghi mới vào R2: chuyển upload mới về Supabase, vẫn đọc theo `storage_provider`.
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

Thứ tự ưu tiên: kiểm tra quyền storage hiện tại → thử R2 cho file tạm → kho CV và recruiter → migrate file cũ → ngừng Supabase Storage sau nghiệm thu.

## 9. Nguồn tham khảo

- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Cloudflare R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- `supabase/migrations/20260516120000_cv_matcher_core_schema.sql`
- `supabase/migrations/20260601130000_security_cv_files_policy.sql`
- `supabase/migrations/20260708000000_cv_analyze_tmp_bucket.sql`
- `docs/4_backend.md`, `docs/7_deployment.md`, `docs/9_api_routes.md`
