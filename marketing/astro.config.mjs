import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// https://astro.build/config
export default defineConfig({
  site: 'https://www.optioeducation.com',
  integrations: [
    sitemap({
      // Blog drafts and the 404 page stay out of the sitemap automatically
      // (Astro only includes rendered routes). Nothing to filter today.
    }),
  ],
  build: {
    // Small stylesheets inline into the page head; keeps request count down
    // for Lighthouse without bloating every page.
    inlineStylesheets: 'auto',
  },
})
