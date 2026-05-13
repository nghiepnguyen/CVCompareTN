import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PDFParse } from 'pdf-parse';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { base64Data } = req.body;
  if (!base64Data) {
    return res.status(400).json({ error: 'Missing base64Data' });
  }

  try {
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Content, 'base64');
    
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();

    return res.status(200).json({ text: result.text });
  } catch (error: any) {
    console.error('PDF extraction error:', error);
    return res.status(500).json({ error: `Failed to extract PDF: ${error.message}` });
  }
}
