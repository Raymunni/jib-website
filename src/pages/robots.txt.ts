import { SITE } from '../config';

// Built per domain, so each copy of the site points at its own sitemap.
export const GET = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap-index.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
