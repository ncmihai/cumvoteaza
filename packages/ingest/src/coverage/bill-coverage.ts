export type BillListChamber = "deputies" | "senate";

/** One bill as a yearly official list names it. */
export interface OfficialBill {
  chamber: BillListChamber;
  /** "PL-x 83/2024", "L27/2024" or "B646/2026". */
  officialId: string;
  year: number;
}

export interface StoredBillIdentifiers {
  id: string;
  identifiers: Record<string, string>;
}

export interface BillCoverageRow {
  chamber: BillListChamber;
  year: number;
  official: number;
  held: number;
  missing: number;
  percent: number | null;
  /** What the list page itself says it found (CDEP prints "Număr înregistrări găsite"), to catch a truncated list. */
  pageCount?: number;
  missingIds: string[];
}

export interface BillCoverageReport {
  rows: BillCoverageRow[];
  /** Years whose list holds a different number of rows than the page announces. */
  listCountMismatches: Array<{ chamber: BillListChamber; year: number; announced: number; parsed: number }>;
}

const IDENTIFIER_KEYS: Record<BillListChamber, string[]> = { deputies: ["deputies"], senate: ["senate", "senate_l", "senate_b"] };

export function buildBillCoverage(input: {
  official: OfficialBill[];
  stored: StoredBillIdentifiers[];
  pageCounts?: Array<{ chamber: BillListChamber; year: number; announced: number }>;
}): BillCoverageReport {
  const held: Record<BillListChamber, Set<string>> = { deputies: new Set(), senate: new Set() };
  for (const bill of input.stored) {
    for (const chamber of ["deputies", "senate"] as const) {
      for (const key of IDENTIFIER_KEYS[chamber]) {
        const value = bill.identifiers[key];
        if (value) held[chamber].add(value.trim().toLowerCase());
      }
    }
  }
  const cells = new Map<string, BillCoverageRow>();
  for (const bill of input.official) {
    const key = `${bill.chamber}|${bill.year}`;
    const cell = cells.get(key) ?? { chamber: bill.chamber, year: bill.year, official: 0, held: 0, missing: 0, percent: null, missingIds: [] };
    cells.set(key, cell);
    cell.official += 1;
    if (held[bill.chamber].has(bill.officialId.trim().toLowerCase())) cell.held += 1;
    else {
      cell.missing += 1;
      cell.missingIds.push(bill.officialId);
    }
  }
  const rows = [...cells.values()]
    .map((cell) => ({
      ...cell,
      percent: cell.official === 0 ? null : Math.round((cell.held / cell.official) * 10_000) / 100,
      pageCount: input.pageCounts?.find((item) => item.chamber === cell.chamber && item.year === cell.year)?.announced,
      missingIds: cell.missingIds.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    }))
    .sort((a, b) => a.year - b.year || a.chamber.localeCompare(b.chamber));
  const listCountMismatches = rows.flatMap((row) => (row.pageCount !== undefined && row.pageCount !== row.official ? [{ chamber: row.chamber, year: row.year, announced: row.pageCount, parsed: row.official }] : []));
  return { rows, listCountMismatches };
}

export function renderBillCoverageMarkdown(report: BillCoverageReport, generatedAt: string): string {
  const label = { deputies: "Chamber", senate: "Senate" } as const;
  const lines = [`# Bill coverage`, "", `Generated ${generatedAt}. A bill counts as held when its official number appears in the identifiers of a stored bill.`, ""];
  lines.push("| Year | Chamber | Official | Held | Missing | Coverage |", "| --- | --- | ---: | ---: | ---: | ---: |");
  for (const row of report.rows) lines.push(`| ${row.year} | ${label[row.chamber]} | ${row.official} | ${row.held} | ${row.missing} | ${row.percent === null ? "–" : `${row.percent.toFixed(1)}%`} |`);
  lines.push("");
  if (report.listCountMismatches.length) {
    lines.push("**Lists that may be truncated** (rows read differ from the count the page announces):", "");
    for (const item of report.listCountMismatches) lines.push(`- ${label[item.chamber]} ${item.year}: page says ${item.announced}, read ${item.parsed}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
