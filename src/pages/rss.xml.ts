import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { SITE } from '../config';
import { guideUrl } from '../lib/guides';

export async function GET(context: APIContext) {
  const guides = (await getCollection('guides')).sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
  return rss({
    title: 'Jib — DIY guides for Australian homes',
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: guides.map((g) => ({
      title: g.data.title,
      description: g.data.description,
      pubDate: g.data.published,
      link: guideUrl(g),
    })),
    customData: '<language>en-au</language>',
  });
}
