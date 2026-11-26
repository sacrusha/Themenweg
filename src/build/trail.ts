// Reads a trail folder (docs/design/trail-content.md) into the Trail the
// browser receives. Runs in Node at build and dev time; never in the browser.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { imageSize } from "image-size";
import { marked } from "marked";
import type { Arrival, ArrivalKind, Basemap, Endpoint, Item, LngLat, Localized, Logo, Recording, StationObject, Trail } from "../app/trail-types.ts";
import { flatPositions, routeLines, toLocal } from "../app/geo.ts";
import { computeLegs, type LegReport } from "./legs.ts";
import { creditsFor, type SourceRef } from "./sources.ts";

/** An image as read from the folder: `file` is an absolute path, made a URL by the bundler. */
export type SourceImage = Omit<Trail["items"][number]["images"][number], "url"> & { file: string };
export type SourceAudio = { file: string; synthetic: boolean; stale: boolean; /** Spoken from reading.<lang>.md, not the text. */ reading: boolean };
/** A recording as read from the folder: `file` (an absolute path, made a URL by the bundler) or `url` (played from where it is). */
export type SourceRecording = Omit<Recording, "url"> & ({ file: string; url?: undefined } | { url: string; file?: undefined });
export type SourceItem = Omit<Item, "images" | "audio" | "recordings"> & { images: SourceImage[]; audio: Record<string, SourceAudio>; recordings: SourceRecording[]; dir: string };
export type SourceLogo = Omit<Logo, "url"> & { file: string };
export type SourceTrail = Omit<Trail, "items" | "cover" | "footer"> & {
  items: SourceItem[];
  cover?: SourceImage;
  footer: { logos: SourceLogo[]; text: Localized };
  /** theme.css in the trail folder, if there is one: the trail's own look, loaded after the engine's. */
  stylesheet?: string;
  dir: string;
  report: LegReport;
  /** What the folder has that the format doesn't know, likely typos: printed by `npm run check`, not fatal. */
  warnings: string[];
  /** Sources trail.json declares that no data names: credited nowhere, printed by `npm run check`. */
  unusedSources: string[];
  /** What could name a source and names none, so the site credits nothing for it: printed by `npm run check`. */
  unsourced: string[];
};

export class TrailError extends Error {}

// A number keeps its unit or per cent sign on its line ("13 %", "8 ha"), as typesetting does: a phone's narrow column broke between them.
marked.use({ hooks: { preprocess: (md) => md.replace(/(\d) (?=(?:%|‰|ha|km|m|min)(?![\p{L}\d]))/gu, "$1\u00a0") } });

/** The kinds of arrival point the map has a mark for (on-map.ts). */
const ARRIVAL_KINDS: ArrivalKind[] = ["train", "bus", "lift", "parking"];

/** The fields the format knows, per kind of object (docs/design/trail-content.md). */
const KNOWN = {
  trail: ["languages", "machineTranslated", "title", "shortTitle", "subtitle", "publisher", "duration", "length", "gettingThere", "start", "end", "arrivals", "links", "stationFields", "images", "theme", "signLabel", "brandName", "cover", "footer", "map", "audio", "recordings", "sources"],
  map: ["basemaps", "margin"],
  endpoint: ["name", "position"],
  arrival: ["kind", "name", "position", "note", "link", "source"],
  theme: ["accent", "accentDark"],
  footer: ["logos", "text"],
  audio: ["voices", "rate", "say", "captions"],
  station: ["title", "shortTitle", "position", "fields", "images", "recordings", "object"],
  recording: ["title", "file", "url", "lang"],
  object: ["name", "geometry", "gone", "source"],
  stationField: ["key", "label"],
  link: ["label", "url"],
  basemap: ["label", "style", "tiles", "tileSize", "maxzoom", "attribution", "source"],
  image: ["file", "caption", "alt", "credit", "license", "page"],
  logo: ["file", "alt", "url"],
};

interface Checks {
  loc: (v: unknown, where: string, required: boolean) => Localized;
  fail: (where: string, msg: string) => void;
  unknown: (o: unknown, kind: keyof typeof KNOWN, where: string) => void;
}

/**
 * Which trail to build: THEMENWEG_TRAIL (a folder name under trails/ or
 * demo/, or a path, relative to the repository), else the only folder under
 * trails/, else the demo's (docs/design/trail-content.md, Building and checking).
 */
export function resolveTrailDir(repoRoot: string, env = process.env.THEMENWEG_TRAIL): string {
  const trailsDir = join(repoRoot, "trails");
  const demoDir = join(repoRoot, "demo");
  if (env) {
    const named = [join(trailsDir, env), join(demoDir, env)].find((d) => existsSync(d));
    const dir = named ?? resolve(repoRoot, env);
    if (!existsSync(join(dir, "trail.json"))) throw new TrailError(`THEMENWEG_TRAIL=${env}: no trail.json in ${dir}`);
    return dir;
  }
  const trailsIn = (d: string) => (existsSync(d) ? readdirSync(d).filter((t) => existsSync(join(d, t, "trail.json"))) : []);
  const found = trailsIn(trailsDir);
  if (found.length === 1) return join(trailsDir, found[0]);
  if (found.length > 1) throw new TrailError(`Several trails in ${trailsDir} (${found.join(", ")}): set THEMENWEG_TRAIL to one of them.`);
  const demo = trailsIn(demoDir);
  if (demo.length === 1) return join(demoDir, demo[0]);
  throw new TrailError(`No trail: ${trailsDir} has no folder with a trail.json.`);
}

/** The station folders in walking order: station n is the n-th (docs/design/trail-content.md, Order and numbers). */
export function stationFolders(dir: string): string[] {
  const stationsDir = join(dir, "stations");
  if (!existsSync(stationsDir)) return [];
  return readdirSync(stationsDir)
    .filter((d) => statSync(join(stationsDir, d)).isDirectory())
    .sort()
    .map((d) => join(stationsDir, d));
}

export function loadTrail(dir: string): SourceTrail {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
  const unknown: Checks["unknown"] = (o, kind, where) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return;
    for (const k of Object.keys(o)) if (!KNOWN[kind].includes(k)) warnings.push(`${where}: unknown field "${k}", ignored`);
  };

  const trailFile = join(dir, "trail.json");
  const raw = readJson(trailFile);
  unknown(raw, "trail", "trail.json");
  unknown(raw.map, "map", "trail.json map");
  unknown(raw.theme, "theme", "trail.json theme");
  unknown(raw.footer, "footer", "trail.json footer");
  unknown(raw.audio, "audio", "trail.json audio");
  const languages: string[] = Array.isArray(raw.languages) && raw.languages.length ? raw.languages : [];
  if (!languages.length) fail("trail.json", `"languages" must list at least one language code, the first being the source language.`);
  const lang0 = languages[0] ?? "";
  const machineTranslated: string[] = Array.isArray(raw.machineTranslated) ? raw.machineTranslated : [];
  for (const l of machineTranslated) {
    if (!languages.includes(l)) fail("trail.json machineTranslated", `"${l}" is not in "languages"`);
    else if (l === lang0) fail("trail.json machineTranslated", `"${l}" is the source language, which is not a translation`);
  }

  const loc = (v: unknown, where: string, required: boolean): Localized => {
    if (v === undefined || v === null) {
      if (required) fail(where, `missing (expected { "${lang0}": "…" })`);
      return {};
    }
    if (typeof v !== "object" || Array.isArray(v)) {
      fail(where, `expected an object of texts per language, like { "${lang0}": "…" }`);
      return {};
    }
    const out: Localized = {};
    for (const [k, s] of Object.entries(v as Record<string, unknown>)) {
      if (typeof s !== "string") fail(`${where}.${k}`, "expected a string");
      else out[k] = s;
    }
    if (required && !out[lang0]) fail(where, `has no text in the source language "${lang0}"`);
    return out;
  };
  const checks: Checks = { loc, fail, unknown };

  const stationFields = (Array.isArray(raw.stationFields) ? raw.stationFields : []).map((f: any, i: number) => {
    unknown(f, "stationField", `trail.json stationFields[${i}]`);
    if (typeof f?.key !== "string") fail(`trail.json stationFields[${i}]`, `needs a "key"`);
    return { key: String(f?.key), label: loc(f?.label, `trail.json stationFields[${i}].label`, true) };
  });
  const fieldKeys = new Set(stationFields.map((f: { key: string }) => f.key));

  // Where the trail's data names its source (docs/design/trail-content.md, Sources).
  const refs: SourceRef[] = [];
  const unsourced: string[] = [];
  const sourceOf = (v: unknown, use: SourceRef["use"], where: string) => {
    if (v === undefined) return;
    if (typeof v === "string" && v) refs.push({ key: v, use, where });
    else fail(where, `expected a source's key, like "osm"`);
  };

  const basemaps: Basemap[] = (raw.map?.basemaps ?? []).map((b: any, i: number) => {
    const where = `trail.json map.basemaps[${i}]`;
    unknown(b, "basemap", where);
    if (!b?.style && !Array.isArray(b?.tiles)) fail(where, `needs "style" (a style URL) or "tiles" (raster tile URLs)`);
    if (b?.tiles && !b?.attribution && !b?.source) fail(where, `raster tiles need an "attribution" or a "source"`);
    sourceOf(b?.source, "basemap", `${where}.source`);
    return { ...b, label: loc(b?.label, `${where}.label`, true) };
  });

  const manifest = readManifest(dir);
  const title0 = loc(raw.title, "trail.json title", true);
  const theme: Trail["theme"] = {};
  for (const k of ["accent", "accentDark"] as const) {
    const v = raw.theme?.[k];
    if (v === undefined) continue;
    if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) fail(`trail.json theme.${k}`, `expected a colour as "#rrggbb"`);
    else theme[k] = v;
  }
  const signLabel = mapTexts(loc(raw.signLabel, "trail.json signLabel", false), (t) => marked.parseInline(t, { async: false }) as string);
  for (const [k, t] of Object.entries(signLabel)) if (!t.includes("{n}")) fail(`trail.json signLabel.${k}`, `needs "{n}" where the station's number goes`);
  const cover = raw.cover === undefined ? undefined : readImages(dir, [raw.cover], "trail.json cover", checks)[0];
  const footer = {
    logos: readLogos(dir, raw.footer?.logos, "trail.json footer.logos", checks),
    text: mapTexts(loc(raw.footer?.text, "trail.json footer.text", false), (t) => marked.parse(t, { async: false }) as string),
  };
  const brandName: string | undefined = raw.brandName;
  if (brandName !== undefined && (typeof brandName !== "string" || !brandName.trim())) fail("trail.json brandName", "expected a text, the same in every language");
  const stylesheet = existsSync(join(dir, "theme.css")) ? join(dir, "theme.css") : undefined;
  const endpoint = (v: any, where: string): Endpoint | undefined => {
    if (v === undefined) return undefined;
    if (!v || typeof v !== "object") {
      fail(where, `expected { "name": { "${lang0}": "…" }, "position": [longitude, latitude] }${where.endsWith("end") ? ` or "start"` : ""}`);
      return undefined;
    }
    unknown(v, "endpoint", where);
    if (!isPosition(v?.position)) fail(where, `"position" must be [longitude, latitude] in WGS84 degrees`);
    return { name: loc(v?.name, `${where} name`, true), position: v?.position };
  };
  const start = endpoint(raw.start, "trail.json start");
  const end = raw.end === "start" ? "start" : endpoint(raw.end, "trail.json end");
  if (raw.arrivals !== undefined && !Array.isArray(raw.arrivals)) fail("trail.json arrivals", "expected a list");
  const arrivals: Arrival[] = (Array.isArray(raw.arrivals) ? raw.arrivals : []).map((a: any, i: number) => {
    const where = `trail.json arrivals[${i}]`;
    unknown(a, "arrival", where);
    if (!ARRIVAL_KINDS.includes(a?.kind)) fail(`${where}.kind`, `expected one of ${ARRIVAL_KINDS.map((k) => `"${k}"`).join(", ")}`);
    if (!isPosition(a?.position)) fail(where, `"position" must be [longitude, latitude] in WGS84 degrees`);
    if (a?.link !== undefined) unknown(a.link, "link", `${where}.link`);
    if (a?.link !== undefined && typeof a.link?.url !== "string") fail(`${where}.link`, `expected { "label": …, "url": "…" }`);
    if (a?.source === undefined) unsourced.push(`arrivals[${i}]`);
    sourceOf(a?.source, "arrivals", `${where}.source`);
    return {
      kind: a?.kind,
      name: loc(a?.name, `${where}.name`, true),
      position: a?.position,
      note: loc(a?.note, `${where}.note`, false),
      ...(typeof a?.link?.url === "string" ? { link: { url: a.link.url, label: loc(a.link.label, `${where}.link.label`, true) } } : {}),
    };
  });

  // The captions make-audio.py speaks after the text, where trail.json asks for them.
  const spokenCaptions = (images: SourceImage[]) => (lang: string) =>
    raw.audio?.captions === true ? images.map((im) => im.caption?.[lang]?.trim() ?? "").filter(Boolean) : [];
  const images0 = readImages(dir, raw.images, "trail.json", checks);
  const item0: SourceItem = {
    n: 0,
    dir,
    title: title0,
    shortTitle: loc(raw.shortTitle, "trail.json shortTitle", false),
    fields: {},
    body: readBodies(dir, languages),
    images: images0,
    audio: readAudio(dir, dir, languages, manifest, (l) => title0[l] ?? title0[lang0] ?? "", spokenCaptions(images0)),
    recordings: readRecordings(dir, raw.recordings, "trail.json recordings", lang0, checks),
  };

  const folders = stationFolders(dir);
  if (!folders.length) fail("stations/", "no station folders");
  const stations: SourceItem[] = folders.map((sdir, i) => {
    const where = `stations/${basename(sdir)}/station.json`;
    const s = existsSync(join(sdir, "station.json")) ? readJson(join(sdir, "station.json")) : (fail(where, "missing"), {});
    unknown(s, "station", where);
    const p = s.position;
    const okPos = isPosition(p);
    if (!okPos) fail(where, `"position" must be [longitude, latitude] in WGS84 degrees`);
    const fields: Record<string, Localized> = {};
    for (const [k, v] of Object.entries(s.fields ?? {})) {
      if (!fieldKeys.has(k)) fail(`${where} fields.${k}`, `not declared in trail.json stationFields`);
      fields[k] = loc(v, `${where} fields.${k}`, false);
    }
    const title = loc(s.title, `${where} title`, true);
    const images = readImages(sdir, s.images, where, checks);
    if (s.object !== undefined) {
      if (s.object?.source === undefined) unsourced.push(`station ${i + 1}'s object`);
      sourceOf(s.object?.source, "objects", `${where} object.source`);
    }
    return {
      n: i + 1,
      dir: sdir,
      title,
      shortTitle: loc(s.shortTitle, `${where} shortTitle`, false),
      position: okPos ? (p as LngLat) : undefined,
      fields,
      body: readBodies(sdir, languages),
      images,
      audio: readAudio(dir, sdir, languages, manifest, (l) => title[l] ?? title[lang0] ?? "", spokenCaptions(images)),
      recordings: readRecordings(sdir, s.recordings, `${where} recordings`, lang0, checks),
      ...(s.object === undefined ? {} : { object: readObject(s.object, `${where} object`, checks) }),
    };
  });

  const routeFile = join(dir, "route.geojson");
  const route: GeoJSON.FeatureCollection = existsSync(routeFile)
    ? readJson(routeFile)
    : { type: "FeatureCollection", features: [] };
  if (route.type !== "FeatureCollection") fail("route.geojson", "must be a GeoJSON FeatureCollection");
  (route.features ?? []).forEach((f, i) => {
    const where = `route.geojson features[${i}].properties`;
    if (f.properties?.source === undefined) unsourced.push(`route.geojson features[${i}]`);
    sourceOf(f.properties?.source, "route", `${where}.source`);
    sourceOf(f.properties?.heightSource, "heights", `${where}.heightSource`);
  });
  const { credits, unused: unusedSources } = creditsFor(raw.sources, refs, languages, loc, fail, (m) => warnings.push(m));

  if (errors.length) throw new TrailError(`Trail ${dir} has errors:\n  ` + errors.join("\n  "));

  const positions = stations.map((s) => s.position!);
  const { legs, report } = computeLegs(route, positions, { start: start?.position, end: end === "start" ? end : end?.position });
  const length = legs.reduce((sum, l) => sum + l.length, 0);
  const minutes = legs.length && legs.every((l) => l.minutes !== undefined)
    ? Math.round(legs.reduce((sum, l) => sum + l.minutes!, 0) * 10) / 10
    : undefined;
  const all = [...positions, ...(start ? [start.position] : []), ...(end && end !== "start" ? [end.position] : []), ...routeLines(route).flat(), ...stations.flatMap((s) => (s.object ? flatPositions(s.object.geometry.coordinates) : []))];
  const extent: [LngLat, LngLat] = [
    [Math.min(...all.map((c) => c[0])), Math.min(...all.map((c) => c[1]))],
    [Math.max(...all.map((c) => c[0])), Math.max(...all.map((c) => c[1]))],
  ];

  const margin = typeof raw.map?.margin === "number" ? raw.map.margin : undefined;
  // The first view frames the trail; the bounds also hold the ways on to it, so each can be reached.
  const reach = [...all, ...arrivals.map((a) => a.position)];
  return {
    limits: mapLimits([[Math.min(...reach.map((c) => c[0])), Math.min(...reach.map((c) => c[1]))], [Math.max(...reach.map((c) => c[0])), Math.max(...reach.map((c) => c[1]))]], margin),
    id: basename(dir),
    dir,
    languages,
    machineTranslated,
    subtitle: loc(raw.subtitle, "trail.json subtitle", false),
    publisher: loc(raw.publisher, "trail.json publisher", false),
    duration: loc(raw.duration, "trail.json duration", false),
    lengthStated: loc(raw.length, "trail.json length", false),
    gettingThere: mapTexts(loc(raw.gettingThere, "trail.json gettingThere", false), (t) => marked.parse(t, { async: false }) as string),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    arrivals,
    links: (raw.links ?? []).map((l: any, i: number) => {
      unknown(l, "link", `trail.json links[${i}]`);
      return { url: String(l.url), label: loc(l.label, `trail.json links[${i}].label`, true) };
    }),
    stationFields,
    theme,
    signLabel,
    brandName,
    cover,
    footer,
    stylesheet,
    basemaps,
    credits,
    items: [item0, ...stations],
    route,
    legs,
    length,
    ...(minutes === undefined ? {} : { minutes }),
    extent,
    report,
    warnings,
    unusedSources,
    unsourced,
  };
}

/**
 * A trail is local: the map is bounded to its extent plus a generous margin
 * (`map.margin` metres, default the larger of 1.5 km and half the extent),
 * and its minimum zoom is the one at which that bounded area spans about
 * 320 px, a phone's width.
 */
function mapLimits(b: [LngLat, LngLat], marginM?: number): Trail["limits"] {
  const lat = (b[0][1] + b[1][1]) / 2;
  const mPerDegLat = 110574, mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const extentM = Math.max((b[1][0] - b[0][0]) * mPerDegLng, (b[1][1] - b[0][1]) * mPerDegLat);
  const m = marginM ?? Math.max(1500, extentM / 2);
  const dLng = m / mPerDegLng, dLat = m / mPerDegLat;
  const bounds: [LngLat, LngLat] = [
    [b[0][0] - dLng, b[0][1] - dLat],
    [b[1][0] + dLng, b[1][1] + dLat],
  ];
  const sizeM = extentM + 2 * m;
  const metresPerPxAtZ0 = 156543.03 * Math.cos((lat * Math.PI) / 180);
  const minZoom = Math.round(Math.log2((metresPerPxAtZ0 * 320) / sizeM) * 10) / 10;
  return { bounds, minZoom };
}

/** A JSON file of the folder; a byte-order mark (some Windows editors write one) is allowed. */
export function readJson(file: string): any {
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^\ufeff/, ""));
  } catch (e) {
    throw new TrailError(`${file}: ${(e as Error).message}`);
  }
}

/** text.<lang>.md in an item's folder, rendered to HTML. */
function readBodies(dir: string, languages: string[]): Localized {
  const out: Localized = {};
  for (const lang of languages) {
    const f = join(dir, `text.${lang}.md`);
    if (existsSync(f)) out[lang] = marked.parse(readFileSync(f, "utf8"), { async: false }) as string;
  }
  return out;
}

type Manifest = Record<string, { source?: string; bytes?: number }>;

/** audio.json: what build/make-audio.py made (and from which text); anything else in an audio slot is a recording. */
function readManifest(dir: string): Manifest {
  const f = join(dir, "audio.json");
  return existsSync(f) ? (readJson(f).files ?? {}) : {};
}

/** The hash make-audio.py records: the item's title and its text file, LF line ends; then each caption it spoke, after a blank line. */
function audioSourceHash(title: string, md: string, captions: string[]): string {
  const text = md.replace(/\r\n/g, "\n").replace(/\ufeff/g, "");
  return createHash("sha256").update(title + "\n" + text + captions.map((c) => "\n\n" + c).join(""), "utf8").digest("hex");
}

/**
 * audio.<lang>.mp3 in an item's folder, with whether it is synthetic and
 * whether what it was spoken from has changed since. A file of another size than the one
 * make-audio.py made is a recording put in its place.
 */
function readAudio(
  trailDir: string,
  dir: string,
  languages: string[],
  manifest: Manifest,
  title: (lang: string) => string,
  captions: (lang: string) => string[],
): Record<string, SourceAudio> {
  const out: Record<string, SourceAudio> = {};
  for (const lang of languages) {
    const file = join(dir, `audio.${lang}.mp3`);
    if (!existsSync(file)) continue;
    const made = manifest[relative(trailDir, file).replace(/\\/g, "/")];
    const synthetic = !!made && (made.bytes === undefined || made.bytes === statSync(file).size);
    // What make-audio.py speaks: the reading where there is one, else the text and the captions it asks for.
    const readingFile = join(dir, `reading.${lang}.md`);
    const reading = existsSync(readingFile);
    const spokenFile = reading ? readingFile : join(dir, `text.${lang}.md`);
    const stale = synthetic && (!existsSync(spokenFile) || made.source !== audioSourceHash(title(lang), readFileSync(spokenFile, "utf8"), reading ? [] : captions(lang)));
    out[lang] = { file, synthetic, stale, reading };
  }
  return out;
}

/** An image's pixel size, read from the file. */
function sizeOf(file: string, where: string, fail: Checks["fail"]): { width?: number; height?: number } {
  try {
    const { width, height } = imageSize(readFileSync(file));
    return { width, height };
  } catch {
    fail(where, `can't read the size of "${basename(file)}" (expected JPEG, PNG, WebP, GIF or SVG)`);
    return {};
  }
}

function readImages(dir: string, list: unknown, where: string, { loc, fail, unknown }: Checks): SourceImage[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    fail(`${where} images`, "expected a list");
    return [];
  }
  return list.map((im: any, i: number) => {
    const w = `${where} images[${i}]`;
    unknown(im, "image", w);
    const file = join(dir, String(im?.file));
    const found = !!im?.file && existsSync(file);
    if (!found) fail(w, `file "${im?.file}" not found next to it`);
    if (im?.page !== undefined && !/^https?:\/\//.test(String(im.page))) fail(`${w}.page`, "expected the address of the page where the picture is published");
    return {
      file,
      ...(found ? sizeOf(file, w, fail) : {}),
      caption: loc(im?.caption, `${w}.caption`, false),
      alt: loc(im?.alt, `${w}.alt`, false),
      credit: im?.credit,
      license: im?.license,
      ...(im?.page === undefined ? {} : { page: im.page }),
    };
  });
}

function readRecordings(dir: string, list: unknown, where: string, lang0: string, { loc, fail, unknown }: Checks): SourceRecording[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    fail(where, "expected a list");
    return [];
  }
  return list.map((r: any, i: number): SourceRecording => {
    const w = `${where}[${i}]`;
    unknown(r, "recording", w);
    const title = loc(r?.title, `${w}.title`, true);
    const lang = typeof r?.lang === "string" && r.lang ? r.lang : lang0;
    if (r?.file !== undefined && r?.url !== undefined) fail(w, `has both "file" and "url": one of them`);
    if (typeof r?.url === "string") {
      if (!/^https:\/\//.test(r.url)) fail(w, `"url" must be an https:// address (a page on https can't play audio from http)`);
      return { title, lang, url: r.url };
    }
    const file = join(dir, String(r?.file));
    if (!r?.file || !existsSync(file)) fail(w, `needs "file" (an audio file next to it) or "url"; file "${r?.file}" not found`);
    return { title, lang, file };
  });
}

function readLogos(dir: string, list: unknown, where: string, { loc, fail, unknown }: Checks): SourceLogo[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    fail(where, "expected a list");
    return [];
  }
  return list.map((l: any, i: number) => {
    const w = `${where}[${i}]`;
    unknown(l, "logo", w);
    const file = join(dir, String(l?.file));
    const found = !!l?.file && existsSync(file);
    if (!found) fail(w, `file "${l?.file}" not found next to trail.json`);
    return { file, ...(found ? sizeOf(file, w, fail) : {}), alt: loc(l?.alt, `${w}.alt`, true), href: l?.url };
  });
}

const OBJECT_DEPTH: Record<string, number> = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };

/** A station's object (docs/design/trail-content.md, station.json): its name and a GeoJSON geometry. */
function readObject(o: any, where: string, { loc, fail, unknown }: Checks): StationObject | undefined {
  unknown(o, "object", where);
  const name = loc(o?.name, `${where}.name`, true);
  const g = o?.geometry;
  const depth = OBJECT_DEPTH[g?.type];
  if (depth === undefined) {
    fail(`${where}.geometry`, `expected a GeoJSON geometry: Point, LineString or Polygon, or their Multi forms (not a Feature)`);
    return undefined;
  }
  const isPos = (p: unknown) => Array.isArray(p) && p.length >= 2 && p.every((x) => typeof x === "number") && Math.abs(p[0] as number) <= 180 && Math.abs(p[1] as number) <= 90;
  const shaped = (c: unknown, d: number): boolean => (d === 0 ? isPos(c) : Array.isArray(c) && c.length > 0 && c.every((x) => shaped(x, d - 1)));
  if (!shaped(g.coordinates, depth)) {
    fail(`${where}.geometry`, `coordinates don't fit a ${g.type} of [longitude, latitude] in WGS84 degrees`);
    return undefined;
  }
  const lines: LngLat[][] = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
  const rings: LngLat[][] = g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
  if (lines.some((l) => l.length < 2)) fail(`${where}.geometry`, "a line needs two points or more");
  if (rings.some((r) => r.length < 4 || r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) {
    fail(`${where}.geometry`, "a polygon's ring needs four points or more, the last the same as the first");
  }
  const geometry = { type: g.type, coordinates: g.coordinates } as StationObject["geometry"];
  const gone = o.gone === undefined ? undefined : loc(o.gone, `${where}.gone`, true);
  return { name, geometry, at: nameAt(geometry), ...(gone ? { gone } : {}) };
}

/**
 * Where an object's name stands on the map: a point itself (several: their
 * middle); a line's middle along its length (several: the longest's);
 * inside a shape, the point farthest from its edges (several: the largest).
 */
function nameAt(g: StationObject["geometry"]): LngLat {
  const pts = flatPositions(g.coordinates);
  const o = pts[0];
  const mean = (ps: LngLat[]): LngLat => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
  if (g.type === "Point" || g.type === "MultiPoint") return mean(pts);
  const fromLocal = ([x, y]: [number, number]): LngLat => {
    const [ux, uy] = toLocal(o, [o[0] + 1, o[1] + 1]);
    return [o[0] + x / ux, o[1] + y / uy];
  };
  const len = (l: LngLat[]) => l.slice(1).reduce((s, p, i) => s + Math.hypot(...sub(toLocal(o, p), toLocal(o, l[i]))), 0);
  if (g.type === "LineString" || g.type === "MultiLineString") {
    const lines = g.type === "LineString" ? [g.coordinates as LngLat[]] : (g.coordinates as LngLat[][]);
    const line = lines.reduce((a, b) => (len(b) > len(a) ? b : a));
    let rest = len(line) / 2;
    for (let i = 1; i < line.length; i++) {
      const a = toLocal(o, line[i - 1]), b = toLocal(o, line[i]), d = Math.hypot(...sub(b, a));
      if (d >= rest && d > 0) return fromLocal([a[0] + ((b[0] - a[0]) * rest) / d, a[1] + ((b[1] - a[1]) * rest) / d]);
      rest -= d;
    }
    return line[line.length - 1];
  }
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map((rings) => (rings as LngLat[][]).map((r) => r.map((p) => toLocal(o, p))));
  const area = (r: [number, number][]) => Math.abs(r.slice(1).reduce((s, p, i) => s + r[i][0] * p[1] - p[0] * r[i][1], 0)) / 2;
  const poly = polys.reduce((a, b) => (area(b[0]) > area(a[0]) ? b : a));
  const xs = poly[0].map((p) => p[0]), ys = poly[0].map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // A grid over the shape's box: fine enough for where a name stands, simpler than polylabel.
  const N = 40;
  let best: { p: [number, number]; d: number } = { p: [(x0 + x1) / 2, (y0 + y1) / 2], d: -Infinity };
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p: [number, number] = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!inside(p, poly[0]) || poly.slice(1).some((h) => inside(p, h))) continue;
      const d = Math.min(...poly.map((r) => edgeDistance(p, r)));
      if (d > best.d) best = { p, d };
    }
  }
  return fromLocal(best.p);
}

const sub = (a: [number, number], b: [number, number]): [number, number] => [a[0] - b[0], a[1] - b[1]];

function inside([x, y]: [number, number], ring: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function edgeDistance(p: [number, number], ring: [number, number][]): number {
  let d = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], [dx, dy] = sub(ring[i], a), len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    d = Math.min(d, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)));
  }
  return d;
}

/**
 * A photo's caption and alt as the site shows them: the caption's inline
 * Markdown as HTML (a species' name in italics), the alt plain text, the
 * caption's words where a language has no alt of its own.
 */
export function shownCaption(im: { caption?: Localized; alt?: Localized }): { caption?: Localized; alt?: Localized } {
  if (!im.caption) return { alt: im.alt };
  const html = mapTexts(im.caption, (t) => marked.parseInline(t, { async: false }) as string);
  return { caption: html, alt: { ...mapTexts(html, plainText), ...im.alt } };
}

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function mapTexts(t: Localized, f: (s: string) => string): Localized {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, f(v)]));
}

function isPosition(p: unknown): p is LngLat {
  return Array.isArray(p) && p.length === 2 && p.every((x: unknown) => typeof x === "number") && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
}
