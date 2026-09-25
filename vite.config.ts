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
        'team.html',
        'layout.html',
        'legacy.html',
        'optimizer.html',
        'homeland.html',
        'roster.html',
      ],
    },
  },
  worker: {
    format: 'es',
  },
})
