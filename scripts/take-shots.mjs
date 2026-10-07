// Copies the real Jib screens for the ads into public/images/jib/shots/.
// Prefers the real-phone screenshots (jib_jobs/tool/ad_shots.mjs, with the
// house photo behind the list), falling back to the off-device renders
// (jib_jobs/test/ad_shots_test.dart). On phone shots, the notification
// icons in the status bar are covered with a patch of the status bar's own
// background, so only the time, signal, wifi and battery show.
// Usage: node scripts/take-shots.mjs [id ...]   (no ids: all of them)
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const phone = '../jib_jobs/test/ad_shots/phone';
const rendered = '../jib_jobs/test/ad_shots/out';
const out = 'public/images/jib/shots';
mkdirSync(out, { recursive: true });
const ids = process.argv.slice(2);
const all = new Set([
  ...(existsSync(phone) ? readdirSync(phone) : []),
  ...(existsSync(rendered) ? readdirSync(rendered) : []),
]);
const files = [...all].filter((f) => f.endsWith('.png') && (ids.length === 0 || ids.includes(f.replace('.png', ''))));
for (const f of files) {
  const fromPhone = existsSync(join(phone, f));
  let img = sharp(join(fromPhone ? phone : rendered, f));
  if (fromPhone) {
    const { width } = await img.metadata();
    const s = width / 1080;
    // Status bar notification icons sit between the clock and the camera;
    // cover them with the empty strip just right of the camera.
    const patch = await sharp(join(phone, f))
      .extract({ left: Math.round(575 * s), top: 0, width: Math.round(215 * s), height: Math.round(108 * s) })
      .toBuffer();
    img = sharp(await img.composite([{ input: patch, left: Math.round(205 * s), top: 0 }]).png().toBuffer());
  }
  const info = await img.resize(540).webp({ quality: 88 }).toFile(join(out, f.replace('.png', '.webp')));
  console.log(`${f} (${fromPhone ? 'phone' : 'render'}) -> ${info.size} bytes`);
}
