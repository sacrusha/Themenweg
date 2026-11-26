// The sources of a trail's data and their credits (docs/design/trail-content.md,
// Sources). Data names its source by a key where it enters the trail; the
// site credits the sources named, so a credit comes and goes with the data.

import type { Credit, CreditUse, Localized } from "../app/trail-types.ts";

interface Source {
  credit: Localized;
  url?: string;
}

/** The sources the engine's own tools draw on: build/route-trail.py routes over OSM's paths and takes heights from swisstopo. */
const ENGINE_SOURCES: Record<string, Source> = {
  osm: {
    credit: { de: "© OpenStreetMap-Mitwirkende", en: "© OpenStreetMap contributors", fr: "© les contributeurs d'OpenStreetMap" },
    url: "https://www.openstreetmap.org/copyright",
  },
  swisstopo: { credit: { en: "© swisstopo" }, url: "https://www.swisstopo.admin.ch/" },
};

/** The order credits are listed in, by what of the site is theirs. */
const ORDER: CreditUse[] = ["route", "objects", "arrivals", "heights", "basemap"];

/** Where a piece of the trail's data names its source, and what of the site it is. */
export interface SourceRef {
  key: string;
  use: CreditUse;
  where: string;
}

/**
 * The credits of the sources the trail's data names, by what of the site
 * is theirs (ORDER). `declared` is trail.json's `sources`, which adds to the engine's and
 * may reword one. A key that is neither is an error; `unused` are the keys
 * trail.json declares that no data names, which the site credits nowhere.
 */
export function creditsFor(
  declared: unknown,
  refs: SourceRef[],
  languages: string[],
  loc: (v: unknown, where: string, required: boolean) => Localized,
  fail: (where: string, msg: string) => void,
  warn: (msg: string) => void,
): { credits: Credit[]; unused: string[] } {
  const own: Record<string, Source> = {};
  if (declared !== undefined && (!declared || typeof declared !== "object" || Array.isArray(declared))) {
    fail("trail.json sources", `expected { "<key>": { "credit": …, "url": "…" } }`);
  } else {
    for (const [key, d] of Object.entries((declared ?? {}) as Record<string, any>)) {
      const where = `trail.json sources.${key}`;
      for (const k of Object.keys(d ?? {})) if (k !== "credit" && k !== "url") warn(`${where}: unknown field "${k}", ignored`);
      const credit = typeof d?.credit === "string" ? { [languages[0]]: d.credit } : loc(d?.credit, `${where}.credit`, true);
      if (d?.url !== undefined && typeof d.url !== "string") fail(`${where}.url`, "expected a URL");
      own[key] = { credit, ...(typeof d?.url === "string" ? { url: d.url } : {}) };
    }
  }
  const sources = { ...ENGINE_SOURCES, ...own };
  const credits = new Map<string, Credit>();
  for (const r of refs) {
    const s = sources[r.key];
    if (!s) {
      fail(r.where, `source "${r.key}" is neither the engine's (${Object.keys(ENGINE_SOURCES).join(", ")}) nor declared in trail.json sources`);
      continue;
    }
    const c = credits.get(r.key) ?? { key: r.key, credit: inLanguages(s.credit, languages), ...(s.url ? { url: s.url } : {}), uses: [] };
    if (!c.uses.includes(r.use)) c.uses.push(r.use);
    credits.set(r.key, c);
  }
  const rank = (u: CreditUse) => ORDER.indexOf(u);
  for (const c of credits.values()) c.uses.sort((a, b) => rank(a) - rank(b));
  const ordered = [...credits.values()].sort((a, b) => rank(a.uses[0]) - rank(b.uses[0]));
  return { credits: ordered, unused: Object.keys(own).filter((k) => !credits.has(k)) };
}

/** A credit in each of the trail's languages: its wording in that language, else in the trail's source language, else English, else any. */
function inLanguages(t: Localized, languages: string[]): Localized {
  const fallback = t[languages[0]] ?? t.en ?? Object.values(t)[0] ?? "";
  return Object.fromEntries(languages.map((l) => [l, t[l] ?? fallback]));
}
