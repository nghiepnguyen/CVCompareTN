import { Router } from 'express';
import { extractText } from 'unpdf';

const router = Router();

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB decoded
const PDF_HEADER = Buffer.from('%PDF-');

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).equals(PDF_HEADER);
}

router.post('/', async (req, res) => {
  const { base64Data } = req.body;
  if (!base64Data) {
    return res.status(400).json({ error: 'Missing base64Data' });
  }

  try {
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Content, 'base64');

    if (buffer.length > MAX_PDF_SIZE) {
      return res.status(400).json({ error: `PDF too large (max ${MAX_PDF_SIZE / (1024 * 1024)}MB)` });
    }

    if (!isPdfBuffer(buffer)) {
      return res.status(400).json({ error: 'File is not a valid PDF' });
    }

    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });

    res.json({ text });
  } catch (error: unknown) {
    console.error('PDF extraction error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to extract PDF: ${message}` });
  }
});

export default router;
