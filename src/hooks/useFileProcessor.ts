/**
 * Pure utility: cleans text by normalising whitespace and line endings.
 * Extracted from AnalysisRunContext to keep the provider lean.
 */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

export type ProcessedFile = { data: string; mimeType: string; pdfInlineData?: string };

// Max raw-binary size we'll inline into the Gemini request (base64 inflates by
// ~33%; keeps the payload well within Vercel's ~4.5MB serverless body limit
// alongside the JD/prompt text). Reused for both images and PDF visual data.
export const MAX_INLINE_BINARY_SIZE = 2 * 1024 * 1024;

function readAsDataURL(file: File): Promise<string> {
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a File into a base64 data-URL or plain-text representation
 * suitable for the Gemini analysis pipeline.
 */
export async function processFile(
  file: File
): Promise<ProcessedFile> {
  const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
  const isDocx = file.name.endsWith(".docx");
  const isImage = file.type.startsWith("image/");

  // PDF → extract text via unpdf (avoids exposing Gemini key for multimodal; also stays within Vercel 4.5MB body limit)
  if (isPdf) {
    const arrayBuffer = await file.arrayBuffer();
    const { extractText } = await import('unpdf');
    const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
    const cleaned = cleanText(text);
    const withinInlineBudget = file.size <= MAX_INLINE_BINARY_SIZE;

    if (!cleaned) {
      // Scanned/image-only PDF: no extractable text. Fall back to sending the
      // raw file so Gemini can read it visually, instead of hard-failing.
      if (withinInlineBudget) {
        const data = await readAsDataURL(file);
        return { data, mimeType: 'application/pdf' };
      }
      throw new Error(
        `Không thể đọc nội dung "${file.name}". PDF dạng scan/ảnh không được hỗ trợ — vui lòng chuyển sang PDF có thể chọn text hoặc dán nội dung thủ công.`
      );
    }

    // Text extracted fine — also attach the original PDF (when small enough)
    // so Gemini can additionally assess real layout/format (ATS parseability).
    if (withinInlineBudget) {
      const pdfInlineData = await readAsDataURL(file);
      return { data: cleaned, mimeType: 'text/plain', pdfInlineData };
    }
    return { data: cleaned, mimeType: 'text/plain' };
  }

  // DOCX → mammoth extraction
  if (isDocx) {
    const arrayBuffer = await file.arrayBuffer();
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { data: cleanText(result.value), mimeType: "text/plain" };
  }

  // Image → base64 data-URL (max 2MB to stay within Vercel 4.5MB body limit after base64 encoding)
  if (isImage) {
    if (file.size > MAX_INLINE_BINARY_SIZE) {
      throw new Error('Ảnh quá lớn (tối đa 2MB). Vui lòng chuyển đổi sang PDF.');
    }
    const data = await readAsDataURL(file);
    return { data, mimeType: file.type };
  }

  // Fallback: read as plain text
  const text = await file.text();
  return { data: cleanText(text), mimeType: "text/plain" };
}