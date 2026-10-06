/** What the site calls itself and where its code and corrections live (D-026). The name is one constant so a later change is one edit. */
export const SITE = {
  name: "cumsevoteaza",
  displayName: "CumVoteaza",
  repoUrl: "https://github.com/ncmihai/cumvoteaza",
  issuesUrl: "https://github.com/ncmihai/cumvoteaza/issues",
  dataLicence: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  sources: [
    { key: "cdep", name: "Camera Deputaților", url: "https://www.cdep.ro" },
    { key: "senate", name: "Senatul", url: "https://www.senat.ro" },
    { key: "legislatie", name: "Portalul legislativ (legislatie.just.ro)", url: "https://legislatie.just.ro" }
  ]
} as const;
