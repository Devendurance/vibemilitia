"use client";

const MATCH_VIEWPORT =
  "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

/**
 * Holds the browser still for a touch match, and only for a match, so the hub
 * and forms keep normal scrolling and zoom.
 *
 * A pinch, or the automatic zoom iOS applies when a small input takes focus,
 * survives client navigation. A match entered that way shows a magnified world
 * with the right side of the screen off the visible area. The meta change
 * drops any zoom the page carried in, and the listeners stop a two-thumb grip
 * from starting a new one where `touch-action` alone is not honoured.
 */
export function lockMatchViewport(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const root = document.documentElement;
  root.classList.add("in-match");
  // Control sizes follow the screen, so a toolbar cannot resize a thumb target.
  if (window.matchMedia("(pointer: coarse)").matches && window.screen?.height) {
    root.style.setProperty(
      "--match-h",
      `${Math.min(window.screen.width, window.screen.height)}px`,
    );
  }
  const findMeta = () =>
    document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const previous = findMeta()?.getAttribute("content") ?? null;
  const applyMeta = () => {
    const meta = findMeta();
    if (meta && meta.getAttribute("content") !== MATCH_VIEWPORT) {
      meta.setAttribute("content", MATCH_VIEWPORT);
    }
  };
  applyMeta();
  // Next rewrites head metadata as a navigation settles, which would lift this.
  const headWatch = new MutationObserver(applyMeta);
  headWatch.observe(document.head, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["content"],
  });
  window.scrollTo(0, 0);

  const blockGesture = (event: Event) => event.preventDefault();
  const blockPinch = (event: TouchEvent) => {
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  };
  const blockMenu = (event: Event) => {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
  };
  document.addEventListener("gesturestart", blockGesture);
  document.addEventListener("gesturechange", blockGesture);
  document.addEventListener("touchmove", blockPinch, { passive: false });
  document.addEventListener("contextmenu", blockMenu);

  return () => {
    root.classList.remove("in-match");
    root.style.removeProperty("--match-h");
    headWatch.disconnect();
    if (previous !== null) findMeta()?.setAttribute("content", previous);
    document.removeEventListener("gesturestart", blockGesture);
    document.removeEventListener("gesturechange", blockGesture);
    document.removeEventListener("touchmove", blockPinch);
    document.removeEventListener("contextmenu", blockMenu);
  };
}
