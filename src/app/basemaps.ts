// The basemap choice (docs/design/surface.md, Controls): a button with the
// layers symbol among the map's buttons, opening the basemaps as pictures of
// the trail's ground in each, their names beneath. A raster basemap's
// picture is one of its tiles; a vector one's is drawn by a map of its own,
// once the trail's map has settled, so it is there when the panel opens.

import { Map as MLMap } from "maplibre-gl";
import type { TrailMap } from "./map.ts";
import type { LngLat, Trail } from "./trail-types.ts";

/** The pictures' scale, as the map's zoom: a quarter of a town, where the basemaps' looks differ most. */
const PICTURE_ZOOM = 13;
/** CSS pixels, square; style.css draws them at this size. */
const PICTURE = 64;
/** A picture that hasn't drawn by then (offline, a slow tile) is tried again at the next opening. */
const PICTURE_WAIT = 15000;

const LAYERS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.5 9 12 14.5 21.5 9z" fill="currentColor"/><path d="M5.2 12.6 2.5 14.2 12 19.7l9.5-5.5-2.7-1.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

export class BasemapChoice {
  private tm: TrailMap;
  private at: LngLat;
  private button = document.createElement("button");
  private panel = document.createElement("div");
  private options: HTMLButtonElement[] = [];
  private pictures: HTMLElement[] = [];
  private open = false;

  constructor(tm: TrailMap, trail: Trail, host: HTMLElement) {
    this.tm = tm;
    // The trail's first station: what the visitor will see first on the ground.
    const [[w, s], [e, n]] = trail.extent;
    this.at = trail.items[1]?.position ?? [(w + e) / 2, (s + n) / 2];

    const wrap = document.createElement("div");
    wrap.className = "basemap-choice";
    this.button.type = "button";
    this.button.className = "tool";
    this.button.setAttribute("aria-label", tm.strings.basemap);
    this.button.title = tm.strings.basemap;
    this.button.setAttribute("aria-expanded", "false");
    this.button.setAttribute("aria-controls", "basemap-panel");
    this.button.innerHTML = LAYERS_ICON;
    this.button.addEventListener("click", () => this.toggle(!this.open));

    this.panel.id = "basemap-panel";
    this.panel.className = "basemap-panel";
    this.panel.hidden = true;
    this.panel.setAttribute("role", "radiogroup");
    this.panel.setAttribute("aria-label", tm.strings.basemap);
    for (let i = 0; i < tm.basemapCount; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      const picture = document.createElement("span");
      picture.className = "basemap-picture";
      const name = document.createElement("span");
      name.textContent = tm.basemapLabel(i);
      b.append(picture, name);
      b.addEventListener("click", () => {
        tm.setBasemap(i);
        this.mark();
      });
      this.options.push(b);
      this.pictures.push(picture);
    }
    this.mark();
    this.panel.append(...this.options);
    wrap.append(this.button, this.panel);
    host.append(wrap);

    // Open, it stays so for comparing, until the visitor turns to something else.
    document.addEventListener("pointerdown", (e) => {
      if (this.open && !wrap.contains(e.target as Node)) this.toggle(false);
    });
    wrap.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !this.open) return;
      this.toggle(false);
      this.button.focus();
    });
    tm.map.once("idle", () => setTimeout(() => void this.draw(), 500));
  }

  /** Closed when the map's buttons slide away under a raised sheet (main.ts). */
  close() {
    if (this.open) this.toggle(false);
  }

  private toggle(open: boolean) {
    this.open = open;
    this.panel.hidden = !open;
    this.button.setAttribute("aria-expanded", String(open));
    if (open) void this.draw();
  }

  private mark() {
    this.options.forEach((b, i) => b.setAttribute("aria-checked", String(i === this.tm.basemapCurrent)));
  }

  private drawing = false;
  /** Each basemap's picture; vector ones one map at a time, as a phone allows few WebGL contexts. A failed one is tried again at the next opening. */
  private async draw() {
    if (this.drawing) return;
    this.drawing = true;
    for (let i = 0; i < this.pictures.length; i++) {
      const el = this.pictures[i];
      if (el.style.backgroundImage) continue;
      const tile = this.tile(i);
      if (tile) Object.assign(el.style, tile);
      else {
        const url = await this.drawn(i);
        if (url) el.style.backgroundImage = `url("${url}")`;
      }
    }
    this.drawing = false;
  }

  /** A raster basemap's tile around `at`, as the picture's background, at the pictures' scale. */
  private tile(i: number): Partial<CSSStyleDeclaration> | undefined {
    const b = this.tm.basemapAt(i);
    if (!b.tiles?.length) return;
    // The map's zoom is a 512-pixel world's; a tile two closer, at half its 256 pixels, is that scale and sharp on a phone's screen.
    const z = Math.min(PICTURE_ZOOM + 2, b.maxzoom ?? 19);
    const size = 512 * 2 ** (PICTURE_ZOOM - z);
    const n = 2 ** z, rad = (this.at[1] * Math.PI) / 180;
    const fx = ((this.at[0] + 180) / 360) * n, fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
    const x = Math.floor(fx), y = Math.floor(fy);
    // `at` in the middle, as far as the tile reaches.
    const off = (f: number) => PICTURE / 2 - Math.min(size - PICTURE / 2, Math.max(PICTURE / 2, f * size));
    const url = b.tiles[0].replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
    return { backgroundImage: `url("${url}")`, backgroundSize: `${size}px`, backgroundPosition: `${off(fx - x)}px ${off(fy - y)}px` };
  }

  private drawn(i: number): Promise<string | undefined> {
    const box = document.createElement("div");
    box.className = "basemap-drawing";
    box.style.width = `${PICTURE}px`;
    box.style.height = `${PICTURE}px`;
    document.body.append(box);
    let map: MLMap | undefined;
    return new Promise<string | undefined>((resolve) => {
      const timer = window.setTimeout(() => resolve(undefined), PICTURE_WAIT);
      try {
        map = new MLMap({
          container: box,
          style: this.tm.basemapStyle(i),
          center: this.at,
          zoom: PICTURE_ZOOM,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
          canvasContextAttributes: { preserveDrawingBuffer: true },
        });
        // A tile that failed leaves a hole: no picture rather than a wrong one.
        map.on("error", () => {
          clearTimeout(timer);
          resolve(undefined);
        });
        map.once("idle", () => {
          clearTimeout(timer);
          resolve(map!.getCanvas().toDataURL("image/jpeg", 0.85));
        });
      } catch {
        clearTimeout(timer);
        resolve(undefined);
      }
    }).finally(() => {
      map?.remove();
      box.remove();
    });
  }
}
