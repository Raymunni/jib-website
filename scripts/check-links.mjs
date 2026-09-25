// Fails if any internal link in the built site points at a page that
// doesn't exist. Run after `npm run build`.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const broken = [];
for (const file of await walk(DIST)) {
  const html = await readFile(file, 'utf8');
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
    // Skip protocol-relative URLs and template strings inside inline scripts.
    if (href.startsWith('//') || href.includes('${')) continue;
    const target = href.endsWith('/') ? join(DIST, href, 'index.html') : join(DIST, href);
    if (!(await exists(target))) broken.push(`${file.replace(DIST, '')} → ${href}`);
  }
}

if (broken.length) {
  console.error(`Broken internal links (${broken.length}):\n` + [...new Set(broken)].join('\n'));
  process.exit(1);
}
console.log('All internal links OK.');
