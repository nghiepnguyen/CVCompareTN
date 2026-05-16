import { Router } from 'express';
import axios from 'axios';
import { Resend } from 'resend';

const router = Router();

router.post('/', async (req, res) => {
  const { token, userEmail, userName } = req.body;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const apiKey = process.env.RESEND_API_KEY;

  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY is missing.');
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
    
    const { success, score, 'error-codes': errorCodes } = recaptchaResponse.data;
    const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');

    if (!success && !isLocal) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed', details: errorCodes });
    } else if (success && score !== undefined && score < 0.2 && !isLocal) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA score too low' });
    }

    // 2. Send the email using Resend
    if (apiKey) {
      const resendClient = new Resend(apiKey);
      const { data, error } = await resendClient.emails.send({
        from: `CV Matcher <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
        to: [userEmail],
        subject: 'Welcome! Optimize your CV and conquer your dream job 🚀',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px;">
            <h2 style="color: #4f46e5; margin-bottom: 24px;">Hi ${userName || 'there'},</h2>
            <p>Thank you for choosing <strong>CV Matcher</strong> as your career companion.</p>
            <p>Every CV contains your passion and effort. To pass ATS systems and selective recruiters, professional isn't enough — it needs to be <strong>compatible</strong>.</p>
            <h3 style="color: #1e293b; margin-top: 32px;">What can you do now?</h3>
            <ul style="list-style-type: none; padding: 0;">
              <li style="margin-bottom: 16px; padding: 12px; background-color: #f8fafc; border-radius: 12px; border-left: 4px solid #4f46e5;">
                <strong>📊 Check ATS Score:</strong> Know exactly how your CV scores against job requirements.
              </li>
              <li style="margin-bottom: 16px; padding: 12px; background-color: #f8fafc; border-radius: 12px; border-left: 4px solid #4f46e5;">
                <strong>🔍 Skill Gap Analysis:</strong> Identify missing keywords or critical skills.
              </li>
              <li style="margin-bottom: 16px; padding: 12px; background-color: #f8fafc; border-radius: 12px; border-left: 4px solid #4f46e5;">
                <strong>📈 Success Probability:</strong> Get an objective prediction of interview chances.
              </li>
            </ul>
            <div style="margin-top: 40px; text-align: center;">
              <a href="https://cv.thanhnghiep.top" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold;">
                Try CV Comparison Now
              </a>
            </div>
            <p style="margin-top: 24px; font-weight: bold;">Best regards,<br>CV Matcher Team</p>
          </div>
        `
      });

      if (error) {
        console.error('Welcome email error:', error);
        return res.status(500).json({ success: false, message: 'Email service error' });
      }
    } else {
      console.warn('RESEND_API_KEY is missing.');
      return res.status(500).json({ success: false, message: 'Resend configuration missing' });
    }

    res.json({ success: true, message: 'Welcome email sent successfully' });
  } catch (error: any) {
    console.error('Welcome email error:', error);
    res.status(500).json({ success: false, message: `System error: ${error.message}` });
  }
});

export default router;
