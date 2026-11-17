# Backlog

## Purpose

A trail's website that strangers use, untrained, for two to four hours in
their lives: planning at home, walking between stations, reading at a
station, browsing afterwards, arriving mid-trail from a sign. One fluid
surface serves all of these; nothing the visitor has built up (where am I,
what is around, where was I reading) is thrown away by a page change. The
map lets the half of people who are weak at reading maps navigate
physically, with GPS. The engine is generic; a trail is a folder of content,
so another trail is a fork with its folder replaced.

## Situation

- Themenweg is public: the user shares and demonstrates it as part of his
  portfolio, and it is to grow into a framework others fork for their own
  trails.
- Engine in `src/`, trails in `trails/<id>/`; `src/` never names a trail.
  The trail folder is the fork interface; its layout is documented in
  docs/design/trail-content.md.
- The trail is a mock trail, `trails/rheinfall/`: ten stations around the
  Rhine Falls, with no signs on the ground and no publisher but Themenweg
  (its footer says so). Its texts are written from Wikipedia and other
  linked sources, their facts not yet checked; its pictures are from
  Wikimedia Commons, credited per picture; its route is routed over OSM
  paths and unchecked on the ground, and between stations 8 and 10 crosses
  the castle's paid grounds, which the cards say.
- Map: swisstopo, free, no key, attribution required, fair use (their
  example: 20,000 users a day). Raster WMTS in EPSG:3857 (pixelkarte-farbe,
  -grau, swissimage) is the classic look; vector styles (basemap,
  lightbasemap, imagerybasemap at vectortiles.geo.admin.ch) keep labels
  upright when the map rotates. A trail names its basemaps; without any,
  the engine uses an OSM-based basemap (docs/design/trail-content.md,
  trail.json).
- Stack: Vite, TypeScript, MapLibre GL (needs WebGL2: iOS 15+), static
  build, GitHub Pages via Actions; development mostly on local previews.
  UI framework is the implementer's call, within forkability.
- Forkers have an environment like ours (Claude Code, Opus or better), so
  fork instructions address an AI with the person beside it. The
  generic/specific separation is architecture from version 1 on; the
  framework version is a check, not a build.
- Design of the one screen: docs/design/surface.md; the trail's look:
  docs/design/brand.md; browsers and devices out of spec, and what the
  site does when a capability fails: docs/design/robustness.md; shell,
  content framework and content: docs/design/layers.md.

## Versions

Each ends with a working site more useful than the last. Items state the
purpose they serve; how is the implementer's.

State: 1–5 are built and reviewed. Verified in headless browsers and by the
user on desktop and Android (Samsung browser): flow, camera, audio voices,
navigation against the bounds. Not yet: a ground test, iOS. A push to the
GitHub repository's main deploys the site through the Pages workflow.

### 1. Walkable surface — the interaction model can be tested on phones on the trail

- Map with the numbered stations and the route; selected, previous and next
  distinguishable.
- The sheet: item 0 (the trail) and one card per station with title and the
  trail's short facts; prev/next; a marker tap selects; "Next" at a card's
  end collapses the sheet.
- Portrait: scroll-driven sheet over a fixed map. Landscape and desktop:
  side by side with a draggable divider. One DOM.
- Selected station in the URL, so screen-lock and reload land where the
  visitor was, and a sign's QR code can deep-link.
- Deployed to GitHub Pages; `npm run dev` for local previews.

### 2. The signs in the sheet — the site replaces carrying the leaflet

- Full sign texts, photos with captions and credits, item 0 from the
  leaflet's intro.
- The trail's printed design as its brand; Themenweg's own mark a footer
  line.

### 3. Audio — a station can be listened to instead of read

- Per-station audio in the card, usable while walking (plays on, screen
  locked). Demonstration with pre-generated speech files from the station
  texts through Microsoft's neural voices via edge-tts (unofficial
  endpoint, fine for a demo; the official Azure service has the same voices
  for production). For German, de-DE Seraphina at +8 % was judged better
  than the two Swiss Standard German voices in a listening test, and 0 %
  too slow. Real recordings would replace the files, same slot. The spoken
  "Station n" could become the sign's own label, a content call that
  remakes every file.

### 4. Walking help — the map-weak half can walk it

- You-are-here with heading cone; follow mode; heading-up rotation.
- Arrow and distance to the next station in the sheet's peek state.
- Compass permission flow (iOS needs a gesture) and GPS-course fallback.

### 5. Languages — a visitor who doesn't read the trail's language can use it

- Language toggle; the content model carries languages per field from
  version 1 on.
- Machine translations (Sonnet) as the demonstration.

### 6. Framework check — someone else can fork it for their trail

- Mock trail, README with fork instructions for an AI, docs/ as CLAUDE.md
  lays out.
- Legs taken as given: `route-trail.py` could write one feature per leg so
  the build uses them instead of re-deriving legs from one merged line and
  checking the two against each other (`verify`, `legs_intended.json`);
  derivation would remain only for traced fragments. Simpler, and it
  touches the route section of docs/design/trail-content.md.

### 7. Offline — tiles and content survive dead spots

### 8. QR codes — printable per-station codes for the signs

## Later, unordered

- Report a problem: a link on the site that opens a report with what the
  visitor saw and the state that explains it (station, language, device and
  browser, screen size, location on or off); at first it goes directly to
  GitHub as an issue. A GitHub issue needs an account and is public, which
  limits who reports and what a report may carry (no position).
- Wildlife integration: bird watching, sightings, species information.
- Seasonal content: what is to be seen now (a bird's arrival in spring, the
  weeks a flower carpets a slope).
- Walking time from where the visitor is — what is left to the next
  station or the trail's end, at the fixed pace of the precomputed times
  (docs/design/trail-content.md, route.geojson). It belongs near
  "Next", with the way's arrow and distance. A visitor off the route needs
  a time from anywhere, which may want a pathing grid precomputed at build
  time rather than routing on the phone.
- A static map image generated at build time (tiles over the trail's
  extent, the route and numbered stations, attribution in the image): what
  the map's place shows where a device can't run the map
  (docs/design/robustness.md), the preview image of a shared link, the page
  without JavaScript, a print view, perhaps a last resort offline.
- Getting away: from the current location to the nearest way off the trail
  or to public transport; "the next train I can reasonably catch".

## Open

- A station's dot marks the object (what you look at) where it can be
  identified, else the printed map's pin; the sign (where you stand) is
  what "arrived" wants. One position per station so far.
- Walking help, untested on the ground: compass steadiness, "Hier: n" at
  25 m where two stations stand closer than that, whether the locate
  button's first tap should only follow rather than also turn the map,
  whether a walker with the sheet raised minds lowering it to reach the
  locate button (the controls slide out as the map strip shrinks), and
  whether 30 s is the right age for a fix to go stale (the dot grey, the
  way and "Hier" withdrawn until the next fix).
- CLAUDE.md's layout names `docs/brand/`, `docs/user-flow.md` and
  `secrets/`, none of which exist; the brand doc is docs/design/brand.md
  and deploys need no local credentials. The user's file.
- The basemap buttons over the map render in MapLibre's container font,
  not `--font`.
