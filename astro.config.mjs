import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Each guide's last edit date (the later of lastChecked and updated), keyed
// by its URL path, for the sitemap's <lastmod>. Bing in particular uses
// lastmod to decide what to recrawl.
function guideDates(dir = 'src/content/guides') {
  const out = {};
  for (const f of readdirSync(dir, { recursive: true })) {
    if (!/\.mdx?$/.test(f)) continue;
    const fm = readFileSync(join(dir, f), 'utf8').split(/^---\s*$/m)[1] || '';
    const dates = ['lastChecked', 'updated', 'published']
      .map((k) => fm.match(new RegExp(`^${k}:\\s*"?([0-9]{4}-[0-9]{2}-[0-9]{2})`, 'm'))?.[1])
      .filter(Boolean)
      .sort();
    const slug = f.replace(/\\/g, '/').replace(/\.mdx?$/, '').replace(/\/index$/, '');
    if (dates.length) out[`/guides/${slug}/`] = dates[dates.length - 1];
  }
  return out;
}
const GUIDE_DATES = guideDates();

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
      // /r/ is the creator code page (noindex), only reached from a creator's link.
      serialize(item) {
        const d = GUIDE_DATES[new URL(item.url).pathname];
        if (d) item.lastmod = new Date(d).toISOString();
        return item;
      },
      filter: (page) => !page.endsWith('/404/') && !page.includes('/web/') && !page.endsWith('/ios/') && !page.endsWith('/android/') && !page.endsWith('/r/'),
    }),
  ],
});
