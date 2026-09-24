"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductCard } from "@pp/contracts";
import { cn } from "@/lib/cn";
import { imageSrc } from "./bits";
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon, ImageLostIcon, XIcon } from "./icons";
import { SafeImg } from "./SafeImg";

type Labels = { lost: string; none: string; gallery: string; zoom: string; prev: string; next: string; close: string; thumbs: string[] };

/** Hero image with prev/next, thumbnails that swap it in place, and a click-to-enlarge lightbox —
 *  a listing photo is not worth a new tab.
 *  Labels arrive as strings: `t` is a function and cannot cross the server/client boundary. */
export function ProductGallery({ product, alt, labels }: {
  product: Pick<ProductCard, "imageId" | "imageSourceUrl" | "imageLost"> & { imageUrls: string[] };
  alt: string;
  labels: Labels;
}) {
  // The cached copy and the remote original are the same picture under two urls — swap the cached one in
  // rather than listing both, or the first two thumbnails are identical.
  const cached = product.imageId ? imageSrc(product) : null;
  const urls = product.imageUrls.length ? product.imageUrls : product.imageSourceUrl ? [product.imageSourceUrl] : [];
  const swapped = urls.map((u) => (cached && u === product.imageSourceUrl ? cached : u));
  const shots = [...new Set(swapped.length ? swapped : cached ? [cached] : [])].slice(0, 9);

  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const many = shots.length > 1;
  // Clamped as well as keyed: state that outlives a shorter gallery would otherwise index past
  // the end and show the "no image" placeholder for a listing that does have photos.
  const index = shots.length ? Math.min(active, shots.length - 1) : 0;
  const current = shots[index];
  const step = useCallback((d: number) => setActive((i) => (i + d + shots.length) % shots.length), [shots.length]);

  // Arrow keys move through the images while the lightbox is open; Esc closes it. Tab is trapped inside:
  // `aria-modal` only hides the rest of the page from screen readers, it does not stop the tab order
  // walking out into the sidebar behind the backdrop.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setZoom(false);
      if (e.key === "ArrowLeft" && many) return step(-1);
      if (e.key === "ArrowRight" && many) return step(1);
      if (e.key !== "Tab") return;
      const stops = box.current?.querySelectorAll<HTMLElement>("button");
      if (!stops?.length) return;
      const edge = e.shiftKey ? stops[0] : stops[stops.length - 1];
      if (document.activeElement === edge || !box.current?.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom, many, step]);

  // Keyed on `zoom` alone so the focus hand-back fires on close, not on every re-render while open.
  useEffect(() => {
    if (!zoom) return;
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page must not scroll under an open lightbox
    return () => {
      document.body.style.overflow = was;
      opener.current?.focus(); // back to the button that opened it, not to the top of the document
    };
  }, [zoom]);

  const picture = (key: string) =>
    current ? (
      <SafeImg key={`${key}-${current}`} src={current} alt={alt} lostLabel={labels.lost} size={40} />
    ) : product.imageLost ? (
      <span className="ap-wall__lost" role="img" aria-label={labels.lost}><ImageLostIcon size={40} /><span>{labels.lost}</span></span>
    ) : (
      <span className="ap-wall__lost is-none" role="img" aria-label={labels.none}><ImageIcon size={40} /><span>{labels.none}</span></span>
    );

  const arrows = (size: number) => (
    <>
      <button type="button" className="ap-media-nav is-prev" aria-label={labels.prev} onClick={() => step(-1)}><ChevronLeftIcon size={size} /></button>
      <button type="button" className="ap-media-nav is-next" aria-label={labels.next} onClick={() => step(1)}><ChevronRightIcon size={size} /></button>
      <span className="ap-media-count" aria-hidden="true">{index + 1}/{shots.length}</span>
    </>
  );

  return (
    <div className="ox-stack ap-gallery-pane">
      <div className="ap-media-full">
        {current ? (
          <button ref={opener} type="button" className="ap-media-full__zoom" aria-label={labels.zoom} onClick={() => setZoom(true)}>
            {picture("hero")}
          </button>
        ) : (
          picture("hero")
        )}
        {many ? arrows(20) : null}
      </div>

      {many ? (
        <div className="ap-gallery" role="group" aria-label={labels.gallery}>
          {shots.map((u, i) => (
            <button
              key={u}
              type="button"
              className={cn("ap-gallery__thumb", i === index && "is-active")}
              aria-label={labels.thumbs[i] ?? labels.gallery}
              aria-pressed={i === index}
              onClick={() => setActive(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
      ) : null}

      {zoom && current ? (
        <div ref={box} className="ox-modal-mask ap-lightbox" role="dialog" aria-modal="true" aria-label={alt} onMouseDown={(e) => e.target === e.currentTarget && setZoom(false)}>
          <div className="ap-lightbox__stage">{picture("zoom")}</div>
          {many ? arrows(24) : null}
          <button type="button" className="ap-lightbox__close" aria-label={labels.close} autoFocus onClick={() => setZoom(false)}><XIcon size={20} /></button>
        </div>
      ) : null}
    </div>
  );
}
