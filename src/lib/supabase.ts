import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | undefined;

export function isSupabaseReady(): boolean {
  return supabaseClient !== undefined;
}

function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey);
}

/** Load Supabase from Vite env (build) or /api/config (Vercel runtime). */
export async function bootstrapSupabase(): Promise<boolean> {
  if (supabaseClient) return true;

  const viteUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
  const viteKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

  if (viteUrl && viteKey) {
    supabaseClient = createSupabaseClient(viteUrl, viteKey);
    return true;
  }

  try {
    const res = await fetch('/api/config');
    if (!res.ok) return false;
    const data = (await res.json()) as Record<string, string | undefined>;
    const url = (data.VITE_SUPABASE_URL || data.SUPABASE_URL || '').trim();
    const key = (data.VITE_SUPABASE_ANON_KEY || data.SUPABASE_ANON_KEY || '').trim();
    if (url && key) {
      supabaseClient = createSupabaseClient(url, key);
      return true;
    }
  } catch (err) {
    console.error('[Supabase] Không tải được /api/config:', err);
  }

  return false;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!supabaseClient) {
      throw new Error(
        'Supabase chưa được cấu hình. Thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY (project Vercel cvcompare) rồi redeploy.'
      );
    }
    const value = Reflect.get(supabaseClient as object, prop, receiver);
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(supabaseClient);
    }
    return value;
  },
});

export const getSupabaseSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
};

export const getSupabaseUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};
