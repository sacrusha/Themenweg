// What sits on the map is painted like the map: on canvas, in the map's
// colours. The map stays light whatever the page does (docs/design/brand.md,
// Dark), and a browser that darkens pages by its own rules repaints CSS but
// leaves canvases alone (docs/design/robustness.md). The page elements that
// carry these canvases give only what a page element gives: a button, its
// label, the focus ring, the touch target. Colours are the tokens on :root,
// so a trail's theme.css sets them as it sets any other.

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

/** A filled circle with a drop shadow; the shadow's offset and blur are in device pixels, so they scale here. */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, shadow?: Shadow) {
  const dpr = devicePixelRatio || 1;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = `rgb(0 0 0 / ${shadow.alpha})`;
    ctx.shadowOffsetY = shadow.y * dpr;
    ctx.shadowBlur = shadow.blur * dpr;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

// --- station markers ---------------------------------------------------------

export type MarkerState = "" | "prev" | "next" | "selected";

/**
 * The markers' look, one entry per state: a disc of `size` with an `edge`, for
 * the selection a ring outside it, the number in the trail's font. Prev and
 * next share their colours with the card's buttons (style.css, --prev, --next).
 */
const MARKER: Record<MarkerState, { size: number; edge: number; ring: number; font: number; fill: string; text: string; edgeColour: string; ringColour: string; shadow: Shadow }> = {
  "": { size: 28, edge: 2.5, ring: 0, font: 13, fill: "--marker", text: "--on-marker", edgeColour: "--accent-dark", ringColour: "", shadow: { y: 1, blur: 3, alpha: 0.3 } },
  prev: { size: 30, edge: 2.5, ring: 0, font: 13, fill: "--prev", text: "--on-prev", edgeColour: "--accent-dark", ringColour: "", shadow: { y: 1, blur: 3, alpha: 0.3 } },
  next: { size: 34, edge: 2.5, ring: 0, font: 15, fill: "--next", text: "--on-next", edgeColour: "--accent-dark", ringColour: "", shadow: { y: 1, blur: 3, alpha: 0.3 } },
  selected: { size: 44, edge: 3, ring: 3, font: 18, fill: "--accent-dark", text: "#ffffff", edgeColour: "#ffffff", ringColour: "--accent-dark", shadow: { y: 3, blur: 10, alpha: 0.35 } },
};

type MarkerLook = (typeof MARKER)[MarkerState];

/** A marker's number centred on x, y; with a halo of the marker's fill `halo` px wide, so it reads as on its marker over anything. */
function number(ctx: CanvasRenderingContext2D, css: CSSStyleDeclaration, look: MarkerLook, x: number, y: number, n: string, halo: number) {
  ctx.font = `800 ${look.font}px ${css.getPropertyValue("--font")}`;
  ctx.textAlign = "center";
  const m = ctx.measureText(n);
  const base = y + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  if (halo) {
    ctx.lineWidth = 2 * halo;
    ctx.lineJoin = "round";
    ctx.strokeStyle = colour(css, look.fill);
    ctx.strokeText(n, x, base);
  }
  ctx.fillStyle = colour(css, look.text);
  ctx.fillText(n, x, base);
}

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
  disc(ctx, c, c, outer, colour(css, look.ring ? look.ringColour : look.edgeColour), look.shadow);
  if (look.ring) disc(ctx, c, c, look.size / 2, colour(css, look.edgeColour));
  disc(ctx, c, c, look.size / 2 - look.edge, colour(css, look.fill));
  number(ctx, css, look, c, c, el.dataset.n ?? "", 0);

  const was = Number(el.dataset.size) || look.size;
  el.dataset.size = String(look.size);
  el.style.setProperty("--size", `${look.size}px`);
  if (was !== look.size && !reduceMotion.matches) {
    canvas.animate([{ transform: `scale(${was / look.size})` }, { transform: "none" }], { duration: 180, easing: "ease-out" });
  }
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

/**
 * The visitor: a dot in a white ring; where they face, a pointer on the
 * ring, which claims a direction and nothing about its error; and where
 * the compass has measured that error, a cone of its width, fading outward.
 */
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

/** How far the visitor's mark reaches from their position: the ring, its shadow, the pointer. */
export const YOU_REACH = 24;
/** How far from the visitor's position a marker can lie and still reach their mark. */
export const NEAR_YOU = YOU_REACH + Math.max(...Object.values(MARKER).map((l) => l.size / 2 + l.ring));

/** A station marker near the visitor: its number and state, and its centre relative to theirs. */
export interface MarkerNear {
  n: string;
  state: MarkerState;
  dx: number;
  dy: number;
}

/**
 * The visitor's mark lies over the markers, so their position shows at a
 * station; the stations' numbers lie over it, so the station still says
 * which it is. Painted on a canvas over the mark, `near` lowest first, as
 * the markers stack: each marker's disc clears what lies under it, and its
 * number comes back on its own fill. The selection's number stays under
 * the dot, which marks the selected station as where the visitor is; the
 * card's head carries that number.
 */
export function paintNumbersOver(canvas: HTMLCanvasElement, near: MarkerNear[]) {
  const css = getComputedStyle(root);
  const ctx = fit(canvas, 2 * YOU_REACH, 2 * YOU_REACH);
  for (const m of near) {
    const look = MARKER[m.state] ?? MARKER[""];
    const x = YOU_REACH + m.dx, y = YOU_REACH + m.dy;
    ctx.globalCompositeOperation = "destination-out";
    disc(ctx, x, y, look.size / 2 + look.ring, "#000");
    ctx.globalCompositeOperation = "source-over";
    if (m.state !== "selected") number(ctx, css, look, x, y, m.n, 1);
  }
}

// --- marks at the map's edge (edge.ts) ----------------------------------------

/**
 * A mark's size: a button docked at the map's frame, like the map's other
 * buttons, so it reads as "that way" and not as something standing on the
 * map where the mark is.
 */
export interface EdgeSize {
  w: number;
  h: number;
}
export const EDGE_SELECTION: EdgeSize = { w: 62, h: 36 };
export const EDGE_YOU: EdgeSize = { w: 50, h: 30 };

/**
 * A white pill with an arrow toward the thing (deg, clockwise from up) at
 * one end, on the side given; returns the middle of the other end, for the
 * thing itself. The arrow is ink, apart from the thing, so the visitor's
 * mark doesn't read as the pointer that shows which way they face.
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
  disc(ctx, x, y, 13, colour(css, "--accent-dark"));
  ctx.fillStyle = ctx.strokeStyle = "#ffffff";
  if (n) {
    ctx.font = `800 ${n > 9 ? 12 : 14}px ${css.getPropertyValue("--font")}`;
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
