import { readAnalysisNumber, type PlayerSourceRow } from "@/lib/player-analysis-source";

export type MatchDetailSource = {
  equipment: Array<{ slot: string; code: number }> | null;
  traits: number[] | null;
  skills: Array<{ order: number; code: number }> | null;
  routeId: number | null;
  startArea: string | null;
  collectionVersion?: number;
  traitGroups?: { core: number | null; firstSub: number[] | null; secondSub: number[] | null };
  tacticalSkillCode?: number | null;
  tacticalSkillLevel?: number | null;
  routeSlotId?: number | null;
};
export type PlayerMatchDetails = Omit<MatchDetailSource, "equipment" | "skills"> & {
  equipment: Array<{ slot: string; code: number; name?: string }> | null;
  traitNames?: string[];
  skills: Array<{ order: number; code: number; name?: string }> | null;
  startAreaName?: string;
};
const positive = (value: unknown) => (typeof value === "number" || typeof value === "string") && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const slots: Record<string, string> = { "0": "무기", "1": "옷", "2": "머리", "3": "팔", "4": "다리" };

export function matchDetailSource(row: PlayerSourceRow): MatchDetailSource {
  const equipment = row.equipment as Record<string, unknown> | undefined;
  const saved = (row.build_details ?? (equipment?.__analysis as Record<string, unknown> | undefined)?.details) as MatchDetailSource | undefined;
  if (saved) return saved;
  const items = equipment?.items ?? equipment;
  const traitKeys = ["traitFirstCore", "traitFirstSub", "traitSecondSub"];
  return {
    equipment: items && typeof items === "object" ? Object.entries(items).filter(([slot]) => slot in slots)
      .flatMap(([slot, code]) => positive(code) ? [{ slot: slots[slot], code: Number(code) }] : []) : null,
    traits: traitKeys.some((key) => row[key] != null) ? traitKeys.flatMap((key) =>
      (Array.isArray(row[key]) ? row[key] as unknown[] : [row[key]]).flatMap((value) => positive(value) ? [Number(value)] : [])).slice(0, 8) : null,
    skills: row.skillOrderInfo && typeof row.skillOrderInfo === "object" ? Object.entries(row.skillOrderInfo)
      .flatMap(([order, code]) => positive(order) && positive(code) ? [{ order: Number(order), code: Number(code) }] : [])
      .sort((a, b) => a.order - b.order).slice(0, 40) : null,
    routeId: positive(row.routeIdOfStart ?? row.route_id_of_start),
    startArea: row.placeOfStart != null ? String(row.placeOfStart).slice(0, 80) :
      readAnalysisNumber(row, "place_of_start") ? String(row.place_of_start) : null,
    collectionVersion: 2,
    traitGroups: {
      core: positive(row.traitFirstCore),
      firstSub: Array.isArray(row.traitFirstSub) ? row.traitFirstSub.flatMap((code) => positive(code) ? [Number(code)] : []) : null,
      secondSub: Array.isArray(row.traitSecondSub) ? row.traitSecondSub.flatMap((code) => positive(code) ? [Number(code)] : []) : null
    },
    tacticalSkillCode: positive(row.tacticalSkillGroup),
    tacticalSkillLevel: positive(row.tacticalSkillLevel),
    routeSlotId: positive(row.routeSlotId)
  };
}

export function labelMatchDetails(details: MatchDetailSource, names: Record<string, string>): PlayerMatchDetails {
  const name = (prefix: string, code: number | string) => names[`${prefix}/${code}`]?.slice(0, 120);
  return { ...details, equipment: details.equipment?.map((item) => ({ ...item, name: name("Item/Name", item.code) })) ?? null,
    traitNames: details.traits?.map((code) => name("Trait/Name", code) ?? `특성 ${code}`),
    skills: details.skills?.map((skill) => ({ ...skill, name: name("Skill/Group/Name", skill.code) })) ?? null,
    startAreaName: details.startArea ? name("Area/Name", details.startArea) : undefined };
}
