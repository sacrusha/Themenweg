// The content framework's card body (docs/design/layers.md): the blocks a
// trail's data fills in. Station: the player, the sign row, the
// machine-translation note, the fields, the text, the recordings, the photos.
// Item 0: the player, the cover, the subtitle, the note, the text, the
// recordings, the facts, the station list (the shell's), photos, links,
// publisher and footer. A trail's theme.css restyles these classes.

import type { Image, Item, Localized, Logo } from "../trail-types.ts";
import { formatDistance, formatMinutes, type Strings } from "../strings.ts";
import { attr, esc } from "../html.ts";
import type { BodyContext } from "./context.ts";
import { renderPlayer, renderRecording } from "./player-view.ts";

export function renderBody(ctx: BodyContext): string {
  // The first row is what the peek shows (docs/design/surface.md, Depth).
  const player = ctx.track ? renderPlayer(ctx.track, ctx.s) : "";
  return ctx.item.n === 0 ? player + overviewBody(ctx) : stationBody(ctx, player);
}

function stationBody(ctx: BodyContext, player: string): string {
  const { trail, item, tx, s } = ctx;
  const fields = trail.stationFields
    .filter((f) => tx(item.fields[f.key]))
    .map((f) => `<div class="field"><dt>${esc(tx(f.label))}</dt><dd>${esc(tx(item.fields[f.key]))}</dd></div>`)
    .join("") + toEnd(ctx);
  // The station named as its sign names it, so a visitor at the sign sees they have the right card.
  const sign = tx(trail.signLabel);
  const signRow = sign ? `<div class="sign-row" data-peek><p class="sign-label">${sign.replace("{n}", String(item.n))}</p></div>` : "";
  return `
    ${player}${signRow}
    ${ctx.machineNote}
    ${fields ? `<dl class="fields">${fields}</dl>` : ""}
    ${tx(item.body) ? `<div class="prose">${tx(item.body)}</div>` : ""}
    ${recordings(ctx)}
    ${figures(item, tx, s)}`;
}

/**
 * The publisher's recordings, after the text: one row each, played by the
 * shell's audio like the item's own. The language spoken is named where it
 * isn't the card's: in the heading when all share one, else after each title.
 */
function recordings({ item, lang, tx, s }: BodyContext): string {
  const list = item.recordings;
  if (!list.length) return "";
  const name = (code: string) => {
    let n = code;
    try {
      n = new Intl.DisplayNames([lang], { type: "language" }).of(code) ?? code;
    } catch {
      /* an unknown code: show it as it is */
    }
    return n;
  };
  const langs = new Set(list.map((r) => r.lang));
  const one = langs.size === 1 ? list[0].lang : undefined;
  const heading = one && one !== lang ? s.recordingsIn.replace("{lang}", name(one)) : s.recordings;
  const art = item.images[0]?.url;
  const rows = list.map((r) => {
    const tag = !one && r.lang !== lang ? name(r.lang) : "";
    return renderRecording({ url: r.url, label: tx(r.title), art }, s, tag && tag.charAt(0).toLocaleUpperCase(lang) + tag.slice(1));
  });
  return `<section class="recordings"><h2>${esc(heading)}</h2><ul class="recordings-list">${rows.join("")}</ul></section>`;
}

/**
 * The walking time from this station to the walk's end (the trail's end, else
 * the last station), at the pace of item 0's: a visitor who joins mid-trail,
 * or walks it the other way, derives their own from it and the total. Several
 * legs rounded to 5 minutes, as signposts round totals; a single leg to the
 * minute, as under "Next". None where no leg leads on or legs lack times.
 */
function toEnd({ trail, item, s }: BodyContext): string {
  const last = trail.items.length - 1;
  const legs = trail.legs.filter((l) => l.from >= item.n);
  if (!legs.length || legs.some((l) => l.minutes === undefined)) return "";
  const minutes = legs.reduce((sum, l) => sum + l.minutes!, 0);
  const label = !trail.end ? s.walkTimeTo.replace("{n}", String(last)) : trail.end === "start" ? s.walkTimeBack : s.walkTimeToEnd;
  return `<div class="field"><dt>${esc(label)}</dt><dd>${s.approx} ${formatMinutes(minutes, legs.length > 1 ? 5 : 1)}</dd></div>`;
}

function overviewBody(ctx: BodyContext): string {
  const { trail, item, lang, tx, s } = ctx;
  const facts: [string, string][] = [];
  if (tx(trail.lengthStated)) facts.push([s.length, esc(tx(trail.lengthStated))]);
  else if (trail.length) facts.push([s.length, `${s.approx} ${formatDistance(trail.length, lang, s)}`]);
  if (tx(trail.duration)) facts.push([s.duration, esc(tx(trail.duration))]);
  else if (trail.minutes !== undefined)
    facts.push([s.walkTime, `${s.approx} ${formatMinutes(trail.minutes, 5)} <span class="field-note">${s.walkTimeHow}</span>`]);
  facts.push([s.start, trail.start ? esc(tx(trail.start.name)) : `1 · ${esc(tx(trail.items[1].title))}`]);
  if (trail.end) facts.push([s.end, trail.end === "start" ? s.backToStart : esc(tx(trail.end.name))]);
  if (tx(trail.gettingThere)) facts.push([s.gettingThere, tx(trail.gettingThere)]);

  const links = trail.links.length
    ? `<h2>${s.links}</h2><ul class="links">${trail.links
        .map((l) => `<li><a href="${attr(l.url)}" target="_blank" rel="noopener">${esc(tx(l.label))}</a></li>`)
        .join("")}</ul>`
    : "";

  const cover = trail.cover;
  const coverCredit = cover ? creditHtml(cover, true) : "";
  const logos = trail.footer.logos.map((l) => logo(l, tx)).join("");
  const footerText = tx(trail.footer.text);

  return `
    ${cover ? `<figure class="cover">
        <img src="${attr(cover.url)}" alt="${attr(tx(cover.alt) || s.photo)}"${cover.width ? ` width="${cover.width}" height="${cover.height}"` : ""} />
        ${coverCredit ? `<figcaption class="photo-credits">${coverCredit}</figcaption>` : ""}
      </figure>` : ""}
    ${tx(trail.subtitle) ? `<p class="lead">${esc(tx(trail.subtitle))}</p>` : ""}
    ${ctx.machineNote}
    ${tx(item.body) ? `<div class="prose">${tx(item.body)}</div>` : ""}
    ${recordings(ctx)}
    <dl class="fields facts">${facts.map(([k, v]) => `<div class="field"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    <h2>${s.stations}</h2>
    ${ctx.stations}
    ${figures(item, tx, s)}
    ${links}
    ${tx(trail.publisher) ? `<p class="publisher"><span>${s.publisher}</span> ${esc(tx(trail.publisher))}</p>` : ""}
    ${logos || footerText ? `<footer class="trail-footer">
        ${logos ? `<div class="trail-logos">${logos}</div>` : ""}
        ${footerText ? `<div class="trail-footer-text">${footerText}</div>` : ""}
      </footer>` : ""}`;
}

/**
 * An item's photos as one group: the first is the lead photo, the rest are
 * insets after it, and one credits line names who took which. Each photo
 * carries data-shape (square, portrait, landscape) for a trail's stylesheet.
 */
function figures(item: Item, tx: (l?: Localized) => string, s: Strings): string {
  if (!item.images.length) return "";
  const fig = (im: Image, lead: boolean) => {
    const cap = tx(im.caption);
    const shape = !im.width || !im.height
      ? ""
      : Math.abs(im.width / im.height - 1) < 0.03 ? "square" : im.width > im.height ? "landscape" : "portrait";
    return `<figure class="photo${lead ? " photo-lead" : ""}"${shape ? ` data-shape="${shape}"` : ""}>
        <img src="${attr(im.url)}" alt="${attr(tx(im.alt) || s.photo)}" loading="lazy"${im.width ? ` width="${im.width}" height="${im.height}"` : ""} />
        ${cap ? `<figcaption>${cap}</figcaption>` : ""}
      </figure>`;
  };
  const [lead, ...insets] = item.images;
  return `<div class="photos">
      ${fig(lead, true)}
      ${insets.length ? `<div class="photo-insets">${insets.map((im) => fig(im, false)).join("")}</div>` : ""}
      ${photoCredits(item.images, tx, s)}
    </div>`;
}

function logo(l: Logo, tx: (l?: Localized) => string): string {
  const img = `<img src="${attr(l.url)}" alt="${attr(tx(l.alt))}"${l.width ? ` width="${l.width}" height="${l.height}"` : ""} />`;
  return l.href ? `<a href="${attr(l.href)}" target="_blank" rel="noopener">${img}</a>` : img;
}

/**
 * "Photos: A" when one credit covers all, else "Photos: A (caption, caption);
 * B (caption)". Where pictures name the page they are published on, a lone
 * picture's credit links there, and several are named by caption, each
 * linking to its own; a licence the engine knows links to its text. Captions
 * are HTML (vite.config.ts).
 */
function photoCredits(images: Image[], tx: (l?: Localized) => string, s: Strings): string {
  const each = images.map((im) => [im.credit, im.license].filter(Boolean).join(", "));
  if (!each.some(Boolean)) return "";
  let html: string;
  if (images.length === 1) html = creditHtml(images[0], true);
  else if (each.every((c) => c === each[0]) && !images.some((im) => im.page)) html = creditHtml(images[0], false);
  else {
    const byCredit = new Map<string, { im: Image; caps: string[] }>();
    images.forEach((im, i) => {
      if (!each[i]) return;
      const cap = tx(im.caption) || `${s.photo} ${i + 1}`;
      const group = byCredit.get(each[i]) ?? { im, caps: [] };
      group.caps.push(im.page ? `<a href="${attr(im.page)}" target="_blank" rel="noopener">${cap}</a>` : cap);
      byCredit.set(each[i], group);
    });
    html = [...byCredit.values()].map(({ im, caps }) => `${creditHtml(im, false)} (${caps.join(", ")})`).join("; ");
  }
  return `<p class="photo-credits">${s.photos}: ${html}</p>`;
}

/** A picture's credit and licence as HTML: the credit linked to the picture's page where `linkPage` and it has one, the licence to its text where the engine knows it. */
function creditHtml(im: Image, linkPage: boolean): string {
  const link = (href: string | undefined, text: string) => (href ? `<a href="${attr(href)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
  return [im.credit && link(linkPage ? im.page : undefined, im.credit), im.license && link(licenseUrl(im.license), im.license)].filter(Boolean).join(", ");
}

/** The text of a Creative Commons licence or dedication named as its deeds name it ("CC BY-SA 4.0", "CC BY 3.0 de", "CC0"). */
function licenseUrl(name: string): string | undefined {
  if (/^CC0( 1\.0)?$/i.test(name.trim())) return "https://creativecommons.org/publicdomain/zero/1.0/";
  const m = /^CC (BY(?:-NC)?(?:-SA|-ND)?) (\d\.\d)(?: ([a-z]{2}))?$/i.exec(name.trim());
  return m ? `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${m[3] ? `${m[3].toLowerCase()}/` : ""}` : undefined;
}
