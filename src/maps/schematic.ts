/** Vue schématique : place chaque repère en % du cadre à partir de sa seule distance au centre de recherche. */
export type Spot = { x: number; y: number };

const hash = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Distance réelle (arrondie) sur l'anneau du rayon, direction arbitraire mais stable par identifiant.
 * Les repères qui se chevauchent sont écartés verticalement, pour rester tous cliquables.
 */
export function placeSchematic(points: ReadonlyArray<{ id: string; distanceKm: number | null }>, radiusKm: number): Record<string, Spot> {
  const placed: Array<Spot & { id: string }> = [];
  const sorted = [...points].sort((a, b) => (a.distanceKm ?? radiusKm) - (b.distanceKm ?? radiusKm) || a.id.localeCompare(b.id));
  for (const p of sorted) {
    const angle = (hash(p.id) % 360) * Math.PI / 180;
    const r = Math.min(1, Math.max(0, p.distanceKm ?? radiusKm / 2) / Math.max(1, radiusKm)) * 36 + 6;
    // Une étiquette fait au plus 46 % de large, centrée sur son point : x reste entre 24 et 76 %.
    const x = clamp(50 + r * Math.cos(angle), 24, 76);
    const ideal = clamp(48 + r * Math.sin(angle) * 0.8, 9, 86);
    // Une étiquette fait environ 9 % de haut et jusqu'à 46 % de large : on prend la place libre la plus proche,
    // en haut ou en bas, sans sortir du cadre.
    const gap = (y: number) => Math.min(9, ...placed.filter((o) => Math.abs(o.x - x) < 44).map((o) => Math.abs(o.y - y)));
    const candidates = Array.from({ length: 53 }, (_, i) => ideal + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 3).filter((y) => y >= 9 && y <= 86);
    // La plus proche des places libres ; sinon celle qui chevauche le moins.
    const y = candidates.find((c) => gap(c) >= 9) ?? candidates.reduce((best, c) => (gap(c) > gap(best) ? c : best), ideal);
    placed.push({ id: p.id, x, y });
  }
  return Object.fromEntries(placed.map(({ id, x, y }) => [id, { x, y }]));
}
