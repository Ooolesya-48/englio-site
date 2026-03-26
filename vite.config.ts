import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const swVersionPlugin = {
  name: 'sw-version',
  writeBundle() {
    const swPath = path.resolve(__dirname, 'dist/sw.js')
    if (fs.existsSync(swPath)) {
      let content = fs.readFileSync(swPath, 'utf-8')
      content = content.replace('__BUILD_TIME__', Date.now().toString())
      fs.writeFileSync(swPath, content)
    }
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), swVersionPlugin],
})
