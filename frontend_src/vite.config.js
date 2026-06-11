import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/static/',
  plugins: [react()],
<<<<<<< HEAD
=======
  server: { port: 5173, open: true }
>>>>>>> main
})
