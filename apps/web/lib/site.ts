/** What the site calls itself, where its sources are and where a reader can support it (D-026, D-050). The name is one constant so a later change is one edit. */
export const SITE = {
  /** The public address (also the base of every canonical link and of the sitemap). Only the production deployment is indexable (see robots.ts). */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://cumvoteaza.vercel.app",
  name: "cumsevoteaza",
  displayName: "CumVoteaza",
  /** A plain donation link: no perks, no paywall, no ads, so the site stays free and non-commercial on the free hosting plan (D-050). */
  support: { name: "Buy Me a Coffee", url: "https://buymeacoffee.com/ncm1" },
  sources: [
    { key: "cdep", name: "Camera Deputaților", url: "https://www.cdep.ro" },
    { key: "senate", name: "Senatul", url: "https://www.senat.ro" },
    { key: "legislatie", name: "Portalul legislativ (legislatie.just.ro)", url: "https://legislatie.just.ro" }
  ]
} as const;
