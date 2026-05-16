import { getGeminiClient, GEMINI_MODEL } from "./geminiProvider";

export async function extractTextFromImage(imageData: string, mimeType: string): Promise<string> {
  const client = await getGeminiClient();
  
  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: "Hãy trích xuất toàn bộ văn bản từ hình ảnh này một cách chính xác nhất." },
          { inlineData: { data: imageData.split(",")[1] || imageData, mimeType } }
        ]
      }]
    });
    return response.text || "";
  } catch (error) {
    console.error("Lỗi trích xuất ảnh:", error);
    throw new Error("Không thể trích xuất văn bản từ hình ảnh.");
  }
}

export async function extractJDFromUrl(url: string): Promise<string> {
  const client = await getGeminiClient();
  
  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: [{ text: `Hãy trích xuất toàn bộ nội dung Mô tả công việc chi tiết từ URL này: ${url}` }]
      }]
    });
    return response.text || "";
  } catch (error) {
    console.error("Lỗi trích xuất URL:", error);
    throw new Error("Không thể trích xuất nội dung từ liên kết này.");
  }
}
