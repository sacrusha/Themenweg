// Side-by-side layout: the card column's width limits.
//
// Starting values. The real limits per aspect ratio are open
// (docs/design/surface.md, Not known); they live here so that finding them
// changes one place.

/** The card stays wide enough for its title, fields and orientation row. */
const CARD_MIN = 300;
/** Wider than this, lines pass a comfortable reading measure. */
const CARD_MAX = 720;
/** The map keeps at least this share of the width ... */
const MAP_MIN_SHARE = 0.4;
/** ... and at least this many pixels. */
const MAP_MIN = 320;
/** Where the divider starts, and returns to on double-click: this share of the width ... */
const CARD_DEFAULT_SHARE = 0.34;
/** ... and where the limits leave room, wide enough for the trail's name on the overview's button (style.css, .go-overview). */
const CARD_DEFAULT_MIN = 360;

export function cardLimits(width: number): { min: number; max: number } {
  const max = Math.min(CARD_MAX, width - Math.max(MAP_MIN, width * MAP_MIN_SHARE));
  return { min: CARD_MIN, max: Math.max(CARD_MIN, max) };
}

export function cardDefault(width: number): number {
  return clampCard(Math.max(CARD_DEFAULT_MIN, width * CARD_DEFAULT_SHARE), width);
}

export function clampCard(w: number, width: number): number {
  const { min, max } = cardLimits(width);
  return Math.round(Math.max(min, Math.min(max, w)));
}
