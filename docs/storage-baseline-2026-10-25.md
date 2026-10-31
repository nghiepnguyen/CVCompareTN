# Baseline Supabase Storage — 25/10/2026

## Phạm vi và cách chạy

Bộ đo: `scripts/storage-baseline.ts`. Không thêm dependency hoặc thay đổi luồng ứng dụng. Dùng tài khoản Auth tổng hợp có email `@example.invalid`, không gửi email, không dùng CV thật. Upload bằng authenticated client theo cấu hình `cvService.uploadTempAnalysisFile` (cacheControl 3600, không upsert), download/delete bằng service-role như backend xử lý file tạm. Mỗi download phải khớp SHA-256 nguồn. Sau chạy kiểm tra prefix rỗng và xoá tài khoản fixture.

```sh
node --import tsx scripts/storage-baseline.ts --self-test
node --import tsx scripts/storage-baseline.ts --run
```

Cần cấu hình Supabase public URL/anon key và server service-role key trong `.env`. Không đưa key vào lệnh hoặc báo cáo. Kết quả từng lượt và summary được lưu trong `.r2-migration/baseline/<run UUID>/` (Git ignored). `fixture-user.json` chỉ dùng khôi phục cleanup nếu tiến trình bị ngắt.

Chạy tuần tự 30 lượt mỗi fixture, không có warm-up hoặc retry ứng dụng. Fixture gồm PNG control 1 pixel, PNG nhiễu ~3 MiB, PNG nhiễu ~13,9 MiB, PDF text tổng hợp ~3 MiB. PDF có padding để kiểm tra nhánh storage, không đại diện nội dung CV thực tế. Control nhỏ vẫn được upload để đo storage riêng; ứng dụng bình thường đi inline với file ≤2 MiB. Không tính thời gian sinh fixture hoặc tạo/login user vào latency storage. p50/p95 dùng nearest-rank trên lượt thành công; tỷ lệ lỗi = số lượt lỗi / số lượt thử của từng operation. Không có lượt thành công thì percentile là null. Dừng ngay sau upload lỗi, ghi báo cáo phần đã chạy và cleanup; exit code khác 0 là kết quả FAIL, không phải PASS một bộ đo bị bỏ dở.

## Kết quả và giới hạn

Control PNG 1 pixel hoàn tất 30 vòng; SHA-256 của 30 download đều khớp. Đơn vị latency: ms.

| Operation | Lượt thành công | Lỗi | p50 | p95 |
| --- | ---: | ---: | ---: | ---: |
| upload | 30 | 0 | 560.9 | 1046.8 |
| download | 30 | 0 | 781.5 | 1975.2 |
| delete | 30 | 0 | 705.8 | 2338.0 |

0/30 lỗi mỗi operation chỉ là smoke test; không chứng minh tỷ lệ lỗi ≤1%. Dữ liệu từng lượt: `.r2-migration/baseline/34dfcb57-17b2-4730-a76e-afd01e2392c2/samples.json`.

Lượt cuối (`34dfcb57-17b2-4730-a76e-afd01e2392c2`) dừng FAIL sau khi upload PNG 3.151.914 byte timeout 60 giây. PNG lớn và PDF chưa chạy do fail-fast. Báo cáo JSON nằm cùng thư mục samples, `cleanupOk=true`. Các lượt kiểm tra trước cũng gặp timeout upload 3 MiB sau 60 giây; backend probe 90 byte thành công nhưng 3 MiB timeout sau 15 giây. Curl đối chiếu cũng timeout sau 20 giây khi gửi được 1.113.409 byte, không nhận HTTP response. Điều này cho thấy vấn đề không chỉ nằm ở đường gọi SDK; chưa phân biệt được mạng máy đo, tuyến mạng hay dịch vụ đích. Không suy diễn các lỗi synthetic thành tỷ lệ lỗi traffic production.

Không đo browser/CORS, mạng di động, PDF scan/OCR, parse/rewrite/analyze Gemini, signed URL kho CV, R2 hoặc toàn bộ flow UI. Chưa đủ cơ sở chốt Phase 1 hoặc bật canary từ bộ đo này.

## Ngưỡng canary đề xuất, chưa nghiệm thu

Chỉ đóng băng các ngưỡng này sau khi có baseline file lớn thành công trên cùng bộ fixture, môi trường và cách đo:

- Upload/download p95 từng nhóm kích thước: `canary <= baseline + max(baseline * 20%, 300 ms)`; không dùng control 1 pixel thay baseline file lớn.
- Tỷ lệ lỗi storage: ≤1% và tăng không quá 0,5 điểm phần trăm so với baseline; cần tối thiểu 200 thao tác và 24 giờ quan sát, kéo dài nếu thiếu mẫu. Các mức này là tiêu chí vận hành, không chứng minh thống kê SLA từ vài chục mẫu.
- Không chấp nhận bất kỳ sai SHA-256, mất file hay truy cập chéo user. Dừng ngay khi phát hiện.
- Cleanup không timeout/non-200; không có job retry quá 1 giờ.
- Tổng flow AI p95 không tăng quá 10% chỉ được áp dụng khi có baseline AI riêng, tách biến động Gemini khỏi storage.

Bước cần làm tiếp: chạy lại từ đường truyền ổn định để hoàn tất đủ mẫu file >2 MiB, rồi bổ sung PDF scan và baseline flow AI/browser trước khi nghiệm thu canary toàn luồng.

## Validation

- Self-test: percentile nearest-rank, mẫu lỗi/không có mẫu, giới hạn kích thước và trích xuất PDF synthetic: pass.
- `npm run lint`, `npm run lint:api`: pass.
- Regression `src/__tests__/hooks/useFileProcessor.test.ts`: 7/7 pass.
- `git diff --check`: pass.
- `npm audit --audit-level=high`: không đạt; 27 advisory (4 moderate, 19 high, 4 critical) trong dependency hiện có. Không thêm hoặc nâng dependency trong thay đổi này; xử lý advisory ngoài phạm vi bộ đo.

Sau lượt cuối, kiểm tra production chỉ lấy count xác nhận tài khoản synthetic và object fixture đều còn 0. Không thay đổi provider hoặc bật R2.
