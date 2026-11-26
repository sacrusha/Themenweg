# The trail folder

## Purpose

Everything that makes the site one particular trail lives in one folder,
`trails/<id>/`; the engine in `src/` reads it and never names a trail. This
folder is the fork interface: another trail's site is this repository with
its folder added under `trails/`, and removing a trail is removing one path.
The demo trail lives the same way in `demo/<id>/`, built only while
`trails/` holds no trail, so a fork's own trail needs no setting and a pull
of the framework adds none beside it. Its layout is written for an AI
filling it from a trail's leaflet, placards and tracks, with the trail's person beside it.

## Situation

- Sources are printed: a leaflet with a map and a station list, placards with
  text and photos, sometimes a GPX track. Positions and routes are traced or
  georeferenced, so they are approximate, and a route often arrives as
  unordered fragments rather than one line.
- The site carries languages per field from the start, so every text has
  room for more languages without a change of shape. Visitors who don't read
  the trail's language are served by translations; a
  publisher rarely has them, and one made by machine is useful at once and
  can be wrong (Languages, below).
- Photos carry their own credits and licences, which travel with them.
  Other data from others (paths, heights, outlines) names its source,
  which the site credits (Sources, below).
- One build makes one trail's site.

## Layout

```
trails/<id>/
  trail.json             the trail: item 0 of the sheet, map, theme
  text.<lang>.md         item 0's text (optional)
  audio.<lang>.mp3       item 0's text spoken (optional)
  reading.<lang>.md      what is spoken in place of the text (optional)
  audio.json             what build/make-audio.py made, and from which text
  route.geojson          the route as drawn, with heights for walking times (optional)
  route-trace.geojson    the route as traced from the printed map; input of build/route-trail.py (optional)
  legspec.json           corrections to the routing: via points, hints (optional)
  theme.css              the trail's look beyond its colours (optional)
  <files theme.css uses> fonts, images, by url() (optional)
  <image files>          item 0's photos, cover and logos, named in trail.json
  <audio files>          item 0's recordings, listed in trail.json (optional)
  stations/
    01-<slug>/
      station.json       one station
      text.<lang>.md     its text (optional)
      audio.<lang>.mp3   its text spoken (optional)
      reading.<lang>.md  what is spoken in place of its text (optional)
      <image files>      its photos, listed in station.json
      <audio files>      its recordings, listed in station.json (optional)
    02-<slug>/
    ...
```

**Texts** are objects keyed by language code, `{ "de": "…", "en": "…" }`. The
first code in `trail.json` `languages` is the source language and must be
present wherever a text is required; other languages may be missing, and the
site falls back to the source language.

**Order and numbers.** Station folders sort by name; the n-th folder is
station n, and n is the number on the map marker, in the URL (`#7`) and, on a
real trail, on the signs. So folders are named with a two-digit prefix in
walking order; the slug after it is only for people.

### trail.json

| Field | | |
|---|---|---|
| `languages` | required | Language codes; the first is the source language. With more than one, the site shows a language toggle (Languages, below). |
| `machineTranslated` | list | The languages, other than the source, whose texts are machine translations nobody has reviewed. The cards in those languages say so. |
| `title` | required, text | The trail's name. Page title and item 0's heading. |
| `shortTitle` | text | The trail's name in fewer words, for where room is short: item 0's title in the card's head. |
| `subtitle` | text | One line under the title; also the page description. |
| `publisher` | text | Who publishes the trail, shown at the end of item 0. |
| `duration` | text | Walking time as the publisher states it. Not derived. |
| `length` | text | The walk's length as the publisher states it (`"3,7 km"`), from its start to its end; shown in place of the length derived from the route (route.geojson). |
| `start` | object | Where the walk begins, where that isn't station 1: `{ "name": text, "position": [lon, lat] }` (an overview board, a car park, a railway station). Item 0 names it as the start, the map marks it with the waymark, and the route runs from it to station 1 (The walk's start and end, below). Without one, the walk begins at station 1. |
| `end` | object or `"start"` | Where the walk ends, where that isn't the last station: a place as `start` gives one, or `"start"`, back where it began (the start, else station 1). Item 0 names it, and the route runs on from the last station to it. Without one, the walk ends at the last station. |
| `gettingThere` | text | How to reach the start, in Markdown: a paragraph for each way of arriving, a link to the timetable. |
| `arrivals` | list | The ways on to the trail and off it that the trail's material points visitors to, which the map marks: railway stations, bus stops, a lift, a car park (Arrival points, below). |
| `links` | list | `{ "label": text, "url": "…" }`, shown in item 0. |
| `stationFields` | list | The short facts every station card shows, in order: `{ "key": "…", "label": text }`. The keys are the trail's own (`location`, `subject`). They follow the player and the sign row, in view once the sheet is raised. A location that says where exactly the sign stands helps a visitor find it: a station's position on the map can be some metres off. |
| `images` | list | Photos for item 0, as for stations. |
| `recordings` | list | Recordings for item 0, as for stations. |
| `theme` | object | `accent` (markers, route) and `accentDark` (selection, buttons, the favicon; must carry white text), as `"#rrggbb"`. |
| `signLabel` | text | How the trail's signs name a station, with `{n}` for its number and Markdown bold (`"Nature trail **Post {n}**"`). Shown on each station card after its player, where it has one (the sign row), so a visitor standing at a sign sees that the card belongs to the sign. |
| `brandName` | text | The trail's name as its brand, on the overview's button in every station card's head, the same in every language. Without one, the button says "Übersicht" in the visitor's language. |
| `cover` | image | One photo, as in `images`, at the top of item 0 (after the player), edge to edge. |
| `footer` | object | The end of item 0, who stands behind the trail: `logos`, a list of `{ "file": "logo.png", "alt": text, "url": "…" }` (`url` optional, the logo links there; a logo drawn for paper comes on its own opaque white ground, which a browser's own darkening dims but keeps, where a transparent one is lost on the darkened paper: docs/design/robustness.md), and `text`, a text in Markdown. Below it the engine adds its own one line. |
| `map.basemaps` | list | The basemaps, first is the default; with more than one the map shows a toggle. Each is `{ "label": text, "style": "<MapLibre style URL>" }` for vector tiles, or `{ "label": text, "tiles": ["…/{z}/{x}/{y}.jpeg"], "tileSize": 256, "maxzoom": 17, "attribution": "<HTML>" }` for raster tiles, where `"source": "<key>"` can stand for the attribution (Sources, below). `maxzoom` is the closest zoom whose tiles are drawn at their scale rather than enlarged from coarser ones (swisstopo's Landeskarte 17, though it serves enlargements to 19; its Luftbild 20): the map enlarges them itself beyond it, and the site opens no closer, since an enlarged map's labels and buildings blur on a phone. Without any, the engine uses an OSM-based vector map. |
| `sources` | object | Sources of the trail's data beyond the engine's own, by key: `{ "<key>": { "credit": text, "url": "…" } }` (Sources, below). |
| `map.margin` | number | Metres the map may show beyond the trail's extent (stations, their objects and route). Default: the larger of 1.5 km and half the extent. The minimum zoom follows from it: the bounded area spans about a phone's width. |

### Languages

Purpose: a visitor who doesn't read the trail's language can use it, at the
station and at home, and is told how far to trust what they read.

**What a language is.** A code in `languages`, and for each text the
language's entry: `title`, `fields`, captions and alts, item 0's fields and
`text.<lang>.md`, and optionally `audio.<lang>.mp3`. Nothing needs all of it:
what a language lacks, the card shows in the source language. Texts that are
the trail's own words stay in the source language by leaving the other
entries out. A `signLabel` is what the signs print, so the card shows it
as the sign does, in the source language, in every language; the same goes for the logos' names. The site's own words (buttons,
hints) are `app/strings.ts`, in German, English and French; a language the
engine has no strings for gets English. `npm run check` lists per language
what is missing.

**Which language opens.** The address's `?lang=en` if the trail has it (a
link or a sign's QR code can name a language); else the visitor's earlier
choice; else the first of the browser's languages the trail has; else English
if the trail has it, else the source language.

**The toggle.** In every card's title row: the current code and a ∨
("DE ∨"); a tap opens the device's own picker with the languages by their
own names ("Deutsch", "English", "Français") (docs/design/surface.md,
Language). A choice is remembered. Changing language
reloads the page, after saving where the visitor is (station, sheet, map
view), which is why the map, card, walking help and the audio player need no
live switching; playing audio stops.

**Machine translations.** Marked by `machineTranslated` in `trail.json`,
per language. Every card whose text is shown in a marked language opens with
a note, "Machine translation (original: German), not checked by the
publisher. It may contain errors.", with a button to the original. The note
is the site's words in the visitor's language; it is the same pattern as the
synthetic-voice note under the player, which stays: audio in a marked
language is a synthetic voice reading a machine translation. A language
leaves the list when a person who knows it has reviewed all of its texts;
the note then goes. A machine translation gives the common names of
animals and plants in the language, and keeps place names as the signs
print them, with a short gloss where the name's meaning helps
("Rathausplatz (town-hall square)").

### theme.css

The trail's look beyond its two colours: the engine loads it after all its
own stylesheets and MapLibre's, and `url()`s in it resolve next to it. It sets the engine's
tokens on `:root` (`--font`, and `--font-heading` where titles, headings
and the stations' numbers are set in a face of their own; `--heading` for
the colour of titles and headings, `--ink`,
`--muted`, `--paper`, `--wash`, `--line`, `--grip` for the sheet's handle,
`--glass` and `--glass-thin` for the controls over the map, which follow the
paper, `--radius`; `--badge`, `--on-badge` for the disc before a card's
title; `--prev`, `--next`
and their text colours `--on-prev`, `--on-next` for the previous and the
next station, one colour each for the marker and the card's button, the
previous station's also the overview's button;
`--marker`, `--on-marker` for the other stations' markers; `--arrival`,
`--on-arrival` for the arrival points' ground and pictogram) and may restyle the
card's classes. What sits on the map is painted on canvas from these
tokens (docs/design/dark.md), so its look is set through them, not
through its classes. The site follows the device into dark (docs/design/dark.md),
and a token set on `:root` holds in both: a colour the theme sets
needs its dark value too, in `@media (prefers-color-scheme: dark)` after
it, except the map's (`--marker`, `--prev`, `--next`,
their text colours, `--arrival`, `--on-arrival`, `--you` and its kin), which hold in both as the map
does. The card body's classes are the content
framework's (src/app/content/, docs/design/layers.md), its styles still in
src/app/style.css, so an engine change can move them; photos carry `data-shape` (`square`,
`portrait`, `landscape`) and the first is `.photo-lead`, the rest inside
`.photo-insets`.

A publisher's look is often a ground more than an accent: the title on the
brand's colour, a pale panel under the facts. A part of the card takes a
ground of its own where the theme sets the tokens anew on that part's
class: what stands in the part is painted from them, and a value set there
holds in both schemes, as a printed ground does. The head (`.card-head`) is
such a part: `--paper` is its ground, `--heading` its title, `--ink` the
language choice, `--muted` the overview's count and length, `--line` its
borders, `--grip` the handle, `--wash` a hovered control, `--accent-text`
the focus ring, `--badge` and `--on-badge` the title's disc, which on a
ground of `accentDark` is otherwise the ground's colour. The buttons in it
keep the colours of their roles (`--prev`, `--next`), which the map's
markers share: the map reads its tokens on `:root`, so those are set
there, and a token set on a part doesn't reach the map. The scroll marker
brings its own patch of `--paper`, whatever ground it passes over.

Two things a trail's look often meets. Colours that work at sign size can
fail on a phone outdoors: a light print green carries white text at little
more than 2:1; `accentDark` is the colour that carries white text. A
printed typeface is often licensed and can't be bundled; a free face with
its metrics can stand in where the device lacks it, within that face's
licence.

### station.json

| Field | | |
|---|---|---|
| `title` | required, text | The station's heading (the sign's title). |
| `shortTitle` | text | The title in fewer words, for where room is short: the card's head (two lines beside the language choice) and the lock screen while it plays. The title stays everywhere else (the station list, "Next", the page title, the spoken intro). A language without one shows its own title; `npm run check` lists titles over about 36 characters that have none. |
| `position` | required | `[longitude, latitude]`, WGS84 degrees, GeoJSON order: where the sign stands (Routing the legs over real paths, step 1). Stations that share a sign share its position; the map sets their markers side by side (docs/design/surface.md, Markers on one spot). |
| `object` | object | What the station is about, where that isn't the spot the sign stands on: `{ "name": text, "geometry": … }` (Objects, below). |
| `fields` | object | Values for the trail's `stationFields`, by key; each a text. Keys not declared there are an error. |
| `images` | list | `{ "file": "kestrel.jpg", "caption": text, "alt": text, "credit": "…", "license": "…", "page": "https://…" }`. `file` is next to `station.json` (JPEG, PNG, WebP, GIF or SVG); `caption` takes inline Markdown, so a species' name can be in italics as the sign prints it (`"Kestrel (*Falco tinnunculus*)"`); `alt` is plain text and defaults to the caption's words; the build reads each photo's size from the file, so the card reserves its space and knows its shape. The card shows them after the text as one group: the first large, the rest as insets after it, two to a row where they are upright or square and a row to themselves where they are wide (a map, a chart at half a phone's width can't be read), the caption with each, and one line naming each credit and licence once, as a printed panel names its photographers; a tap on a photo opens it on its own, as large as the screen allows and with its caption, where the phone's pinch zooms it (a chart in an inset is too small to read); Back, or a tap, returns to the card. `page` is where the picture is published (its Commons page), which the line links to: the credit, where just one of its photos has one, else the captions of those photos, each to its own. A Creative Commons licence named as its deed names it ("CC BY-SA 4.0", "CC BY 3.0 de", "CC0") links to its text. |
| `recordings` | list | The publisher's recordings for the station beyond its spoken text (recordings, below). |

#### Objects

Purpose: a visitor can tell what a station is about in the world, and
where it is, when that isn't where the sign stands: planning at home,
walking there, standing at the sign.

A station's `position` is its sign, which visitors find by the map; the
sign leads them on to what it is about, and that can lie elsewhere: a
school's roof seen from the bridge the sign stands on, rocks in a river
off a landing, a building across a square or some hundreds of metres
off. Where a station has such a thing, `object` names it and gives its
shape, which the map draws (docs/design/surface.md, Objects). An object
is optional, and is a real, defined thing; a station about a theme with
nothing in particular to look at has none.

- `name`, required, text: what the thing is, in a few words; the map
  shows it beside the shape, wrapping a long one, and the card says the
  rest.
- `geometry`: a GeoJSON geometry in WGS84: a `Polygon` for a thing with
  an extent (a roof, a pond, a meadow), a `LineString` for a thing along
  a line (a hedge, a wall, a stretch of a stream), a `Point` for a thing
  at a spot (a tree, a statue), or their `Multi` forms for a thing in
  parts (two rocks). The geometry alone, not a Feature; a polygon's rings
  end on their first point.
- `gone`, text: where the thing is gone and the sign is all that remains
  of it, what became of it, as the trail says it ("demolished in 1984,
  flats since"). The map then draws where it stood
  as gone, with this under its name (docs/design/surface.md, Objects).
  Its geometry is where it stood: a shape from an older edition of the
  national map or a plan, or a point where only the spot is known.
- `source`: where the geometry comes from, where that isn't the
  publisher's own (Sources, below): `"osm"` for a shape taken from
  OpenStreetMap.

OpenStreetMap maps many such things as shapes (buildings, ponds, islets).
A shape can also be traced on the aerial. `npm run check` prints each object's
distance from its sign, where swapped coordinates or the wrong building
show as an unlikely figure.

### text.&lt;lang&gt;.md

The long text of an item (a placard's text, the trail's introduction), one
file per language, in Markdown. Bold carries what the sign prints bold.
Raw HTML passes through into the card, so a `<details>` can keep an answer
closed until the visitor taps it, or a table can set out figures. A number
and its unit or per cent sign ("13 %", "8 ha", "2 km") stay on one line,
here and in every text the site shows from Markdown.

### audio.&lt;lang&gt;.mp3

Purpose: a visitor can listen to an item instead of reading it, walking with
the phone in a pocket. The slot is `audio.<lang>.mp3` next to the
`text.<lang>.md` it speaks, one per language, MP3 because every browser plays
it. A file in the slot is all the site needs: the card then has a player
(docs/design/surface.md, Listening; the site's words: `strings.ts`), and
the browser's media controls, lock
screen included, show the item's number and title. No `station.json` entry.
An item with no file shows no player.

The language rule follows the text's: the card plays the file of the language
it shows. Where an item has no text in the visitor's language and the card
shows the source language's text, it plays the source language's file; where
it has the text but no file, there is no player, never speech that doesn't
match the screen.

Two kinds of file fill the slot, and the card tells them apart: a real
recording (put there by hand), and speech made by `build/make-audio.py`, which
lists every file it made in `audio.json`, with its size, and which the card
marks "read aloud by a synthetic voice". A file of another size than the one
listed is a recording put over a made file: the card shows it as a recording,
and the script never overwrites a file it did not make
(`--overwrite-recordings` says otherwise).

**Making the speech.** The script speaks, per `text.<lang>.md`, the item's
title ("Station <number>. Title." for a station, so the listener can match the sign;
item 0 gets its title only)
and the text with its Markdown removed, through Microsoft's neural voices via
`edge-tts` (an unofficial endpoint, no key: right for a demonstration; the
official Azure service has the same voices for production).

What serves a listener depends on the trail, sometimes on the station and the
language: a caption can carry the content (a station told mostly in the
captions of four maps) or only describe a picture the listener isn't looking
at; a table, a list of facts, a hint at the recordings below may want other
words when heard. So what the script derives from the card is a draft, and a
reading is the judgement on it:

- **The draft.** The speech says what a reader of the card meets, and keeps
  closed what the card keeps closed. Of raw HTML the tags go and their text
  stays; a closed `<details>` is spoken as its `<summary>` only (an `open` one
  whole), so the hidden answer is not given away; comments, `<script>`,
  `<style>` and `<template>` are not spoken; a table is read cell by cell, a
  row to a sentence; a thematic break (`---`) is a pause. The photos'
  captions follow the text where
  `audio.captions` asks for them, each in the card's language, in the card's
  order; a caption the language lacks is left out.
- **A reading.** `reading.<lang>.md` beside the item's text, where there is one,
  is spoken in its place, captions and all, after the same intro and by the
  same rules (Markdown and HTML as above). It is the words a person or an AI
  chose for listening to that item in that language; the script writes none.
  It doesn't follow later changes to the text: `npm run check` names the items
  spoken from a reading, and whoever changes a text looks at its readings.

German needs three provisions, all in `spoken()` and `synth()`, because a
multilingual German voice (such as Seraphina) picks its
language itself, sentence by sentence, and a short sentence without German
words in it can be read in English (a two-word title, or a three-word
sentence opening a paragraph; found by running a speech recognizer's language detection over the generated audio,
not by ear). The endpoint accepts no
SSML language element (`lang`, `s`, `p` get no audio back) and edge-tts escapes
the text, so the language can only be steered through the text:

- The intro is one sentence with German words before the title and the number
  spelled out: "Hier ist Station sieben: Title." The number is a word because
  German reads a digit followed by a full stop as an ordinal ("siebter"). The
  other languages keep "Station 7. Title."
- A paragraph's first sentence of four words or fewer is joined to the next
  with a comma instead of a full stop (the text on screen is untouched). A
  full stop after a number or a word of two letters or fewer ends no sentence
  here: it is an ordinal or an abbreviation ("Ab dem 17. Jahrhundert",
  "St. Gallen", "M. Gasser").
- The request for a multilingual voice declares that voice's own locale
  (`de-DE`), where edge-tts declares `en-US` on every request. Voices that are
  not multilingual are left as edge-tts has them.

Where a German voice still gets a short sentence wrong, a change of wording in
`audio.say` or a voice that is not multilingual is the remaining lever.

Reproduce:

```
pip install edge-tts
python src/build/make-audio.py           # new and changed texts only
python src/build/make-audio.py --force   # everything again
python src/build/make-audio.py --dry-run # print what would be spoken
```

It needs the network and Python 3.10 or newer; it is incremental by a hash of
title and what was spoken (reading, or text and captions) recorded in `audio.json`, together with voice, rate and
pronunciation. Settings are the optional `audio` object in `trail.json`, read
by the script only:

| Field | | |
|---|---|---|
| `audio.voices` | object | Voice per language code. Defaults: `de` de-CH-LeniNeural (Swiss Standard German), `en` en-GB-SoniaNeural, `fr` fr-CH-ArianeNeural, `it` it-IT-ElsaNeural. `edge-tts --list-voices` lists them. |
| `audio.rate` | text or object | Speaking speed in edge-tts syntax, one value or one per language code. Default `-5%`. |
| `audio.captions` | true | The draft speaks the photos' captions after the text, for the items without a reading. Without it, the draft leaves them out. |
| `audio.say` | object | Pronunciation: written text → text to speak, where the voice gets a word wrong (`"km"` → `"Kilometer"`). A value may itself be an object by language code, where the words differ (`"St.": { "de": "Sankt", "en": "Saint" }`). |

`npm run check` reports per language how many items have audio, the size, the
items spoken from a reading, the items whose text or reading changed since the
speech was made (run the script again) and the items without audio.

### recordings

Purpose: where a publisher has recordings of real voices for a station,
several of them and about more than its text (a listening post on the ground,
an interview, a bird's call), the visitor hears them from the card. The
`audio.<lang>.mp3` slot holds the text spoken, one file to a language; these
are the rest. `recordings` in `station.json` (in `trail.json` for item 0) lists them in order:

```
"recordings": [
  { "title": { "de": "Der Biber als Schlüsselart", "en": "The beaver as a keystone species" }, "file": "biber.mp3" },
  { "title": { "de": "…" }, "url": "https://publisher.example/audio/eisvogel.mp3", "lang": "gsw" }
]
```

`title` is required, a text. `file` is an audio file next to `station.json`,
built into the site like a photo; or `url`, an https address the recording is
played from where it is, the publisher's own server (the site then depends on
it, and the publisher's terms decide whether that is allowed). `lang` is the
language spoken, the trail's source language where it is missing; a recording
has one language and is offered in every language of the card.

The card lists them after the text, before the photos, under "Aufnahmen"
("Recordings"): one row each, its title the play button, its length beside
it, the position slider under it once started. Where the language spoken isn't
the card's, the heading says which ("Recordings in German"), or, where they
differ among themselves, each row. They play through the card's one audio, as
the text's speech does (docs/design/surface.md, Listening): starting one stops
the other, leaving the card stops it, the lock screen names the recording.
Not spoken by make-audio.py, not counted as the item's audio; `npm run check`
lists how many each item has.

### The walk's start and end

Purpose: a visitor knows the way they will walk, from where they arrive to
where they leave, and how long it is, as the publisher states it.

A trail's walk need not begin at station 1 and end at the last: one starts
at an overview board by a car park and walks out to station 1, one loops
back to where it began, one runs from a railway station to another. Where
the walk begins or ends apart from those stations, `start` and `end` in
`trail.json` say where, and the route (below) includes the way from the
start to station 1 and from the last station to the end. The site then
shows the whole walk: on the map the route from the start, which the
waymark marks (a tap opens item 0); under "Start bei 1" the way to station
1; at the last station, in the place of "Next", the way on to the end
("weiter zum Start"); in item 0, the start and the end by name ("Ziel:
beim Start"); and in each station after the first the walking time to the
end (from station 1 the walk ahead is the whole walk, whose time item 0
gives), which on a walk back to its start is named as the rest of the way.
Where the end is the start, the words say where the walk goes on, not
"zurück zum Start": "back" reads as the way just come, and at station 2
the time back to the start as the few minutes just walked. An end of its
own has no mark on the map: the route ends there.

The trail's length and walking time are the publisher's where `trail.json`
states them (`length`, `duration`), else derived from the route from start
to end. A printed figure and a routed one often differ (a leaflet's 3.7 km
routed over OSM as 3.4 km); the publisher's is what the visitor has seen on
the leaflet and the signs.

### Arrival points

Purpose: a visitor finds on the map how to get to the trail and away from
it: the railway station, the bus stops, a lift, a car park, wherever the
trail's own material points them, so that one coming by train or bus, or
leaving mid-trail, sees where that is in relation to the stations.

`gettingThere` says it in words, and the walk's start (above) is one place
on the map. A trail often has more: a station at each end, a stop by the
third station where the bus runs, a lift from the river up to the railway
station halfway along. `arrivals` in `trail.json` lists them, each one
mark on the map (docs/design/surface.md, Arrival points):

```
"arrivals": [
  { "kind": "train", "name": { "de": "Baden" }, "position": [8.307776, 47.476408], "source": "osm" },
  { "kind": "lift", "name": { "de": "Lift zum Bahnhof" }, "position": [8.30942, 47.475695],
    "note": { "de": "Von der Limmat hinauf zum Bahnhof." },
    "link": { "label": { "de": "Betriebszeiten" }, "url": "https://…" }, "source": "osm" }
]
```

- `kind`, required: `train` (a railway station), `bus` (a bus stop),
  `lift`, `parking`. It picks the mark's pictogram and the word for it
  ("Bahnhof", "Bushaltestelle"); a kind more is a pictogram more in
  `app/on-map.ts` and a word in `app/strings.ts`.
- `name`, required, text: as the timetable names the stop, so it can be
  found there ("Baden", "Mellingen, Lindenplatz").
- `position`, required: `[longitude, latitude]`, where the visitor gets on
  or off: the station or the stop's platform, the lift's door.
- `note`, text: a line more, in the trail's words: which lines stop, where
  the lift leads.
- `link`: `{ "label": text, "url": "…" }`, where the visitor finds more:
  a timetable, the lift's hours.
- `source`: where the position comes from (Sources, below): `"osm"` for a
  stop taken from OpenStreetMap.

OpenStreetMap maps stations, stops, lifts and car parks;
`build/route-trail.py arrivals [radius]` lists those within the radius
(400 m) of a station, with positions to copy and the distance to the nearest
station. Which of them a visitor needs is the trail's call, not the map's. The walk's start, where it
is a station or a stop, stays the `start`: it is the walk's, and the waymark
marks it. `npm run check` prints each arrival point's distance to the
nearest station, where swapped coordinates show as an unlikely figure.

### route.geojson

A GeoJSON FeatureCollection of LineStrings or MultiLineStrings: one line
per leg, as `build/route-trail.py` writes it, or one ordered line, or any
number of unordered fragments. It is drawn as it is, except that
a stretch it passes twice (there and back) is drawn once, so its dashes stay
dashes. The legs, from each stop to the next (the highlight on the map, the
distance in the card), are the lines themselves where every feature is a
LineString naming its leg's stops in its properties, `from` and `to`
(numbered as below); a leg with no line is a straight one. From any other
route the build derives them: it joins the fragments into one network, bridging gaps of up
to 60 m between a fragment's end and another fragment, attaches each station
at its nearest point on it, and takes the shortest path; the same for the
way from the walk's start to station 1 and from the last station to its
end, where the trail has them (above), counted as legs from 0 and to n + 1. A line
whose last point is its first is a loop, and the way back to its start
goes on there. Where no path
exists, the leg is a straight line and the check says so. The trail's
derived length is the sum of its legs, from the start to the end. A
feature's properties name where its line and its heights come from
(`source`, `heightSource`: Sources, below); `build/route-trail.py` writes
both.

Where every point carries a height (a third coordinate, metres), each leg
also gets a walking time, and the trail its total: item 0 shows the total
where `trail.json` states no `duration`, each station the time from it to
the walk's end, and "Next" the leg's. A visitor who knows their pace against it
scales it themselves, and one who joins mid-trail or walks the other way
derives their own time from the total and the time left; the site offers
the figures to derive from and adapts to no one. The pace is the Swiss
yellow signposts' (`build/walk-time.ts`: 4.2 km/h on the level, slowed by
slope), because walkers here already know their ratio to those times;
without stops. Totals of several legs are rounded to 5 minutes as signposts
are, a single leg to the minute wherever it stands (the last station's way
back to the start among them). `build/route-trail.py heights` adds the heights from
swisstopo's terrain model (swissALTI3D, through its profile service) with a
point at least every 10 m, and runs after every `route`; terrain is the
ground below a bridge and the hill above a tunnel, so where OSM tags the
path as either, the height runs straight across. The service covers
Switzerland and some way beyond (Munich answers, Paris doesn't); where it
has no height, `heights` stops, the route keeps none, and the site shows no
walking times. A fork elsewhere can bring heights from another source as
the third coordinate.

#### Routing the legs over real paths

A printed map's route is intent: hand-drawn, schematic, and a traced copy of it
follows the drawing, not the paths people walk (one ran along a road for
cars where pedestrians take a footpath under a bridge). A visitor uses the line
to find the next station, so it has to be what is walked. `build/route-trail.py`
(Python 3.10+, Node 22.18+, `pip install pillow` for the pictures) does that
from the stations and OpenStreetMap:

1. Put the traced route in the folder as `route-trace.geojson` (optional),
   give the walk's `start` and `end` in `trail.json` where they aren't
   stations, and place each station where its sign stands, as surveyed, else at the printed
   map's pin: visitors use the map to find the sign, and the sign leads them
   on to the object (station.json, Objects); a trail without signs places it
   on the object it names.
   `view N` shows station N over the map and the aerial side by side
   (below), with OSM's named things; where a path runs under tree canopy the
   two together show it.
   `place N lon lat` moves a station.
2. `fetch` downloads the OSM paths around the trail (cached in `.cache/route/`,
   git-ignored). `route` routes every leg over them: footways and steps are
   cheapest, streets cost more, roads with no foot access are closed, and a
   path far from the trace costs more, so the trace only decides between
   paths that exist. It writes `route.geojson` as one line per leg, which
   the build takes as it is: legs derived from a merged line would attach a
   station on a stretch walked twice to whichever pass is nearest, and the
   bridging of fragment ends makes shortcuts through blocks.
3. `verify` compares the build's legs with what was routed; `render` draws every leg over the map
   (`--aerial` over the aerial, `--osm` with the OSM paths) for someone who
   knows the ground to check. `explain A-B` lists the OSM ways a leg runs on.
4. A correction goes into `legspec.json` and `route` runs again: `via`
   (the leg passes these points), `avoid` (it keeps out of these circles),
   `attach` (where a station meets the path, when its nearest path is not the
   one to walk). Legs and stops are numbered as the build numbers them: the
   start is 0 and the end n + 1, so `"0-1"` is the way to station 1. The file is the record of what a person who knows the ground said; every
   leg is routed again from it and the trace.

The pictures are drawn on the trail's raster basemaps (`map.basemaps` entries
with `tiles`): the first is the map, the next the aerial (on swisstopo, the
Landeskarte and the Luftbild). A trail without a raster basemap is drawn on
OpenStreetMap's map and has no aerial. The routing works wherever OSM maps the
paths.

## Sources

Purpose: every source whose data or work the site shows is credited as its
terms can be expected to require, and the credit follows the data: when a
source's data comes into a trail or leaves it, its credit comes or goes
with it, without anyone keeping a list by hand.

A trail's site shows others' work: the basemaps; the route, routed over
OpenStreetMap's paths; heights from swisstopo's terrain model, from which
the walking times come; stations' objects drawn from OSM's shapes, an old
map or a plan; pictures. Their terms ask for a credit: OSM's licence (ODbL)
"© OpenStreetMap contributors" where the map shows its data, swisstopo's
free geodata the source named, Creative Commons the author and the licence.
Such data comes into a trail in a few places, most of it written by a tool,
and leaves it by being replaced; a credit kept by hand in the footer
outlives the data it was for, and misses data that came later.

So data names its source where it sits, by a key, and the site credits the
sources named, and only those:

| Where | Field | What of the site |
|---|---|---|
| `route.geojson`, a feature's `properties` | `source` | The route. `build/route-trail.py route` writes `"osm"`. |
| `route.geojson`, a feature's `properties` | `heightSource` | The heights, and so the walking times. `build/route-trail.py heights` writes `"swisstopo"`. |
| `station.json` | `object.source` | The station's object. |
| `trail.json` | `arrivals[].source` | An arrival point's position. |
| `trail.json` | `map.basemaps[].source` | A basemap. Its source's credit is its attribution where it gives none. |

The engine knows `osm` and `swisstopo` (`build/sources.ts`). Any other
source, a museum's map, the trail declares in
`trail.json` `sources`: `{ "<key>": { "credit": text, "url": "…" } }`, the
credit as the source asks for it (a text per language, or one string for
all) and where it links; a declared key that is the engine's rewords it.
A key that is neither is an error. What names no source is credited to
none, which is right for the publisher's own (a route traced from its map,
a shape from its plan).

Some sources may be used only as information. The Swiss cadastral maps
(amtliche Vermessung) are given "ausschliesslich zu Informationszwecken":
a shape drawn with one as reference is the trail's own and names no
source, while copying the map's shapes is not allowed.

The site shows the credits in two places. The map's attribution line
credits the basemap on show and the sources of what the trail draws on it
(the route, the objects, the arrival points), each once: a source whose basemap is on is
credited by the basemap (the engine's default basemap credits OSM). At the
end of the overview, after the trail's footer, the engine's line names
every source of the trail's data but the basemaps, which the map credits
while they show, and what of the site each gave: "Data: © OpenStreetMap
contributors (route, the stations' objects); © swisstopo (heights for the
walking times)".

Pictures are credited one by one, in their own fields (station.json,
`images`): Creative Commons asks for the licence's address or text, and a
link to the work where that is reasonably practicable, which a licence the
engine knows and a picture's `page` give. The footer is the trail's own words, who stands
behind it; a credit written there for data that names its source is a
second one, which stays when the data goes.

`npm run check` prints which sources are credited and for what, what could
name a source and names none, and declared sources no data names.

## Building and checking

In `src/`: `npm run check` loads the folder as the build would, reports
errors by file and field, and prints each leg's length, each station's
distance to the route, the gaps it bridged, and the map's bounds, so a wrong join shows before
it shows on the map. It also lists the fields the format doesn't know, most
likely typos; they are ignored, and the build warns about them too. `npm run dev` serves the site and reloads when a file
in the folder changes; `npm run build` writes it to `src/dist/`.

On a phone in the same network, location and the compass need a secure page,
which `http://<computer>:5173` is not. `npm run dev:https` serves the same
site over https on port 5443, beside `npm run dev`, with a self-signed
certificate: the phone warns once that the connection is not private (go on
via Advanced, or Show Details on iOS), and the certificate is kept between
starts (`src/node_modules/.vite-https/`), so it stays accepted until
node_modules is renewed or a year has passed. Vite prints the address to
open (`Network: https://…:5443/`).

The build uses the only folder under `trails/` that has a `trail.json`,
and the demo's in `demo/` while there is none; with several, the
environment variable `THEMENWEG_TRAIL` names one (a folder name under
`trails/` or `demo/`, or a path, relative to the repository). The GitHub Pages workflow reads it from the repository
variable of the same name, `npm run deploy` from `secrets/cloudflare.env`,
or from the file of the target it is given (secrets/README.md).

## Not known

- How a trail's look holds in sun on real phones.
- Whether the marking per language is fine enough once people review only
  some of a language's texts, and whether the note above every card is more
  than a visitor needs after seeing it once.
- Whether a translation outlives a change to the source text: the speech
  records a hash of its source and the check says when it is out of date,
  translations have no such record.
- How the voices sound when a voice of another language reads the source
  language's names.
- Whether leg distances from a traced route are close enough to guide by.
  Routed over OSM paths
  (above) the legs follow what pedestrians walk, but only a person who knows
  the ground can say so: the pictures from `render` are for that.
- How close the walking times come to the signposts the visitor passes:
  the constants are those swisstopo's map viewer uses (the Schweizmobil
  variant of the Wanderwege formula: slope over 10 m steps, its polynomial
  within ±40 %, linear beyond), the official ones are not published; and
  the terrain model at 2 m can make a wall or an embankment beside the
  path into a climb. Beyond the border the
  conversion to Swiss coordinates (swisstopo's approximate formulas) grows
  less exact, and so may the heights.
- How the map's attribution line holds beside the basemap choice on a
  narrow phone: at 360 px, two credits in German reach over the choice's
  right end (seen in a headless browser).
- Where OSM lacks a path that exists (a riverside walkway, a track under
  canopy), the router cannot take it; the leg then follows the paths that are
  mapped.
