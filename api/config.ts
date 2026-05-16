import type { VercelRequest, VercelResponse } from '@vercel/node';

function publicConfig() {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    '';
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    '';

  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
  };
}

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json(publicConfig());
}
