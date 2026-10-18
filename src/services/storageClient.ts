import { supabase } from '../lib/supabase';
export async function storageRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Vui lòng đăng nhập');
  const response = await fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không thể xử lý file');
  return result as T;
}
export async function useR2Uploads(purpose: 'temp' | 'saved' | 'candidate'): Promise<boolean> {
  const response = await fetch('/api/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Không lấy được cấu hình lưu trữ');
  const config = await response.json();
  return config.storageWriteProvider === 'r2' && Array.isArray(config.storageR2Purposes) && config.storageR2Purposes.includes(purpose);
}
export async function uploadR2(file: File, purpose: 'temp' | 'saved' | 'candidate', campaignId?: string): Promise<{ uploadId: string; filePath: string; cvId: string; candidateId?: string; reference?: string }> {
  const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : file.name.toLowerCase().endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/octet-stream');
  const upload = await storageRequest<{ uploadId: string; url: string }>({ action: 'upload', purpose, fileName: file.name, mimeType, size: file.size, campaignId });
  const response = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
  if (!response.ok) throw new Error('Upload file thất bại. Vui lòng thử lại.');
  return storageRequest({ action: 'finalize', uploadId: upload.uploadId });
}
export async function getPrivateFileUrl(filePath: string): Promise<string> {
  return (await storageRequest<{ url: string }>({ action: 'download', filePath })).url;
}
