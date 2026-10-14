import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // With VITE_API_URL empty, /api calls go to the local backend, like they go to the be service on Vercel
    proxy: { '/api': 'http://localhost:8000' },
  },
})
