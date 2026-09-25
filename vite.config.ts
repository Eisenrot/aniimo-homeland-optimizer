import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: [
        'index.html',
        'optimizer.html',
        'homeland.html',
        'team.html',
        'layout.html',
        'roster.html',
        'legacy.html',
      ],
    },
  },
  worker: {
    format: 'es',
  },
})
