import { randomUUID } from 'crypto'
import { resolve } from 'path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'

import { automationPlugin } from './src/automation/vite-plugin'

const devAutomationAuthToken = randomUUID()

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST
const devAutomationCorsOrigin = host ? `http://${host}:1420` : 'http://localhost:1420'

export default defineConfig(async ({ command }) => ({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@open-pencil/vue': resolve(__dirname, 'packages/vue/src'),
      '@open-pencil/core': resolve(__dirname, 'packages/core/src'),
      'opentype.js': resolve(__dirname, 'node_modules/opentype.js/dist/opentype.module.js'),
      // vue-stream-markdown eagerly loads mermaid/beautiful-mermaid as optional peer deps.
      // Alias to empty shims to avoid runtime errors and reduce bundle size.
      mermaid: resolve(__dirname, 'src/shims/mermaid.ts'),
      'beautiful-mermaid': resolve(__dirname, 'src/shims/mermaid.ts')
    }
  },
  define: {
    __OPENPENCIL_LOCAL_AUTOMATION_TOKEN__: JSON.stringify(
      command === 'serve' ? devAutomationAuthToken : null
    )
  },
  plugins: [
    {
      name: 'copy-canvaskit-wasm',
      buildStart() {
        const src = 'node_modules/canvaskit-wasm/bin/canvaskit.wasm'
        const dest = 'public/canvaskit.wasm'
        if (existsSync(src) && !existsSync(dest)) {
          copyFileSync(src, dest)
        }

        const webgpuSrc = 'packages/core/vendor/canvaskit-webgpu/canvaskit.wasm'
        const webgpuDir = 'public/canvaskit-webgpu'
        const webgpuDest = `${webgpuDir}/canvaskit.wasm`
        if (existsSync(webgpuSrc) && !existsSync(webgpuDest)) {
          mkdirSync(webgpuDir, { recursive: true })
          copyFileSync(webgpuSrc, webgpuDest)
        }

        const webgpuJsSrc = 'packages/core/vendor/canvaskit-webgpu/canvaskit.js'
        const webgpuJsDest = `${webgpuDir}/canvaskit.js`
        if (existsSync(webgpuJsSrc) && !existsSync(webgpuJsDest)) {
          mkdirSync(webgpuDir, { recursive: true })
          copyFileSync(webgpuJsSrc, webgpuJsDest)
        }
      }
    },
    tailwindcss(),
    Icons({ compiler: 'vue3' }),
    Components({ resolvers: [IconsResolver({ prefix: 'icon' })] }),
    // Dev-only: allow the editor to write a .pen file back to disk. Accepts
    // POST /__dev__/write-pen {path, text}. Restricted to files whose path
    // ends with `.pen` and lies under the user's Documents directory to
    // avoid accidental writes.
    {
      name: 'dev-write-pen',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__dev__/write-pen', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('POST only')
            return
          }
          const chunks: Buffer[] = []
          req.on('data', (c: Buffer) => chunks.push(c))
          req.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
              const path = String(body.path ?? '')
              const text = String(body.text ?? '')
              if (!path.endsWith('.pen') || !path.startsWith('/Users/')) {
                res.statusCode = 400
                res.end('refusing to write outside ~/ or non-.pen')
                return
              }
              writeFileSync(path, text, 'utf-8')
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ ok: true, bytes: Buffer.byteLength(text) }))
            } catch (e) {
              res.statusCode = 500
              res.end(`error: ${e instanceof Error ? e.message : String(e)}`)
            }
          })
        })
      }
    },
    automationPlugin(command === 'serve' ? devAutomationAuthToken : null, devAutomationCorsOrigin),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,wasm,png,ico,ttf,webmanifest}'],
        navigateFallback: '/index.html'
      },
      manifest: {
        name: 'OpenPencil',
        short_name: 'OpenPencil',
        description: 'Open-source design editor',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        theme_color: '#1e1e1e',
        background_color: '#1e1e1e',
        categories: ['design', 'productivity'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421
        }
      : undefined,
    watch: {
      ignored: [
        '**/desktop/**',
        '**/packages/cli/**',
        '**/packages/mcp/**',
        '**/packages/docs/**',
        '**/tests/**',
        '**/.worktrees/**',
        '**/.github/**',
        '**/.pi/**'
      ]
    }
  }
}))
