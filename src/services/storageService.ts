import { auth, storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export async function uploadFileToStorage(file: File, path: string): Promise<string> {
  if (!auth.currentUser) throw new Error("Bạn cần đăng nhập để tải tệp lên.");
  
  try {
    const fileRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const snapshot = await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error("Lỗi khi tải tệp lên Storage:", error);
    throw new Error("Không thể tải tệp lên. Vui lòng thử lại.");
  }
}
