// Reads a guide's visible FAQ section ("## Frequently asked questions" or
// "## Common questions") out of its MDX source, so the page can describe
// the same questions and answers as FAQPage structured data. Only what a
// reader can see on the page goes in, never extra or hidden text.
//
// Each question is a bold line ending in "?"; the answer is either the rest
// of that line or the paragraph(s) after it, up to the next question.

export interface Faq {
  q: string;
  a: string;
}

const HEADING = /^##\s+(frequently asked questions|common questions|faqs?)\s*$/i;

function plain(md: string): string {
  return md
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractFaqs(body: string | undefined): Faq[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => HEADING.test(l.trim()));
  if (start < 0) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
  }
  const faqs: Faq[] = [];
  let cur: { q: string; a: string[] } | null = null;
  const push = () => {
    if (cur) {
      const a = plain(cur.a.join('\n'));
      if (cur.q && a) faqs.push({ q: cur.q, a });
    }
  };
  for (const raw of lines.slice(start + 1, end)) {
    const line = raw.trim();
    const m = line.match(/^\*\*(.+?\?)\*\*\s*(.*)$/);
    if (m) {
      push();
      cur = { q: plain(m[1]), a: m[2] ? [m[2]] : [] };
    } else if (cur && line && !line.startsWith('<')) {
      cur.a.push(line);
    }
  }
  push();
  return faqs;
}
