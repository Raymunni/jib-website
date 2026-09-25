// Small helpers shared by the calculator pages.
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const num = (id: string) => {
  const el = $(id) as HTMLInputElement | null;
  return el ? parseFloat(el.value) || 0 : 0;
};
export const val = (id: string) => (($(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '');
export const fmt = (n: number, d = 1) => (Number.isFinite(n) ? (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('en-AU') : '–');
export const plural = (n: number, unit: string) => `${n.toLocaleString('en-AU')} ${unit}${n === 1 ? '' : 's'}`;

/** Renders result rows: [label, big value, detail]. */
export function rows(list: [string, string, string?][]) {
  $('calc-out').innerHTML = `<table><tbody>${list
    .map(([a, b, c]) => `<tr><th scope="row">${a}</th><td><strong>${b}</strong>${c ? `<span>${c}</span>` : ''}</td></tr>`)
    .join('')}</tbody></table>`;
}
export function summary(text: string) {
  $('calc-summary').textContent = text;
}
/** Recalculates on every input/change inside the form, and once on load. */
export function live(fn: () => void) {
  const form = $('calc');
  form.addEventListener('input', fn);
  form.addEventListener('change', fn);
  fn();
}
