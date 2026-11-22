// The map: basemap, route, numbered station markers, and the selection's
// highlight (selected, previous, next, and the leg to the next).

import { AttributionControl, LngLat as MLLngLat, Map as MLMap, Marker, MercatorCoordinate, setWorkerUrl, type IControl, type StyleSpecification } from "maplibre-gl";
// Bundled by Vite (?worker&url), so the build target lowers its syntax too (vite.config.ts).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Basemap, Localized, Trail } from "./trail-types.ts";
import type { Strings } from "./strings.ts";
import { store } from "./store.ts";
import { textFor } from "./language.ts";
import { distance, onLine, routeLines, toLocal } from "./geo.ts";
import { markerElement, paintMarker, repaintOnChange } from "./on-map.ts";
import type { Rect } from "./edge.ts";

setWorkerUrl(workerUrl);

/**
 * A station's scale: the farthest a selection's neighbours draw the map out
 * (TrailMap.place). Streets and buildings still read, and a station's view
 * stays apart from the whole trail's.
 */
const NEIGHBOURHOOD = 16;

/** Map styles from the trail, or an OSM-based default for a trail that names none. */
const DEFAULT_BASEMAPS: Basemap[] = [{ label: { en: "Map", de: "Karte" }, style: "https://tiles.openfreemap.org/styles/liberty" }];

export interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface View {
  center: [number, number];
  zoom: number;
}

export class TrailMap {
  readonly map: MLMap;
  private markers: HTMLButtonElement[] = [];
  private selected = 0;
  /** The leg the visitor is walking, where walking help knows it (walking.ts): emphasised instead of the selection's. */
  private walked?: number;
  private basemaps: Basemap[];
  private basemapIndex: number;
  private reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  /** What covers the map (the sheet, portrait), as insets; undefined until the layout says. */
  private covered?: Padding;

  private trail: Trail;
  private tx: (l?: Localized) => string;
  private s: Strings;

  constructor(container: HTMLElement, trail: Trail, lang: string, s: Strings, onSelect: (n: number) => void, initial: View | undefined) {
    this.trail = trail;
    this.tx = textFor(trail, lang);
    this.s = s;
    this.basemaps = trail.basemaps.length ? trail.basemaps : DEFAULT_BASEMAPS;
    // Remembered by label, so reordering the trail's basemaps doesn't remap a visitor's choice.
    const stored = store.get(`${trail.id}:basemap-label`);
    this.basemapIndex = Math.max(0, this.basemaps.findIndex((b) => b.label[trail.languages[0]] === stored));

    this.map = new MLMap({
      container,
      style: this.styleFor(this.basemaps[this.basemapIndex]),
      bounds: initial ? undefined : trail.extent,
      fitBoundsOptions: { padding: 40 },
      center: initial?.center,
      zoom: initial?.zoom,
      attributionControl: false,
      // North stays up (docs/design/surface.md, Walking help): a turn by an
      // unintended twist of two fingers only disorients. No tilt.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxZoom: 19,
      // A trail is local: panning and zooming can't lose it (docs/design/surface.md, Bounds),
      // within the part of the map the sheet leaves visible (bounded()).
      transformConstrain: (lngLat, zoom) => this.bounded(lngLat, zoom),
      minZoom: trail.limits.minZoom,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.addControl(new AttributionControl({ compact: false }), "top-right");
    if (this.basemaps.length > 1) this.map.addControl(new BasemapSwitch(this), "top-left");
    container.setAttribute("aria-label", s.map);

    for (const item of trail.items.slice(1)) {
      const el = markerElement(item.n, `${s.station} ${item.n}: ${this.tx(item.title)}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(item.n);
      });
      new Marker({ element: el, anchor: "center" }).setLngLat(item.position!).addTo(this.map);
      this.markers[item.n] = el;
    }
    const repaint = () => this.markers.forEach(paintMarker);
    repaint();
    repaintOnChange(repaint);

    this.map.on("style.load", () => this.addTrailLayers());
    this.watchStyle(container);
    this.map.on("moveend", () => this.keepInside());
  }

  basemapLabel(i = this.basemapIndex): string {
    const l = this.basemaps[i].label;
    return this.tx(l) || Object.values(l)[0] || ""; // the engine's default basemap has its label in en and de only
  }

  get basemapCount(): number {
    return this.basemaps.length;
  }

  get basemapCurrent(): number {
    return this.basemapIndex;
  }

  setBasemap(i: number) {
    if (i === this.basemapIndex || i < 0 || i >= this.basemaps.length) return;
    this.basemapIndex = i;
    this.styleReady = false;
    store.set(`${this.trail.id}:basemap-label`, this.basemaps[i].label[this.trail.languages[0]] ?? "");
    // diff: false reloads the whole style, so style.load fires and the trail's layers are added again.
    this.map.setStyle(this.styleFor(this.basemaps[i]), { diff: false });
  }

  get strings() {
    return this.s;
  }

  /** How far the map may go (docs/design/surface.md, Bounds). */
  get limits() {
    return this.trail.limits;
  }

  /**
   * What covers the map now (portrait: the sheet below its top edge). The
   * bounds hold for the part left visible (bounded()), so the trail's edges
   * reach into the strip above a raised sheet; moving the sheet moves that
   * part, and the map follows where it would leave the bounds.
   */
  setCovered(p: Padding) {
    const was = this.covered;
    if (was && was.top === p.top && was.bottom === p.bottom && was.left === p.left && was.right === p.right) return;
    this.covered = p;
    this.keepInside();
  }

  /** Back inside the bounds, where a change of what is covered left the view outside them. */
  private keepInside() {
    const m = this.map;
    if (!m || m.isMoving()) return; // a move constrains every step itself, and its end comes back here
    const c = m.getCenter(), z = m.getZoom();
    const b = this.bounded(c, z);
    if (Math.abs(b.zoom - z) < 1e-6 && Math.abs(b.center.lng - c.lng) < 1e-9 && Math.abs(b.center.lat - c.lat) < 1e-9) return;
    m.jumpTo({ center: b.center, zoom: b.zoom });
  }

  /**
   * The map's constraint (MapLibre's transformConstrain): the middle of the
   * part of the map the sheet leaves visible stays inside the trail's bounds.
   * Their margins are generous and the minimum zoom shows them whole, so the
   * trail can't be lost; and anything inside them, the visitor near their
   * edge included, can be brought into view, which a hold on the whole view
   * would keep from what is near the edge.
   */
  private bounded(lngLat: MLLngLat, zoom: number): { center: MLLngLat; zoom: number } {
    const m = this.map as MLMap | undefined; // undefined while MapLibre constructs
    const z = Math.min(m?.getMaxZoom() ?? 19, Math.max(m?.getMinZoom() ?? this.trail.limits.minZoom, zoom ?? m?.getZoom() ?? 0));
    const p = this.covered;
    if (!m || !p) return { center: lngLat, zoom: z }; // the first view is set before the layout is known
    const size = worldSize(z);
    const ox = (p.left - p.right) / 2, oy = (p.top - p.bottom) / 2;
    const [[west, south], [east, north]] = this.trail.limits.bounds;
    const nw = MercatorCoordinate.fromLngLat([west, north]), se = MercatorCoordinate.fromLngLat([east, south]);
    const hold = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const at = MercatorCoordinate.fromLngLat(lngLat);
    const vx = hold(at.x * size + ox, nw.x * size, se.x * size);
    const vy = hold(at.y * size + oy, nw.y * size, se.y * size);
    return { center: new MercatorCoordinate((vx - ox) / size, (vy - oy) / size).toLngLat(), zoom: z };
  }

  /**
   * The map centre that shows `at` at the screen point `pt` (container
   * pixels), at this zoom: a camera move by its true centre, so the
   * constraint judges where the map will be. (MapLibre's easeTo with an
   * offset constrains the point it places, as if it were the centre.)
   */
  private centreFor(at: [number, number], pt: { x: number; y: number }, zoom: number): [number, number] {
    const el = this.map.getContainer();
    const size = worldSize(zoom);
    const ox = pt.x - el.clientWidth / 2, oy = pt.y - el.clientHeight / 2;
    const a = MercatorCoordinate.fromLngLat(at);
    const c = new MercatorCoordinate(a.x - ox / size, a.y - oy / size).toLngLat();
    return [c.lng, c.lat];
  }

  /**
   * Metres from p to the trail: the nearest point of its route, or of a
   * station where that is nearer. Far off (a visitor at home), the route's
   * flat local geometry no longer holds, and the nearest of its points by
   * great circle is the answer at that scale.
   */
  distanceToTrail(p: [number, number]): number {
    const c = this.nearCache;
    if (c && c.p[0] === p[0] && c.p[1] === p[1]) return c.d; // asked on every frame of a move, for the same fix
    const lines = routeLines(this.trail.route);
    let d = Infinity;
    for (const it of this.trail.items.slice(1)) d = Math.min(d, distance(p, it.position!));
    for (const line of lines) for (const q of line) d = Math.min(d, distance(p, q));
    if (d <= 50_000) for (const line of lines) d = Math.min(d, onLine(p, line, 0)?.off ?? Infinity);
    this.nearCache = { p, d };
    return d;
  }
  private nearCache?: { p: [number, number]; d: number };

  /**
   * What the visitor sees: the point in the middle of the view `padding`
   * leaves, and the zoom. Undefined while the container has a size the map
   * hasn't taken yet (a layout change, before MapLibre's resize): the
   * padding is then the new layout's, the drawn map the old one's.
   */
  seen(padding: Padding): View | undefined {
    const m = this.map, el = m.getContainer(), drawn = m.getCanvas();
    if (Math.abs(drawn.clientWidth - el.clientWidth) > 1 || Math.abs(drawn.clientHeight - el.clientHeight) > 1) return undefined;
    const c = m.unproject([(padding.left + el.clientWidth - padding.right) / 2, (padding.top + el.clientHeight - padding.bottom) / 2]);
    return { center: [c.lng, c.lat], zoom: m.getZoom() };
  }

  /** A view from seen(), put in the middle of the view `padding` leaves now. */
  show(v: View, padding: Padding) {
    const m = this.map, el = m.getContainer();
    const pt = { x: (padding.left + el.clientWidth - padding.right) / 2, y: (padding.top + el.clientHeight - padding.bottom) / 2 };
    m.jumpTo({ center: this.centreFor(v.center, pt, v.zoom), zoom: v.zoom });
  }

  /** Highlights item n (0 = the trail): selected, previous, next, and the leg to the next. */
  select(n: number) {
    this.selected = n;
    this.markers.forEach((el, i) => {
      const state = i === n ? "selected" : i === n + 1 ? "next" : i === n - 1 && n > 1 ? "prev" : "";
      el.dataset.state = state;
      el.setAttribute("aria-current", i === n ? "true" : "false");
      // The marker's wrapper is positioned by MapLibre; raise the selection above its neighbours.
      el.style.zIndex = i === n ? "3" : state ? "2" : "1";
      paintMarker(el);
    });
    this.updateLeg();
  }

  /**
   * The view a selection's zoom is chosen for (place()): the map as the
   * sheet leaves it at its peek, whatever the sheet's height now (main.ts).
   * Unset, the view a move is given.
   */
  resting?: () => Padding;

  /** The first view of an arrival (no earlier view to keep): the selection as bring() shows it. */
  frame(n: number, padding: Padding) {
    this.bring(n, padding, n === 0 ? 17 : 18, 0);
  }

  /**
   * After a selection change (docs/design/surface.md, Camera): already in
   * view, nothing moves; out of view, the selection is brought near the
   * middle of the view, never zooming in. `from`: the station the visitor
   * stepped from, where the step was to the next or the previous one.
   */
  reveal(n: number, padding: Padding, from?: number) {
    const inView = this.inView(padding);
    if (!inView) return;
    if (n === 0 ? this.trail.items.slice(1).every((it) => inView(it.position!)) : inView(this.trail.items[n].position!)) return;
    this.bring(n, padding, this.map.getZoom(), this.reduceMotion.matches ? 0 : 450, from);
  }

  /**
   * The overview: the trail's whole extent. A station: its neighbours and
   * the legs to them as far as the map stays at a station's scale
   * (NEIGHBOURHOOD); after a step, the station stepped from and the leg
   * between, at whatever scale shows them, since that is the way walked next.
   */
  private bring(n: number, padding: Padding, maxZoom: number, duration: number, from?: number) {
    if (n === 0) {
      const [[w, s], [e, north]] = this.trail.extent;
      const a = MercatorCoordinate.fromLngLat([w, north]), b = MercatorCoordinate.fromLngLat([e, s]);
      const mid = new MercatorCoordinate((a.x + b.x) / 2, (a.y + b.y) / 2).toLngLat();
      this.place([mid.lng, mid.lat], [[w, s], [e, north]], [], padding, maxZoom, duration);
      return;
    }
    const step = from !== undefined && from > 0 && Math.abs(from - n) === 1 ? from : undefined;
    const needed: [number, number][] = [], near: [number, number][] = [];
    for (const k of [n - 1, n + 1]) if (k > 0 && k < this.trail.items.length) (k === step ? needed : near).push(this.trail.items[k].position!);
    for (const leg of this.trail.legs) {
      if (leg.to !== n && leg.from !== n) continue;
      (leg.from === step || leg.to === step ? needed : near).push(...leg.coordinates);
    }
    this.place(this.trail.items[n].position!, needed, near, padding, maxZoom, duration);
  }

  /**
   * The visitor, on a tap of the locate button (walking.ts): out of view,
   * brought near the middle as a selection is, with the trail's nearest
   * point, so that a visitor off the trail sees which way it lies.
   */
  revealVisitor(pos: [number, number], padding: Padding) {
    const inView = this.inView(padding);
    if (!inView || inView(pos)) return;
    this.place(pos, [this.nearestOnTrail(pos)], [], padding, this.map.getZoom(), this.reduceMotion.matches ? 0 : 450);
  }

  /**
   * Moves the map so that `at` stands near the middle of the view `padding`
   * leaves, with `needed` in view at any zoom and `near` in view as far as
   * the zoom stays at NEIGHBOURHOOD or closer. The zoom is the closest, up
   * to maxZoom, at which `at` can stand in the middle third of the resting
   * view with what is to show inside that view: `at` may stand off the exact
   * middle where that spares a zoom-out. It then stands as near the middle
   * of the view as keeps that in the resting view, or as much of it as fits.
   * Above a raised card the view is a strip: the scale stays the resting
   * view's, and lowering the sheet shows the rest.
   */
  private place(at: [number, number], needed: [number, number][], near: [number, number][], padding: Padding, maxZoom: number, duration: number) {
    const m = this.map, el = m.getContainer();
    const W = el.clientWidth, H = el.clientHeight;
    const view = spans(padding, W, H), rest = spans(this.resting?.() ?? padding, W, H);
    const a = MercatorCoordinate.fromLngLat(at);
    const reach = (pts: [number, number][]) => {
      const offs = pts.map((p) => {
        const q = MercatorCoordinate.fromLngLat(p);
        return [q.x - a.x, q.y - a.y];
      });
      return [0, 1].map((i) => ({ lo: Math.min(0, ...offs.map((o) => o[i])), hi: Math.max(0, ...offs.map((o) => o[i])) }));
    };
    const must = reach(needed), all = reach([...needed, ...near]);
    // The world size (pixels) at which `at` can stand in the middle with everything in `r` around it.
    const fits = (r: { lo: number; hi: number }[]) => {
      let size = Infinity;
      for (const i of [0, 1]) {
        const [f0, f1] = inset(rest[i]), [c0, c1] = middle(rest[i]), { lo, hi } = r[i];
        if (hi > 0) size = Math.min(size, (f1 - c0) / hi);
        if (lo < 0) size = Math.min(size, (c1 - f0) / -lo);
        if (hi > lo) size = Math.min(size, (f1 - f0) / (hi - lo));
      }
      return size;
    };
    let size = Math.min(worldSize(Math.min(maxZoom, m.getMaxZoom())), fits(must), Math.max(fits(all), worldSize(NEIGHBOURHOOD)));
    const zoom = Math.max(m.getMinZoom(), Math.log2(Math.max(size, 1e-9) / 512));
    size = worldSize(zoom);
    const hold = (v: number, l: number, h: number) => Math.min(h, Math.max(l, v));
    const [x, y] = [0, 1].map((i) => {
      const [f0, f1] = inset(rest[i]), [c0, c1] = middle(view[i]);
      const range = (r: { lo: number; hi: number }[]) => [Math.max(c0, f0 - size * r[i].lo), Math.min(c1, f1 - size * r[i].hi)];
      // Where nothing has to give way, the middle; else the place nearest to one where it wouldn't.
      const ideal = (r: { lo: number; hi: number }[]) => (f0 - size * r[i].lo + f1 - size * r[i].hi) / 2;
      const [aFrom, aTo] = range(all), [mFrom, mTo] = range(must);
      if (aFrom <= aTo) return hold((view[i][0] + view[i][1]) / 2, aFrom, aTo);
      if (mFrom <= mTo) return hold(ideal(all), mFrom, mTo);
      return hold(ideal(must), c0, c1);
    });
    const was = m.project(at);
    const far = Math.abs(zoom - m.getZoom()) > 1 || Math.abs(was.x - x) > W || Math.abs(was.y - y) > H;
    m.easeTo({ center: this.centreFor(at, { x, y }, zoom), zoom, duration: far ? duration * 1.5 : duration });
  }

  /** The point of the trail nearest p: of its route, or a station where that is nearer. */
  private nearestOnTrail(p: [number, number]): [number, number] {
    let best = { d: Infinity, at: p };
    for (const it of this.trail.items.slice(1)) {
      const d = distance(p, it.position!);
      if (d < best.d) best = { d, at: it.position! };
    }
    for (const line of routeLines(this.trail.route)) {
      const o = onLine(p, line, 0);
      if (o && o.off < best.d) best = { d: o.off, at: o.ahead };
    }
    return best.at;
  }

  /**
   * Where the selection is while it is not on screen within `shown`, for its
   * mark at the edge (edge.ts): a station's marker; for the overview the
   * trail's point nearest the middle of `shown`, while no station and no
   * stretch of the route is in it.
   */
  selectionOutside(shown: Rect): { x: number; y: number } | undefined {
    const m = this.map;
    if (this.selected > 0) {
      const q = m.project(this.trail.items[this.selected].position!);
      return q.x >= shown.l && q.x <= shown.r && q.y >= shown.t && q.y <= shown.b ? undefined : q;
    }
    const nw = MercatorCoordinate.fromLngLat(m.unproject([shown.l, shown.t]));
    const se = MercatorCoordinate.fromLngLat(m.unproject([shown.r, shown.b]));
    const inBox = (x: number, y: number) => x >= nw.x && x <= se.x && y >= nw.y && y <= se.y;
    const cx = (nw.x + se.x) / 2, cy = (nw.y + se.y) / 2;
    let near = { x: 0, y: 0, d: Infinity };
    const consider = (x: number, y: number) => {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < near.d) near = { x, y, d };
    };
    this.mercator ??= {
      lines: routeLines(this.trail.route).map((line) => line.map((p) => MercatorCoordinate.fromLngLat(p))),
      stations: this.trail.items.slice(1).map((it) => MercatorCoordinate.fromLngLat(it.position!)),
    };
    for (const s of this.mercator.stations) {
      if (inBox(s.x, s.y)) return undefined;
      consider(s.x, s.y);
    }
    for (const line of this.mercator.lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        if (crosses(a.x, a.y, b.x, b.y, nw.x, nw.y, se.x, se.y)) return undefined;
        const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / len2)) : 0;
        consider(a.x + t * dx, a.y + t * dy);
      }
    }
    return near.d < Infinity ? m.project(new MercatorCoordinate(near.x, near.y).toLngLat()) : undefined;
  }
  private mercator?: { lines: MercatorCoordinate[][]; stations: MercatorCoordinate[] };

  /** Whether a point is in the view `padding` leaves; undefined where that leaves no map to show anything in. */
  private inView(padding: Padding): ((p: [number, number]) => boolean) | undefined {
    const c = this.map.getContainer();
    const r = { l: padding.left, t: padding.top, r: c.clientWidth - padding.right, b: c.clientHeight - padding.bottom };
    const EDGE = 24; // a marker half off the edge is not in view
    if (r.r - r.l < 3 * EDGE || r.b - r.t < 2 * EDGE + 8) return undefined;
    return (p) => {
      const q = this.map.project(p);
      return q.x >= r.l + EDGE && q.x <= r.r - EDGE && q.y >= r.t + EDGE && q.y <= r.b - EDGE;
    };
  }

  /**
   * A basemap given as a style URL (vector) is one fetch: lost, the map stays
   * blank for the rest of the visit, though the page itself loaded. Until the
   * style arrives, an error that names no source is the style's; the map says
   * so and tries again, sooner when the browser reports a connection.
   * Tiles that fail are MapLibre's to retry, and dead spots are offline's
   * (docs/backlog.md, version 7).
   */
  private watchStyle(container: HTMLElement) {
    let tries = 0;
    let timer = 0;
    const note = document.createElement("p");
    note.className = "map-notice";
    note.setAttribute("role", "status");
    note.hidden = true;
    note.textContent = this.s.mapRetry;
    container.append(note);
    this.retryStyle = () => {
      clearTimeout(timer);
      timer = 0;
      this.styleReady = false;
      this.map.setStyle(this.styleFor(this.basemaps[this.basemapIndex]), { diff: false });
    };
    this.map.on("style.load", () => {
      this.styleReady = true;
      tries = 0;
      clearTimeout(timer);
      timer = 0;
      note.hidden = true;
    });
    this.map.on("error", (e) => {
      if (this.styleReady || "sourceId" in e || timer) return;
      note.hidden = false;
      timer = window.setTimeout(() => this.retryStyle(), Math.min(60, 5 * 2 ** tries++) * 1000);
    });
    addEventListener("online", () => timer && this.retryStyle());
  }
  private styleReady = false;
  private retryStyle = () => {};

  private styleFor(b: Basemap): string | StyleSpecification {
    if (b.style) return b.style;
    return {
      version: 8,
      sources: {
        basemap: { type: "raster", tiles: b.tiles!, tileSize: b.tileSize ?? 256, maxzoom: b.maxzoom ?? 19, attribution: b.attribution },
      },
      layers: [{ id: "basemap", type: "raster", source: "basemap" }],
    };
  }

  private addTrailLayers() {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#2a7fb8";
    const accentDark = css.getPropertyValue("--accent-dark").trim() || "#134a70";
    const m = this.map;
    m.addSource("route", { type: "geojson", data: drawnRoute(this.trail.route) });
    m.addSource("leg", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const round = { "line-cap": "round", "line-join": "round" } as const;
    m.addLayer({ id: "route-casing", type: "line", source: "route", layout: round, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 4, 18, 9], "line-opacity": 0.85 } });
    m.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: round,
      paint: { "line-color": accent, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2.5, 18, 5], "line-dasharray": [1.2, 1.4] },
    });
    m.addLayer({ id: "leg-casing", type: "line", source: "leg", layout: round, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 6, 18, 13] } });
    m.addLayer({ id: "leg", type: "line", source: "leg", layout: round, paint: { "line-color": accentDark, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3.5, 18, 7] } });
    this.updateLeg();
  }

  /**
   * The visitor walks the leg starting at station `from` (walking to the
   * selected station along the leg into it): that leg is the one emphasised.
   * undefined: the leg on from the selection, as without walking help.
   */
  emphasiseLeg(from: number | undefined) {
    if (from === this.walked) return;
    this.walked = from;
    this.updateLeg();
  }

  private updateLeg() {
    const src = this.map.getSource("leg") as import("maplibre-gl").GeoJSONSource | undefined;
    if (!src) return;
    const from = this.walked ?? this.selected;
    const leg = this.trail.legs.find((l) => l.from === from);
    src.setData({
      type: "FeatureCollection",
      features: leg ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: leg.coordinates } }] : [],
    });
  }
}

/**
 * The route as drawn: each stretch once. A route that walks a stretch twice
 * (there and back) has it twice in its data, and two
 * dashed lines on one stretch fill each other's gaps until it looks solid.
 * A segment lying within a metre of one already drawn, at both ends, is
 * dropped; what is left is joined back into runs, so the dashes flow on.
 * The data stays as it is: the legs are built from it (build/legs.ts).
 */
function drawnRoute(route: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const lines = routeLines(route);
  const origin = lines.find((l) => l.length)?.[0];
  if (!origin) return route;
  const TOL = 1; // metres
  const kept: [number, number, number, number][] = []; // segments in local metres
  const near = (x: number, y: number) =>
    kept.some(([ax, ay, bx, by]) => {
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= TOL;
    });
  const runs: [number, number][][] = [];
  for (const line of lines) {
    let run: [number, number][] = [];
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = toLocal(origin, line[i - 1]), [bx, by] = toLocal(origin, line[i]);
      if (near(ax, ay) && near(bx, by)) {
        if (run.length > 1) runs.push(run);
        run = [];
        continue;
      }
      kept.push([ax, ay, bx, by]);
      if (!run.length) run.push(line[i - 1]);
      run.push(line[i]);
    }
    if (run.length > 1) runs.push(run);
  }
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: runs } }] };
}

/** Whether the segment a–b passes through the box x0..x1, y0..y1 (Liang–Barsky). */
function crosses(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      t0 = Math.max(t0, r);
    } else {
      if (r < t0) return false;
      t1 = Math.min(t1, r);
    }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay);
}

/** MapLibre's world size in pixels at a zoom. */
function worldSize(zoom: number): number {
  return 512 * 2 ** zoom;
}

/** The view `p` leaves in a container of w × h, as its spans across and down. */
function spans(p: Padding, w: number, h: number): [number, number][] {
  return [
    [p.left, w - p.right],
    [p.top, h - p.bottom],
  ];
}

/** A span less a margin for the markers, which narrows with the span. */
function inset([a, b]: [number, number]): [number, number] {
  const margin = Math.max(0, Math.min(36, (b - a) / 5));
  return [a + margin, b - margin];
}

/** The middle third of a span: where a thing brought into view stands. */
function middle([a, b]: [number, number]): [number, number] {
  return [a + (b - a) / 3, b - (b - a) / 3];
}

/** The basemaps side by side, the current one marked: nothing to learn, nothing hidden. */
class BasemapSwitch implements IControl {
  private el = document.createElement("div");
  private tm: TrailMap;
  constructor(tm: TrailMap) {
    this.tm = tm;
  }
  onAdd() {
    this.el.className = "maplibregl-ctrl basemap-switch";
    this.el.setAttribute("role", "radiogroup");
    this.el.setAttribute("aria-label", this.tm.strings.basemap);
    const buttons: HTMLButtonElement[] = [];
    const mark = () =>
      buttons.forEach((b, i) => b.setAttribute("aria-checked", String(i === this.tm.basemapCurrent)));
    for (let i = 0; i < this.tm.basemapCount; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.textContent = this.tm.basemapLabel(i);
      b.addEventListener("click", () => {
        this.tm.setBasemap(i);
        mark();
      });
      buttons.push(b);
    }
    mark();
    this.el.append(...buttons);
    return this.el;
  }
  onRemove() {
    this.el.remove();
  }
}
