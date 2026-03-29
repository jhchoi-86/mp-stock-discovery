import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    build: {
      sourcemap: true
    },
    server: {
      host: '0.0.0.0',
      hmr: {
        host: env.VITE_HMR_HOST || '13.211.128.167',
        clientPort: 5173
      }
    }
  };
})
