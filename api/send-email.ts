import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Resend } from 'resend';
import { escapeHtml } from '../_server-lib/escapeHtml.js';
import { validateFeedbackInput, validateWelcomeEmailInput } from '../_server-lib/validate.js';

async function verifyRecaptcha(token: string, req: VercelRequest): Promise<{ ok: boolean; message?: string }> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) return { ok: false, message: 'reCAPTCHA configuration error' };

  const params = new URLSearchParams();
  params.append('secret', secretKey);
  params.append('response', token);

  const { data } = await axios.post('https://www.google.com/recaptcha/api/siteverify', params);
  const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');

  if (!data.success && !isLocal) return { ok: false, message: 'reCAPTCHA verification failed' };
  if (data.success && data.score !== undefined && data.score < 0.5 && !isLocal) {
    return { ok: false, message: 'reCAPTCHA score too low' };
  }
  return { ok: true };
}

async function handleFeedback(req: VercelRequest, res: VercelResponse) {
  const { token, rating, title, content, userEmail } = req.body;

  const errors = validateFeedbackInput(req.body as Record<string, unknown>);
  if (errors.length > 0) return res.status(400).json({ success: false, message: 'Invalid input', errors });

  if (!process.env.RECAPTCHA_SECRET_KEY) {
    return res.status(500).json({ success: false, message: 'reCAPTCHA configuration error' });
  }

  const captcha = await verifyRecaptcha(token, req);
  if (!captcha.ok) return res.status(400).json({ success: false, message: captcha.message });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, message: 'Resend API key missing' });

  const resend = new Resend(apiKey);
  const safeTitle = escapeHtml(title ?? '');
  const safeContent = escapeHtml(content ?? '');
  const safeEmail = escapeHtml(userEmail ?? 'Ẩn danh');
  const safeRating = typeof rating === 'number' ? String(rating) : '—';

  await resend.emails.send({
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

  return res.status(200).json({ success: true, message: 'Feedback sent successfully' });
}

async function handleWelcome(req: VercelRequest, res: VercelResponse) {
  const { token, userEmail, userName } = req.body;

  const errors = validateWelcomeEmailInput(req.body as Record<string, unknown>);
  if (errors.length > 0) return res.status(400).json({ success: false, message: 'Invalid input', errors });

  const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');
  if (!isLocal) {
    if (!token) return res.status(400).json({ success: false, message: 'reCAPTCHA token required' });
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (secretKey) {
      const params = new URLSearchParams();
      params.append('secret', secretKey);
      params.append('response', token);

      const { data } = await axios.post('https://www.google.com/recaptcha/api/siteverify', params);

      if (!data.success) {
        return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed' });
      }
      if (data.score !== undefined && data.score < 0.2) {
        return res.status(400).json({ success: false, message: 'reCAPTCHA score too low' });
      }
    } else {
      console.warn('RECAPTCHA_SECRET_KEY missing — skipping reCAPTCHA for welcome email');
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, message: 'Resend API key missing' });

  const resend = new Resend(apiKey);
  const safeName = escapeHtml(userName ?? '');
  const safeEmail = escapeHtml(userEmail ?? '');

  await resend.emails.send({
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

  return res.status(200).json({ success: true, message: 'Welcome email sent successfully' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { type } = req.body ?? {};

  try {
    if (type === 'feedback') return await handleFeedback(req, res);
    if (type === 'welcome') return await handleWelcome(req, res);
    return res.status(400).json({ success: false, message: 'Invalid type. Use "feedback" or "welcome".' });
  } catch (error: unknown) {
    console.error('send-email [%s] error:', type, error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
