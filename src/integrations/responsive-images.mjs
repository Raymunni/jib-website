// After the build, write smaller WebP copies of the big guide photos
// (hero photos in /images/blog/ and ad photos in /images/jib/) next to the
// originals, so phones download a 640 or 960 wide WebP instead of the full
// 1376 wide JPEG. The pages list them in a <picture> srcset (see
// src/lib/responsive.ts); the JPEG stays as the fallback and for og:image.
// Runs only in `astro build`, so dev keeps serving the plain JPEGs.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { RESPONSIVE_DIRS, RESPONSIVE_WIDTHS } from '../lib/responsive-config.mjs';

export default function responsiveImages() {
  return {
    name: 'jib-responsive-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const jobs = [];
        for (const d of RESPONSIVE_DIRS) {
          const abs = join(root, d);
          if (!existsSync(abs)) continue;
          for (const f of readdirSync(abs)) {
            if (!/\.jpe?g$/i.test(f)) continue;
            for (const w of RESPONSIVE_WIDTHS) jobs.push({ src: join(abs, f), out: join(abs, f.replace(/\.jpe?g$/i, `-${w}.webp`)), w });
          }
        }
        let i = 0;
        const worker = async () => {
          while (i < jobs.length) {
            const j = jobs[i++];
            await sharp(j.src).resize({ width: j.w, withoutEnlargement: true }).webp({ quality: 74 }).toFile(j.out);
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
        logger.info(`wrote ${jobs.length} responsive WebP images`);
      },
    },
  };
}
