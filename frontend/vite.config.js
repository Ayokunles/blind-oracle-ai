import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'tfhe': path.resolve(__dirname, './node_modules/tfhe'),
      'tkms': path.resolve(__dirname, './node_modules/tkms'),
    },
  },
});
