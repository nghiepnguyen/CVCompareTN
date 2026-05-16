import { supabase } from "../lib/supabase";

export async function uploadFileToStorage(file: File, path: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Bạn cần đăng nhập để tải tệp lên.");
  
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `${path}/${fileName}`;

    // Note: 'cv-files' bucket must exist in Supabase Storage
    const { data, error } = await supabase.storage
      .from('cv-files')
      .upload(filePath, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('cv-files')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error: any) {
    console.error("Lỗi khi tải tệp lên Storage:", error);
    throw new Error("Không thể tải tệp lên: " + error.message);
  }
}
