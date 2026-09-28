/** Signature manuscrite factice mais stable (même nom → même tracé), encodée en data-URL SVG. */
export function demoSignature(name: string): string {
  let seed = 2166136261;
  for (const char of name) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const r = (n: number) => Math.round(n * 10) / 10;

  let x = 18;
  let y = 62 + rand() * 10;
  let d = `M${r(x)} ${r(y)}`;
  const strokes = 6 + Math.floor(rand() * 3);
  for (let i = 0; i < strokes; i += 1) {
    const nx = x + 26 + rand() * 14;
    const ny = 42 + rand() * 34;
    d += ` C${r(x + 6 + rand() * 12)} ${r(y - 34 - rand() * 18)} ${r(nx - 6 - rand() * 12)} ${r(ny + 22 + rand() * 14)} ${r(nx)} ${r(ny)}`;
    x = nx;
    y = ny;
  }
  d += ` M24 ${r(90 + rand() * 4)} Q${r(x / 2 + 20)} ${r(80 + rand() * 6)} ${r(x + 12)} ${r(86 + rand() * 4)}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(x + 30)} 110"><path d="${d}" fill="none" stroke="#1e293b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
