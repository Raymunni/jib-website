import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const guides = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    // Shown in search results; keep under ~155 characters.
    description: z.string().max(170),
    hub: z.enum(['diy-legal', 'council-approval', 'materials']),
    pillar: z.boolean().default(false),
    market: z.enum(['AU', 'UK', 'NZ', 'US', 'global']).default('AU'),
    published: z.coerce.date(),
    // The date every rule and number on the page was last re-verified
    // against its source. Legal pages must keep this current.
    lastChecked: z.coerce.date(),
    // Short answer rendered in a highlighted box right under the H1 —
    // written to be quotable by AI Overviews / answer engines.
    answer: z.string(),
    cta: z.string(),
    sources: z
      .array(z.object({ title: z.string(), url: z.string().url() }))
      .default([]),
    related: z.array(z.string()).default([]),
    order: z.number().default(100),
  }),
});

export const collections = { guides };
