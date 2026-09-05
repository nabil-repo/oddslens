import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup/popup.html'),
        options: resolve(__dirname, 'options/options.html'),
        demo: resolve(__dirname, 'demo/index.html')
      }
    }
  },
  server: {
    port: 3000,
    open: '/demo/index.html'
  }
});
