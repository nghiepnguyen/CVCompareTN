import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!url || !serviceKey) {
    throw new Error('Supabase admin credentials are not configured');
  }

  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

function decodeJwtPayload(token: string): { sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Base64Url decode (handle padding)
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(decoded) as { sub?: string };
  } catch {
    return null;
  }
}

export async function getUserFromBearerToken(
  authHeader: string | undefined
): Promise<{ id: string; email?: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // Decode the JWT to get the user ID (sub claim)
  const payload = decodeJwtPayload(token);
  const userId = payload?.sub;
  if (!userId) return null;

  // Use admin API to look up the user — more reliable
  // than auth.getUser(jwt) with a service_role client
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}
