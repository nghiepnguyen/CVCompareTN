import { Router } from 'express';
import { PDFParse } from 'pdf-parse';

const router = Router();

router.post('/extract', async (req, res) => {
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

    res.json({ text: result.text });
  } catch (error: any) {
    console.error('PDF extraction error:', error);
    res.status(500).json({ error: `Failed to extract PDF: ${error.message}` });
  }
});

export default router;
