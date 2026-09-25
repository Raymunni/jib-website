import type { CollectionEntry } from 'astro:content';

export type Guide = CollectionEntry<'guides'>;

// Pillar pages live at <hub>/index.md and are served at /guides/<hub>/.
export function guideSlug(g: Guide): string {
  return g.id.replace(/\/index$/, '');
}

export function guideUrl(g: Guide): string {
  return `/guides/${guideSlug(g)}/`;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}
