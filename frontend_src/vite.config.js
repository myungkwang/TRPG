import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/static/',
  plugins: [react()],
  // 빌드 결과를 서버가 서빙하는 ../static 으로. 다른 에셋(모델·오디오·배경)은 지우지 않음.
  build: { outDir: '../static', emptyOutDir: false },
  server: { port: 5173, open: true },
})
