import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false,
        watch: {
          ignored: ['**/dist/**', '**/.git/**', '**/node_modules/**', '**/.system_generated/**', '**/public/automatiqa-agent.js', '**/ai_cache_store.json']
        }
      },
      plugins: [react(), tailwindcss()],
      define: {
        // Strict security: Never expose Gemini credentials to the frontend browser bundle
        'process.env.API_KEY': JSON.stringify(''),
        'process.env.GEMINI_API_KEY': JSON.stringify('')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        minify: false,
        cssMinify: false,
        reportCompressedSize: false,
        target: 'esnext',
        chunkSizeWarningLimit: 3000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('lucide-react')) return 'pkg-lucide';
                if (id.includes('recharts') || id.includes('d3')) return 'pkg-charts';
                if (id.includes('jspdf') || id.includes('exceljs') || id.includes('xlsx') || id.includes('jszip') || id.includes('mammoth')) return 'pkg-docs';
                if (id.includes('firebase')) return 'pkg-firebase';
                if (id.includes('@google/genai') || id.includes('@anthropic-ai')) return 'pkg-ai';
              }
            }
          }
        }
      }
    };
});
