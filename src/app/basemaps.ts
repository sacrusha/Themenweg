// The basemap choice (docs/design/surface.md, Controls): a button with the
// layers symbol among the map's buttons, opening the basemaps as pictures of
// the trail's ground in each, their names beneath.

import { Map as MLMap } from "maplibre-gl";
import type { TrailMap } from "./map.ts";
import type { LngLat, Trail } from "./trail-types.ts";

/** The pictures' scale: streets and their surroundings, where the basemaps' looks differ most. */
const PICTURE_ZOOM = 14;
/** CSS pixels; style.css draws them at this size. */
const PICTURE_W = 64, PICTURE_H = 64;
/** A picture that hasn't drawn by then (offline, a slow tile) is tried again at the next opening. */
const PICTURE_WAIT = 15000;

const LAYERS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.5 9 12 14.5 21.5 9z" fill="currentColor"/><path d="M5.2 12.6 2.5 14.2 12 19.7l9.5-5.5-2.7-1.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

export class BasemapChoice {
  private tm: TrailMap;
  private at: LngLat;
  private button = document.createElement("button");
  private panel = document.createElement("div");
  private options: HTMLButtonElement[] = [];
  private pictures: HTMLImageElement[] = [];
  private drawing = false;
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
      const img = document.createElement("img");
      img.alt = "";
      img.width = PICTURE_W;
      img.height = PICTURE_H;
      const name = document.createElement("span");
      name.textContent = tm.basemapLabel(i);
      b.append(img, name);
      b.addEventListener("click", () => {
        tm.setBasemap(i);
        this.mark();
      });
      this.options.push(b);
      this.pictures.push(img);
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

  /** Each basemap's picture, one map at a time: a phone allows few WebGL contexts. */
  private async draw() {
    if (this.drawing) return;
    this.drawing = true;
    for (let i = 0; i < this.pictures.length; i++) {
      if (this.pictures[i].src) continue;
      const url = await this.picture(i);
      if (url) this.pictures[i].src = url;
    }
    this.drawing = false;
  }

  private picture(i: number): Promise<string | undefined> {
    const box = document.createElement("div");
    box.className = "basemap-drawing";
    box.style.width = `${PICTURE_W}px`;
    box.style.height = `${PICTURE_H}px`;
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
