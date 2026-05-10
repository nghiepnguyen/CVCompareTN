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
    const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');

    if (isLocal) {
      console.log('Bypassing reCAPTCHA verification on localhost');
      return res.json({ success: true, score: 0.9, action: 'bypass' });
    }

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
      
      const { success, score, 'error-codes': errorCodes } = recaptchaResponse.data;
      console.log(`reCAPTCHA Result: success=${success}, score=${score}${errorCodes ? `, codes=${errorCodes}` : ''}`);

      const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');

      if (!success && !isLocal) {
        return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed', details: errorCodes });
      } else if (success && score !== undefined && score < 0.2 && !isLocal) {
        return res.status(400).json({ success: false, message: 'reCAPTCHA score too low' });
      }

      if (!success && isLocal) {
        console.warn('reCAPTCHA failed, but on localhost, allowing bypass.');
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

  // Welcome email endpoint
  app.post('/api/send-welcome-email', async (req, res) => {
    const { token, userEmail, userName } = req.body;
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
      
      const { success, score, 'error-codes': errorCodes } = recaptchaResponse.data;
      console.log(`reCAPTCHA Result: success=${success}, score=${score}${errorCodes ? `, codes=${errorCodes}` : ''}`);

      const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');

      if (!success && !isLocal) {
        return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed', details: errorCodes });
      } else if (success && score !== undefined && score < 0.2 && !isLocal) {
        return res.status(400).json({ success: false, message: 'reCAPTCHA score too low' });
      }

      if (!success && isLocal) {
        console.warn('reCAPTCHA failed, but on localhost, allowing bypass.');
      }

      // 2. Send the email using Resend
      if (apiKey) {
        console.log(`Đang chuẩn bị gửi email chào mừng tới: ${userEmail}`);
        const resendClient = new Resend(apiKey);
        const { data, error } = await resendClient.emails.send({
          from: `CV Matcher <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
          to: [userEmail],
          subject: 'Chào mừng bạn! Cùng tối ưu CV để chinh phục công việc mơ ước 🚀',
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 16px;">
              <h2 style="color: #4f46e5; margin-bottom: 24px;">Chào ${userName || 'bạn'},</h2>
              
              <p>Cảm ơn bạn đã tin tưởng lựa chọn <strong>CV Matcher</strong> làm người bạn đồng hành trên con đường phát triển sự nghiệp.</p>
              
              <p>Chúng tôi biết rằng mỗi bản CV đều chứa đựng tâm huyết và nỗ lực của bạn. Tuy nhiên, để lọt qua "mắt xanh" của các hệ thống lọc tự động (ATS) và các nhà tuyển dụng khó tính, một bản CV chuyên nghiệp thôi là chưa đủ — nó cần phải <strong>phù hợp</strong>.</p>
              
              <h3 style="color: #1e293b; margin-top: 32px;">Bạn có thể làm gì ngay bây giờ?</h3>
              <p>Chỉ với một thao tác tải lên đơn giản, công cụ của chúng tôi sẽ giúp bạn:</p>
              
              <ul style="list-style-type: none; padding: 0;">
                <li style="margin-bottom: 16px; padding: 12px; background-color: #f8fafc; border-radius: 12px; border-left: 4px solid #4f46e5;">
                  <strong>📊 Kiểm tra điểm tương thích ATS:</strong> Biết chính xác CV của bạn đạt bao nhiêu điểm so với yêu cầu của vị trí ứng tuyển.
                </li>
                <li style="margin-bottom: 16px; padding: 12px; background-color: #f8fafc; border-radius: 12px; border-left: 4px solid #4f46e5;">
                  <strong>🔍 Phân tích kỹ năng (Skill Gap):</strong> Chỉ ra những từ khóa hoặc kỹ năng quan trọng mà CV của bạn còn thiếu để bổ sung kịp thời.
                </li>
                <li style="margin-bottom: 16px; padding: 12px; background-color: #f8fafc; border-radius: 12px; border-left: 4px solid #4f46e5;">
                  <strong>📈 Ước lượng tỷ lệ trúng tuyển:</strong> Đưa ra dự đoán khách quan về khả năng được gọi phỏng vấn dựa trên dữ liệu phân tích.
                </li>
              </ul>
              
              <div style="margin-top: 40px; text-align: center;">
                <p style="font-weight: bold; margin-bottom: 20px;">Bạn đã sẵn sàng để xem CV của mình "mạnh" đến đâu chưa?</p>
                <a href="https://cv.thanhnghiep.top" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: bold; transition: background-color 0.3s ease;">
                  Thử so sánh CV ngay
                </a>
              </div>
              
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;" />
              
              <p style="font-size: 14px; color: #64748b;">Nếu có bất kỳ thắc mắc nào trong quá trình sử dụng, đừng ngần ngại phản hồi email này. Đội ngũ của chúng tôi luôn sẵn sàng hỗ trợ bạn.</p>
              <p style="font-size: 14px; color: #64748b;">Chúc bạn sớm tìm được bến đỗ ưng ý và bứt phá trong sự nghiệp!</p>
              
              <p style="margin-top: 24px; font-weight: bold;">Trân trọng,<br>Đội ngũ CV Matcher</p>
            </div>
          `
        });

        if (error) {
          console.error('Lỗi Resend API khi gửi Email chào mừng:', JSON.stringify(error, null, 2));
          return res.status(500).json({ success: false, message: 'Lỗi dịch vụ email', detail: error });
        }
        
        console.log('Welcome email sent successfully to:', userEmail);
      } else {
        console.warn('RESEND_API_KEY is missing.');
        return res.status(500).json({ success: false, message: 'Cấu hình Resend thiếu' });
      }

      res.json({ success: true, message: 'Welcome email sent successfully' });
    } catch (error: any) {
      console.error('Welcome email error:', error);
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
