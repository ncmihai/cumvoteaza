export type GovernmentEvidenceTier = "official" | "secondary";
export type GovernmentEvidencePurpose = "investiture" | "appointment" | "termination" | "coalition" | "context";

export interface GovernmentEvidenceSource {
  id: string;
  tier: GovernmentEvidenceTier;
  purpose: GovernmentEvidencePurpose;
  publisher: string;
  title: string;
  url: string;
}

export interface ReviewedGovernmentPeriod {
  id: string;
  legislatureId: string;
  name: string;
  primeMinister: string;
  startsOn: string;
  endsOn?: string;
  acting: boolean;
  coalition: Array<{
    partyId: string;
    alignment: "government" | "governing_support";
    startsOn: string;
    endsOn?: string;
  }>;
  sources: GovernmentEvidenceSource[];
}

/** Human-reviewed expectations. Automated discovery may suggest changes, but never publish them. */
export const governmentHistory2024To2028: ReviewedGovernmentPeriod[] = [
  {
    id: "government-ciolacu-ii-2024-2025",
    legislatureId: "leg-2024-2028",
    name: "Ciolacu II",
    primeMinister: "Marcel Ciolacu",
    startsOn: "2024-12-23",
    endsOn: "2025-05-06",
    acting: false,
    coalition: [
      { partyId: "party-psd", alignment: "government", startsOn: "2024-12-23", endsOn: "2025-05-06" },
      { partyId: "party-pnl", alignment: "government", startsOn: "2024-12-23", endsOn: "2025-05-06" },
      { partyId: "party-udmr", alignment: "government", startsOn: "2024-12-23", endsOn: "2025-05-06" }
    ],
    sources: [
      {
        id: "portal-legislativ-hp-33-2024",
        tier: "official",
        purpose: "investiture",
        publisher: "Portal Legislativ / Parlamentul României",
        title: "Hotărârea Parlamentului nr. 33 din 23 decembrie 2024",
        url: "https://legislatie.just.ro/Public/DetaliiDocument/292981"
      },
      {
        id: "portal-legislativ-decret-622-2025",
        tier: "official",
        purpose: "termination",
        publisher: "Portal Legislativ / Președintele României",
        title: "Decretul nr. 622 din 6 mai 2025",
        url: "https://legislatie.just.ro/Public/DetaliiDocument/297122"
      },
      {
        id: "wikipedia-ciolacu-cabinet-ii",
        tier: "secondary",
        purpose: "context",
        publisher: "Wikipedia",
        title: "Second Ciolacu cabinet",
        url: "https://en.wikipedia.org/wiki/Second_Ciolacu_cabinet"
      }
    ]
  },
  {
    id: "government-predoiu-acting-2025",
    legislatureId: "leg-2024-2028",
    name: "Predoiu interimar",
    primeMinister: "Cătălin Predoiu",
    startsOn: "2025-05-06",
    endsOn: "2025-06-23",
    acting: true,
    coalition: [],
    sources: [
      {
        id: "portal-legislativ-decret-623-2025",
        tier: "official",
        purpose: "appointment",
        publisher: "Portal Legislativ / Președintele României",
        title: "Decretul nr. 623 din 6 mai 2025",
        url: "https://legislatie.just.ro/Public/DetaliiDocument/297123"
      },
      {
        id: "portal-legislativ-hp-25-2025-transition",
        tier: "official",
        purpose: "termination",
        publisher: "Portal Legislativ / Parlamentul României",
        title: "Hotărârea Parlamentului nr. 25 din 23 iunie 2025",
        url: "https://legislatie.just.ro/Public/DetaliiDocument/299203"
      }
    ]
  },
  {
    id: "government-bolojan-2025-present",
    legislatureId: "leg-2024-2028",
    name: "Bolojan",
    primeMinister: "Ilie Bolojan",
    startsOn: "2025-06-23",
    acting: false,
    coalition: [
      { partyId: "party-psd", alignment: "government", startsOn: "2025-06-23" },
      { partyId: "party-pnl", alignment: "government", startsOn: "2025-06-23" },
      { partyId: "party-usr", alignment: "government", startsOn: "2025-06-23" },
      { partyId: "party-udmr", alignment: "government", startsOn: "2025-06-23" },
      { partyId: "party-minoritati", alignment: "governing_support", startsOn: "2025-06-23" }
    ],
    sources: [
      {
        id: "portal-legislativ-hp-25-2025",
        tier: "official",
        purpose: "investiture",
        publisher: "Portal Legislativ / Parlamentul României",
        title: "Hotărârea Parlamentului nr. 25 din 23 iunie 2025",
        url: "https://legislatie.just.ro/Public/DetaliiDocument/299203"
      },
      {
        id: "wikipedia-bolojan-cabinet",
        tier: "secondary",
        purpose: "context",
        publisher: "Wikipedia",
        title: "Bolojan cabinet",
        url: "https://en.wikipedia.org/wiki/Bolojan_cabinet"
      }
    ]
  }
];
