"use client";

import { useEffect, useState, useTransition } from "react";
import { TrendingUp } from "lucide-react";

export function HotButton({
  entityType,
  entityId,
  initialCount,
  label = "Public interest"
}: {
  entityType: "bill" | "vote";
  entityId: string;
  initialCount: number;
  label?: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [active, setActive] = useState(false);
  const [isPending, startTransition] = useTransition();
  // The server does not identify visitors (D-015); this browser remembers its own click, only after the visitor clicks.
  const storageKey = `cumsevoteaza:hot:${entityType}:${entityId}`;
  useEffect(() => {
    try { if (window.localStorage.getItem(storageKey)) setActive(true); } catch { /* storage unavailable */ }
  }, [storageKey]);

  return (
    <button
      type="button"
      disabled={isPending || active}
      onClick={() => {
        startTransition(async () => {
          const response = await fetch("/api/reactions/hot", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ entityType, entityId })
          });
          if (!response.ok && response.status !== 202) return;
          const payload = await response.json().catch(() => undefined) as { count?: number; disabled?: boolean } | undefined;
          if (payload?.disabled) return;
          if (typeof payload?.count === "number") setCount(payload.count);
          setActive(true);
          try { window.localStorage.setItem(storageKey, "1"); } catch { /* storage unavailable */ }
        });
      }}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${
        active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-soft hover:border-brand hover:text-brand-strong"
      }`}
      aria-label={`${label}: ${count}`}
    >
      <TrendingUp size={14} aria-hidden="true" />
      {label} {count}
    </button>
  );
}
