import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind dev server to loopback so LAN URLs are not advertised; cloud deploys use the static build only.
    host: 'localhost',
  },
})
