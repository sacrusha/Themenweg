# The trail's brand

## Purpose

The site wears the trail's design, not Themenweg's: it replaces carrying the
leaflet (backlog, version 2), so it reads as the same trail as the leaflet
and the signs on the ground. Themenweg's own mark is one footer line. What
makes the look one trail's lives in its folder; the engine carries what any
trail's look can use.

## Situation

- The screen is used outdoors, in sun, one-handed, by untrained visitors
  (docs/design/surface.md). Print colours that work at sign size can fail
  on a phone: a light print green can carry white text at little more than
  2:1.
- A trail's printed typeface is often licensed and can't be bundled; a free
  face with its metrics can stand in where the device lacks it, within that
  face's licence.
- Phones are set to dark by their owners, always or from sunset, and some
  browsers darken pages by their own rules (docs/design/robustness.md).
  Print has no dark version, and basemaps are mostly light.

## How the site meets it

The engine gives every trail: two colours from `trail.json` `theme`
(markers, route, buttons, favicon); a sign label that opens each station
card the way its sign names it, with the trail's mark beside it; a cover
photo for item 0, the mark on it; a footer of logos
and text at the end of item 0, with "Gebaut mit Themenweg" as the last line
below it; photos as one group (the first large, the rest as insets, one
credits line); and a trail stylesheet, `theme.css`, loaded after the
engine's (docs/design/trail-content.md).

### Dark

Purpose: the site follows the visitor's preference; set to dark, they get
a dark site that is still the trail's, not one a browser has darkened by
its own rules.

The site follows the device's setting, and changes with it while open;
there is no switch, which would be one more thing to learn
(docs/design/surface.md).

- The sheet and the controls over the map turn: a green-black paper, light
  text, the same layout and sizes.
- The map stays the map, at full strength: outdoors, in sun, its contrast
  matters most, and the phone's brightness already follows the light
  around it. The route, the markers and the visitor's dot keep their light
  colours on it. What sits on the map is drawn as part of it: it is painted on
  canvas, as the map is, from colour tokens that are the same in both
  schemes (`--marker`, `--prev`, `--next`, `--you` and their kin), and
  the page elements over it carry only what a page element gives, a
  button, its label, the focus ring, the touch target
  (src/app/on-map.ts). So the site's own dark can't reach it, and
  neither can a browser that darkens pages by its own rules
  (docs/design/robustness.md).
- The trail's two colours: `accentDark` carries white text on buttons in
  both. Where the accent is text or a line on paper (the sign label,
  links, focus), dark uses `accent` itself if it reads at 6:1 on the dark
  paper, else `accent` lightened until it does; the engine derives it, so
  a trail gives no third colour. The visitor's blue, an engine colour,
  is a lighter blue where it is text or an icon in the sheet.
- Logos are drawn for paper: in the footer each sits on its own white
  plate. The trail's mark is not plated: it already has to stand on the
  cover photo.

## Not known

- How a trail's look holds in sun on real phones, and the dark look in
  daylight, for a phone set to dark all day.
- Whether swisstopo offers a dark style of its vector basemap; the site
  would need a basemap field for a dark variant to use one.
