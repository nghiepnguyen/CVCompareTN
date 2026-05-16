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
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
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
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': ['motion/react', 'lucide-react', 'clsx', 'tailwind-merge'],
            'vendor-charts': ['recharts'],
            'vendor-markdown': [
              'react-markdown',
              'remark-gfm',
              'remark-breaks',
              'rehype-sanitize',
              'rehype-raw',
            ],
            'vendor-utils': ['axios'],
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
