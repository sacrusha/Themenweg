// The trail's sources as the site credits them (docs/design/trail-content.md,
// Sources): on the map, the sources of what it draws; on the overview, every
// source of the trail's data and what of the site is its.

import type { Credit, CreditUse, Trail } from "./trail-types.ts";
import type { Strings } from "./strings.ts";
import { attr, esc } from "./html.ts";

export function creditHtml(c: Credit, lang: string): string {
  const text = esc(c.credit[lang] ?? Object.values(c.credit)[0] ?? "");
  return c.url ? `<a href="${attr(c.url)}" target="_blank" rel="noopener">${text}</a>` : text;
}

/** The map's attribution for what it draws of `uses`, each source once, leaving out the source whose basemap is on: that one credits itself. */
export function mapAttribution(trail: Trail, uses: CreditUse[], lang: string, basemapSource?: string): string | undefined {
  const html = trail.credits.filter((c) => c.uses.some((u) => uses.includes(u)) && c.key !== basemapSource).map((c) => creditHtml(c, lang));
  return html.length ? html.join(" | ") : undefined;
}

const USE = { route: "useRoute", heights: "useHeights", objects: "useObjects", arrivals: "useArrivals" } as const satisfies Record<Exclude<CreditUse, "basemap">, keyof Strings>;

/** The overview's line: "Data: A (route, the stations' objects); B (heights for the walking times)". Basemaps are credited on the map, while they show. */
export function dataCredits(trail: Trail, lang: string, s: Strings): string {
  const named = trail.credits
    .map((c) => ({ c, uses: c.uses.filter((u): u is keyof typeof USE => u !== "basemap") }))
    .filter(({ uses }) => uses.length)
    .map(({ c, uses }) => `${creditHtml(c, lang)} (${uses.map((u) => s[USE[u]]).join(", ")})`);
  return named.length ? `<p class="data-credits">${s.data}${s.colon}${named.join(s.semicolon)}</p>` : "";
}
