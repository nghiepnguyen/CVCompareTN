import { supabase } from './supabase';

/** The one JD file contract shared by every JD upload surface. Legacy .doc has no extractor. */
export const JD_FILE_ACCEPT = '.txt,.md,.pdf,.docx';

export type JdExtractErrorCode = 'unsupported' | 'empty' | 'failed';

export class JdExtractError extends Error {
  constructor(readonly code: JdExtractErrorCode, message: string) {
    super(message);
    this.name = 'JdExtractError';
  }
}

function extensionOf(name: string): string {
  return name.toLowerCase().match(/\.[^./]+$/)?.[0] ?? '';
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(
  file: File,
  executeRecaptcha?: (action: string) => Promise<string>
): Promise<string> {
  const pdfBase64 = await readAsDataURL(file);
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let recaptchaToken: string | undefined;
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  } else if (executeRecaptcha) {
    recaptchaToken = await executeRecaptcha('extract_pdf');
  }

  const response = await fetch('/api/extract-pdf', {
    method: 'POST',
    headers,
    body: JSON.stringify({ base64Data: pdfBase64, recaptchaToken }),
  });
  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.error) errorMsg = errorData.error;
    } catch { /* ignore parse errors */ }
    throw new JdExtractError('failed', errorMsg);
  }
  const extractData = await response.json();
  return typeof extractData.text === 'string' ? extractData.text : '';
}

/**
 * Extract JD text from an uploaded file. `accept` is only advisory, so the
 * extension is checked here and anything outside JD_FILE_ACCEPT is rejected
 * instead of being read as text (binary PDF/DOC bytes would otherwise become
 * the JD).
 */
export async function extractJdText(
  file: File,
  executeRecaptcha?: (action: string) => Promise<string>
): Promise<string> {
  const ext = extensionOf(file.name);
  let text: string;
  if (ext === '.txt' || ext === '.md') {
    text = await file.text();
  } else if (ext === '.pdf') {
    text = await extractPdfText(file, executeRecaptcha);
  } else if (ext === '.docx') {
    const mammoth = (await import('mammoth')).default;
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else {
    throw new JdExtractError('unsupported', `Unsupported JD file type: ${ext || file.name}`);
  }

  if (!text.trim()) {
    throw new JdExtractError('empty', 'Không thể trích xuất nội dung từ file này.');
  }
  return text;
}
