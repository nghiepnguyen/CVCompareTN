# Kế hoạch triển khai: Gói Nhà tuyển dụng (Recruiter)

> Stack: React 19 + Vite · Supabase (PostgreSQL + Auth + Storage) · Express/Vercel Serverless · PayOS

---

## Tổng quan

Đảo ngược flow hiện tại: thay vì 1 ứng viên so nhiều JD, nhà tuyển dụng upload 1 JD và nhiều CV ứng viên → hệ thống tự phân tích và xếp hạng.

### So sánh 3 gói

|                        | Free     | Pro              | Recruiter          |
| ---------------------- | -------- | ---------------- | ------------------ |
| Lượt phân tích / tháng | 10       | 100              | 500                |
| CV / lần batch         | 1        | 5                | 50                 |
| Kho JD                 | 3        | Không giới hạn   | Không giới hạn     |
| Đợt tuyển dụng         | ❌        | ❌                | 10 / tháng         |
| Xuất báo cáo Excel     | ❌        | ❌                | ✅                  |
| Ghi chú nội bộ HR      | ❌        | ❌                | ✅                  |
| Lịch sử                | 7 ngày   | Vĩnh viễn        | Vĩnh viễn          |
| Giá                    | Miễn phí | 69.000 VNĐ/tháng | 499.000 VNĐ/tháng  |

---

## Kiến trúc tổng quan

```
RecruiterView (danh sách campaign)
  └── CampaignDetailView
        ├── Upload CV (nhiều file)
        ├── Phân tích batch → tái dụng handleAnalyze hiện tại
        ├── Bảng xếp hạng (sort theo match_score)
        ├── CandidatePanel (chi tiết + ghi chú HR)
        └── Xuất Excel (SheetJS — đã có trong stack)
```

Phần phân tích **không viết lại** — bọc `handleAnalyze` vào `RecruiterContext`, truyền thêm `campaignId`.

---

## Bước 1 — Migration Supabase

**File:** `supabase/migrations/20260601300000_add_recruiter_campaigns.sql`

> File SQL đầy đủ đã được tạo riêng. Tóm tắt nội dung:

### Bảng mới

**`recruitment_campaigns`** — đợt tuyển dụng

| Cột                | Kiểu        | Mô tả                                      |
| ------------------ | ----------- | ------------------------------------------ |
| `id`               | uuid PK     |                                            |
| `user_id`          | uuid FK     | Tham chiếu `profiles`                      |
| `title`            | text        | Tên đợt (vd: "Tuyển Backend Q3/2026")      |
| `jd_title`         | text        | Tên vị trí ngắn, dùng hiển thị             |
| `jd_content`       | text        | Nội dung JD đầy đủ                         |
| `status`           | text        | `active` / `closed` / `archived`           |
| `candidate_count`  | integer     | Cache tổng số CV (tránh COUNT mỗi lần)     |
| `analyzed_count`   | integer     | Cache số CV đã phân tích xong              |
| `shortlisted_count`| integer     | Cache số CV được shortlist                 |

**`candidate_cvs`** — CV từng ứng viên

| Cột               | Kiểu    | Mô tả                                              |
| ----------------- | ------- | -------------------------------------------------- |
| `id`              | uuid PK |                                                    |
| `campaign_id`     | uuid FK | Tham chiếu `recruitment_campaigns`                 |
| `candidate_name`  | text    | AI tự extract nếu để trống                         |
| `file_name`       | text    |                                                    |
| `file_path`       | text    | Supabase Storage: `{user_id}/campaigns/{cid}/...`  |
| `file_size`       | integer | bytes                                              |
| `parsed_text`     | text    | Text sau extract, tránh re-parse khi xem lại       |
| `analysis_result` | jsonb   | Full Gemini response (cùng shape với `history`)    |
| `match_score`     | integer | 0–100, được index để sort nhanh                    |
| `status`          | text    | `pending` / `analyzing` / `done` / `error`         |
| `error_message`   | text    | Lý do lỗi nếu `status = 'error'`                  |
| `hr_status`       | text    | `new` / `shortlisted` / `interviewing` / `rejected` / `hired` |
| `hr_note`         | text    | Ghi chú nội bộ của HR                             |
| `analyzed_at`     | timestamptz |                                                |

### RLS

- `recruitment_campaigns`: chỉ owner (`auth.uid() = user_id`)
- `candidate_cvs`: thuộc campaign của mình (subquery EXISTS)
- `anon` bị revoke toàn bộ trên cả 2 bảng

### Index

```sql
campaigns_user_id_created_idx      -- liệt kê campaign, mới nhất trước
candidates_campaign_score_idx      -- bảng xếp hạng (sort match_score DESC)
candidates_campaign_hr_status_idx  -- lọc theo trạng thái HR
candidates_campaign_status_idx     -- lọc theo trạng thái xử lý
```

### RPC

| Hàm                        | Gọi từ        | Mô tả                                              |
| -------------------------- | ------------- | -------------------------------------------------- |
| `sync_campaign_counters`   | Internal      | Sync 3 counter cache sau mỗi thay đổi              |
| `update_candidate_hr_status` | `authenticated` | Cập nhật `hr_status` + `hr_note`, tự sync counter |
| `save_candidate_analysis`  | `service_role` | Lưu kết quả Gemini — **không cho client gọi trực tiếp** |
| `check_analytics_quota`    | `authenticated` | Cập nhật thêm nhánh `recruiter` (500 lượt)        |

### Thay đổi bảng hiện có

```sql
-- Thêm 'recruiter' vào CHECK constraint profiles.plan
ALTER TABLE profiles
  DROP CONSTRAINT profiles_plan_check,
  ADD CONSTRAINT profiles_plan_check
    CHECK (plan IN ('free', 'pro', 'recruiter'));
```

### Storage path convention

Tái dụng bucket `cv-files` hiện tại, không tạo bucket mới:

```
cv-files/{user_id}/campaigns/{campaign_id}/{uuid}_{file_name}
```

---

## Bước 2 — Backend: endpoint PayOS Recruiter

Tái dụng handler PayOS hiện tại (`api/payment/lib/handlers.ts`), chỉ thêm nhánh `plan_type`:

```typescript
// api/payment/create.ts — thêm tham số plan_type
const { userId, userEmail, planType = 'pro' } = req.body;
// planType: 'pro' | 'recruiter'

const PLAN_CONFIG = {
  pro:       { amount: 69000,  duration: 30, label: 'CV Compare Pro' },
  recruiter: { amount: 499000, duration: 30, label: 'CV Compare Recruiter' },
};
```

```typescript
// activate_pro_plan RPC — cập nhật nhận plan_type
// Hoặc tạo RPC mới activate_plan(p_user_id, p_order_code, p_plan, p_duration_days)
```

**Biến môi trường bổ sung** (không cần thêm — dùng lại `PAYOS_*` hiện có):

```env
APP_URL=https://cvfit.pro # đã có
```

---

## Bước 3 — Frontend

### Cấu trúc file mới

```
src/
├── context/
│   └── recruiter/
│       ├── RecruiterContext.tsx     -- CRUD campaigns, upload CV, trigger phân tích
│       ├── types.ts
│       └── index.ts
├── components/views/
│   ├── RecruiterView.tsx            -- Danh sách campaign
│   └── CampaignDetailView.tsx       -- Bảng xếp hạng + panel ứng viên
├── components/recruiter/
│   ├── CampaignCard.tsx
│   ├── CandidateTable.tsx
│   ├── CandidatePanel.tsx           -- Panel chi tiết + ghi chú HR
│   └── CreateCampaignModal.tsx
└── services/
    └── recruiterService.ts          -- CRUD Supabase + Storage upload
```

### RecruiterContext — trách nhiệm

```typescript
interface RecruiterContextValue {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  candidates: CandidateCV[];
  isAnalyzing: boolean;

  createCampaign: (title: string, jdTitle: string, jdContent: string) => Promise<void>;
  uploadCandidateCVs: (campaignId: string, files: File[]) => Promise<void>;
  analyzeCampaign: (campaignId: string) => Promise<void>; // gọi handleAnalyze theo batch
  updateHrStatus: (candidateId: string, status: HrStatus, note?: string) => Promise<void>;
  exportToExcel: (campaignId: string) => void;
}
```

`analyzeCampaign` tái dụng logic `handleAnalyze` từ `AnalysisRunContext`:
- Gọi `check_analytics_quota` với số CV cần phân tích
- Chạy batch, mỗi CV gọi Gemini
- Lưu kết quả qua `save_candidate_analysis` (service_role từ backend)
- `increment_usage_count` mỗi CV xong

### UI Flow chi tiết

**Màn hình 1 — Danh sách campaign** (`RecruiterView`)

```
┌─────────────────────────────────────────────┐
│  Đợt tuyển dụng                  [+ Tạo mới]│
├─────────────────────────────────────────────┤
│ 🟢 Backend Developer Q3              [>]    │
│    12 CV · 10 đã phân tích · 3 shortlist    │
│                                             │
│ 🟢 Product Manager                   [>]    │
│    5 CV · 5 đã phân tích · 1 shortlist      │
│                                             │
│ ⚫ Frontend 2025 (đã đóng)            [>]    │
│    20 CV · 20 đã phân tích                  │
└─────────────────────────────────────────────┘
```

**Màn hình 2 — Tạo campaign** (`CreateCampaignModal`)

```
┌──────────────────────────────────────────────┐
│  Tạo đợt tuyển dụng mới                      │
├──────────────────────────────────────────────┤
│  Tên đợt *                                   │
│  [Backend Developer Q3/2026                ] │
│                                              │
│  Mô tả công việc (JD) *                      │
│  ┌────────────────────────────────────────┐  │
│  │ Dán JD vào đây hoặc [Upload file]      │  │
│  └────────────────────────────────────────┘  │
│  hoặc [Chọn từ kho JD đã lưu ▼]             │
│  → Tái dụng SavedJdContext, không viết lại   │
│                                              │
│             [Hủy]  [Tạo đợt →]              │
└──────────────────────────────────────────────┘
```

**Màn hình 3 — Campaign detail** (`CampaignDetailView`)

```
┌────────────────────────────────────────────────────┐
│ ← Backend Developer Q3          🟢 Đang mở    [⋯] │
├──────────────┬─────────────────────────────────────┤
│              │ [+ Upload CV]  [▶ Phân tích tất cả] │
│  12 CV       │ Lọc: [Tất cả ▼]  Sắp xếp: [Điểm ▼] │
│  10 xong     ├─────────────────────────────────────┤
│  3 shortlist │ #   Tên           Điểm  Trạng thái  │
│              │ 1   Nguyễn Văn A   87   ⭐ Shortlist │
│  [Xuất Excel]│ 2   Trần Thị B     82   Mới          │
│              │ 3   Lê Văn C       79   Mới          │
│              │ 4   Phạm D         61   ❌ Loại      │
│              │ 5   (đang xử lý…)  --   ⏳           │
└──────────────┴─────────────────────────────────────┘
```

Click vào ứng viên → `CandidatePanel` mở bên phải (desktop) hoặc bottom sheet (mobile):

```
┌──────────────────────────────────────┐
│  Nguyễn Văn A                 87/100 │
│  nguyenvana_cv.pdf · 245 KB          │
├──────────────────────────────────────┤
│  Trạng thái HR:                      │
│  [Mới] [Shortlist] [Phỏng vấn]      │
│  [Loại] [Đã tuyển]                   │
│                                      │
│  Ghi chú nội bộ:                     │
│  [___________________________      ] │
│  [Lưu ghi chú]                       │
├──────────────────────────────────────┤
│  ── Kết quả phân tích ──             │
│  Điểm khớp:  ████████░░  87%        │
│  Kỹ năng đạt: Node.js, React, SQL   │
│  Kỹ năng thiếu: Docker, Kubernetes  │
│                                      │
│  [Xem chi tiết đầy đủ ↗]            │
└──────────────────────────────────────┘
```

### Xuất Excel

Dùng `SheetJS` (đã có trong stack — `import * as XLSX from 'xlsx'`):

| Cột xuất          | Nguồn                          |
| ----------------- | ------------------------------ |
| STT               |                                |
| Tên ứng viên      | `candidate_name`               |
| Điểm khớp         | `match_score`                  |
| Kỹ năng đạt       | `analysis_result.matched`      |
| Kỹ năng thiếu     | `analysis_result.missing`      |
| Trạng thái HR     | `hr_status`                    |
| Ghi chú           | `hr_note`                      |
| Thời gian phân tích | `analyzed_at`               |

### Feature gate

```typescript
// planLimits.ts — bổ sung
export const isRecruiterPlan = (plan: string) => plan === 'recruiter';

export const MAX_CAMPAIGN_CVS: Record<string, number> = {
  free: 0,
  pro: 0,
  recruiter: 50,
};

export const MAX_CAMPAIGNS: Record<string, number> = {
  free: 0,
  pro: 0,
  recruiter: 10,
};
```

```typescript
// Trong RecruiterView — kiểm tra plan trước khi render
if (!isRecruiterPlan(userPlan)) {
  return <UpgradePrompt feature="Gói Nhà tuyển dụng" targetPlan="recruiter" />;
}
```

### Navigation

Thêm tab **Tuyển dụng** vào `MobileBottomNav` và header — chỉ hiển thị khi `plan === 'recruiter'`.

---

## Bước 4 — UpgradeView cập nhật

Thêm cột Recruiter vào bảng so sánh hiện có:

```tsx
// UpgradeView.tsx
const plans = [
  { id: 'free',      label: 'Miễn phí',  price: 0 },
  { id: 'pro',       label: 'Pro',        price: 69000 },
  { id: 'recruiter', label: 'Recruiter',  price: 499000 },
];
```

Nút "Nâng cấp Recruiter" gọi `createProCheckout({ planType: 'recruiter' })`.

---

## Bước 5 — Xử lý hết hạn

Tái dụng hoàn toàn logic hiện tại:
- RPC `get_user_plan` trả `'recruiter'` nếu `plan = 'recruiter'` và còn hạn, ngược lại trả `'free'`
- Không cần cron riêng

---

## Checklist trước khi go-live

### Supabase
- [ ] Chạy migration `20260601300000_add_recruiter_campaigns.sql`
- [ ] Cập nhật `activate_pro_plan` RPC nhận thêm `p_plan` parameter
- [ ] Kiểm tra RLS: `SELECT * FROM pg_policies WHERE tablename IN ('recruitment_campaigns','candidate_cvs')`
- [ ] Kiểm tra RPC revoke: anon không gọi được `check_analytics_quota`

### Backend
- [ ] Cập nhật `api/payment/create.ts` nhận `planType`
- [ ] Cập nhật webhook handler kích hoạt đúng plan
- [ ] Test luồng thanh toán Recruiter sandbox PayOS

### Frontend
- [ ] `RecruiterContext` + `recruiterService.ts`
- [ ] `RecruiterView` + `CampaignDetailView`
- [ ] `CandidatePanel` + `CandidateTable`
- [ ] `CreateCampaignModal`
- [ ] Xuất Excel hoạt động đúng
- [ ] Feature gate: Free/Pro thấy `UpgradePrompt`, không vào được Recruiter view
- [ ] Badge "RECRUITER" trên header (tương tự badge PRO hiện tại)
- [ ] Tab Tuyển dụng trên `MobileBottomNav`

### Kiểm thử
- [ ] Upload 10 CV → phân tích batch → bảng xếp hạng đúng thứ tự
- [ ] Gán `hr_status` → counter `shortlisted_count` sync đúng
- [ ] Xuất Excel: đủ cột, dữ liệu khớp bảng
- [ ] Hết quota 500 lượt → thông báo đúng
- [ ] Plan hết hạn → downgrade về Free, không vào được Recruiter

---

## Rủi ro cần lưu ý

| Rủi ro | Giải pháp |
| --- | --- |
| Chi phí Gemini tăng mạnh (50 CV/lần) | Tính token cost thực tế trước khi go-live, cân nhắc tăng giá Recruiter |
| Upload file lớn đồng thời | Giới hạn kích thước tổng per campaign (vd: 100MB), upload tuần tự thay vì song song |
| Bảo mật dữ liệu ứng viên | RLS đã có; cân nhắc thêm điều khoản riêng cho nhà tuyển dụng trong ToS |
| `save_candidate_analysis` chỉ service_role | Backend phải dùng `SUPABASE_SERVICE_ROLE_KEY`, không để client tự ghi điểm |

---

## Thứ tự thực hiện đề xuất

```
Tuần 1:
  [ ] Migration SQL
  [ ] recruiterService.ts (CRUD + Storage upload)
  [ ] RecruiterContext cơ bản

Tuần 2:
  [ ] RecruiterView + CampaignDetailView (UI skeleton)
  [ ] CandidateTable + CandidatePanel
  [ ] Kết nối analyzeCampaign → handleAnalyze

Tuần 3:
  [ ] Xuất Excel
  [ ] PayOS Recruiter plan
  [ ] UpgradeView cập nhật
  [ ] Feature gate + badge
  [ ] Test end-to-end + go-live
```
