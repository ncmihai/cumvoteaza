/** Presentation-only cleanup. Canonical source values stay unchanged. */
export function billTitleForDisplay(value: string): string {
  return value
    .replace(/\s+în termenul acordat pentru avize[\s\S]*$/i, "")
    .replace(/\s+inițiator(?:i)?:[\s\S]*$/i, "")
    .replace(/\s+initiator(?:i)?:[\s\S]*$/i, "")
    .trim();
}

export function billStatusForDisplay(value: string): string {
  const metadataStart = /\s+(?:inițiator(?:i)?|initiator(?:i)?|consultare publică|consultați|consultati|prioritate legislativă|prioritate legislativa|data acțiunea|data actiunea):/i;
  return value.split(metadataStart, 1)[0]?.trim() || "—";
}

export function placeForDisplay(value?: string): string {
  return (value ?? "")
    .replace(/data validării.*$/i, "")
    .replace(/data validarii.*$/i, "")
    .replace(/formaţiunea politică.*$/i, "")
    .trim() || "—";
}
