// Wires each guide's two ads from scripts/ads/*.json:
//  - the mid-article <AppCta> gets its headline, photo and screenshot,
//  - the end ad's ctaHeadline / ctaImage / ctaShot go in the frontmatter,
//  - the job(s) for each screenshot go to jib_jobs/test/ad_shots/jobs.json
//    (rendered by the app's ad_shots_test, copied by take-shots.mjs).
// A photo or screenshot that doesn't exist yet is left out, so this can
// run after every batch.
// Usage: node scripts/apply-ads.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';

const plans = readdirSync('scripts/ads')
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(`scripts/ads/${f}`, 'utf8')));

const attr = (v) => String(v).replace(/"/g, '&quot;');
const have = (p) => existsSync(`public${p}`);
const shotsSpec = [];
let wired = 0;

for (const p of plans) {
  const file = `src/content/guides/${p.guide}.mdx`;
  let s = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const name = p.slug ?? p.guide.split('/').pop();

  for (const [slot, ad] of Object.entries({ inline: p.inline, end: p.end, extra: p.extra })) {
    if (!ad) continue;
    const id = `${name}-${slot}`;
    const image = `/images/jib/${id}.jpg`;
    const shot = `/images/jib/shots/${id}.webp`;
    // The mid-article screen's open job carries the guide's own photo, like
    // a job snapped in the app (copied for the phone run in jib_jobs).
    let jobs = ad.jobs;
    const hero = s.match(/^image: (\S+)$/m)?.[1];
    // Only where the guide's photo shows that very job (state, hub and
    // feature guides have general photos).
    const jobPhoto = !/(index|what-can-i-diy|nz-|uk-|queensland-diy|^features\/)/.test(p.guide) && p.photo !== false;
    if (slot === 'inline' && jobPhoto && hero && existsSync('public' + hero) && (ad.expand ?? 0) === 0) {
      const file = hero.split('/').pop();
      mkdirSync('../jib_jobs/test/ad_shots/photos', { recursive: true });
      copyFileSync('public' + hero, '../jib_jobs/test/ad_shots/photos/' + file);
      jobs = [{ ...jobs[0], photo: file }, ...jobs.slice(1)];
    }
    shotsSpec.push({ id, expand: ad.expand ?? 0, jobs, ...(ad.fill === false ? { fill: false } : {}) });

    if (slot === 'extra') {
      // A second mid-article ad for long guides, its own pitch and photo,
      // with at least one section between it and the other ads: before the
      // second section when the first ad sits late, or well after the
      // first ad when it sits early.
      const tag = [
        `<AppCta place="extra"`,
        `headline="${attr(ad.headline)}"`,
        `text="${attr(ad.text)}"`,
        have(image) && `image="${image}"`,
        have(image) && `imageAlt="${attr(ad.alt)}"`,
        have(shot) && `shot="${shot}"`,
        `campaign="${p.guide.split('/')[0]}"`,
      ].filter(Boolean).join(' ') + ' />';
      const old = s.match(/<AppCta place="extra"[^>]*\/>\n\n/);
      if (old) {
        s = s.replace(/<AppCta place="extra"[^>]*\/>/, tag);
        continue;
      }
      const lines = s.split('\n');
      const body = lines.findIndex((l, i) => i > 0 && l === '---') + 1;
      const h2 = lines.map((l, i) => (i >= body && l.startsWith('## ') ? i : -1)).filter((i) => i >= 0);
      const first = lines.findIndex((l) => l.startsWith('<AppCta') && !l.includes('place="extra"'));
      let at = -1;
      if (ad.position === 'early') {
        const before = h2.filter((i) => i < first);
        if (before.length >= 3) at = before[1];
      } else {
        const after = h2.filter((i) => i > first);
        if (after.length >= 2) at = after[Math.max(1, Math.floor(after.length * 0.6))] ?? after[after.length - 1];
      }
      if (at < 0) {
        console.warn(`No room for an extra ad in ${p.guide}`);
        continue;
      }
      lines.splice(at, 0, tag, '');
      s = lines.join('\n');
      continue;
    }

    if (slot === 'inline') {
      // Rebuild the guide's own mid-article ad, keeping its pitch.
      const m = s.match(/<AppCta(?![^>]*place="extra")\b[^>]*\/>/);
      if (!m) continue;
      const text = m[0].match(/text="([^"]*)"/)[1];
      const campaign = m[0].match(/campaign="([^"]*)"/)?.[1] ?? p.guide.split('/')[0];
      const props = [
        `headline="${attr(ad.headline)}"`,
        `text="${text}"`,
        have(image) && `image="${image}"`,
        have(image) && `imageAlt="${attr(ad.alt)}"`,
        have(shot) && `shot="${shot}"`,
        `campaign="${campaign}"`,
      ].filter(Boolean);
      s = s.replace(m[0], `<AppCta ${props.join(' ')} />`);
    } else {
      const fm = s.match(/^---\n([\s\S]*?)\n---/);
      let front = fm[1].replace(/^cta(Headline|Image|ImageAlt|Shot): .*\n?/gm, '');
      const extra = [
        `ctaHeadline: "${ad.headline.replace(/"/g, '\\"')}"`,
        have(image) && `ctaImage: ${image}`,
        have(image) && `ctaImageAlt: "${ad.alt.replace(/"/g, '\\"')}"`,
        have(shot) && `ctaShot: ${shot}`,
      ].filter(Boolean);
      front = front.replace(/^(cta: .*)$/m, `$1\n${extra.join('\n')}`);
      s = s.replace(fm[0], `---\n${front}\n---`);
    }
  }
  writeFileSync(file, s);
  wired++;
}

writeFileSync('../jib_jobs/test/ad_shots/jobs.json', JSON.stringify(shotsSpec, null, 1));
console.log(`Wired ${wired} guides; ${shotsSpec.length} screenshots specced.`);
