"use client";
import { useState } from "react";
import { ImageLostIcon } from "./icons";

/** <img> that turns into an explicit "image lost" state when the source is dead (expired XHS/CDN links). */
export function SafeImg({ src, alt, lostLabel, size }: { src: string; alt: string; lostLabel: string; size: number }) {
  const [dead, setDead] = useState(false);
  if (dead) {
    return (
      <span className="ap-wall__lost" role="img" aria-label={lostLabel}>
        <ImageLostIcon size={size} />
        {size >= 24 ? <span>{lostLabel}</span> : null}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setDead(true)}
      // an SSR'd image can fail before hydration attaches onError — check once on mount
      ref={(el) => { if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) setDead(true); }}
    />
  );
}
