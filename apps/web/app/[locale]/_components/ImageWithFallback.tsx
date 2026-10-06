"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/** An image that shows `fallback` (or the children) when there is no address or the file does not load. */
export function ImageWithFallback({ src, alt, className, children, fallback, style }: { src?: string; alt: string; className?: string; children?: ReactNode; fallback?: ReactNode; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback ?? children}</>;
  return <img src={src} alt={alt} className={className} style={style} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
