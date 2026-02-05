export type BrandIconInput = {
  key?: string | null;
  label?: string | null;
};

// Icons are served from /public/brands
// Keep this mapping tolerant: DB keys might differ between imports.
const KEY_TO_ICON: Record<string, string> = {
  flyer: "/brands/flyer.png",
  rm: "/brands/rm.webp",
  "riese_mueller": "/brands/rm.webp",
  "riese-mueller": "/brands/rm.webp",
  "rieseundmueller": "/brands/rm.webp",
  "riese&mueller": "/brands/rm.webp",
  ktm: "/brands/ktm.jpg",
  "ktm-bikes": "/brands/ktm.jpg",
  bikeco: "/brands/bikeco.webp",
  "bike&co": "/brands/bikeco.webp",
  kalkhoff: "/brands/kalkhoff.jpg",
  zeg: "/brands/zeg.png",
  cube: "/brands/cube.png",
  bergamont: "/brands/bergamont.png",
  scott: "/brands/scott.png",
  stevens: "/brands/stevens.png",
  bico: "/brands/bico.png",
};

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/&/g, "und")
    .replace(/[^a-z0-9_-]/g, "");
}

export function getBrandIcon({ key, label }: BrandIconInput): string | null {
  const k = key ? norm(key) : "";
  if (k && KEY_TO_ICON[k]) return KEY_TO_ICON[k];

  const l = label ? norm(label) : "";
  if (l && KEY_TO_ICON[l]) return KEY_TO_ICON[l];

  // Heuristics by label content
  if (l.includes("flyer")) return KEY_TO_ICON.flyer;
  if (l.includes("riese") || l.includes("mueller") || l.includes("müller")) return "/brands/rm.webp";
  if (l.includes("kalkhoff")) return "/brands/kalkhoff.jpg";
  if (l.includes("ktm")) return "/brands/ktm.jpg";
  if (l.includes("bikeco") || l.includes("bikeundco") || l.includes("bikeco")) return "/brands/bikeco.webp";
  if (l.includes("zeg")) return "/brands/zeg.png";
  if (l.includes("cube")) return "/brands/cube.png";
  if (l.includes("bergamont")) return "/brands/bergamont.png";
  if (l.includes("scott")) return "/brands/scott.png";
  if (l.includes("stevens")) return "/brands/stevens.png";
  if (l.includes("bico")) return "/brands/bico.png";

  return null;
}
