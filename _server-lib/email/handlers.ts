import { Resend } from 'resend';
import { escapeHtml } from '../escapeHtml.js';
import { validateFeedbackInput, validateWelcomeEmailInput } from '../validate.js';
import { verifyRecaptcha } from '../recaptcha.js';

export type HandlerResult = { status: number; body: Record<string, unknown> };

export async function handleSendFeedback(body: unknown): Promise<HandlerResult> {
  const b = (body ?? {}) as {
    token?: string;
    rating?: unknown;
    title?: string;
    content?: string;
    userEmail?: string;
  };

  const errors = validateFeedbackInput(b as Record<string, unknown>);
  if (errors.length > 0) {
    return { status: 400, body: { success: false, message: 'Invalid input', errors } };
  }

  if (!b.token) {
    return { status: 400, body: { success: false, message: 'reCAPTCHA token required' } };
  }

  const captcha = await verifyRecaptcha(b.token);
  if (!captcha.ok) {
    return { status: captcha.status ?? 400, body: { success: false, message: captcha.error } };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { success: false, message: 'Resend API key missing' } };
  }

  const resend = new Resend(apiKey);
  const safeTitle = escapeHtml(b.title ?? '');
  const safeContent = escapeHtml(b.content ?? '');
  const safeEmail = escapeHtml(b.userEmail ?? 'Ẩn danh');
  const safeRating = typeof b.rating === 'number' ? String(b.rating) : '—';

  const ratingNum =
    typeof b.rating === 'number' ? Math.min(5, Math.max(0, Math.round(b.rating))) : 0;
  const stars = Array.from(
    { length: 5 },
    (_, i) =>
      `<span style="color: ${i < ratingNum ? '#f59e0b' : '#d1d5db'}; font-size: 20px;">&#9733;</span>`
  ).join('');
  const ctaButton = b.userEmail
    ? `<div style="margin-top: 32px; text-align: center;">
        <a href="mailto:${safeEmail}" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">Phản hồi người dùng</a>
      </div>`
    : '';

  const { error } = await resend.emails.send({
    from: `cvFit <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
    to: [process.env.FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'],
    subject: `[cvFit] Phản hồi mới: ${safeTitle}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; background: #f8fafc;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4f46e5 100%); padding: 28px 32px; border-radius: 16px 16px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="vertical-align: middle;">
                <span style="color: white; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">cv<span style="color: #a5b4fc;">Fit</span></span>
              </td>
              <td style="text-align: right; vertical-align: middle;">
                <span style="background: rgba(255,255,255,0.15); color: #c7d2fe; font-size: 11px; font-weight: 600; padding: 5px 14px; border-radius: 20px; letter-spacing: 0.8px; text-transform: uppercase;">Phan hoi moi</span>
              </td>
            </tr>
          </table>
        </div>

        <!-- Meta strip -->
        <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-top: none; padding: 18px 32px;">
          <span style="vertical-align: middle;">${stars}</span>
          <span style="color: #64748b; font-size: 13px; margin-left: 8px; vertical-align: middle;"><strong style="color: #334155;">${safeRating}/5</strong> sao</span>
          <span style="color: #cbd5e1; margin: 0 12px; vertical-align: middle;">|</span>
          <span style="color: #64748b; font-size: 13px; vertical-align: middle;">Nguoi gui: <strong style="color: #334155;">${safeEmail}</strong></span>
        </div>

        <!-- Body -->
        <div style="background: white; border: 1px solid #e2e8f0; border-top: none; padding: 32px;">

          <!-- Title block -->
          <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8;">Tieu de</p>
          <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 700; color: #0f172a;">${safeTitle}</h2>

          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 0 0 24px 0;" />

          <!-- Content block -->
          <p style="margin: 0 0 12px 0; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #94a3b8;">Noi dung phan hoi</p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5; border-radius: 0 10px 10px 0; padding: 20px;">
            <p style="margin: 0; font-size: 15px; color: #334155; white-space: pre-wrap; line-height: 1.75;">${safeContent}</p>
          </div>

          ${ctaButton}
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px; padding: 18px 32px; text-align: center;">
          <p style="margin: 0; font-size: 13px; color: #475569;">
            <strong>cvFit</strong> &nbsp;·&nbsp; <a href="https://cvfit.pro" style="color: #6366f1; text-decoration: none;">cvfit.pro</a>
          </p>
          <p style="margin: 6px 0 0 0; font-size: 12px; color: #94a3b8;">Email nay duoc gui tu dong khi co phan hoi moi tu nguoi dung.</p>
        </div>

      </div>
    `,
  });

  if (error) {
    console.error('Resend API Error:', error);
    return { status: 500, body: { success: false, message: `Email service error: ${error.message}` } };
  }

  return { status: 200, body: { success: true, message: 'Feedback sent successfully' } };
}

export async function handleSendWelcomeEmail(body: unknown): Promise<HandlerResult> {
  const b = (body ?? {}) as {
    token?: string;
    userEmail?: string;
    userName?: string;
  };

  const errors = validateWelcomeEmailInput(b as Record<string, unknown>);
  if (errors.length > 0) {
    return { status: 400, body: { success: false, message: 'Invalid input', errors } };
  }

  if (process.env.NODE_ENV === 'production') {
    if (!b.token) {
      return { status: 400, body: { success: false, message: 'reCAPTCHA token required' } };
    }
    const captcha = await verifyRecaptcha(b.token);
    if (!captcha.ok) {
      return { status: captcha.status ?? 400, body: { success: false, message: captcha.error } };
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { status: 500, body: { success: false, message: 'Resend API key missing' } };
  }

  const resend = new Resend(apiKey);
  const safeName = escapeHtml(b.userName ?? '');
  const safeEmail = escapeHtml(b.userEmail ?? '');

  const { error } = await resend.emails.send({
    from: `cvFit <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
    to: [safeEmail],
    subject: 'Chào mừng bạn! Cùng tối ưu CV để chinh phục công việc mơ ước 🚀',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #334155;">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 40px 20px; text-align: center; border-radius: 20px 20px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Chào mừng ${safeName}!</h1>
          <p style="color: #e0e7ff; margin-top: 10px; font-size: 16px;">Chúng tôi rất vui khi bạn đồng hành cùng cvFit.</p>
        </div>
        <div style="padding: 30px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 20px 20px;">
          <p>Cảm ơn bạn đã tin tưởng sử dụng <strong>cvFit</strong>.</p>
          <div style="text-align: center; margin: 40px 0;">
            <a href="https://cvfit.pro" style="background: #4f46e5; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold;">Trải nghiệm ngay</a>
          </div>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error('Welcome email error:', error);
    return { status: 500, body: { success: false, message: 'Email service error' } };
  }

  return { status: 200, body: { success: true, message: 'Welcome email sent successfully' } };
}
