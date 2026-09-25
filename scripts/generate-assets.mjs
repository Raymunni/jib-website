// Regenerates favicons and the default social share image into public/.
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

// Social share image: the landscape hero, darkened on the left, with the
// logo and headline over it.
const W = 1200;
const H = 630;
const hero = await sharp('src/assets/hero/a.jpg').resize(W, H, { fit: 'cover', position: 'right' }).toBuffer();
const overlay = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="${NAVY}" stop-opacity="0.96"/>
      <stop offset="0.55" stop-color="${NAVY}" stop-opacity="0.75"/>
      <stop offset="0.85" stop-color="${NAVY}" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <g transform="translate(70 70) scale(0.11)">${logoPaths('#ffffff')}</g>
  <text x="72" y="300" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="68" fill="#ffffff">Can you DIY it?</text>
  <text x="72" y="382" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="68" fill="#9cc2ff">Snap a photo, find out.</text>
  <text x="72" y="460" font-family="Segoe UI, Arial, sans-serif" font-weight="500" font-size="30" fill="#d6dee8">Plans, materials, costs — and when you need a tradie.</text>
  <text x="72" y="560" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="30" fill="#4f8ff0">jibapp.xyz</text>
</svg>`;
await sharp(hero).composite([{ input: Buffer.from(overlay) }]).png({ quality: 85 }).toFile('public/og/default.png');

console.log('Assets generated.');
