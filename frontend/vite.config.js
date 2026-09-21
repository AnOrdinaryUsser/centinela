import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite configuration for the Centinela frontend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Vite's dev server only binds to localhost by default, so another
    // device on the same network (a phone, say) can't reach it even once
    // it knows your PC's LAN IP - "host: true" makes it listen on every
    // network interface (0.0.0.0) instead, and Vite then also prints that
    // LAN URL alongside the usual localhost one when you run `npm run dev`.
    host: true,
  },
})
