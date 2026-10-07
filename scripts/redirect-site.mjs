// Turns a normal build into the jibapp.xyz redirect site. Jib moved to
// jibapp.com.au (2026-10-07): every page on jibapp.xyz now sends people,
// and Google, to the same page there. GitHub Pages can't send real 301s,
// so each page is a tiny HTML page with a canonical link, an instant
// meta refresh (which Google treats as a permanent redirect) and a script
// that keeps any query string or #anchor. Unknown paths (old links, the
// web app's deep links) go through 404.html the same way.
//
// Usage, after `npm run build`: node scripts/redirect-site.mjs dist dist-xyz
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const TARGET = 'https://jibapp.com.au';
const [from = 'dist', to = 'dist-xyz'] = process.argv.slice(2);

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name.endsWith('.html') ? [p] : [];
  });
}

const stub = (url, script) => `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<title>Jib has moved to jibapp.com.au</title>
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=${url}">
<script>location.replace(${script});</script>
</head>
<body>
<p>Jib has moved to <a href="${url}">${url}</a>.</p>
</body>
</html>
`;

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });

let count = 0;
for (const file of pages(from)) {
  const rel = relative(from, file).split(sep).join('/');
  if (rel === '404.html') continue;
  // about/index.html -> /about/ ; index.html -> /
  const path = '/' + rel.replace(/(^|\/)index\.html$/, '$1');
  const url = TARGET + path;
  const out = join(to, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, stub(url, `${JSON.stringify(TARGET)}+location.pathname+location.search+location.hash`));
  count++;
}

// Anything else: same path on the new domain.
writeFileSync(
  join(to, '404.html'),
  stub(TARGET + '/', `${JSON.stringify(TARGET)}+location.pathname+location.search+location.hash`),
);

// Crawlers may read everything (so they see the redirects); no sitemap here.
writeFileSync(join(to, 'robots.txt'), 'User-agent: *\nAllow: /\n');
writeFileSync(join(to, 'CNAME'), 'jibapp.xyz\n');
// Keeps the IndexNow key reachable on the old host.
for (const f of readdirSync('public')) {
  if (/^[0-9a-f]{32}\.txt$/.test(f)) copyFileSync(join('public', f), join(to, f));
}
console.log(`Redirect site: ${count} pages -> ${TARGET}`);
