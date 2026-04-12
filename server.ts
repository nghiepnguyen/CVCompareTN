import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { createServer as createViteServer } from 'vite';
import { Resend } from 'resend';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Config endpoint to provide API keys to the frontend
  app.get('/api/config', (req, res) => {
    res.json({
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    });
  });

  // reCAPTCHA verification endpoint
  app.post('/api/verify-recaptcha', async (req, res) => {
    const { token } = req.body;
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    if (!secretKey) {
      console.error('RECAPTCHA_SECRET_KEY is missing in environment variables.');
      return res.status(500).json({ success: false, message: 'reCAPTCHA configuration error' });
    }

    try {
      const params = new URLSearchParams();
      params.append('secret', secretKey);
      params.append('response', token);

      const response = await axios.post(
        'https://www.google.com/recaptcha/api/siteverify',
        params
      );
      
      const { success, score, action } = response.data;
      
      // For v3, we check the score. Usually > 0.5 is safe.
      if (success && score !== undefined) {
        if (score < 0.5) {
          console.warn(`Low reCAPTCHA score: ${score} for action: ${action}`);
          return res.json({ success: false, message: 'Low trust score. Please try again.' });
        }
      }
      
      res.json(response.data);
    } catch (error) {
      console.error('reCAPTCHA verification error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // Feedback submission endpoint
  app.post('/api/send-feedback', async (req, res) => {
    const { token, rating, title, content, userEmail } = req.body;
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const apiKey = process.env.RESEND_API_KEY;

    if (!secretKey) {
      console.error('RECAPTCHA_SECRET_KEY is missing.');
      return res.status(500).json({ success: false, message: 'reCAPTCHA configuration error' });
    }

    // 1. Verify reCAPTCHA
    try {
      const params = new URLSearchParams();
      params.append('secret', secretKey);
      params.append('response', token);

      const recaptchaResponse = await axios.post(
        'https://www.google.com/recaptcha/api/siteverify',
        params
      );
      
      const { success, score } = recaptchaResponse.data;
      
      if (!success || (score !== undefined && score < 0.5)) {
        return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed' });
      }

      // 2. Send the email using Resend
      if (apiKey) {
        const resendClient = new Resend(apiKey);
        const { data, error } = await resendClient.emails.send({
          from: 'Feedback <onboarding@resend.dev>',
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

        if (error) {
          console.error('Resend API Error:', error);
          return res.status(500).json({ 
            success: false, 
            message: `Lỗi từ dịch vụ email: ${error.message}. Lưu ý: Nếu dùng tài khoản miễn phí, bạn chỉ có thể gửi đến email đã đăng ký với Resend.` 
          });
        }
        
        console.log('Email sent successfully:', data);
      } else {
        console.warn('RESEND_API_KEY is missing.');
        return res.status(500).json({ success: false, message: 'Chưa cấu hình RESEND_API_KEY trong Settings.' });
      }

      res.json({ success: true, message: 'Feedback sent successfully' });
    } catch (error: any) {
      console.error('Feedback submission error:', error);
      res.status(500).json({ success: false, message: `Lỗi hệ thống: ${error.message}` });
    }
  });

  // PDF extraction endpoint
  app.post('/api/extract-pdf', async (req, res) => {
    const { base64Data } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'Missing base64Data' });
    }

    try {
      const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(base64Content, 'base64');
      
      // Use the PDFParse class from the newer pdf-parse library
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      
      // Clean up the parser
      await parser.destroy();

      res.json({ text: result.text });
    } catch (error: any) {
      console.error('PDF extraction error:', error);
      res.status(500).json({ error: `Failed to extract PDF: ${error.message}` });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
