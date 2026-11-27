// A photo on its own (docs/design/trail-content.md, station.json, images):
// over the page, as large as the screen allows, with its caption and credit, where the
// phone's pinch zooms it. It is a history entry, so Back closes it as it
// closes a picture in any phone's gallery; so do a tap and Escape. Where the
// browser has no <dialog> (before iOS 15.4), the link opens the file in a
// new tab as before.

import { attr, esc } from "./html.ts";

export function mountPhotoView(card: HTMLElement, backLabel: string): void {
  const view = document.createElement("dialog");
  if (typeof view.showModal !== "function") return;
  view.className = "photo-view";
  document.body.append(view);

  card.addEventListener("click", (e) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>("a.photo-open");
    // A modifier asks for the link's own tab.
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const alt = link.querySelector("img")?.alt ?? "";
    const figure = link.closest("figure");
    const caption = figure?.querySelector("figcaption")?.innerHTML ?? "";
    const credit = figure?.querySelector<HTMLTemplateElement>("template.photo-credit")?.innerHTML ?? "";
    const text = [caption, credit && `<small class="photo-view-credit">${credit}</small>`].filter(Boolean).join(" ");
    view.innerHTML = `<img src="${attr(link.href)}" alt="${attr(alt)}" />${text ? `<p class="photo-view-caption">${text}</p>` : ""}<button type="button" class="photo-view-back" autofocus>${esc(backLabel)}</button>`;
    view.showModal();
    history.pushState({ photo: true }, "", location.href);
  });

  // A link in the caption is followed; anything else closes.
  view.addEventListener("click", (e) => {
    if (!(e.target as Element).closest("a")) history.back();
  });
  view.addEventListener("cancel", (e) => {
    e.preventDefault();
    history.back();
  });
  addEventListener("popstate", () => {
    if (view.open) view.close();
  });
}
