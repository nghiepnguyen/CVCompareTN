# Parsed CV load latency — audit

Ngày: 2026-10-29. **AUDIT ONLY — không thay đổi production code.**
Phạm vi: luồng tạo / lưu / hiển thị Parsed CV (tab Parsed CV), không liên quan
probability migration Stage 3.13C.

Kết luận: **C — REQUEST WATERFALL** là bottleneck chính. Parse là **eager
background**, nhưng chỉ bắt đầu **sau khi analyze xong** (và sau khi cả batch
analyze xong), dù `/api/parse-cv` từ Stage 3.10B chỉ cần CV. Vì vậy lần mở đầu
tiên thường rơi vào lúc parse còn đang chạy; lần mở thứ hai (cùng session) tức thì;
reload/history reopen lấy `parsed_cv` đã persist nên cũng tức thì. Model latency
thật (p50 ~5.5s) là **secondary**, đáng lẽ bị che bởi analyze p50 ~15.3s nếu parse
được start sớm.

---

## 1. Exact flow

```text
User chọn file / paste CV
  → processFile (PDF text bằng unpdf; PDF scan → base64/Storage; DOCX → mammoth)
  → analyzeCV (/api/analyze)                       [p50 model ~15.3s]
  → setResults + setSelectedResult
  → background loop:
       ├── generateFullCV       (/api/rewrite-cv)  ─┐ chạy song song
       └── generateParsedCVForResult (/api/parse-cv)┘
  → saveToHistory (không await)
  → user mở tab Parsed CV
       ├── parsedCV đã có      → render ngay
       ├── đang generating     → spinner "Đang trích xuất dữ liệu CV..."
       └── không có + không generating → "empty" (không retry)
```

Code chính:

- `src/context/analysis/AnalysisRunContext.tsx:145-180` — `generateParsedCVForResult`.
- `src/context/analysis/AnalysisRunContext.tsx:474-496` — background loop, `Promise.allSettled`,
  `saveToHistory`, `setSelectedResult`.
- `src/components/views/result/ParsedCVTab.tsx:20-37` — đọc `selectedResult.parsedCV`,
  spinner/empty; **không có effect/network request**.
- `src/components/views/ResultView.tsx:182-184` — tab chỉ mount component.
- `src/services/ai/analysisService.ts:32-58` — client `parseCV` POST `/api/parse-cv`.
- `_server-lib/parseCv/handler.ts:46-93` — auth → storage → Gemini → telemetry → response.
- `_server-lib/ai/parseCvService.ts:8,186-202` — Gemini `gemini-3.5-flash-lite`.
- `src/services/historyService.ts:47,117,148-158` — persist/read `parsed_cv`.

### Khi nào Parsed CV được tạo?

**Eager, tự động, sau analysis** — không phải lazy khi mở tab. Nhưng điểm bắt đầu
bị đặt sau toàn bộ analyze:

- Single CV: parse bắt đầu ngay sau `analyzeCV` trả về
  (`AnalysisRunContext.tsx:478-486`).
- Batch: vòng lặp parse nằm **sau** `Promise.all` của toàn bộ worker analyze
  (`AnalysisRunContext.tsx:426-474`), nên CV đầu tiên phải chờ **tất cả** CV
  analyze xong mới được parse.
- Parse và rewrite chạy song song (`Promise.allSettled`, dòng 481-486), không
  chờ nhau.
- `generateParsedCVForResult` không được await bởi caller; UI không chờ request.

---

## 2. Lazy vs eager

| | Hiện tại |
|---|---|
| Eager sau analysis | **Có** |
| Lazy khi mở tab | **Không** |
| Parse lại khi mở tab | **Không** |
| Parse lại khi reload | **Không** |
| Parse lại khi mở history | **Không** |
| Retry khi thiếu `parsed_cv` | **Không** |

UX implication: nếu user mở tab trong cửa sổ parse đang chạy, họ thấy spinner
(feels slow); nếu mở sau khi parse xong, tức thì. Nếu parse fail hoặc bị reload
giữa chừng, tab hiển thị empty vĩnh viễn — không phải chậm mà là **không có dữ
liệu và không có retry**.

---

## 3. First open / second open / reload / history reopen

| Case | Network request? | Parse again? | Storage fetch? | Expected latency |
|---|---|---|---|---|
| First open, parse đang chạy | Không (request đã tự start sau analysis) | Không | Chỉ khi PDF >2MB / scanned PDF | **remaining parse time**: ~3.7–5.4s (audit synthetic); real CV p50 model ~5.5s + overhead → ~6–7s |
| First open, parse đã xong | Không | Không | Không | ~0 |
| Second open cùng session | Không | Không | Không | ~0 |
| Reload sau khi parse persist | `getUserHistory` (Supabase, có `parsed_cv`) | Không | Không | history load only |
| Reload khi parse chưa persist | Không parse/retry | Không | Không | empty (content missing, không chậm) |
| History reopen, đã persist | `getUserHistory` | Không | Không | ~0 sau load |
| History reopen, legacy/không có `parsed_cv` | Không | Không | Không | empty vĩnh viễn |
| Analyze lại cùng CV | `/api/parse-cv` mới | **Có** | Theo loại file | full parse lại |

Production persistence: `history` hiện **272 rows**, **227 có `parsed_cv`**,
45 legacy/không có; 30 ngày gần nhất **8/8 có `parsed_cv`**. Vì vậy reload/history
reopen của kết quả mới không phải là cache miss; pattern "first slow, second
instant" khớp với generation timing, không phải parse lặp lại.

---

## 4. Latency measurements

### 4.1 Production samples (temporary audit user, cleaned up)

3 request text-only + 1 request text + PDF inline; đo bằng `curl time_total`
(TTFB ≈ total vì server trả JSON một lần, không streaming). Model latency lấy từ
`analysis_log.latency_ms` của chính request.

| Sample | Storage | Parse/model | Server total | UI total |
|---|---:|---:|---:|---|
| 1 — text ngắn | 0 (inline) | 2.335s | 5.147s | không instrument |
| 2 — text dài | 0 (inline) | 2.843s | 5.389s | không instrument |
| 3 — text ngắn lặp | 0 (inline) | 2.497s | 3.722s | không instrument |
| 4 — text + PDF inline | 0 (inline PDF) | 2.834s | 4.429s | không instrument |

Auth+handler floor (cùng endpoint, body `{}` → 400 Missing cvData, không gọi model):

| Sample | Total |
|---|---:|
| A1 | 1.414s |
| A2 | 1.833s |
| A3 | 1.728s |

Baseline telemetry 30 ngày, **loại trừ audit samples** (`kind=parse_cv`, success,
có latency): **n=7**, model **p50 5.541s**, p95 5.674s, max 5.718s; input p50
~3.022 tokens.

### 4.2 Breakdown (approximate; các request khác nhau)

```text
auth + handler floor:   1.4–1.8s
storage:                0 trong samples (không phải đường >2MB / scanned)
parse/model:            2.3–2.8s (audit synthetic); 5.5s p50 (real CV baseline)
server overhead/log:    ~0–1.4s residual (bao gồm log insert awaited + network)
frontend/render:        không đo; JSON 1.0–1.9KB, render nhẹ
TOTAL request:          3.7–5.4s (audit); real CV ước tính ~6–7s
UI total:               không instrument; nếu mở ngay sau analysis ≈ remaining
                        generation time; nếu mở muộn ≈ 0
```

Không có segment storage thực đo vì samples dùng inline text/PDF; xem §6.

---

## 5. Request waterfall

```text
analyze (p50 15.3s, p95 18.2s)
   │  ← parse không thể bắt đầu trong suốt thời gian này
   ▼
analysis complete
   ├── parse  (p50 model 5.5s; total 4–7s)
   └── rewrite (p50 3.5s)       ← hai call này song song
   ▼
saveToHistory (không await)
   ▼
user opens Parsed tab → spinner nếu parse chưa xong
```

- **Parse chờ analysis**: không cần thiết từ Stage 3.10B — `/api/parse-cv` chỉ nhận
  CV, không nhận JD (`src/services/ai/prompts.ts:115-137`; handler không đọc JD).
- **Batch tệ hơn**: parse của mọi CV chỉ bắt đầu sau khi **tất cả** analyze xong
  (`AnalysisRunContext.tsx:426-486`), rồi launch tất cả parse cùng lúc, không có
  concurrency cap.
- **Không chờ rewrite**: `Promise.allSettled` đúng.
- **Không chờ history save**: parse request được dispatch trước `saveToHistory`
  (dòng 480-495), nhưng persistence của `parsed_cv` phụ thuộc row đã tồn tại
  (xem §7).
- **UI không await**: `generateParsedCVForResult` fire-and-forget; tab chỉ đọc state.

---

## 6. Storage path

| Input | `processFile` result | Parse nhận | Storage work trong parse |
|---|---|---|---|
| Text/paste | text | text | Không |
| PDF ≤2MB, có text | text + `pdfInlineData` (base64 PDF) | text + PDF inline | Không storage, nhưng gửi PDF thừa |
| PDF >2MB, có text | text + `pdfStoragePath` | text + storage path | **DB lookup + R2 HEAD + GET + base64** (lần 2 sau analyze) |
| PDF scan ≤2MB | base64 PDF (`application/pdf`) | PDF inline | Không |
| PDF scan >2MB | `dataStoragePath` | storage path | DB + R2 HEAD + GET (cần cho visual parse) |
| DOCX | text | text | Không |
| Image ≤/>2MB | base64 / storage | image | Không / storage |

Code: `src/hooks/useFileProcessor.ts:74-92`; `_server-lib/parseCv/handler.ts:65-72`;
analyze cũng resolve cùng path tại `_server-lib/analyze/handler.ts:114-118`;
`_server-lib/storage/tempFile.ts:12-25`; `_server-lib/storage/r2.ts:33-36`;
`_server-lib/storage/handler.ts:24-29,78-81`.

Findings:

- PDF có text **vẫn gửi kèm PDF** vào parse (dòng 174-179 của
  `parseCvService.ts`), dù parse schema không có format/layout task. Đây là
  duplicate multimodal input.
- PDF >2MB có text khiến parse **download lại** object từ R2 (HEAD + GET) sau khi
  analyze đã download cùng object.
- Không có HEAD+GET trùng cho Supabase path (chỉ download), nhưng vẫn là lần đọc
  thứ hai.
- Telemetry hiện tại (input p50 ~3.0k, max 3.6k) **không thấy dấu hiệu PDF lớn**
  trong 7 baseline samples; đường storage >2MB là rủi ro chưa quan sát, không phải
  bottleneck đo được.

---

## 7. Parse/model path & duplicate work

- Model: `gemini-3.5-flash-lite` (`_server-lib/ai/geminiClient.ts:8`).
- Schema lớn (`PARSED_CV_SCHEMA`), `maxOutputTokens: 16384`
  (`_server-lib/ai/parseCvService.ts:186-196`), timeout 45s; không retry, không
  streaming; lỗi JSON có fallback parse một lần.
- Baseline: input p50 ~3.0k tokens, output avg ~1.5k, model p50 5.5s.
- Parse lại đọc CV sau analyze, nhưng analyze không tạo structured `ParsedCV`
  (chỉ có detailedComparison), nên đây là **công việc bổ sung**, không hoàn toàn
  duplicate. Tuy nhiên:
  - PDF có text bị gửi hai lần dưới hai dạng (text + PDF) — duplicate input.
  - PDF >2MB bị đọc storage hai lần (analyze + parse) — duplicate I/O.
  - Không có cache theo CV hash: analyze lại cùng CV sẽ parse lại từ đầu.
- Handler **await** `logAnalysisAttempt` trước khi trả response
  (`_server-lib/parseCv/handler.ts:92`; `_server-lib/analysisLog.ts:16-55`,
  LOG_TIMEOUT 5s). Đây là server overhead có thể trì hoãn response dù model đã xong.

---

## 8. Cache / persistence

- `parsed_cv` được persist bằng `updateHistoryField` sau khi parse xong
  (`AnalysisRunContext.tsx:167-170`; `historyService.ts:148-158`).
- `saveToHistory` chạy **sau** khi parse request được dispatch
  (`AnalysisRunContext.tsx:495`), không await. Parse mất 4–7s, history upsert
  thường nhanh hơn, nên race hiếm nhưng **không có guarantee**: nếu parse xong
  trước khi row tồn tại, `update` 0 row và `parsed_cv` mất im lặng (Supabase update
  không trả error khi 0 row).
- Reload giữa lúc parse đang chạy: row có thể đã tồn tại nhưng `parsed_cv` NULL;
  reload không trigger parse lại → tab empty.
- 45/272 history rows không có `parsed_cv` (legacy trước tính năng hoặc parse fail);
  30 ngày gần nhất 8/8 có. Không có lazy generation cho các row thiếu.
- `getUserHistory` dùng `select('*')` (`historyService.ts:168-177`), tải luôn
  `parsed_cv` của mọi row trong trang history; đây là payload history, không phải
  request riêng của tab, nhưng có thể làm history load nặng hơn khi nhiều CV.

---

## 9. Frontend / render

- `ParsedCVTab` không có `useEffect`, không fetch, không parse lại
  (`ParsedCVTab.tsx:18-43`).
- State: `parsedCVGeneratingIds` bật/tắt đúng; `setResults`, `setSelectedResult`,
  `setHistory` patch cùng object; React batch → một render.
- `React.StrictMode` (`src/main.tsx:14`) không gây double request vì generation
  nằm trong event handler, không trong effect.
- Render: JSON 1.0–1.9KB, `deriveParsedCvInsights` map nhỏ; không markdown/ảnh
  nặng. Không có bằng chứng frontend là bottleneck.
- Khi parse fail/không có data: empty state, không có retry button
  (`ParsedCVTab.tsx:33-37`).

---

## 10. Classification

# **C — REQUEST WATERFALL** (primary)

Parse độc lập với JD từ Stage 3.10B nhưng vẫn bị xếp sau analyze (và sau cả batch
analyze). Với analyze p50 ~15.3s và parse total 4–7s, lẽ ra parse có thể hoàn tất
trong lúc analyze chạy; thay vào đó 4–7s cuối lộ ra đúng lúc user mở tab lần đầu.

Secondary:

- **A — MODEL/PARSER LATENCY**: model p50 5.5s (real CV), audit 2.3–2.8s; đây là
  chi phí thật, nhưng có thể bị che nếu start sớm.
- **E — CACHE/PERSISTENCE MISS (edge)**: reload giữa generation / legacy rows
  không có `parsed_cv` → empty, không retry; race `updateHistoryField` có thể mất
  `parsed_cv`. Không phải primary vì recent 8/8 đã persist và second open tức thì.
- **B — STORAGE LATENCY (conditional)**: PDF >2MB có text bị R2 HEAD+GET lần hai;
  chưa quan sát trong telemetry hiện tại.
- **F — FRONTEND**: không có bằng chứng; render nhẹ, không duplicate request.

Không chọn D vì tab **không** trigger parse; generation là eager. Vấn đề là eager
nhưng **start muộn**, không phải lazy-on-open.

---

## 11. Recommended optimization (không implement ở stage này)

Ưu tiên theo benefit/complexity:

1. **Start parse song song với analyze** (cao, medium complexity).
   - Gọi `/api/parse-cv` ngay khi CV đã sẵn sàng (sau `processFile`), không chờ
     `analyzeCV`; giữ promise/key theo file slot, gắn `parsedCV` vào result khi
     analyze trả về.
   - Với batch: start parse cho từng CV ngay khi analyze của CV đó xong, thay vì
     chờ cả batch.
   - Kỳ vọng: parse 4–7s chạy dưới analyze 15.3s → first open ~0–1s thay vì 4–7s.
   - Rủi ro: tăng concurrency Gemini; nếu analyze fail/quota denied thì parse bị
     wasted — nên gate sau auth/quota hoặc cancel khi analyze fail.

2. **Không gửi PDF vào parse khi đã có text** (thấp, rõ ràng).
   - Chỉ truyền `cvPdfInlineData`/`cvPdfStoragePath` cho parse khi text rỗng
     (scanned PDF). Với text PDF, parse chỉ cần text.
   - Kỳ vọng: giảm input token (audit: 473 → 953 khi thêm PDF nhỏ), giảm model
     ~0.2–0.5s; loại bỏ R2 HEAD+GET lần hai cho PDF >2MB (có thể 1–3s).
   - Rủi ro: PDF text extraction kém ở một số file; chỉ skip khi text đủ dài.

3. **Không await telemetry trước response** (thấp).
   - Log success sau khi trả response hoặc fire-and-forget có deadline; hiện
     `await logAnalysisAttempt` nằm trên critical path.
   - Kỳ vọng: ~0.1–0.3s mỗi parse, worst-case thấp hơn 5s timeout.

4. **Persist `parsed_cv` chắc chắn + retry** (medium).
   - Upsert/attach parsed_cv atomically với history row, hoặc đợi row tồn tại;
     thêm lazy regeneration cho history rows thiếu parsed_cv.
   - Kỳ vọng: loại bỏ empty-tab sau reload giữa generation và 45 legacy rows;
     không cải thiện first-open latency.

5. **Concurrency cap cho background parse/rewrite** (thấp–medium).
   - Batch hiện launch tất cả parse cùng lúc; cap theo analyze worker hoặc queue.

6. **Cross-analysis cache theo CV hash** (optional).
   - Tránh parse lại cùng CV khi user analyze lại; lợi ích lớn cho repeated use,
     nhưng cần cân nhắc privacy/storage/TTL.

Không cần đổi loading skeleton; spinner hiện có là đúng.

---

## 12. Risks / caveats

- Audit samples dùng synthetic text ngắn; baseline 7 real CV có model p50 5.5s,
  nên first-open thực tế có thể ~6–7s, không chỉ 3.7–5.4s.
- UI total không được instrument; kết luận first-open dựa trên request timing +
  code path, không phải browser trace.
- Storage >2MB chưa đo; kết luận storage là conditional/code-path, không phải
  bottleneck đã quan sát.
- Production telemetry chỉ có 7 baseline parse_cv rows trong 30 ngày; không đủ
  cho percentile đáng tin, chỉ đủ để xác nhận model ~5.5s.
- Parse/analyze concurrency có thể làm tăng latency analyze hoặc 429; cần
  benchmark trước khi implement.
- Không thay đổi production behavior trong stage này.

---

## 13. Evidence index

**Frontend / flow**

- `src/context/analysis/AnalysisRunContext.tsx:72` — `parsedCVGeneratingIds`.
- `src/context/analysis/AnalysisRunContext.tsx:145-180` — generate function.
- `src/context/analysis/AnalysisRunContext.tsx:474-496` — set results, background loop,
  parallel rewrite/parse, `saveToHistory`, `setSelectedResult`.
- `src/context/analysis/AnalysisRunContext.tsx:480-486` — parse start điểm.
- `src/components/views/result/ParsedCVTab.tsx:20-37` — state/spinner/empty, no fetch.
- `src/components/views/result/ParsedCVTab.tsx:42-43` — render + insights.
- `src/components/views/ResultView.tsx:182-184` — tab mount.
- `src/services/ai/analysisService.ts:32-58` — parse client request/timeout 75s.
- `src/main.tsx:14` — StrictMode (not a cause).

**Server / model**

- `_server-lib/parseCv/handler.ts:46-57` — auth.
- `_server-lib/parseCv/handler.ts:65-72` — storage resolve.
- `_server-lib/parseCv/handler.ts:88-93` — model + awaited telemetry + response.
- `_server-lib/ai/parseCvService.ts:8` — 45s timeout.
- `_server-lib/ai/parseCvService.ts:174-179` — PDF attachment when text present.
- `_server-lib/ai/parseCvService.ts:186-196` — Gemini call, 16384 tokens.
- `_server-lib/ai/parseCvService.ts:199-207` — usage latency + normalize.
- `_server-lib/analysisLog.ts:16-55` — awaited insert, 5s timeout.
- `src/services/ai/prompts.ts:115-137` — parse prompt is CV-only (no JD).

**Storage**

- `src/hooks/useFileProcessor.ts:74-92` — text PDF vs scanned, inline vs storage.
- `_server-lib/analyze/handler.ts:114-118` — analyze resolves the same storage refs
  before parse resolves them again.
- `_server-lib/storage/tempFile.ts:12-25` — resolve path (R2/Supabase).
- `_server-lib/storage/r2.ts:33-36` — HEAD + GET.
- `_server-lib/storage/handler.ts:24-29` — upload row lookup.
- `_server-lib/storage/handler.ts:78-81` — readTempUpload DB + object read.

**Persistence / cache**

- `src/services/historyService.ts:47` — read/normalize `parsed_cv`.
- `src/services/historyService.ts:117` — save `parsed_cv`.
- `src/services/historyService.ts:148-158` — `updateHistoryField`.
- `src/services/historyService.ts:168-177` — history `select('*')`.
- `src/services/ai/parsedCvNormalize.ts:57` — normalization, no network.

**Production telemetry (queries run 2026-10-29, audit user removed)**

- `analysis_log` `kind=parse_cv`, success, 30d, baseline n=7: model p50 **5.541s**,
  p95 5.674s, max 5.718s; input p50 ~3.022 tokens.
- Audit samples: 2.335 / 2.843 / 2.497 / 2.834s model; request total
  5.147 / 5.389 / 3.722 / 4.429s; auth-only floor 1.414 / 1.833 / 1.728s.
- History persistence: 272 total, 227 with `parsed_cv`; last 30d 8/8.

---

## 14. Appendix — production observation notes

- 3 text-only parse samples + 1 text+PDF sample, measured with `curl -w
  time_total/time_starttransfer`; model latency read from `analysis_log` by
  `user_id`/`kind=parse_cv`.
- Auth floor measured with authenticated `POST /api/parse-cv` body `{}` (400,
  no model).
- Temporary audit user, profile and `analysis_log` rows were deleted after
  measurement; no production user data used.
- No code changed; no instrumentation shipped.
