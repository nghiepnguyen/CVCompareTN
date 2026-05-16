import { Router } from 'express';
import axios from 'axios';
import { Resend } from 'resend';

const router = Router();

router.post('/', async (req, res) => {
  const { token, rating, title, content, userEmail } = req.body;
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
    } else if (success && score !== undefined && score < 0.5 && !isLocal) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA score too low' });
    }

    // 2. Send the email using Resend
    if (apiKey) {
      const resendClient = new Resend(apiKey);
      const { data, error } = await resendClient.emails.send({
        from: `CV Matcher <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
        to: [process.env.FEEDBACK_RECIPIENT_EMAIL || 'admin@example.com'],
        subject: `Feedback: ${title}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4f46e5;">New feedback from CV Matcher</h2>
            <p><strong>Rating:</strong> ${rating}/5 stars</p>
            <p><strong>Title:</strong> ${title}</p>
            <p><strong>From:</strong> ${userEmail || 'Anonymous'}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p><strong>Content:</strong></p>
            <p style="white-space: pre-wrap; line-height: 1.6;">${content}</p>
          </div>
        `
      });

      if (error) {
        console.error('Resend API Error:', error);
        return res.status(500).json({ success: false, message: `Email service error: ${error.message}` });
      }
    } else {
      console.warn('RESEND_API_KEY is missing.');
      return res.status(500).json({ success: false, message: 'RESEND_API_KEY is not configured.' });
    }

    res.json({ success: true, message: 'Feedback sent successfully' });
  } catch (error: any) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ success: false, message: `System error: ${error.message}` });
  }
});

export default router;
