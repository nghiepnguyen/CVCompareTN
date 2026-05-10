import { onRequest } from "firebase-functions/v2/https";
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { PDFParse } from 'pdf-parse';
import { Resend } from 'resend';

const app = express();

// Enable CORS for all requests
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mount all routes under /api to match Hosting rewrites
const apiRouter = express.Router();

// Config endpoint to provide API keys to the frontend
apiRouter.get('/config', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`[Config] GEMINI_API_KEY exists: ${!!apiKey}`);
  
  return res.json({
    GEMINI_API_KEY: apiKey || '',
  });
});

// reCAPTCHA verification endpoint
apiRouter.post('/verify-recaptcha', async (req, res) => {
  const { token } = req.body;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY is missing.');
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
    const errorCodes = response.data['error-codes'];
    console.log(`[reCAPTCHA] result: success=${success}, score=${score}, action=${action}${errorCodes ? `, codes=${errorCodes}` : ''}`);
    
    // Threshold 0.1 for live to be more permissive during rollout
    if (success && (score === undefined || score >= 0.1)) {
      return res.json({ success: true, score });
    } else {
      console.warn(`reCAPTCHA verification failed or low score: ${score}`);
      return res.json({ success: false, score, message: 'Low trust score', detail: errorCodes });
    }
  } catch (error) {
    console.error('reCAPTCHA error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Feedback submission endpoint
apiRouter.post('/send-feedback', async (req, res) => {
  const { token, rating, title, content, userEmail } = req.body;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const apiKey = process.env.RESEND_API_KEY;

  if (!secretKey) {
    return res.status(500).json({ success: false, message: 'reCAPTCHA configuration missing' });
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
    const errorCodes = recaptchaResponse.data['error-codes'];
    console.log(`[Feedback reCAPTCHA] success=${success}, score=${score}${errorCodes ? `, codes=${errorCodes}` : ''}`);

    if (!success || (score !== undefined && score < 0.2)) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA failed', detail: errorCodes });
    }

    // 2. Send the email
    if (apiKey) {
      console.log(`[Feedback] Sending from CV Matcher <admin@thanhnghiep.top> to recipients`);
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
            <p><strong>Từ:</strong> ${userEmail || 'Ẩn danh'}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p><strong>Nội dung:</strong></p>
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
              ${content.replace(/\n/g, '<br/>')}
            </div>
          </div>
        `
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Welcome email endpoint
apiRouter.post('/send-welcome-email', async (req, res) => {
  const { token, userEmail, userName } = req.body;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const apiKey = process.env.RESEND_API_KEY;

  if (!secretKey) {
    return res.status(500).json({ success: false, message: 'reCAPTCHA configuration missing' });
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
    const errorCodes = recaptchaResponse.data['error-codes'];
    console.log(`[Welcome reCAPTCHA] success=${success}, score=${score}${errorCodes ? `, codes=${errorCodes}` : ''}`);

    // If success is false but score is passable on live, we might still want to proceed
    // for authenticated users, but for now we relax to 0.1
    if (!success || (score !== undefined && score < 0.1)) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed', detail: errorCodes });
    }

    // 2. Send the email using Resend
    if (apiKey) {
      console.log(`[Welcome] Sending to: ${userEmail}`);
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
              <p style="font-size: 16px; line-height: 1.6;">Chào <strong>${userName}</strong>,</p>
              <p style="font-size: 16px; line-height: 1.6;">Cảm ơn bạn đã tin tưởng sử dụng <strong>CV Matcher & Optimizer</strong>. Đây là công cụ giúp bạn phân tích CV dựa trên trí tuệ nhân tạo (Gemini AI), giúp bạn tối ưu hóa hồ sơ để vượt qua các hệ thống lọc ATS khắt khe nhất.</p>
              
              <div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 20px; margin: 25px 0;">
                <h3 style="margin-top: 0; color: #1e293b;">Bạn có thể làm gì ngay bây giờ?</h3>
                <ul style="padding-left: 20px; margin-bottom: 0;">
                  <li style="margin-bottom: 10px;">Phân tích CV khớp với mô tả công việc (JD).</li>
                  <li style="margin-bottom: 10px;">Nhận gợi ý sửa lỗi và chấm điểm ATS.</li>
                  <li>Sử dụng AI để viết lại các phần trong CV chuyên nghiệp hơn.</li>
                </ul>
              </div>

              <div style="text-align: center; margin: 40px 0;">
                <a href="https://cv.thanhnghiep.top" style="background: #4f46e5; color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">Trải nghiệm ngay</a>
              </div>

              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
              
              <p style="font-size: 14px; color: #64748b; margin-bottom: 0;">
                Nếu bạn cần hỗ trợ, đừng ngần ngại gửi phản hồi cho chúng tôi ngay trên ứng dụng.<br/>
                Chúc bạn sớm tìm được công việc ưng ý!
              </p>
            </div>
            
            <div style="text-align: center; padding: 20px; font-size: 12px; color: #94a3b8;">
              © 2024 CV Matcher & Optimizer. Powered by Gemini AI.<br/>
              Bạn nhận được email này vì đã đăng ký tài khoản tại <a href="https://cv.thanhnghiep.top" style="color: #4f46e5;">cv.thanhnghiep.top</a>
            </div>
          </div>
        `
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Welcome Email Error]', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// PDF extraction endpoint
apiRouter.post('/extract-pdf', async (req, res) => {
  const { base64Data } = req.body;
  if (!base64Data) return res.status(400).json({ error: 'Missing data' });

  try {
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Content, 'base64');
    
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();

    return res.json({ text: result.text });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.use('/api', apiRouter);

// Export the function as 'api'
export const api = onRequest({ 
  memory: "1GiB",
  timeoutSeconds: 300,
  cors: true,
  secrets: ["GEMINI_API_KEY", "RECAPTCHA_SECRET_KEY", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "FEEDBACK_RECIPIENT_EMAIL"]
}, app);

