// Walking help on the map (docs/design/surface.md, Walking help): the
// visitor's position with its accuracy and their facing, the locate button
// that shows them, their mark at the map's edge while they are out of view
// (edge.ts), and the leg they walk into the selected station. The map stays
// north up and never moves by itself: a tap shows the visitor, and then the
// map is the visitor's again.

import { Marker, type GeoJSONSource } from "maplibre-gl";
import "./walking.css";
import type { Padding, TrailMap } from "./map.ts";
import type { Here, HereChange } from "./here.ts";
import type { Trail } from "./trail-types.ts";
import { formatLive, type Strings } from "./strings.ts";
import { distance, inBox, onLine } from "./geo.ts";
import { EDGE_YOU, paintEdgeYou, paintPulse, paintYou, repaintOnChange, type YouLook } from "./on-map.ts";
import type { EdgeMarks } from "./edge.ts";

export interface WalkingOptions {
  trail: Trail;
  /** Where the buttons go (main.ts places it above the sheet). */
  tools: HTMLElement;
  /** The part of the map the sheet leaves visible, as padding. */
  visible: () => Padding;
  edges: EdgeMarks;
  s: Strings;
  lang: string;
}

/** Within this many metres of the selected station the visitor is at it ... */
const ARRIVE = 25;
/** ... until they are this far from it again. */
const LEAVE = 40;
/** A fix vaguer than this says nothing about which leg the visitor is on. */
const VAGUE = 50;
/** On a leg: within this many metres of it. */
const ON_LEG = 40;

export class Walking {
  private tm: TrailMap;
  private here: Here;
  private o: WalkingOptions;
  private you: Marker;
  private youCanvas: HTMLCanvasElement;
  private pulseCanvas: HTMLCanvasElement;
  private youLook: YouLook = { stale: false, coarse: false, heading: "", cone: 0 };
  private locate: HTMLButtonElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  /** The visitor asked to be shown before there was a fresh fix: shown when it comes, unless they moved the map or changed the card meanwhile. */
  private pending = false;
  private selected = 0;
  /** The visitor is at the selected station (with hysteresis): the leg on from it is theirs then. */
  private atSelected = false;

  constructor(tm: TrailMap, here: Here, o: WalkingOptions) {
    this.tm = tm;
    this.here = here;
    this.o = o;
    const map = tm.map;

    const youEl = document.createElement("div");
    youEl.className = "you";
    this.youCanvas = document.createElement("canvas");
    this.pulseCanvas = document.createElement("canvas");
    this.pulseCanvas.className = "you-pulse";
    youEl.append(this.pulseCanvas, this.youCanvas);
    this.you = new Marker({ element: youEl, rotationAlignment: "map", pitchAlignment: "map" });
    const paint = () => {
      paintYou(this.youCanvas, this.youLook);
      paintPulse(this.pulseCanvas);
    };
    paint();
    repaintOnChange(paint);

    this.toastEl = document.createElement("div");
    this.toastEl.className = "map-toast";
    this.toastEl.setAttribute("role", "status");
    this.toastEl.hidden = true;
    map.getContainer().append(this.toastEl);

    // The mark does what the locate button does, where the eye is when the visitor finds themselves gone.
    o.edges.add(
      {
        size: EDGE_YOU,
        target: (shown) => {
          const fix = here.fix;
          const q = fix && map.project(fix.at);
          return q && (q.x < shown.l || q.x > shown.r || q.y < shown.t || q.y > shown.b) ? q : undefined;
        },
        paint: (canvas, deg, arrowLeft) => paintEdgeYou(canvas, this.youLook.stale, deg, arrowLeft),
        tap: () => this.show(),
      },
      o.s.locateShow,
    );

    // One look, whatever the state: it means "show me", and a tap always does that.
    this.locate = document.createElement("button");
    this.locate.type = "button";
    this.locate.className = "tool locate";
    this.locate.setAttribute("aria-label", o.s.locateShow);
    this.locate.title = o.s.locateShow;
    this.locate.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    this.locate.addEventListener("click", () => this.onLocate());
    o.tools.append(this.locate);

    map.on("style.load", () => this.addLayers());
    if (map.isStyleLoaded()) this.addLayers();
    // A move of the visitor's own while the fix is awaited: they have gone on to something else.
    map.on("movestart", (e) => {
      if (e.originalEvent) this.pending = false;
    });
    here.onChange((what) => this.onHere(what));
    this.drawButton();
  }

  /** Item n is selected: which leg the visitor walks depends on it, and a wait to show them ends. */
  select(n: number) {
    if (n !== this.selected) {
      this.atSelected = false;
      this.pending = false;
    }
    this.selected = n;
    this.drawLeg();
  }

  private onLocate() {
    const h = this.here;
    if (!h.active || h.compassNeedsGesture) h.start(true);
    // Said at the tap: the state stays "insecure" on a repeated one. Denied and no fix arrive later, through onHere.
    if (h.state === "insecure") return this.toast(this.o.s.locationInsecure);
    this.show();
  }

  /**
   * Brings the visitor into view as a selection is brought into view
   * (TrailMap.revealPoint), so what was on screen, the trail with it, stays
   * as far as it can; the dot then pulses, so the eye finds it whether the
   * map moved or not. A stale fix is shown as where they were, and the next
   * fix shows where they are.
   */
  private show() {
    const fix = this.here.fix;
    this.pending = this.here.active && (!fix || this.here.stale);
    if (!fix) return;
    if (!inBox(fix.at, this.tm.limits.bounds)) {
      // Beyond the map's bounds: the whole trail, their mark at its edge pointing to them, and how far.
      this.toast(this.o.s.farAway.replace("{d}", formatLive(this.tm.distanceToTrail(fix.at), this.o.lang)));
      this.tm.reveal(0, this.o.visible());
      return;
    }
    this.tm.revealPoint(fix.at, this.o.visible());
    this.pulse();
  }

  private pulse() {
    if (this.reduceMotion.matches) return;
    this.pulseCanvas.animate(
      [
        { transform: "scale(0.3)", opacity: 0.9 },
        { transform: "scale(1)", opacity: 0 },
      ],
      { duration: 900, iterations: 2, easing: "ease-out" },
    );
  }

  private onHere(what: HereChange) {
    const h = this.here;
    if (what === "state") {
      if (h.state === "denied") this.toast(this.o.s.locationDenied);
      if (h.state === "unavailable") this.toast(this.o.s.locationUnavailable, "unavailable");
      if (h.state === "denied") this.pending = false;
      this.drawButton();
      return;
    }
    if (what === "stale") {
      this.paintYou({ stale: h.stale }); // the dot greys: where they were, not where they are
      this.o.edges.place(true);
      this.drawLeg();
      return;
    }
    if (what === "fix") {
      const fix = h.fix!; // Here reports "fix" only with one, and never clears it
      if (this.toastEl.dataset.kind === "unavailable") this.toastEl.hidden = true; // it came after all
      this.you.setLngLat(fix.at);
      if (!this.you.getElement().isConnected) this.you.addTo(this.tm.map);
      this.paintYou({ stale: false, coarse: fix.accuracy > 40 });
      this.drawAccuracy();
      if (this.pending) this.show();
      this.o.edges.place(true);
      this.drawLeg();
    }
    const hd = h.heading;
    this.paintYou(hd ? { heading: hd.source, cone: hd.spread ?? 0 } : { heading: "", cone: 0 });
    if (hd) this.you.setRotation(hd.deg);
  }

  /** The visitor's dot and facing, painted when something changed. */
  private paintYou(change: Partial<YouLook>) {
    const next = { ...this.youLook, ...change };
    if ((Object.keys(next) as (keyof YouLook)[]).every((k) => next[k] === this.youLook[k])) return;
    this.youLook = next;
    paintYou(this.youCanvas, next);
  }

  /**
   * On the leg into the selected station, short of it, the visitor walks that
   * leg: the map emphasises it instead of the leg on (TrailMap.emphasiseLeg).
   * At the station, the leg on is theirs. A stale or vague fix says neither.
   */
  private drawLeg() {
    const n = this.selected;
    const fix = this.here.fix;
    let walked: number | undefined;
    if (n > 0 && fix && !this.here.stale && fix.accuracy <= VAGUE) {
      const d = distance(fix.at, this.o.trail.items[n].position!);
      this.atSelected = d <= (this.atSelected ? LEAVE : ARRIVE);
      const leg = this.atSelected ? undefined : this.o.trail.legs.find((l) => l.to === n);
      const off = leg && onLine(fix.at, leg.coordinates, 0)?.off;
      if (leg && off !== undefined && off <= ON_LEG) walked = leg.from;
    }
    this.tm.emphasiseLeg(walked);
  }

  // --- drawing -----------------------------------------------------------------

  private addLayers() {
    const map = this.tm.map;
    if (map.getSource("you-accuracy")) return;
    map.addSource("you-accuracy", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const before = map.getLayer("route-casing") ? "route-casing" : undefined;
    const you = getComputedStyle(document.documentElement).getPropertyValue("--you").trim() || "#1f6fe0";
    map.addLayer({ id: "you-accuracy", type: "fill", source: "you-accuracy", paint: { "fill-color": you, "fill-opacity": 0.12 } }, before);
    map.addLayer({ id: "you-accuracy-line", type: "line", source: "you-accuracy", paint: { "line-color": you, "line-opacity": 0.35, "line-width": 1 } }, before);
    this.drawAccuracy();
  }

  private drawAccuracy() {
    const src = this.tm.map.getSource("you-accuracy") as GeoJSONSource | undefined;
    const fix = this.here.fix;
    if (!src) return;
    if (!fix) return src.setData({ type: "FeatureCollection", features: [] });
    const [lng, lat] = fix.at;
    const mLat = 111_132, mLng = mLat * Math.cos((lat * Math.PI) / 180);
    const ring: [number, number][] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      ring.push([lng + (fix.accuracy * Math.sin(a)) / mLng, lat + (fix.accuracy * Math.cos(a)) / mLat]);
    }
    src.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } });
  }

  private drawButton() {
    this.locate.dataset.state = this.here.state;
  }

  private toast(msg: string, kind = "") {
    this.toastEl.dataset.kind = kind;
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 6000);
  }
}
