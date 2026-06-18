import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';

function googleTagHtmlPlugin(measurementId: string): Plugin {
  return {
    name: 'inject-google-tag',
    transformIndexHtml(html) {
      if (!measurementId) return html;

      const snippet = `
    <!-- Google tag (gtag.js) — Consent Mode: no analytics hits until user accepts in-app -->
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        wait_for_update: 500
      });
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
    <script>
      gtag('js', new Date());
      gtag('config', '${measurementId}', {
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
    </script>`;

      return html.replace('<head>', `<head>${snippet}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const gaMeasurementId = env.VITE_GA_MEASUREMENT_ID?.trim() ?? '';

  return {
    plugins: [react(), tailwindcss(), googleTagHtmlPlugin(gaMeasurementId)],
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
