"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * An image that shows `fallback` (or the children) when there is no address or the file does not load.
 * With `fallbackWhileLoading` the fallback also stays in its place until the picture has arrived (for a card that opens on a click, where an empty box would look like a missing photo).
 */
export function ImageWithFallback({ src, alt, className, children, fallback, style, eager = false, fallbackWhileLoading = false }: { src?: string; alt: string; className?: string; children?: ReactNode; fallback?: ReactNode; style?: CSSProperties; eager?: boolean; fallbackWhileLoading?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  // A picture that arrived before React attached its load handler never fires it.
  useEffect(() => { if (image.current?.complete && image.current.naturalWidth > 0) setLoaded(true); }, [src]);
  if (!src || failed) return <>{fallback ?? children}</>;
  const waiting = fallbackWhileLoading && !loaded;
  return <>
    {waiting ? fallback ?? children : null}
    <img ref={image} src={src} alt={alt} className={className} style={waiting ? { ...style, position: "absolute", opacity: 0, pointerEvents: "none" } : style} loading={eager ? "eager" : "lazy"} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
  </>;
}
