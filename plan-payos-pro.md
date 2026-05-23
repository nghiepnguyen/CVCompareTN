# Kế hoạch triển khai: CV Compare Pro (PayOS)

> Stack: React 19 + Vite · Supabase (PostgreSQL + Auth) · Express/Vercel Serverless · PayOS

---

## Tổng quan plan


|                      | Free     | Pro              |
| -------------------- | -------- | ---------------- |
| Lượt phân tích/tháng | 10       | 100              |
| CV/lần batch         | 1        | 5                |
| Kho JD               | 3 mẫu    | Không giới hạn   |
| Lịch sử              | 7 ngày   | Vĩnh viễn        |
| Xuất CV tối ưu       | ❌        | ✅                |
| Giá                  | Miễn phí | 69.000 VNĐ/tháng |


---

## Bước 1 — Migration Supabase

### 1.1 File migration

`supabase/migrations/20260601000000_add_plan_to_profiles.sql`

```sql
-- Thêm cột plan vào profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz;

-- Bảng lưu lịch sử giao dịch
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_code bigint NOT NULL UNIQUE,       -- mã PayOS
  amount integer NOT NULL,                 -- VNĐ
  plan text NOT NULL DEFAULT 'pro',
  duration_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'pending'   -- pending | paid | cancelled | expired
    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  payos_data jsonb,                        -- raw webhook payload
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);

-- Index tra cứu nhanh
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments(user_id);
CREATE INDEX IF NOT EXISTS payments_order_code_idx ON payments(order_code);

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User xem payment của mình"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Chỉ service role mới được insert/update (qua webhook backend)
CREATE POLICY "Service role full access payments"
  ON payments FOR ALL
  USING (auth.role() = 'service_role');

-- RPC: kiểm tra plan còn hiệu lực không
CREATE OR REPLACE FUNCTION get_user_plan(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    CASE
      WHEN plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > now())
        THEN 'pro'
      ELSE 'free'
    END
  FROM profiles
  WHERE id = p_user_id;
$$;

-- RPC: kích hoạt Pro sau khi webhook xác nhận thanh toán
CREATE OR REPLACE FUNCTION activate_pro_plan(
  p_user_id uuid,
  p_order_code bigint,
  p_duration_days integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Cập nhật profiles
  UPDATE profiles SET
    plan = 'pro',
    plan_expires_at = CASE
      WHEN plan = 'pro' AND plan_expires_at > now()
        THEN plan_expires_at + (p_duration_days || ' days')::interval  -- cộng thêm nếu còn hạn
      ELSE now() + (p_duration_days || ' days')::interval
    END,
    plan_updated_at = now(),
    -- Reset quota tháng khi nâng cấp
    usage_count = 0
  WHERE id = p_user_id;

  -- Cập nhật bảng payments
  UPDATE payments SET
    status = 'paid',
    paid_at = now()
  WHERE order_code = p_order_code;
END;
$$;
```

### 1.2 Cập nhật check_analytics_quota

Quota theo plan — sửa RPC hiện tại để đọc từ `plan`:

```sql
-- Thêm vào RPC check_analytics_quota hiện tại:
-- Lấy limit dựa theo plan thay vì chỉ app_settings
CREATE OR REPLACE FUNCTION check_analytics_quota(
  p_user_id uuid,
  p_additional integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_used integer;
BEGIN
  SELECT
    CASE
      WHEN plan = 'pro' AND (plan_expires_at IS NULL OR plan_expires_at > now())
        THEN 'pro' ELSE 'free'
    END,
    COALESCE(usage_count, 0)
  INTO v_plan, v_used
  FROM profiles WHERE id = p_user_id;

  -- Pro: 100 lượt, Free: lấy từ app_settings (mặc định 20)
  IF v_plan = 'pro' THEN
    v_limit := 100;
  ELSE
    SELECT COALESCE(
      (SELECT (value->>'default_monthly_analytics_limit')::int
       FROM app_settings WHERE key = 'default_monthly_analytics_limit'),
      20
    ) INTO v_limit;
  END IF;

  RETURN jsonb_build_object(
    'allowed', (v_used + p_additional) <= v_limit,
    'used', v_used,
    'limit', v_limit,
    'plan', v_plan
  );
END;
$$;
```

**Biến môi trường cần thêm vào `.env` / Vercel Dashboard:**

```env
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # đã có, dùng để gọi RPC từ backend
```

---

## Bước 2 — Backend: 2 endpoint PayOS

### Cấu trúc file

```
server/routes/
  payment.ts          ← Express: mount tại /api/payment
api/
  payment-create.ts   ← Vercel: POST /api/payment/create
  payment-webhook.ts  ← Vercel: POST /api/payment/webhook
```

### 2.1 `POST /api/payment/create`

`server/routes/payment.ts` (và tương ứng `api/payment-create.ts` cho Vercel)

```typescript
import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Tạo payment link PayOS
router.post('/create', async (req, res) => {
  const { userId, userEmail } = req.body;

  if (!userId || !userEmail) {
    return res.status(400).json({ error: 'Thiếu thông tin người dùng' });
  }

  // orderCode: PayOS yêu cầu số nguyên dương, dùng timestamp + random
  const orderCode = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);

  const payosBody = {
    orderCode,
    amount: 39000,
    description: `CV Compare Pro`, // tối đa 25 ký tự
    buyerEmail: userEmail,
    items: [{ name: 'CV Compare Pro 30 ngày', quantity: 1, price: 39000 }],
    returnUrl: `${process.env.APP_URL}/payment/success?orderCode=${orderCode}`,
    cancelUrl: `${process.env.APP_URL}/payment/cancel`,
    expiredAt: Math.floor(Date.now() / 1000) + 15 * 60, // hết hạn sau 15 phút
  };

  // Tạo chữ ký HMAC-SHA256
  const checksumData =
    `amount=${payosBody.amount}` +
    `&cancelUrl=${payosBody.cancelUrl}` +
    `&description=${payosBody.description}` +
    `&orderCode=${payosBody.orderCode}` +
    `&returnUrl=${payosBody.returnUrl}`;

  const crypto = await import('crypto');
  const signature = crypto
    .createHmac('sha256', process.env.PAYOS_CHECKSUM_KEY!)
    .update(checksumData)
    .digest('hex');

  const response = await fetch('https://api-merchant.payos.vn/v2/payment-requests', {
    method: 'POST',
    headers: {
      'x-client-id': process.env.PAYOS_CLIENT_ID!,
      'x-api-key': process.env.PAYOS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payosBody, signature }),
  });

  const data = await response.json();

  if (data.code !== '00') {
    return res.status(500).json({ error: 'Không tạo được link thanh toán' });
  }

  // Lưu vào bảng payments (trạng thái pending)
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await supabase.from('payments').insert({
    user_id: userId,
    order_code: orderCode,
    amount: 69000,
    plan: 'pro',
    duration_days: 30,
    status: 'pending',
  });

  res.json({ checkoutUrl: data.data.checkoutUrl, orderCode });
});

export default router;
```

### 2.2 `POST /api/payment/webhook`

**Quan trọng:** PayOS gửi webhook khi thanh toán xong. Phải xác thực chữ ký trước khi xử lý.

```typescript
router.post('/webhook', async (req, res) => {
  const { code, data, signature } = req.body;

  // 1. Xác thực chữ ký HMAC
  const crypto = await import('crypto');
  const checksumData =
    `amount=${data.amount}` +
    `&cancelUrl=${data.cancelUrl}` +
    `&description=${data.description}` +
    `&orderCode=${data.orderCode}` +
    `&returnUrl=${data.returnUrl}`;

  const expectedSignature = crypto
    .createHmac('sha256', process.env.PAYOS_CHECKSUM_KEY!)
    .update(checksumData)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).json({ error: 'Chữ ký không hợp lệ' });
  }

  // 2. Chỉ xử lý khi thanh toán thành công
  if (code !== '00') {
    return res.json({ success: true }); // vẫn trả 200 để PayOS không retry
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 3. Tìm payment để lấy user_id
  const { data: payment } = await supabase
    .from('payments')
    .select('user_id')
    .eq('order_code', data.orderCode)
    .single();

  if (!payment) {
    return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  }

  // 4. Kích hoạt Pro qua RPC (lưu cả webhook payload)
  await supabase.rpc('activate_pro_plan', {
    p_user_id: payment.user_id,
    p_order_code: data.orderCode,
    p_duration_days: 30,
  });

  // Lưu raw payload để đối soát
  await supabase
    .from('payments')
    .update({ payos_data: data })
    .eq('order_code', data.orderCode);

  res.json({ success: true });
});
```

### 2.3 Đăng ký route trong `server.ts`

```typescript
import paymentRouter from './routes/payment';
app.use('/api/payment', paymentRouter);
```

### 2.4 Thêm vào `vercel.json`

```json
{ "source": "/api/payment/:path*", "destination": "/api/payment-:path" }
```

---

## Bước 3 — Enforce giới hạn theo plan

### 3.1 `analyticsQuotaService.ts` — đọc plan từ response

RPC `check_analytics_quota` đã trả về `plan` — lấy và lưu vào context:

```typescript
// Trong AnalysisRunContext.tsx, sau khi gọi checkAnalyticsQuota:
const quota = await checkAnalyticsQuota(userId, cvCount);
// quota.plan = 'free' | 'pro' — dùng để hiện badge và enforce UI
```

### 3.2 Giới hạn batch CV

```typescript
// AnalysisRunContext.tsx — trước khi bắt đầu phân tích
const MAX_BATCH: Record<string, number> = { free: 1, pro: 5 };
const maxBatch = MAX_BATCH[userPlan] ?? 1;

if (selectedCvs.length > maxBatch) {
  toast.error(`Gói ${userPlan === 'free' ? 'Miễn phí' : 'Pro'} tối đa ${maxBatch} CV/lần`);
  return;
}
```

### 3.3 Giới hạn kho JD

```typescript
// SavedJdContext.tsx — trong confirmSaveJD()
const MAX_JD: Record<string, number> = { free: 3, pro: Infinity };
const maxJd = MAX_JD[userPlan] ?? 3;

if (savedJds.length >= maxJd) {
  toast.error('Nâng cấp Pro để lưu thêm JD');
  return;
}
```

### 3.4 Giới hạn lịch sử (query Supabase)

```typescript
// historyService.ts — thêm filter ngày cho Free
const HISTORY_DAYS: Record<string, number> = { free: 7, pro: 36500 }; // pro = ~100 năm = vĩnh viễn

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - (HISTORY_DAYS[userPlan] ?? 7));

const query = supabase
  .from('history')
  .select('*')
  .eq('user_id', userId)
  .gte('created_at', cutoff.toISOString()) // chỉ áp dụng với Free
  .order('created_at', { ascending: false });
```

### 3.5 Khóa xuất CV tối ưu

```typescript
// Trong component export/print — kiểm tra plan
if (userPlan !== 'pro') {
  return <UpgradePrompt feature="Xuất CV tối ưu" />;
}
```

---

## Bước 4 — UI

### 4.1 Trang nâng cấp `/upgrade`

File: `src/components/views/UpgradeView.tsx`

**Nội dung cần có:**

- Bảng so sánh Free vs Pro
- Nút "Nâng cấp ngay — 39.000đ/tháng" → gọi `POST /api/payment/create` → redirect đến `checkoutUrl`
- Trang `/payment/success` — hiển thị xác nhận, polling Supabase để detect plan đã active
- Trang `/payment/cancel` — quay lại, không mất gì

**Flow redirect sau thanh toán:**

```
PayOS → returnUrl (/payment/success?orderCode=xxx)
→ Frontend polling supabase mỗi 2s: SELECT plan FROM profiles WHERE id = userId
→ Khi plan = 'pro' → hiển thị "Nâng cấp thành công!" → redirect về Dashboard
```

> Polling an toàn hơn là dùng realtime subscription cho trường hợp này vì webhook có thể đến sau vài giây.

### 4.2 Badge Pro trên Header

```tsx
// Header.tsx
{userPlan === 'pro' && (
  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-400/20 text-amber-500 border border-amber-500/30">
    PRO
  </span>
)}
```

### 4.3 UpgradePrompt component (dùng lại nhiều nơi)

```tsx
// src/components/shared/UpgradePrompt.tsx
const UpgradePrompt = ({ feature }: { feature: string }) => (
  <div className="...">
    <p>{feature} chỉ dành cho tài khoản Pro</p>
    <button onClick={() => navigate('/upgrade')}>Nâng cấp ngay</button>
  </div>
);
```

---

## Bước 5 — Xử lý hết hạn plan

### 5.1 Check khi đăng nhập (đơn giản, không cần cron)

```typescript
// AuthContext.tsx — sau khi load profile
const plan = await supabase.rpc('get_user_plan', { p_user_id: user.id });
// RPC này tự trả 'free' nếu plan_expires_at < now()
// → Không cần cron job, mỗi lần load đều check đúng
```

### 5.2 Nếu muốn cron job (tùy chọn, dùng Supabase pg_cron)

```sql
-- Chạy mỗi ngày lúc 00:00 UTC
SELECT cron.schedule(
  'expire-pro-plans',
  '0 0 * * *',
  $$
    UPDATE profiles
    SET plan = 'free', plan_updated_at = now()
    WHERE plan = 'pro' AND plan_expires_at < now();
  $$
);
```

> Thực tế thì RPC `get_user_plan` đã đủ — cron chỉ cần nếu muốn DB luôn clean.

---

## Ma trận endpoint đầy đủ sau khi thêm PayOS


| Chức năng           | Vercel                       | Express (local)                     |
| ------------------- | ---------------------------- | ----------------------------------- |
| Tạo link thanh toán | `POST /api/payment/create`   | `POST /api/payment/create`          |
| Webhook PayOS       | `POST /api/payment/webhook`  | `POST /api/payment/webhook`         |
| Trích xuất PDF      | `POST /api/extract-pdf`      | `POST /api/extract-pdf/extract`     |
| reCAPTCHA           | `POST /api/verify-recaptcha` | `POST /api/verify-recaptcha/verify` |


---

## Checklist trước khi go-live

- Tạo tài khoản PayOS, lấy `CLIENT_ID`, `API_KEY`, `CHECKSUM_KEY`
- Đăng ký webhook URL trên PayOS Dashboard: `https://cv.thanhnghiep.top/api/payment/webhook`
- Thêm env vars vào Vercel Dashboard
- Chạy migration SQL trên Supabase
- Test luồng thanh toán với môi trường sandbox PayOS
- Kiểm tra enforce giới hạn batch/JD/lịch sử
- Kiểm tra badge Pro hiển thị đúng sau khi nâng cấp

