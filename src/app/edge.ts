// Buttons at the edge of the visible map for what is out of view
// (docs/design/surface.md, Off screen). The owners say where their thing is,
// how its mark looks and what a tap does; this places the marks clear of the
// map's buttons and of each other.

import type { Map as MLMap } from "maplibre-gl";
import type { Padding } from "./map.ts";
import { repaintOnChange, type EdgeSize } from "./on-map.ts";

/** A box in map-container pixels. */
export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface EdgeMark {
  size: EdgeSize;
  /** Where the thing is (container pixels) while it is outside `shown`, the part of the map on screen; else undefined. */
  target(shown: Rect): { x: number; y: number } | undefined;
  /** Paints the mark with its arrow toward deg, clockwise from up, at its left end or its right. */
  paint(canvas: HTMLCanvasElement, deg: number, arrowLeft: boolean): void;
  tap(): void;
}

/** How far past the view's padded edge the map still shows: a thing whose centre lies within it counts as on screen. */
const SHOWN = 16;
/** How far past the view's padded sides and bottom a mark docks: about where the map's buttons sit from the frame. */
const DOCK = 10;
/** Between a mark and what it keeps clear of. */
const GAP = 8;
/** How long (ms) a thing is out of view before its mark appears (docs/design/surface.md, Off screen). */
const SETTLE = 400;

export class EdgeMarks {
  private map: MLMap;
  private visible: () => Padding;
  private avoid: () => (Element | null)[];
  private layer = document.createElement("div");
  /** `out`: since when its thing has been out of view, while its mark waits to appear. */
  private marks: { mark: EdgeMark; el: HTMLButtonElement; canvas: HTMLCanvasElement; look?: string; out?: number }[] = [];
  /** The map moves by the site's own doing (a selection brought into view, the locate button): no marks rise on the way. */
  private sited = false;
  private timer = 0;

  /** `avoid`: what sits over the map that a mark must not cover (the locate button, the attribution). */
  constructor(map: MLMap, visible: () => Padding, avoid: () => (Element | null)[]) {
    this.map = map;
    this.visible = visible;
    this.avoid = avoid;
    // Its own layer above the markers: a mark that passes over one stays on top.
    this.layer.className = "edge-marks";
    map.getContainer().append(this.layer);
    map.on("movestart", (e) => (this.sited = !e.originalEvent));
    map.on("move", () => this.place());
    map.on("moveend", () => {
      this.sited = false;
      this.place();
    });
    map.on("resize", () => this.place());
    repaintOnChange(() => this.place(true));
  }

  /** Marks added earlier keep their place; later ones move aside along the edge. */
  add(mark: EdgeMark, label: string): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "edge-mark";
    el.hidden = true;
    el.style.width = `${mark.size.w}px`;
    el.style.height = `${mark.size.h}px`;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    el.append(canvas);
    el.addEventListener("click", () => mark.tap());
    this.label(el, label);
    this.layer.append(el);
    this.marks.push({ mark, el, canvas });
    return el;
  }

  label(el: HTMLButtonElement, label: string) {
    el.setAttribute("aria-label", label);
    el.title = label;
  }

  /** Each mark where its thing is out of view; `repaint` where its look changed, not only its arrow. */
  place(repaint = false) {
    const c = this.map.getContainer();
    const W = c.clientWidth, H = c.clientHeight;
    const p = this.visible();
    const view: Rect = { l: p.left, t: p.top, r: W - p.right, b: H - p.bottom };
    const shown: Rect = { l: Math.max(0, view.l - SHOWN), t: Math.max(0, view.t - SHOWN), r: Math.min(W, view.r + SHOWN), b: Math.min(H, view.b + SHOWN) };
    // The top keeps the padding's own clearance below the basemap choice.
    const dock: Rect = { l: Math.max(0, view.l - DOCK), t: view.t, r: Math.min(W, view.r + DOCK), b: Math.min(H, view.b + DOCK) };
    // Down to the strip above a raised sheet: a far-away visitor needs their mark most.
    const room = view.r - view.l >= 48 && view.b - view.t >= 48;
    const box = c.getBoundingClientRect();
    const clear: Rect[] = [];
    for (const el of this.avoid()) {
      const r = el?.getBoundingClientRect();
      if (r && r.width && r.height) clear.push({ l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top });
    }
    const now = performance.now();
    let wait = Infinity;
    for (const m of this.marks) {
      if (repaint) m.look = undefined;
      const q = room ? m.mark.target(shown) : undefined;
      if (!q) {
        m.el.hidden = true;
        m.out = undefined;
        continue;
      }
      if (m.el.hidden) {
        if (this.sited) {
          m.out = undefined;
          continue;
        }
        m.out ??= now;
        const left = m.out + SETTLE - now;
        if (left > 0) {
          wait = Math.min(wait, left);
          continue;
        }
        m.el.hidden = false;
      }
      const { w, h } = m.mark.size;
      const at = spot(dock, q, w / 2, h / 2, clear);
      clear.push({ l: at.x - w / 2, t: at.y - h / 2, r: at.x + w / 2, b: at.y + h / 2 });
      m.el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)`;
      const deg = Math.round((Math.atan2(q.x - at.x, at.y - q.y) * 180) / Math.PI);
      // The arrow at the end nearer the frame's side, so it points outward rather than across the thing.
      const arrowLeft = at.x < (view.l + view.r) / 2;
      const look = `${deg} ${arrowLeft}`;
      if (look !== m.look) {
        m.look = look;
        m.mark.paint(m.canvas, deg, arrowLeft);
      }
    }
    clearTimeout(this.timer);
    if (wait < Infinity) this.timer = window.setTimeout(() => this.place(), wait + 20);
  }
}

/**
 * Where a mark of half-size hx × hy stands inside the dock: where the line
 * from the dock's middle to its thing meets the dock's edge, moved along
 * that edge out of what it keeps clear of.
 */
function spot(dock: Rect, q: { x: number; y: number }, hx: number, hy: number, clear: Rect[]): { x: number; y: number } {
  const cx = (dock.l + dock.r) / 2, cy = (dock.t + dock.b) / 2;
  const hw = Math.max(0, (dock.r - dock.l) / 2 - hx), hh = Math.max(0, (dock.b - dock.t) / 2 - hy);
  const dx = q.x - cx, dy = q.y - cy;
  const tx = hw / Math.abs(dx || 1e-9), ty = hh / Math.abs(dy || 1e-9);
  const t = Math.min(tx, ty);
  const at = { x: cx + dx * t, y: cy + dy * t };
  // On the top or bottom edge it moves across, on a side up and down.
  const across = ty <= tx;
  const lo = across ? cx - hw : cy - hh, hi = across ? cx + hw : cy + hh;
  const kx = hx + GAP, ky = hy + GAP;
  for (let round = 0; round < 4; round++) {
    let moved = false;
    for (const o of clear) {
      if (at.x <= o.l - kx || at.x >= o.r + kx || at.y <= o.t - ky || at.y >= o.b + ky) continue;
      const v = across ? at.x : at.y;
      const before = across ? o.l - kx : o.t - ky, after = across ? o.r + kx : o.b + ky;
      const ways = [before, after].filter((w) => w >= lo && w <= hi);
      if (!ways.length) continue; // nowhere along this edge: overlap rather than leave it
      const w = ways.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
      if (across) at.x = w;
      else at.y = w;
      moved = true;
    }
    if (!moved) break;
  }
  return at;
}
