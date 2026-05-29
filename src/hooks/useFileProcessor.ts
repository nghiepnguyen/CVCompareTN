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

export type ProcessedFile = { data: string; mimeType: string };

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

  // PDF → base64 data-URL
  if (isPdf) {
    const reader = new FileReader();
    const data = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { data, mimeType: "application/pdf" };
  }

  // DOCX → mammoth extraction
  if (isDocx) {
    const arrayBuffer = await file.arrayBuffer();
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { data: cleanText(result.value), mimeType: "text/plain" };
  }

  // Image → base64 data-URL
  if (isImage) {
    const reader = new FileReader();
    const data = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { data, mimeType: file.type };
  }

  // Fallback: read as plain text
  const text = await file.text();
  return { data: cleanText(text), mimeType: "text/plain" };
}