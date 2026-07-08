import { uploadTempAnalysisFile } from "../services/cvService";

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

export type ProcessedFile = {
  data: string;
  mimeType: string;
  pdfInlineData?: string;
  pdfStoragePath?: string;
  dataStoragePath?: string;
};

// Max raw-binary size we'll inline into the Gemini request as base64 (base64
// inflates by ~33%; keeps the JSON body small and the request fast). Above
// this, the raw file is uploaded to Supabase Storage instead (see
// uploadTempAnalysisFile) and only a storage path is sent in the body — this
// removes Vercel's ~4.5MB serverless body limit as a constraint entirely.
export const MAX_INLINE_BINARY_SIZE = 2 * 1024 * 1024;

// Max raw file size we'll accept at all (upload to Storage above the inline
// threshold, reject above this). Matches the `cv-analyze-tmp` bucket's
// `file_size_limit` (see supabase/migrations/20260708000000_cv_analyze_tmp_bucket.sql).
export const MAX_STORAGE_UPLOAD_SIZE = 15 * 1024 * 1024;

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
 * suitable for the Gemini analysis pipeline. Raw binary data above
 * MAX_INLINE_BINARY_SIZE is uploaded to Supabase Storage instead of being
 * inlined, so `uid` is required to scope the upload path.
 */
export async function processFile(
  file: File,
  uid: string
): Promise<ProcessedFile> {
  const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
  const isDocx = file.name.endsWith(".docx");
  const isImage = file.type.startsWith("image/");

  // PDF → extract text via unpdf (avoids exposing Gemini key for multimodal)
  if (isPdf) {
    const arrayBuffer = await file.arrayBuffer();
    const { extractText } = await import('unpdf');
    const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
    const cleaned = cleanText(text);

    if (file.size > MAX_STORAGE_UPLOAD_SIZE) {
      if (!cleaned) {
        throw new Error(
          `Không thể đọc nội dung "${file.name}". PDF dạng scan/ảnh không được hỗ trợ — vui lòng chuyển sang PDF có thể chọn text hoặc dán nội dung thủ công.`
        );
      }
      return { data: cleaned, mimeType: 'text/plain' };
    }

    if (!cleaned) {
      // Scanned/image-only PDF: no extractable text. Fall back to sending the
      // raw file so Gemini can read it visually, instead of hard-failing.
      if (file.size <= MAX_INLINE_BINARY_SIZE) {
        const data = await readAsDataURL(file);
        return { data, mimeType: 'application/pdf' };
      }
      const dataStoragePath = await uploadTempAnalysisFile(uid, file);
      return { data: '', mimeType: 'application/pdf', dataStoragePath };
    }

    // Text extracted fine — also attach the original PDF (when small enough)
    // so Gemini can additionally assess real layout/format (ATS parseability).
    if (file.size <= MAX_INLINE_BINARY_SIZE) {
      const pdfInlineData = await readAsDataURL(file);
      return { data: cleaned, mimeType: 'text/plain', pdfInlineData };
    }
    const pdfStoragePath = await uploadTempAnalysisFile(uid, file);
    return { data: cleaned, mimeType: 'text/plain', pdfStoragePath };
  }

  // DOCX → mammoth extraction
  if (isDocx) {
    const arrayBuffer = await file.arrayBuffer();
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { data: cleanText(result.value), mimeType: "text/plain" };
  }

  // Image → base64 data-URL when small, Storage upload otherwise
  if (isImage) {
    if (file.size > MAX_STORAGE_UPLOAD_SIZE) {
      throw new Error('Ảnh quá lớn (tối đa 15MB). Vui lòng chuyển đổi sang PDF.');
    }
    if (file.size <= MAX_INLINE_BINARY_SIZE) {
      const data = await readAsDataURL(file);
      return { data, mimeType: file.type };
    }
    const dataStoragePath = await uploadTempAnalysisFile(uid, file);
    return { data: '', mimeType: file.type, dataStoragePath };
  }

  // Fallback: read as plain text
  const text = await file.text();
  return { data: cleanText(text), mimeType: "text/plain" };
}