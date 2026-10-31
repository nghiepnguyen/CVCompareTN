import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handlePreflight } from '../_server-lib/http/guard.js';

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

export default function handler(_req: VercelRequest, res: VercelResponse) {
  applyCors(_req, res);
  if (handlePreflight(_req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(publicConfig());
}
