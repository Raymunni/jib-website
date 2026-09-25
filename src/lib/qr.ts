import QRCode from 'qrcode';

// Rendered at build time so the page ships a plain inline SVG — no QR
// library in the browser. Scanning lands on /app/, which sends each phone
// to its own store.
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0e1824', light: '#ffffff' },
  });
}
