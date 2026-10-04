/**
 * How the governments of the 2024–2028 legislature were formed, or failed to be (Constitution art. 103).
 * Every figure has a source. Official sources are the decrees and Parliament decisions on the legislative portal;
 * vote totals of investiture votes (secret ballots) are public reports until the stenograms are matched (F3).
 * Unknown values stay null: nothing is inferred.
 */
export interface FormationAttemptSeed {
  id: string;
  designee: string;
  precedingGovernmentId?: string;
  resultingGovernmentId?: string;
  designatedOn: string;
  designationDecree?: string;
  designationDecreeUrl?: string;
  revokedOn?: string;
  revocationDecree?: string;
  revocationDecreeUrl?: string;
  voteHeldOn?: string;
  presentCount?: number;
  votesFor?: number;
  votesAgainst?: number;
  votesVoid?: number;
  threshold?: number;
  outcome: "invested" | "failed" | "revoked_before_vote";
  parliamentDecision?: string;
  parliamentDecisionUrl?: string;
  appointmentDecree?: string;
  sources: Array<{ label: string; url: string; kind: "official" | "reported" }>;
  notes?: string;
}

const portal = (id: number) => `https://legislatie.just.ro/Public/DetaliiDocument/${id}`;

export const formationAttemptSeeds: FormationAttemptSeed[] = [
  {
    id: "formation-ciolacu-ii-2024",
    designee: "Marcel Ciolacu",
    precedingGovernmentId: "government-ciolacu-i-2023-2024",
    resultingGovernmentId: "government-ciolacu-ii-2024-2025",
    designatedOn: "2024-12-23",
    voteHeldOn: "2024-12-23",
    presentCount: 450,
    votesFor: 240,
    votesAgainst: 143,
    threshold: 234,
    outcome: "invested",
    parliamentDecision: "Hotărârea Parlamentului nr. 33/2024",
    parliamentDecisionUrl: portal(292981),
    appointmentDecree: "Decretul nr. 1671/2024 (M.Of. 1313/23.12.2024)",
    sources: [
      { label: "Hotărârea Parlamentului nr. 33/2024", url: portal(292981), kind: "official" },
      { label: "Guvernul Ciolacu 2 a fost votat în Parlament cu 240 de voturi pentru și 143 împotrivă", url: "https://www.monitorulexpres.ro/2024/12/23/guvernul-ciolacu-2-a-fost-votat-in-parlament-cu-240-de-voturi-pentru-si-143-impotriva/", kind: "reported" }
    ],
    notes: "Vot secret cu bile, în ședința comună; 383 de voturi valabile. Decretul de desemnare nu are numărul verificat."
  },
  {
    id: "formation-bolojan-2025",
    designee: "Ilie Bolojan",
    precedingGovernmentId: "government-predoiu-acting-2025",
    resultingGovernmentId: "government-bolojan-2025-present",
    designatedOn: "2025-06-20",
    designationDecree: "Decretul nr. 734/2025 (M.Of. 576/20.06.2025)",
    voteHeldOn: "2025-06-23",
    presentCount: 314,
    votesFor: 301,
    votesAgainst: 9,
    threshold: 233,
    outcome: "invested",
    parliamentDecision: "Hotărârea Parlamentului nr. 25/2025",
    parliamentDecisionUrl: portal(299203),
    appointmentDecree: "Decretul nr. 747/2025 (23.06.2025)",
    sources: [
      { label: "Hotărârea Parlamentului nr. 25/2025", url: portal(299203), kind: "official" },
      { label: "Guvernul Bolojan, învestit de Parlament", url: "https://www.bursa.ro/guvernul-bolojan-investit-de-parlament-49570652", kind: "reported" },
      { label: "Guvernul Ilie Bolojan - trecerea prin Parlament (301 pentru)", url: "https://cursdeguvernare.ro/zi-investitura-guvern-bolojan-program.html", kind: "reported" }
    ],
    notes: "Vot secret cu bile. Parlamentarii AUR au părăsit sala."
  },
  {
    id: "formation-tomac-2026",
    designee: "Eugen Tomac",
    precedingGovernmentId: "government-bolojan-2025-present",
    designatedOn: "2026-06-05",
    designationDecree: "Decretul nr. 316/2026 (M.Of. 472/05.06.2026)",
    designationDecreeUrl: portal(311206),
    revokedOn: "2026-06-14",
    revocationDecree: "Decretul nr. 327/2026 (M.Of. 491/14.06.2026)",
    revocationDecreeUrl: portal(311342),
    outcome: "revoked_before_vote",
    sources: [
      { label: "Decretul nr. 316/2026", url: portal(311206), kind: "official" },
      { label: "Decretul nr. 327/2026 (revocare)", url: portal(311342), kind: "official" },
      { label: "Primul mesaj al fostului premier desemnat, Eugen Tomac, după ce a renunțat", url: "https://www.digi24.ro/stiri/actualitate/politica/primul-mesaj-al-fostului-premier-desemnat-eugen-tomac-dupa-ce-a-renuntat-sa-mai-incerce-sa-formeze-un-guvern-3814377", kind: "reported" }
    ],
    notes: "Designat în timpul interimatului Guvernului Bolojan; a renunțat înainte de a cere votul de încredere, desemnarea a fost revocată."
  },
  {
    id: "formation-vestea-2026",
    designee: "Adrian-Ioan Veștea",
    precedingGovernmentId: "government-bolojan-2025-present",
    designatedOn: "2026-06-14",
    designationDecree: "Decretul nr. 328/2026 (M.Of. 491/14.06.2026)",
    designationDecreeUrl: portal(311343),
    voteHeldOn: "2026-06-22",
    presentCount: 358,
    votesFor: 189,
    votesAgainst: 23,
    threshold: 233,
    outcome: "failed",
    sources: [
      { label: "Decretul nr. 328/2026", url: portal(311343), kind: "official" },
      { label: "Guvernul Adrian Veștea a picat la vot cu 189 de voturi pentru și 23 contra", url: "https://tvrinfo.ro/guvernul-adrian-vestea-a-picat-la-vot-cu-189-de-voturi-pentru-si-23-contra-vestea-eu-consider-ca-mi-am-facut-datoria/", kind: "reported" },
      { label: "Guvernul Adrian Veștea a picat la vot în Parlament", url: "https://www.euronews.ro/articole/vot-investire-guvern-adrian-vestea-parlamentul-romaniei", kind: "reported" }
    ],
    notes: "Ședința comună din 22 iunie 2026; AUR nu a votat, UDMR a părăsit sala."
  },
  {
    id: "formation-muresan-2026",
    designee: "Siegfried Mureșan",
    precedingGovernmentId: "government-bolojan-2025-present",
    designatedOn: "2026-09-21",
    designationDecree: "Decretul nr. 770/2026 (M.Of. 799/21.09.2026)",
    designationDecreeUrl: portal(314711),
    voteHeldOn: "2026-09-30",
    votesFor: 182,
    votesAgainst: 15,
    threshold: 233,
    outcome: "failed",
    sources: [
      { label: "Decretul nr. 770/2026", url: portal(314711), kind: "official" },
      { label: "Guvernul Mureșan a picat: 182 pentru, 15 împotrivă", url: "https://www.mediafax.ro/politic/guvernul-muresan-la-vot-in-parlament-premierul-desemnat-are-nevoie-de-233-de-voturi-pentru-investire-23816690", kind: "reported" },
      { label: "Parlamentul se reunește pentru votul de învestitură a Guvernului Siegfried Mureșan", url: "https://agerpres.ro/politic/2026/09/30/parlamentul-se-reuneste-pentru-votul-de-investitura-a-guvernului-siegfried-muresan--1598178", kind: "reported" }
    ],
    notes: "Ședința comună din 30 septembrie 2026. Parlamentarii AUR nu au fost în sală; cei ai PSD au fost prezenți, dar nu au votat. Numărul prezenților nu este verificat. Președintele a anunțat noi consultări pentru 5 octombrie 2026."
  }
];
