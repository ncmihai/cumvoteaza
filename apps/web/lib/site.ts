/** What the site calls itself, where its sources are and where a reader can support it (D-026, D-050). The name is one constant so a later change is one edit. */
export const SITE = {
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
