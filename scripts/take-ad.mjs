// Moves the newest Gemini download into public/images/ads/<name>.jpg at
// 1376x768, for the in-guide ads. --flip mirrors it, so the subject sits
// on the left and the phone (overlaid on the right) doesn't cover them.
// Usage: node scripts/take-ad.mjs <name> [--flip] [--wide]
// Refuses to reuse a download it has already processed.
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const name = process.argv[2];
const flip = process.argv.includes('--flip');
// --wide: the shorter mid-article photo (2.2:1).
const wide = process.argv.includes('--wide');
if (!name) throw new Error('usage: take-ad.mjs <name> [--flip]');
const dl = join(process.env.USERPROFILE, 'Downloads');
const used = new Set(existsSync('.images-used') ? readFileSync('.images-used', 'utf8').split('\n') : []);
const newest = readdirSync(dl)
  .filter((f) => /^Gemini_Generated_Image_.*\.(jpg|png)$/.test(f))
  .map((f) => ({ f, t: statSync(join(dl, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!newest || used.has(newest.f)) {
  console.error('NO NEW DOWNLOAD (newest is ' + (newest?.f ?? 'none') + ')');
  process.exit(1);
}
mkdirSync('public/images/ads', { recursive: true });
const out = `public/images/ads/${name}.jpg`;
let img = sharp(join(dl, newest.f)).resize(wide ? 1600 : 1376, wide ? 728 : 768, { fit: 'cover' });
if (flip) img = img.flop();
const info = await img.jpeg({ quality: 80, mozjpeg: true }).toFile(out);
// Every download present now counts as used, so a stray duplicate can't be
// filed as the next image.
const all = readdirSync(dl).filter((f) => /^Gemini_Generated_Image_/.test(f));
writeFileSync('.images-used', [...new Set([...used, newest.f, ...all])].filter(Boolean).join('\n'));
console.log(`${newest.f} -> ${out}${flip ? ' (mirrored)' : ''} (${info.size} bytes)`);
