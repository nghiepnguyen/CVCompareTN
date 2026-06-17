import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token } = req.body;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');

  if (isLocal) {
    console.log('Bypassing reCAPTCHA verification on localhost');
    return res.status(200).json({ success: true, score: 0.9, action: 'bypass' });
  }

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

    if (!success) {
      console.warn(`reCAPTCHA failed for action "${action}":`, response.data['error-codes']);
      return res.status(200).json({ success: false, message: 'reCAPTCHA verification failed.', errorCodes: response.data['error-codes'] });
    }

    if (score !== undefined && score < 0.3) {
      console.warn(`reCAPTCHA very low score: ${score} for action: ${action} — possible bot`);
    }

    return res.status(200).json({ ...response.data, success: true });
  } catch (error) {
    console.error('reCAPTCHA error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
