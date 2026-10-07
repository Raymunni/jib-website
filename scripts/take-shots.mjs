// Copies the real Jib screens rendered by jib_jobs/test/ad_shots_test.dart
// into public/images/ads/shots/, cropped to a phone's 9:16 from the top
// and sized for the ads' phone frames.
// Usage: node scripts/take-shots.mjs [id ...]   (no ids: all of them)
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const src = '../jib_jobs/test/ad_shots/out';
const out = 'public/images/ads/shots';
mkdirSync(out, { recursive: true });
const ids = process.argv.slice(2);
const files = readdirSync(src).filter((f) => f.endsWith('.png') && (ids.length === 0 || ids.includes(f.replace('.png', ''))));
for (const f of files) {
  const img = sharp(join(src, f));
  const { width, height } = await img.metadata();
  const h = Math.min(height, Math.round((width * 16) / 9));
  const info = await img
    .extract({ left: 0, top: 0, width, height: h })
    .resize(540)
    .webp({ quality: 88 })
    .toFile(join(out, f.replace('.png', '.webp')));
  console.log(`${f} -> ${out}/${f.replace('.png', '.webp')} (${info.size} bytes)`);
}
