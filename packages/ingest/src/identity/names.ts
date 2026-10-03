/** A parliamentary office stored after a comma: "Gianina Şerban, Vicepreşedinte Al Camerei Deputaţilor". */
export const OFFICE_TITLE_SUFFIX = /,\s*(?:pre[sşș]edinte(?:le)?|vicepre[sşș]edinte|chestor|secretar)\b.*$/i;

export function hasOfficeTitle(name: string): boolean {
  return OFFICE_TITLE_SUFFIX.test(name);
}

/** An office is not part of a person's name. */
export function withoutOfficeTitle(name: string): string {
  return name.replace(OFFICE_TITLE_SUFFIX, "").trim();
}
