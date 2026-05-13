import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Resend } from 'resend';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, userEmail, userName } = req.body;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const apiKey = process.env.RESEND_API_KEY;

  if (!secretKey) {
    return res.status(500).json({ success: false, message: 'reCAPTCHA configuration error' });
  }

  try {
    // 1. Verify reCAPTCHA
    const params = new URLSearchParams();
    params.append('secret', secretKey);
    params.append('response', token);

    const recaptchaResponse = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      params
    );
    
    const { success, score } = recaptchaResponse.data;
    const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');

    if (!success && !isLocal) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed' });
    } else if (success && score !== undefined && score < 0.2 && !isLocal) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA score too low' });
    }

    // 2. Send the email using Resend
    if (apiKey) {
      const resendClient = new Resend(apiKey);
      await resendClient.emails.send({
        from: `CV Matcher <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
        to: [userEmail],
        subject: 'Chào mừng bạn! Cùng tối ưu CV để chinh phục công việc mơ ước 🚀',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #334155;">
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 40px 20px; text-align: center; border-radius: 20px 20px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Chào mừng ${userName}!</h1>
              <p style="color: #e0e7ff; margin-top: 10px; font-size: 16px;">Chúng tôi rất vui khi bạn đồng hành cùng CV Matcher.</p>
            </div>
            <div style="padding: 30px; background: white; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 20px 20px;">
              <p>Cảm ơn bạn đã tin tưởng sử dụng <strong>CV Matcher & Optimizer</strong>.</p>
              <div style="text-align: center; margin: 40px 0;">
                <a href="https://cv.thanhnghiep.top" style="background: #4f46e5; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold;">Trải nghiệm ngay</a>
              </div>
            </div>
          </div>
        `
      });
      return res.status(200).json({ success: true, message: 'Welcome email sent successfully' });
    } else {
      return res.status(500).json({ success: false, message: 'Resend API key missing' });
    }
  } catch (error: any) {
    console.error('Welcome email error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
