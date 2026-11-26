// Derives the legs between consecutive stops of the walk from route.geojson:
// the start where the trail has one, the stations, the end where it has one.
//
// The route may be one ordered line or a heap of unordered fragments (a trace
// of a printed map). Fragments become one graph: their vertices joined along
// each line, and each fragment end joined to the nearest vertex of every other
// fragment within GAP_M. Each station is attached at its nearest point on the
// route; a leg is the shortest path between two attachments. Where none
// exists, the leg is a straight line and is marked as such. Where the route's
// points carry heights (a third coordinate), each leg gets its walking time.

import type { Leg, LngLat } from "../app/trail-types.ts";
import { routeLines } from "../app/geo.ts";
import { walkMinutes } from "./walk-time.ts";

/** Largest gap between fragments that is bridged, metres. */
const GAP_M = 60;

export interface LegReport {
  /** Per station: distance from its position to the route, metres. */
  offRoute: number[];
  /** The start's and the end's distance to the route, metres, where the trail has them. */
  endsOffRoute: { start?: number; end?: number };
  /** Gaps bridged between fragments: length in metres and where. */
  bridges: { length: number; at: LngLat }[];
  /** Legs drawn straight because the route has no path between them. */
  straight: string[];
}

/**
 * `ends`: the walk's start before station 1 and its end after the last, where
 * they aren't those stations; end "start" is back where the walk began (the
 * start, else station 1).
 */
export function computeLegs(
  route: GeoJSON.FeatureCollection,
  stations: LngLat[],
  ends: { start?: LngLat; end?: LngLat | "start" } = {},
): { legs: Leg[]; report: LegReport } {
  const lines = routeLines(route);
  const report: LegReport = { offRoute: [], endsOffRoute: {}, bridges: [], straight: [] };
  const lat0 = stations.reduce((s, p) => s + p[1], 0) / Math.max(1, stations.length);
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110574;
  const xy = (p: LngLat): [number, number] => [p[0] * kx, p[1] * ky];
  const dist = (a: LngLat, b: LngLat) => Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky);

  // Graph
  const nodes: LngLat[] = [];
  const adj: { to: number; w: number }[][] = [];
  const addNode = (p: LngLat) => (nodes.push(p), adj.push([]), nodes.length - 1);
  const link = (a: number, b: number) => {
    const w = dist(nodes[a], nodes[b]);
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
  };
  const lineNodes: number[][] = lines.map((line) => line.map(addNode));
  const segments: [number, number][] = [];
  for (const ids of lineNodes) for (let i = 1; i < ids.length; i++) (link(ids[i - 1], ids[i]), segments.push([ids[i - 1], ids[i]]));
  // A line whose last point is its first is a loop: a walk back to its start goes on there, not back round.
  for (const ids of lineNodes) if (ids.length > 2 && dist(nodes[ids[0]], nodes[ids[ids.length - 1]]) <= 1) link(ids[ids.length - 1], ids[0]);

  for (let a = 0; a < lineNodes.length; a++) {
    const ends = [lineNodes[a][0], lineNodes[a][lineNodes[a].length - 1]];
    for (const e of new Set(ends)) {
      for (let b = 0; b < lineNodes.length; b++) {
        if (b === a) continue;
        let best = -1, bestD = Infinity;
        for (const v of lineNodes[b]) {
          const d = dist(nodes[e], nodes[v]);
          if (d < bestD) (bestD = d), (best = v);
        }
        if (best >= 0 && bestD <= GAP_M && !adj[e].some((x) => x.to === best)) {
          link(e, best);
          if (bestD > 1) report.bridges.push({ length: Math.round(bestD), at: nodes[e] });
        }
      }
    }
  }

  // The stops, numbered as legs count them: the start 0, the stations 1..n, the end n + 1.
  const stops: { n: number; at: LngLat }[] = stations.map((at, i) => ({ n: i + 1, at }));
  if (ends.start) stops.unshift({ n: 0, at: ends.start });
  const end = ends.end === "start" ? (ends.start ?? stations[0]) : ends.end;
  if (end) stops.push({ n: stations.length + 1, at: end });

  // Attach each stop at its nearest point on a segment; stops on one segment
  // are joined in their order along it, so a leg between two of them stays on it.
  const onSegment = new Map<number, { t: number; id: number }[]>();
  const attach: number[] = stops.map(({ n, at: p }) => {
    const off = (d: number) => (n === 0 ? (report.endsOffRoute.start = d) : n > stations.length ? (report.endsOffRoute.end = d) : report.offRoute.push(d));
    if (!segments.length) {
      off(NaN);
      return -1;
    }
    const [px, py] = xy(p);
    let best = { d: Infinity, seg: 0, t: 0 };
    segments.forEach(([a, b], seg) => {
      const [ax, ay] = xy(nodes[a]), [bx, by] = xy(nodes[b]);
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
      if (d < best.d) best = { d, seg, t };
    });
    off(Math.round(best.d));
    const [a, b] = segments[best.seg];
    const q: LngLat = [
      nodes[a][0] + best.t * (nodes[b][0] - nodes[a][0]),
      nodes[a][1] + best.t * (nodes[b][1] - nodes[a][1]),
    ];
    const za = (nodes[a] as number[])[2], zb = (nodes[b] as number[])[2];
    if (typeof za === "number" && typeof zb === "number") (q as number[]).push(za + best.t * (zb - za));
    const id = addNode(q);
    onSegment.set(best.seg, [...(onSegment.get(best.seg) ?? []), { t: best.t, id }]);
    return id;
  });
  for (const [seg, on] of onSegment) {
    const chain = [segments[seg][0], ...on.sort((x, y) => x.t - y.t).map((x) => x.id), segments[seg][1]];
    for (let i = 1; i < chain.length; i++) link(chain[i - 1], chain[i]);
  }

  const legs: Leg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const path = attach[i - 1] >= 0 ? shortestPath(adj, attach[i - 1], attach[i]) : null;
    const from = stops[i - 1].n, to = stops[i].n;
    if (!path) {
      report.straight.push(`${from}→${to}`);
      legs.push({ from, to, straight: true, length: Math.round(dist(stops[i - 1].at, stops[i].at)), coordinates: [stops[i - 1].at, stops[i].at] });
      continue;
    }
    const coordinates = path.map((n) => nodes[n]);
    let length = 0;
    for (let k = 1; k < coordinates.length; k++) length += dist(coordinates[k - 1], coordinates[k]);
    const minutes = walkMinutes(coordinates, dist);
    legs.push({
      from, to, straight: false, length: Math.round(length), coordinates: coordinates.map(round6),
      ...(minutes === undefined ? {} : { minutes: Math.round(minutes * 10) / 10 }),
    });
  }
  return { legs, report };
}

function round6(p: LngLat): LngLat {
  return [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
}

function shortestPath(adj: { to: number; w: number }[][], from: number, to: number): number[] | null {
  const n = adj.length;
  const d = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  d[from] = 0;
  // Graphs here are a few thousand nodes: a linear scan beats carrying a heap.
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < best) (best = d[i]), (u = i);
    if (u < 0) return null;
    if (u === to) break;
    done[u] = 1;
    for (const { to: v, w } of adj[u]) if (d[u] + w < d[v]) (d[v] = d[u] + w), (prev[v] = u);
  }
  const path: number[] = [];
  for (let u = to; u >= 0; u = prev[u]) path.push(u);
  return path.reverse();
}
