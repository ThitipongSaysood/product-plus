"use client";
import { useEffect } from "react";

/** page key → scroll positions. Module state lives for the tab's session of client navigation, which is
 *  exactly the trip list → product → back; a full reload starting over is fine. */
const saved = new Map<string, Record<string, number>>();

/**
 * Keeps a list page's scroll where the reader left it when they come back from a product. The product
 * page's Back is a Link (a fresh navigation, so Next scrolls to the top) and inner scrollers — the
 * categories board and each lane — remount at 0 on any return. Marks: the window, plus every element
 * with `data-scroll-key` (its left and top are both kept).
 */
export function ScrollMemory({ page }: { page: string }) {
  useEffect(() => {
    const marked = () => Array.from(document.querySelectorAll<HTMLElement>("[data-scroll-key]"));

    const restore = () => {
      const s = saved.get(page);
      if (!s) return;
      for (const el of marked()) {
        const k = el.dataset.scrollKey;
        if (s[`${k}:x`] != null) el.scrollLeft = s[`${k}:x`];
        if (s[`${k}:y`] != null) el.scrollTop = s[`${k}:y`];
      }
      if (s.window != null) window.scrollTo(0, s.window);
    };
    // Next scrolls a pushed page to the top as it commits; put ours back after that has happened.
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(restore)));

    let leaving = false;
    const record = () => {
      if (leaving) return;
      const s: Record<string, number> = { window: window.scrollY };
      for (const el of marked()) {
        s[`${el.dataset.scrollKey}:x`] = el.scrollLeft;
        s[`${el.dataset.scrollKey}:y`] = el.scrollTop;
      }
      saved.set(page, s);
    };
    let pending = 0;
    const onScroll = () => {
      if (!pending) pending = requestAnimationFrame(() => { pending = 0; record(); });
    };
    // A click that navigates away: take the positions now, and ignore the scroll-to-top that follows.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest("a[href]");
      if (!a) return;
      record();
      // a new-tab click leaves this page where it is, so keep recording
      if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.getAttribute("target") === "_blank")) leaving = true;
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pending);
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [page]);
  return null;
}
