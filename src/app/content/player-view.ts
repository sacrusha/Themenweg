// The content framework's view of the shell's audio (player.ts): the large
// "Vorlesen" button with the length beside it, the synthetic-voice note, and
// the position slider, which shows once the recording has been started.
// player.ts binds any `.player[data-audio]` in the card by these classes;
// a view may leave parts out.

import "./player.css";
import type { Strings } from "../strings.ts";
import { attr } from "../html.ts";
import type { Track } from "./context.ts";

export const playIcon = `<svg class="player-icon player-icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>`;
export const pauseIcon = `<svg class="player-icon player-icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/></svg>`;

/** The controls for one track. */
export function renderPlayer(t: Track, s: Strings): string {
  return `<div class="player" data-state="idle" data-audio="${attr(t.url)}" data-label="${attr(t.label)}"${t.art ? ` data-art="${attr(t.art)}"` : ""}>
    <button type="button" class="player-toggle" data-peek>${playIcon}${pauseIcon}<span class="player-toggle-label">${s.listen}</span></button>
    <span class="player-time" aria-hidden="true"></span>
    ${t.synthetic ? `<p class="player-note">${s.syntheticVoice}</p>` : ""}
    <input class="player-seek" type="range" min="0" max="0" step="1" value="0" disabled aria-label="${attr(s.position)}" />
    <p class="player-error" role="alert" hidden>${s.audioError}</p>
  </div>`;
}
