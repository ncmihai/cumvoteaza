import type { DecreeKind } from "@cumsevoteaza/parliament-model";
import { fold } from "./text";

export type { DecreeKind };

/**
 * Sprint 14 (D-037): the type of a presidential decree, from the title the portal prints ("privind eliberarea din funcție a unui judecător"). A decree's title is formulaic, so the rules are
 * plain phrases; a title no rule knows is "other" and counted as unclassified, so the share of what we could not type is always known (the plan's target is under 5%).
 */
export interface DecreeType {
  kind: DecreeKind;
  /** appointment | release | other, where the title says which. */
  action?: "appointment" | "release" | "other";
}

const has = (subject: string, pattern: RegExp) => pattern.test(subject);

export function classifyDecree(rawSubject: string): DecreeType {
  const subject = fold(rawSubject);
  if (has(subject, /\bpromulgarea\b/)) return { kind: "promulgation" };
  if (has(subject, /desemnarea candidatului la functia de prim-?ministru/)) return { kind: "pm_designation" };
  if (has(subject, /\b(rectificarea|modificarea decretului|abrogarea decretului|revocarea decretului|completarea decretului)\b/)) return { kind: "correction" };
  if (has(subject, /\bgrati(ere|erii|ind)|\bgratiat|comutarea pedepsei|\bcereri de gratiere/)) return { kind: "pardon" };
  if (has(subject, /\bconferirea\b|\bdecorarea\b|\bacordarea (ordinului|medaliei|titlului|decoratiei|crucii)|\bretragerea (ordinului|medaliei|decoratiei)/)) return { kind: "decoration" };
  if (has(subject, /starii de (urgenta|asediu|alerta)|\bmobilizarii\b|\bmobilizare partiala\b|\brazboi|participarea (fortelor|unor forte|armatei)|\btrimiterea (de|unor) (trupe|militari|forte)/)) return { kind: "state_of_exception" };
  if (has(subject, /\b(referendum|convocarea parlamentului|dizolvarea parlamentului|sesiune extraordinara|solicitarea (incuviintarii|avizului))/)) return { kind: "parliament_and_referendum" };
  if (has(subject, /\bcurtii constitutionale\b/) && has(subject, /\b(numirea|eliberarea|incetarea|prelungirea|revocarea)\b/)) return { kind: "constitutional_court", action: has(subject, /\bnumirea\b/) ? "appointment" : "release" };
  if (has(subject, /\bconsilier(i|ului|ilor)? (prezidential|prezidentiali|de stat)|\bconsilier de stat|\bsef(ul)? (al )?cancelariei|\bcabinetului presedintelui|\badministratiei prezidentiale/)) return { kind: "presidential_staff", action: has(subject, /\b(numirea|desemnarea)\b/) ? "appointment" : has(subject, /\b(eliberarea|incetarea)\b/) ? "release" : "other" };
  if (has(subject, /\bministr|\bguvernului\b|\bviceprim|\bprim-?ministru|\bsecretar(ul)? de stat/)) {
    return { kind: "government", action: has(subject, /\bnumirea\b|\bdesemnarea\b/) ? "appointment" : has(subject, /\b(eliberarea|revocarea|incetarea|acceptarea demisiei|demisiei)\b/) ? "release" : "other" };
  }
  if (has(subject, /\b(procuror(ului)? general|procurorului sef|inaltei curti|consiliului superior al magistraturii|directorul directiei nationale anticoruptie|presedintelui inaltei curti|presedintelui curtii|presedintelui curtii de conturi)\b/)) {
    return { kind: "judiciary_leadership", action: has(subject, /\bnumirea\b/) ? "appointment" : has(subject, /\b(eliberarea|revocarea|incetarea)\b/) ? "release" : "other" };
  }
  if (has(subject, /\b(judecator|judecatori|procuror|procurori|magistrat|magistrati)\b/)) {
    return { kind: "magistrates", action: has(subject, /\b(numirea|promovarea|reincadrarea|investirea)\b/) ? "appointment" : has(subject, /\b(eliberarea|incetarea|revocarea|destituirea)\b/) ? "release" : "other" };
  }
  if (has(subject, /\b(ambasador|ambasadori|consul|consuli|misiune diplomatica|misiunii diplomatice|reprezentant permanent|reprezentantului permanent|acreditarea|rechemarea|agrementul|scrisori de acreditare|sef de misiune|sefului misiunii)\b/)) {
    return { kind: "diplomacy", action: has(subject, /\b(numirea|acreditarea|desemnarea)\b/) ? "appointment" : has(subject, /\b(rechemarea|eliberarea|incetarea)\b/) ? "release" : "other" };
  }
  if (has(subject, /\b(inaintarea in gradul|inaintarea in grad|trecerea in rezerva|trecerea in retragere|statului major|armatei|armata|drapelului de lupta|general|generalilor|amiral|maresal|ofiteri|ofiterilor|militar|militarilor|comandant|chestor)\b/)) {
    return { kind: "military", action: has(subject, /\b(numirea|inaintarea)\b/) ? "appointment" : has(subject, /\b(trecerea in rezerva|trecerea in retragere|eliberarea)\b/) ? "release" : "other" };
  }
  return { kind: "other" };
}
