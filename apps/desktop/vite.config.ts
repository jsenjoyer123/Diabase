import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import * as path from 'node:path'
import { scanRepository } from '../../plugins/genui/src/repo-scanner.ts'
import { LLMService } from '../../plugins/llm/src/index.ts'

function repoApiPlugin(): Plugin {
  return {
    name: 'repo-api-plugin',
    configureServer(server) {
      server.middlewares.use('/api/repo-facts', async (req, res) => {
        try {
          const facts = await scanRepository(path.resolve(__dirname, '../..'))
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(facts))
        } catch (err: any) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        }
      })

      server.middlewares.use('/api/generate-ui', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })

        req.on('end', async () => {
          try {
            const { prompt, apiKey } = JSON.parse(body || '{}')
            const facts = await scanRepository(path.resolve(__dirname, '../..'))
            const llm = new LLMService({ apiKey })
            const result = await llm.generateUI(prompt, facts)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (err: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), repoApiPlugin()],
  root: path.resolve(__dirname),
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      '@diabase/protocol': path.resolve(__dirname, '../../packages/protocol/src/index.ts'),
      '@diabase/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@diabase/plugin-llm': path.resolve(__dirname, '../../plugins/llm/src/index.ts'),
      '@diabase/plugin-genui/renderer': path.resolve(__dirname, '../../plugins/genui/src/renderer.tsx'),
      '@diabase/plugin-genui/panel': path.resolve(__dirname, '../../plugins/genui/src/panel.tsx'),
      '@diabase/plugin-genui': path.resolve(__dirname, '../../plugins/genui/src/index.ts'),
      '@diabase/plugin-slots': path.resolve(__dirname, '../../plugins/slots/src/index.ts'),
      '@diabase/plugin-blocks': path.resolve(__dirname, '../../plugins/blocks/src/index.ts'),
      '@diabase/plugin-files': path.resolve(__dirname, '../../plugins/files/src/index.tsx'),
      '@diabase/plugin-editor': path.resolve(__dirname, '../../plugins/editor/src/index.tsx'),
      '@diabase/plugin-data-blocks': path.resolve(__dirname, '../../plugins/data-blocks/src/index.tsx'),
    },
  },
})
