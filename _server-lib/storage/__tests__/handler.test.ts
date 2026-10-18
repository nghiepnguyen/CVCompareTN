import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn(), sign: vi.fn(), copy: vi.fn(), read: vi.fn(), remove: vi.fn() }));
vi.mock('../../payment/supabaseAdmin.js', () => ({ getUserFromBearerToken: mocks.user, getSupabaseAdmin: mocks.admin }));
vi.mock('../r2.js', () => ({ signUpload: mocks.sign, copyObject: mocks.copy, readObject: mocks.read, removeObject: mocks.remove }));
import { handleStorage } from '../handler.js';
describe('storage authorization', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.STORAGE_WRITE_PROVIDER = 'r2'; });
  it('rejects requests without a verified user', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await handleStorage(undefined, { action: 'upload' })).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('rejects unknown actions', async () => {
    mocks.user.mockResolvedValue({ id: 'owner' });
    expect((await handleStorage('Bearer token', { action: 'arbitrary' })).status).toBe(400);
  });
  it('does not allocate R2 uploads when rollout is disabled', async () => {
    process.env.STORAGE_WRITE_PROVIDER = 'supabase';
    mocks.user.mockResolvedValue({ id: 'owner' });
    expect((await handleStorage('Bearer token', { action: 'upload' })).status).toBe(409);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it('reserves only for the authenticated owner, ignoring client uid and key', async () => {
    mocks.user.mockResolvedValue({ id: 'owner' });
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'upload', staging_key: 'staging/owner/upload' }, error: null });
    mocks.admin.mockReturnValue({ rpc }); mocks.sign.mockResolvedValue('signed-url');
    const result = await handleStorage('Bearer token', { action: 'upload', purpose: 'temp', fileName: 'CV.pdf', mimeType: 'application/pdf', size: 100, uid: 'victim', key: 'victim/file' });
    expect(result.status).toBe(200);
    expect(rpc.mock.calls[0][1].p_user).toBe('owner');
    expect(mocks.sign).toHaveBeenCalledWith('temp', 'staging/owner/upload', 'application/pdf');
  });
});

describe('finalize publication boundary', () => {
  const id = '550e8400-e29b-41d4-a716-446655440000';
  beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: 'owner' }); });
  function database(row: Record<string, unknown>) {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }));
    const rpc = vi.fn(async (name: string) => name === 'storage_claim_upload' ? { data: [{ ...row, final_key: 'owner/r2/final', lease_token: 'claim' }], error: null } : { data: { ...row, status: 'ready', final_key: 'owner/r2/final' }, error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({ rpc, from: (table: string) => table === 'storage_cleanup_jobs' ? { upsert } : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }), update } });
    return { rpc, upsert };
  }
  it('returns an existing ready upload without copying or creating a second CV', async () => {
    const { rpc } = database({ id, user_id: 'owner', purpose: 'saved', status: 'ready', result_id: id, final_key: 'owner/final' });
    const result = await handleStorage('Bearer token', { action: 'finalize', uploadId: id });
    expect(result.status).toBe(200); expect(result.body.cvId).toBe(id);
    expect(rpc).not.toHaveBeenCalled(); expect(mocks.copy).not.toHaveBeenCalled();
  });
  it('does not publish bytes whose content mismatches the declared MIME', async () => {
    const bytes = Buffer.from('malicious non-PDF');
    const { rpc, upsert } = database({ id, user_id: 'owner', purpose: 'saved', status: 'pending', staging_key: 'staging/owner/id', file_size: bytes.length, mime_type: 'application/pdf' });
    mocks.copy.mockResolvedValue(undefined); mocks.read.mockResolvedValue(bytes);
    const result = await handleStorage('Bearer token', { action: 'finalize', uploadId: id });
    expect(result.status).toBe(400);
    expect(upsert).toHaveBeenCalled();
    expect(rpc.mock.calls.some(([name]) => name === 'storage_publish_upload')).toBe(false);
  });
  it('publishes only after copying and validating the server-only final object', async () => {
    const { default: sharp } = await import('sharp');
    const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).png().toBuffer();
    const { rpc } = database({ id, user_id: 'owner', purpose: 'temp', status: 'pending', staging_key: 'staging/owner/id', file_size: bytes.length, mime_type: 'image/png' });
    mocks.copy.mockResolvedValue(undefined); mocks.read.mockResolvedValue(bytes);
    const result = await handleStorage('Bearer token', { action: 'finalize', uploadId: id });
    expect(result.status).toBe(200); expect(result.body.reference).toBe(`r2:${id}`);
    expect(mocks.read).toHaveBeenCalledWith('temp', 'owner/r2/final', 15 * 1024 * 1024);
    expect(rpc.mock.calls[1][0]).toBe('storage_publish_upload');
  });
});
