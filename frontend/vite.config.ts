import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Expose on all network interfaces
    port: 5173,
    strictPort: false, // Use next available port if 5173 is busy
  },
})
