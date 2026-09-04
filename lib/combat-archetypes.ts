export const COMBAT_ARCHETYPE_VERSION = 2;

export type CombatRangeProfile = "melee" | "ranged" | "hybrid" | "unknown";
export type CombatFunction =
  | "sustained_damage"
  | "burst_damage"
  | "engage"
  | "control"
  | "support"
  | "unknown";
export type CombatScoreProfile =
  | "melee_damage"
  | "melee_engage"
  | "ranged_sustained"
  | "ranged_poke"
  | "utility_control"
  | "hybrid_skirmisher"
  | "unclassified";
export type CombatArchetypeReviewStatus = "auto" | "review_required" | "reviewed";
export type CombatMetricWeightId = "damage_per_minute" | "kill_participation" | "cc_per_minute";

export const COMBAT_SCORE_PROFILE_LABELS: Record<CombatScoreProfile, string> = {
  melee_damage: "근접 공격형",
  melee_engage: "근접 진입형",
  ranged_sustained: "원거리 지속딜형",
  ranged_poke: "원거리 포킹형",
  utility_control: "유틸·제어형",
  hybrid_skirmisher: "하이브리드 교전형",
  unclassified: "역할 미분류"
};

export const COMBAT_METRIC_WEIGHTS: Record<CombatScoreProfile, Record<CombatMetricWeightId, number>> = {
  melee_damage: {
    damage_per_minute: 0.4,
    kill_participation: 0.35,
    cc_per_minute: 0.25
  },
  melee_engage: {
    damage_per_minute: 0.15,
    kill_participation: 0.3,
    cc_per_minute: 0.55
  },
  ranged_sustained: {
    damage_per_minute: 0.55,
    kill_participation: 0.3,
    cc_per_minute: 0.15
  },
  ranged_poke: {
    damage_per_minute: 0.5,
    kill_participation: 0.3,
    cc_per_minute: 0.2
  },
  utility_control: {
    damage_per_minute: 0.15,
    kill_participation: 0.4,
    cc_per_minute: 0.45
  },
  hybrid_skirmisher: {
    damage_per_minute: 0.55,
    kill_participation: 0.3,
    cc_per_minute: 0.15
  },
  unclassified: {
    damage_per_minute: 0.45,
    kill_participation: 0.35,
    cc_per_minute: 0.2
  }
};

export type CombatArchetypeClassification = {
  rangeProfile: CombatRangeProfile;
  primaryFunction: CombatFunction;
  secondaryFunction: CombatFunction | null;
  scoreProfile: CombatScoreProfile;
  reviewStatus: CombatArchetypeReviewStatus;
  confidence: "high" | "medium" | "low";
  reviewReason: string | null;
  classificationVersion: number;
};

type ClassificationInput = {
  characterCode: number;
  weaponCode: number;
  weaponType?: string | null;
  officialPrimary?: string | null;
  officialSecondary?: string | null;
  officialRangeType?: string | null;
};

const OFFICIAL_FUNCTIONS: Record<string, CombatFunction> = {
  Warrior: "sustained_damage",
  Tanker: "engage",
  Mage: "burst_damage",
  Marksman: "sustained_damage",
  Assasin: "burst_damage",
  Supporter: "support"
};

const MELEE_WEAPONS = new Set([
  "Glove",
  "Tonfa",
  "Bat",
  "Whip",
  "Hammer",
  "Axe",
  "OneHandSword",
  "TwoHandSword",
  "Polearm",
  "DualSword",
  "Spear",
  "Nunchaku",
  "Rapier",
  "VFArm"
]);

const RANGED_WEAPONS = new Set([
  "HighAngleFire",
  "DirectFire",
  "Bow",
  "CrossBow",
  "Pistol",
  "AssaultRifle",
  "SniperRifle",
  "Guitar",
  "Camera",
  "Arcana"
]);

const DEFINITIVE_MARKSMAN_WEAPONS = new Set(["AssaultRifle", "Bow", "CrossBow"]);
const DEFINITIVE_POKE_WEAPONS = new Set(["SniperRifle", "HighAngleFire", "Arcana"]);

const MANUAL_CLASSIFICATION_OVERRIDES: Record<string, Omit<CombatArchetypeClassification, "classificationVersion">> = {
  "2:9": {
    rangeProfile: "ranged",
    primaryFunction: "burst_damage",
    secondaryFunction: "sustained_damage",
    scoreProfile: "ranged_poke",
    reviewStatus: "reviewed",
    confidence: "medium",
    reviewReason: "공식 Mage·Marksman 복합 역할과 현재 패치 권총 표본을 검토해 포킹형으로 확정했습니다."
  },
  "9:9": {
    rangeProfile: "ranged",
    primaryFunction: "sustained_damage",
    secondaryFunction: "burst_damage",
    scoreProfile: "ranged_sustained",
    reviewStatus: "reviewed",
    confidence: "medium",
    reviewReason: "공식 Marksman·Mage 복합 역할과 현재 패치 권총 표본을 검토해 지속딜형으로 확정했습니다."
  },
  "64:24": {
    rangeProfile: "hybrid",
    primaryFunction: "sustained_damage",
    secondaryFunction: null,
    scoreProfile: "hybrid_skirmisher",
    reviewStatus: "reviewed",
    confidence: "medium",
    reviewReason: "공식 원거리 Warrior 분류와 보호막·지속 교전 특성을 검토해 하이브리드형으로 확정했습니다."
  },
  "89:9": {
    rangeProfile: "ranged",
    primaryFunction: "burst_damage",
    secondaryFunction: "sustained_damage",
    scoreProfile: "ranged_poke",
    reviewStatus: "reviewed",
    confidence: "medium",
    reviewReason: "공식 Mage·Marksman 복합 역할과 기본 공격·스킬 혼합 구조를 검토해 포킹형으로 확정했습니다."
  }
};

export function classifyCharacterWeapon(input: ClassificationInput): CombatArchetypeClassification {
  const manualOverride = MANUAL_CLASSIFICATION_OVERRIDES[`${input.characterCode}:${input.weaponCode}`];
  if (manualOverride) {
    return {
      ...manualOverride,
      classificationVersion: COMBAT_ARCHETYPE_VERSION
    };
  }
  const officialPrimary = normalizeOfficialArchetype(input.officialPrimary);
  const officialSecondary = normalizeOfficialArchetype(input.officialSecondary);
  const rangeProfile = resolveRangeProfile(input.officialRangeType, input.weaponType);
  let primaryFunction = officialFunction(officialPrimary);
  let secondaryFunction = officialFunction(officialSecondary);
  let reviewReason: string | null = null;

  if (primaryFunction === "unknown") {
    reviewReason = "공식 주 역할 정보가 없거나 지원하지 않는 값입니다.";
  } else if (rangeProfile === "unknown") {
    reviewReason = "공식 교전 거리와 무기 거리 정보를 확인할 수 없습니다.";
  } else if (!input.weaponCode || !input.weaponType) {
    reviewReason = "공식 무기 정보가 없어 실험체·무기 조합 역할을 확정할 수 없습니다.";
  }

  // Mage + Marksman처럼 무기에 따라 딜 패턴이 명확히 달라지는 조합만
  // 공식 무기군을 사용해 결정한다. 권총처럼 양쪽이 모두 가능한 무기는 검토 대상으로 남긴다.
  if (hasMageMarksmanPair(officialPrimary, officialSecondary)) {
    if (DEFINITIVE_MARKSMAN_WEAPONS.has(input.weaponType ?? "")) {
      primaryFunction = "sustained_damage";
      secondaryFunction = "burst_damage";
    } else if (DEFINITIVE_POKE_WEAPONS.has(input.weaponType ?? "")) {
      primaryFunction = "burst_damage";
      secondaryFunction = "sustained_damage";
    } else if (input.weaponType === "Pistol" || input.weaponType === "DirectFire") {
      reviewReason = "마법사·원거리 딜러 복합 역할이며 이 무기군만으로 딜 패턴을 확정할 수 없습니다.";
    }
  }

  // 공식 사거리가 Range인 Warrior는 일반 원거리 딜러와 플레이 기대치가 다를 수 있다.
  if (officialPrimary === "Warrior" && rangeProfile === "ranged") {
    reviewReason = "원거리 전사형 실험체로 일반 지속딜 역할군과의 수동 검토가 필요합니다.";
  }

  const scoreProfile = resolveScoreProfile(rangeProfile, primaryFunction);
  const reviewStatus = reviewReason ? "review_required" : "auto";
  const hasSecondaryFunction = secondaryFunction !== "unknown";
  const confidence = scoreProfile === "unclassified"
    ? "low"
    : reviewStatus === "review_required" || hasSecondaryFunction
      ? "medium"
      : "high";

  return {
    rangeProfile,
    primaryFunction,
    secondaryFunction: hasSecondaryFunction ? secondaryFunction : null,
    scoreProfile,
    reviewStatus,
    confidence,
    reviewReason,
    classificationVersion: COMBAT_ARCHETYPE_VERSION
  };
}

export function isRoleBenchmarkEligible(classification: CombatArchetypeClassification) {
  return classification.reviewStatus !== "review_required" &&
    classification.scoreProfile !== "unclassified" &&
    classification.confidence !== "low";
}

export function combatScoreProfileLabel(profile: CombatScoreProfile) {
  return COMBAT_SCORE_PROFILE_LABELS[profile];
}

export function combatMetricWeights(profile: CombatScoreProfile | null | undefined) {
  return COMBAT_METRIC_WEIGHTS[profile ?? "unclassified"];
}

function normalizeOfficialArchetype(value: string | null | undefined) {
  if (!value || value === "None") return null;
  return value;
}

function officialFunction(archetype: string | null): CombatFunction {
  return archetype ? OFFICIAL_FUNCTIONS[archetype] ?? "unknown" : "unknown";
}

function resolveRangeProfile(
  officialRangeType: string | null | undefined,
  weaponType: string | null | undefined
): CombatRangeProfile {
  if (officialRangeType === "Melee") return "melee";
  if (officialRangeType === "Range") return "ranged";
  if (officialRangeType === "Both") return "hybrid";
  if (weaponType && MELEE_WEAPONS.has(weaponType)) return "melee";
  if (weaponType && RANGED_WEAPONS.has(weaponType)) return "ranged";
  return "unknown";
}

function resolveScoreProfile(
  rangeProfile: CombatRangeProfile,
  primaryFunction: CombatFunction
): CombatScoreProfile {
  if (rangeProfile === "unknown" || primaryFunction === "unknown") return "unclassified";
  if (rangeProfile === "hybrid") return "hybrid_skirmisher";
  if (primaryFunction === "support" || primaryFunction === "control") return "utility_control";
  if (primaryFunction === "engage") return "melee_engage";
  if (rangeProfile === "ranged") {
    return primaryFunction === "sustained_damage" ? "ranged_sustained" : "ranged_poke";
  }
  return "melee_damage";
}

function hasMageMarksmanPair(primary: string | null, secondary: string | null) {
  const roles = new Set([primary, secondary]);
  return roles.has("Mage") && roles.has("Marksman");
}
