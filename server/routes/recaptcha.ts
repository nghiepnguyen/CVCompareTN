import { Router } from 'express';
import axios from 'axios';

const router = Router();

router.post('/', async (req, res) => {
  const { token } = req.body;
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const isLocal = process.env.NODE_ENV !== 'production' || req.headers.host?.includes('localhost');

  if (isLocal) {
    console.log('Bypassing reCAPTCHA verification on localhost');
    return res.json({ success: true, score: 0.9, action: 'bypass' });
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
      return res.json({ success: false, message: 'reCAPTCHA verification failed.', errorCodes: response.data['error-codes'] });
    }

    if (score !== undefined && score < 0.3) {
      console.warn(`reCAPTCHA very low score: ${score} for action: ${action} — possible bot`);
    }

    res.json({ ...response.data, success: true });
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
