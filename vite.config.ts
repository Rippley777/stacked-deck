import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    proxy: { '/api': `http://localhost:${process.env.PORT || 3001}` },
  },
  build: { outDir: 'dist/client' },
});
