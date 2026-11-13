import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Encaminha /api para o FastAPI local (evita CORS no desenvolvimento).
    proxy: { '/api': 'http://localhost:8000' },
  },
})
