// The map: basemap, route, numbered station markers, the stations' objects,
// and the selection's highlight (selected, previous, next, the leg to the
// next, and the selection's object with its name).

import { AttributionControl, LngLat as MLLngLat, Map as MLMap, Marker, MercatorCoordinate, Popup, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
// Bundled by Vite (?worker&url), so the build target lowers its syntax too (vite.config.ts).
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Arrival, Basemap, CreditUse, Localized, Trail } from "./trail-types.ts";
import type { Strings } from "./strings.ts";
import { store } from "./store.ts";
import { textFor } from "./language.ts";
import { distance, flatPositions, onLine, routeLines, toLocal } from "./geo.ts";
import { creditHtml, mapAttribution } from "./credits.ts";
import { arrivalElement, markerElement, nameElement, paintArrival, paintMarker, paintName, repaintOnChange } from "./on-map.ts";
import { attr, esc } from "./html.ts";
import type { Rect } from "./edge.ts";

setWorkerUrl(workerUrl);

/** A station's scale (docs/design/surface.md, Camera): the farthest out a selection's neighbours take the map (TrailMap.place). */
const NEIGHBOURHOOD = 16;

/** Map styles from the trail, or an OSM-based default for a trail that names none; its style credits OSM. */
const DEFAULT_BASEMAPS: Basemap[] = [{ label: { en: "Map", de: "Karte" }, style: "https://tiles.openfreemap.org/styles/liberty", source: "osm" }];

/** The layers that draw the stations' objects (addTrailLayers): a tap on one selects its station. */
const OBJECT_LAYERS = ["object-fill", "object-edge", "object-ghost", "object-band", "object-point"];
/** An object's look on the map, in pixels: a shape smaller than SMALL across is drawn with a ring of radius RING, as a point is; a line is a band up to BAND wide. */
const SMALL = 20, RING = 11, BAND = 16;
/** Pixels between an object and its name below it. */
const GAP = 4;
/** An arrival point's mark, as a disc: its rounded square's half-width and a little more (on-map.ts, ARRIVAL). */
const ARRIVAL_R = 13;
/** Pixels by which a station's object reaches out beside its selected marker, so it shows (objectZoom). */
const OBJECT_OUT = 14;

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
  private pins: Marker[] = [];
  /** Markers the map's closest zoom can't tell apart (sideBySide): each group's numbers, in order. */
  private together: number[][] = [];
  private arrivals: { el: HTMLElement; at: [number, number] }[] = [];
  /** The selection's neighbours stepped out beside it (nudge()). */
  private nudged = new Set<number>();
  private nameEl: HTMLElement;
  private nameMark: Marker;
  private selected = 0;
  /** The leg the visitor is walking, where walking help knows it (walking.ts): emphasised instead of the selection's. */
  private walked?: number;
  private basemaps: Basemap[];
  private basemapIndex: number;
  private reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  private trail: Trail;
  private lang: string;
  private tx: (l?: Localized) => string;
  private s: Strings;

  constructor(container: HTMLElement, trail: Trail, lang: string, s: Strings, onSelect: (n: number) => void, initial: View | undefined) {
    this.trail = trail;
    this.lang = lang;
    this.tx = textFor(trail, lang);
    this.s = s;
    this.basemaps = trail.basemaps.length ? trail.basemaps : DEFAULT_BASEMAPS;
    // Remembered by label, so reordering the trail's basemaps doesn't remap a visitor's choice.
    const stored = store.get(`${trail.id}:basemap-label`);
    this.basemapIndex = Math.max(0, this.basemaps.findIndex((b) => b.label[trail.languages[0]] === stored));
    const [[west, south], [east, north]] = trail.limits.bounds;

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
      // A trail is local: the map's centre stays inside its bounds, not the
      // whole view as maxBounds would hold it (docs/design/surface.md, Bounds).
      transformConstrain: (c, zoom) => ({
        center: new MLLngLat(hold(c.lng, west, east), hold(c.lat, south, north)),
        zoom: hold(zoom, trail.limits.minZoom, 19),
      }),
      minZoom: trail.limits.minZoom,
      locale: { "Popup.Close": s.close },
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.addControl(new AttributionControl({ compact: false }), "top-right");
    container.setAttribute("aria-label", s.map);

    // The ways on to the trail and off it lie under everything the trail itself marks (docs/design/surface.md, Arrival points).
    const arrivals = trail.arrivals.map((a) => {
      const el = arrivalElement(a.kind, `${s[`arrival_${a.kind}`]}: ${this.tx(a.name)}`);
      el.style.zIndex = "0";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showArrival(a);
      });
      new Marker({ element: el, anchor: "center" }).setLngLat(a.position).addTo(this.map);
      return { el, at: a.position };
    });
    this.arrivals = arrivals;
    // A start before station 1 is item 0's place: its marker is the waymark and selects the overview.
    // First in the page, so the stations' markers lie over it at the same z-index (select()).
    const startAt = trail.start?.position;
    if (startAt) {
      const el = markerElement(0, `${s.start}: ${this.tx(trail.start!.name)}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(0);
      });
      this.pins[0] = new Marker({ element: el, anchor: "center" }).setLngLat(startAt).addTo(this.map);
      this.markers[0] = el;
    }
    for (const item of trail.items.slice(1)) {
      const el = markerElement(item.n, `${s.station} ${item.n}: ${this.tx(item.title)}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(item.n);
      });
      this.pins[item.n] = new Marker({ element: el, anchor: "center" }).setLngLat(item.position!).addTo(this.map);
      this.markers[item.n] = el;
    }
    this.together = sideBySide(this.pins);
    // The selection's object is named on the map; under the markers, which stay what is tapped.
    this.nameEl = nameElement();
    this.nameMark = new Marker({ element: this.nameEl, anchor: "center" });
    for (const it of trail.items) {
      if (!it.object) continue;
      const ms = flatPositions(it.object.geometry.coordinates).map((p) => MercatorCoordinate.fromLngLat(p));
      const xs = ms.map((q) => q.x), ys = ms.map((q) => q.y);
      this.objectBoxes.set(it.n, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), south: new MercatorCoordinate(0, Math.max(...ys)).toLngLat().lat, north: new MercatorCoordinate(0, Math.min(...ys)).toLngLat().lat });
    }
    this.map.on("zoom", () => {
      this.placeName();
      this.nudge();
      this.clearArrivals();
    });
    this.map.on("zoomend", () => this.updateObjects());
    this.map.on("click", (e) => {
      const { x, y } = e.point;
      const hit = this.map.queryRenderedFeatures([[x - 8, y - 8], [x + 8, y + 8]], { layers: OBJECT_LAYERS.filter((id) => this.map.getLayer(id)) });
      if (hit.length) onSelect(Number(hit[0].properties.n));
    });
    this.map.on("mousemove", (e) => {
      const over = this.map.queryRenderedFeatures(e.point, { layers: OBJECT_LAYERS.filter((id) => this.map.getLayer(id)) }).length > 0;
      this.map.getCanvas().style.cursor = over ? "pointer" : "";
    });
    const repaint = () => {
      this.markers.forEach(paintMarker);
      arrivals.forEach((a) => paintArrival(a.el));
      this.paintName();
    };
    repaint();
    repaintOnChange(repaint);

    this.map.on("style.load", () => this.addTrailLayers());
    this.watchStyle(container);
  }

  /** An arrival point's name and what the trail says of it, beside its mark; the selection stays as it was. */
  private showArrival(a: Arrival) {
    const note = this.tx(a.note), link = a.link && this.tx(a.link.label);
    const html =
      `<p class="arrival-kind">${esc(this.s[`arrival_${a.kind}`])}</p><p class="arrival-name">${esc(this.tx(a.name))}</p>` +
      (note ? `<p>${esc(note)}</p>` : "") +
      (a.link ? `<p><a href="${attr(a.link.url)}" target="_blank" rel="noopener">${esc(link!)}</a></p>` : "");
    this.popup?.remove();
    this.popup = new Popup({ className: "arrival-pop", offset: 16, maxWidth: "260px", focusAfterOpen: false }).setLngLat(a.position).setHTML(html).addTo(this.map);
  }
  private popup?: Popup;

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

  /** The basemap and its style, for its picture in the basemap choice (basemaps.ts). */
  basemapAt(i: number): Basemap {
    return this.basemaps[i];
  }
  basemapStyle(i: number): string | StyleSpecification {
    return this.styleFor(this.basemaps[i]);
  }

  get strings() {
    return this.s;
  }

  /** How far the map may go (docs/design/surface.md, Bounds). */
  get limits() {
    return this.trail.limits;
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
    this.popup?.remove();
    this.markers.forEach((el, i) => {
      const state = i === n ? "selected" : i === n + 1 ? "next" : i === n - 1 ? "prev" : "";
      el.dataset.state = state;
      el.setAttribute("aria-current", i === n ? "true" : "false");
      // The marker's wrapper is positioned by MapLibre; raise the selection above its neighbours.
      // The start's waymark stays under the stations, even selected: it is often a few metres from
      // the first or last station, and over them, larger, it would hide them where the trail is first seen.
      el.style.zIndex = i === 0 ? "1" : i === n ? "3" : state ? "2" : "1";
      paintMarker(el);
    });
    this.spread();
    this.nudge();
    this.clearArrivals();
    this.updateLeg();
    this.updateObjects();
  }

  /**
   * An arrival point's mark gives way where a station's marker covers part
   * of it (docs/design/surface.md, Arrival points): half a pictogram beside
   * a number reads as a digit. Zoomed in, the two part and it is back.
   */
  private clearArrivals() {
    if (!this.arrivals.length) return;
    const stations = this.trail.items.slice(1).map((it) => ({ at: this.map.project(this.pins[it.n].getLngLat()).add(this.pins[it.n].getOffset()), r: this.radius(it.n) }));
    for (const a of this.arrivals) {
      const p = this.map.project(a.at);
      const covered = stations.some((st) => Math.hypot(p.x - st.at.x, p.y - st.at.y) < st.r + ARRIVAL_R);
      a.el.style.visibility = covered ? "hidden" : "";
    }
  }

  /** A station marker's radius as drawn now, in pixels. */
  private radius(n: number): number {
    return (Number(this.markers[n].dataset.size) || 28) / 2 + (n === this.selected ? 3 : 0);
  }

  /**
   * The zoom at which the selection's object reaches out beside its marker,
   * which at a coarser scale covers it (docs/design/surface.md, Camera).
   * Undefined for a station without one.
   */
  private objectZoom(n: number): number | undefined {
    const object = this.trail.items[n].object;
    if (!object) return undefined;
    const at = MercatorCoordinate.fromLngLat(this.pins[n].getLngLat());
    const far = Math.max(...flatPositions(object.geometry.coordinates).map((p) => {
      const q = MercatorCoordinate.fromLngLat(p);
      return Math.hypot(q.x - at.x, q.y - at.y);
    }));
    return far > 0 ? Math.log2((this.radius(n) + OBJECT_OUT) / far / 512) : undefined;
  }

  /**
   * The stations before and after the selection step out beside it where
   * its larger marker would cover them, along the line between the two, as
   * far as it takes; zoomed in until they part, they stand where they are
   * (docs/design/surface.md, Markers on one spot).
   */
  private nudge() {
    for (const k of this.nudged) this.pins[k].setOffset([0, 0]);
    this.nudged.clear();
    const n = this.selected;
    if (n === 0) return;
    const grouped = (i: number) => this.together.some((g) => g.includes(i));
    const p = this.map.project(this.pins[n].getLngLat()).add(this.pins[n].getOffset());
    for (const k of [n - 1, n + 1]) {
      if (k < 1 || k >= this.trail.items.length || grouped(k)) continue;
      const q = this.map.project(this.pins[k].getLngLat());
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      const need = this.radius(n) + this.radius(k) + 2;
      if (d >= need) continue;
      const [ux, uy] = d > 0.5 ? [dx / d, dy / d] : [Math.sign(k - n), 0];
      this.pins[k].setOffset([ux * (need - d), uy * (need - d)]);
      this.nudged.add(k);
    }
  }

  /** Each group of sideBySide() in a row on its spot, in order, as wide as its markers are now. */
  private spread() {
    for (const g of this.together) {
      const sizes = g.map((i) => Number(this.markers[i].dataset.size));
      let x = -(sizes.reduce((a, b) => a + b, 0) + 2 * (g.length - 1)) / 2;
      g.forEach((i, k) => {
        this.pins[i].setOffset([x + sizes[k] / 2, 0]);
        x += sizes[k] + 2;
      });
    }
  }

  /**
   * The view a selection's zoom is chosen for (place()): the map as the
   * sheet leaves it at its peek, whatever the sheet's height now (main.ts).
   * Unset, the view a move is given.
   */
  resting?: () => Padding;

  /** The first view of an arrival (no earlier view to keep): the selection as bring() shows it. */
  frame(n: number, padding: Padding) {
    this.bring(n, padding, this.close(n), 0);
  }

  /**
   * The scale a station opened on its own is shown at, where streets and
   * buildings read; no closer than a raster basemap's own tiles go: beyond,
   * its labels and buildings are enlarged from coarser ones, which on a
   * phone's screen is a blur. The visitor can still zoom in themselves.
   */
  private close(n: number): number {
    const sharp = this.basemaps[this.basemapIndex].tiles ? this.basemaps[this.basemapIndex].maxzoom ?? Infinity : Infinity;
    return Math.min(n === 0 ? 17 : 18, sharp);
  }

  /**
   * After a selection change (docs/design/surface.md, Camera). `from`: the
   * item selected before; `opened`: chosen on the overview's card (its list,
   * "Start at 1"), so shown as a station opened on its own.
   */
  reveal(n: number, padding: Padding, from?: number, opened = false) {
    const inView = this.inView(padding);
    if (!inView) return;
    const duration = this.reduceMotion.matches ? 0 : 450;
    if (opened && n > 0) return this.bring(n, padding, this.close(n), duration);
    const part = this.objectZoom(n);
    if (part !== undefined && part > this.map.getZoom() + 0.05) return this.bring(n, padding, Math.min(part, this.close(n)), duration, from);
    const it = this.trail.items[n];
    if (n === 0 ? this.trail.items.slice(1).every((s) => inView(s.position!)) : inView(it.position!) && (!it.object || this.nameInView(padding))) return;
    this.bring(n, padding, this.map.getZoom(), duration, from);
  }

  /** A station's neighbours and legs are `near`; after a step, the station stepped from and the leg between are `needed` (place). */
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
    const object = this.trail.items[n].object;
    if (object) needed.push(...flatPositions(object.geometry.coordinates));
    // The object's name can stand below or above the shape, centred on it: room for it inside the view's edges.
    const name = this.nameSize();
    this.place(this.trail.items[n].position!, needed, near, padding, maxZoom, duration, object ? { side: name.w / 2, across: RING + GAP + name.h } : undefined);
  }

  /** The visitor, on a tap of the locate button (docs/design/surface.md, Walking help). */
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
   * view's, and lowering the sheet shows the rest. `clear`: pixels kept
   * clear beside, above and below what is to show, where something hangs off it
   * (an object's name).
   *
   * If this gets unwieldy: mirroring `needed` and `near` around `at` and
   * fitting that box (cameraForBounds at the resting padding, maxZoom the
   * current zoom, `near` only as far as NEIGHBOURHOOD allows) puts `at`
   * exactly in the middle, at most about half a zoom level further out.
   */
  private place(at: [number, number], needed: [number, number][], near: [number, number][], padding: Padding, maxZoom: number, duration: number, clear?: { side: number; across: number }) {
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
        const [f0, f1] = inset(rest[i], i ? clear?.across : clear?.side, i ? clear?.across : clear?.side), [c0, c1] = middle(rest[i]), { lo, hi } = r[i];
        if (hi > 0) size = Math.min(size, (f1 - c0) / hi);
        if (lo < 0) size = Math.min(size, (c1 - f0) / -lo);
        if (hi > lo) size = Math.min(size, (f1 - f0) / (hi - lo));
      }
      return size;
    };
    let size = Math.min(worldSize(Math.min(maxZoom, m.getMaxZoom())), fits(must), Math.max(fits(all), worldSize(NEIGHBOURHOOD)));
    const zoom = Math.max(m.getMinZoom(), Math.log2(Math.max(size, 1e-9) / 512));
    size = worldSize(zoom);
    const [x, y] = [0, 1].map((i) => {
      const [f0, f1] = inset(rest[i], i ? clear?.across : clear?.side, i ? clear?.across : clear?.side), [c0, c1] = middle(view[i]);
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
   *
   * If this needs simplifying: with the route densified at build time (a
   * point every few tens of metres), stations and route points alone tell
   * whether the trail is in view and which part is nearest, without
   * crosses() or the projection onto segments.
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
    const own = this.trail.credits.find((c) => c.key === b.source);
    const attribution = b.attribution ?? (own && creditHtml(own, this.lang));
    return {
      version: 8,
      sources: {
        basemap: { type: "raster", tiles: b.tiles!, tileSize: b.tileSize ?? 256, maxzoom: b.maxzoom ?? 19, attribution },
      },
      layers: [{ id: "basemap", type: "raster", source: "basemap" }],
    };
  }

  private addTrailLayers() {
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#2a7fb8";
    const accentDark = css.getPropertyValue("--accent-dark").trim() || "#134a70";
    const m = this.map;
    // What the trail draws credits its sources in the map's attribution (docs/design/trail-content.md, Sources).
    const credit = (...uses: CreditUse[]) => mapAttribution(this.trail, uses, this.lang, this.basemaps[this.basemapIndex].source);
    // Under the route, so the way stays legible where it passes over or beside one.
    m.addSource("objects", { type: "geojson", data: this.objectData(), attribution: credit("objects") });
    const sel = (on: number, off: number) => ["case", ["get", "sel"], on, off] as any;
    // A thing that is gone has no body: no fill, and its edge or line dotted (docs/design/surface.md, Objects).
    const body = (on: number, off: number) => ["case", ["get", "gone"], 0, sel(on, off)] as any;
    const is = (...types: string[]) => ["in", ["geometry-type"], ["literal", types]] as any;
    const polygons = is("Polygon", "MultiPolygon"), lines = is("LineString", "MultiLineString"), points = is("Point", "MultiPoint");
    const there = ["!", ["get", "gone"]] as any, gone = ["get", "gone"] as any;
    m.addLayer({ id: "object-fill", type: "fill", source: "objects", filter: polygons, paint: { "fill-color": accentDark, "fill-opacity": body(0.22, 0.08) } });
    m.addLayer({ id: "object-casing", type: "line", source: "objects", filter: ["any", polygons, ["all", lines, gone]], layout: { "line-join": "round" }, paint: { "line-color": "#ffffff", "line-opacity": sel(0.9, 0.6), "line-width": sel(5.5, 3.5) } });
    m.addLayer({ id: "object-edge", type: "line", source: "objects", filter: ["all", polygons, there], layout: { "line-join": "round" }, paint: { "line-color": accentDark, "line-opacity": sel(1, 0.55), "line-width": sel(2.5, 1.5) } });
    m.addLayer({ id: "object-ghost", type: "line", source: "objects", filter: ["all", ["any", polygons, lines], gone], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": accentDark, "line-opacity": sel(1, 0.55), "line-width": sel(3, 2), "line-dasharray": [0.1, 2] } });
    m.addLayer({ id: "object-band", type: "line", source: "objects", filter: ["all", lines, there], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": accentDark, "line-opacity": sel(0.4, 0.18), "line-width": ["interpolate", ["linear"], ["zoom"], 13, sel(BAND / 2, 5), 18, sel(BAND, 10)] } });
    m.addLayer({ id: "object-point", type: "circle", source: "objects", filter: points, paint: { "circle-radius": sel(RING, RING - 3), "circle-color": accentDark, "circle-opacity": body(0.22, 0.08), "circle-stroke-color": accentDark, "circle-stroke-width": sel(3, 1.5), "circle-stroke-opacity": ["case", ["get", "gone"], sel(0.6, 0.35), sel(1, 0.55)] } });
    m.addSource("route", { type: "geojson", data: drawnRoute(this.trail.route), attribution: credit("route", "arrivals") }); // the arrival points are markers, with no source of their own
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
   * The stations' objects, the selection's marked `sel`. A shape too small
   * at this zoom to be seen gets a ring where its name stands, as a point
   * has, so that it doesn't vanish into the map's own marks.
   */
  private objectData(): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const it of this.trail.items) {
      if (!it.object) continue;
      const properties = { n: it.n, sel: it.n === this.selected, gone: !!it.object.gone };
      features.push({ type: "Feature", properties, geometry: it.object.geometry });
      if (this.small(it.n)) features.push({ type: "Feature", properties, geometry: { type: "Point", coordinates: it.object.at } });
    }
    return { type: "FeatureCollection", features };
  }

  /** Each object's extent in Mercator units, for its size on screen. */
  private objectBoxes = new Map<number, { x0: number; y0: number; x1: number; y1: number; south: number; north: number }>();

  private screenSize(n: number): { w: number; h: number } {
    const b = this.objectBoxes.get(n)!, size = worldSize(this.map.getZoom());
    return { w: (b.x1 - b.x0) * size, h: (b.y1 - b.y0) * size };
  }

  private small(n: number): boolean {
    const { w, h } = this.screenSize(n);
    return Math.max(w, h) < SMALL;
  }

  /** The selection's object drawn as selected and named; the others faint. */
  private updateObjects() {
    (this.map.getSource("objects") as import("maplibre-gl").GeoJSONSource | undefined)?.setData(this.objectData());
    this.paintName();
    this.placeName();
  }

  private paintName() {
    const object = this.trail.items[this.selected]?.object;
    if (object) paintName(this.nameEl, this.tx(object.name), object.gone && this.tx(object.gone));
  }

  /**
   * The name inside a shape with room for it; else below the shape, its
   * ring or the middle of its line, so it doesn't cover the thing it names;
   * above it where the station's own marker would cover it there.
   */
  private placeName() {
    const object = this.trail.items[this.selected]?.object;
    if (!object) {
      this.nameMark.remove();
      return;
    }
    const { w, h } = this.screenSize(this.selected);
    const { w: nw, h: nh } = this.nameSize();
    const box = this.objectBoxes.get(this.selected)!;
    const shape = object.geometry.type === "Polygon" || object.geometry.type === "MultiPolygon";
    const places: { at: [number, number]; dy: number }[] = [];
    if (this.small(this.selected) || object.geometry.type === "Point" || object.geometry.type === "MultiPoint") {
      places.push({ at: object.at, dy: RING + GAP + nh / 2 }, { at: object.at, dy: -(RING + GAP + nh / 2) });
    } else if (!shape) {
      places.push({ at: object.at, dy: BAND / 2 + GAP + nh / 2 }, { at: object.at, dy: -(BAND / 2 + GAP + nh / 2) });
    } else {
      if (w >= nw + 16 && h >= nh + 16) places.push({ at: object.at, dy: 0 });
      places.push({ at: [object.at[0], box.south], dy: GAP + nh / 2 }, { at: [object.at[0], box.north], dy: -(GAP + nh / 2) });
    }
    const marker = this.markers[this.selected]?.getBoundingClientRect(), frame = this.map.getContainer().getBoundingClientRect();
    const covered = ({ at, dy }: { at: [number, number]; dy: number }) => {
      if (!marker) return false;
      const q = this.map.project(at), x = q.x + frame.left, y = q.y + dy + frame.top;
      return x + nw / 2 > marker.left && x - nw / 2 < marker.right && y + nh / 2 > marker.top && y - nh / 2 < marker.bottom;
    };
    const { at, dy } = places.find((p) => !covered(p)) ?? places[0];
    this.nameMark.setLngLat(at).setOffset([0, dy]).addTo(this.map);
  }

  private nameSize(): { w: number; h: number } {
    return { w: parseFloat(this.nameEl.style.width) || 0, h: parseFloat(this.nameEl.style.height) || 0 };
  }

  /** Whether the selection's object's name, where placeName put it, is wholly on the map `padding` leaves. */
  private nameInView(padding: Padding): boolean {
    const el = this.map.getContainer(), { w, h } = this.nameSize();
    const q = this.map.project(this.nameMark.getLngLat()), dy = this.nameMark.getOffset().y;
    const x = q.x, y = q.y + dy;
    return x - w / 2 >= padding.left && x + w / 2 <= el.clientWidth - padding.right && y - h / 2 >= padding.top && y + h / 2 <= el.clientHeight - padding.bottom;
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

const hold = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** MapLibre's world size in pixels at a zoom. */
/**
 * Markers closer than a marker's width at the map's closest zoom (one sign
 * for two stations, docs/design/surface.md, Markers on one spot): grouped,
 * each group moved to its middle, where spread() sets them side by side.
 */
function sideBySide(pins: Marker[]): number[][] {
  const at = pins.map((p) => p && MercatorCoordinate.fromLngLat(p.getLngLat()));
  const apart = 32 / worldSize(19);
  const group: number[] = [];
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  at.forEach((_, i) => (group[i] = i));
  at.forEach((a, i) => at.forEach((b, j) => {
    if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < apart) group[root(j)] = root(i);
  }));
  const groups = new Map<number, number[]>();
  at.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]));
  const together = [...groups.values()].filter((g) => g.length > 1);
  for (const g of together) {
    const x = g.reduce((sum, i) => sum + at[i].x, 0) / g.length, y = g.reduce((sum, i) => sum + at[i].y, 0) / g.length;
    const mid = new MercatorCoordinate(x, y).toLngLat();
    for (const i of g) pins[i].setLngLat(mid);
  }
  return together;
}

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

/** A span less a margin for the markers, which narrows with the span, and at least `start` and `end` where given. */
function inset([a, b]: [number, number], start = 0, end = 0): [number, number] {
  const margin = Math.max(0, Math.min(36, (b - a) / 5)), most = (b - a) / 3;
  return [a + Math.max(margin, Math.min(start, most)), b - Math.max(margin, Math.min(end, most))];
}

/** The middle third of a span: where a thing brought into view stands. */
function middle([a, b]: [number, number]): [number, number] {
  return [a + (b - a) / 3, b - (b - a) / 3];
}
