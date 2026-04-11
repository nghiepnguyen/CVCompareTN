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
  res.json({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
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
    
    if (success && score !== undefined) {
      if (score < 0.5) {
        console.warn(`Low reCAPTCHA score: ${score} for action: ${action}`);
        return res.json({ success: false, message: 'Low trust score' });
      }
    }
    
    return res.json(response.data);
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
    if (!success || (score !== undefined && score < 0.5)) {
      return res.status(400).json({ success: false, message: 'reCAPTCHA failed' });
    }

    // 2. Send the email
    if (apiKey) {
      const resendClient = new Resend(apiKey);
      await resendClient.emails.send({
        from: 'Feedback <onboarding@resend.dev>',
        to: ['thanhnghiep.top@gmail.com'],
        subject: `Feedback: ${title}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>Phản hồi mới</h2>
            <p><strong>Rating:</strong> ${rating}/5</p>
            <p><strong>Từ:</strong> ${userEmail || 'Ẩn danh'}</p>
            <p><strong>Nội dung:</strong> ${content}</p>
          </div>
        `
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
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
  cors: true
}, app);

