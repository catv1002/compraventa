import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Permite acceso vía túnel ngrok temporal para pruebas remotas — no usar
    // en despliegues reales (ahí el host lo sirve Cloudflare Pages).
    allowedHosts: ['.ngrok-free.app'],
  },
});
