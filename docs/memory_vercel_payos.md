# Memory: Vercel 12 Functions + PayOS Payment Flow

## Vercel Hobby Plan: Max 12 Serverless Functions

### Quy tắc quan trọng
1. **Vercel đếm TẤT CẢ file `.ts` trong thư mục `api/`** — kể cả file không có `export default function handler()`
2. **Shared lib/utility phải đặt NGOÀI `api/`** — hiện tại là `_server-lib/`
3. **Gộp nhiều endpoint liên quan vào 1 file** nếu cần (dispatch theo URL path)
4. `vercel.json` functions config chỉ khai báo pattern cho thư mục có handler thật

### Cấu trúc hiện tại (7/12 functions)

| # | Endpoint | File |
|---|----------|------|
| 1 | `/api/config` | `api/config.ts` |
| 2 | `/api/verify-recaptcha` | `api/verify-recaptcha.ts` |
| 3 | `/api/send-feedback` | `api/send-feedback.ts` |
| 4 | `/api/send-welcome-email` | `api/send-welcome-email.ts` |
| 5 | `/api/extract-pdf` | `api/extract-pdf.ts` |
| 6 | `/api/payment/(create\|confirm\|webhook)` | `api/payment.ts` |
| 7 | `/api/recruiter/save-analysis` | `api/recruiter/save-analysis.ts` |

### Shared libs (NGOÀI api/, không bị đếm)
```
_server-lib/
├── escapeHtml.ts
├── validate.ts
└── payment/
    ├── handlers.ts      # handlePaymentCreate/Confirm/Webhook
    ├── payos.ts         # PayOS API, signature, payment link
    ├── paymentEnv.ts    # getMissingPaymentEnv()
    ├── supabaseAdmin.ts # getSupabaseAdmin(), getUserFromBearerToken()
    └── vipUpgradeEmail.ts # sendVipUpgradeEmail()
```

### Khi thêm function mới
- **Luôn kiểm tra tổng số file `.ts` trong `api/`** ≤ 9 (dư 3 buffer)
- Nếu sắp vượt: gộp endpoint liên quan vào 1 file
- KHÔNG đặt file utility/lib nào trong `api/` — dùng `_server-lib/`

---

## PayOS Payment Flow — Không Được Sửa Structure

### 3 endpoint gộp trong `api/payment.ts`
Dispatch theo URL path segment cuối cùng:

```
POST /api/payment/create  → action='create'  → handlePaymentCreate()
POST /api/payment/confirm → action='confirm' → handlePaymentConfirm()
POST /api/payment/webhook → action='webhook' → handlePaymentWebhook()
```

### Luồng thanh toán
1. **Create** (`handlePaymentCreate`):
   - Kiểm tra env: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Xác thực user từ Bearer token → `getUserFromBearerToken()`
   - Tạo order code → `createPayosPaymentLink()` gọi PayOS API
   - Insert record vào `payments` table (Supabase) với status `pending`
   - Trả về `checkoutUrl` cho client redirect

2. **Webhook** (`handlePaymentWebhook`):
   - PayOS gọi khi thanh toán hoàn tất
   - Verify signature `verifyWebhookPayload()`
   - Kiểm tra status PAID
   - Gọi RPC `activate_pro_plan` để kích hoạt gói
   - Gửi email VIP upgrade (non-blocking)

3. **Confirm** (`handlePaymentConfirm`):
   - Fallback khi webhook không tới
   - Client gọi sau khi redirect về success page
   - Kiểm tra status với PayOS API `fetchPaymentRequestInfo()`
   - Kích hoạt nếu đã paid

### Biến môi trường bắt buộc trên Vercel Production
```
PAYOS_CLIENT_ID
PAYOS_API_KEY
PAYOS_CHECKSUM_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### KHÔNG được
- Đổi tên file `api/payment.ts`
- Đổi path import trong `_server-lib/payment/handlers.ts`
- Đổi cấu trúc dispatch (URL path parse)
- Đưa `_server-lib/` vào `api/`