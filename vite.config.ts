import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    // No build-time Google tag (removed 2026-11: it loaded gtag.js and sent
    // cookieless pings before consent). src/lib/ga4.ts loads GA4 only after the
    // user accepts analytics.
    plugins: [react(), tailwindcss()],
    // Sentry environment/release for the browser. Only these two non-secret Vercel system values are exposed.
    define: {
      'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(env.VERCEL_ENV ?? ''),
      'import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA': JSON.stringify(env.VERCEL_GIT_COMMIT_SHA ?? ''),
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {},
      },
    },
    resolve: {
      alias: [{ find: '@', replacement: path.resolve(__dirname, '.') }],
    },
    build: {
      chunkSizeWarningLimit: 1800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/react-is/') ||
              id.includes('/node_modules/scheduler/')
            ) return 'vendor-react';

            if (
              id.includes('/node_modules/motion/') ||
              id.includes('/node_modules/lucide-react/') ||
              id.includes('/node_modules/clsx/') ||
              id.includes('/node_modules/tailwind-merge/')
            ) return 'vendor-ui';

            if (id.includes('/node_modules/recharts/') || id.includes('/node_modules/victory-vendor/'))
              return 'vendor-charts';

            if (
              id.includes('/node_modules/react-markdown/') ||
              id.includes('/node_modules/remark-') ||
              id.includes('/node_modules/rehype-') ||
              id.includes('/node_modules/unified/') ||
              id.includes('/node_modules/hast') ||
              id.includes('/node_modules/mdast') ||
              id.includes('/node_modules/micromark')
            ) return 'vendor-markdown';

            if (id.includes('/node_modules/axios/')) return 'vendor-utils';

            if (id.includes('/node_modules/@supabase/')) return 'vendor-supabase';
          },
        },
      },
    },
    server: {
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
