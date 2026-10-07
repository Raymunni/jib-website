// Wires each guide's two ads from scripts/ads/*.json:
//  - the mid-article <AppCta> gets its headline, photo and screenshot,
//  - the end ad's ctaHeadline / ctaImage / ctaShot go in the frontmatter,
//  - the job(s) for each screenshot go to jib_jobs/test/ad_shots/jobs.json
//    (rendered by the app's ad_shots_test, copied by take-shots.mjs).
// A photo or screenshot that doesn't exist yet is left out, so this can
// run after every batch.
// Usage: node scripts/apply-ads.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

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

  for (const [slot, ad] of Object.entries({ inline: p.inline, end: p.end })) {
    if (!ad) continue;
    const id = `${name}-${slot}`;
    const image = `/images/ads/${id}.jpg`;
    const shot = `/images/ads/shots/${id}.webp`;
    shotsSpec.push({ id, expand: ad.expand ?? 0, jobs: ad.jobs });

    if (slot === 'inline') {
      // Rebuild the guide's own mid-article ad, keeping its pitch.
      const m = s.match(/<AppCta\b[^>]*\/>/);
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
