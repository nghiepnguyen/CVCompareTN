/** Returns the first missing server env var name, or null if payment stack is configured. */
export function getMissingPaymentEnv(): string | null {
  if (!process.env.PAYOS_CLIENT_ID?.trim()) return 'PAYOS_CLIENT_ID';
  if (!process.env.PAYOS_API_KEY?.trim()) return 'PAYOS_API_KEY';
  if (!process.env.PAYOS_CHECKSUM_KEY?.trim()) return 'PAYOS_CHECKSUM_KEY';
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return 'SUPABASE_SERVICE_ROLE_KEY';

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    '';
  if (!supabaseUrl) return 'SUPABASE_URL or VITE_SUPABASE_URL';

  return null;
}

export function paymentConfigErrorBody(missing: string): Record<string, unknown> {
  return {
    error:
      'Cấu hình thanh toán trên server chưa đủ. Thêm biến môi trường trên Vercel (Production) rồi redeploy.',
    missingEnv: missing,
  };
}
