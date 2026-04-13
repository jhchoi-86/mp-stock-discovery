import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      chunkSizeWarningLimit: 1000,
      sourcemap: false
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
