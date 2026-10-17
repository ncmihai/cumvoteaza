/**
 * Each ministry's own website, checked on 17 October 2026 with one request for the home page and one for robots.txt (a person's browser opens all of them; the notes say what a program may do there).
 * The address is the one the site answered from; a ministry that changes its name or its address is changed here by hand. Nothing here is crawled by the site.
 *
 * Notes for a later crawl (not started): the Ministry of Justice (just.ro) answers a program with a Cloudflare browser check and its robots.txt closes the site to named bots, so it is a link only and
 * is never read by a program (D-050: a check is never bypassed); the Ministry of Foreign Affairs (mae.ro) asks for 10 seconds between requests; the others had no blanket ban for a polite reader.
 */
export const MINISTRY_SITES: Record<string, { url: string; checkedOn: string }> = {
  externe: { url: "https://mae.ro", checkedOn: "2026-10-17" },
  interne: { url: "https://www.mai.gov.ro", checkedOn: "2026-10-17" },
  agricultura: { url: "https://madr.ro", checkedOn: "2026-10-17" },
  aparare: { url: "https://www.mapn.ro", checkedOn: "2026-10-17" },
  cultura: { url: "https://www.cultura.ro", checkedOn: "2026-10-17" },
  dezvoltare: { url: "https://www.mdlpa.ro", checkedOn: "2026-10-17" },
  economie: { url: "https://economie.gov.ro", checkedOn: "2026-10-17" },
  educatie: { url: "https://edu.ro", checkedOn: "2026-10-17" },
  energie: { url: "https://energie.gov.ro", checkedOn: "2026-10-17" },
  finante: { url: "https://mfinante.gov.ro", checkedOn: "2026-10-17" },
  "fonduri-europene": { url: "https://mfe.gov.ro", checkedOn: "2026-10-17" },
  justitie: { url: "https://just.ro", checkedOn: "2026-10-17" },
  mediu: { url: "https://mmediu.ro", checkedOn: "2026-10-17" },
  munca: { url: "https://mmuncii.gov.ro", checkedOn: "2026-10-17" },
  sanatate: { url: "https://ms.ro", checkedOn: "2026-10-17" },
  transporturi: { url: "https://mt.ro", checkedOn: "2026-10-17" }
};
