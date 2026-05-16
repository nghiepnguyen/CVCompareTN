import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Resend } from 'resend';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, rating, title, content, userEmail } = req.body;
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
    } else if (success && score !== undefined && score < 0.5 && !isLocal) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA score too low' });
    }

    // 2. Send the email using Resend
    if (apiKey) {
      const resendClient = new Resend(apiKey);
      await resendClient.emails.send({
        from: `CV Matcher <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
        to: [process.env.FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'],
        subject: `Feedback: ${title}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4f46e5;">Phản hồi mới từ thanhnghiep.top</h2>
            <p><strong>Đánh giá:</strong> ${rating}/5 sao</p>
            <p><strong>Tiêu đề:</strong> ${title}</p>
            <p><strong>Người gửi:</strong> ${userEmail || 'Ẩn danh'}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p><strong>Nội dung:</strong></p>
            <p style="white-space: pre-wrap; line-height: 1.6;">${content}</p>
          </div>
        `
      });
      return res.status(200).json({ success: true, message: 'Feedback sent successfully' });
    } else {
      return res.status(500).json({ success: false, message: 'Resend API key missing' });
    }
  } catch (error: any) {
    console.error('Feedback error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
