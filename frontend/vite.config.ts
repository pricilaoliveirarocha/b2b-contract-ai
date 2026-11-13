import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forwards /api to the local FastAPI (avoids CORS in development).
    // API_TARGET lets a second dev server point at another backend, e.g. for testing.
    proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:8000' },
  },
})
