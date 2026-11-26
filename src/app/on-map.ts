// What sits on the map, painted on canvas as the map is (docs/design/dark.md),
// from the colour tokens on :root, so a trail's theme.css sets them as
// it sets any other. The page elements carrying the canvases give only the
// button: its label, the focus ring, the touch target.

import type { ArrivalKind } from "./trail-types.ts";

const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

/** A token's value (a name starting with --) or a literal colour. */
function colour(css: CSSStyleDeclaration, c: string): string {
  return c.startsWith("--") ? css.getPropertyValue(c).trim() : c;
}

/**
 * Sizes a canvas for a box of w×h CSS pixels at the screen's density,
 * centred on its element, and returns its context in CSS pixels.
 */
function fit(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  Object.assign(canvas.style, { width: `${w}px`, height: `${h}px`, left: `calc(50% - ${w / 2}px)`, top: `calc(50% - ${h / 2}px)` });
  const ctx = canvas.getContext("2d")!; // the map runs on WebGL2, so a 2D context is there
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

interface Shadow {
  y: number;
  blur: number;
  alpha: number;
}

/** How round a trail's look has the stations' marks (style.css, --marker-round): 1 a disc, 0 a square. */
function roundness(css: CSSStyleDeclaration): number {
  const v = parseFloat(css.getPropertyValue("--marker-round"));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/**
 * A filled circle with a drop shadow; the shadow's offset and blur are in device pixels, so they scale here.
 * With `round` below 1 it is a square of the same width, its corners that share of a circle's.
 */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, shadow?: Shadow, round = 1) {
  const dpr = devicePixelRatio || 1;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = `rgb(0 0 0 / ${shadow.alpha})`;
    ctx.shadowOffsetY = shadow.y * dpr;
    ctx.shadowBlur = shadow.blur * dpr;
  }
  ctx.beginPath();
  if (round >= 1) ctx.arc(x, y, r, 0, 2 * Math.PI);
  else {
    // arcTo, since roundRect is missing on iOS 15.
    const k = r * round;
    ctx.moveTo(x - r + k, y - r);
    ctx.arcTo(x + r, y - r, x + r, y + r, k);
    ctx.arcTo(x + r, y + r, x - r, y + r, k);
    ctx.arcTo(x - r, y + r, x - r, y - r, k);
    ctx.arcTo(x - r, y - r, x + r, y - r, k);
    ctx.closePath();
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

// --- station markers ---------------------------------------------------------

export type MarkerState = "" | "prev" | "next" | "selected";

/**
 * The markers' look, one entry per state: a disc of `size` with an `edge`, for
 * the selection a ring outside it, the number in the trail's heading face, as the disc before a card's title has it. Prev and
 * next share their colours with the card's buttons (style.css, --prev, --next).
 */
const MARKER: Record<MarkerState, { size: number; edge: number; ring: number; font: number; fill: string; text: string; edgeColour: string; ringColour: string; shadow: Shadow }> = {
  "": { size: 28, edge: 2.5, ring: 0, font: 13, fill: "--marker", text: "--on-marker", edgeColour: "--marker-edge", ringColour: "", shadow: { y: 1, blur: 3, alpha: 0.3 } },
  prev: { size: 30, edge: 2.5, ring: 0, font: 13, fill: "--prev", text: "--on-prev", edgeColour: "--marker-edge", ringColour: "", shadow: { y: 1, blur: 3, alpha: 0.3 } },
  next: { size: 34, edge: 2.5, ring: 0, font: 15, fill: "--next", text: "--on-next", edgeColour: "--marker-edge", ringColour: "", shadow: { y: 1, blur: 3, alpha: 0.3 } },
  selected: { size: 44, edge: 3, ring: 3, font: 18, fill: "--accent-dark", text: "#ffffff", edgeColour: "#ffffff", ringColour: "--accent-dark", shadow: { y: 3, blur: 10, alpha: 0.35 } },
};

/** A station marker: a button whose look is a canvas. */
export function markerElement(n: number, label: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "marker";
  el.dataset.n = String(n);
  el.setAttribute("aria-label", label);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  el.append(canvas);
  return el;
}

/** Paints a marker in its state (data-state); a change of size grows or shrinks it briefly. */
export function paintMarker(el: HTMLElement) {
  const state = (el.dataset.state ?? "") as MarkerState;
  const look = MARKER[state] ?? MARKER[""];
  const canvas = el.querySelector("canvas")!;
  const css = getComputedStyle(root);
  const outer = look.size / 2 + look.ring;
  const pad = look.ring + look.shadow.blur + look.shadow.y + 1;
  const box = look.size + 2 * pad;
  const c = box / 2;
  const ctx = fit(canvas, box, box);
  const round = roundness(css);
  disc(ctx, c, c, outer, colour(css, look.ring ? look.ringColour : look.edgeColour), look.shadow, round);
  if (look.ring) disc(ctx, c, c, look.size / 2, colour(css, look.edgeColour), undefined, round);
  disc(ctx, c, c, look.size / 2 - look.edge, colour(css, look.fill), undefined, round);
  const n = el.dataset.n ?? "";
  if (n === "0") waymark(ctx, c, look.font * 1.25, colour(css, look.text));
  else {
    ctx.font = `800 ${look.font}px ${css.getPropertyValue("--font-heading")}`;
    ctx.fillStyle = colour(css, look.text);
    ctx.textAlign = "center";
    const m = ctx.measureText(n);
    ctx.fillText(n, c, c + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  }

  const was = Number(el.dataset.size) || look.size;
  el.dataset.size = String(look.size);
  el.style.setProperty("--size", `${look.size}px`);
  if (was !== look.size && !reduceMotion.matches) {
    canvas.animate([{ transform: `scale(${was / look.size})` }, { transform: "none" }], { duration: 180, easing: "ease-out" });
  }
}

/** The waymark (card.ts trailGlyph), `size` wide, centred on c, c: the marker of the trail's start, which is item 0's. */
function waymark(ctx: CanvasRenderingContext2D, c: number, size: number, ink: string) {
  ctx.save();
  ctx.translate(c - size / 2, c - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = ctx.fillStyle = ink;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.setLineDash([3, 3.2]);
  ctx.stroke(new Path2D("M4 19c3-1 4-5 8-6s5-5 8-8"));
  for (const [x, y] of [[4, 19], [12, 13], [20, 5]]) {
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

// --- arrival points ------------------------------------------------------------

/**
 * An arrival point's mark (docs/design/surface.md, Arrival points): a
 * pictogram on a rounded square, a sign's shape where the stations are
 * discs, smaller than they are and in one neutral colour, so it reads as
 * the way there and not as a station.
 */
const ARRIVAL = { size: 22, radius: 5, edge: 1.5 };

/** An arrival point: a button whose look is a canvas. */
export function arrivalElement(kind: ArrivalKind, label: string): HTMLButtonElement {
  const el = markerElement(0, label);
  el.className = "marker arrival";
  delete el.dataset.n;
  el.dataset.kind = kind;
  return el;
}

export function paintArrival(el: HTMLElement) {
  const css = getComputedStyle(root);
  const { size, radius, edge } = ARRIVAL;
  const pad = 4;
  const box = size + 2 * pad;
  const ctx = fit(el.querySelector("canvas")!, box, box);
  const dpr = devicePixelRatio || 1;
  const square = (inset: number) => {
    rounded(ctx, pad + inset, pad + inset, size - 2 * inset, size - 2 * inset, radius - inset);
  };
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 0.3)";
  ctx.shadowOffsetY = dpr;
  ctx.shadowBlur = 3 * dpr;
  square(0);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  square(edge);
  ctx.fillStyle = colour(css, "--arrival");
  ctx.fill();
  const k = (size - 2 * edge) / 24;
  ctx.save();
  ctx.translate(pad + edge, pad + edge);
  ctx.scale(k, k);
  pictogram(ctx, el.dataset.kind as ArrivalKind, colour(css, "--on-arrival"), colour(css, "--arrival"), css.getPropertyValue("--font"));
  ctx.restore();
  el.style.setProperty("--size", `${size}px`);
}

/** A rounded rectangle's path (the canvas's own roundRect needs Safari 16; the floor is iOS 15). */
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A kind's pictogram in a 24-unit box, in `ink` on `ground`. */
function pictogram(ctx: CanvasRenderingContext2D, kind: ArrivalKind, ink: string, ground: string, font: string) {
  ctx.fillStyle = ctx.strokeStyle = ink;
  ctx.lineCap = ctx.lineJoin = "round";
  const rect = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    rounded(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  const lights = (y: number) => {
    for (const x of [8.5, 15.5]) {
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, 2 * Math.PI);
      ctx.fillStyle = ground;
      ctx.fill();
    }
  };
  if (kind === "train") {
    rect(6, 3.5, 12, 14, 3.5, ink);
    rect(7.8, 5.5, 8.4, 5, 1, ground);
    lights(14);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(8.5, 18.5);
    ctx.lineTo(6.5, 21);
    ctx.moveTo(15.5, 18.5);
    ctx.lineTo(17.5, 21);
    ctx.stroke();
  } else if (kind === "bus") {
    rect(5.5, 3.5, 13, 15, 2.5, ink);
    rect(7.3, 5.5, 9.4, 6, 1, ground);
    lights(15);
    rect(7, 18, 3, 3, 1, ink);
    rect(14, 18, 3, 3, 1, ink);
  } else if (kind === "lift") {
    ctx.lineWidth = 1.8;
    ctx.strokeRect(6, 3.5, 12, 17);
    for (const [tip, base] of [[6.5, 10.5], [17.5, 13.5]]) {
      ctx.beginPath();
      ctx.moveTo(12, tip);
      ctx.lineTo(15, base);
      ctx.lineTo(9, base);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.font = `800 17px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const m = ctx.measureText("P");
    ctx.fillText("P", 12, 12 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  }
}

// --- the selection's object --------------------------------------------------

/** The name of the selection's object, on the map beside its shape: no button, the station's marker is what is tapped. */
export function nameElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "object-name";
  el.setAttribute("aria-hidden", "true");
  el.append(document.createElement("canvas"));
  return el;
}

/**
 * The name, in the selection's colour on a white halo, so it reads on map
 * and aerial alike; wrapped where it is long. A thing that is gone has what
 * became of it below, lighter.
 */
export function paintName(el: HTMLElement, name: string, gone?: string) {
  const css = getComputedStyle(root);
  const canvas = el.querySelector("canvas")!;
  const family = css.getPropertyValue("--font");
  const fonts = { name: `700 13px ${family}`, gone: `italic 500 12px ${family}` };
  const MAX = 150, LINE = 16, HALO = 3;
  const measure = canvas.getContext("2d")!;
  const lines: { text: string; font: string }[] = [];
  const wrap = (text: string, font: string) => {
    measure.font = font;
    let line = "";
    for (const word of text.split(/\s+/)) {
      if (line && measure.measureText(`${line} ${word}`).width > MAX) {
        lines.push({ text: line, font });
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push({ text: line, font });
  };
  wrap(name, fonts.name);
  if (gone) wrap(gone, fonts.gone);
  const w = Math.ceil(Math.max(...lines.map((l) => ((measure.font = l.font), measure.measureText(l.text).width)))) + 2 * HALO + 2;
  const h = lines.length * LINE + 2 * HALO;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  const ctx = fit(canvas, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2 * HALO;
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = colour(css, "--accent-dark");
  lines.forEach((l, i) => {
    const y = HALO + LINE * (i + 0.5);
    ctx.font = l.font;
    ctx.strokeText(l.text, w / 2, y);
    ctx.fillText(l.text, w / 2, y);
  });
}

// --- the visitor -------------------------------------------------------------

export interface YouLook {
  /** The fix is older than the site trusts: grey, where they were. */
  stale: boolean;
  /** The fix is coarse: the dot fainter. */
  coarse: boolean;
  /** Where the facing comes from, if known: the compass, or the course while walking (fainter). */
  heading: "" | "compass" | "course";
  /** Half the cone's angle in degrees, where the compass has measured its error; 0 for no cone. */
  cone: number;
}

/** The box the visitor is painted in; MapLibre turns it to the heading, so the pointer and the cone point ahead. */
const YOU_BOX = 140;

/** The visitor's dot, pointer and cone (docs/design/surface.md, Walking help). */
export function paintYou(canvas: HTMLCanvasElement, look: YouLook) {
  const css = getComputedStyle(root);
  const ctx = fit(canvas, YOU_BOX, YOU_BOX);
  const c = YOU_BOX / 2;
  const fill = colour(css, look.stale ? "--you-stale" : "--you");
  const facing = look.heading === "course" ? 0.7 : 1;
  if (look.heading && look.cone > 0) {
    const a = (look.cone * Math.PI) / 180;
    ctx.save();
    ctx.globalAlpha = facing;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, c, -Math.PI / 2 - a, -Math.PI / 2 + a);
    ctx.closePath();
    ctx.fillStyle = colour(css, "--you-cone");
    ctx.fill();
    // The fade: keep the cone where the gradient is, in proportion to its alpha.
    ctx.globalCompositeOperation = "destination-in";
    ctx.globalAlpha = 1;
    const mask = ctx.createRadialGradient(c, c, 0, c, c, c);
    mask.addColorStop(0.12, "#000");
    mask.addColorStop(1, "transparent");
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, YOU_BOX, YOU_BOX);
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = look.coarse ? 0.6 : 1;
  if (look.heading) {
    const dpr = devicePixelRatio || 1;
    ctx.save();
    ctx.globalAlpha *= facing;
    ctx.beginPath();
    ctx.moveTo(c, c - 21);
    ctx.lineTo(c + 7.5, c - 8);
    ctx.lineTo(c - 7.5, c - 8);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.shadowColor = "rgb(0 0 0 / 0.4)";
    ctx.shadowOffsetY = dpr;
    ctx.shadowBlur = 4 * dpr;
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }
  disc(ctx, c, c, 10, "#ffffff", { y: 1, blur: 4, alpha: 0.4 });
  disc(ctx, c, c, 7, fill);
  ctx.restore();
}

/** Half the box of the pulse. */
const PULSE = 44;

/** The pulse that answers a tap on the locate button: a ring, which walking.ts grows and fades. */
export function paintPulse(canvas: HTMLCanvasElement) {
  const ctx = fit(canvas, 2 * PULSE, 2 * PULSE);
  ctx.beginPath();
  ctx.arc(PULSE, PULSE, PULSE - 3, 0, 2 * Math.PI);
  ctx.lineWidth = 4;
  ctx.strokeStyle = colour(getComputedStyle(root), "--you");
  ctx.stroke();
}

// --- marks at the map's edge (edge.ts) ----------------------------------------

/** An edge mark's size (docs/design/surface.md, Off screen). */
export interface EdgeSize {
  w: number;
  h: number;
}
export const EDGE_SELECTION: EdgeSize = { w: 62, h: 36 };
export const EDGE_YOU: EdgeSize = { w: 50, h: 30 };

/**
 * A white pill with an arrow toward the thing (deg, clockwise from up) at
 * one end, on the side given; returns the middle of the other end, for the
 * thing itself.
 */
function pill(canvas: HTMLCanvasElement, size: EdgeSize, deg: number, arrowLeft: boolean): { ctx: CanvasRenderingContext2D; x: number; y: number } {
  const pad = 8;
  const { w, h } = size;
  const ctx = fit(canvas, w + 2 * pad, h + 2 * pad);
  const r = h / 2, y = pad + r;
  const dpr = devicePixelRatio || 1;
  ctx.save();
  ctx.shadowColor = "rgb(0 0 0 / 0.3)";
  ctx.shadowOffsetY = dpr;
  ctx.shadowBlur = 6 * dpr;
  ctx.beginPath();
  ctx.arc(pad + r, y, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.arc(pad + w - r, y, r, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  const ax = arrowLeft ? pad + r : pad + w - r;
  const len = h / 6;
  ctx.save();
  ctx.translate(ax, y);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, len);
  ctx.lineTo(0, -len);
  ctx.moveTo(-len * 0.75, -len * 0.25);
  ctx.lineTo(0, -len);
  ctx.lineTo(len * 0.75, -len * 0.25);
  ctx.lineWidth = 2.4;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.strokeStyle = colour(getComputedStyle(root), "--on-marker");
  ctx.stroke();
  ctx.restore();
  return { ctx, x: arrowLeft ? pad + w - r : pad + r, y };
}

/** The waymark of the card's overview button (card.ts), in its 24-unit box. */
const WAYMARK = "M4 19c3-1 4-5 8-6s5-5 8-8";

/** The selection out of view: the station's number on the selection's colour, or for the overview the waymark. */
export function paintEdgeSelection(canvas: HTMLCanvasElement, n: number, deg: number, arrowLeft: boolean) {
  const css = getComputedStyle(root);
  const { ctx, x, y } = pill(canvas, EDGE_SELECTION, deg, arrowLeft);
  disc(ctx, x, y, 13, colour(css, "--accent-dark"), undefined, roundness(css));
  ctx.fillStyle = ctx.strokeStyle = "#ffffff";
  if (n) {
    ctx.font = `800 ${n > 9 ? 12 : 14}px ${css.getPropertyValue("--font-heading")}`;
    ctx.textAlign = "center";
    const m = ctx.measureText(String(n));
    ctx.fillText(String(n), x, y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    return;
  }
  const k = 0.65;
  ctx.save();
  ctx.translate(x - 12 * k, y - 12 * k);
  ctx.scale(k, k);
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.setLineDash([3, 3.2]);
  ctx.stroke(new Path2D(WAYMARK));
  for (const [px, py] of [[4, 19], [12, 13], [20, 5]]) disc(ctx, px, py, 2.2, "#ffffff");
  ctx.restore();
}

/** The visitor out of view: their dot, grey as on the map once the fix is stale. */
export function paintEdgeYou(canvas: HTMLCanvasElement, stale: boolean, deg: number, arrowLeft: boolean) {
  const { ctx, x, y } = pill(canvas, EDGE_YOU, deg, arrowLeft);
  disc(ctx, x, y, 7, colour(getComputedStyle(root), stale ? "--you-stale" : "--you"));
}

/** Calls paint again whenever what it painted may be off: fonts arriving, a new pixel density, the scheme turning. */
export function repaintOnChange(paint: () => void) {
  document.fonts?.ready.then(paint);
  document.fonts?.addEventListener("loadingdone", paint);
  addEventListener("resize", paint);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
}
