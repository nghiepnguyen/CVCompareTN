import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageError } from './validation.js';
export type BucketKind = 'temp' | 'saved';
let client: S3Client | undefined;
export function r2Client(): S3Client {
  if (client) return client;
  const account = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !accessKeyId || !secretAccessKey) throw new StorageError('R2 chưa được cấu hình', 503);
  client = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey }, maxAttempts: 2, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  return client;
}
export function bucket(kind: BucketKind): string {
  const name = process.env[kind === 'temp' ? 'R2_TEMP_BUCKET' : 'R2_CV_BUCKET']?.trim();
  if (!name) throw new StorageError('R2 bucket chưa được cấu hình', 503);
  return name;
}
// Request-path callers pass their own deadline signal; others keep 45s per command.
const options = (signal?: AbortSignal) => ({ abortSignal: signal ?? AbortSignal.timeout(45000) });
export async function signUpload(kind: BucketKind, key: string, mime: string): Promise<string> {
  return getSignedUrl(r2Client(), new PutObjectCommand({ Bucket: bucket(kind), Key: key, ContentType: mime }), { expiresIn: 300, signableHeaders: new Set(['content-type']) });
}
export async function signDownload(kind: BucketKind, key: string): Promise<string> {
  return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: bucket(kind), Key: key, ResponseCacheControl: 'private, no-store', ResponseContentDisposition: 'attachment' }), { expiresIn: 120 });
}
export async function copyObject(kind: BucketKind, source: string, target: string): Promise<void> {
  const name = bucket(kind);
  await r2Client().send(new CopyObjectCommand({ Bucket: name, Key: target, CopySource: `${name}/${source.split('/').map(encodeURIComponent).join('/')}` }), options());
}
// With `signal`, HEAD, GET and the body read all share that one deadline.
export async function readObject(kind: BucketKind, key: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  const head = await r2Client().send(new HeadObjectCommand({ Bucket: bucket(kind), Key: key }), options(signal));
  if (head.ContentLength === undefined || head.ContentLength > maxBytes || head.ContentLength <= 0) throw new StorageError('Dung lượng file không hợp lệ');
  const result = await r2Client().send(new GetObjectCommand({ Bucket: bucket(kind), Key: key, IfMatch: head.ETag }), options(signal));
  if (!result.Body) throw new StorageError('Không đọc được file');
  const chunks: Buffer[] = []; let size = 0;
  // Abort also tears down a body that is still streaming.
  const abortBody = () => (result.Body as unknown as { destroy?: (e?: unknown) => void }).destroy?.(signal?.reason);
  signal?.addEventListener('abort', abortBody, { once: true });
  try {
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > maxBytes) throw new StorageError('File vượt giới hạn');
      chunks.push(Buffer.from(chunk));
    }
  } finally {
    signal?.removeEventListener('abort', abortBody);
    const stream = result.Body as unknown as { destroy?: () => void };
    stream.destroy?.();
  }
  if (size !== head.ContentLength) throw new StorageError('File chưa được tải đầy đủ');
  return Buffer.concat(chunks);
}
export async function removeObject(kind: BucketKind, key: string): Promise<void> {
  await r2Client().send(new DeleteObjectCommand({ Bucket: bucket(kind), Key: key }), options());
}
export async function listObjects(kind: BucketKind, prefix: string): Promise<{ keys: string[]; more: boolean }> {
  const result = await r2Client().send(new ListObjectsV2Command({ Bucket: bucket(kind), Prefix: prefix, MaxKeys: 100 }), options());
  return { keys: (result.Contents ?? []).flatMap(o => o.Key ? [o.Key] : []), more: !!result.IsTruncated };
}
