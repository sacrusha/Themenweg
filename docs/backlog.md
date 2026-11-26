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
- The trail is a mock trail, `demo/rheinfall/`: ten stations around the
  Rhine Falls, with no signs on the ground and no publisher but Themenweg
  (its footer says so). Its texts' facts rest on sources better than
  Wikipedia (HLS, federal and cantonal offices, Heim's 1931 geology of the
  falls, Goethe's 1797 notes, the castle's own history); what none of them
  carried was cut. Still resting on a single secondary or Commons source:
  the 1887 protests, Münster's woodcut as the oldest view, the age of
  about 15,000 years, eels passing the falls, the bridge's height and its
  footpaths' date, and the pictures' dates; its pictures are from
  Wikimedia Commons, credited per picture; its route is routed over OSM
  paths and unchecked on the ground, and between stations 8 and 10 crosses
  the castle's paid grounds, which the cards say.
- Map: swisstopo, free, no key, attribution required, fair use (their
  example: 20,000 users a day). Raster WMTS in EPSG:3857 (pixelkarte-farbe,
  -grau, swissimage) is the classic look; vector styles (basemap,
  lightbasemap, imagerybasemap at vectortiles.geo.admin.ch) are the
  alternative. A trail names its basemaps; without any, the engine uses an
  OSM-based basemap (docs/design/trail-content.md, trail.json).
- Stack: Vite, TypeScript, MapLibre GL (needs WebGL2: iOS 15+), static
  build, published to GitHub Pages by Actions on every push to main, or to
  Cloudflare Pages by `npm run deploy`, run by hand on the maintainer's
  computer (secrets/README.md); development mostly on local previews.
  UI framework is the implementer's call, within forkability.
- Forkers have an environment like ours (Claude Code, Opus or better), so
  fork instructions address an AI with the person beside it. The
  generic/specific separation is architecture from version 1 on; the
  framework version is a check, not a build.
- Design of the one screen: docs/design/surface.md; dark:
  docs/design/dark.md; browsers and devices out of spec, and what the
  site does when a capability fails: docs/design/robustness.md; shell,
  content framework and content: docs/design/layers.md.

## Versions

Each ends with a working site more useful than the last. Items state the
purpose they serve and leave the how to the implementer.

State: 1–5 are built and reviewed. Verified in headless browsers and by the
user on desktop and Android (Samsung browser): flow, audio voices.
Checked in headless browsers only, not yet
by the user on a device: location without turning or following, the edge
buttons, the visitor's dot over the markers, the card's head and peek, the
sheet at its lowest position, the camera on selection, and a station's
object on the map. Not yet: a ground test, iOS, the bounds' hold on the map's centre. What to look at on a phone and with visitors:
docs/design/surface.md, Not known. A push to the GitHub repository's main
deploys the site through the Pages workflow.

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
- The trail's own look; Themenweg's own mark a footer line.

### 3. Audio — a station can be listened to instead of read

- Per-station audio in the card, usable while walking (plays on, screen
  locked). Demonstration with pre-generated speech files from the station
  texts through Microsoft's neural voices via edge-tts (unofficial
  endpoint, fine for a demo; the official Azure service has the same voices
  for production). For German, de-DE Seraphina at +8 % was judged better
  than the two Swiss Standard German voices in a listening test, and 0 %
  too slow. Real recordings would replace the files, same slot; a
  publisher's further recordings (several at a listening post) are listed
  in the card after the text, played from the site or the publisher's
  server. The spoken
  "Station n" could become the sign's own label, a content call that
  remakes every file.
- Who listens, in the user's experience: children not yet reading
  confidently, pensioners, and in part groups, where one person tends to
  read aloud to the others; a group hears it from the phone's speaker.

### 4. Walking help — the map-weak half can walk it

- You-are-here with the way they face, on a map that stays north up; a
  tap on the locate button shows them.
- The leg walked into the selected station emphasised on the map.
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

- Placards get reprinted in time, so the codes go into the reprint's
  design rather than onto stickers.

## Later, unordered

- Report a problem: a link on the site that opens a report with what the
  visitor saw and the state that explains it (station, language, device and
  browser, screen size, location on or off); at first it goes directly to
  GitHub as an issue. A GitHub issue needs an account and is public, which
  limits who reports and what a report may carry (no position).
- Wildlife integration: bird watching, sightings, species information.
- Seasonal content: what is to be seen now (a bird's arrival in spring, the
  weeks a flower carpets a slope). Closures, keys, opening days and events
  need the same validity in time (docs/catalogue.md, Opening hours, keys,
  closures, events).
- Notices: "Placard missing, will be replaced in spring." The ground
  differs from the card for a while; a notice can concern a station, a
  leg or the whole trail, and below an optional scroll it is as good as
  hidden. Thoughts on placement, a start for whoever designs it: the
  space above the card takes an inserted line without touching the
  head's layout; each scope has an element it belongs beside (the
  overview, "Next" and the leg on the map, the title and the marker); a
  visitor who listens sees a notice only if it is in view before play,
  and one who uses only the map sees it only on a marker or a leg; a
  notice that outlives its cause costs trust, so it needs the validity in
  time that seasonal content needs.
- Route variants and stages: shorter loops, branches, a long trail walked
  in stages; one route per trail so far (docs/catalogue.md, Route
  variants).
- Several trails of one publisher, and trails that share ground: one build
  makes one trail's site, where such trails would show each other's
  stations nearby.
- The route as a GPX or KML file, so that the tour portals that list a
  trail and its site share one track.
- Walking time from where the visitor is — what is left to the next
  station or the trail's end, at the fixed pace of the precomputed times
  (docs/design/trail-content.md, route.geojson). Which station is "the
  next" is the problem of One and a half stations selected (The surface,
  to rework). A visitor off the route needs a time
  from anywhere, which may want a pathing grid precomputed at build time
  rather than routing on the phone.
- The way from where the visitor stands, in the card's head: a live arrow
  and the distance to a station, and at a station an offer of its card
  ("Here: 9"). What it needs first: knowing which station is meant (The
  surface, to rework: One and a half stations selected); room that isn't
  the language choice's, which matters more even on the walk; a form that
  doesn't read as a button; and an arrow that shows whether it points the
  way in the world (a heading known) or as on the map. Until then the
  route, the dot and the leg's length under "Next" answer most of what it
  would; a scale on the map is a candidate for the rest. The offer would
  spare only a tap on the marker beside the dot.
- Arrival points beyond the walk's start (a railway station and a car
  park both, where the walk starts at neither), to guide visitors in from
  each; the walk's own start and end are in the trail's data
  (docs/design/trail-content.md, The walk's start and end).
- A static map image generated at build time (tiles over the trail's
  extent, the route and numbered stations, attribution in the image): what
  the map's place shows where a device can't run the map
  (docs/design/robustness.md), the preview image of a shared link, the page
  without JavaScript, the printable view's map (below), perhaps a last
  resort offline.
- A printable view: the trail on paper, the fallback beside the phone that
  trails commonly offer as a printable map or flyer.
- Getting away: from the current location to the nearest way off the trail
  or to public transport; "the next train I can reasonably catch".

## Open

- A station's dot marks its sign (where you stand), as surveyed, else the
  printed map's pin: visitors use the map to find the sign, not finding it
  frustrates, and the sign leads on to the object (what you look at). On a
  trail without signs it marks the object. A station can give its object
  as a shape, a line or a point, which the map draws as the thing
  (docs/design/surface.md, Objects), and one that is gone as where it
  stood. The demo has no gone thing, so the gone look has been seen only
  on a test trail.
- Where route.geojson is one ordered line, `build/legs.ts`'s graph is that
  line: its points are never merged, so a stretch walked twice is two
  strands, joined only through the line's order. A station whose nearest
  point lies on such a stretch can be attached to the pass of another leg;
  its legs then run along the line through that other pass, longer than
  walked, and `route-trail.py verify` flags them. An `attach` can't help,
  since the build ignores it; a station whose nearest point is on a stretch
  walked once is unaffected.
- Whether the site counts use, without cookies: GitHub Pages gives no logs,
  so whether a station's audio is played, or anything a card offers is
  used, stays unknown without it.
- CLAUDE.md's layout names `docs/brand/` and `docs/user-flow.md`, neither
  of which exists. The user's file.
- The basemap buttons over the map render in MapLibre's container font,
  not `--font`.
- The Rheinfall trail lacks four pictures its stations were written
  around, because Wikimedia Commons rate-limited the machine that built
  it: Gyger's map of 1685 (station 3), Turner (station 4, whose text names
  him), Bloch's salmon (station 7, which has one picture) and Herrliberger
  (station 8). Titles and addresses: `.tmp/rheinfall-sources/img/meta.json`
  on the machine the trail was built on.
- README.md, the repository's public landing, does not link to the
  published site.
- Code without a caller since the way from the visitor left the card's
  head: `onLine`'s `ahead` and `was` (with `JUMP_COST` and `pointAt`) and
  its `along` and `length` in `src/app/geo.ts`, and the tests in
  `src/test/geo.test.ts` that exercise them. `distanceToTrail` and
  `nearestOnTrail` in `map.ts` walk the same points; the waymark is drawn
  in `card.ts` and again in `on-map.ts`.

### The surface, to rework

docs/design/surface.md describes the site as built, these parts included.
Each item names a problem and, where there is one, a direction; the
solution is left to the implementer. None of it has been tried on the
ground.

- One and a half stations selected. A visitor may keep card 14 open until
  they reach 15, or switch to 15 on finishing 14 and then walk there; some
  use only the map. The site can't tell "what I am reading" from "where I
  am heading", and whatever depends on the station walked to inherits
  that. After a step to the next station the map shows the leg between
  the two (docs/design/surface.md, Camera), but draws it like the rest of
  the route: the leg it emphasises is the one leading on, unless walking
  help finds the visitor on the leg into the selection.
