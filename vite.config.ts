import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
