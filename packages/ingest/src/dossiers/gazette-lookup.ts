import { fold } from "./step-typing";

/**
 * The Official Gazette number of a promulgated law, from legislatie.just.ro (the Ministry of Justice's legislative portal).
 * The Senate page prints it for bills that went through the Senate; a Chamber-only page does not, and a law promulgated a day ago is not published yet.
 */
const ENDPOINT = "http://legislatie.just.ro/apiws/FreeWebService.svc/SOAP";
const NS = "http://tempuri.org/";
const MONTHS: Record<string, string> = { ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06", iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12" };

export interface LegislatieAct {
  type: string;
  issuer: string;
  title: string;
  link: string;
  text: string;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const tag = (block: string, name: string) => block.match(new RegExp(`<a:${name}>([^<]*)</a:${name}>`))?.[1] ?? "";
const decodeXml = (value: string) => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** The acts of a `Search` answer. */
export function parseLegislatieSearch(xml: string): LegislatieAct[] {
  return [...xml.matchAll(/<a:Legi>([\s\S]*?)<\/a:Legi>/g)].map((match) => ({
    type: decodeXml(tag(match[1]!, "TipAct")),
    issuer: decodeXml(tag(match[1]!, "Emitent")),
    title: squash(decodeXml(tag(match[1]!, "Titlu"))),
    link: decodeXml(tag(match[1]!, "LinkHtml")),
    text: squash(decodeXml(tag(match[1]!, "Text")))
  }));
}

const isoOf = (day: string, month: string, year: string) => {
  const mm = MONTHS[fold(month)];
  return mm ? `${year}-${mm}-${day.padStart(2, "0")}` : undefined;
};

/** The law numbered `number` of the year, as Parliament's act: its own date and the Official Gazette that published it ("Publicat în MONITORUL OFICIAL nr. 1194 din 23 decembrie 2025"). */
export function lawGazette(acts: LegislatieAct[], number: string): { gazetteNumber: string; gazetteOn: string; lawOn: string; link: string } | undefined {
  for (const act of acts) {
    if (fold(act.type) !== "lege" || !fold(act.issuer).startsWith("parlamentul")) continue;
    const head = act.text.match(/^\s*LEGE\s+nr\.\s*(\d+)\s+din\s+(\d{1,2})\s+([^\s]+)\s+(\d{4})/i);
    if (!head || head[1] !== number) continue;
    const published = act.text.match(/Publicat\s+în\s+MONITORUL\s+OFICIAL\s+nr\.\s*(\d+)\s+din\s+(\d{1,2})\s+([^\s]+)\s+(\d{4})/i);
    if (!published) continue;
    const lawOn = isoOf(head[2]!, head[3]!, head[4]!);
    const gazetteOn = isoOf(published[2]!, published[3]!, published[4]!);
    if (lawOn && gazetteOn) return { gazetteNumber: published[1]!, gazetteOn, lawOn, link: act.link };
  }
  return undefined;
}

async function soap(action: string, body: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${body}</s:Body></s:Envelope>`;
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `${NS}IFreeWebService/${action}` }, body: envelope });
  if (!response.ok) throw new Error(`legislatie.just.ro ${action}: HTTP ${response.status}`);
  return response.text();
}

export async function legislatieToken(): Promise<string> {
  const answer = await soap("GetToken", `<GetToken xmlns="${NS}"/>`);
  const token = answer.match(/<GetTokenResult>([^<]+)<\/GetTokenResult>/)?.[1];
  if (!token) throw new Error("legislatie.just.ro gave no token");
  return token;
}

/** Every act of the year with that number (laws, decisions, orders, decrees...); `lawGazette` picks the law. */
export async function searchActs(token: string, year: number, number: string): Promise<LegislatieAct[]> {
  const model = `<a:NumarPagina>0</a:NumarPagina><a:RezultatePagina>50</a:RezultatePagina><a:SearchAn>${year}</a:SearchAn><a:SearchNumar>${number}</a:SearchNumar><a:SearchText i:nil="true"/><a:SearchTitlu i:nil="true"/>`;
  const answer = await soap("Search", `<Search xmlns="${NS}"><SearchModel xmlns:a="http://schemas.datacontract.org/2004/07/FreeWebService" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">${model}</SearchModel><tokenKey>${token}</tokenKey></Search>`);
  return parseLegislatieSearch(answer);
}

/** Acts of the year whose title holds the word (first page of the results; the portal answers ten at a time). Decrees of the Presidency among them are what the cabinet watcher looks at. */
export async function searchByTitle(token: string, year: number, word: string, page = 0): Promise<LegislatieAct[]> {
  const model = `<a:NumarPagina>${page}</a:NumarPagina><a:RezultatePagina>50</a:RezultatePagina><a:SearchAn>${year}</a:SearchAn><a:SearchNumar i:nil="true"/><a:SearchText i:nil="true"/><a:SearchTitlu>${word.replace(/[<>&]/g, "")}</a:SearchTitlu>`;
  const answer = await soap("Search", `<Search xmlns="${NS}"><SearchModel xmlns:a="http://schemas.datacontract.org/2004/07/FreeWebService" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">${model}</SearchModel><tokenKey>${token}</tokenKey></Search>`);
  return parseLegislatieSearch(answer);
}
