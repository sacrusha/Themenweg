// What route.geojson says beyond the walked line (docs/design/trail-content.md,
// route.geojson): a leg as the basemaps that draw roads elsewhere than the
// ground has them draw it ("drawing", which trail.json's basemaps name), and
// the stretches a line passes beneath something ("under"). Checked here; the
// site draws them (app/map.ts).

import type { LngLat, RouteDrawing } from "../app/trail-types.ts";
import { distance } from "../app/geo.ts";

/** How far apart two lines' ends at a stop may lie, metres: farther, the drawn route has a gap there. */
const JOIN_M = 1;
/** A stop's marker moves with its legs' ends from this far, metres. */
const MOVED_M = 0.5;

/** The route's drawings by name; `stopAt` is a stop's position by its number, as legs number them. */
export function readDrawings(
  route: GeoJSON.FeatureCollection,
  stopAt: (n: number) => LngLat | undefined,
  fail: (where: string, message: string) => void,
): Record<string, RouteDrawing> {
  const walked = new Map<string, LngLat[]>();
  const drawn = new Map<string, Map<string, GeoJSON.Feature<GeoJSON.LineString>>>();
  route.features.forEach((f, i) => {
    const where = `route.geojson features[${i}].properties`;
    const p = f.properties ?? {};
    const u = p.under;
    if (u !== undefined && !(Array.isArray(u) && u.every((r: unknown, j: number) => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[0] < r[1] && (j === 0 || u[j - 1][1] <= r[0]))))
      fail(`${where}.under`, "expected the stretches beneath something, in metres along the line and in order: [[from, to], …]");
    const line = f.geometry?.type === "LineString" ? (f.geometry.coordinates as LngLat[]) : undefined;
    const leg = `${p.from}-${p.to}`;
    const named = line && Number.isInteger(p.from) && Number.isInteger(p.to);
    if (p.drawing === undefined) {
      if (named) walked.set(leg, line);
      return;
    }
    if (typeof p.drawing !== "string" || !p.drawing) return fail(`${where}.drawing`, `expected the drawing's name, as a basemap's "drawing" names it`);
    if (!named) return fail(where, `a drawing's line is a LineString naming its leg's stops, "from" and "to"`);
    const legs = drawn.get(p.drawing) ?? new Map();
    drawn.set(p.drawing, legs);
    if (legs.has(leg)) fail(where, `drawing "${p.drawing}" has leg ${leg} twice`);
    legs.set(leg, f as GeoJSON.Feature<GeoJSON.LineString>);
  });

  const drawings: Record<string, RouteDrawing> = {};
  for (const [name, legs] of drawn) {
    const where = `route.geojson, drawing "${name}"`;
    // Each stop's line ends as this drawing has them: a drawn leg's own, a walked leg's where it has none.
    const ends = new Map<number, { leg: string; at: LngLat; walked: LngLat }[]>();
    const end = (n: number, leg: string, at: LngLat, w: LngLat) => ends.set(n, [...(ends.get(n) ?? []), { leg, at, walked: w }]);
    for (const [leg, f] of legs) {
      const w = walked.get(leg);
      if (!w) {
        fail(where, `leg ${leg} has no walked line in route.geojson to be drawn in place of`);
        continue;
      }
      const [a, b] = leg.split("-").map(Number), c = f.geometry.coordinates as LngLat[];
      end(a, leg, c[0], w[0]);
      end(b, leg, c[c.length - 1], w[w.length - 1]);
    }
    for (const [leg, w] of walked) {
      if (legs.has(leg)) continue;
      const [a, b] = leg.split("-").map(Number);
      if (ends.has(a)) end(a, leg, w[0], w[0]);
      if (ends.has(b)) end(b, leg, w[w.length - 1], w[w.length - 1]);
    }
    const stops: Record<number, LngLat> = {};
    for (const [n, e] of ends) {
      const apart = e.find((x) => distance(x.at, e[0].at) > JOIN_M); // e[0] is a drawn leg's: they come first
      if (apart && legs.has(apart.leg)) fail(where, `its legs ${e[0].leg} and ${apart.leg} end apart at stop ${n}`);
      else if (apart) fail(where, `it moves stop ${n} (leg ${e[0].leg}), so leg ${apart.leg} needs a line in it too`);
      const moved = e.find((x) => distance(x.at, x.walked) >= MOVED_M), at = stopAt(n);
      if (moved && at) stops[n] = [round6(at[0] + moved.at[0] - moved.walked[0]), round6(at[1] + moved.at[1] - moved.walked[1])];
    }
    drawings[name] = { legs: [...legs.values()], stops };
  }
  return drawings;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
