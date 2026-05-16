import { Router } from 'express';

const router = Router();

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

router.get('/', (_req, res) => {
  res.json(publicConfig());
});

export default router;
