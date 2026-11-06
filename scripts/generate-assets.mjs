// Regenerates favicons into public/.
// Run with: node scripts/generate-assets.mjs
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const BLUE = '#2770DA';
const NAVY = '#0e1824';

// Same geometry as src/components/Logo.astro.
const logoPaths = (color) => `
  <path d="M180 500 512 222 844 500" stroke="${color}" stroke-width="54" fill="none"/>
  <rect x="664" y="262" width="82" height="112" fill="${color}"/>
  <path d="M250 460v285M774 460v285" stroke="${color}" stroke-width="44"/>
  <rect x="170" y="722" width="684" height="48" fill="${color}"/>
  <text x="512" y="672" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="300" fill="${color}" letter-spacing="-6">JIB</text>`;

const iconSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="${size >= 180 ? 0 : 180}" fill="${BLUE}"/>
  <g transform="translate(512 512) scale(0.82) translate(-512 -490)">${logoPaths('#ffffff')}</g>
</svg>`;

await mkdir('public/og', { recursive: true });

await writeFile(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="200" fill="${BLUE}"/><g transform="translate(512 512) scale(0.82) translate(-512 -490)">${logoPaths('#ffffff')}</g></svg>`,
);

for (const [name, size] of [
  ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await sharp(Buffer.from(iconSvg(size))).resize(size, size).png().toFile(`public/${name}`);
}

// The share image (public/og/default.png) comes from jib_store_images/store_v2/make-feature-e.cjs og.

console.log('Assets generated.');
