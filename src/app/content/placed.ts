// Pictures a text places where it speaks of them (docs/design/trail-content.md,
// text.<lang>.md): the build leaves a placeholder for each in the text's HTML
// (build/trail.ts), the card puts the picture there (body.ts).

/** The placeholder for the item's i-th picture. */
export const placeholder = (i: number): string => `<figure data-image="${i}"></figure>`;

/** Placeholders with nothing but space between them: one run, shown together. */
export const PLACED_RUN = /(?:<figure data-image="\d+"><\/figure>\s*)+/g;

/** The pictures a text's HTML places, in its order. */
export function placedIn(html: string): number[] {
  return [...html.matchAll(/<figure data-image="(\d+)"><\/figure>/g)].map((m) => Number(m[1]));
}
