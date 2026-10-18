import { inflateRawSync } from 'node:zlib';
export class StorageError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export type Purpose = 'temp' | 'saved' | 'candidate';
const TYPES = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp']);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateUpload(body: Record<string, unknown>) {
  const { purpose, fileName, mimeType, size } = body;
  if (purpose !== 'temp' && purpose !== 'saved' && purpose !== 'candidate') throw new StorageError('Mục đích lưu file không hợp lệ');
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 255) throw new StorageError('Tên file không hợp lệ');
  if (typeof mimeType !== 'string' || !TYPES.has(mimeType)) throw new StorageError('Định dạng file không được hỗ trợ');
  const limit = (purpose === 'temp' ? 15 : 50) * 1024 * 1024;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > limit) throw new StorageError('Dung lượng file không hợp lệ');
  const campaignId = purpose === 'candidate' ? body.campaignId : null;
  if (purpose === 'candidate' && (typeof campaignId !== 'string' || !UUID.test(campaignId))) throw new StorageError('Chiến dịch không hợp lệ');
  return { purpose: purpose as Purpose, fileName: fileName.trim(), mimeType, size, campaignId: campaignId as string | null };
}
export function parseTempReference(path: string): string | null {
  if (!path.startsWith('r2:')) return null;
  const id = path.slice(3);
  if (!UUID.test(id)) throw new StorageError('Tham chiếu file không hợp lệ');
  return id;
}
export function assertOwnedKey(path: string, userId: string): void {
  const parts = path.split('/');
  if (path.length > 1024 || parts[0] !== userId || parts.length < 2 || parts.some(p => !p || p === '.' || p === '..') || /[%\\]/.test(path)) throw new StorageError('File không thuộc tài khoản', 403);
}
export async function validateContent(data: Buffer, mime: string): Promise<void> {
  let valid = false;
  if (mime === 'application/pdf') {
    valid = data.subarray(0, 5).toString() === '%PDF-';
    if (valid) {
      const { getDocumentProxy, extractText } = await import('unpdf');
      const document = await getDocumentProxy(new Uint8Array(data));
      try {
        if (document.numPages > 500) throw new StorageError('PDF vượt giới hạn 500 trang');
        await extractText(document, { mergePages: true });
      } finally { await document.destroy(); }
    }
  } else if (mime.startsWith('image/')) {
    const { default: sharp } = await import('sharp');
    const image = sharp(data, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    const expected = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[mime];
    valid = !!expected && metadata.format === expected && (metadata.pages ?? 1) === 1;
    if (valid) await image.stats();
  } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    valid = data.subarray(0, 2).toString() === 'PK';
    if (valid) {
      validateDocxArchive(data);
      const { extractRawText } = await import('mammoth');
      await extractRawText({ buffer: data });
    }
  } else if (mime === 'application/msword') {
    valid = data.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11e0', 'hex'));
  }
  if (!valid) throw new StorageError('Nội dung file không khớp định dạng đã khai báo');
}

// Bound inflated ZIP size before mammoth decompresses an untrusted DOCX.
function validateDocxArchive(data: Buffer): void {
  let end = data.length - 22;
  while (end >= Math.max(0, data.length - 65557) && data.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || end < data.length - 65557) throw new StorageError('DOCX ZIP không hợp lệ');
  const count = data.readUInt16LE(end + 10); let pos = data.readUInt32LE(end + 16); let inflated = 0; let hasDocument = false;
  if (count > 2000 || data.readUInt16LE(end + 4) !== 0 || data.readUInt16LE(end + 6) !== 0) throw new StorageError('DOCX ZIP vượt giới hạn');
  for (let i = 0; i < count; i++) {
    if (pos + 46 > data.length || data.readUInt32LE(pos) !== 0x02014b50) throw new StorageError('DOCX ZIP không hợp lệ');
    inflated += data.readUInt32LE(pos + 24);
    const nameSize = data.readUInt16LE(pos + 28);
    if (inflated > 100 * 1024 * 1024 || data.readUInt16LE(pos + 8) & 1) throw new StorageError('DOCX giải nén vượt giới hạn');
    const local = data.readUInt32LE(pos + 42);
    if (local + 30 > data.length || data.readUInt32LE(local) !== 0x04034b50) throw new StorageError('DOCX ZIP không hợp lệ');
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const compressedSize = data.readUInt32LE(pos + 20);
    const expectedSize = data.readUInt32LE(pos + 24);
    if (start + compressedSize > data.length) throw new StorageError('DOCX ZIP không đầy đủ');
    const method = data.readUInt16LE(pos + 10);
    const compressed = data.subarray(start, start + compressedSize);
    const unpacked = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, expectedSize) }) : null;
    if (!unpacked || unpacked.length !== expectedSize) throw new StorageError('DOCX ZIP không hợp lệ');
    const name = data.subarray(pos + 46, pos + 46 + nameSize).toString();
    if (name === 'word/document.xml') hasDocument = true;
    pos += 46 + nameSize + data.readUInt16LE(pos + 30) + data.readUInt16LE(pos + 32);
  }
  if (!hasDocument) throw new StorageError('Không tìm thấy nội dung DOCX');
}
