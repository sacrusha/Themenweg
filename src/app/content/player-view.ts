// The content framework's view of the shell's audio: player.ts binds any
// `.player[data-audio]` in the card by these classes; a view may leave parts
// out.

import "./player.css";
import type { Strings } from "../strings.ts";
import { attr, esc } from "../html.ts";
import type { Track } from "./context.ts";

export const playIcon = `<svg class="player-icon player-icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>`;
export const pauseIcon = `<svg class="player-icon player-icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/></svg>`;

/** One of a list of recordings: its title is the button, its length beside it, the position slider under it once started; `tag` follows the title (the language spoken, where it differs from the card's). */
export function renderRecording(t: Track, s: Strings, tag = ""): string {
  return `<li class="player player-row" data-state="idle" data-audio="${attr(t.url)}" data-label="${attr(t.label)}"${t.art ? ` data-art="${attr(t.art)}"` : ""}>
    <button type="button" class="player-toggle"><span class="player-icons">${playIcon}${pauseIcon}</span><span class="player-row-title">${esc(t.label)}${tag ? ` <span class="player-row-tag">${esc(tag)}</span>` : ""}</span></button>
    <span class="player-time" aria-hidden="true"></span>
    <input class="player-seek" type="range" min="0" max="0" step="1" value="0" disabled aria-label="${attr(`${s.position}: ${t.label}`)}" />
    <p class="player-error" role="alert" hidden>${s.audioError}</p>
  </li>`;
}

/** The controls for one track. */
export function renderPlayer(t: Track, s: Strings): string {
  return `<div class="player" data-state="idle" data-audio="${attr(t.url)}" data-label="${attr(t.label)}"${t.art ? ` data-art="${attr(t.art)}"` : ""}>
    <button type="button" class="player-toggle" data-peek>${playIcon}${pauseIcon}<span class="player-toggle-label">${s.listen}</span></button>
    <span class="player-progress">
      <span class="player-time" aria-hidden="true"></span>
      <input class="player-seek" type="range" min="0" max="0" step="1" value="0" disabled aria-label="${attr(s.position)}" />
    </span>
    ${t.synthetic ? `<p class="player-note">${s.syntheticVoice}</p>` : ""}
    <p class="player-error" role="alert" hidden>${s.audioError}</p>
  </div>`;
}
