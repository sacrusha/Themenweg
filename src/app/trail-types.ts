// The shape of a trail as the browser receives it (virtual:trail).
// Built from the trail folder by build/trail.ts; the folder's layout is
// documented in docs/design/trail-content.md.

/** Text per language code; the trail's first language is always present. */
export type Localized = Record<string, string>;

export type LngLat = [number, number];

export interface Basemap {
  label: Localized;
  /** A MapLibre style URL (vector) ... */
  style?: string;
  /** ... or raster tile URLs. */
  tiles?: string[];
  tileSize?: number;
  maxzoom?: number;
  attribution?: string;
  /** The source whose map it is (a key of the trail's sources): its credit is the attribution where the basemap gives none, and the map credits it once. */
  source?: string;
}

/** What of the site a source's data is (docs/design/trail-content.md, Sources). */
export type CreditUse = "route" | "heights" | "objects" | "arrivals" | "basemap";

/** A source the trail's data names, as the site credits it. */
export interface Credit {
  key: string;
  /** The credit as its terms ask for it, in each of the trail's languages. */
  credit: Localized;
  url?: string;
  /** What of the site is its data. */
  uses: CreditUse[];
}

export interface Image {
  url: string;
  width?: number;
  height?: number;
  caption?: Localized;
  alt?: Localized;
  credit?: string;
  license?: string;
  /** The page where the picture is published, which its credit links to. */
  page?: string;
}

/** A publisher's or supporter's logo, shown in item 0's footer. */
export interface Logo {
  url: string;
  width?: number;
  height?: number;
  alt: Localized;
  /** Where the logo links to. */
  href?: string;
}

/** A spoken version of an item's text, in one language. */
export interface Audio {
  url: string;
  /** Made by speech synthesis (listed in the trail's audio.json), not recorded. */
  synthetic: boolean;
}

/** One of the publisher's recordings, played in the card beside the text (docs/design/trail-content.md, recordings). */
export interface Recording {
  title: Localized;
  url: string;
  /** The language spoken. */
  lang: string;
}

/** Item 0 is the trail itself, items 1..n the stations in walking order. */
export interface Item {
  /** 0 for the trail, 1..n for stations: the number on the ground signage. */
  n: number;
  title: Localized;
  /**
   * Where room is short (the card's head, the lock screen): what the title
   * says in fewer words, per language; the title where a language has none.
   */
  shortTitle: Localized;
  /** Station fields by key (see Trail.stationFields). */
  fields: Record<string, Localized>;
  /** Rendered HTML of text.<lang>.md, per language. */
  body: Localized;
  images: Image[];
  /** audio.<lang>.mp3 per language, where the folder has one. */
  audio: Record<string, Audio>;
  /** The publisher's recordings for the item, in their order. */
  recordings: Recording[];
  /** Where the sign stands, or on a trail without signs the thing it is about. */
  position?: LngLat;
  /** The thing the station is about, where that is not the spot the sign stands on. */
  object?: StationObject;
}

/** A station's object: a real thing, drawn on the map as its shape. */
export interface StationObject {
  name: Localized;
  geometry: GeoJSON.Point | GeoJSON.MultiPoint | GeoJSON.LineString | GeoJSON.MultiLineString | GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Where its name stands: inside a shape, at a line's middle, at a point. */
  at: LngLat;
  /** Where the thing is gone: what became of it, as the trail says it ("demolished 1984"). */
  gone?: Localized;
}

/** Where the walk begins before station 1, or ends after the last, where that isn't a station: an overview board, a car park. */
export interface Endpoint {
  name: Localized;
  position: LngLat;
}

/** What an arrival point is, which its mark on the map shows. */
export type ArrivalKind = "train" | "bus" | "lift" | "parking";

/** A way on to the trail and off it, apart from the walk's start and end: a railway station, a bus stop, a lift, a car park. */
export interface Arrival {
  kind: ArrivalKind;
  name: Localized;
  position: LngLat;
  /** A line more, in the trail's words: which lines stop there, where the lift leads. */
  note: Localized;
  /** Where the visitor finds more: a timetable, the lift's hours. */
  link?: { label: Localized; url: string };
}

/** The way from one stop of the walk to the next: from 0, the start, where the trail has one; to items.length, the end, where it has one. */
export interface Leg {
  from: number;
  to: number;
  /** Metres along the route, or the straight line where the route has no path. */
  length: number;
  coordinates: LngLat[];
  /** true when no path along the route was found and the leg is a straight line. */
  straight: boolean;
  /**
   * Walking time in minutes at the signposts' pace (build/walk-time.ts), not
   * rounded for display; absent where the route has no heights or the leg is straight.
   */
  minutes?: number;
}

export interface Trail {
  id: string;
  languages: string[];
  /** Languages whose texts are machine translations nobody has reviewed; the card says so. */
  machineTranslated: string[];
  subtitle: Localized;
  publisher: Localized;
  duration: Localized;
  /** The walk's length as the publisher states it; shown in place of the derived length. */
  lengthStated: Localized;
  gettingThere: Localized;
  /** Where the walk begins, where that isn't station 1. */
  start?: Endpoint;
  /** Where the walk ends, where that isn't the last station: a place of its own, or "start", back where it began. */
  end?: Endpoint | "start";
  /** Ways on to the trail and off it, which the map marks. */
  arrivals: Arrival[];
  links: { label: Localized; url: string }[];
  stationFields: { key: string; label: Localized }[];
  theme: { accent?: string; accentDark?: string };
  /** How the trail's signs name a station, as inline HTML per language with "{n}" for its number. */
  signLabel: Localized;
  /** The trail's name as a brand, on the overview's button in every language; without one, the button says "Overview". */
  brandName?: string;
  /** The trail's own mark, a picture: where the engine otherwise draws its waymark for the trail (the overview's title and button, the page's icon). */
  mark?: string;
  /** The photo that opens item 0. */
  cover?: Image;
  /** The end of item 0: who stands behind the trail. `text` is HTML per language. */
  footer: { logos: Logo[]; text: Localized };
  basemaps: Basemap[];
  /** The sources the trail's data names, each once. */
  credits: Credit[];
  /** items[0] is the trail, items[n] station n. */
  items: Item[];
  route: GeoJSON.FeatureCollection;
  legs: Leg[];
  /** Sum of the legs, from the start (or station 1) to the end (or the last station), metres. */
  length: number;
  /** Sum of the legs' walking times, minutes; absent unless every leg has one. */
  minutes?: number;
  /** The stations' and the route's extent, [[west, south], [east, north]]. */
  extent: [LngLat, LngLat];
  /** How far the map may go: the trail's extent with its margin, and the matching minimum zoom. */
  limits: { bounds: [LngLat, LngLat]; minZoom: number };
}
