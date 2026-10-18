import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getUserById: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser, admin: { getUserById: mocks.getUserById } } }) }));
import { getUserFromBearerToken } from '../supabaseAdmin.js';
describe('bearer token verification', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
    vi.clearAllMocks();
  });
  it('rejects a forged JWT even when its subject is an existing user', async () => {
    const token = `e30.${Buffer.from(JSON.stringify({ sub: 'victim' })).toString('base64url')}.forged`;
    mocks.getUserById.mockResolvedValue({ data: { user: { id: 'victim' } }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Invalid JWT') });
    expect(await getUserFromBearerToken(`Bearer ${token}`)).toBeNull();
    expect(mocks.getUser).toHaveBeenCalledWith(token);
  });
  it('verifies every supplied token rather than caching by unverified subject', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner', email: 'owner@example.com' } }, error: null });
    expect(await getUserFromBearerToken('Bearer valid-token')).toEqual({ id: 'owner', email: 'owner@example.com' });
    expect(mocks.getUser).toHaveBeenCalledWith('valid-token');
  });
});
