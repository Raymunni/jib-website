import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// The same site is built twice: jibapp.xyz (international, the default)
// and jibapp.com.au (Australia). SITE_URL picks which; see SITE.alternates.
export default defineConfig({
  site: process.env.SITE_URL || 'https://jibapp.xyz',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The web app was retired; old links land on the app download page.
  redirects: { '/web': '/app/' },
  integrations: [
    mdx(),
    sitemap({
      filter: (page) => !page.endsWith('/404/') && !page.includes('/web/'),
    }),
  ],
});
