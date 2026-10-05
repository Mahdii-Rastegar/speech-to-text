/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The desktop shell loads this exact address in development, so the port must not drift.
  server: {
    port: 5173,
    strictPort: true,
    // The native build writes thousands of files here; watching them only causes lock errors.
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // Keep the native build's messages on screen when both run in one terminal.
  clearScreen: false,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
