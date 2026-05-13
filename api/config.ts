import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Config endpoint to provide API keys to the frontend
  const apiKey = process.env.GEMINI_API_KEY;
  
  return res.status(200).json({
    GEMINI_API_KEY: apiKey || '',
  });
}
