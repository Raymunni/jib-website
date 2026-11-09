// Takes the newest Gemini download as a job photo for the ad screenshots:
// public/images/jib/jobs/<name>.jpg at 1376x768. Like take-image.mjs, it
// never moves or deletes the download and refuses one it has already used.
// Usage: node scripts/take-job-photo.mjs <name>
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const name = process.argv[2];
if (!name) throw new Error('usage: take-job-photo.mjs <name>');
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
const out = `public/images/jib/jobs/${name}.jpg`;
const info = await sharp(join(dl, newest.f)).resize(1376, 768, { fit: 'cover' }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
writeFileSync('.images-used', [...used, newest.f].filter(Boolean).join('\n'));
console.log(`${newest.f} -> ${out} (${info.size} bytes)`);
