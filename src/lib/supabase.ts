import type { SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | undefined;
let initialization: Promise<boolean> | undefined;

export function isSupabaseReady(): boolean {
  return supabaseClient !== undefined;
}

async function initializeSupabase(): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Supabase initialization timed out'));
    }, 8000);
  });

  try {
    const viteUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
    const viteKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
    const config = viteUrl && viteKey
      ? Promise.resolve({ url: viteUrl, key: viteKey })
      : fetch('/api/config', { signal: controller.signal }).then(async (res) => {
          if (!res.ok) return { url: '', key: '' };
          const data = (await res.json()) as Record<string, string | undefined>;
          return {
            url: (data.VITE_SUPABASE_URL || data.SUPABASE_URL || '').trim(),
            key: (data.VITE_SUPABASE_ANON_KEY || data.SUPABASE_ANON_KEY || '').trim(),
          };
        });

    // Public content can render while the SDK and runtime config load together.
    const [{ createClient }, { url, key }] = await Promise.race([
      Promise.all([import('@supabase/supabase-js'), config]),
      deadline,
    ]);
    if (!url || !key) return false;
    supabaseClient = createClient(url, key);
    return true;
  } catch (err) {
    console.error('[Supabase] Không thể khởi tạo:', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Load once after first render; share in-flight work across StrictMode effects. */
export async function bootstrapSupabase(): Promise<boolean> {
  if (supabaseClient) return true;
  initialization ??= initializeSupabase().finally(() => { initialization = undefined; });
  return initialization;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!supabaseClient) {
      throw new Error(
        'Supabase chưa được cấu hình. Thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY (project Vercel cv-compare-tn) rồi redeploy.'
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

function isJwtError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST301' || /jwt/i.test(error.message ?? '');
}

/**
 * Retries a PostgREST query once after refreshing the session if it failed due to
 * an expired JWT (happens when a tab sits backgrounded past autoRefreshToken's timer).
 */
export async function withAuthRetry<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>
): Promise<{ data: T | null; error: { code?: string; message?: string } | null }> {
  const result = await queryFn();
  if (isJwtError(result.error)) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError) return await queryFn();
  }
  return result;
}
