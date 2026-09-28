import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://jibapp.xyz',
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
