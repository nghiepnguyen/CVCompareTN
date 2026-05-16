import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
        },
      },
    },
    resolve: {
      alias: [
        {find: '@', replacement: path.resolve(__dirname, '.')},
      ],
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-ui': ['motion/react', 'lucide-react', 'clsx', 'tailwind-merge'],
            'vendor-charts': ['recharts'],
            'vendor-markdown': ['react-markdown', 'remark-gfm', 'remark-breaks', 'rehype-sanitize', 'rehype-raw'],
            'vendor-utils': ['axios']
          }
        }
      }
    },
    server: {
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
