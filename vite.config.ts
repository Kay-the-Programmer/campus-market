/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      // Only our own tests. Without this Vitest walks node_modules and tries to
      // run other packages' test files.
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    // Serve the repo's own assets/ folder as the static root, so brand images
    // live at /images/* in both dev and the build. Chosen over importing them
    // from components because index.html's favicon cannot use an import, and
    // one mechanism for the same files beats two.
    publicDir: 'assets',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          /*
           * Split the dependencies that change on a different clock from ours.
           *
           * One 890 kB file meant every deploy - including a one-word copy fix -
           * invalidated the whole thing, so returning visitors re-downloaded
           * React and Firebase to read a changed label. Split out, those chunks
           * keep their filename hash across app releases and stay cached, and
           * the browser fetches what did change in parallel rather than in one
           * serial blob.
           *
           * Firebase is separated for a second reason: it is the largest single
           * dependency here and only auth and messaging are used, so keeping it
           * distinct makes its cost legible in the build output rather than
           * hidden inside a total.
           */
          manualChunks: {
            // react-dom/client and jsx-runtime are named explicitly: they are
            // separate entry points, and listing only the bare package names
            // leaves the bulk of React in the app chunk.
            'vendor-react': ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/messaging'],
          },
        },
      },
    },
    server: {
      port: 3000,
      // The API is the Spring Boot service running in Docker. Proxying keeps the
      // browser on a single origin in development, so there is no CORS preflight
      // and the Authorization header passes straight through.
      proxy: {
        '/api': {
          target: process.env.API_URL || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
