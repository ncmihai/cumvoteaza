import { ImageWithFallback } from "../ImageWithFallback";

function initialsOf(name: string): string {
  const words = name.trim().split(/[\s\-]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1]![0]! : "")).toUpperCase();
}

/** A person's photo where we hold one (the Chamber's or the Senate's own), otherwise their initials. Portraits are 3:4, avatars are round. */
export function PersonAvatar({ name, photoUrl, size = 40, shape = "round" }: { name: string; photoUrl?: string; size?: number; shape?: "round" | "portrait" }) {
  const box = shape === "portrait" ? { width: size, height: Math.round(size * 4 / 3) } : { width: size, height: size };
  const radius = shape === "portrait" ? "rounded-card" : "rounded-full";
  const fallback = (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center bg-brand-soft font-display font-bold text-brand-strong ${radius}`} style={{ ...box, fontSize: Math.round(size * 0.36) }}>
      {initialsOf(name)}
    </span>
  );
  return (
    <ImageWithFallback src={photoUrl} alt={name} className={`shrink-0 bg-wash object-cover object-top ${radius}`} fallback={fallback} style={box} />
  );
}
