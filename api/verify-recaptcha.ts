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
    
    const { success, score } = response.data;
    
    if (success && (score === undefined || score >= 0.5)) {
      return res.status(200).json(response.data);
    } else {
      return res.status(200).json({ success: false, score, message: 'Low trust score' });
    }
  } catch (error) {
    console.error('reCAPTCHA error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
