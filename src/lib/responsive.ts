// srcset for the smaller WebP copies of a /images/blog/ or /images/jib/ JPEG
// (written by src/integrations/responsive-images.mjs after the build), or
// null when there are none: other folders, other formats, or the dev server.
import { RESPONSIVE_WIDTHS } from './responsive-config.mjs';

export function webpSrcset(src: string | undefined): string | null {
  if (!src || !import.meta.env.PROD) return null;
  const m = src.match(/^\/(images\/(?:blog|jib))\/([^/]+)\.jpe?g$/i);
  if (!m) return null;
  return RESPONSIVE_WIDTHS.map((w) => `/${m[1]}/${m[2]}-${w}.webp ${w}w`).join(', ');
}
