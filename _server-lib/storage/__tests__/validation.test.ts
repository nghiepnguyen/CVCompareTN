import { describe, expect, it } from 'vitest';
import { assertOwnedKey, validateUpload, validateContent, parseTempReference } from '../validation.js';
describe('storage trust boundary', () => {
  it('rejects traversal before a service-role storage request', () => {
    for (const path of ['owner/../victim/file', 'owner/%2e%2e/victim', 'owner//file', 'victim/file', 'owner/./file', 'owner/a\\b']) expect(() => assertOwnedKey(path, 'owner')).toThrow();
    expect(() => assertOwnedKey('owner/folder/CV..pdf', 'owner')).not.toThrow();
  });
  it('rejects unbounded uploads and unsupported purposes', () => {
    expect(() => validateUpload({ purpose: 'temp', fileName: 'a.pdf', mimeType: 'application/pdf', size: 16 * 1024 * 1024 })).toThrow();
    expect(() => validateUpload({ purpose: 'admin', fileName: 'a.pdf', mimeType: 'application/pdf', size: 2 })).toThrow();
    expect(() => validateUpload({ purpose: 'saved', fileName: 'a.exe', mimeType: 'application/octet-stream', size: 2 })).toThrow();
  });
  it('does not trust a claimed PDF MIME type', async () => {
    await expect(validateContent(Buffer.from('not a PDF'), 'application/pdf')).rejects.toThrow();
  });
  it('does not trust a claimed image MIME type', async () => {
    await expect(validateContent(Buffer.from('%PDF-1.7 fake'), 'image/png')).rejects.toThrow();
  });
  it('accepts valid upload metadata without accepting client-owned keys', () => {
    const result = validateUpload({ purpose: 'temp', fileName: 'CV.pdf', mimeType: 'application/pdf', size: 100, key: 'victim/key' });
    expect(result).toEqual({ purpose: 'temp', fileName: 'CV.pdf', mimeType: 'application/pdf', size: 100, campaignId: null });
  });
  it('uses explicit R2 references while preserving legacy Supabase paths', () => {
    expect(parseTempReference('user/file.pdf')).toBeNull();
    expect(parseTempReference('r2:550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(() => parseTempReference('r2:../victim')).toThrow();
  });
});
