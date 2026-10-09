import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// The site lives at jibapp.com.au (moved from jibapp.xyz on 2026-10-07).
// The jibapp.com.au repo builds and serves it; this repo's own deploy
// turns the same build into redirect pages for jibapp.xyz (see
// scripts/redirect-site.mjs). SITE_URL can override the domain.
export default defineConfig({
  site: process.env.SITE_URL || 'https://jibapp.com.au',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The web app was retired; old links land on the app download page.
  redirects: { '/web': '/app/' },
  integrations: [
    mdx(),
    sitemap({
      // /ios/ and /android/ are short links that redirect to the stores.
      filter: (page) => !page.endsWith('/404/') && !page.includes('/web/') && !page.endsWith('/ios/') && !page.endsWith('/android/'),
    }),
  ],
});
