export interface CabinetManifestRole {
  person: string;
  title: string;
  ministry?: string;
  startsOn: string;
  endsOn?: string;
  sourceSnapshotId: string;
}

export interface CabinetManifest {
  governmentSlug: string;
  governmentStartsOn: string;
  governmentEndsOn?: string;
  expectedInvestitureRoles: number;
  status: "reviewed" | "draft";
  roles: CabinetManifestRole[];
}

const ciolacuIiSource = "source-parliament-decision-33-ciolacu-ii-2024";

export const cabinetManifests: CabinetManifest[] = [{
  governmentSlug: "ciolacu-ii-2024-2025",
  governmentStartsOn: "2024-12-23",
  governmentEndsOn: "2025-05-06",
  expectedInvestitureRoles: 18,
  status: "reviewed",
  roles: [
    { person: "Ion-Marcel Ciolacu", title: "Prim-ministru", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Marian Neacșu", title: "Viceprim-ministru", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Marian-Cătălin Predoiu", title: "Viceprim-ministru, ministrul afacerilor interne", ministry: "Ministerul Afacerilor Interne", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Tánczos Barna", title: "Viceprim-ministru, ministrul finanțelor", ministry: "Ministerul Finanțelor", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Sorin-Mihai Grindeanu", title: "Ministrul transporturilor și infrastructurii", ministry: "Ministerul Transporturilor și Infrastructurii", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Radu Marinescu", title: "Ministrul justiției", ministry: "Ministerul Justiției", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Angel Tîlvăr", title: "Ministrul apărării naționale", ministry: "Ministerul Apărării Naționale", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Bogdan-Gruia Ivan", title: "Ministrul economiei, digitalizării, antreprenoriatului și turismului", ministry: "Ministerul Economiei, Digitalizării, Antreprenoriatului și Turismului", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Alexandru Rafila", title: "Ministrul sănătății", ministry: "Ministerul Sănătății", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Cseke Attila-Zoltan", title: "Ministrul dezvoltării, lucrărilor publice și administrației", ministry: "Ministerul Dezvoltării, Lucrărilor Publice și Administrației", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Florin-Ionuț Barbu", title: "Ministrul agriculturii și dezvoltării rurale", ministry: "Ministerul Agriculturii și Dezvoltării Rurale", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Simona Bucura-Oprescu", title: "Ministrul muncii, familiei, tineretului și solidarității sociale", ministry: "Ministerul Muncii, Familiei, Tineretului și Solidarității Sociale", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Natalia-Elena Intotero", title: "Ministrul culturii", ministry: "Ministerul Culturii", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Daniel-Ovidiu David", title: "Ministrul educației și cercetării", ministry: "Ministerul Educației și Cercetării", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Emilian-Horațiu Hurezeanu", title: "Ministrul afacerilor externe", ministry: "Ministerul Afacerilor Externe", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Marcel-Ioan Boloș", title: "Ministrul investițiilor și proiectelor europene", ministry: "Ministerul Investițiilor și Proiectelor Europene", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Sebastian-Ioan Burduja", title: "Ministrul energiei", ministry: "Ministerul Energiei", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource },
    { person: "Mircea Fechet", title: "Ministrul mediului, apelor și pădurilor", ministry: "Ministerul Mediului, Apelor și Pădurilor", startsOn: "2024-12-23", endsOn: "2025-05-06", sourceSnapshotId: ciolacuIiSource }
  ]
}];

export interface CabinetManifestAudit {
  governmentSlug: string;
  status: CabinetManifest["status"];
  expectedInvestitureRoles: number;
  documentedInvestitureRoles: number;
  sourcedRoles: number;
  errors: string[];
}

export function auditCabinetManifest(manifest: CabinetManifest, knownMinistries: Set<string>): CabinetManifestAudit {
  const errors: string[] = [];
  const investitureRoles = manifest.roles.filter((role) => role.startsOn === manifest.governmentStartsOn);
  if (investitureRoles.length !== manifest.expectedInvestitureRoles) errors.push(`expected_${manifest.expectedInvestitureRoles}_investiture_roles_found_${investitureRoles.length}`);
  for (const role of manifest.roles) {
    if (!role.sourceSnapshotId) errors.push(`missing_source:${role.person}:${role.startsOn}`);
    if (role.startsOn < manifest.governmentStartsOn) errors.push(`starts_before_government:${role.person}`);
    if (manifest.governmentEndsOn && (!role.endsOn || role.endsOn > manifest.governmentEndsOn)) errors.push(`ends_outside_government:${role.person}`);
    if (role.endsOn && role.endsOn < role.startsOn) errors.push(`negative_period:${role.person}`);
    if (role.ministry && !knownMinistries.has(role.ministry)) errors.push(`unknown_ministry:${role.ministry}`);
  }
  const byMinistry = new Map<string, CabinetManifestRole[]>();
  for (const role of manifest.roles.filter((item) => item.ministry)) byMinistry.set(role.ministry!, [...(byMinistry.get(role.ministry!) ?? []), role]);
  for (const [ministry, roles] of byMinistry) {
    const ordered = roles.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (!previous.endsOn || previous.endsOn >= current.startsOn) errors.push(`overlap:${ministry}:${previous.person}:${current.person}`);
    }
  }
  return {
    governmentSlug: manifest.governmentSlug,
    status: manifest.status,
    expectedInvestitureRoles: manifest.expectedInvestitureRoles,
    documentedInvestitureRoles: investitureRoles.length,
    sourcedRoles: manifest.roles.filter((role) => role.sourceSnapshotId).length,
    errors
  };
}

export function auditCabinetManifests(knownMinistries: Set<string>): CabinetManifestAudit[] {
  return cabinetManifests.map((manifest) => auditCabinetManifest(manifest, knownMinistries));
}
