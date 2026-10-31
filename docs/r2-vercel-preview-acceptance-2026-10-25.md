# Nghiệm thu UI R2 trên Vercel preview — 25–26/10/2026

Trạng thái: nghiệm thu chức năng UI đạt trong phạm vi dưới đây; cleanup tự động và teardown đã xác minh. Chưa đủ điều kiện mở toàn bộ R2 production: baseline file lớn và canary còn thiếu.

## Môi trường

- Preview: https://cv-compare-9hn4n7e7t-nghiepnguyens.vercel.app
- Deployment: `dpl_6p5gYtRx7hVD8U1KVEAZaDhTbkTV`, target preview, Git archive sạch của commit `80682047ea549e45d7078033d1aba77c119bb858`.
- Runtime chỉ riêng deployment: `STORAGE_WRITE_PROVIDER=r2`, `STORAGE_R2_PURPOSES=temp,saved,candidate`. Không sửa production env hoặc promote deployment.
- Supabase/R2/Gemini thật; user recruiter và toàn bộ CV/JD/campaign đều synthetic. Dùng Chrome qua UI ứng dụng React thật, không gọi handler local để thay cho các ca nghiệm thu UI.
- Người dùng đã cho phép thêm tạm origin preview vào CORS của hai bucket và gỡ sau test. GET/PUT/HEAD, Content-Type, expose ETag; không bật public access hoặc custom domain.

## Bằng chứng đã thu thập

| Ca | Kết quả quan sát |
| --- | --- |
| Đăng nhập email/password synthetic | Đạt |
| PDF text | UI có kết quả phân tích (95 ATS), thông tin CV đã parse, CV tối ưu |
| PDF scan 4.783.764 byte | Batch trả kết quả 95 ATS; tab parse và rewrite có dữ liệu synthetic đúng |
| PNG 5.763.517 byte | Batch trả kết quả 92 ATS; tab parse và rewrite có dữ liệu synthetic đúng |
| DOCX | Batch trả kết quả 88 ATS; tab parse và rewrite có dữ liệu synthetic đúng |
| Lưu CV từ UI | `synthetic-text.pdf` hiện “Đã lưu”; metadata `storage_provider=r2`, `storage_status=ready` |
| Kho CV → Sử dụng | File đã tải xong, không còn trạng thái “Đang tải” |
| Reload trang | Phiên đăng nhập vẫn hoạt động; đã tiếp tục phân tích batch sau reload |
| Temp reference / cleanup sau batch | Registry có PNG và PDF scan, purpose=temp, status=deleted; PDF text/DOCX nhỏ đi inline như thiết kế |
| Tạo campaign từ UI | Campaign synthetic đã tạo và mở được |
| Upload/phân tích ứng viên | Đạt: PDF/DOCX qua UI, metadata R2 ready → done, UI “2 CV · 2 đã phân tích”, điểm 92/95; mở được chi tiết |
| Xoá một ứng viên | Đạt: DOCX biến mất khỏi danh sách, HEAD R2 xác nhận object đã xoá |
| Xoá campaign còn một ứng viên | Đạt: UI về 0 campaign; metadata campaign/candidate rỗng; object PDF được cleanup tự động, HEAD 404 và queue rỗng lúc 07:40:24 ICT ngày 26/10 |
| Đọc CV Supabase cũ khi preview bật R2 | Đạt: fixture legacy provider=supabase được chọn qua Kho CV → Sử dụng, tải hoàn tất |
| Xoá CV đã lưu qua UI | Đạt; kho CV hiện “Chưa có CV nào được lưu”, có ảnh saved-cv-deleted.jpg |

Điểm ATS chỉ chứng minh ứng dụng đã render kết quả AI, không phải tiêu chí chất lượng nội dung hoặc số đo hiệu năng. Mỗi định dạng mới một lượt; chưa chứng minh p95/tỷ lệ lỗi canary.

## Artifact cục bộ

`.r2-migration/preview/` (Git ignored) chứa ảnh `pdf-text-analysis.jpg`, `saved-cv-reused.jpg`, `batch-three-formats.jpg`, `scan-rewrite.jpg`; snapshot AX parse/rewrite của scan/PNG/DOCX; `metadata-after-batch.json`; fixture chỉ có nội dung synthetic.

## Hạn chế/ghi chú

- Ban đầu extension Chrome thiếu quyền file URL. Đã dùng native picker để upload; sau đó người dùng chọn bật quyền file URL để tiếp tục phần ứng viên. Đây là trở ngại tooling, không đánh dấu thành lỗi R2.
- Preview có cảnh báo kết nối reCAPTCHA. Authenticated analyze/parse/rewrite vẫn hoàn tất; chưa nghiệm thu feedback/reCAPTCHA trên domain preview.
- Chưa sửa mã production. Preview build đạt, giữ nguyên các advisory dependency đã ghi ở báo cáo trước.
- CORS cả `cvfit-cv` và `cvfit-temp` đã hoàn nguyên và đối chiếu trên Dashboard: chỉ còn `https://cvfit.pro`, `https://www.cvfit.pro`, `http://localhost:3000`, `http://localhost:5173`. Bucket vẫn private.
- Tài khoản synthetic, fixture legacy Supabase và object thử đã dọn; credentials local đã xoá. `cleanup.json` ghi hoàn tất lúc 12:52:13 ICT ngày 26/10/2026, `userRemoved=true`, `prefixesEmpty=true`, 5 object còn lại được teardown xoá.

## Lần hoàn tất ngày 26/10/2026

- Đã tiếp tục qua native picker sau khi Mac mở khóa; extension vẫn báo thiếu file URL dù người dùng xác nhận đã bật. Hai file ứng viên được chọn trực tiếp trong hộp chọn file Chrome.
- `candidate-evidence-completed.json` xác nhận 2 candidate dùng R2/ready/done và tổng 14 AI log success cho user synthetic (4 analyze + 4 parse + 4 rewrite ở luồng cá nhân, thêm 2 analyze ở tuyển dụng).
- `candidate-evidence-after-delete.json` xác nhận campaign/candidate đều rỗng sau thao tác UI.
- `cascade-before-cron.json`: object DOCX đã mất sau xoá riêng; object PDF còn tồn tại sau xoá campaign và có job cleanup attempts=0. Quan sát read-only trong `cascade-observation.json`: lúc 07:39:23 ICT PDF còn tồn tại, lúc 07:40:24 ICT cả hai object đều HEAD 404 và jobs rỗng. Không chạy cleanup global thủ công hoặc teardown trước khi quan sát object biến mất. Bằng chứng xác nhận cleanup tự động, chưa liên kết riêng nguồn gọi pg_cron hay scheduler GitHub dự phòng.
- Ảnh bổ sung: `candidates-analyzed.jpg`, `candidate-deleted.jpg`, `campaign-deleted.jpg`, `cors-cv-restored.jpg`, `cors-temp-restored.jpg`, `legacy-cv-reused.jpg`.
- Quan sát UX: số đếm CV trên header/card campaign giữ giá trị cũ ngay sau xoá một ứng viên trong khi danh sách đã cập nhật. Metadata xoá đúng; đây là tình trạng cache UI, không chứng minh mất dữ liệu R2. Chưa sửa ngoài phạm vi nghiệm thu.

## Kết luận và giới hạn rollout

- Đạt nghiệm thu chức năng trên preview: bốn định dạng, analyze/parse/rewrite, lưu/đọc/xoá CV, upload/phân tích/xoá ứng viên, cascade cleanup và đọc legacy Supabase.
- Production kiểm tra `/api/config` trả HTTP 200, `storageWriteProvider=supabase`, `storageR2Purposes=[temp]`. Không bật R2 production, không promote preview, không migrate CV thật.
- Chưa có baseline file >2 MiB đáng tin cậy hoặc mẫu đủ để chốt p95/tỷ lệ lỗi; chưa chạy canary/soak production. Cửa sổ scheduler trước đó có thiếu HTTP metadata và chưa liên kết request-id riêng cleanup, nên không tuyên bố mọi lượt 24 giờ đều được chứng minh HTTP 200.
- Preview build và 22 regression storage/API đã pass ở bước trước; lần chốt này chỉ cập nhật Markdown, kiểm tra `git diff --check`, không chạy lại lint/build.
- Preview được giữ để đối chiếu; origin đã gỡ khỏi CORS nên cần cấp lại tạm nếu chạy upload UI lần nữa.
