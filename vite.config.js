import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true
  },
  server: {
    host: '0.0.0.0',
    hmr: {
      host: '13.211.128.167',
      clientPort: 5173
    }
  }
})
