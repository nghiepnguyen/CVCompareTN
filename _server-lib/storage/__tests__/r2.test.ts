import { afterEach, expect, it, vi } from 'vitest';
import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { readObject, signUpload } from '../r2.js';
afterEach(() => vi.restoreAllMocks());
it('signs only a staging key with a short expiry and keeps credentials out of the response', async () => {
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32); process.env.R2_ACCESS_KEY_ID = 'test-access'; process.env.R2_SECRET_ACCESS_KEY = 'never-send-this-secret'; process.env.R2_TEMP_BUCKET = 'test-temp';
  const url = new URL(await signUpload('temp', 'staging/owner/upload', 'application/pdf'));
  expect(url.hostname).toContain('.r2.cloudflarestorage.com');
  expect(url.pathname).toContain('staging/owner/upload');
  expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
  expect(url.toString()).not.toContain('never-send-this-secret');
});
it('rejects an oversized object before downloading binary', async () => {
  const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({ ContentLength: 100 } as never);
  await expect(readObject('temp', 'file', 10)).rejects.toThrow('Dung lượng');
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
});
it('bounds the stream even when object metadata under-reports size', async () => {
  const destroy = vi.fn();
  const stream = { async *[Symbol.asyncIterator]() { yield Buffer.alloc(11); }, destroy };
  const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({ ContentLength: 5, ETag: 'etag' } as never).mockResolvedValueOnce({ Body: stream } as never);
  await expect(readObject('temp', 'file', 10)).rejects.toThrow('giới hạn');
  expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
  expect(destroy).toHaveBeenCalled();
});
