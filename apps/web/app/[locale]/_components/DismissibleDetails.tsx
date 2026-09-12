"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function DismissibleDetails({
  summary,
  children,
  className = "",
  panelClassName = "",
  onOpenChange
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function close() {
      if (!detailsRef.current?.open) return;
      detailsRef.current.open = false;
      onOpenChange?.(false);
    }
    function onDocumentClick(event: MouseEvent) {
      if (!detailsRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        detailsRef.current?.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenChange]);

  return <details ref={detailsRef} className={`group ${className}`} onToggle={(event) => onOpenChange?.(event.currentTarget.open)}>
    {summary}
    <div className={panelClassName}>{children}</div>
  </details>;
}
