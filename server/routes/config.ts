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
    storageWriteProvider: process.env.STORAGE_WRITE_PROVIDER === 'r2' ? 'r2' : 'supabase',
    storageR2Purposes: (process.env.STORAGE_R2_PURPOSES || 'temp').split(',').map(s => s.trim()).filter(s => ['temp', 'saved', 'candidate'].includes(s)),
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
  };
}

router.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(publicConfig());
});

export default router;
