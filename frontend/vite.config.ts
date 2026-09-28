import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Development only: VITE_DEV_HTTPS=true serves the dev server over HTTPS with
// the self-signed certificate made by scripts/dev-lan-https.ps1, so phones on
// the same network can use the camera (browsers require HTTPS or localhost).
const lanCertDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'certs')
const lanKey = path.join(lanCertDir, 'dev-lan.key')
const lanCert = path.join(lanCertDir, 'dev-lan.crt')
const lanHttps = process.env.VITE_DEV_HTTPS === 'true' && fs.existsSync(lanKey) && fs.existsSync(lanCert)
  ? { key: fs.readFileSync(lanKey), cert: fs.readFileSync(lanCert) }
  : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    https: lanHttps,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
})
