import Image from "next/image";

export interface PartyMarkParty {
  shortName: string;
  color: string;
  logoAssetId?: string | null;
}

/** "PNL" stays "PNL"; "Minorități naționale" becomes "MN"; a long name is cut to three letters. */
export function monogramOf(shortName: string): string {
  const name = shortName.trim();
  if (name.length <= 4) return name.toUpperCase();
  const words = name.split(/[\s\-]+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 3).map((word) => word[0]!.toUpperCase()).join("");
  return name.slice(0, 3).toUpperCase();
}

function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0.2;
  const value = parseInt(match[1]!, 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

const INK = "#14122b";
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function mix(hex: string, towards: "black" | "white", amount: number): string {
  const value = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const target = towards === "black" ? 0 : 255;
  const part = (shift: number) => Math.round((((value >> shift) & 255) * (1 - amount)) + target * amount);
  return `#${[16, 8, 0].map((shift) => part(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** The label colour that reads best on a party colour (white or ink); a colour where neither reaches 4.5:1 is darkened or lightened until one does. */
export function readableOn(hex: string): { background: string; color: string } {
  let background = /^#[0-9a-f]{6}$/i.test(hex.trim()) ? hex.trim() : "#64748b";
  for (let step = 0; step < 8; step++) {
    const l = luminance(background);
    const white = contrast(1, l);
    const ink = contrast(l, luminance(INK));
    if (Math.max(white, ink) >= 4.5) return { background, color: white >= ink ? "#ffffff" : INK };
    background = white >= ink ? mix(background, "black", 0.12) : mix(background, "white", 0.12);
  }
  return { background, color: "#ffffff" };
}

/**
 * A party's mark: the Chamber's own logo where one party clearly owns the image, otherwise a monogram in the party colour. A party name is never shown
 * without one (D-029). The name sits next to it in the page, so the picture itself is decorative.
 */
export function PartyMark({ party, size = 24, className = "" }: { party: PartyMarkParty; size?: 16 | 24 | 40 | 72; className?: string }) {
  const box = { width: size, height: size };
  if (party.logoAssetId) {
    // Through the image optimizer: the stored file can be far larger than the 16-72 px it is shown at.
    return <Image src={`/api/assets/${encodeURIComponent(party.logoAssetId)}`} alt="" width={size} height={size} sizes={`${size}px`} className={`shrink-0 rounded-md bg-surface object-contain ring-1 ring-line ${className}`} style={box} />;
  }
  const text = monogramOf(party.shortName);
  const fontSize = Math.max(8, Math.round(size * (text.length > 3 ? 0.3 : 0.36)));
  const { background, color } = readableOn(party.color);
  return (
    <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center rounded-md font-display font-bold leading-none ${className}`} style={{ ...box, backgroundColor: background, color, fontSize }}>
      {text}
    </span>
  );
}
