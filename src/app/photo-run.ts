// A run of photos the text places scrolls sideways (style.css, .photo-run).
// A finger scrolls it natively; this gives a mouse the same grip: dragged,
// the row follows, and the click that ends a drag doesn't open the photo
// (photo-view.ts), nor does the drag carry the picture off as a file.

export function mountPhotoRuns(card: HTMLElement): void {
  let dragged = false;
  card.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const run = (e.target as Element).closest<HTMLElement>(".photo-run");
    if (!run || run.scrollWidth <= run.clientWidth) return;
    const x0 = e.clientX, s0 = run.scrollLeft;
    dragged = false;
    const move = (ev: PointerEvent) => {
      // Captured only once it is a drag: a captured press would end its click on the row, not the photo.
      if (!dragged) {
        if (Math.abs(ev.clientX - x0) < 5) return;
        dragged = true;
        run.setPointerCapture(e.pointerId);
        run.classList.add("dragging");
        getSelection()?.removeAllRanges();
      }
      run.scrollLeft = s0 - (ev.clientX - x0);
    };
    const up = () => {
      run.removeEventListener("pointermove", move);
      run.removeEventListener("pointerup", up);
      run.removeEventListener("pointercancel", up);
      run.classList.remove("dragging");
    };
    run.addEventListener("pointermove", move);
    run.addEventListener("pointerup", up);
    run.addEventListener("pointercancel", up);
  });
  card.addEventListener(
    "click",
    (e) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  card.addEventListener("dragstart", (e) => {
    if ((e.target as Element).closest?.(".photo-run")) e.preventDefault();
  });
}
