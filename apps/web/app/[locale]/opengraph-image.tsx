import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { hemicycleLayout } from "@/lib/hemicycle";
import { isLocale } from "@/lib/i18n";

export const alt = "CumVoteaza";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card shown when a link to the site is shared: the mark, the question the site answers, and a hemicycle of seats with one lit. */
export default async function OpenGraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const ro = !isLocale(rawLocale) || rawLocale === "ro";
  const [bricolage, inter] = await Promise.all([
    readFile(path.join(process.cwd(), "app/fonts/og/og-bricolage-700.ttf")),
    readFile(path.join(process.cwd(), "app/fonts/og/og-inter-500.ttf"))
  ]);
  const seats = hemicycleLayout(210);
  const palette = ["#4338ca", "#6366f1", "#818cf8", "#a5b4fc", "#e0e7ff"];
  const lit = 52;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#14122b", color: "#ffffff", padding: "64px 72px", fontFamily: "Inter" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="64" height="64" viewBox="0 0 100 100">
              {[[37, 11], [50, 11], [63, 11], [24, 24], [76, 24], [76, 37], [63, 50], [50, 63]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="7.2" fill="#ffffff" />)}
              <circle cx="50" cy="87" r="8.4" fill="#a3e635" />
            </svg>
            <div style={{ fontFamily: "Bricolage", fontWeight: 700, fontSize: 40, display: "flex" }}><div style={{ display: "flex" }}>Cum</div><div style={{ display: "flex", color: "#a5b4fc" }}>Voteaza</div></div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ fontFamily: "Bricolage", fontWeight: 700, fontSize: 84, lineHeight: 1.04, display: "flex", flexDirection: "column" }}>
              {ro ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex" }}><div style={{ display: "flex" }}>Cum</div><div style={{ display: "flex", color: "#a3e635", marginLeft: 22 }}>votează</div></div>
                  <div style={{ display: "flex" }}>Parlamentul?</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex" }}>How does</div>
                  <div style={{ display: "flex" }}>Parliament</div>
                  <div style={{ display: "flex", color: "#a3e635" }}>vote?</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: 30, color: "#c7d2fe", lineHeight: 1.35, display: "flex" }}>{ro ? "Voturi, proiecte de lege și parlamentari, din surse oficiale." : "Votes, bills and members of parliament, from official sources."}</div>
          </div>
          <div style={{ fontSize: 26, color: "#a5b4fc", display: "flex" }}>cumvoteaza.vercel.app</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", flex: 1 }}>
          <svg width="520" height="291" viewBox="0 0 100 56">
            {seats.map((seat, index) => (
              <circle key={index} cx={seat.x} cy={seat.y} r={seat.r} fill={index === lit ? "#a3e635" : palette[Math.min(palette.length - 1, Math.floor(seat.t * palette.length))]} />
            ))}
          </svg>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Bricolage", data: bricolage.buffer.slice(bricolage.byteOffset, bricolage.byteOffset + bricolage.byteLength) as ArrayBuffer, weight: 700, style: "normal" }, { name: "Inter", data: inter.buffer.slice(inter.byteOffset, inter.byteOffset + inter.byteLength) as ArrayBuffer, weight: 500, style: "normal" }] }
  );
}
