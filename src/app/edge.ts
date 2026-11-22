// What is out of view, at the edge of the visible map
// (docs/design/surface.md, Off screen): each mark is the thing in small with
// a tip toward it, and a tap brings it into view. The owners say where their
// thing is and what a tap does; this places the marks clear of the map's
// buttons and of each other.

import type { Map as MLMap } from "maplibre-gl";
import type { Padding } from "./map.ts";
import { EDGE_TIP, repaintOnChange } from "./on-map.ts";

/** A box in map-container pixels. */
export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface EdgeMark {
  /** The chip's drawn radius. */
  radius: number;
  /** Where the thing is (container pixels) while it is outside `shown`, the part of the map on screen; else undefined. */
  target(shown: Rect): { x: number; y: number } | undefined;
  /** Paints the mark with its tip toward deg, clockwise from up. */
  paint(canvas: HTMLCanvasElement, deg: number): void;
  tap(): void;
}

/** Beyond the view the padding leaves, map that still shows: a thing whose middle is in it is on screen. */
const SHOWN = 16;
/** Between a mark and what it keeps clear of. */
const GAP = 10;

export class EdgeMarks {
  private map: MLMap;
  private visible: () => Padding;
  private avoid: () => (Element | null)[];
  private layer = document.createElement("div");
  private marks: { mark: EdgeMark; el: HTMLButtonElement; canvas: HTMLCanvasElement; deg?: number }[] = [];

  /** `avoid`: what sits over the map that a mark must not cover (the locate button, the attribution). */
  constructor(map: MLMap, visible: () => Padding, avoid: () => (Element | null)[]) {
    this.map = map;
    this.visible = visible;
    this.avoid = avoid;
    // Its own layer above the markers: a mark that passes over one stays on top.
    this.layer.className = "edge-marks";
    map.getContainer().append(this.layer);
    map.on("move", () => this.place());
    map.on("resize", () => this.place());
    repaintOnChange(() => this.place(true));
  }

  /** Marks added earlier keep their place; later ones move aside along the edge. */
  add(mark: EdgeMark, label: string): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "edge-mark";
    el.hidden = true;
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

  /** Each mark where its thing is out of view; `repaint` where its look changed, not only its tip. */
  place(repaint = false) {
    const c = this.map.getContainer();
    const W = c.clientWidth, H = c.clientHeight;
    const p = this.visible();
    const view: Rect = { l: p.left, t: p.top, r: W - p.right, b: H - p.bottom };
    const shown: Rect = { l: Math.max(0, view.l - SHOWN), t: Math.max(0, view.t - SHOWN), r: Math.min(W, view.r + SHOWN), b: Math.min(H, view.b + SHOWN) };
    // Down to the strip above a raised sheet: a far-away visitor needs their mark most.
    const room = view.r - view.l >= 48 && view.b - view.t >= 48;
    const box = c.getBoundingClientRect();
    const clear: Rect[] = [];
    for (const el of this.avoid()) {
      const r = el?.getBoundingClientRect();
      if (r && r.width && r.height) clear.push({ l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top });
    }
    for (const m of this.marks) {
      if (repaint) m.deg = undefined;
      const q = room ? m.mark.target(shown) : undefined;
      m.el.hidden = !q;
      if (!q) continue;
      const at = spot(view, q, m.mark.radius, clear);
      clear.push({ l: at.x - m.mark.radius, t: at.y - m.mark.radius, r: at.x + m.mark.radius, b: at.y + m.mark.radius });
      m.el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)`;
      const deg = Math.round((Math.atan2(q.x - at.x, at.y - q.y) * 180) / Math.PI);
      if (deg !== m.deg) m.mark.paint(m.canvas, (m.deg = deg));
    }
  }
}

/**
 * Where on the edge of the view a mark stands: where the line from the
 * view's middle to its thing meets the edge, moved along that edge out of
 * what it keeps clear of.
 */
function spot(view: Rect, q: { x: number; y: number }, radius: number, clear: Rect[]): { x: number; y: number } {
  const inset = radius + 4;
  const cx = (view.l + view.r) / 2, cy = (view.t + view.b) / 2;
  const hw = Math.max(0, (view.r - view.l) / 2 - inset), hh = Math.max(0, (view.b - view.t) / 2 - inset);
  const dx = q.x - cx, dy = q.y - cy;
  const tx = hw / Math.abs(dx || 1e-9), ty = hh / Math.abs(dy || 1e-9);
  const t = Math.min(tx, ty);
  const at = { x: cx + dx * t, y: cy + dy * t };
  // On the top or bottom edge it moves across, on a side up and down.
  const across = ty <= tx;
  const lo = across ? cx - hw : cy - hh, hi = across ? cx + hw : cy + hh;
  // The tip may point at what is in the way, so the clearance is its reach.
  const k = radius * EDGE_TIP + GAP;
  for (let round = 0; round < 4; round++) {
    let moved = false;
    for (const o of clear) {
      if (at.x <= o.l - k || at.x >= o.r + k || at.y <= o.t - k || at.y >= o.b + k) continue;
      const v = across ? at.x : at.y;
      const before = (across ? o.l : o.t) - k, after = (across ? o.r : o.b) + k;
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
