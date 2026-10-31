# Tiến độ rollout R2 — 26/10/2026

**Trạng thái hiện tại (chốt 19:46 ICT ngày 27/10):** production vẫn dùng R2 chỉ cho `temp`, đúng deployment đã nghiệm thu. Đã đủ hơn 24 giờ kể từ mốc 19:01:31 ICT ngày 26/10; không phát hiện lệch cấu hình hoặc lỗi cleanup trong các snapshot đã thu. Queue hiện rỗng. 200 thao tác synthetic đã đạt nhưng chưa thay thế p95/error-rate traffic thật hoặc bằng chứng HTTP liên tục 24 giờ. `saved/candidate` vẫn Supabase, chưa migrate CV cũ. Xem mục chốt 24 giờ cuối tài liệu; các phần trước là lịch sử.

## Bước 1: đo lại baseline — chưa đạt

Chạy lại script hiện có, không sửa mã ứng dụng hoặc cấu hình production:

```sh
node --import tsx scripts/storage-baseline.ts --self-test
node --import tsx scripts/storage-baseline.ts --run
```

Self-test đạt. Lượt đo bắt đầu 15:22:05 ICT; report local (Git ignored): `.r2-migration/baseline/535865d0-5b58-40cd-9de3-eca9560341f6/report.json`.

| Fixture / operation | Thành công | Lỗi | p95 |
| --- | ---: | ---: | ---: |
| PNG 90 byte / upload | 30 | 0 | 1324,7 ms |
| PNG 90 byte / download | 30 | 0 | 1625,6 ms |
| PNG 90 byte / delete | 30 | 0 | 2491,8 ms |
| PNG 3.151.914 byte / upload | 0 | 1 | Không có mẫu thành công |

Upload file lớn thất bại sau 60005,9 ms, `StorageUnknownError`, trùng triệu chứng lần đo 25/10. Script dừng theo thiết kế; nhóm PNG gần 15 MiB và PDF chưa chạy. Không suy ra tỷ lệ lỗi traffic production từ một lượt synthetic. Chưa phân biệt nguyên nhân mạng máy đo, tuyến kết nối hoặc dịch vụ đích. Cần đo từ đường truyền/môi trường khác trước khi chốt baseline. `cleanupOk=true`: đã kiểm tra prefix rỗng và xoá tài khoản fixture.

## Kiểm tra scheduler chỉ đọc

Trong lượt kiểm tra trước baseline, job `storage-cleanup` active; đủ hai secret Vault. Quyền execute của anon/authenticated bị chặn theo assertions hiện có.

- 96 cron run trong cửa sổ 24 giờ, không có lượt khác `succeeded`.
- 24 HTTP response còn lưu trong cửa sổ 6 giờ, không có status khác 200 hoặc timeout.
- 5 response gần nhất tương ứng các mốc 14:15–15:15 ICT, đều 200.
- Queue có 4 job; không có job `attempts > 0` hoặc `not_before` quá hạn hơn 1 giờ tại lúc đọc. Đây là snapshot trước khi baseline tạo fixture mới.

Thống kê HTTP lấy toàn bộ `net._http_response`, chưa liên kết request ID riêng cho cleanup; không khẳng định mọi lượt cleanup trong 24 giờ đều được chứng minh HTTP 200.

## Trạng thái và bước kế tiếp

Đọc live `https://cvfit.pro/api/config` xác nhận `storageWriteProvider=supabase`, `storageR2Purposes=[temp]`. Không thay cấu hình, deploy hoặc migrate CV thật.

1. Đổi đường truyền/môi trường máy đo, hoàn tất baseline file lớn và đối chứng R2 cùng điều kiện.
2. Chốt tiêu chí canary sau khi đủ mẫu; kiểm tra scheduler lại sát thời điểm rollout.
3. Bật production chỉ `temp`, nghiệm thu và theo dõi tối thiểu 24 giờ/đủ mẫu trước khi mở `saved`, rồi `candidate`.
4. Migrate CV cũ sau khi rollout ổn định; giữ nguồn Supabase qua cửa sổ rollback.

Chỉ thêm báo cáo Markdown; không chạy lại lint/build vì không đổi code. `git diff --check` được dùng để kiểm tra whitespace.

## Đo lại sau khi người dùng đổi mạng — 15:28–16:51 ICT

Kết quả mới thay thế nhận định file 3 MiB luôn timeout trên máy đo; chưa thay thế điều kiện cần nghiệm thu file lớn trước rollout.

### Supabase: đủ mẫu, kết quả FAIL do một lỗi download

Lượt `8c71221c-5fcd-4ee8-b124-247cc85b0bfa` chạy từ 15:28:43 đến 16:38:23 ICT. Đủ 360 thao tác, 359 thành công; script exit 1 theo assertion cuối. `cleanupOk=true`, tài khoản và prefix fixture đã dọn.

| Fixture | Upload thành công | Download thành công | Xoá thành công | Upload p95 | Download p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| PNG 90 byte | 30/30 | 30/30 | 30/30 | 0,523 s | 1,314 s |
| PNG 3.151.914 byte | 30/30 | 30/30 | 30/30 | 20,794 s | 15,181 s |
| PNG 14.545.753 byte | 30/30 | 29/30 | 30/30 | 42,885 s | 68,881 s |
| PDF 3.146.349 byte | 30/30 | 30/30 | 30/30 | 9,533 s | 10,394 s |

Lỗi duy nhất ở sample index 229: download PNG lớn trả `TypeError` sau 6953,9 ms. Script chỉ lưu tên lỗi, chưa đủ chứng minh nguyên nhân sâu hơn; không suy ra lỗi hash. Tất cả download thành công đều khớp SHA-256. p95 chỉ tính lượt thành công; nhóm download file lớn có tỷ lệ lỗi synthetic 1/30 (3,33%), không đại diện traffic production.

Log console chỉ ghi tiến độ mỗi 5 vòng, không ghi riêng download lỗi; vì vậy không dùng mốc “Round” làm bằng chứng mọi thao tác đạt. Báo cáo và samples local: `.r2-migration/baseline/8c71221c-5fcd-4ee8-b124-247cc85b0bfa/`.

### R2: đo đối chứng, dừng sớm sau lỗi đọc file lớn

Đã sinh `.r2-migration/storage-baseline-r2.ts` từ bộ đo hiện có, chỉ thay transport bằng presigned PUT và các helper `readObject`, `removeObject`, `listObjects`. Không sửa source ứng dụng hoặc runtime env. Giữ generator fixture, 30 vòng, cách tính p95, SHA-256 và kiểm tra cleanup. PNG sinh ngẫu nhiên lại: cùng loại/kích thước, không cùng byte giữa hai provider. Self-test và kiểm tra TypeScript standalone đạt; script nằm trong thư mục Git ignored.

Lượt `48b684f4-2bc9-4dc9-b1b6-9df4a4a897fb` bắt đầu 16:38:41 ICT. Hai nhóm đầu đủ 30 vòng và không lỗi:

| Fixture | Upload p95 | Backend read p95 | Xoá p95 |
| --- | ---: | ---: | ---: |
| PNG 90 byte | 1,256 s | 1,230 s | 0,361 s |
| PNG 3.151.914 byte | 9,560 s | 11,607 s | 0,449 s |

Vòng đầu PNG 14.545.753 byte: upload 38,602 s thành công; backend read thất bại sau 45,294 s (`Error`); xoá thành công. Thời điểm lỗi phù hợp timeout 45000 ms của `_server-lib/storage/r2.ts`, nhưng tên lỗi được lưu chưa đủ xác nhận cause cụ thể. Không tăng timeout hoặc sửa code production để làm phép đo đạt.

Dừng đúng tiến trình benchmark sau khi phát hiện lỗi; lượt kế tiếp đang chạy không được ghi nhận thành một vòng hoàn chỉnh. Báo cáo `complete=false`, không gọi là PASS hoặc bộ baseline đầy đủ; nhóm PDF chưa chạy. Cleanup riêng fixture xác minh owner synthetic, xoá object trong đúng prefix, chờ 20 giây rồi quét lại để bắt object của request đang chạy; prefix rỗng, tài khoản đã xoá, `cleanupOk=true`. Hoàn tất cleanup lúc 16:51:08 ICT. Báo cáo/samples: `.r2-migration/baseline-r2/48b684f4-2bc9-4dc9-b1b6-9df4a4a897fb/`.

### Kết luận cho bước tiếp theo

- Mạng mới giải quyết triệu chứng upload 3 MiB timeout ở các lượt trước, nhưng chưa chứng minh nguyên nhân của mạng cũ.
- Đã có đối chứng 3 MiB: R2 đạt đủ 30 vòng, p95 upload/download thấp hơn Supabase trong hai lượt nối tiếp này. Control 90 byte R2 upload chậm hơn; control là phép đo storage tổng hợp, app thường đi inline ở kích thước này.
- File gần 15 MiB chưa đạt: Supabase có một lỗi download; R2 backend read gặp lỗi gần deadline 45 giây. Chưa đủ điều kiện bật R2 production.
- Backend read trong phép đo chạy trên máy local qua đường truyền mới, không phải Vercel. Supabase SDK GET và R2 HEAD+GET cũng khác đường xử lý. Không suy ra backend Vercel có cùng latency hoặc tăng timeout production chỉ từ phép đo local.
- Bước tiếp theo là đo backend read trên môi trường gần deployment (preview/CI/máy chủ có kết nối ổn định), tách khỏi PUT/GET browser và thu đủ mẫu file lớn. Cần kiểm tra nguyên nhân lỗi bằng metadata lỗi an toàn nếu lặp lại; không log token, signed URL hoặc nội dung CV.
- Chưa deploy, bật canary, migrate CV cũ hoặc xoá bản nguồn. Không sửa mã ứng dụng. Không chạy lại full lint/build; bộ đo R2 generated đã qua self-test và TypeScript standalone.

## Kiểm tra bổ sung trên Vercel và chặng PUT

Đã truy cập preview cũ qua `vercel curl`, dùng protection bypass của CLI chính thức, không đổi protection/CORS. Bộ đo local `.r2-migration/verify-preview-large.ts` tạo PNG 14.545.753 byte, upload seed một lần, mỗi vòng reserve qua API preview rồi copy seed sang staging trong R2 và gọi finalize thực tế. Nhờ vậy phần backend read chạy trên Vercel, không chạy qua đường truyền local như GET trước đó.

- Preview `cv-compare-9hn4n7e7t-nghiepnguyens.vercel.app`: 30/30 finalize HTTP 200, p95 **5160,148 ms**, final object có size/ETag khớp seed, đã xoá từng file và teardown user/prefix. Report: `.r2-migration/preview-large/f1a0e613-e809-4074-bd35-5553e1b0574a/report.json`.
- Phạm vi là copy + HEAD/GET + kiểm tra PNG + publish metadata trong finalize, có thời gian HTTP local tới preview; không phải PUT browser, AI hoặc SHA-256 download. Không gọi đây là full-flow latency.
- Bộ PUT riêng 60 giây dừng ở lượt 8: 7 thành công, 1 `TimeoutError` sau 60010,3 ms; fixture đã dọn. Report `.r2-migration/upload-r2/c282e67f-7747-4108-8dfb-b4ce103514a7/report.json`.
- Đối chiếu source `src/services/storageClient.ts`: ứng dụng không đặt deadline 60 giây cho PUT; đó là giới hạn harness. Chạy 3 lượt chẩn đoán với ceiling 180 giây: cả 3 thành công, p95 2726,2 ms, cleanup đạt. Không đổi timeout production; không suy ra ceiling dài hơn đã chữa lỗi vì cả 3 lượt đều hoàn tất dưới 3 giây. Report `.r2-migration/put-client-policy/48d5985a-70f0-4548-adc8-fa3ad2372f29/report.json`.

Tốc độ quan sát đổi mạnh giữa các lượt. Đo Supabase lại ở thời điểm mới: control 30 vòng đạt, upload 3 MiB đầu tiên vẫn timeout; cleanup đạt. Report `.r2-migration/baseline/f8020fdd-d823-4474-ac9c-697723a3e862/report.json`. Chưa phân biệt chắc nguyên nhân mạng/route/dịch vụ; không tuyên bố cải thiện latency tương đối từ các lượt khác điều kiện.

### Bộ R2 đầy đủ ở điều kiện mới

Lượt `223e12f8-cb4e-463e-9544-5124eac67448` đủ 360 thao tác, 359 thành công. Script strict vẫn exit 1: PNG 3 MiB có một GET local lỗi `Error` sau 45136,4 ms. Không sửa hoặc xoá kết quả này để gọi bộ đo PASS. Tất cả download thành công đều khớp SHA-256; không ghi nhận mismatch. Fixture đã dọn (`cleanupOk=true`).

| Fixture | Upload đạt | Download đạt | Xoá đạt | PUT p95 | Backend GET local p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| PNG 90 byte | 30/30 | 30/30 | 30/30 | 1,183 s | 0,736 s |
| PNG 3 MiB | 30/30 | 29/30 | 30/30 | 1,390 s | 2,989 s |
| PNG ~13,9 MiB | 30/30 | 30/30 | 30/30 | 2,262 s | 5,030 s |
| PDF ~3 MiB | 30/30 | 30/30 | 30/30 | 0,905 s | 2,014 s |

Tỷ lệ lỗi controlled của cả bộ là 1/360 (0,278%); riêng download là 1/120 (0,833%). Nhóm PNG 3 MiB download là 1/30; không che khuất nhóm lỗi bằng số tổng, cũng không coi đây là tỷ lệ lỗi traffic production. Đây là giới hạn cần tiếp tục theo dõi. File lớn nay đủ 30 vòng R2 thành công và backend deployment có bằng chứng độc lập, nên quyết định chỉ mở canary `temp`, không mở `saved/candidate` hoặc tuyên bố nghiệm thu toàn bộ R2.

## Canary production đã bật

- Source: Git archive sạch commit `80682047ea549e45d7078033d1aba77c119bb858`; không mang `.env`, file local, harness hoặc thay đổi chưa commit vào deployment. Bundle JS khớp bản production trước đó; chỉ runtime storage override đổi.
- Deployment: `dpl_53MC2Xh7ETcZhjsm5i7u3K3Bc6hg`, URL `https://cv-compare-a2r27dryi-nghiepnguyens.vercel.app`, đúng project `cv-compare-tn`, 9 serverless functions ở `sin1`.
- Runtime override: `STORAGE_WRITE_PROVIDER=r2`, `STORAGE_R2_PURPOSES=temp`. Env chung project vẫn như trước; deployment tương lai phải giữ đúng mục đích canary hoặc được kiểm tra lại. Không coi việc canary đang bật là đã đổi default env lâu dài.
- Tạo bằng `--prod --skip-domain`, nghiệm thu trước promote: 3/3 finalize PNG gần 15 MiB đạt, saved/candidate upload R2 đều bị chặn 409, cleanup đạt. Report `.r2-migration/canary-smoke/124f47a5-a7b3-4055-921e-bdd4dba85724/report.json`.
- Đã kiểm CORS OPTIONS PUT từ `https://cvfit.pro` và `https://www.cvfit.pro`: 204, Allowed-Origin khớp. Không đổi CORS/lifecycle hoặc bật public bucket.
- Scheduler ngay trước promote active, đủ Vault secrets, 5 HTTP gần nhất 200/không timeout. Trước đó snapshot 24 giờ có 96 cron succeeded và 24 response/6 giờ đều 200; không nâng bằng chứng này thành attribution HTTP đầy đủ cho mọi lượt cleanup.
- Đã promote canary; live `https://cvfit.pro/api/config` xác nhận `r2`, purposes `[temp]`, mốc xác minh **2026-10-26T12:01:31Z / 19:01:31 ICT**. `saved/candidate` và dữ liệu CV cũ tiếp tục theo provider Supabase. Không copy/migrate hoặc xoá nguồn.
- Rollback sẵn: deployment cũ `dpl_4xaxkLMiaUR1wkMzuenc3WkjDhyf`, URL `https://cv-compare-5sbybuje3-nghiepnguyens.vercel.app`. Nếu cần, promote lại đúng deployment cũ và xác minh `/api/config` trả Supabase; code vẫn phải tiếp tục đọc reference R2 và giữ scheduler. Không drop schema hoặc đổi provider metadata để rollback.

### Kiểm chứng live production

Harness local `.r2-migration/verify-production-canary.ts`: 50 vòng qua `https://cvfit.pro`, PNG tổng hợp 3.151.914 byte, mỗi vòng reserve → presigned PUT → finalize → delete-temp. **200/200 thao tác controlled đạt**, kiểm thêm auth 401, saved/candidate R2 409, CORS preflight/response, PUT MD5 ETag và ETag/size của bản final, registry deleted. Kiểm MD5/ETag ở đây không được gọi là SHA-256 download.

- PUT p95: **1040,187 ms**; finalize p95: **2200,770 ms**.
- Đã dọn prefix của user synthetic và staging, xoá tài khoản, `cleanupOk=true`. Job delayed/tombstone do trigger vẫn để scheduler xử lý theo thiết kế; không gọi cleanup global thủ công hoặc xoá queue người dùng khác.
- Report `.r2-migration/production-canary/4dc96a53-05e3-4ed0-8310-4dc4b25345c0/report.json`.
- Đây là kiểm chứng API/transport có kiểm soát, không phải traffic thật, phân phối lỗi người dùng, full React UI hoặc thời gian Gemini. Không dùng 200 thao tác này để khẳng định SLA hoặc p95 AI.
- Raw HTML live edge `/vi/privacy/` HTTP 200 sau promote; kiểm nội dung riêng, không dựa vào `dist/`.

### Quan sát và bước kế tiếp

Canary cần ít nhất đến **19:01:31 ICT ngày 27/10/2026**, chưa được rút ngắn vì synthetic test đạt. Heartbeat `theo-d-i-canary-r2-temp` kiểm tra mỗi giờ trong chat, giữ yên lặng nếu không đổi; báo khi có lỗi/cần xử lý hoặc đủ cửa sổ quan sát. Chỉ đọc config/deployment, cron/HTTP/queue và số liệu lỗi đáng tin; không tự mở saved/candidate, migrate hay đổi env. Sau 24 giờ, đánh giá điều kiện còn thiếu, không mặc định đủ p95/error-rate traffic khi không có dữ liệu.

Trước bước mở `saved`, cần xác nhận canary ổn định và đối chiếu đúng đường signed GET/browser cho luồng lưu CV; sau đó mới tới `candidate`. Giữ nguồn Supabase qua cửa sổ rollback khi copy CV cũ, không tự xoá nguồn. Nếu deployment/config đổi trong cửa sổ quan sát, kiểm tra lại và không coi cửa sổ cũ tự động còn hợp lệ.

Validation trước promote: `npm run lint`, `npm run lint:api`, 22 test files / **178 tests**, `npm run build` đạt. Build đầu bị sandbox chặn IPC của tsx, chạy lại ngoài sandbox đạt cả static pages. Các harness generated ở Git ignored đã qua self-test/TypeScript standalone. Không thêm dependency, migration hoặc API handler.

Ghi chú vận hành: `.vercel/project.json` workspace gốc chỉ có settings, không có projectId/orgId. Copy nó sang thư mục tạm khiến CLI auto-link project mới tên `project`; deployment và project tạo nhầm đã được xoá sau khi xác minh vừa phát sinh trong lượt này. Thư mục canary sau đó được link rõ bằng project ID `prj_9ojmBXjiHRDi56zHS2uvYvJABOaI`, scope `nghiepnguyens`, kiểm ID trước deploy. Không dùng auto-detect project từ tên thư mục `project` trong các bước tiếp theo.

Xác minh cuối lúc **19:10:18 ICT**: domain `cvfit.pro` trỏ đúng canary trên, config `r2/[temp]`, đúng 9 functions. Snapshot cleanup có 167 job queued (bao gồm delayed fixture jobs), **0 retry, 0 job quá hạn hơn 1 giờ, 0 cron lỗi/24 giờ và 0 HTTP lỗi/6 giờ**. Không diễn giải queue khác 0 thành object còn sót; từng prefix fixture đã được xác minh rỗng. `git diff --check` đạt sau cập nhật tài liệu.

## Chốt cửa sổ quan sát — 27/10/2026, 19:46 ICT

Snapshot thực tế `2026-10-27T12:46:21.710Z`, sau mốc canary **24 giờ 44 phút 50 giây**. Heartbeat được kích hoạt từ 05:23Z nhưng bước kiểm tra chạy muộn; dùng `checkedAt` thực tế, không dùng giờ trigger làm giờ quan sát. Một lần duyệt quyền tự động timeout, lần thử lại được thực hiện thành công; không có thay đổi production trong quá trình này.

Đạt trong phạm vi bằng chứng:

- `https://cvfit.pro/api/config` HTTP 200, `r2/[temp]`; deployment vẫn `dpl_53MC2Xh7ETcZhjsm5i7u3K3Bc6hg`, READY ở các snapshot đã thu.
- Scheduler active; snapshot cuối có **96 cron run/24 giờ gần nhất, 0 run lỗi**; **24 HTTP response/6 giờ gần nhất, 0 non-200/timeout**.
- Queue **0**, retry **0**, job quá hạn hơn một giờ **0**. Các snapshot trung gian ghi nhận queue giảm từ 167 xuống 85, rồi 83 và nay rỗng; không coi queue delayed trước đó là lỗi.
- Bằng chứng 50 vòng/200 thao tác production synthetic và teardown trước đó vẫn giữ nguyên, không chạy lại phép đo tạo dữ liệu trong heartbeat.

Giới hạn và điều kiện còn thiếu:

- Có khoảng hở giữa các lần thực thi lớn hơn retention HTTP khoảng 6 giờ. Snapshot lưu theo `checkedAt`, không có đủ HTTP metadata để chứng minh mọi lượt trong 24 giờ; cũng chưa có request-id attribution riêng của cleanup. Không dùng cron `succeeded` thay cho HTTP 200.
- Chưa có p95 hoặc tỷ lệ lỗi storage/AI traffic thật đủ tin cậy. Query count registry từ mốc canary trả 50 record `deleted`; con số này không chứng minh số người dùng, lượng traffic hay error rate, và không quy record pending/abandoned thành lỗi. Không tìm thấy bảng tên `public.analysis_logs` qua schema metadata trong lần kiểm tra; không suy ra không có lỗi AI từ việc đó.
- Bộ raw R2 local trước đó vẫn có một GET timeout; không xoá hoặc đổi kết quả strict FAIL thành PASS.
- Trước khi mở `saved`, còn phải đối chiếu signed GET/browser của luồng lưu CV và đánh giá đủ mẫu hiệu năng/lỗi; sau đó mới tới `candidate`. Chưa tự mở thêm purpose, promote, đổi env, migrate hoặc xoá nguồn CV.

Đã hoàn tất mục đích heartbeat quan sát 24 giờ; dừng lịch `theo-d-i-canary-r2-temp` sau báo cáo chốt để tránh thông báo lặp. Không coi việc dừng lịch theo dõi là tắt `pg_cron` cleanup của ứng dụng.

Snapshot cuối: `.r2-migration/observations/2026-10-27T12-46-21-health.json`. Các snapshot trước trong cùng thư mục; không chứa token, signed URL, CV hoặc PII. Báo cáo chỉ chốt khoảng quan sát và sức khoẻ tại các mốc đã đọc, không tuyên bố nghiệm thu đầy đủ toàn bộ R2.
