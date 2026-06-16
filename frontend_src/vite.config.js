import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/static/',
  plugins: [react()],
  server: { port: 5173, open: true },
  build: { outDir: '../static', emptyOutDir: false },   // 서버가 static/ 을 서빙하므로 그쪽으로 빌드
})
