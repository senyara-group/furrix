import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { sourcemap: true },
  test: {
    environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], restoreMocks: true,
    // Les tests ne dépendent pas du .env.local de la machine (bêta privée, Supabase réel).
    env: { VITE_PRIVATE_BETA: '', VITE_REGISTRATION_ENABLED: '', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_MAPBOX_TOKEN_WEB: '', VITE_MAPBOX_TOKEN_APP: '' },
  },
});
