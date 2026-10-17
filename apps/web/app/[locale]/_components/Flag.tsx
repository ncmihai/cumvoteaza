import { Globe2 } from "lucide-react";
import type { Place } from "@/lib/places";

/** A place's flag (the files are in /flags, from the `flag-icons` set), or a plain globe where there is none: an organisation, a state that no longer exists. Loaded lazily; the name next to it says what it is. */
export function Flag({ place, width = 28 }: { place: Place; width?: number }) {
  const height = Math.round((width * 3) / 4);
  if (!place.flag) return <span aria-hidden="true" className="inline-grid shrink-0 place-items-center rounded-[3px] border border-line bg-wash text-muted" style={{ width, height }}><Globe2 size={Math.round(height * 0.7)} /></span>;
  return <img src={`/flags/${place.flag}.svg`} alt="" width={width} height={height} loading="lazy" decoding="async" className="shrink-0 rounded-[3px] border border-line object-cover" />;
}
