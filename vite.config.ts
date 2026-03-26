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

const sitemapPlugin = {
  name: 'generate-sitemap',
  async writeBundle() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[sitemap] Skipping: env vars not set')
      return
    }
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/library_collections?is_popular=eq.true&select=id`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      )
      const collections = await res.json() as { id: string }[]
      const base = 'https://englio.ru'
      const urls = [
        `${base}/`,
        ...collections.map(c => `${base}/collections/${c.id}`),
      ]
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>`
      fs.writeFileSync(path.resolve(__dirname, 'dist/sitemap.xml'), sitemap)
      console.log(`[sitemap] Generated ${urls.length} URLs`)
    } catch (e) {
      console.warn('[sitemap] Failed to generate:', e)
    }
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), swVersionPlugin, sitemapPlugin],
})
