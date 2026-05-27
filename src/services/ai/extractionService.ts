import { getGeminiClient, GEMINI_MODEL } from "./geminiProvider";

export async function extractTextFromImage(
  imageData: string,
  mimeType: string
): Promise<string> {
  const client = await getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Hãy trích xuất toàn bộ văn bản từ hình ảnh này một cách chính xác nhất.",
            },
            {
              inlineData: {
                data: imageData.split(",")[1] || imageData,
                mimeType,
              },
            },
          ],
        },
      ],
    });
    return response.text || "";
  } catch (error) {
    console.error("Lỗi trích xuất ảnh:", error);
    throw new Error("Không thể trích xuất văn bản từ hình ảnh.");
  }
}

export async function extractJDFromUrl(url: string): Promise<string> {
  const isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  // === Strategy 1: Backend scrape (Vercel serverless or Express) ===
  const backendEndpoint = isLocal
    ? "/api/scrape-url/extract"
    : "/api/scrape-url";

  try {
    const response = await fetch(backendEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = (await response.json()) as { text?: string; error?: string };

    if (response.ok && data.text?.trim()) {
      return data.text;
    }

    throw new Error(data.error || `HTTP ${response.status}`);
  } catch (error: any) {
    const backendMsg = error?.message || "";
    console.warn("Backend scrape failed:", backendMsg);

    // Don't try Gemini fallback if backend returned a clear error —
    // Gemini can't browse URLs and will give useless/no output.
    // Better to fail fast and tell the user to paste manually.
    throw new Error(
      backendMsg.includes("403") || backendMsg.includes("từ chối")
        ? "Trang tuyển dụng chặn truy cập tự động. Vui lòng sao chép nội dung JD và dán vào ô văn bản."
        : backendMsg || "Không thể trích xuất nội dung từ liên kết này. Vui lòng sao chép nội dung JD và dán vào ô văn bản."
    );
  }
}