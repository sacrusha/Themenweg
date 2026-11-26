// The card for one item: head (always visible), body, end.
// The head and the end are the shell's; the body is the content framework's
// (content/, docs/design/layers.md), given the item and what the shell has
// prepared for it (content/context.ts). Pure rendering; main.ts wires the
// buttons (data-go = item number to select, data-walk = the site-initiated
// "walk on" that also collapses the sheet).

import type { Leg, Trail } from "./trail-types.ts";
import { formatDistance, formatMinutes, type Strings } from "./strings.ts";
import { pickAudio } from "./player.ts";
import { languageRow, machineNote, textFor } from "./language.ts";
import { attr, esc } from "./html.ts";
import type { BodyRenderer, Track } from "./content/context.ts";
import { renderBody } from "./content/body.ts";
import { dataCredits } from "./credits.ts";

export interface CardParts {
  /** The item's audio, for the shell's player (the card's views, the lock screen). */
  track?: Track;
  head: string;
  body: string;
  end: string;
  label: string;
}

export function renderCard(trail: Trail, n: number, lang: string, s: Strings, body: BodyRenderer = renderBody): CardParts {
  const tx = textFor(trail, lang);
  const item = trail.items[n];
  const last = trail.items.length - 1;
  const next = n < last ? trail.items[n + 1] : undefined;
  const prev = n > 0 ? trail.items[n - 1] : undefined;
  const leg = n > 0 ? trail.legs.find((l) => l.from === n) : undefined;

  // The head is short of room: the short title where the language has one,
  // else that language's title; only a title missing in the language falls
  // back to the source's (docs/design/trail-content.md, station.json).
  const short = item.shortTitle[lang] ?? (item.title[lang] ? item.title[lang] : tx(item.shortTitle) || tx(item.title));
  // The selection's look, as its marker shows it (docs/design/surface.md, Depth).
  const badge = `<span class="badge${n > 9 ? " badge-2" : ""}" aria-hidden="true">${n === 0 ? trailGlyph : n}</span>`;
  const heading = n === 0 ? esc(short) : `<span class="sr">${s.station} ${n}: </span>${esc(short)}`;

  // The head's row: previous, the overview, next (docs/design/surface.md, Depth).
  const brand = trail.brandName;
  const overviewBtn = `<button class="go go-overview" data-go="0" aria-label="${attr(brand ? `${s.overview}: ${brand}` : s.overview)}">
      <span class="go-overview-fit">${trailGlyph}<span class="go-overview-name">${esc(brand ?? s.overview)}</span></span>
    </button>`;
  let orient: string;
  if (n === 0) {
    const first = trail.items[1];
    // "10 Stationen" over "ca. 3,5 km", or the length the publisher states: the line breaks between the halves.
    const size = tx(trail.lengthStated) ? esc(tx(trail.lengthStated)) : trail.length ? `${s.approx} ${formatDistance(trail.length, lang, s)}` : "";
    // From a start before station 1, the way to it under "Start bei 1", as under "Next".
    const toFirst = legText(trail.legs.find((l) => l.from === 0), lang, s);
    orient = `
      <span class="orient-info"><span>${s.stationCount.replace("{n}", String(trail.items.length - 1))}</span>${size ? `<span>${size}</span>` : ""}</span>
      <button class="go go-next" data-go="1" aria-label="${attr(`${s.startAt} ${s.station} 1: ${tx(first.title)}${toFirst.text ? `, ${toFirst.text}` : ""}`)}">
        ${toFirst.html ? `<span class="go-label"><span class="go-main"><span>${s.startAt} <b>1</b></span></span>${toFirst.html}</span>` : `<span>${s.startAt} <b>1</b></span>`}${chevron}
      </button>`;
  } else {
    // From station 1 the overview is the way back.
    const prevBtn = prev && n > 1
      ? `<button class="go go-prev" data-go="${n - 1}" aria-label="${attr(`${s.prevTo} ${n - 1}: ${tx(prev.title)}`)}">
          ${chevronLeft}<span>${n - 1}</span>
        </button>`
      : "";
    // The leg's length and, where the route has heights, its walking time:
    // a second line under "Next"; at the last station, the way on to the walk's end.
    const way = legText(leg, lang, s, next ? "" : trail.end === "start" ? s.onToStart : s.toEnd);
    const nextBtn = next
      ? `<button class="go go-next" data-go="${n + 1}" aria-label="${attr(`${s.nextTo} ${n + 1}: ${tx(next.title)}${way.text ? `, ${way.text}` : ""}`)}">
          <span class="go-label"><span class="go-main"><span class="go-word">${s.next} </span><b>${n + 1}</b>${chevron}</span>${way.html}</span>${chevron}
        </button>`
      : `<span class="orient-info orient-last"><span>${s.lastStation}</span>${way.html}</span>`;
    orient = prevBtn + overviewBtn + nextBtn;
  }

  const label = n === 0 ? tx(item.title) : `${n} · ${tx(item.title)}`;
  const audio = pickAudio(trail, item, lang);
  // The lock screen cuts a long name off too.
  const track: Track | undefined = audio && { url: audio.url, label: n === 0 ? short : `${n} · ${short}`, art: item.images[0]?.url, synthetic: audio.synthetic };

  const head = `
    <div class="grabber" aria-hidden="true">${__THEMENWEG_DEMO__ ? `<span class="demo-tag">${s.demo}</span>` : ""}</div>
    <nav class="orient${n === 0 ? " orient-start" : ""}" aria-label="${attr(s.stations)}">${orient}</nav>
    <div class="title-row">
      <h1 class="title">${badge}${heading}</h1>
      <div class="title-slot">${languageRow(trail, lang, s)}</div>
    </div>`;

  // The station list is navigation, the shell's; the overview's body places it.
  const stations =
    n === 0
      ? `<ol class="station-list">${trail.items
          .slice(1)
          .map((st) => {
            const sub = trail.stationFields.map((f) => tx(st.fields[f.key])).find(Boolean);
            return `<li><button class="station-link" data-go="${st.n}">
        <span class="badge badge-small" aria-hidden="true">${st.n}</span>
        <span><span class="station-link-title">${esc(tx(st.title))}</span>${sub ? `<span class="station-link-sub">${esc(sub)}</span>` : ""}</span>
      </button></li>`;
          })
          .join("")}</ol>`
      : "";
  const bodyHtml = body({ trail, item, lang, tx, s, track, machineNote: machineNote(trail, item, lang, s), stations });

  let end = "";
  if (next) {
    end = `<button class="walk" data-go="${n + 1}" data-walk="1">
      <span class="walk-label">${n === 0 ? s.startAt : s.next}</span>
      <span class="walk-target"><span class="walk-n">${n + 1}</span> ${esc(tx(next.title))}</span>
      <span class="walk-arrow" aria-hidden="true">→</span>
    </button>`;
  } else {
    end = `<button class="walk walk-quiet" data-go="0"><span class="walk-target">${s.toOverview}</span></button>`;
  }

  // The sources of the trail's data, then the engine's own mark: last on the overview, below the trail's footer.
  if (n === 0) end += dataCredits(trail, lang, s) + `<p class="made-with">${s.madeWith} <span class="themenweg">${trailGlyph}Themenweg</span></p>`;

  return { track, head, body: bodyHtml, end, label };
}

// The viewBox ends at the stroke's ink, so the buttons' gaps alone set the
// spacing and the chevron centres on the letters.
const chevron = `<svg class="chev" viewBox="5 2 7 12" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const chevronLeft = `<svg class="chev" viewBox="4 2 7 12" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// A waymark: a path between three posts.
/** A leg's length and, where the route has heights, its walking time: as the button's second line, and as words for its label. */
function legText(leg: Leg | undefined, lang: string, s: Strings, words = ""): { html: string; text: string } {
  if (!leg) return { html: "", text: "" };
  const dist = formatDistance(leg.length, lang, s);
  const time = leg.minutes !== undefined ? formatMinutes(leg.minutes, 1) : "";
  return {
    html: `<span class="go-leg">${words ? `<span class="go-to">${words}</span> ` : ""}${dist}${time ? `<span class="go-time"> · ${time}</span>` : ""}</span>`,
    text: [dist, time].filter(Boolean).join(", "),
  };
}

const trailGlyph = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 19c3-1 4-5 8-6s5-5 8-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 3.2"/><circle cx="4" cy="19" r="2.2" fill="currentColor"/><circle cx="12" cy="13" r="2.2" fill="currentColor"/><circle cx="20" cy="5" r="2.2" fill="currentColor"/></svg>`;
