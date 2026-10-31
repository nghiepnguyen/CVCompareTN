# Kiểm chứng tích hợp R2 — 25/10/2026

## Kết luận

Đạt 12/12 ca kiểm chứng tích hợp và 4/4 ca browser. Các luồng chính temp/saved/candidate hoạt động với R2, Supabase Auth/metadata và Gemini thật bằng dữ liệu tổng hợp. Chưa phải nghiệm thu toàn bộ UI React hoặc canary Vercel production; chưa có đủ mẫu để chốt p95/tỷ lệ lỗi vận hành.

Production đã đối chiếu sau test: `/api/config` HTTP 200, `storageWriteProvider=supabase`, `storageR2Purposes=[temp]`. Không sửa `.env`, không deploy hoặc bật R2 production. Chỉ tiến trình test local đặt provider R2 và bật ba purpose.

## Bằng chứng

- `scripts/verify-r2-flow.ts`: dùng HTTP Express storage router hiện có trên loopback; R2/Supabase thật. Ba AI consumer gọi handler ứng dụng trực tiếp, không mock Gemini. 12 ca đạt, `cleanupOk=true`.
- `scripts/verify-r2-browser.ts`: Chrome từ `http://localhost:3000`, presigned PUT/GET trực tiếp vào cả hai bucket. 4 ca đạt: HTTP 200/200, SHA-256 khớp và ETag đọc được qua CORS. Harness browser kiểm tra transport, không chạy giao diện React.
- Dữ liệu raw local, Git ignored: `.r2-migration/r2-flow/41c6a02d-ab44-4c02-a55c-27552a6fa21c/report.json` và `.r2-migration/r2-browser/a24e5d6d-410b-464a-b86f-d84e118197cd/report.json`. Ảnh bằng chứng: `browser-proof.jpg` trong thư mục browser tương ứng.

| Ca kiểm chứng | Kết quả |
| --- | --- |
| Thiếu auth | HTTP 401 |
| Cleanup dùng user bearer thay scheduler secret | HTTP 401 |
| File temp vượt 15 MiB | HTTP 400 trước cấp URL |
| Temp PDF: reserve → PUT → finalize → resolve reference | Đạt; hash khớp |
| Saved PDF: reserve → PUT → finalize → signed GET → delete | Đạt; hash khớp; sau xoá download 404 |
| Candidate PDF trong campaign synthetic | Đạt; hash khớp; sau xoá download 404 |
| Finalize lặp trên cả ba purpose | Cùng final path, HTTP 200 |
| User khác finalize/read/delete | Bị chặn; temp reference không đọc được |
| Temp object đang tồn tại, GET không chữ ký | Bị từ chối |
| Analyze dùng R2 reference PDF synthetic | HTTP 200, 12,08 giây |
| Parse dùng cùng R2 reference | HTTP 200, 7,32 giây |
| Rewrite dùng cùng R2 reference | HTTP 200, 17,16 giây |
| Delete-temp rồi đọc lại reference | Xoá thành công; reference cũ bị từ chối |
| PNG 3.151.914 byte: PUT → finalize → hash → cleanup | Đạt, 6,94 giây cho toàn ca |
| PNG 14.545.753 byte: PUT → finalize → hash → cleanup | Đạt, 15,45 giây cho toàn ca |

Các hàng mô tả có thể nằm trong cùng một ca tổng hợp; 12 là số ca tổng hợp được lưu trong JSON. Thời gian là một lượt đơn, không phải p95 hay SLA; thời gian ca file lớn bao gồm nhiều bước, không so trực tiếp với PUT/GET thuần.

| Browser localhost:3000 | PUT | GET | Hash / ETag | Thời gian PUT+GET+hash |
| --- | --- | --- | --- | --- |
| Temp, PNG 90 byte | 200 | 200 | Đạt | 700 ms |
| Temp, PNG ~3 MiB | 200 | 200 | Đạt | 1.751 ms |
| Saved, PNG 90 byte | 200 | 200 | Đạt | 1.156 ms |
| Saved, PNG ~3 MiB | 200 | 200 | Đạt | 2.053 ms |

## Cleanup và validation

Đã xoá object trong đúng prefix của fixture trên cả hai bucket; list xác nhận rỗng. Đã xoá hai tài khoản fixture và campaign; truy vấn chỉ lấy count xác nhận tài khoản/campaign synthetic đều còn 0. Registry deleted/tombstone và job cleanup trễ phát sinh từ trigger xoá user được giữ cho scheduler theo thiết kế, không xoá lịch sử hoặc queue người dùng khác. Không gọi cleanup global thủ công trong test này.

PDF synthetic qua kiểm tra trích xuất văn bản; `npm run lint`, `npm run lint:api`, `git diff --check` đạt. 22 regression tests trong storage và Vercel dispatch đạt. Không thêm dependency, không sửa mã production. Lượt harness đầu thiếu profile fixture (app bình thường tạo khi đăng nhập) đã dừng và cleanup; harness đã bổ sung profile trước lượt 12/12 này.

Chạy lại:

```sh
node --import tsx scripts/verify-r2-flow.ts --self-test
node --import tsx scripts/verify-r2-flow.ts --run
node --import tsx scripts/verify-r2-browser.ts --run
# Mở http://localhost:3000, bấm Run synthetic tests.
```

Cần credentials server hiện có trong `.env`. Không log bearer token, presigned URL, secret hoặc nội dung CV. Chỉ tạo tài khoản và nội dung synthetic. Browser harness tự cleanup sau khi nhận kết quả hoặc hết 10 phút; không để tiến trình bị kill giữa lượt vì cần cleanup fixture.

## Giới hạn trước rollout

- Chưa chạy UI React/Vercel preview với R2 bật, chưa kiểm PDF scan/OCR hoặc DOCX qua Gemini, chưa đo nhiều lượt/traffic thật. PDF nhỏ trong test này chủ động đi storage để kiểm reference, không đại diện quyết định inline của frontend.
- CORS browser mới xác nhận origin localhost:3000; không thay thế kiểm chứng CSP/CORS từ domain preview/production.
- R2 token không có quyền GetBucketCors/GetBucketLifecycleConfiguration: preflight trả AccessDenied ở hai mục cấu hình. Không coi đây là lỗi đọc/ghi object. Private temp đã xác minh Dashboard từ bước trước; không suy ra policy bucket chỉ từ GET của object đã xoá.
- Retry/crash scheduler dựa trên regression tests và bằng chứng quan sát trước đó; không inject outage lên hạ tầng production. Chưa test thực tế late PUT sau finalize hoặc signed URL hết hạn.
- Baseline Supabase file lớn trước đó timeout, nên chưa có đối chứng latency/error đủ mẫu để chốt ngưỡng canary.

Kết quả này đủ để tiếp tục nghiệm thu staging/preview R2 `temp`. Chưa mở toàn bộ `saved,candidate` production hoặc migrate dữ liệu cũ.
