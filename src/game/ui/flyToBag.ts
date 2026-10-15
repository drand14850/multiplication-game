// The catch animation, ported as-is from the reference flyToBag()/bagPop(). It stays
// imperative (rAF + inline styles) so the timing matches the reference exactly.

import { DELAY } from "../logic/constants";

export function bagPop(bagBtn: HTMLElement | null): void {
  if (!bagBtn) return;
  bagBtn.classList.remove("pop");
  void bagBtn.offsetWidth;          // restart the animation
  bagBtn.classList.add("pop");
}

/** Fly an animal from where it is on screen into the backpack button, then call onPop. */
export function flyToBag(svg: string, src: Element | null, bagBtn: HTMLElement | null, onPop: () => void): () => void {
  if (!src || !bagBtn) { bagPop(bagBtn); onPop(); return () => {}; }

  const a = src.getBoundingClientRect();
  const b = bagBtn.getBoundingClientRect();

  const f = document.createElement("div");
  f.className = "flyer";
  f.style.left = a.left + "px";
  f.style.top = a.top + "px";
  f.style.width = a.width + "px";
  f.style.height = a.height + "px";
  f.style.opacity = getComputedStyle(src).opacity;
  f.innerHTML = '<svg viewBox="0 0 200 200">' + svg + "</svg>";
  document.body.appendChild(f);
  (src as HTMLElement).style.visibility = "hidden";        // it left; the copy is the one flying

  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      f.style.transform = "translate(" + dx + "px," + dy + "px) scale(.08)";
      f.style.opacity = "0";
    });
  });

  const t = setTimeout(() => {
    if (f.parentNode) f.parentNode.removeChild(f);
    bagPop(bagBtn);
    onPop();
  }, DELAY.flyCleanup);

  return () => { clearTimeout(t); if (f.parentNode) f.parentNode.removeChild(f); };
}
