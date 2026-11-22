# Dark

## Purpose

The site follows the visitor's preference: set to dark, they get a dark
site that is still the trail's, not one a browser has darkened by its own
rules.

## Situation

- Phones are set to dark by their owners, always or from sunset, and some
  browsers darken pages by their own rules (docs/design/robustness.md).
- A trail's colours often come from print, which has no dark version, and
  basemaps are mostly light.
- The screen is used outdoors, in sun, one-handed, by untrained visitors
  (docs/design/surface.md).

## How the site meets it

The site follows the device's setting, and changes with it while open;
there is no switch, which would be one more thing to learn
(docs/design/surface.md).

- The sheet and the controls over the map turn: a green-black paper, light
  text, the same layout and sizes.
- The map stays the map, at full strength: outdoors, in sun, its contrast
  matters most, and the phone's brightness already follows the light
  around it. The route, the markers and the visitor's dot keep their light
  colours on it. What sits on the map is drawn as part of it: it is painted
  on canvas, as the map is, from colour tokens that are the same in both
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
  a trail gives no third colour.
- Logos are drawn for paper: in the footer each sits on its own white
  plate.

## Not known

- How the dark look holds in daylight, for a phone set to dark all day.
- Whether swisstopo offers a dark style of its vector basemap; the site
  would need a basemap field for a dark variant to use one.
