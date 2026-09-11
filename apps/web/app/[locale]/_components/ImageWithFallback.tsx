"use client";

import { useState, type ReactNode } from "react";

export function ImageWithFallback({ src, alt, className, children }: { src?: string; alt: string; className?: string; children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{children}</>;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
