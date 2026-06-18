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

  const { error } = await resend.emails.send({
    from: `cvFit <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
    to: [process.env.FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'],
    subject: `Feedback: ${safeTitle}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #4f46e5;">Phản hồi mới từ cvfit.pro</h2>
        <p><strong>Đánh giá:</strong> ${safeRating}/5 sao</p>
        <p><strong>Tiêu đề:</strong> ${safeTitle}</p>
        <p><strong>Người gửi:</strong> ${safeEmail}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p><strong>Nội dung:</strong></p>
        <p style="white-space: pre-wrap; line-height: 1.6;">${safeContent}</p>
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
